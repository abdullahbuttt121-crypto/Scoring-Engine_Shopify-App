<?php

namespace App\Services;

use App\Models\Products\Product;
use App\Models\Products\ProductScore;
use App\Models\Products\ProductScoreLog;
use App\Models\ScoringRule;
use App\Support\ScoringConfig;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * ProductScoringService
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SERVICE DOES (plain English)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Receives a Product model.
 * 2. Loads all active scoring rules that apply to that shop.
 * 3. Checks each rule against the product's data (price, inventory, status, etc.)
 * 4. Deducts the rule's points from the 100-point health score when its full condition tree matches.
 * 5. Builds a list of human-readable reasons ("Low inventory: 8 units").
 * 6. Determines the health level (low / medium / high / excellent).
 * 7. Saves/updates the product_scores row for this product.
 * 8. Appends a new row to product_score_logs (audit trail).
 * 9. Caches the score back onto the products table (denormalized).
 * 10. Returns the full result array.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCORE LEVELS
 * ─────────────────────────────────────────────────────────────────────────────
 *   0  – 30  → low       (red; highest attention priority)
 *   31 – 60  → medium    (yellow)
 *   61 – 89  → high      (brown)
 *   90+      → excellent (green)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPPORTED OPERATORS
 * ─────────────────────────────────────────────────────────────────────────────
 *   equals          → product value exactly matches the rule's condition_value
 *   not_equals      → product value does NOT match the rule's condition_value
 *   less_than       → product value is numerically less than condition_value
 *   greater_than    → product value is numerically greater than condition_value
 *   older_than_days → product was last updated more than N days ago
 *   empty           → product field is null, empty string, or zero
 *   not_empty       → product field has a non-empty value
 *   contains        → product field contains the condition_value as a substring
 */
class ProductScoringService
{
    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Score a single product and persist the results.
     *
     * @param  Product  $product  The product to score
     * @param  string  $trigger  What caused this scoring run
     *                           Use ProductScoreLog::TRIGGER_* constants.
     *                           Default: 'manual'
     * @return array [
     *               'product_id'   => int,
     *               'score'        => int,
     *               'level'        => string,
     *               'reasons'      => array,
     *               'old_score'    => int|null,
     *               'score_changed'=> bool,
     *               ]
     */
    public function scoreProduct(Product $product, string $trigger = ProductScoreLog::TRIGGER_MANUAL): array
    {
        // Step 1 — Load rules for this shop (global rules + shop-specific overrides)
        // forShop() returns both rows where shop_id IS NULL (global defaults)
        // and rows where shop_id = $product->user_id (shop custom rules).
        $rules = ScoringRule::forShop($product->user_id)
            ->active()
            ->ordered()
            ->get();

        Log::info("[ProductScoring] Scoring product #{$product->id} '{$product->title}' with {$rules->count()} rules.");

        // Step 2 — Run all rules and build the score breakdown
        $calculation = $this->calculateScore($product, $rules);
        $newScore = $calculation['score'];
        $level = $this->getScoreLevel($newScore);
        $reasons = $calculation['reasons'];

        // Step 3 — Read the old score (for the change log and the "changed" flag)
        $existingScore = ProductScore::where('product_id', $product->id)
            ->where('shop_id', $product->user_id)
            ->first();

        $oldScore = $existingScore ? $existingScore->score : null;

        // Step 4 — Save/update the product_scores row (one row per product)
        $productScore = ProductScore::updateOrCreate(
            // MATCH: find the existing row for this shop + product
            [
                'shop_id' => $product->user_id,
                'product_id' => $product->id,
            ],
            // SET / UPDATE
            [
                'score' => $newScore,
                'score_level' => $level,
                'reason_summary' => $reasons,      // cast to JSON automatically
                'calculated_at' => now(),
            ]
        );

        // Step 5 — Update the denormalized cache on the products row itself
        // This allows the dashboard to sort/filter by score without joining product_scores.
        $product->update([
            'score' => $newScore,
            'score_breakdown' => $reasons,    // cast to JSON automatically
        ]);

        // Step 6 — Append a log entry (always insert, never update)
        // We log even if the score didn't change so the audit trail is complete.
        ProductScoreLog::create([
            'shop_id' => $product->user_id,
            'product_id' => $product->id,
            'old_score' => $oldScore,
            'new_score' => $newScore,
            'reasons' => $reasons,           // cast to JSON automatically
            'calculated_by' => $trigger,
        ]);

        $scoreChanged = $oldScore !== $newScore;

        Log::info("[ProductScoring] Done. Score: {$newScore} ({$level}). Changed: ".($scoreChanged ? 'yes' : 'no'));

        return [
            'product_id' => $product->id,
            'score' => $newScore,
            'level' => $level,
            'reasons' => $reasons,
            'old_score' => $oldScore,
            'score_changed' => $scoreChanged,
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE — CORE ENGINE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Loop through all active rules and accumulate points.
     *
     * HOW IT WORKS:
     * ─────────────
     * For each rule:
     *   1. Look up the product field that this rule_type applies to
     *      (e.g. rule_type = 'price' → read $product->price).
     *   2. Check if the product value satisfies the rule's condition.
     *   3. If yes → add the rule's points to the running total.
     *   4. Build a readable reason string and add it to the reasons list.
     *
     * @param  \Illuminate\Support\Collection  $rules
     * @return array ['score' => int, 'reasons' => array]
     */
    private function calculateScore(Product $product, $rules): array
    {
        $totalScore = ScoringConfig::baseScore();
        $reasons = [];

        foreach ($rules as $rule) {
            // Get the product's actual value for this rule type
            // e.g. for rule_type = 'inventory' → returns $product->inventory_quantity (e.g. 8)
            $evaluation = $this->evaluateConditionNode($product, $rule->effectiveConditionTree(), $rule->rule_key);

            // Check if the product value satisfies this rule's condition
            if ($evaluation['matched']) {
                // Rule matched → add points and record the reason
                $totalScore -= $rule->points;
                $reasons[] = $this->buildRuleReason($rule, $evaluation['conditions']);

                Log::debug("[ProductScoring] Rule '{$rule->rule_key}' matched. Health impact: -{$rule->points}. Total: {$totalScore}");
            }
        }

        return [
            'score' => max(0, min(65535, $totalScore)),
            'reasons' => $reasons,
        ];
    }

    private function evaluateConditionNode(Product $product, array $node, string $ruleKey): array
    {
        if (($node['node_type'] ?? 'condition') === 'group') {
            $results = array_map(
                fn (array $child) => $this->evaluateConditionNode($product, $child, $ruleKey),
                $node['children'] ?? []
            );
            $matches = array_column($results, 'matched');
            $matched = ($node['combinator'] ?? 'all') === 'any'
                ? in_array(true, $matches, true)
                : ! in_array(false, $matches, true);

            return [
                'matched' => $matched,
                'conditions' => array_merge(...array_map(fn ($result) => $result['conditions'], $results)),
            ];
        }

        $type = (string) ($node['rule_type'] ?? '');
        $operator = (string) ($node['operator'] ?? '');
        $expected = $node['value'] ?? null;
        $actual = $this->getProductValueByRuleType($product, $type);

        return [
            'matched' => $this->conditionMatches($operator, $expected, $actual, $ruleKey),
            'conditions' => [[
                'rule_type' => $type,
                'operator' => $operator,
                'expected' => $expected,
                'actual' => $actual,
            ]],
        ];
    }

    private function buildRuleReason(ScoringRule $rule, array $conditions): array
    {
        $conditionText = collect($conditions)->map(function (array $condition) {
            $value = in_array($condition['operator'], [ScoringRule::OP_EMPTY, ScoringRule::OP_NOT_EMPTY], true)
                ? '' : ' '.(string) $condition['expected'];

            return "{$condition['rule_type']} {$condition['operator']}{$value}";
        })->implode('; ');

        return [
            'rule_key' => $rule->rule_key,
            'label' => $rule->rule_name,
            'health_impact' => -$rule->points,
            'reason' => "{$rule->rule_name}: {$conditionText}",
            'conditions' => $conditions,
            'action_type' => $rule->action_type,
            'recommendation' => $rule->recommendation,
        ];
    }

    /**
     * Determine the score level label from a numeric score.
     *
     * Thresholds:
     *   0  – 30  → low
     *   31 – 60  → medium
     *   61 – 89  → high
     *   90+      → excellent
     */
    private function getScoreLevel(int $score): string
    {
        return ProductScore::levelFromScore($score);
    }

    /**
     * Check whether a single rule's condition is satisfied by the product value.
     *
     * WHY EACH OPERATOR EXISTS:
     * ─────────────────────────
     *   equals         → checks exact text match (e.g. status = "draft")
     *   less_than      → checks if value is below a threshold (e.g. inventory < 10)
     *   greater_than   → checks if value is above a threshold (e.g. price > 100)
     *   older_than_days→ same as greater_than but semantically: "product not updated for N days"
     *   empty          → catches missing data (no image, no description, no tags)
     *
     * @param  ScoringRule  $rule
     * @param  mixed  $productValue  The extracted product field value
     */
    private function conditionMatches(string $operator, mixed $conditionValue, mixed $productValue, string $ruleKey): bool
    {
        switch ($operator) {

            case ScoringRule::OP_EQUALS:
                // Case-insensitive string comparison
                // e.g. rule: status equals "draft"  →  product->status = "draft" ✓
                return strtolower((string) $productValue) === strtolower((string) $conditionValue);

            case ScoringRule::OP_NOT_EQUALS:
                // Opposite of equals — matches when the value is anything EXCEPT the condition
                // e.g. rule: status not_equals "active"  →  product->status = "draft" ✓
                return strtolower((string) $productValue) !== strtolower((string) $conditionValue);

            case ScoringRule::OP_LESS_THAN:
                // Numeric comparison — product value must be below the threshold
                // e.g. rule: inventory less_than 10  →  product->inventory_quantity = 8 ✓
                return is_numeric($productValue) && (float) $productValue < (float) $conditionValue;

            case ScoringRule::OP_GREATER_THAN:
                // Numeric comparison — product value must be above the threshold
                // e.g. rule: price greater_than 100  →  product->price = 250 ✓
                return is_numeric($productValue) && (float) $productValue > (float) $conditionValue;

            case ScoringRule::OP_OLDER_THAN_DAYS:
            case 'older_than_days':
                // Same numeric check but named semantically for recency rules.
                // productValue = days since last update (integer)
                // e.g. rule: recency older_than_days 60  →  product last updated 75 days ago ✓
                return is_numeric($productValue) && (float) $productValue > (float) $conditionValue;

            case ScoringRule::OP_EMPTY:
                // Product field is missing or blank
                // e.g. rule: image empty  →  product->image_url = null ✓
                // Note: inventory = 0 is treated as "empty" intentionally (out of stock)
                return empty($productValue) || (is_string($productValue) && trim($productValue) === '');

            case ScoringRule::OP_NOT_EMPTY:
                // Opposite of empty — product field has a real value
                // e.g. rule: vendor not_empty  →  product->vendor = "Nike" ✓
                return ! empty($productValue) && ! (is_string($productValue) && trim($productValue) === '');

            case ScoringRule::OP_CONTAINS:
                // Check if the product field contains the condition value as a substring
                // e.g. rule: tags contains "sale"  →  product->tags = "summer, sale, featured" ✓
                if (empty($conditionValue)) {
                    return false;
                }

                return str_contains(
                    strtolower((string) $productValue),
                    strtolower((string) $conditionValue)
                );

            default:
                // Unknown operator — skip this rule rather than crashing
                Log::warning("[ProductScoring] Unknown operator '{$operator}' in rule '{$ruleKey}'. Skipping.");

                return false;
        }
    }

    /**
     * Extract the relevant product field value for a given rule type.
     *
     * This is the "translation layer" between rules and product data.
     * Each rule_type maps to one product field (or a calculated value).
     *
     * RULE TYPE → PRODUCT FIELD MAP:
     * ────────────────────────────────────────────────────────────────
     *   status      → $product->status              (string: "active"/"draft"/"archived")
     *   price       → $product->price               (float: minimum variant price)
     *   inventory   → $product->inventory_quantity  (int: total across all variants)
     *   recency     → days since $product->shopify_updated_at  (int)
     *   tags        → $product->tags                (string: comma-separated or empty)
     *   image       → $product->image_url           (string URL or null)
     *   description → $product->body_html           (string HTML or null/empty)
     *   vendor      → $product->vendor              (string or null)
     *
     * @param  string  $ruleType  One of the ScoringRule::TYPE_* constants
     */
    private function getProductValueByRuleType(Product $product, string $ruleType): mixed
    {
        switch ($ruleType) {

            case ScoringRule::TYPE_STATUS:
                return $product->status;

            case ScoringRule::TYPE_PRICE:
                return $product->price;

            case ScoringRule::TYPE_INVENTORY:
                return $product->inventory_quantity;

            case ScoringRule::TYPE_RECENCY:
                // Calculate how many days ago the product was last updated in Shopify.
                // If shopify_updated_at is missing, return 0 (not stale — don't penalise).
                if (empty($product->shopify_updated_at)) {
                    return 0;
                }

                // Carbon::parse handles both datetime strings and existing Carbon instances.
                // diffInDays() returns a positive integer.
                return (int) Carbon::parse($product->shopify_updated_at)->diffInDays(now());

            case ScoringRule::TYPE_TAGS:
                return $product->tags;

            case ScoringRule::TYPE_IMAGE:
                return $product->image_url;

            case ScoringRule::TYPE_DESCRIPTION:
                return $product->body_html;

            case ScoringRule::TYPE_VENDOR:
                return $product->vendor;

            default:
                Log::warning("[ProductScoring] Unknown rule_type '{$ruleType}'. Returning null.");

                return null;
        }
    }

    /**
     * Build a human-readable reason string for a matched rule.
     *
     * These strings appear in the merchant dashboard to explain WHY a
     * product received points.
     *
     * Example outputs:
     *   "Out of stock (0 units) [+40 pts]"
     *   "Low inventory (8 units) [+25 pts]"
     *   "High value product ($250) [+20 pts]"
     *   "Product not updated in 90 days [+20 pts]"
     *   "Status is draft [+15 pts]"
     *   "Missing featured image [+15 pts]"
     *
     * @param  mixed  $productValue  The actual value from the product
     */
    private function buildReason(ScoringRule $rule, mixed $productValue): string
    {
        $pts = "+{$rule->points} pts";

        switch ($rule->rule_type) {

            case ScoringRule::TYPE_INVENTORY:
                return "Low/zero inventory ({$productValue} units) [{$pts}]";

            case ScoringRule::TYPE_PRICE:
                $formatted = is_numeric($productValue) ? '$'.number_format((float) $productValue, 2) : $productValue;

                return "Price {$rule->condition_operator} \${$rule->condition_value} (actual: {$formatted}) [{$pts}]";

            case ScoringRule::TYPE_RECENCY:
                return "Product not updated in {$productValue} days [{$pts}]";

            case ScoringRule::TYPE_STATUS:
                return "Status is {$productValue} [{$pts}]";

            case ScoringRule::TYPE_IMAGE:
                return "Missing featured image [{$pts}]";

            case ScoringRule::TYPE_DESCRIPTION:
                return "Missing product description [{$pts}]";

            case ScoringRule::TYPE_TAGS:
                return "Missing product tags [{$pts}]";

            case ScoringRule::TYPE_VENDOR:
                return "Missing vendor [{$pts}]";

            default:
                return "{$rule->rule_name} [{$pts}]";
        }
    }
}

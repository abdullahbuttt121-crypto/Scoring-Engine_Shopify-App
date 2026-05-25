<?php

namespace App\Http\Controllers;

use App\Http\Traits\ResponseTrait;
use App\Http\Requests\StoreScoringRuleRequest;
use App\Http\Requests\UpdateScoringRuleRequest;
use App\Http\Resources\ScoringRuleResource;
use App\Jobs\RecalculateAllProductScoresJob;
use App\Models\ScoringRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * ScoringRuleController
 *
 * Manages the scoring rules that the ProductScoringService uses to evaluate
 * every product. Each rule says "if field X satisfies condition Y, add Z points".
 *
 * ROUTE GROUP (all inside verify.embedded + verify.shopify middleware):
 * ─────────────────────────────────────────────────────────────────────
 *  GET    /scoring-rules             → index()   — list all rules for this shop
 *  POST   /scoring-rules             → store()   — create a new rule
 *  PUT    /scoring-rules/{id}        → update()  — edit an existing rule
 *  DELETE /scoring-rules/{id}        → destroy() — soft-disable or hard-delete
 *
 * GLOBAL vs SHOP RULES:
 * ──────────────────────
 * Rules with shop_id = NULL are the global seed rules that apply to every shop.
 * This controller lists them so merchants can SEE them, but always saves new/
 * edited rules with shop_id = $user->id (a shop-specific copy). That way:
 *  - Global defaults are never modified by a single merchant.
 *  - Each merchant can have their own rule set without affecting others.
 *
 * AFTER RULE CHANGES:
 * ────────────────────
 * When a rule is created, updated, or deleted, the merchant's product scores
 * are NOT automatically recalculated — that would be expensive for large
 * catalogs. Instead the UI shows a "Recalculate All Scores" button that
 * dispatches RecalculateAllProductScoresJob when clicked.
 */
class ScoringRuleController extends Controller
{
    use ResponseTrait;

    // ─────────────────────────────────────────────────────────────────────────
    // LIST
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /scoring-rules
     *
     * Returns all scoring rules visible to this shop:
     *   - Global default rules (shop_id = NULL)
     *   - Rules this shop created (shop_id = $user->id)
     *
     * Ordered by sort_order ASC then ID ASC for predictable display.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $rules = ScoringRule::forShop($user->id)
            ->ordered()
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => ScoringRuleResource::collection($rules),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /scoring-rules
     *
     * Creates a new shop-specific rule. All rules created here are scoped to
     * the authenticated shop (shop_id = $user->id), never to null.
     *
     * If sort_order is not provided, the rule is placed last (max + 1).
     */
    public function store(StoreScoringRuleRequest $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        // Auto-assign sort_order if not provided — place new rule at the end
        $sortOrder = $request->input('sort_order');
        if ($sortOrder === null) {
            $sortOrder = ScoringRule::forShop($user->id)->max('sort_order') + 10;
        }

        // Generate a rule_key from the rule_name (snake_case, URL-safe)
        // Example: "High Inventory Risk" → "high_inventory_risk"
        $ruleKey = str($request->input('rule_name'))
            ->lower()
            ->replace([' ', '-'], '_')
            ->replaceMatches('/[^a-z0-9_]/', '')
            ->toString();

        $rule = ScoringRule::create([
            'shop_id'            => $user->id,   // always scoped to this shop
            'rule_name'          => $request->input('rule_name'),
            'rule_key'           => $ruleKey,
            'rule_type'          => $request->input('rule_type'),
            'condition_operator' => $request->input('condition_operator'),
            'condition_value'    => $request->input('condition_value'),
            'points'             => (int) $request->input('points'),
            'is_active'          => (bool) $request->input('is_active', true),
            'sort_order'         => (int) $sortOrder,
        ]);

        Log::info("[ScoringRuleController] Rule created: '{$rule->rule_name}' for shop_id={$user->id}");

        return response()->json([
            'success' => true,
            'message' => 'Rule created. Recalculate all scores to apply it.',
            'data'    => new ScoringRuleResource($rule),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * PUT /scoring-rules/{id}
     *
     * Updates an existing rule. A merchant can only update rules that:
     *   a) Belong to their shop (shop_id = $user->id), OR
     *   b) Are global rules (shop_id = NULL) — in which case we CREATE a
     *      shop-specific COPY and update that instead of touching the global rule.
     *
     * WHY COPY GLOBAL RULES?
     * ────────────────────────
     * Global rules (shop_id = NULL) are shared defaults. Letting one merchant
     * edit them would affect all shops. So we clone the rule to their shop
     * and update the copy. The original global rule remains untouched.
     */
    public function update(UpdateScoringRuleRequest $request, int $id): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        // Find the rule — must be global or belong to this shop
        $rule = ScoringRule::where('id', $id)
            ->where(function ($q) use ($user) {
                $q->whereNull('shop_id')->orWhere('shop_id', $user->id);
            })
            ->firstOrFail();

        // If this is a global rule, clone it to shop scope instead of editing the original
        if ($rule->shop_id === null) {
            Log::info("[ScoringRuleController] Cloning global rule #{$id} to shop_id={$user->id}");

            $rule = ScoringRule::create([
                'shop_id'            => $user->id,
                'rule_name'          => $request->input('rule_name',          $rule->rule_name),
                'rule_key'           => $rule->rule_key,   // keep original key for engine compatibility
                'rule_type'          => $request->input('rule_type',          $rule->rule_type),
                'condition_operator' => $request->input('condition_operator', $rule->condition_operator),
                'condition_value'    => $request->input('condition_value',    $rule->condition_value),
                'points'             => (int) $request->input('points',       $rule->points),
                'is_active'          => (bool) $request->input('is_active',   $rule->is_active),
                'sort_order'         => (int) $request->input('sort_order',   $rule->sort_order),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Global rule copied to your shop and updated. Recalculate scores to apply.',
                'data'    => new ScoringRuleResource($rule),
            ]);
        }

        // Shop-owned rule — update in place
        $rule->update([
            'rule_name'          => $request->input('rule_name',          $rule->rule_name),
            'rule_type'          => $request->input('rule_type',          $rule->rule_type),
            'condition_operator' => $request->input('condition_operator', $rule->condition_operator),
            'condition_value'    => $request->input('condition_value',    $rule->condition_value),
            'points'             => (int) $request->input('points',       $rule->points),
            'is_active'          => (bool) $request->input('is_active',   $rule->is_active),
            'sort_order'         => (int) $request->input('sort_order',   $rule->sort_order),
        ]);

        Log::info("[ScoringRuleController] Rule #{$id} updated for shop_id={$user->id}");

        return response()->json([
            'success' => true,
            'message' => 'Rule updated. Recalculate scores to apply changes.',
            'data'    => new ScoringRuleResource($rule->fresh()),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE / DISABLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * DELETE /scoring-rules/{id}
     *
     * Behaviour depends on rule ownership:
     *  - Shop-owned rule → permanently deleted (hard delete).
     *  - Global rule     → a shop-specific DISABLED copy is created instead.
     *                       This lets the engine skip the global rule for this shop.
     *
     * WHY NOT SOFT-DELETE?
     * ─────────────────────
     * Soft-delete would require is_deleted columns everywhere and extra query
     * scopes. Instead: own rules are hard-deleted (they're merchant-created),
     * global rules are "overridden with is_active=false" (same clone mechanism
     * as update).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $rule = ScoringRule::where('id', $id)
            ->where(function ($q) use ($user) {
                $q->whereNull('shop_id')->orWhere('shop_id', $user->id);
            })
            ->firstOrFail();

        if ($rule->shop_id === null) {
            // Global rule — create a disabled shop copy so the engine skips it
            ScoringRule::create([
                'shop_id'            => $user->id,
                'rule_name'          => $rule->rule_name,
                'rule_key'           => $rule->rule_key,
                'rule_type'          => $rule->rule_type,
                'condition_operator' => $rule->condition_operator,
                'condition_value'    => $rule->condition_value,
                'points'             => $rule->points,
                'is_active'          => false,   // disabled = effectively deleted for this shop
                'sort_order'         => $rule->sort_order,
            ]);

            Log::info("[ScoringRuleController] Global rule #{$id} disabled for shop_id={$user->id} via shop copy.");

            return response()->json([
                'success' => true,
                'message' => 'Global rule disabled for your shop. Recalculate scores to apply.',
            ]);
        }

        // Shop-owned rule → hard delete
        $rule->delete();
        Log::info("[ScoringRuleController] Shop rule #{$id} deleted for shop_id={$user->id}");

        return response()->json([
            'success' => true,
            'message' => 'Rule deleted. Recalculate scores to apply.',
        ]);
    }
}

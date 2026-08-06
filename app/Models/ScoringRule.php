<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * ScoringRule model
 *
 * One row = one scoring rule.
 * shop_id = null  → global default rule for all shops
 * shop_id = X     → custom rule overriding the default for shop X
 *
 * rule_type options (use these constants in your code):
 *   STATUS | PRICE | INVENTORY | RECENCY | TAGS | VENDOR | IMAGE | DESCRIPTION
 *
 * condition_operator options:
 *   equals | not_equals | greater_than | less_than | not_empty | empty | contains
 */
class ScoringRule extends Model
{
    public const EFFECT_ADD = 'add';

    public const EFFECT_SUBTRACT = 'subtract';

    // Rule type constants — use these instead of raw strings to avoid typos
    const TYPE_STATUS = 'status';

    const TYPE_PRICE = 'price';

    const TYPE_INVENTORY = 'inventory';

    const TYPE_RECENCY = 'recency';

    const TYPE_TAGS = 'tags';

    const TYPE_VENDOR = 'vendor';

    const TYPE_IMAGE = 'image';

    const TYPE_DESCRIPTION = 'description';

    // Condition operator constants
    const OP_EQUALS = 'equals';

    const OP_NOT_EQUALS = 'not_equals';

    const OP_GREATER_THAN = 'greater_than';

    const OP_LESS_THAN = 'less_than';

    const OP_NOT_EMPTY = 'not_empty';

    const OP_EMPTY = 'empty';

    const OP_CONTAINS = 'contains';

    const OP_OLDER_THAN_DAYS = 'older_than_days'; // days since last Shopify update

    public static function validTypes(): array
    {
        return [self::TYPE_STATUS, self::TYPE_PRICE, self::TYPE_INVENTORY, self::TYPE_RECENCY,
            self::TYPE_TAGS, self::TYPE_VENDOR, self::TYPE_IMAGE, self::TYPE_DESCRIPTION];
    }

    public static function validOperators(): array
    {
        return [self::OP_EQUALS, self::OP_NOT_EQUALS, self::OP_GREATER_THAN, self::OP_LESS_THAN,
            self::OP_EMPTY, self::OP_NOT_EMPTY, self::OP_CONTAINS, self::OP_OLDER_THAN_DAYS];
    }

    protected $fillable = [
        'shop_id',
        'rule_name',
        'rule_key',
        'rule_type',
        'condition_operator',
        'condition_value',
        'condition_tree',
        'points',
        'score_effect',
        'action_type',
        'recommendation',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'points' => 'integer',
        'sort_order' => 'integer',
        'condition_tree' => 'array',
    ];

    public function effectiveConditionTree(): array
    {
        return $this->condition_tree ?: [
            'node_type' => 'condition',
            'rule_type' => $this->rule_type,
            'operator' => $this->condition_operator,
            'value' => $this->condition_value,
        ];
    }

    public function effectiveScoreEffect(): string
    {
        // Negative values were the legacy way to express a bonus.
        if ($this->points < 0) {
            return self::EFFECT_ADD;
        }

        return in_array($this->score_effect, [self::EFFECT_ADD, self::EFFECT_SUBTRACT], true)
            ? $this->score_effect
            : self::EFFECT_SUBTRACT;
    }

    public function pointMagnitude(): int
    {
        return abs((int) $this->points);
    }

    public static function firstCondition(?array $tree): ?array
    {
        if (! $tree) {
            return null;
        }
        if (($tree['node_type'] ?? null) === 'condition') {
            return $tree;
        }
        foreach (($tree['children'] ?? []) as $child) {
            $condition = self::firstCondition($child);
            if ($condition) {
                return $condition;
            }
        }

        return null;
    }

    // ── Relationships ────────────────────────────────────────────────────────

    /**
     * The shop this rule belongs to (null = global rule).
     * Usage: $rule->shop  → User model (the shop)
     */
    public function shop()
    {
        return $this->belongsTo(User::class, 'shop_id');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    /**
     * Get only active rules.
     * Usage: ScoringRule::active()->get()
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Get rules for a specific shop PLUS global rules (shop_id = null).
     *
     * IMPORTANT — OVERRIDE SHADOWING:
     * ────────────────────────────────
     * When a merchant edits a global rule, the controller creates a shop-specific
     * COPY with the same rule_key (e.g. 'inventory_low'). Without this extra
     * logic, forShop() would return BOTH the global rule AND the shop copy,
     * causing the scoring engine to double-count points for the same condition.
     *
     * Fix: exclude any global rule whose rule_key already has a shop-specific
     * override for this shop. The shop's version "shadows" the global one.
     *
     * Usage: ScoringRule::forShop($userId)->active()->ordered()->get()
     */
    public function scopeForShop($query, $shopId)
    {
        // Find every rule_key this shop has already overridden with a custom row.
        // e.g. merchant edited "inventory_low" → shop has its own 'inventory_low' row.
        $overriddenKeys = static::where('shop_id', $shopId)
            ->pluck('rule_key')
            ->toArray();

        return $query->where(function ($q) use ($overriddenKeys) {
            // Global rules — but only those NOT overridden by a shop-specific copy.
            // This prevents double-counting when a merchant edits a global rule.
            $q->whereNull('shop_id')
                ->whereNotIn('rule_key', $overriddenKeys);
        })->orWhere('shop_id', $shopId);
    }

    /**
     * Order by sort_order ascending (for consistent rule evaluation).
     */
    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order');
    }
}

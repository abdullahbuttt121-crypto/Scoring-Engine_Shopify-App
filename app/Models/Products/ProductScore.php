<?php

namespace App\Models\Products;

use App\Models\User;
use App\Support\ScoringConfig;
use Illuminate\Database\Eloquent\Model;

/**
 * ProductScore model
 *
 * One row per product — stores the CURRENT score.
 * This is the source of truth for scores.
 *
 * The `products.score` column is a DENORMALIZED CACHE of this table.
 * Both are kept in sync by ProductScoringService.
 *
 * score_level values (plain strings — no enum):
 *   high   → score >= 70
 *   medium → score >= 40
 *   low    → score < 40
 */
class ProductScore extends Model
{
    // Score level constants — use these in code, not raw strings
    const LEVEL_EXCELLENT = 'excellent'; // 90+

    const LEVEL_HIGH = 'high';     // 61–89

    const LEVEL_MEDIUM = 'medium';   // 31–60

    const LEVEL_LOW = 'low';      // 0–30

    protected $fillable = [
        'shop_id',
        'product_id',
        'score',
        'score_level',
        'reason_summary',
        'calculated_at',
    ];

    protected $casts = [
        'score' => 'integer',
        'reason_summary' => 'array',    // JSON → PHP array automatically
        'calculated_at' => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    /**
     * The shop that owns this score.
     * Usage: $productScore->shop  → User model
     */
    public function shop()
    {
        return $this->belongsTo(User::class, 'shop_id');
    }

    /**
     * The product this score belongs to.
     * Usage: $productScore->product  → Product model
     */
    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    /**
     * Filter by score level.
     * Usage: ProductScore::ofLevel('low')->get()
     */
    public function scopeOfLevel($query, string $level)
    {
        return $query->where('score_level', $level);
    }

    /**
     * Order by score descending (highest first = ranked list).
     * Usage: ProductScore::forShop($id)->ranked()->get()
     */
    public function scopeRanked($query)
    {
        return $query->orderByDesc('score');
    }

    /**
     * Filter to a specific shop.
     */
    public function scopeForShop($query, $shopId)
    {
        return $query->where('shop_id', $shopId);
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    /**
     * Derive the score level string from an integer score.
     * Used by ProductScoringService before saving.
     */
    public static function levelFromScore(int $score): string
    {
        return ScoringConfig::levelFromScore($score);
    }
}

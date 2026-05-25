<?php

namespace App\Models\Products;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * ProductScoreLog model
 *
 * Append-only audit trail — every time a product's score changes,
 * we INSERT a new row here. We never UPDATE or DELETE rows.
 *
 * This lets the merchant see: "my product went from 30 → 72 after I added images".
 *
 * calculated_by values (plain strings — no enum):
 *   sync        → triggered by a manual sync from the dashboard
 *   webhook     → triggered by a Shopify webhook (product updated)
 *   manual      → merchant clicked "Rescore this product"
 *   rescore_all → merchant clicked "Rescore all products"
 */
class ProductScoreLog extends Model
{
    // Trigger source constants — use these instead of raw strings
    const TRIGGER_SYNC        = 'sync';
    const TRIGGER_WEBHOOK     = 'webhook';
    const TRIGGER_MANUAL      = 'manual';
    const TRIGGER_RESCORE_ALL = 'rescore_all';

    protected $fillable = [
        'shop_id',
        'product_id',
        'old_score',
        'new_score',
        'reasons',
        'calculated_by',
    ];

    protected $casts = [
        'old_score' => 'integer',
        'new_score' => 'integer',
        'reasons'   => 'array',     // JSON → PHP array automatically
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    /**
     * The shop this log entry belongs to.
     */
    public function shop()
    {
        return $this->belongsTo(User::class, 'shop_id');
    }

    /**
     * The product this log entry is about.
     */
    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    /**
     * Get logs for a specific shop.
     */
    public function scopeForShop($query, $shopId)
    {
        return $query->where('shop_id', $shopId);
    }

    /**
     * Get logs for a specific product.
     */
    public function scopeForProduct($query, $productId)
    {
        return $query->where('product_id', $productId);
    }

    /**
     * Only return logs where the score actually changed.
     * (Prevents noise from rescores that produced the same score.)
     */
    public function scopeChanged($query)
    {
        return $query->whereColumn('old_score', '!=', 'new_score')
                     ->orWhereNull('old_score');
    }
}

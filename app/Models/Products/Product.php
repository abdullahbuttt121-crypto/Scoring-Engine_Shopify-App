<?php

namespace App\Models\Products;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Products\ProductScore;
use App\Models\Products\ProductScoreLog;

class Product extends Model
{
    use SoftDeletes;

    public $fillable = [
        'user_id',
        'shopify_product_id',
        'title',
        'handle',
        'body_html',
        'tags',
        'vendor',
        'product_type',
        'status',
        // Scoring base columns (migration 2026_05_13_000001)
        'score',
        'score_breakdown',
        'shopify_updated_at',
        // Denormalized scoring fields (migration 2026_05_13_000002)
        'price',
        'inventory_quantity',
        'image_url',
        'shopify_created_at',
        'synced_at',
    ];

    protected $casts = [
        'score_breakdown'    => 'array',   // JSON → PHP array automatically
        'shopify_updated_at' => 'datetime',
        'shopify_created_at' => 'datetime',
        'synced_at'          => 'datetime',
        'score'              => 'integer',
        'price'              => 'decimal:2',
        'inventory_quantity' => 'integer',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    /** The shop (user) that owns this product */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Product variants (price, inventory, SKU live here) */
    public function productVarients()
    {
        return $this->hasMany(ProductVarient::class);
    }

    /** Product images */
    public function productMedias()
    {
        return $this->hasMany(ProductMedia::class);
    }

    /**
     * The current score record for this product.
     * Use: $product->productScore->score_level
     */
    public function productScore()
    {
        return $this->hasOne(ProductScore::class, 'product_id');
    }

    /**
     * Full score change history for this product.
     * Use: $product->scoreHistory()->latest()->get()
     */
    public function scoreHistory()
    {
        return $this->hasMany(ProductScoreLog::class, 'product_id');
    }
}

<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/**
 * Chunk 2 — Add denormalized scoring fields to the existing products table.
 *
 * WHY DENORMALIZED?
 * ─────────────────
 * Price lives in `product_varients` and images live in `product_media`.
 * Joining those tables every time we need to SORT or FILTER products by score
 * is expensive once a shop has thousands of products.
 *
 * Instead we store a single representative value directly on the product row:
 *   price             → the highest variant price (what the merchant sees as the headline price)
 *   inventory_quantity → total units across all variants
 *   image_url          → URL of the first/primary product image
 *
 * These columns are refreshed every time a product is synced or a webhook fires.
 * The scoring engine reads them directly from `products` without any joins.
 *
 * OTHER COLUMNS:
 *   shopify_created_at → Shopify's own createdAt; used by the scoring "recency" dimension
 *   synced_at          → when WE last pulled this product from Shopify
 *   deleted_at         → enables Laravel SoftDeletes (products deleted on Shopify are
 *                        soft-deleted here so score history is preserved)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Denormalized price (highest variant price)
            $table->decimal('price', 10, 2)->nullable()->after('shopify_updated_at');

            // Denormalized inventory (sum of all variant inventory_quantity)
            $table->unsignedInteger('inventory_quantity')->default(0)->after('price');

            // Denormalized primary image URL
            $table->string('image_url')->nullable()->after('inventory_quantity');

            // When Shopify says the product was first created
            $table->timestamp('shopify_created_at')->nullable()->after('image_url');

            // When we last pulled this product from Shopify (our sync clock)
            $table->timestamp('synced_at')->nullable()->after('shopify_created_at');

            // SoftDelete column
            $table->softDeletes()->after('synced_at');

            // Unique constraint: one product row per shop per Shopify product
            // This prevents duplicates during repeated syncs.
            // We use a partial index — both columns are required.
            $table->unique(['user_id', 'shopify_product_id'], 'products_user_shopify_unique');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropUnique('products_user_shopify_unique');
            $table->dropSoftDeletes();
            $table->dropColumn([
                'price',
                'inventory_quantity',
                'image_url',
                'shopify_created_at',
                'synced_at',
            ]);
        });
    }
};

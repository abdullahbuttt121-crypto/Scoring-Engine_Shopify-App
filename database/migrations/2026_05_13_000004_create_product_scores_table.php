<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/**
 * Chunk 2 — product_scores table
 *
 * What this table does:
 * ─────────────────────
 * Stores the CURRENT score for each product.  One row per product.
 * This is the source of truth for scores.
 *
 * The `products.score` column is a DENORMALIZED CACHE of this table —
 * it exists so the dashboard can do `ORDER BY score` without joining.
 * Whenever we update product_scores we also update products.score.
 *
 * Column meanings:
 * ──────────────────────────────────────────────────────────────
 *  shop_id         → which shop this score belongs to
 *  product_id      → FK to products.id (our local ID, not Shopify's)
 *  score           → 0-100 integer final score
 *  score_level     → "high" | "medium" | "low"  (derived from score, stored for easy filtering)
 *                    No enum column — stored as plain string
 *  reason_summary  → JSON array of objects, one per scoring dimension:
 *                    [{"key":"status","label":"Product Status","points":20,"reason":"Product is active"}]
 *  calculated_at   → when the score was last calculated
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_scores', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('shop_id');
            $table->unsignedBigInteger('product_id');

            $table->unsignedSmallInteger('score')->default(0);

            // high / medium / low — plain string, no enum
            $table->string('score_level')->default('low');

            // Full breakdown of why each dimension scored what it did
            $table->json('reason_summary')->nullable();

            // Timestamp of last calculation
            $table->timestamp('calculated_at')->nullable();

            $table->timestamps();

            // One score row per product per shop
            $table->unique(['shop_id', 'product_id'], 'product_scores_shop_product_unique');

            $table->index('score');         // for ORDER BY score
            $table->index('score_level');   // for WHERE score_level = 'low'

            $table->foreign('shop_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');

            $table->foreign('product_id')
                  ->references('id')
                  ->on('products')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_scores');
    }
};

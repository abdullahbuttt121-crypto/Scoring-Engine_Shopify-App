<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/**
 * Chunk 1 — Scoring Foundation
 *
 * Adds three columns to the existing `products` table:
 *
 *  score             — the final 0-100 integer score, stored so the dashboard
 *                      can ORDER BY score without recalculating on every request.
 *
 *  score_breakdown   — JSON blob that records each scoring dimension individually
 *                      (price, inventory, status, recency, tags, vendor, image,
 *                      description).  The React dashboard reads this to show
 *                      "why" a product got that score.
 *
 *  shopify_updated_at — the timestamp Shopify reports as the product's last change.
 *                       We need Shopify's own clock, NOT our local updated_at,
 *                       because our updated_at changes whenever we write to the DB
 *                       (e.g., every sync run) — it does not tell us when the
 *                       merchant actually changed something on Shopify.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // 0-100 integer; default 0 so existing rows are valid immediately
            $table->unsignedSmallInteger('score')->default(0)->after('status');

            // Per-dimension breakdown stored as JSON; nullable until first score run
            $table->json('score_breakdown')->nullable()->after('score');

            // Shopify's own updatedAt timestamp; nullable until next sync
            $table->timestamp('shopify_updated_at')->nullable()->after('score_breakdown');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['score', 'score_breakdown', 'shopify_updated_at']);
        });
    }
};

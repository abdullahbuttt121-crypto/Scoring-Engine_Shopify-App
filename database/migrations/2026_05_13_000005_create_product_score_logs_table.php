<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/**
 * Chunk 2 — product_score_logs table
 *
 * What this table does:
 * ─────────────────────
 * Every time a product's score changes, we INSERT a new row here.
 * This gives the merchant a history of score changes:
 *   "Your product scored 45 on May 1, then 72 on May 13 after you added images."
 *
 * We never UPDATE or DELETE rows in this table — append only.
 * This is the audit trail.
 *
 * Column meanings:
 * ──────────────────────────────────────────────────────────────
 *  shop_id        → which shop
 *  product_id     → which product
 *  old_score      → score before this calculation (null = first time scored)
 *  new_score      → score after this calculation
 *  reasons        → JSON snapshot of the full dimension breakdown at this moment
 *  calculated_by  → what triggered the score recalculation:
 *                   "sync" | "webhook" | "manual" | "rescore_all"
 *                   Stored as plain string — no enum column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_score_logs', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('shop_id');
            $table->unsignedBigInteger('product_id');

            // Nullable because first-time scoring has no previous score
            $table->unsignedSmallInteger('old_score')->nullable();
            $table->unsignedSmallInteger('new_score');

            // Full dimension snapshot at time of this log entry
            $table->json('reasons')->nullable();

            // What triggered the recalculation: sync | webhook | manual | rescore_all
            $table->string('calculated_by')->nullable();

            $table->timestamps();

            // Indexes for dashboard queries: "show score history for this product"
            $table->index(['shop_id', 'product_id']);
            $table->index('created_at');   // for time-based queries

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
        Schema::dropIfExists('product_score_logs');
    }
};

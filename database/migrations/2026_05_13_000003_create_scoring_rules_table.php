<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/**
 * Chunk 2 — scoring_rules table
 *
 * What this table does:
 * ─────────────────────
 * Stores individual scoring rules that define HOW a product earns points.
 * Each row = one rule, e.g. "if status = active → award 20 points".
 *
 * shop_id is NULLABLE because a null shop_id means the rule is a GLOBAL DEFAULT
 * that applies to all shops.  A non-null shop_id means the merchant has customised
 * that specific rule for their own shop (overriding the global default).
 *
 * Column meanings:
 * ──────────────────────────────────────────────────────────────
 *  rule_name          → Human readable: "Active Product"
 *  rule_key           → Machine key: "status"  (matches scoring dimension)
 *  rule_type          → Category: "status" | "price" | "inventory" | "recency"
 *                       | "tags" | "vendor" | "image" | "description"
 *  condition_operator → "equals" | "greater_than" | "less_than"
 *                       | "not_empty" | "empty" | "contains"
 *  condition_value    → The value to compare against, e.g. "active", "100"
 *                       NULL means the rule is a threshold check (e.g. image exists)
 *  points             → How many points this rule awards (positive) or deducts (negative)
 *  is_active          → Whether this rule is currently in use (boolean, stored as tinyint)
 *  sort_order         → Display order in the admin UI
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scoring_rules', function (Blueprint $table) {
            $table->id();

            // NULL = global default rule; non-null = shop-specific override
            $table->unsignedBigInteger('shop_id')->nullable();

            $table->string('rule_name');
            $table->string('rule_key');           // e.g. "status", "price", "inventory"
            $table->string('rule_type');           // category grouping for UI
            $table->string('condition_operator');  // equals, greater_than, not_empty …
            $table->string('condition_value')->nullable();
            $table->integer('points');             // can be negative (penalty rule)

            // Use tinyint(1) instead of enum — no enum columns as per the rules
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);

            $table->timestamps();

            // Index for fast lookup per shop
            $table->index('shop_id');
            $table->index(['rule_key', 'is_active']);

            $table->foreign('shop_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scoring_rules');
    }
};

<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/**
 * Fix column length issues that caused partial syncs.
 *
 * PROBLEM:
 * ────────
 * `tags`      was VARCHAR(255) — Shopify products with many tags overflow this.
 * `image_url` was VARCHAR(255) — Shopify CDN URLs easily exceed 255 characters.
 *
 * SYMPTOM:
 * ────────
 * Products with long tags or image URLs caused a DB exception inside
 * saveSingleProduct(), which rolled back the entire product row.
 * Only products whose data fit in VARCHAR(255) were saved (7 of 34).
 *
 * FIX:
 * ────
 * Change both columns to TEXT (up to 65,535 bytes — more than enough).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // TEXT supports up to 65,535 bytes — no Shopify tag list will overflow this
            $table->text('tags')->nullable()->change();

            // TEXT is sufficient for any CDN URL length
            $table->text('image_url')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('tags',      255)->nullable()->change();
            $table->string('image_url', 255)->nullable()->change();
        });
    }
};

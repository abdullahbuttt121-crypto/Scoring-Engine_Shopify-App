<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scoring_rules', function (Blueprint $table) {
            $table->json('condition_tree')->nullable()->after('condition_value');
            $table->string('action_type')->nullable()->after('points');
            $table->text('recommendation')->nullable()->after('action_type');
        });
    }

    public function down(): void
    {
        Schema::table('scoring_rules', function (Blueprint $table) {
            $table->dropColumn(['condition_tree', 'action_type', 'recommendation']);
        });
    }
};

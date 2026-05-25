<?php

namespace Database\Seeders;

use App\Models\ScoringRule;
use Illuminate\Database\Seeder;

/**
 * ScoringRulesSeeder
 *
 * Inserts the global default scoring rules.
 * shop_id is NULL on every row because these are GLOBAL defaults —
 * they apply to every shop that has not created a custom override.
 *
 * WHAT "rule_key" MEANS
 * ─────────────────────
 * rule_key is the machine identifier that the ProductScoringService uses
 * to match a rule to the correct product column.
 * It must stay stable — changing it after deployment would break the service.
 *
 * WHAT "points" MEANS HERE
 * ────────────────────────
 * All 11 rules below represent NEGATIVE signals — things that mean a product
 * needs attention.  Points here represent the WEIGHT of the problem:
 *   higher points = more urgent issue = product appears lower in the ranked list
 *   (the ProductScoringService subtracts these from a 100-point base)
 *
 * SAFE TO RE-RUN
 * ──────────────
 * updateOrCreate matches on ['rule_key', 'shop_id'] so running this seeder
 * twice will UPDATE existing rows rather than creating duplicates.
 */
class ScoringRulesSeeder extends Seeder
{
    public function run(): void
    {
        // Each entry is [match_key_array, values_to_set_or_update]
        // The match keys are: rule_key + shop_id
        // This uniquely identifies a global default rule.

        $rules = [

            // ── Inventory rules ─────────────────────────────────────────────

            [
                'rule_name'          => 'Out of Stock',
                'rule_key'           => 'inventory_out_of_stock',
                'rule_type'          => ScoringRule::TYPE_INVENTORY,
                'condition_operator' => ScoringRule::OP_EQUALS,
                'condition_value'    => '0',         // inventory_quantity = 0
                'points'             => 40,
                'sort_order'         => 10,
            ],
            [
                'rule_name'          => 'Low Inventory',
                'rule_key'           => 'inventory_low',
                'rule_type'          => ScoringRule::TYPE_INVENTORY,
                'condition_operator' => ScoringRule::OP_LESS_THAN,
                'condition_value'    => '10',         // inventory_quantity < 10
                'points'             => 25,
                'sort_order'         => 20,
            ],

            // ── Price rules ──────────────────────────────────────────────────

            [
                'rule_name'          => 'High Value Product',
                'rule_key'           => 'price_high_value',
                'rule_type'          => ScoringRule::TYPE_PRICE,
                'condition_operator' => ScoringRule::OP_GREATER_THAN,
                'condition_value'    => '100',        // price > 100
                'points'             => 20,
                'sort_order'         => 30,
            ],
            [
                'rule_name'          => 'Very Expensive Product',
                'rule_key'           => 'price_very_expensive',
                'rule_type'          => ScoringRule::TYPE_PRICE,
                'condition_operator' => ScoringRule::OP_GREATER_THAN,
                'condition_value'    => '500',        // price > 500
                'points'             => 30,
                'sort_order'         => 40,
            ],

            // ── Recency rules ────────────────────────────────────────────────

            [
                'rule_name'          => 'Product Not Updated Recently',
                'rule_key'           => 'recency_stale_60',
                'rule_type'          => ScoringRule::TYPE_RECENCY,
                'condition_operator' => ScoringRule::OP_GREATER_THAN,
                'condition_value'    => '60',         // days since shopify_updated_at > 60
                'points'             => 20,
                'sort_order'         => 50,
            ],
            [
                'rule_name'          => 'Product Very Stale',
                'rule_key'           => 'recency_stale_120',
                'rule_type'          => ScoringRule::TYPE_RECENCY,
                'condition_operator' => ScoringRule::OP_GREATER_THAN,
                'condition_value'    => '120',        // days since shopify_updated_at > 120
                'points'             => 35,
                'sort_order'         => 60,
            ],

            // ── Status rules ─────────────────────────────────────────────────

            [
                'rule_name'          => 'Active Product',
                'rule_key'           => 'status_active',
                'rule_type'          => ScoringRule::TYPE_STATUS,
                'condition_operator' => ScoringRule::OP_EQUALS,
                'condition_value'    => 'active',     // status = "active"
                'points'             => 10,
                'sort_order'         => 70,
            ],
            [
                'rule_name'          => 'Draft Product',
                'rule_key'           => 'status_draft',
                'rule_type'          => ScoringRule::TYPE_STATUS,
                'condition_operator' => ScoringRule::OP_EQUALS,
                'condition_value'    => 'draft',      // status = "draft"
                'points'             => 15,
                'sort_order'         => 80,
            ],

            // ── Content quality rules ─────────────────────────────────────────

            [
                'rule_name'          => 'Missing Product Image',
                'rule_key'           => 'image_missing',
                'rule_type'          => ScoringRule::TYPE_IMAGE,
                'condition_operator' => ScoringRule::OP_EMPTY,
                'condition_value'    => null,         // image_url is empty/null
                'points'             => 15,
                'sort_order'         => 90,
            ],
            [
                'rule_name'          => 'Missing Product Description',
                'rule_key'           => 'description_missing',
                'rule_type'          => ScoringRule::TYPE_DESCRIPTION,
                'condition_operator' => ScoringRule::OP_EMPTY,
                'condition_value'    => null,         // body_html is empty/null
                'points'             => 10,
                'sort_order'         => 100,
            ],
            [
                'rule_name'          => 'Missing Product Tags',
                'rule_key'           => 'tags_missing',
                'rule_type'          => ScoringRule::TYPE_TAGS,
                'condition_operator' => ScoringRule::OP_EMPTY,
                'condition_value'    => null,         // tags is empty/null
                'points'             => 10,
                'sort_order'         => 110,
            ],

        ];

        foreach ($rules as $rule) {
            ScoringRule::updateOrCreate(
                // MATCH on rule_key + shop_id (null = global)
                // This is the unique identity of a global default rule.
                [
                    'rule_key' => $rule['rule_key'],
                    'shop_id'  => null,
                ],
                // SET (or UPDATE) these values
                array_merge($rule, [
                    'shop_id'   => null,    // explicit: global rule
                    'is_active' => true,
                ])
            );
        }

        $this->command->info('✓ ' . count($rules) . ' default scoring rules seeded.');
    }
}

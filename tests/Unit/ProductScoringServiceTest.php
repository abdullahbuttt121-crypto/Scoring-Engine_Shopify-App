<?php

namespace Tests\Unit;

use App\Models\Products\Product;
use App\Models\ScoringRule;
use App\Services\ProductScoringService;
use Illuminate\Support\Collection;
use ReflectionMethod;
use Tests\TestCase;

class ProductScoringServiceTest extends TestCase
{
    public function test_all_group_deducts_points_once_only_when_every_condition_matches(): void
    {
        $product = new Product(['status' => 'active', 'inventory_quantity' => 12]);
        $rule = new ScoringRule([
            'rule_name' => 'Active and stocked', 'rule_key' => 'active_stocked', 'points' => 25,
            'score_effect' => ScoringRule::EFFECT_SUBTRACT,
            'condition_tree' => [
                'node_type' => 'group', 'combinator' => 'all', 'children' => [
                    ['node_type' => 'condition', 'rule_type' => 'status', 'operator' => 'equals', 'value' => 'active'],
                    ['node_type' => 'condition', 'rule_type' => 'inventory', 'operator' => 'greater_than', 'value' => '10'],
                ],
            ],
        ]);

        $this->assertSame(75, $this->calculate($product, collect([$rule]))['score']);

        $product->inventory_quantity = 5;
        $this->assertSame(100, $this->calculate($product, collect([$rule]))['score']);
    }

    public function test_nested_any_group_can_satisfy_parent_all_group(): void
    {
        $product = new Product(['status' => 'draft', 'tags' => 'featured', 'inventory_quantity' => 20]);
        $rule = new ScoringRule([
            'rule_name' => 'Promotion candidate', 'rule_key' => 'promotion_candidate', 'points' => 10,
            'score_effect' => ScoringRule::EFFECT_ADD,
            'condition_tree' => [
                'node_type' => 'group', 'combinator' => 'all', 'children' => [
                    ['node_type' => 'condition', 'rule_type' => 'inventory', 'operator' => 'greater_than', 'value' => '10'],
                    ['node_type' => 'group', 'combinator' => 'any', 'children' => [
                        ['node_type' => 'condition', 'rule_type' => 'status', 'operator' => 'equals', 'value' => 'active'],
                        ['node_type' => 'condition', 'rule_type' => 'tags', 'operator' => 'contains', 'value' => 'featured'],
                    ]],
                ],
            ],
        ]);

        $this->assertSame(110, $this->calculate($product, collect([$rule]))['score']);
    }

    public function test_add_and_subtract_rules_can_use_opposite_price_conditions(): void
    {
        $product = new Product(['price' => 80]);
        $addRule = new ScoringRule([
            'rule_name' => 'Premium price', 'rule_key' => 'premium_price', 'points' => 20,
            'score_effect' => ScoringRule::EFFECT_ADD,
            'condition_tree' => ['node_type' => 'condition', 'rule_type' => 'price', 'operator' => 'greater_than', 'value' => '100'],
        ]);
        $cutRule = new ScoringRule([
            'rule_name' => 'Price below target', 'rule_key' => 'price_below_target', 'points' => 15,
            'score_effect' => ScoringRule::EFFECT_SUBTRACT,
            'condition_tree' => ['node_type' => 'condition', 'rule_type' => 'price', 'operator' => 'less_than', 'value' => '100'],
        ]);

        $this->assertSame(85, $this->calculate($product, collect([$addRule, $cutRule]))['score']);

        $product->price = 120;
        $this->assertSame(120, $this->calculate($product, collect([$addRule, $cutRule]))['score']);
    }

    public function test_legacy_negative_points_remain_an_addition(): void
    {
        $product = new Product(['status' => 'active']);
        $rule = new ScoringRule([
            'rule_name' => 'Legacy bonus', 'rule_key' => 'legacy_bonus', 'points' => -5,
            'condition_tree' => ['node_type' => 'condition', 'rule_type' => 'status', 'operator' => 'equals', 'value' => 'active'],
        ]);

        $this->assertSame(105, $this->calculate($product, collect([$rule]))['score']);
    }

    private function calculate(Product $product, Collection $rules): array
    {
        $method = new ReflectionMethod(ProductScoringService::class, 'calculateScore');

        return $method->invoke(new ProductScoringService, $product, $rules);
    }
}

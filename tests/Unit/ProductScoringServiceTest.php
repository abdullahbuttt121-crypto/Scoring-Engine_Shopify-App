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
            'rule_name' => 'Promotion candidate', 'rule_key' => 'promotion_candidate', 'points' => -10,
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

    private function calculate(Product $product, Collection $rules): array
    {
        $method = new ReflectionMethod(ProductScoringService::class, 'calculateScore');
        return $method->invoke(new ProductScoringService(), $product, $rules);
    }
}

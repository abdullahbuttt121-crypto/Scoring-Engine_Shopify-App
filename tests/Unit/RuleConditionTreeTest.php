<?php

namespace Tests\Unit;

use App\Support\RuleConditionTree;
use PHPUnit\Framework\TestCase;

class RuleConditionTreeTest extends TestCase
{
    public function test_nested_all_and_any_tree_is_valid(): void
    {
        $tree = [
            'node_type' => 'group', 'combinator' => 'all', 'children' => [
                ['node_type' => 'condition', 'rule_type' => 'inventory', 'operator' => 'greater_than', 'value' => '10'],
                ['node_type' => 'group', 'combinator' => 'any', 'children' => [
                    ['node_type' => 'condition', 'rule_type' => 'status', 'operator' => 'equals', 'value' => 'active'],
                    ['node_type' => 'condition', 'rule_type' => 'tags', 'operator' => 'contains', 'value' => 'featured'],
                ]],
            ],
        ];

        $this->assertNull(RuleConditionTree::validationError($tree));
    }

    public function test_empty_group_is_rejected(): void
    {
        $tree = ['node_type' => 'group', 'combinator' => 'all', 'children' => []];
        $this->assertNotNull(RuleConditionTree::validationError($tree));
    }
}

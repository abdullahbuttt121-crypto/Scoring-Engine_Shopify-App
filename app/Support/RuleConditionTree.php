<?php

namespace App\Support;

use App\Models\ScoringRule;

final class RuleConditionTree
{
    private const MAX_DEPTH = 5;

    private const MAX_NODES = 100;

    public static function validationError(mixed $tree): ?string
    {
        $count = 0;

        return self::validateNode($tree, 0, $count);
    }

    private static function validateNode(mixed $node, int $depth, int &$count): ?string
    {
        if (! is_array($node)) {
            return 'Each condition-tree node must be an object.';
        }
        if (++$count > self::MAX_NODES) {
            return 'A rule may contain at most 100 condition nodes.';
        }
        if ($depth > self::MAX_DEPTH) {
            return 'Condition groups may be nested at most 5 levels deep.';
        }

        $nodeType = $node['node_type'] ?? null;
        if ($nodeType === 'group') {
            if (! in_array($node['combinator'] ?? null, ['all', 'any'], true)) {
                return 'Every group must use the ALL or ANY combinator.';
            }
            $children = $node['children'] ?? null;
            if (! is_array($children) || count($children) < 1 || count($children) > 20) {
                return 'Every group must contain between 1 and 20 children.';
            }
            foreach ($children as $child) {
                if ($error = self::validateNode($child, $depth + 1, $count)) {
                    return $error;
                }
            }

            return null;
        }

        if ($nodeType !== 'condition') {
            return 'Every node must be a condition or group.';
        }

        $types = ScoringRule::validTypes();
        $operators = ScoringRule::validOperators();
        if (! in_array($node['rule_type'] ?? null, $types, true)) {
            return 'A condition contains an invalid rule type.';
        }
        if (! in_array($node['operator'] ?? null, $operators, true)) {
            return 'A condition contains an invalid operator.';
        }
        if (! in_array($node['operator'], [ScoringRule::OP_EMPTY, ScoringRule::OP_NOT_EMPTY], true)
            && (! array_key_exists('value', $node) || trim((string) $node['value']) === '')) {
            return 'A condition value is required for this operator.';
        }

        return null;
    }
}

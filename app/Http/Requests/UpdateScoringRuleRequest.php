<?php

namespace App\Http\Requests;

use App\Models\ScoringRule;
use App\Support\RuleConditionTree;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * UpdateScoringRuleRequest
 *
 * Validates the body for PUT /scoring-rules/{id}.
 *
 * Same rules as Store but all fields are "sometimes" (optional in the payload).
 * This allows partial updates — e.g. toggling is_active without sending all fields.
 */
class UpdateScoringRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $validTypes = [
            ScoringRule::TYPE_STATUS,
            ScoringRule::TYPE_PRICE,
            ScoringRule::TYPE_INVENTORY,
            ScoringRule::TYPE_RECENCY,
            ScoringRule::TYPE_TAGS,
            ScoringRule::TYPE_VENDOR,
            ScoringRule::TYPE_IMAGE,
            ScoringRule::TYPE_DESCRIPTION,
        ];

        $validOperators = [
            ScoringRule::OP_EQUALS,
            ScoringRule::OP_NOT_EQUALS,
            ScoringRule::OP_GREATER_THAN,
            ScoringRule::OP_LESS_THAN,
            ScoringRule::OP_EMPTY,
            ScoringRule::OP_NOT_EMPTY,
            ScoringRule::OP_CONTAINS,
            'older_than_days',
        ];

        return [
            'rule_name' => ['sometimes', 'string', 'max:100'],
            'rule_type' => ['sometimes', Rule::in($validTypes)],
            'condition_operator' => ['sometimes', Rule::in($validOperators)],
            'condition_value' => ['sometimes', 'nullable', 'string', 'max:255'],
            'points' => ['sometimes', 'integer', 'between:0,10000'],
            'score_effect' => ['sometimes', Rule::in([ScoringRule::EFFECT_ADD, ScoringRule::EFFECT_SUBTRACT])],
            'condition_tree' => ['sometimes', 'array', function ($attribute, $value, $fail) {
                if ($error = RuleConditionTree::validationError($value)) {
                    $fail($error);
                }
            }],
            'action_type' => ['sometimes', 'nullable', Rule::in(array_keys(config('scoring.actions', [])))],
            'recommendation' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ];
    }

    public function messages(): array
    {
        return [
            'rule_type.in' => 'Rule type must be one of: status, price, inventory, recency, tags, vendor, image, description.',
            'condition_operator.in' => 'Condition operator must be one of: equals, not_equals, greater_than, less_than, empty, not_empty, contains, older_than_days.',
            'points.between' => 'Points must be between 0 and 10,000.',
        ];
    }
}

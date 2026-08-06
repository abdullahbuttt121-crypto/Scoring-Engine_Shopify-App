<?php

namespace App\Http\Requests;

use App\Models\ScoringRule;
use App\Support\RuleConditionTree;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * StoreScoringRuleRequest
 *
 * Validates the body for POST /scoring-rules.
 *
 * VALIDATION RULES EXPLAINED:
 * ────────────────────────────
 * rule_name          → required, any string up to 100 chars
 * rule_type          → must be one of the known categories (prevents garbage data)
 * condition_operator → must be one of the known operators
 * condition_value    → required UNLESS the operator is "empty" or "not_empty"
 *                      (those operators don't need a comparison value)
 * points             → integer, can be negative (penalty rules), max ±10000
 * is_active          → boolean (defaults to true if omitted)
 * sort_order         → optional unsigned integer (UI display order)
 *
 * INVALID COMBINATIONS (caught by the "required_unless" + type rules):
 * ─────────────────────────────────────────────────────────────────────
 * If operator is "less_than" or "greater_than" but condition_value is omitted
 * → condition_value is required, so validation fails with a clear message.
 *
 * If rule_type is "status" but operator is "less_than" (status is a string, not
 * a number) → we don't validate that here at this layer; the scoring service
 * simply won't match any products (a less_than check on a string returns false).
 * This is acceptable — the UI's operator dropdown is filtered by rule_type to
 * prevent the most obviously invalid combos.
 */
class StoreScoringRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // authorisation is handled by the route middleware
    }

    public function rules(): array
    {
        // Valid rule types and operators are defined on the model as constants
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
            'older_than_days',   // special operator for recency rules
        ];

        return [
            'rule_name' => ['required', 'string', 'max:100'],
            'rule_type' => ['required_without:condition_tree', Rule::in($validTypes)],
            'condition_operator' => ['required_without:condition_tree', Rule::in($validOperators)],

            // condition_value is not needed for "empty" / "not_empty" / "older_than_days" (if no threshold)
            // For all other operators it IS required
            'condition_value' => [
                Rule::requiredIf(function () {
                    $op = $this->input('condition_operator');

                    return ! $this->has('condition_tree') && ! in_array($op, [ScoringRule::OP_EMPTY, ScoringRule::OP_NOT_EMPTY]);
                }),
                'nullable',
                'string',
                'max:255',
            ],

            'points' => ['required', 'integer', 'between:0,10000'],
            'score_effect' => ['sometimes', Rule::in([ScoringRule::EFFECT_ADD, ScoringRule::EFFECT_SUBTRACT])],
            'condition_tree' => ['nullable', 'array', function ($attribute, $value, $fail) {
                if ($error = RuleConditionTree::validationError($value)) {
                    $fail($error);
                }
            }],
            'action_type' => ['nullable', Rule::in(array_keys(config('scoring.actions', [])))],
            'recommendation' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ];
    }

    public function messages(): array
    {
        return [
            'rule_type.in' => 'Rule type must be one of: status, price, inventory, recency, tags, vendor, image, description.',
            'condition_operator.in' => 'Condition operator must be one of: equals, not_equals, greater_than, less_than, empty, not_empty, contains, older_than_days.',
            'condition_value.required' => 'Condition value is required for this operator type.',
            'points.between' => 'Points must be between 0 and 10,000.',
        ];
    }
}

<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ScoringRuleResource
 *
 * Transforms a ScoringRule model into the JSON shape the React UI expects.
 *
 * WHY A RESOURCE?
 * ────────────────
 * The model has internal fields (shop_id, rule_key) that we want to expose
 * differently in the API. This resource also adds `is_global` so the UI
 * can show a "global" badge and lock the rule_key field for global rules.
 */
class ScoringRuleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,

            // is_global = true means this is a shared default rule (shop_id = null)
            // The UI uses this to show a "Global" badge and different delete behaviour.
            'is_global' => $this->shop_id === null,

            'rule_name' => $this->rule_name,
            'rule_key' => $this->rule_key,
            'rule_type' => $this->rule_type,
            'condition_operator' => $this->condition_operator,

            // condition_value may be null for "empty" / "not_empty" operators
            'condition_value' => $this->condition_value,
            'condition_tree' => $this->effectiveConditionTree(),

            'points' => $this->pointMagnitude(),
            'score_effect' => $this->effectiveScoreEffect(),
            'action_type' => $this->action_type,
            'recommendation' => $this->recommendation,
            'is_active' => (bool) $this->is_active,
            'sort_order' => $this->sort_order,

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}

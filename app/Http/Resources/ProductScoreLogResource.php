<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ProductScoreLogResource
 *
 * Transforms a ProductScoreLog model into clean JSON.
 *
 * Used inside ProductResource for the "score history" section
 * on the product detail page.
 *
 * Example output:
 * {
 *   "old_score":      30,
 *   "new_score":      75,
 *   "score_changed":  true,
 *   "reasons":        ["Low inventory (8 units) [+25 pts]", ...],
 *   "calculated_by":  "manual",
 *   "logged_at":      "2026-05-13T10:00:00Z"
 * }
 */
class ProductScoreLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'old_score'     => $this->old_score,
            'new_score'     => $this->new_score,
            // Convenience flag so React can highlight rows where score changed
            'score_changed' => $this->old_score !== $this->new_score,
            'reasons'       => $this->reasons ?? [],    // already cast to array
            'calculated_by' => $this->calculated_by,
            'logged_at'     => $this->created_at?->toISOString(),
        ];
    }
}

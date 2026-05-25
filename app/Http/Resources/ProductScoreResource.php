<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ProductScoreResource
 *
 * Transforms a ProductScore model into clean JSON for the React frontend.
 *
 * Used inline inside ProductResource — not returned as a standalone response.
 *
 * Example output:
 * {
 *   "score":         75,
 *   "level":         "high",
 *   "reasons":       ["Low inventory (8 units) [+25 pts]", ...],
 *   "calculated_at": "2026-05-13T10:00:00Z"
 * }
 */
class ProductScoreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'score'          => $this->score,
            'level'          => $this->score_level,
            'reasons'        => $this->reason_summary ?? [],   // already cast to array
            'calculated_at'  => $this->calculated_at?->toISOString(),
        ];
    }
}

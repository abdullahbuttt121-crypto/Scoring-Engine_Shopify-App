<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ProductResource
 *
 * Transforms a Product model into clean JSON for the React dashboard.
 *
 * CONDITIONAL FIELDS:
 * ────────────────────
 * `score_info`  — included when the `productScore` relationship is loaded
 *                 (i.e. GET /products always includes it; eager loaded in controller)
 *
 * `score_logs`  — included ONLY when the `scoreHistory` relationship is loaded
 *                 (i.e. GET /products/{id} detail page only)
 *                 The list view omits this to keep response payloads small.
 *
 * WHY whenLoaded():
 * ──────────────────
 * `$this->whenLoaded('productScore')` returns the relationship data if it was
 * eager-loaded in the query, or OMITS the key entirely if it wasn't.
 * This prevents accidental N+1 queries and keeps the list/detail responses
 * appropriately sized without maintaining two separate resource classes.
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            // ── Core product identity ──────────────────────────────────────
            'id'                  => $this->id,
            'shopify_product_id'  => $this->shopify_product_id,
            'title'               => $this->title,
            'handle'              => $this->handle,
            'status'              => $this->status,
            'vendor'              => $this->vendor,
            'product_type'        => $this->product_type,
            'tags'                => $this->tags,
            'body_html'           => $this->body_html,

            // ── Denormalized fields for fast display ───────────────────────
            'price'               => $this->price,
            'inventory_quantity'  => $this->inventory_quantity,
            'image_url'           => $this->image_url,

            // ── Timestamps ────────────────────────────────────────────────
            'shopify_created_at'  => $this->shopify_created_at?->toISOString(),
            'shopify_updated_at'  => $this->shopify_updated_at?->toISOString(),
            'synced_at'           => $this->synced_at?->toISOString(),

            // ── Cached score (denormalized from product_scores) ────────────
            // This is the quick-access score. The full breakdown is in score_info.
            'score'               => $this->score,
            'score_breakdown'     => $this->score_breakdown ?? [],

            // ── Full score details (included when productScore is eager-loaded)
            // Returns null if the product has never been scored yet.
            'score_info'          => $this->whenLoaded(
                'productScore',
                fn () => $this->productScore
                    ? new ProductScoreResource($this->productScore)
                    : null
            ),

            // ── Score history (included ONLY on detail page, not list) ─────
            // Returns last 10 log entries. Omitted entirely on list endpoint.
            'score_logs'          => $this->whenLoaded(
                'scoreHistory',
                fn () => ProductScoreLogResource::collection($this->scoreHistory)
            ),
        ];
    }
}

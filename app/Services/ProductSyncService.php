<?php

namespace App\Services;

use App\Models\User;
use App\Models\Products\Product;
use App\Models\Products\ProductVarient;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * ProductSyncService
 *
 * Pulls all products from Shopify using GraphQL and saves them locally.
 *
 * WHAT THIS SERVICE DOES (plain English):
 * ────────────────────────────────────────
 * 1. Asks Shopify for a page of products (50 at a time).
 * 2. For each product, saves or updates a row in the local `products` table.
 * 3. Also saves each variant in `product_varients`.
 * 4. Repeats until Shopify says there are no more pages.
 * 5. Returns a summary: how many synced, how many failed.
 *
 * DUPLICATE PREVENTION:
 * ─────────────────────
 * We use updateOrCreate(match_keys, update_values).
 * match_keys = ['user_id' => X, 'shopify_product_id' => Y]
 * This means: "find a row where BOTH these match; if found → update it;
 * if not found → create a new row."
 * Running the sync 10 times will still produce exactly 1 row per product.
 *
 * KYON PACKAGE API ACCESS:
 * ─────────────────────────
 * The User model (which is the Shop model) has an api() method from the
 * Kyon/Osiset ShopModel trait. Calling $user->api()->graph($query) sends
 * a GraphQL request to Shopify and returns the response as an array.
 */
class ProductSyncService
{
    /** @var User The authenticated shop (user) */
    private User $user;

    /**
     * How many products to fetch per GraphQL page.
     * Shopify maximum is 250. We use 50 to keep memory usage low.
     */
    private int $pageSize = 50;

    public function __construct(User $user)
    {
        $this->user = $user;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Run the full sync.
     *
     * @return array ['synced' => int, 'errors' => int, 'total' => int]
     */
    public function sync(): array
    {
        $synced = 0;
        $errors = 0;
        $cursor = null;   // null = start from the beginning (no cursor)

        Log::info("[ProductSync] Starting sync for shop ID: {$this->user->id}");

        // Keep fetching pages until Shopify says hasNextPage = false
        do {
            // Step 1 — fetch one page of products from Shopify
            $page = $this->fetchPage($cursor);

            if ($page === null) {
                // GraphQL returned an error — log and stop
                Log::error("[ProductSync] GraphQL error on page fetch. Stopping sync for shop {$this->user->id}.");
                break;
            }

            Log::info("[ProductSync] Fetched " . count($page['products']) . " products (cursor: " . ($cursor ?? 'start') . ")");

            // Step 2 — save each product in this page
            foreach ($page['products'] as $productData) {
                if ($this->saveSingleProduct($productData)) {
                    $synced++;
                } else {
                    $errors++;
                }
            }

            // Step 3 — move to the next page
            $cursor = $page['next_cursor'];   // null when there is no next page

        } while ($page['has_next_page']);

        Log::info("[ProductSync] Finished. Synced: {$synced}, Errors: {$errors}, Total attempted: " . ($synced + $errors));

        return [
            'synced' => $synced,
            'errors' => $errors,
            'total'  => $synced + $errors,
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fetch one page of products from Shopify using GraphQL.
     *
     * HOW CURSOR PAGINATION WORKS:
     * ────────────────────────────
     * Think of a cursor like a bookmark in a book.
     * - First request: no bookmark → Shopify gives you the first 50 products
     *   AND a "bookmark" (endCursor) for where you stopped.
     * - Second request: pass that bookmark → Shopify gives you the NEXT 50.
     * - Continue until hasNextPage = false.
     *
     * @param  string|null $cursor  The endCursor from the previous page (null for first page)
     * @return array|null           ['products' => [], 'has_next_page' => bool, 'next_cursor' => ?string]
     *                              Returns null if GraphQL returned an error.
     */
    private function fetchPage(?string $cursor): ?array
    {
        // GraphQL requires: after: null (first page) OR after: "cursorValue" (next pages)
        // We build the `after` argument as a raw string to inject into the query.
        $afterArgument = $cursor === null ? 'null' : '"' . $cursor . '"';

        $query = <<<GRAPHQL
        query {
            products(first: {$this->pageSize}, after: {$afterArgument}) {
                edges {
                    node {
                        id
                        title
                        handle
                        status
                        vendor
                        productType
                        tags
                        description
                        descriptionHtml
                        createdAt
                        updatedAt
                        featuredImage {
                            url
                        }
                        variants(first: 50) {
                            edges {
                                node {
                                    id
                                    title
                                    sku
                                    price
                                    compareAtPrice
                                    inventoryQuantity
                                    inventoryItem {
                                        id
                                    }
                                }
                            }
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
        GRAPHQL;

        // $user->api()->graph() sends the GraphQL request to Shopify
        // It returns a PHP array — we convert it to an object for easy property access
        $result = $this->toObject($this->user->api()->graph($query));

        // Check for GraphQL-level errors
        if ($result->errors) {
            Log::error("[ProductSync] GraphQL errors: " . json_encode($result->errors));
            return null;
        }

        $connection = $result->body->data->products;

        return [
            'products'      => $connection->edges,
            'has_next_page' => $connection->pageInfo->hasNextPage,
            'next_cursor'   => $connection->pageInfo->endCursor, // null when last page
        ];
    }

    /**
     * Save or update a single product (and its variants) in the database.
     *
     * We use updateOrCreate with ['user_id', 'shopify_product_id'] as the MATCH keys.
     * This means: "find the row where user_id AND shopify_product_id both match.
     * If found, update it. If not found, create it."
     * This is what prevents duplicates.
     *
     * @param  object $edge  A GraphQL edge node from the products connection
     * @return bool          true = saved successfully, false = an error occurred
     */
    private function saveSingleProduct(object $edge): bool
    {
        DB::beginTransaction();

        try {
            $node = $edge->node;

            // Extract the numeric Shopify ID from the GID string
            // e.g. "gid://shopify/Product/123456" → 123456
            $shopifyProductId = $this->extractNumericId($node->id);

            // ── Denormalized variant data ─────────────────────────────────────
            // We calculate price and inventory from variants so the scoring
            // engine can read them from the product row without joins.
            $variants = $this->extractVariants($node);
            $minPrice  = $this->calculateMinPrice($variants);
            $totalQty  = $this->calculateTotalInventory($variants);

            // ── Save the product row (idempotent) ──────────────────────────────
            $product = Product::updateOrCreate(
                // MATCH: find the existing row using these two columns
                [
                    'user_id'            => $this->user->id,
                    'shopify_product_id' => $shopifyProductId,
                ],
                // SET / UPDATE: all the other data
                [
                    'title'              => $node->title ?? null,
                    'handle'             => $node->handle ?? null,
                    'status'             => strtolower($node->status ?? 'draft'),
                    'vendor'             => $node->vendor ?? null,
                    'product_type'       => $node->productType ?? null,
                    // Tags come as an array from GraphQL — store comma-separated
                    // (consistent with existing ShopifyProductTrait behaviour)
                    'tags'               => $this->tagsToString($node->tags ?? []),
                    // body_html stores the full HTML description
                    'body_html'          => $node->descriptionHtml ?? null,
                    // Denormalized fields for fast scoring without joins
                    'price'              => $minPrice,
                    'inventory_quantity' => $totalQty,
                    'image_url'          => $node->featuredImage->url ?? null,
                    // Shopify timestamps (Shopify's own clock, not ours)
                    'shopify_created_at' => $node->createdAt ?? null,
                    'shopify_updated_at' => $node->updatedAt ?? null,
                    // Our sync clock — when WE last fetched this product
                    'synced_at'          => now(),
                ]
            );

            // ── Save variants ─────────────────────────────────────────────────
            foreach ($variants as $variantData) {
                ProductVarient::updateOrCreate(
                    // MATCH: find existing variant by Shopify variant ID + product
                    [
                        'product_id'                 => $product->id,
                        'shopify_product_Varient_id' => $variantData['shopify_variant_id'],
                    ],
                    // SET / UPDATE
                    [
                        'title'                      => $variantData['title'],
                        'sku'                        => $variantData['sku'],
                        'price'                      => $variantData['price'],
                        'compare_at_price'           => $variantData['compare_at_price'],
                        'inventory_quantity'         => $variantData['inventory_quantity'],
                        'shopify_inventory_item_id'  => $variantData['inventory_item_id'],
                    ]
                );
            }

            DB::commit();
            return true;

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error("[ProductSync] Failed to save product. Error: " . $e->getMessage());
            Log::error("[ProductSync] Product data: " . json_encode($edge));
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Extract variant data from a GraphQL product node into a clean array.
     *
     * @param  object $node  GraphQL product node
     * @return array         Array of variant arrays
     */
    private function extractVariants(object $node): array
    {
        $variants = [];

        if (empty($node->variants->edges)) {
            return $variants;
        }

        foreach ($node->variants->edges as $edge) {
            $v = $edge->node;
            $variants[] = [
                'shopify_variant_id'  => $this->extractNumericId($v->id),
                'title'               => $v->title ?? null,
                'sku'                 => $v->sku ?? null,
                'price'               => is_numeric($v->price ?? null) ? (float) $v->price : 0.00,
                'compare_at_price'    => is_numeric($v->compareAtPrice ?? null) ? (float) $v->compareAtPrice : null,
                'inventory_quantity'  => (int) ($v->inventoryQuantity ?? 0),
                'inventory_item_id'   => $this->extractNumericId($v->inventoryItem->id ?? ''),
            ];
        }

        return $variants;
    }

    /**
     * Calculate the minimum (lowest) price across all variants.
     * We use the minimum because that is the price a customer sees first.
     * Returns 0.00 if there are no variants.
     */
    private function calculateMinPrice(array $variants): float
    {
        if (empty($variants)) {
            return 0.00;
        }

        $prices = array_column($variants, 'price');
        $prices = array_filter($prices, fn($p) => $p > 0); // exclude zero prices

        return empty($prices) ? 0.00 : (float) min($prices);
    }

    /**
     * Calculate total inventory by summing inventory_quantity across all variants.
     */
    private function calculateTotalInventory(array $variants): int
    {
        return (int) array_sum(array_column($variants, 'inventory_quantity'));
    }

    /**
     * Convert tags (GraphQL returns them as an array) to a comma-separated string.
     * This keeps the format consistent with the existing ShopifyProductTrait behaviour.
     *
     * @param  array|mixed $tags
     * @return string
     */
    private function tagsToString($tags): string
    {
        if (is_array($tags)) {
            return implode(',', array_filter($tags));
        }
        return (string) ($tags ?? '');
    }

    /**
     * Extract the numeric part from a Shopify Global ID (GID).
     *
     * Example:
     *   "gid://shopify/Product/9876543210" → "9876543210"
     *   "gid://shopify/ProductVariant/111" → "111"
     *
     * We use the same logic as the existing ShopifyProductTrait::extractId()
     * to stay consistent throughout the codebase.
     */
    private function extractNumericId(?string $gid): string
    {
        if (empty($gid)) {
            return '';
        }
        $parts = explode('/', $gid);
        return (string) end($parts);
    }

    /**
     * Convert a PHP array to a stdClass object tree (deep conversion).
     * This is the same as arrayToObject() in the existing traits.
     * We use it so we can access response data as $result->body->data->products
     * instead of $result['body']['data']['products'].
     */
    private function toObject(mixed $data): object
    {
        return json_decode(json_encode($data));
    }
}

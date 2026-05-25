<?php

namespace App\Jobs;

use stdClass;
use Illuminate\Support\Facades\Log;
use App\Models\Products\Product;
use App\Models\Products\ProductScoreLog;
use App\Models\Products\ProductVarient;
use Illuminate\Bus\Queueable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Osiset\ShopifyApp\Objects\Values\ShopDomain;
use Osiset\ShopifyApp\Contracts\Queries\Shop as IShopQuery;

/**
 * InventoryLevelsUpdateJob
 *
 * Fired by Kyon when Shopify sends an inventory_levels/update webhook.
 *
 * WHAT THE PAYLOAD LOOKS LIKE:
 * ─────────────────────────────
 * {
 *   "inventory_item_id": 808950810,
 *   "location_id": 905684977,
 *   "available": 6,        // available quantity at this specific location
 *   "updated_at": "..."
 * }
 *
 * WHAT THIS JOB DOES:
 * ─────────────────────
 * 1. Find the product variant whose shopify_inventory_item_id matches the payload.
 * 2. Update that variant's inventory_quantity to the new `available` value.
 * 3. Re-sum ALL variants for the parent product → update product.inventory_quantity.
 * 4. Dispatch CalculateProductScoreJob to update the score.
 *
 * WHY THIS APPROACH?
 * ───────────────────
 * Shopify sends inventory_levels/update per location, not per product. For
 * simplicity, we track total inventory as the sum of all variant quantities
 * stored locally. Each incoming event updates ONE variant then refreshes the
 * product total. This avoids an additional Shopify API call per webhook.
 *
 * NOTE: If a store uses multi-location inventory, `available` in this webhook
 * is per-location. The variant's inventory_quantity will reflect the LAST
 * location update received, not the true cross-location total. For multi-
 * location accuracy, call Shopify's inventoryLevel API. This simple version is
 * sufficient for single-location stores.
 *
 * KYON ROUTING:
 * ─────────────
 * Kyon maps the webhook topic `inventory_levels/update` to this class by
 * convention (topic → PascalCase → Job name). The address in config must
 * be set to: ${APP_URL}/webhook/inventory-levels-update
 */
class InventoryLevelsUpdateJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var ShopDomain|string */
    public $shopDomain;

    /** @var object Decoded webhook payload */
    public $data;

    /** Maximum retry attempts */
    public int $tries = 3;

    /** Seconds between retries */
    public int $backoff = 60;

    public function __construct($shopDomain, $data)
    {
        $this->shopDomain = $shopDomain;
        $this->data = $data;
    }

    public function handle(IShopQuery $shopQuery): void
    {
        $payload = $this->data;

        // The webhook provides a numeric inventory_item_id
        $inventoryItemId = $payload->inventory_item_id ?? null;
        $available       = $payload->available ?? null;

        if (!$inventoryItemId || $available === null) {
            Log::warning('[InventoryLevelsUpdateJob] Missing inventory_item_id or available in payload.');
            return;
        }

        // ── 1. Find the variant by its Shopify inventory_item_id ──────────
        // shopify_inventory_item_id is stored as a numeric string in the DB
        $variant = ProductVarient::where('shopify_inventory_item_id', (string) $inventoryItemId)->first();

        if (!$variant) {
            // This inventory item doesn't belong to any product we track — skip silently.
            Log::info('[InventoryLevelsUpdateJob] No local variant for inventory_item_id=' . $inventoryItemId . '. Skipping.');
            return;
        }

        // ── 2. Update the variant's inventory_quantity ────────────────────
        $oldQuantity = $variant->inventory_quantity;
        $variant->update(['inventory_quantity' => (int) $available]);

        Log::info(sprintf(
            '[InventoryLevelsUpdateJob] Variant %s inventory: %d → %d',
            $variant->shopify_product_Varient_id,
            $oldQuantity,
            $available
        ));

        // ── 3. Re-sum all variant quantities → update product total ───────
        // Load the parent product
        $product = Product::find($variant->product_id);

        if (!$product) {
            Log::warning('[InventoryLevelsUpdateJob] Parent product not found for variant_id=' . $variant->id);
            return;
        }

        // Sum ALL variants for this product to get the accurate total
        $totalInventory = ProductVarient::where('product_id', $product->id)
            ->sum('inventory_quantity');

        $product->update([
            'inventory_quantity' => (int) $totalInventory,
            'synced_at'          => now(),
        ]);

        Log::info(sprintf(
            '[InventoryLevelsUpdateJob] Product %d total inventory updated to %d.',
            $product->id,
            $totalInventory
        ));

        // ── 4. Recalculate the product score ──────────────────────────────
        // The inventory change may move the product across a scoring threshold
        // (e.g. from 0 → 5 units clears the "out of stock" rule, dropping score).
        CalculateProductScoreJob::dispatch($product->id, ProductScoreLog::TRIGGER_WEBHOOK);

        Log::info('[InventoryLevelsUpdateJob] Score recalculation queued for product_id=' . $product->id);
    }
}

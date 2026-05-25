<?php namespace App\Jobs;

use stdClass;
use Illuminate\Support\Facades\Log;
use Illuminate\Bus\Queueable;
use App\Http\Traits\ResponseTrait;
use Illuminate\Queue\SerializesModels;
use App\Http\Traits\ShopifyProductTrait;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Osiset\ShopifyApp\Objects\Values\ShopDomain;
use App\Repositories\Product\ProductRepositoryInterface;
use Osiset\ShopifyApp\Contracts\Queries\Shop as IShopQuery;

/**
 * ProductsDeleteJob
 *
 * Fired by Kyon when Shopify sends a products/delete webhook.
 *
 * The webhook payload contains only the numeric product ID:
 *   { "id": 788032119674292900 }
 *
 * We soft-delete the local product row (SoftDeletes trait is on the Product model).
 * Variants and media are NOT deleted — they stay for historical reference and
 * are overwritten on a future sync if the product is ever recreated.
 *
 * SAFE DUPLICATE HANDLING:
 * ─────────────────────────
 * Shopify may send the delete webhook more than once. If the product is
 * already deleted (or was never synced locally), we log and skip gracefully
 * rather than throwing an exception.
 */
class ProductsDeleteJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, ResponseTrait, ShopifyProductTrait;

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
        $payload   = $this->data;
        $shopifyId = $payload->id ?? null;

        if (!$shopifyId) {
            Log::warning('[ProductsDeleteJob] Missing product ID in payload. Skipping.');
            return;
        }

        $this->getProductRepository(app(ProductRepositoryInterface::class));

        // Guard: if the product doesn't exist locally (not synced or already deleted), skip
        $product = $this->product->getByShopifyId($shopifyId);

        if (!$product) {
            Log::info('[ProductsDeleteJob] Product shopify_id=' . $shopifyId . ' not found locally. Skipping (already deleted or never synced).');
            return;
        }

        if ($this->deleteProduct($shopifyId)) {
            Log::info('[ProductsDeleteJob] Product shopify_id=' . $shopifyId . ' soft-deleted successfully.');
        } else {
            Log::error('[ProductsDeleteJob] Failed to delete product shopify_id=' . $shopifyId);
        }
    }
}

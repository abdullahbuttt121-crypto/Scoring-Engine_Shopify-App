<?php namespace App\Jobs;

use stdClass;
use Illuminate\Support\Facades\Log;
use App\Models\User;
use App\Models\Products\Product;
use App\Models\Products\ProductScoreLog;
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
 * ProductsCreateJob
 *
 * Fired by Kyon when Shopify sends a products/create webhook.
 *
 * What this job does:
 *  1. Resolves the shop from the domain.
 *  2. Calls storeData() to save/upsert the product (existing behaviour).
 *  3. Updates the denormalized scoring fields that storeData() doesn't set:
 *     price, inventory_quantity, image_url, shopify_updated_at, synced_at.
 *  4. Dispatches CalculateProductScoreJob to score the new product.
 *
 * WHY STEP 3?
 * ────────────
 * storeData() / formatProductdata() saves the basic product fields from the
 * REST webhook payload. However, the scoring engine reads `price`,
 * `inventory_quantity`, and `image_url` which are denormalized columns added
 * for the scoring feature. We update those here so scoring has fresh data.
 */
class ProductsCreateJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, ResponseTrait, ShopifyProductTrait;

    /** @var ShopDomain|string */
    public $shopDomain;

    /** @var object The decoded webhook payload from Shopify */
    public $data;

    /** Maximum number of times this job should be retried on failure */
    public int $tries = 3;

    /** Seconds to wait before retrying after a failure */
    public int $backoff = 60;

    public function __construct($shopDomain, $data)
    {
        $this->shopDomain = $shopDomain;
        $this->data = $data;
    }

    public function handle(IShopQuery $shopQuery): void
    {
        // ── 1. Resolve the shop ───────────────────────────────────────────
        $this->shopDomain = ShopDomain::fromNative($this->shopDomain);
        $shop             = $shopQuery->getByDomain($this->shopDomain);
        $user             = User::where('name', $shop->name)->first();

        if (!$user) {
            Log::warning('[ProductsCreateJob] Shop not found: ' . $this->shopDomain->toNative());
            return;
        }

        $payload = $this->data;

        // ── 2. Save the product using the existing repository layer ───────
        $this->getProductRepository(app(ProductRepositoryInterface::class));

        if (!$this->storeData($payload, $user)) {
            Log::error('[ProductsCreateJob] storeData() failed for shopify_product_id: ' . ($payload->id ?? 'unknown'));
            return;
        }

        Log::info('[ProductsCreateJob] Product saved. shopify_product_id=' . $payload->id);

        // ── 3. Update denormalized scoring fields ─────────────────────────
        // storeData() does not set price / inventory_quantity / image_url.
        // We extract them from the REST webhook payload and update the row.
        $product = Product::where('user_id', $user->id)
            ->where('shopify_product_id', $payload->id)
            ->first();

        if ($product) {
            $this->updateScoringFields($product, $payload);

            // ── 4. Trigger score calculation ──────────────────────────────
            CalculateProductScoreJob::dispatch($product->id, ProductScoreLog::TRIGGER_WEBHOOK);
            Log::info('[ProductsCreateJob] Score calculation queued for product_id=' . $product->id);
        }
    }

    /**
     * Update the denormalized columns that the scoring service reads.
     * These are not populated by storeData() because they come from the
     * variants / images sub-arrays rather than the top-level product fields.
     *
     * @param  Product  $product  Local product record to update
     * @param  object   $payload  Decoded Shopify REST webhook payload
     */
    private function updateScoringFields(Product $product, object $payload): void
    {
        // price → minimum variant price (same logic as ProductSyncService)
        $minPrice = null;
        $totalInventory = 0;
        if (!empty($payload->variants)) {
            foreach ($payload->variants as $variant) {
                $variantPrice = isset($variant->price) ? (float) $variant->price : null;
                if ($variantPrice !== null && ($minPrice === null || $variantPrice < $minPrice)) {
                    $minPrice = $variantPrice;
                }
                $totalInventory += (int) ($variant->inventory_quantity ?? 0);
            }
        }

        // image_url → URL of the featured image (first image in the payload)
        $imageUrl = null;
        if (!empty($payload->image->src)) {
            $imageUrl = $payload->image->src;
        } elseif (!empty($payload->images[0]->src)) {
            $imageUrl = $payload->images[0]->src;
        }

        $product->update([
            'price'               => $minPrice,
            'inventory_quantity'  => $totalInventory,
            'image_url'           => $imageUrl,
            // Shopify sends updated_at as ISO-8601 in REST webhooks
            'shopify_updated_at'  => isset($payload->updated_at) ? $payload->updated_at : now(),
            'shopify_created_at'  => isset($payload->created_at) ? $payload->created_at : null,
            'synced_at'           => now(),
        ]);
    }
}

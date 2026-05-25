<?php
namespace App\Jobs;

use Illuminate\Support\Facades\Log;
use stdClass;
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
 * ProductsUpdateJob
 *
 * Fired by Kyon when Shopify sends a products/update webhook.
 *
 * What this job does:
 *  1. Resolves the shop from the domain.
 *  2. Calls storeData() to upsert the product fields (existing behaviour).
 *  3. Updates the denormalized scoring columns (price, inventory, image_url).
 *  4. Dispatches CalculateProductScoreJob so the score reflects the changes.
 *
 * IMPORTANT — duplicate prevention:
 * ────────────────────────────────────
 * Shopify can fire multiple update webhooks in quick succession (e.g. when a
 * merchant saves a product, Shopify may fire 2–3 update events). Since each
 * fires the same job, the DB upsert in storeData() is idempotent (same data =
 * no meaningful change), and CalculateProductScoreJob also writes idempotently.
 * The last run simply overwrites with the same values — no harm done.
 */
class ProductsUpdateJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, ShopifyProductTrait, ResponseTrait;

    /** @var ShopDomain|string */
    public $shopDomain;

    /** @var object Decoded Shopify REST webhook payload */
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
        // ── 1. Resolve shop ───────────────────────────────────────────────
        $this->shopDomain = ShopDomain::fromNative($this->shopDomain);
        $shop             = $shopQuery->getByDomain($this->shopDomain);
        $user             = User::where('name', $shop->name)->first();

        if (!$user) {
            Log::warning('[ProductsUpdateJob] Shop not found: ' . $this->shopDomain->toNative());
            return;
        }

        $payload = $this->data;

        // ── 2. Upsert the product (existing behaviour) ────────────────────
        $this->getProductRepository(app(ProductRepositoryInterface::class));

        if (!$this->storeData($payload, $user)) {
            Log::error('[ProductsUpdateJob] storeData() failed for shopify_product_id: ' . ($payload->id ?? 'unknown'));
            return;
        }

        Log::info('[ProductsUpdateJob] Product updated. shopify_product_id=' . $payload->id);

        // ── 3. Update scoring-specific denormalized fields ────────────────
        $product = Product::where('user_id', $user->id)
            ->where('shopify_product_id', $payload->id)
            ->first();

        if ($product) {
            $this->updateScoringFields($product, $payload);

            // ── 4. Recalculate score for this product ─────────────────────
            CalculateProductScoreJob::dispatch($product->id, ProductScoreLog::TRIGGER_WEBHOOK);
            Log::info('[ProductsUpdateJob] Score recalculation queued for product_id=' . $product->id);
        }
    }

    /**
     * Update price, inventory_quantity, image_url, and timestamps
     * from the Shopify REST webhook payload.
     *
     * These columns are read by ProductScoringService but are NOT
     * populated by the legacy storeData() / formatProductdata() method.
     */
    private function updateScoringFields(Product $product, object $payload): void
    {
        $minPrice       = null;
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

        $imageUrl = null;
        if (!empty($payload->image->src)) {
            $imageUrl = $payload->image->src;
        } elseif (!empty($payload->images[0]->src)) {
            $imageUrl = $payload->images[0]->src;
        }

        $product->update([
            'price'              => $minPrice,
            'inventory_quantity' => $totalInventory,
            'image_url'          => $imageUrl,
            'shopify_updated_at' => isset($payload->updated_at) ? $payload->updated_at : now(),
            'synced_at'          => now(),
        ]);
    }
}

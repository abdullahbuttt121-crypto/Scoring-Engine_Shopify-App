<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\ProductSyncService;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * SyncShopifyProductsJob
 *
 * WHAT THIS JOB DOES:
 * ────────────────────
 * Fetches all products from Shopify for a given shop and saves them locally.
 * Runs in the background queue so the merchant's browser doesn't have to wait.
 *
 * WHO DISPATCHES THIS JOB:
 * ─────────────────────────
 * ProductSyncController::store() — when the merchant clicks "Sync Products".
 *
 * HOW TO DISPATCH IT MANUALLY:
 * ─────────────────────────────
 *   SyncShopifyProductsJob::dispatch($userId);
 */
class SyncShopifyProductsJob implements ShouldQueue
{
    use Queueable;

    /**
     * How many times Laravel should retry this job if it fails.
     * After 3 attempts it will be marked as "failed" in the failed_jobs table.
     */
    public int $tries = 3;

    /**
     * Wait 60 seconds between retry attempts (backoff in seconds).
     */
    public int $backoff = 60;

    /** @var int The ID of the shop (User) to sync products for */
    protected int $userId;

    /**
     * @param int $userId  The User/Shop ID. Passed by the controller.
     */
    public function __construct(int $userId)
    {
        $this->userId = $userId;
    }

    /**
     * Execute the job.
     *
     * Laravel calls this method when a queue worker picks up the job.
     * 1. Load the shop (User model).
     * 2. Run ProductSyncService to pull products from Shopify.
     * 3. Log success or failure.
     */
    public function handle(): void
    {
        Log::info("[SyncShopifyProductsJob] Starting sync for user ID: {$this->userId}");

        // Load the shop from the database
        $user = User::find($this->userId);

        if (! $user) {
            Log::error("[SyncShopifyProductsJob] User #{$this->userId} not found. Aborting.");
            return;
        }

        try {
            // ProductSyncService does all the heavy lifting:
            // fetching pages from Shopify + saving to local DB
            $service = new ProductSyncService($user);
            $result  = $service->sync();

            Log::info(
                "[SyncShopifyProductsJob] Sync complete for user #{$this->userId}. " .
                "Synced: {$result['synced']}, Errors: {$result['errors']}, Total: {$result['total']}"
            );

        } catch (\Throwable $e) {
            Log::error("[SyncShopifyProductsJob] Sync failed for user #{$this->userId}. Error: " . $e->getMessage());
            // Re-throw so Laravel marks the job as failed and can retry it
            throw $e;
        }
    }
}

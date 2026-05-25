<?php

namespace App\Jobs;

use App\Models\User;
use App\Models\Products\Product;
use App\Models\Products\ProductScoreLog;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * RecalculateAllProductScoresJob
 *
 * WHAT THIS JOB DOES:
 * ────────────────────
 * Queues a CalculateProductScoreJob for EVERY product belonging to a shop.
 * This is a "fan-out" job — it does no heavy work itself, it just
 * dispatches many smaller jobs that each score one product.
 *
 * WHY FAN-OUT INSTEAD OF SCORING IN ONE LOOP:
 * ────────────────────────────────────────────
 * Imagine a shop with 5,000 products. Scoring them all in one job would:
 * - Hog the queue for minutes/hours.
 * - Time out if the server has a max execution limit.
 * - Fail everything if one product causes an error.
 *
 * Fan-out solves this by dispatching one small job per product.
 * Each job is independent, can be retried individually, and the
 * queue workers can process many of them in parallel.
 *
 * WHO DISPATCHES THIS JOB:
 * ─────────────────────────
 * ProductScoreController::recalculateAll() — when the merchant clicks
 * "Rescore All Products".
 *
 * HOW TO DISPATCH IT MANUALLY:
 * ─────────────────────────────
 *   RecalculateAllProductScoresJob::dispatch($userId);
 */
class RecalculateAllProductScoresJob implements ShouldQueue
{
    use Queueable;

    /** @var int The shop/user ID to rescore all products for */
    protected int $userId;

    public function __construct(int $userId)
    {
        $this->userId = $userId;
    }

    /**
     * Execute the job.
     *
     * Loads all non-deleted products for the shop and dispatches
     * one CalculateProductScoreJob per product.
     */
    public function handle(): void
    {
        Log::info("[RecalculateAllProductScoresJob] Starting fan-out for user #{$this->userId}");

        $user = User::find($this->userId);

        if (! $user) {
            Log::error("[RecalculateAllProductScoresJob] User #{$this->userId} not found. Aborting.");
            return;
        }

        // Load all active (non-deleted) products for this shop.
        // We only need the 'id' column — the child job loads the full product.
        // Using chunk() avoids loading thousands of rows into memory at once.
        $dispatched = 0;

        Product::where('user_id', $this->userId)
            ->whereNull('deleted_at')           // exclude soft-deleted products
            ->select('id')                      // only need the ID
            ->chunk(100, function ($products) use (&$dispatched) {
                foreach ($products as $product) {
                    // Dispatch one scoring job per product
                    // The trigger 'rescore_all' is stored in the score log
                    CalculateProductScoreJob::dispatch(
                        $product->id,
                        ProductScoreLog::TRIGGER_RESCORE_ALL
                    );
                    $dispatched++;
                }
            });

        Log::info("[RecalculateAllProductScoresJob] Dispatched {$dispatched} scoring job(s) for user #{$this->userId}");
    }
}

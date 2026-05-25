<?php

namespace App\Jobs;

use App\Models\Products\Product;
use App\Services\ProductScoringService;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * CalculateProductScoreJob
 *
 * WHAT THIS JOB DOES:
 * ────────────────────
 * Scores a single product using the ProductScoringService.
 * Runs in the background queue.
 *
 * WHO DISPATCHES THIS JOB:
 * ─────────────────────────
 * - RecalculateAllProductScoresJob  (once per product, fan-out)
 * - ProductScoreController::recalculate()  (single product, on-demand)
 *
 * HOW TO DISPATCH IT MANUALLY:
 * ─────────────────────────────
 *   CalculateProductScoreJob::dispatch($productId, 'manual');
 */
class CalculateProductScoreJob implements ShouldQueue
{
    use Queueable;

    /** Retry up to 3 times on failure */
    public int $tries = 3;

    /** @var int  The product to score */
    protected int $productId;

    /**
     * @var string  What triggered this scoring run.
     *              Use ProductScoreLog::TRIGGER_* constants.
     */
    protected string $trigger;

    /**
     * @param int    $productId
     * @param string $trigger   e.g. 'manual', 'sync', 'webhook', 'rescore_all'
     */
    public function __construct(int $productId, string $trigger = 'manual')
    {
        $this->productId = $productId;
        $this->trigger   = $trigger;
    }

    /**
     * Execute the job.
     *
     * 1. Load the product from the database.
     * 2. Run ProductScoringService to evaluate all rules and save scores.
     * 3. Log the result.
     */
    public function handle(): void
    {
        Log::info("[CalculateProductScoreJob] Scoring product #{$this->productId} (trigger: {$this->trigger})");

        $product = Product::find($this->productId);

        if (! $product) {
            Log::warning("[CalculateProductScoreJob] Product #{$this->productId} not found. Skipping.");
            return;
        }

        try {
            $service = new ProductScoringService();
            $result  = $service->scoreProduct($product, $this->trigger);

            Log::info(
                "[CalculateProductScoreJob] Done. Product #{$this->productId} " .
                "score: {$result['score']} ({$result['level']}). " .
                "Changed: " . ($result['score_changed'] ? 'yes' : 'no')
            );

        } catch (\Throwable $e) {
            Log::error("[CalculateProductScoreJob] Failed for product #{$this->productId}. Error: " . $e->getMessage());
            throw $e;
        }
    }
}

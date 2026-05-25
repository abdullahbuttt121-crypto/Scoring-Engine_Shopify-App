<?php

namespace App\Http\Controllers;

use App\Models\Products\Product;
use App\Models\Products\ProductScoreLog;
use App\Models\User;
use App\Services\ProductScoringService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * ProductScoreController
 *
 * Handles score-related actions initiated from the merchant dashboard.
 * Both actions run synchronously so scores appear immediately after clicking.
 *
 * Routes:
 *   POST /products/{id}/recalculate-score  → score one product now
 *   POST /scores/recalculate-all           → score all shop products now
 */
class ProductScoreController extends Controller
{
    /**
     * Recalculate the score for a single product immediately.
     *
     * Called by: POST /products/{id}/recalculate-score
     *
     * @param  int $id  The local product ID (not the Shopify GID)
     */
    public function recalculate(Request $request, int $id)
    {
        /** @var User $user */
        $user = Auth::user();

        $product = Product::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (! $product) {
            return response()->json([
                'success' => false,
                'message' => 'Product not found.',
            ], 404);
        }

        try {
            $service = new ProductScoringService();
            $result  = $service->scoreProduct($product, ProductScoreLog::TRIGGER_MANUAL);

            return response()->json([
                'success' => true,
                'message' => "Score recalculated for \"{$product->title}\": {$result['score']} pts ({$result['level']})",
                'data'    => $result,
            ]);

        } catch (\Throwable $e) {
            Log::error('[ProductScoreController] Single rescore failed: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Scoring failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Recalculate scores for every product in the shop immediately.
     *
     * Called by: POST /scores/recalculate-all
     */
    public function recalculateAll(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();

        $service = new ProductScoringService();
        $scored  = 0;
        $errors  = 0;

        try {
            Product::where('user_id', $user->id)
                ->whereNull('deleted_at')
                ->chunk(50, function ($products) use ($service, &$scored, &$errors) {
                    foreach ($products as $product) {
                        try {
                            $service->scoreProduct($product, ProductScoreLog::TRIGGER_RESCORE_ALL);
                            $scored++;
                        } catch (\Throwable $e) {
                            Log::error("[ProductScoreController] Failed to score product #{$product->id}: " . $e->getMessage());
                            $errors++;
                        }
                    }
                });

            $message = "Scoring complete. {$scored} product(s) scored.";
            if ($errors > 0) {
                $message .= " {$errors} failed — check storage/logs/laravel.log.";
            }

            return response()->json([
                'success' => true,
                'message' => $message,
                'data'    => ['scored' => $scored, 'errors' => $errors],
            ]);

        } catch (\Throwable $e) {
            Log::error('[ProductScoreController] Rescore all failed: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Scoring failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}

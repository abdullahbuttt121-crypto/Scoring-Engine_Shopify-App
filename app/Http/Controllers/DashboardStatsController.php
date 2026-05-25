<?php

namespace App\Http\Controllers;

use App\Models\Products\Product;
use App\Models\Products\ProductScore;
use App\Models\Products\ProductScoreLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * DashboardStatsController
 *
 * Provides a single summary API endpoint for the top of the React dashboard.
 *
 * Route:
 *   GET /dashboard/stats
 *
 * Returns counts by priority level, average score, and timing info —
 * everything the "stats bar" at the top of the page needs in one request.
 */
class DashboardStatsController extends Controller
{
    /**
     * GET /dashboard/stats
     *
     * All counts are scoped to the authenticated shop (user_id).
     *
     * Response shape:
     * {
     *   "data": {
     *     "total_products":               150,
     *     "critical_priority_products":   5,
     *     "high_priority_products":       30,
     *     "medium_priority_products":     60,
     *     "low_priority_products":        55,
     *     "unscored_products":            0,
     *     "average_score":                42,
     *     "last_sync_time":               "2026-05-13T10:00:00Z",
     *     "last_score_calculation_time":  "2026-05-13T10:05:00Z"
     *   }
     * }
     */
    public function index(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();

        // ── Product counts ────────────────────────────────────────────────
        // Base scope: non-deleted products for this shop
        $base = Product::where('user_id', $user->id)->whereNull('deleted_at');

        $totalProducts = (clone $base)->count();

        // Score-level counts use the denormalized `score` column on products.
        // These thresholds match ProductScore::levelFromScore() exactly.
        // NOTE: score has default(0) in the migration — it is NEVER null.
        // We use score_breakdown IS NULL as the reliable "not yet scored" check:
        //   score_breakdown = NULL   → product has never been through the scoring engine
        //   score_breakdown = []     → scored, but zero rules matched (score = 0)
        // The four level counts exclude unscored products (score_breakdown IS NULL)
        // so they don't inflate the "Low" bucket with fresh-synced products.
        $criticalCount = (clone $base)->where('score', '>', 100)->whereNotNull('score_breakdown')->count();
        $highCount     = (clone $base)->whereBetween('score', [61, 100])->whereNotNull('score_breakdown')->count();
        $mediumCount   = (clone $base)->whereBetween('score', [31, 60])->whereNotNull('score_breakdown')->count();
        $lowCount      = (clone $base)->where('score', '<=', 30)->whereNotNull('score_breakdown')->count();

        // Products that exist but have never been scored yet
        $unscoredCount = (clone $base)->whereNull('score_breakdown')->count();

        $outOfStockCount = (clone $base)->where('inventory_quantity', '<=', 0)->count();
        $lowInventoryCount = (clone $base)
            ->where('inventory_quantity', '>', 0)
            ->where('inventory_quantity', '<', 10)
            ->count();

        // ── Average score ─────────────────────────────────────────────────
        // Only average across products that HAVE been scored (score is not null)
        // Only average scored products (score_breakdown not null = has been scored)
        $avgScore = (clone $base)
            ->whereNotNull('score_breakdown')
            ->avg('score');

        $averageScore = $avgScore !== null ? (int) round($avgScore) : null;

        // ── Timing info ───────────────────────────────────────────────────
        // Last sync time = the most recent synced_at value across all products
        $lastSyncTime = (clone $base)
            ->whereNotNull('synced_at')
            ->max('synced_at');

        // Last score calculation time = the most recent log entry for this shop
        $lastScoreTime = ProductScoreLog::where('shop_id', $user->id)
            ->max('created_at');

        // Build a compact top reasons list from scored products.
        $reasonCounts = [];
        $reasonRows = (clone $base)
            ->whereNotNull('score_breakdown')
            ->select('score_breakdown')
            ->get();

        foreach ($reasonRows as $row) {
            $reasons = is_array($row->score_breakdown) ? $row->score_breakdown : [];
            foreach ($reasons as $reason) {
                $clean = trim((string) preg_replace('/\s*\[[^\]]+\]\s*$/', '', (string) $reason));
                if ($clean === '') {
                    continue;
                }
                $reasonCounts[$clean] = ($reasonCounts[$clean] ?? 0) + 1;
            }
        }

        arsort($reasonCounts);
        $topReasons = collect($reasonCounts)
            ->take(5)
            ->map(fn ($count, $reason) => [
                'reason' => $reason,
                'count'  => $count,
            ])
            ->values()
            ->all();

        return response()->json([
            'data' => [
                'total_products'              => $totalProducts,
                'critical_priority_products'  => $criticalCount,
                'high_priority_products'      => $highCount,
                'medium_priority_products'    => $mediumCount,
                'low_priority_products'       => $lowCount,
                'unscored_products'           => $unscoredCount,
                'out_of_stock_products'       => $outOfStockCount,
                'low_inventory_products'      => $lowInventoryCount,
                'top_scoring_reasons'         => $topReasons,
                'average_score'              => $averageScore,
                // Format as ISO 8601 string, or null if never synced/scored
                'last_sync_time'              => $lastSyncTime
                    ? \Illuminate\Support\Carbon::parse($lastSyncTime)->toISOString()
                    : null,
                'last_score_calculation_time' => $lastScoreTime
                    ? \Illuminate\Support\Carbon::parse($lastScoreTime)->toISOString()
                    : null,
            ],
        ]);
    }
}

<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ProductSyncController;
use App\Http\Controllers\ProductScoreController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\DashboardStatsController;
use App\Http\Controllers\ProductScoringDashboardController;
use App\Http\Controllers\ScoringRuleController;

Route::group(['middleware' => ['verify.embedded', 'verify.shopify']], function () {

    // ── Root route → Product Scoring Inertia page ───────────────────────────
    Route::get('/', [ProductScoringDashboardController::class, 'index'])->name('home');

    // ── Product Scoring Dashboard (Inertia page) ──────────────────────────
    // GET /scoring  → loads the React Products/Index.jsx page
    Route::get('/scoring', [ProductScoringDashboardController::class, 'index'])->name('scoring');

    // ── Product Analytics (Inertia page) ───────────────────────────────────
    // GET /products-analytics → loads the React Products/Analytics.jsx page
    Route::get('/products-analytics', [ProductScoringDashboardController::class, 'analyticsPage'])->name('products-analytics.page');

    // ── Product sync ──────────────────────────────────────────────────────
    // POST /products/sync  → queues SyncShopifyProductsJob
    Route::post('/products/sync', [ProductSyncController::class, 'store'])->name('products.sync');

    // ── Product data APIs (read-only) ─────────────────────────────────────
    // GET /products          → paginated list with filters + sorting
    // GET /products/{id}     → single product with score details + history
    Route::get('/products',       [ProductController::class, 'index'])->name('products.index');
    Route::get('/products/{id}',  [ProductController::class, 'show'])->name('products.show');

    // ── Product scoring ───────────────────────────────────────────────────
    // POST /products/{id}/recalculate-score  → queue scoring for one product
    Route::post('/products/{id}/recalculate-score', [ProductScoreController::class, 'recalculate'])->name('products.recalculate-score');

    // POST /scores/recalculate-all  → queue scoring for ALL shop products
    Route::post('/scores/recalculate-all', [ProductScoreController::class, 'recalculateAll'])->name('scores.recalculate-all');

    // ── Dashboard stats ───────────────────────────────────────────────────
    // GET /dashboard/stats  → summary counts + timing for the stats bar
    Route::get('/dashboard/stats', [DashboardStatsController::class, 'index'])->name('dashboard.stats');

    // ── Scoring rules management (JSON API) ───────────────────────────────
    // GET    /scoring-rules        → list all rules for this shop
    // POST   /scoring-rules        → create a new rule
    // PUT    /scoring-rules/{id}   → update (or clone-and-update if global)
    // DELETE /scoring-rules/{id}   → delete own rule / disable global rule
    Route::get('/scoring-rules',         [ScoringRuleController::class, 'index'])->name('scoring-rules.index');
    Route::post('/scoring-rules',        [ScoringRuleController::class, 'store'])->name('scoring-rules.store');
    Route::put('/scoring-rules/{id}',    [ScoringRuleController::class, 'update'])->name('scoring-rules.update');
    Route::delete('/scoring-rules/{id}', [ScoringRuleController::class, 'destroy'])->name('scoring-rules.destroy');

    // ── Scoring Rules Inertia page ────────────────────────────────────────
    Route::get('/scoring-rules-page', [ProductScoringDashboardController::class, 'rulesPage'])->name('scoring-rules.page');

    Route::get('/webhook' , function () {
        $user = auth()->user();
        $shop = $user->api()->rest('GET', '/admin/api/2025-07/webhooks.json');
        return response()->json(['webhook' => $shop]);
    })->name('webhook');

});

require __DIR__ . '/auth.php';

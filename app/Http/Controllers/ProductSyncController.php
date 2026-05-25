<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\ProductSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * ProductSyncController
 *
 * Handles the manual "Sync Products" button that merchants click
 * in the embedded Shopify dashboard.
 *
 * Runs synchronously (no queue) so the merchant sees the real result immediately
 * and the UI can reload with all synced products right away.
 */
class ProductSyncController extends Controller
{
    /**
     * Run a full product sync for the currently authenticated shop.
     *
     * Called by: POST /products/sync
     * Returns:   JSON with synced/errors counts so the UI can show real feedback.
     */
    public function store(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();

        try {
            $service = new ProductSyncService($user);
            $result  = $service->sync();

            $message = "Sync complete. {$result['synced']} products synced.";
            if ($result['errors'] > 0) {
                $message .= " {$result['errors']} product(s) failed — check storage/logs/laravel.log.";
            }

            return response()->json([
                'success' => true,
                'message' => $message,
                'data'    => $result,
            ]);

        } catch (\Throwable $e) {
            Log::error('[ProductSyncController] Sync failed: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Sync failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}

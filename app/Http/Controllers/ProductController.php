<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProductResource;
use App\Models\Products\Product;
use App\Models\User;
use App\Support\ScoringConfig;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * ProductController
 *
 * Provides read-only product data to the React dashboard.
 *
 * Routes:
 *   GET /products          → paginated, filterable, sortable product list
 *   GET /products/{id}     → single product with score details + history
 */
class ProductController extends Controller
{
    /**
     * GET /products
     *
     * Returns a paginated list of products for the authenticated shop.
     * Supports filtering, searching, and sorting.
     *
     * Query parameters accepted:
     * ─────────────────────────────────────────────────────────────────
     *   search          string  Free-text search on title/handle/vendor/tags
     *   score_level     string  Filter by level: low | medium | high | critical
     *   status          string  Filter by Shopify status: active | draft | archived
     *   vendor          string  Filter by vendor name
     *   product_type    string  Filter by product type (exact)
     *   inventory_issue string  out_of_stock | low_stock | no_issue
     *   inventory_min   int     Minimum inventory quantity
     *   inventory_max   int     Maximum inventory quantity
     *   price_min       float   Minimum price
     *   price_max       float   Maximum price
     *   sort_by         string  Column to sort by (see $allowedSorts below)
     *   sort_direction  string  asc | desc (default: desc)
     *   page            int     Page number (default: 1)
     * ─────────────────────────────────────────────────────────────────
     *
     * Response shape:
     * {
     *   "data": [ { product + score_info } ],
     *   "meta": { current_page, total, per_page, last_page }
     * }
     */
    public function index(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();

        // Build the base query — always scope to the authenticated shop
        $query = Product::query()
            ->where('user_id', $user->id)
            ->whereNull('deleted_at')
            // Eager-load the current score row to avoid N+1 queries.
            // Without with(), each product card would fire a separate DB query
            // to get the score — 100 products = 101 queries. with() = 2 queries.
            ->with('productScore');

        // Apply all filters
        $this->applyFilters($query, $request);

        // Apply sorting
        $this->applySorting($query, $request);

        // Paginate — default 25 per page, allow safe override via query string
        $perPage = (int) $request->input('per_page', 10);
        $perPage = max(1, min($perPage, 100));
        $products = $query->paginate($perPage)->withQueryString();

        // Transform and return
        // ProductResource::collection() runs each product through ProductResource::toArray()
        // ->response() wraps it in the standard Laravel resource JSON envelope
        return ProductResource::collection($products)->response();
    }

    /**
     * GET /products/{id}
     *
     * Returns full detail for a single product:
     * - All product fields
     * - Current score + level + reasons (score_info)
     * - Last 10 scoring events (score_logs)
     *
     * Response shape:
     * {
     *   "data": {
     *     ...product fields...,
     *     "score_info": { score, level, reasons, calculated_at },
     *     "score_logs": [ { old_score, new_score, reasons, calculated_by, logged_at }, ... ]
     *   }
     * }
     */
    public function show(Request $request, int $id)
    {
        /** @var User $user */
        $user = Auth::user();

        // Load the product with both score relationships.
        // The `scoreHistory` is limited to 10 rows, ordered newest-first.
        // We add the constraint via a closure on with() so it's applied in SQL,
        // not in PHP — this avoids loading all logs then slicing.
        $product = Product::where('id', $id)
            ->where('user_id', $user->id)       // security: scope to this shop
            ->whereNull('deleted_at')
            ->with([
                'productScore',
                'scoreHistory' => function ($query) {
                    $query->orderByDesc('created_at')->limit(10);
                },
            ])
            ->first();

        if (! $product) {
            return response()->json([
                'success' => false,
                'message' => 'Product not found.',
            ], 404);
        }

        return (new ProductResource($product))->response();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE — FILTER & SORT HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply all requested filters to the query builder.
     *
     * HOW FILTERS WORK:
     * ──────────────────
     * Each filter adds a WHERE clause to the Eloquent query.
     * Filters are only applied when the request actually contains that parameter
     * (using `$request->filled()` which checks for non-null, non-empty values).
     * This means passing no filters returns ALL products.
     *
     * SCORE LEVEL FILTER:
     * The score_level (low/medium/high/critical) is stored in product_scores table,
     * but we also cache the numeric score on products.score. We convert the level
     * name into a numeric range and filter on products.score directly.
     * This avoids a JOIN and is accurate because ProductScoringService always
     * keeps both columns in sync.
     *
     * @param  \Illuminate\Database\Eloquent\Builder  $query
     */
    private function applyFilters($query, Request $request): void
    {
        // ── Free-text search ──────────────────────────────────────────────
        // Searches across title, handle, vendor, and tags.
        // Uses LIKE '%term%' which is case-insensitive in MySQL by default.
        if ($request->filled('search')) {
            $term = '%'.$request->input('search').'%';
            $query->where(function ($q) use ($term) {
                $q->where('title', 'LIKE', $term)
                    ->orWhere('handle', 'LIKE', $term)
                    ->orWhere('vendor', 'LIKE', $term)
                    ->orWhere('tags', 'LIKE', $term)
                    ->orWhere('product_type', 'LIKE', $term);
            });
        }

        // ── Score level filter ────────────────────────────────────────────
        // Convert level name → numeric score range, then filter products.score.
        if ($request->filled('score_level')) {
            $query->where(function ($q) use ($request) {
                ScoringConfig::applyLevelRange($q, $request->input('score_level'));
            });
        }

        // ── Exact match filters ───────────────────────────────────────────
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('vendor')) {
            $query->where('vendor', 'LIKE', '%'.$request->input('vendor').'%');
        }

        if ($request->filled('product_type')) {
            $query->where('product_type', $request->input('product_type'));
        }

        if ($request->filled('inventory_issue')) {
            $issue = $request->input('inventory_issue');
            if ($issue === 'out_of_stock') {
                $query->where('inventory_quantity', '<=', 0);
            } elseif ($issue === 'low_stock') {
                $query->where('inventory_quantity', '>', 0)
                    ->where('inventory_quantity', '<', 10);
            } elseif ($issue === 'no_issue') {
                $query->where('inventory_quantity', '>=', 10);
            }
        }

        // ── Numeric range filters ─────────────────────────────────────────
        if ($request->filled('inventory_min')) {
            $query->where('inventory_quantity', '>=', (int) $request->input('inventory_min'));
        }

        if ($request->filled('inventory_max')) {
            $query->where('inventory_quantity', '<=', (int) $request->input('inventory_max'));
        }

        if ($request->filled('price_min')) {
            $query->where('price', '>=', (float) $request->input('price_min'));
        }

        if ($request->filled('price_max')) {
            $query->where('price', '<=', (float) $request->input('price_max'));
        }
    }

    /**
     * Apply sorting to the query builder.
     *
     * HOW SORTING WORKS:
     * ───────────────────
     * We maintain an explicit whitelist of allowed sort columns ($allowedSorts).
     * If the requested sort_by value is NOT in the whitelist, we fall back to
     * the default (score DESC). This prevents SQL injection via the sort_by param.
     *
     * sort_by     → the column to sort on (mapped through $allowedSorts)
     * sort_direction → 'asc' or 'desc' (any other value defaults to 'desc')
     *
     * @param  \Illuminate\Database\Eloquent\Builder  $query
     */
    private function applySorting($query, Request $request): void
    {
        // Whitelist: maps friendly names (from React) → actual DB column names
        // This is the ONLY defence against SQL injection on this parameter.
        $allowedSorts = [
            'score' => 'score',
            'title' => 'title',
            'price' => 'price',
            'inventory' => 'inventory_quantity',
            'updated_at' => 'shopify_updated_at',
            'created_at' => 'shopify_created_at',
            'synced_at' => 'synced_at',
        ];

        $sortBy = $request->input('sort_by', 'score');
        $sortBy = $allowedSorts[$sortBy] ?? 'score';  // fall back if not in whitelist

        // Only allow 'asc' or 'desc' — everything else becomes 'desc'
        $sortDir = $request->input('sort_direction', 'asc');
        $sortDir = in_array($sortDir, ['asc', 'desc']) ? $sortDir : 'desc';

        $query->orderBy($sortBy, $sortDir);

        // Keep highest-risk ordering deterministic when scores are equal.
        if ($sortBy === 'score') {
            $query->orderByRaw('COALESCE(shopify_updated_at, synced_at, created_at) DESC');
        }
    }
}

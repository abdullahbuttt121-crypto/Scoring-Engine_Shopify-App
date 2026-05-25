<?php

namespace App\Http\Controllers;

use App\Http\Traits\ResponseTrait;

/**
 * ProductScoringDashboardController
 *
 * Renders the React "Product Scoring" Inertia page.
 *
 * This controller has a single job: return the Inertia page.
 * All data loading happens client-side via the JSON APIs
 * (ProductController, DashboardStatsController).
 *
 * Route: GET /scoring
 *
 * ResponseTrait::render() automatically prefixes the component path with
 * "Embedded/" when SHOPIFY_APPBRIDGE_ENABLED=true, so:
 *   $this->render('Products/Index')
 *   → loads resources/js/Pages/Embedded/Products/Index.jsx
 */
class ProductScoringDashboardController extends Controller
{
    use ResponseTrait;

    public function index()
    {
        return $this->render('Products/Index');
    }

    /**
     * Renders the Scoring Rules management page.
     * Route: GET /scoring-rules-page
     * Loads: resources/js/Pages/Embedded/ScoringRules/Index.jsx
     */
    public function rulesPage()
    {
        return $this->render('ScoringRules/Index');
    }
}

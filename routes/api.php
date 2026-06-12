<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;


use App\Http\Controllers\Exercise_1;
use App\Http\Controllers\Exercise_2;
use App\Http\Controllers\Exercise_3;
use App\Http\Controllers\Exercise_4;
use App\Http\Controllers\Exercise_5;
use App\Http\Controllers\Exercise_6;
use App\Http\Controllers\Exercise_7;
use App\Http\Controllers\Exercise_8;
use App\Http\Controllers\Exercise_9;
use App\Http\Controllers\Exercise_10;
use App\Http\Controllers\Exercise_11;
use App\Http\Controllers\Exercise_12;
use App\Http\Controllers\Exercise_13;
use App\Http\Controllers\Exercise_14;
use App\Http\Controllers\Exercise_15;
use App\Http\Controllers\Exercise_16;
use App\Http\Controllers\Exercise_17;
use App\Http\Controllers\Exercise_18;
use App\Http\Controllers\Exercise_19;
use App\Http\Controllers\Exercise_20;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::post("/exercise-1-artwork-version" , [Exercise_1::class, 'ArtworkVersion']);
Route::post("/exercise-2-tier-pricing" , [Exercise_2::class, 'PriceSelector']);
Route::post("/exercise-3-cart-validator" , [Exercise_3::class, 'cartValidator']);
Route::post("/exercise-4-vendor-allocation" , [Exercise_4::class, 'vendorAllocation']);
Route::post("/exercise-5-discount", [Exercise_5::class , "discountCalculator"]);
Route::post("/exercise-6-approval-flow", [Exercise_6::class , "approvalFlow"]);
Route::post("/exercise-7-inventory", [Exercise_7::class , "inventoryManagement"]);
Route::post("/exercise-8-shipment", [Exercise_8::class , "shipmentFlow"]);
Route::post("/exercise-9-webhook", [Exercise_9::class , "webhookHandler"]);
Route::post("/exercise-10-quote-expiry", [Exercise_10::class , "dateChecker"]);
Route::post("/exercise-11-product-visibility", [Exercise_11::class , "productVisibility"]);
Route::post("/exercise-12-bundle-pricing", [Exercise_12::class , "bundlePrice"]);
Route::post("/exercise-13-cart-merge", [Exercise_13::class , "cartMerge"]);
Route::post("/exercise-14-upsell", [Exercise_14::class , "upsellHandler"]);
Route::post("/exercise-15-shipping-rule", [Exercise_15::class , "shippingRuleHandler"]);
Route::post("/exercise-16-fraud-check", [Exercise_16::class , "fraudCheckHandler"]);
Route::post("/exercise-17-shopify-price-adjustment", [Exercise_17::class , "PriceShopifyAdjustment"]);
Route::post("/exercise-18-data-sync", [Exercise_18::class , "dataSync"]);
Route::post("/exercise-19-variant-control", [Exercise_19::class , "variantControl"]);
Route::post("/exercise-20-order-state", [Exercise_20::class , "orderState"]);

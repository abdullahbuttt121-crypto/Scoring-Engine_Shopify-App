<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_5 extends Controller
{
    public function discountCalculator(Request $request) {
        $request->validate([
            'input' => "array|required",
            'input.price' => "integer|required",
            'input.discounts' => "array|required",
            'input.discounts.*.type' => "string|required|in:percentage,flat",
            'input.discounts.*.value' => "integer|required",
        ]);

        $input = $request['input'];
        $price = $input['price'];
        $discounts = $input['discounts'];

        $totalDiscounts = [];
        foreach($discounts as $discount) {      
            if($discount["type"] === "percentage"){
                $totalDiscounts[] = $price - ($price * $discount["value"] / 100);
            } elseif($discount["type"] === "flat"){
                $totalDiscounts[] = $price - $discount["value"];
            }
        }

        $finalPrice = min($totalDiscounts);
        
        if($finalPrice < 0){
            $finalPrice = 0;
        }
        
        return response()->json([
            "success" => true,
            "data" => ["final_price" => $finalPrice],
            "error" => null
        ]);
    }
}

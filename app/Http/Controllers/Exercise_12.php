<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_12 extends Controller
{
    public function bundlePrice(Request $request){
        $request->validate([
            "input" => "required|array",
            'input.bundle_price' => 'required|numeric|gt:0',
            "input.apply_bundle" => "required|boolean",
            "input.items.*.id" => "required|integer",
            "input.items.*.price" => "required|numeric|gt:0",
        ]);

        $input = $request->input('input');
        $items = $input['items'];
        $bundlePrice = $input['bundle_price'];
        $applyBundle = $input['apply_bundle'];
        $totalPrice = 0;
        $appliedbundlePrice = 0;

        foreach ($items as $item) {
            $itemPrice = $item['price'];
            $totalPrice += $itemPrice;
        }

        if ($applyBundle) {
            $appliedbundlePrice = $totalPrice - $bundlePrice;
        }

        if($applyBundle && $appliedbundlePrice >= 0){
            return response()->json([
                'success' => true ,
                'data' => ["final_price" => $bundlePrice],
                'error' => null
            ]);
        }
        return response()->json([
            'success' => true ,
            'data' => ["final_price" => $totalPrice],
            'error' => null
        ]);
    }
}

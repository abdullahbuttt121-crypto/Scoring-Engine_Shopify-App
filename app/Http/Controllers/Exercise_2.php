<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_2 extends Controller
{
    public function PriceSelector(Request $request) {
        $request->validate([
            'input' => 'required|array',
            'input.quantity' => 'required|integer',
            'input.tiers' => 'required|array',
            'input.tiers.*.min' => 'required|integer',
            'input.tiers.*.price' => 'required|numeric',
        ]);
        $input = $request->input;
        $cutie = $input['quantity'];
        $tiers = collect($input['tiers']);

        $bestPrice = $tiers->filter(function($item) use ($cutie){
            return $item['min'] <= $cutie;
        })->sortBy('min')->last();

        if($bestPrice){
            return response()->json([
                'success' => true,
                'data' => ['price' => $bestPrice['price']],
                'error' => null,
            ]);
        } else {
            return response()->json([
                'success' => false,
                'message' => 'No Valid Input Found',
                'error' => null,
            ]);
        }
    }
}
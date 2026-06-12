<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;


class Exercise_17 extends Controller
{
    public function PriceShopifyAdjustment(Request $request)
    {
        $request->validate([
            'input.prices' => 'required|array|min:1',
            'input.prices.*' => 'required|array|min:1',
            'input.prices.*.*' => 'required|integer',
            'input.adjustment_value' => 'required|integer|min:1',
        ]);
        // Flatten matrix
        $prices = collect($request->input('input.prices'))
            ->flatten()
            ->sort()
            ->values();

        $adjustmentValue = $request->input('input.adjustment_value');

        $basedNode = $prices[0];
        // logger("basedNode => " . $basedNode);
        foreach ($prices as $p) {
            if (($p - $basedNode) % $adjustmentValue != 0) {
                // logger(1);
                return response()->json([
                    'success' => true,
                    'data' => [
                        'minimum_operations' => -1
                    ],
                    'error' => null
                ]);
            }
        }

        $target = $prices[(int) floor($prices->count() / 2)];
        // logger("target => " . $target);
        $operations = $prices->sum(function ($p) use ($target, $adjustmentValue) {
            // logger("p => " . $p);
            return abs($p - $target) / $adjustmentValue;
        });
        // logger("operation => " . json_encode($operations));
        return response()->json([
            'success' => true,
            'data' => ['minimum_operations' => $operations],
            'error' => null
        ]);
    }

}

<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_18 extends Controller
{
    public function dataSync(Request $request)
    {
        $request->validate([
            "input" => "required",
            "input.shopify" => "nullable",
            "input.shopify.price" => "required|numeric",
            "input.shopify.updated_at" => "required|numeric",
            "input.internal" => "nullable",
            "input.internal.updated_at" => "required|numeric",
            "input.internal.price" => "required|numeric",
        ]);
        $input = $request->input('input');
        $output = [];
        foreach ($input as $type => $item) {
            $output[] = [
                'type' => $type,
                'price' => $item['price'],
                'updated_at' => $item['updated_at']
            ];
        }

        $maxUpdate = collect($output)->max('updated_at');  
        $output = collect($output)->where('updated_at', $maxUpdate)->pluck('price')->first();

        return response()->json([
            'success' => true,
            'data' => [
                'price' => $output
            ],
            'error' => null
        ]);
    }
}

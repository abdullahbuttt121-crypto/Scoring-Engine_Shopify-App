<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_19 extends Controller
{
    public function variantControl(Request $request)
    {
        $data = $request->validate([
            'input.options' => ['required', 'array'],
            'input.options.*.name' => ['required', 'string'],
            'input.options.*.values' => ['required', 'integer', 'min:1'],
            'input.limit' => ['required', 'integer', 'min:1'],
        ]);

        $options = $data['input']['options'];
        $limit = $data['input']['limit'];

        $totalCombinations = 1;

        foreach ($options as $option) {
            $totalCombinations *= $option['values'];
        }

        return response()->json([
            'total_combinations' => $totalCombinations,
            'limit' => $limit,
            'limit_exceeded' => $totalCombinations > $limit,
        ]);
    }
}

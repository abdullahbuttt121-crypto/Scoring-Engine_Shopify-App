<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_14 extends Controller
{
    public function upsellHandler(Request $request)
    {
        $request->validate([
            'input' => 'required|array',
            'input.nums' => 'required|array',
            'input.target' => 'required|integer',
        ]);

        $nums = $request->input('input.nums');
        $target = $request->input('input.target');

        $index = [];
        foreach ($nums as $key => $num) {
            foreach ($nums as $key1 => $num1) {
                if ($num + $num1 == $target) {
                    $index[] = $key;
                    $index[] = $key1;
                    return response()->json([
                        'success' => true,
                        'data' => $index,
                        'error' => null
                    ]);
                }
            }
        }
        if (count($index) <= 1) {
            return response()->json([
                'success' => false,
                'data' => null,
                'error' => 'No valid pairs found'
            ]);
        }

    }
}

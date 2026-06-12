<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_20 extends Controller
{
    public function orderState(Request $request)
    {
        $request->validate([
            'input' => 'required',
            'input.transitions' => 'required|array',
            'input.transitions.*' => 'nullable|string|in:created,paid,processing,shipped,delivered',
        ]);

        $input = $request->input('input');
        $transitions = $input['transitions'];

        $validTransitions = [
            0 => "created",
            1 => "paid",
            2 => "processing",
            3 => "shipped",
            4 => "delivered"
        ];
        
        foreach ($transitions as $key => $transition) {
            if($transition == $validTransitions[$key]) {
                continue;
            } else {
                return response()->json([
                    "success" => false,
                    'Valid_Sequence' => false,
                    'error' => "Invalid transition at index $key. Expected: " . $validTransitions[$key] . ", got: " . $transition
                ]);
            }
        }

        return response()->json([
            "success" => true,
            'Valid_Sequence' => true,
            'error' => null
        ]);
    }
}

<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_8 extends Controller
{
    public function shipmentFlow(Request $request)
    {
        $request->validate([
            'input' => 'required|array',
            'input.ordered' => 'required|numeric|min:0',
            'input.shipped' => 'required|array',
        ]);
        $input = $request['input'];
        $ordered = $input['ordered'];
        $shipped = $input['shipped'];

        $quantityLeft = 0;
        foreach($shipped as $ship){
            if($ship > 0) {
                $ordered = $ordered - $ship;
                $quantityLeft = $ordered;
            }
        }

        if($quantityLeft < 0) {
            return response()->json([
                'success' => true,
                'message' => "No Quantity Left",
                'error' => null
            ]);
        }
        return response()->json([
                'success' => true,
                'message' => ["remaining :" => $quantityLeft],
                'error' => null
        ]);

    } 

}

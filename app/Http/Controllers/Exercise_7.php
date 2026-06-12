<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_7 extends Controller
{
    public function inventoryManagement(Request $request){
        $request->validate([
            'input' => 'required|array',
            'input.stock' => 'required|integer',
            'input.requests' => 'required|array',
        ]);

        $input = $request->input('input');
        $stock = $input['stock'];
        $requests = $input['requests'];
        $remainRequest = [];

        foreach($requests as $req) {
            $stock = $stock - $req;  
            if($stock >= 0) {
                $remainRequest[] = true; 
            } else  {
                $stock = $stock + $req;
                $remainRequest[] = false;
            }
        }
        return response()->json([
            'success' => true,
            'data' => [$remainRequest],
            "error" => null
        ]);
    }
}

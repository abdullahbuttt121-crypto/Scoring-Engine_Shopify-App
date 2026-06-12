<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_4 extends Controller
{
    public function vendorAllocation(Request $request) {
        $request->validate([
            "input" => "required|array",
            "input.order_qty" => "required|integer|min:1",
            "input.vendors" => "required|array|min:1",
            "input.vendors.*.id" => "required|integer",
            "input.vendors.*.stock" => "required|integer|min:0",
        ]);
        $orderQuantity = $request->input['order_qty'];
        $vendors = $request->input['vendors'];

        $allocated = [];
        foreach($vendors as $vendor){
            $minValue = min($vendor['stock'], $orderQuantity); 
            $orderQuantity = $orderQuantity - $vendor['stock'] ;
            $allocated[] = ['id' => $vendor['id'], 'allocated' => $minValue];
            if($orderQuantity <= 0){
                break;
            }
        }
        
        if($orderQuantity > 0){
            return response()->json([
                "success" => true,
                "message" => "Insufficient stock to fulfill the order! Quantities Left: " . $orderQuantity,
                "data" => $allocated,
                "error" => null
        ]);
        } else {
            return response()->json([
                "success" => true,
                "message" => "All requested items allocated successfully!",
                "data" => $allocated,
                "error" => null
            ]);
        }
    }
}

<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_16 extends Controller
{
    public function fraudCheckHandler(Request $request){
        $request->validate([
            'input' => 'required|array',
            'input.order.amount' => 'nullable|numeric',
            'input.order.country' => 'nullable|string',
            'input.order.previous_orders' => 'nullable|numeric',
            'input.rules.max_amount' => 'nullable|numeric',
            'input.rules.blocked_countries' => 'nullable|array',
            'input.rules.blocked_countries.*' => 'string',
        ]);
        $input = $request->input('input');
        $order = $input['order'] ?? null;
        $rules = $input['rules'] ?? null;
        $blocked_countries = $rules['blocked_countries'] ?? [];

        $flagged = [];
        if(isset($rules['max_amount']) && isset($order['amount'])){
            if($order['amount'] >= $rules['max_amount']){
                $flagged[] = true;
            }
        }
        if(isset($blocked_countries) && isset($order['country'])){
            if(in_array(strtolower($order['country']), array_map('strtolower', $blocked_countries))){
                $flagged[] = true;
            }
        }
        
        return response()->json([
            'success' => true,
            'data' => ["flag" => collect($flagged)->contains(true) ? true : false],  
            'error' => null
        ]);
    }
}

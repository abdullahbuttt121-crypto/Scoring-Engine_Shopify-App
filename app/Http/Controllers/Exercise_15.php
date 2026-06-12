<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_15 extends Controller
{
    public function shippingRuleHandler(Request $request){
        $request->validate([
            'input' => 'required|array',
            'input.order.weight' => 'nullable|numeric',
            'input.order.country' => 'nullable|string',
            'input.rules' => 'nullable|array',
            'input.rules.*.id' => 'nullable|numeric',
            'input.rules.*.max_weight' => 'nullable|numeric',
            'input.rules.*.country' => 'nullable|string',
            'input.rules.*.method' => 'nullable|string',
            'input.rules.*.priority' => 'required|numeric',
        ]);
        $input = $request->input('input');

        $order = $input['order'] ?? null;
        $rules = $input['rules'] ?? null;

        $priority = [];
        foreach($rules as $rule){
            if(isset($rule['max_weight']) && isset($order['weight'])){
                if($order['weight'] <= $rule['max_weight']){
                    $priority[] = $rule;
                    continue;
                }
            }
            if(isset($rule['country']) && isset($order['country'])){
                if($order['country'] == $rule['country']){
                    $priority[] = $rule;
                    continue;
                }
            }
        }
        $methodPriority = collect($priority)->where('priority', collect($priority)->min('priority'))->values()->all();
        return response()->json([
            'success' => true,
            'data' => ["method" => collect($methodPriority)->pluck('method')],
            'error' => null
        ]);
    }
}

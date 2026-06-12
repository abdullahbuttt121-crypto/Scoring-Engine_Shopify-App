<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_3 extends Controller
{
    public function cartValidator(Request $request){
        $request->validate([
            'input' => 'required|array',
            "input.*.id" => 'required|integer',
            'input.*.required' => 'required|boolean',
            'input.*.done' => 'required|boolean',
        ]);
        $inputs = $request['input'];
        $invalidItemsId = [];
        foreach($inputs as $input){
            if($input['required'] == true && $input['done'] == false){
                $invalidItemsId['id'][] = $input['id'];
                $invalidItemsId['valid'] = $input['done'];
            }
        }
        if($invalidItemsId){
            return response()->json([
                    'success' => true,
                    'data' => ["valid" => $invalidItemsId['valid'] , 'invalid_items' => $invalidItemsId['id']],
                    'error' => null,
            ]);
        }else {
            return response()->json([
                    'success' => true,
                    'message' => "No Invalid Error Found!",
                    'error' => null,
            ]);
        }
    }
}

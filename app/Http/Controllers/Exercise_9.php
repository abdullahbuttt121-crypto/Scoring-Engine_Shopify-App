<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_9 extends Controller
{
    public function webhookHandler(Request $request){
        $request->validate([
            'input' => 'required|array',
            'input.*.id' => 'required|string',
            'input.*.time' => 'required|numeric',
        ]);
        $input = $request['input'];

        $result = collect($input)->unique("id")->filter()->values()->pluck("id");

        return response()->json([
            'success' => true,
            'data' => $result,
            'error' => null
        ]);
    }
}

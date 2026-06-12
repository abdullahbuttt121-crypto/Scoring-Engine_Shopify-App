<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Carbon\Carbon;

class Exercise_10 extends Controller
{
    public function dateChecker(Request $request){
        $request->validate([
            "input" => "required",
            "input.created_at" => "required|date_format:Y-m-d",
            "input.valid_days" => "required|numeric",
            "input.current_date" => "required|date_format:Y-m-d",
        ]);
        $input = $request->input('input');
        $valid_days = $input['valid_days'];
        $created_at = Carbon::parse($input["created_at"])->format("Y-m-d");
        $current_date = Carbon::parse($input['current_date'])->format("Y-m-d");
        $expiration_date = Carbon::parse($created_at)->addDays($valid_days)->format("Y-m-d");

        if(Carbon::parse($current_date)->greaterThan($expiration_date)){
            return response()->json([
                "success" => false,
                "data" => ["valid" => false],
                "error" => "The date has expired."
            ]);
        } else {
            return response()->json([
                "success" => true,
                "data" => ["valid" => true],
                "error" => null
            ]);
        }
        
    }
}

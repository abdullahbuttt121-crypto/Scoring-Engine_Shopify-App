<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_13 extends Controller
{
    public function cartMerge(Request $request){
        $request->validate([
            'input' => 'required|array',
            'input.guest' => 'array',
            'input.guest.*.id' => 'required|integer',
            'input.guest.*.qty' => 'required|integer',
            'input.user' => 'array',
            'input.user.*.id' => 'required|integer',
            'input.user.*.qty' => 'required|integer',
        ]);

        $input = $request->input('input');
        $guests = $input['guest'];
        $users = $input['user'];

        $mergedArray = array_merge($guests, $users);
        $mergedArray = collect($mergedArray)->groupBy('id')->map(function ($item) {
            return [
                'id' => $item[0]['id'],
                'qty' => $item->sum('qty')
            ];
        })->values()->toArray();

        return response()->json([
            'success' => true,
            'data' => $mergedArray,
            'error' => null
        ]);
        

    }
}

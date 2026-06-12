<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class Exercise_6 extends Controller
{
    public function approvalFlow(Request $request)
    {
        $request->validate([
            'input' => 'required|array',
            'input.steps' => 'required|array',
            'input.steps.*.id' => 'required|string',
            'input.steps.*.depends_on' => 'nullable|string',
        ]);
        $input = $request->input('input');
        $steps = $input['steps'];
        $check = [];
        foreach ($steps as $st) {
            $check['id'][] = strtolower($st['id']);
            $check['depends_on'][] = strtolower($st['depends_on']);
        }

        foreach ($steps as $key => $step) {
            logger("here1" . json_encode($check['id'][$key]));
            if (isset($check['depends_on'][$key + 1])) {
                if($check['depends_on'][$key + 1] !== $check['id'][$key]) {
                    return response()->json([
                        'message' => 'This is null',
                        'data' => ['valid' => false],
                        "error" => null
                    ]);
                }
            } else {
                // logger("here2: No further dependencies found.");
            }
        }
        return response()->json([
            'message' => 'All steps are valid.',
            'data' => ['valid' => true],
            "error" => null
        ]);
    }
}

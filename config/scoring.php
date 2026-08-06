<?php

return [
    'base_score' => 100,
    'levels' => [
        'low' => ['label' => 'Low', 'min' => 0, 'max' => 30, 'color' => '#d72c0d', 'tone' => 'critical'],
        'medium' => ['label' => 'Medium', 'min' => 31, 'max' => 60, 'color' => '#f3c94b', 'tone' => 'warning'],
        'high' => ['label' => 'High', 'min' => 61, 'max' => 89, 'color' => '#8b5a2b', 'tone' => 'attention'],
        'excellent' => ['label' => 'Excellent', 'min' => 90, 'max' => null, 'color' => '#21a67a', 'tone' => 'success'],
    ],
    'actions' => [
        'attention' => 'Needs attention',
        'promote' => 'Promote',
        'optimize' => 'Optimize',
        'restock' => 'Restock',
        'review' => 'Review',
    ],
];

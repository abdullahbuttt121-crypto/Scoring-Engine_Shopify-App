<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

final class ScoringConfig
{
    public static function baseScore(): int
    {
        return (int) config('scoring.base_score', 100);
    }

    public static function levels(): array
    {
        return config('scoring.levels', []);
    }

    public static function levelFromScore(int $score): string
    {
        foreach (self::levels() as $key => $level) {
            if ($score >= (int) $level['min'] && ($level['max'] === null || $score <= (int) $level['max'])) {
                return $key;
            }
        }

        return 'low';
    }

    public static function applyLevelRange(Builder $query, string $level, string $column = 'score'): void
    {
        $range = self::levels()[$level] ?? null;
        if (! $range) {
            return;
        }
        if ($range['max'] === null) {
            $query->where($column, '>=', (int) $range['min']);
        } else {
            $query->whereBetween($column, [(int) $range['min'], (int) $range['max']]);
        }
    }

    public static function frontend(): array
    {
        return ['baseScore' => self::baseScore(), 'levels' => self::levels(), 'actions' => config('scoring.actions', [])];
    }
}

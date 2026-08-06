<?php

namespace Tests\Unit;

use App\Support\ScoringConfig;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ScoringConfigTest extends TestCase
{
    #[DataProvider('scoreLevels')]
    public function test_score_boundaries_use_the_central_health_scale(int $score, string $level): void
    {
        $this->assertSame($level, ScoringConfig::levelFromScore($score));
    }

    public static function scoreLevels(): array
    {
        return [
            [0, 'low'], [30, 'low'],
            [31, 'medium'], [60, 'medium'],
            [61, 'high'], [89, 'high'],
            [90, 'excellent'], [100, 'excellent'], [145, 'excellent'],
        ];
    }
}

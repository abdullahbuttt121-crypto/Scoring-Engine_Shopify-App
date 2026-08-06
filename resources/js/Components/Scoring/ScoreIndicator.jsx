import { InlineStack, Text } from '@shopify/polaris';
import { levelFromScore, scoreLevelMeta } from '@/Config/scoring';

export default function ScoreIndicator({ score, compact = false }) {
    if (score === null || score === undefined) {
        return <Text tone="subdued" as="span">Not scored</Text>;
    }

    const level = levelFromScore(score);
    const color = scoreLevelMeta(level).color;
    const width = Math.min(score, 100);

    return (
        <InlineStack gap="200" blockAlign="center" wrap={false}>
            <div
                style={{
                    width: compact ? 46 : 62,
                    height: compact ? 6 : 8,
                    background: '#e4e5e7',
                    borderRadius: 999,
                    overflow: 'hidden',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        width: `${width}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 999,
                    }}
                />
            </div>
            <Text variant="bodyMd" as="span" fontWeight="semibold">
                {score} pts
            </Text>
        </InlineStack>
    );
}

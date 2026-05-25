import { InlineStack, Text } from '@shopify/polaris';

const LEVEL_BAR_COLOR = {
    critical: '#d72c0d',
    high: '#e08b00',
    medium: '#f3c94b',
    low: '#21a67a',
};

function levelFromScore(score) {
    if (score === null || score === undefined) return null;
    if (score > 100) return 'critical';
    if (score >= 61) return 'high';
    if (score >= 31) return 'medium';
    return 'low';
}

export default function ScoreIndicator({ score, compact = false }) {
    if (score === null || score === undefined) {
        return <Text tone="subdued" as="span">Not scored</Text>;
    }

    const level = levelFromScore(score);
    const color = LEVEL_BAR_COLOR[level] || '#8c9196';
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
                {score}%
            </Text>
        </InlineStack>
    );
}

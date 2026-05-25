import { Badge, BlockStack, Card, InlineStack, Text } from '@shopify/polaris';

export default function DashboardStatCard({ label, value, helper, tone = 'subdued', emphasisLabel }) {
    return (
        <Card>
            <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="start">
                    <Text variant="bodySm" tone="subdued" as="p">
                        {label}
                    </Text>
                    {emphasisLabel ? <Badge tone={tone}>{emphasisLabel}</Badge> : null}
                </InlineStack>
                <Text variant="headingLg" as="p" tone={tone} fontWeight="bold">
                    {value ?? '-'}
                </Text>
                {helper ? (
                    <Text variant="bodySm" tone="subdued" as="p">
                        {helper}
                    </Text>
                ) : null}
            </BlockStack>
        </Card>
    );
}

import { BlockStack, Card, Text } from '@shopify/polaris';

export default function InsightCard({ title, body, tone = 'base', footer }) {
    return (
        <Card>
            <BlockStack gap="150">
                <Text variant="headingSm" as="h3">{title}</Text>
                <Text variant="bodyMd" tone={tone} as="p">{body}</Text>
                {footer ? <Text variant="bodySm" tone="subdued" as="p">{footer}</Text> : null}
            </BlockStack>
        </Card>
    );
}

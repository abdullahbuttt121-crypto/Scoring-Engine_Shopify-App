import { Badge } from '@shopify/polaris';

const LEVEL_META = {
    critical: { label: 'Critical', tone: 'critical' },
    high: { label: 'High', tone: 'attention' },
    medium: { label: 'Medium', tone: 'warning' },
    low: { label: 'Low', tone: 'success' },
};

export default function PriorityBadge({ level }) {
    if (!level) {
        return <Badge tone="subdued">Unscored</Badge>;
    }

    const meta = LEVEL_META[level] || { label: level, tone: 'subdued' };
    return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

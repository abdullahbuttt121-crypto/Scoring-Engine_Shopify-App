import { Badge } from '@shopify/polaris';
import { scoreLevelMeta } from '@/Config/scoring';

export default function PriorityBadge({ level }) {
    if (!level) {
        return <Badge tone="subdued">Unscored</Badge>;
    }

    const meta = scoreLevelMeta(level);
    return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

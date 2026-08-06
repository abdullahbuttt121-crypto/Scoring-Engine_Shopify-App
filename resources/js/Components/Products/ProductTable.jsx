import {
    ActionList,
    Badge,
    BlockStack,
    Button,
    IndexTable,
    Popover,
    Text,
    Thumbnail,
    Tooltip,
} from '@shopify/polaris';
import { ImageIcon, RefreshIcon, ViewIcon } from '@shopify/polaris-icons';
import { useCallback, useState } from 'react';
import PriorityBadge from '@/Components/Scoring/PriorityBadge';
import ScoreIndicator from '@/Components/Scoring/ScoreIndicator';
import { levelFromScore, reasonText } from '@/Config/scoring';


function formatDate(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProductActions({ product, shopDomain, onRecalculate, onViewDetail, rowRescoreLoading }) {
    const [open, setOpen] = useState(false);
    const toggle = useCallback(() => setOpen((prev) => !prev), []);

    const adminUrl = shopDomain && product.shopify_product_id
        ? `https://admin.shopify.com/store/${shopDomain.replace('.myshopify.com', '')}/products/${product.shopify_product_id}`
        : null;

    const items = [
        {
            content: 'View details',
            icon: ViewIcon,
            onAction: () => {
                setOpen(false);
                onViewDetail(product.id);
            },
        },
        {
            content: rowRescoreLoading?.[product.id] ? 'Recalculating...' : 'Recalculate score',
            icon: RefreshIcon,
            disabled: Boolean(rowRescoreLoading?.[product.id]),
            onAction: () => {
                setOpen(false);
                onRecalculate(product.id, product.title);
            },
        },
    ];

    if (adminUrl) {
        items.push({
            content: 'Open in Shopify Admin',
            icon: ViewIcon,
            url: adminUrl,
            external: true,
        });
    }

    return (
        <Popover
            active={open}
            activator={
                <Button variant="plain" onClick={toggle} size="slim">
                    Actions
                </Button>
            }
            onClose={toggle}
        >
            <ActionList actionRole="menuitem" items={items} />
        </Popover>
    );
}

const COLUMN_HEADINGS = [
    { title: 'Image', width: '60px' },
    { title: 'Product', width: '220px' },
    { title: 'Vendor', width: '120px' },
    { title: 'Status', width: '90px' },
    { title: 'Price', width: '80px' },
    { title: 'Inventory', width: '90px' },
    { title: 'Score', width: '120px' },
    { title: 'Level', width: '100px' },
    { title: 'Top reason', width: '200px' },
    { title: 'Last updated', width: '110px' },
    { title: '', width: '90px' },
];

export default function ProductTable({
    products,
    shopDomain,
    onRecalculate,
    onViewDetail,
    rowRescoreLoading,
    selectable = false,
}) {
    const rowMarkup = (products || []).map((product, index) => {
        const score = product.score;
        const level = product.score_info?.level || (score !== null ? levelFromScore(score) : null);
        const topReason = reasonText((product.score_breakdown || product.score_info?.reasons || [])[0]);

        return (
            <IndexTable.Row
                id={String(product.id)}
                key={product.id}
                selected={false}
                position={index}
            >
                <IndexTable.Cell>
                    <Thumbnail source={product.image_url || ImageIcon} alt={product.title} size="small" />
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {product.title}
                        </Text>
                        {product.product_type ? (
                            <Text variant="bodySm" tone="subdued" as="span">
                                {product.product_type}
                            </Text>
                        ) : null}
                    </BlockStack>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Text variant="bodySm" as="span">{product.vendor || '-'}</Text>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Badge
                        tone={
                            product.status === 'active'
                                ? 'success'
                                : product.status === 'archived'
                                  ? 'critical'
                                  : 'warning'
                        }
                    >
                        {product.status ? product.status.charAt(0).toUpperCase() + product.status.slice(1) : '-'}
                    </Badge>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Text variant="bodySm" as="span">
                        {product.price != null ? `$${parseFloat(product.price).toFixed(2)}` : '-'}
                    </Text>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Text
                        variant="bodySm"
                        as="span"
                        tone={
                            product.inventory_quantity === 0
                                ? 'critical'
                                : product.inventory_quantity < 10
                                  ? 'caution'
                                  : undefined
                        }
                    >
                        {product.inventory_quantity ?? '-'}
                    </Text>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <ScoreIndicator score={score} compact />
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <PriorityBadge level={level} />
                </IndexTable.Cell>

                <IndexTable.Cell>
                    {topReason ? (
                        <Tooltip content={topReason}>
                            <Text variant="bodySm" tone="subdued" as="span">
                                {topReason.length > 58 ? `${topReason.substring(0, 58)}...` : topReason}
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text tone="subdued" as="span">-</Text>
                    )}
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued" as="span">
                        {formatDate(product.shopify_updated_at || product.synced_at)}
                    </Text>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <ProductActions
                        product={product}
                        shopDomain={shopDomain}
                        onRecalculate={onRecalculate}
                        onViewDetail={onViewDetail}
                        rowRescoreLoading={rowRescoreLoading}
                    />
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    return (
        <div className="ProductsTableWrap">
            <IndexTable
                resourceName={{ singular: 'product', plural: 'products' }}
                itemCount={(products || []).length}
                selectedItemsCount={0}
                onSelectionChange={() => {}}
                headings={COLUMN_HEADINGS}
                selectable={selectable}
            >
                {rowMarkup}
            </IndexTable>
        </div>
    );
}

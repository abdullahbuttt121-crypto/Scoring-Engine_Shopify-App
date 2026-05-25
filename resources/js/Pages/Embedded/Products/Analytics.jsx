import {
    Badge,
    Banner,
    BlockStack,
    Box,
    Button,
    Card,
    ChoiceList,
    EmptyState,
    IndexFilters,
    InlineGrid,
    InlineStack,
    Page,
    Pagination,
    SkeletonBodyText,
    Spinner,
    Text,
    TextField,
    Tooltip,
    useSetIndexFiltersMode,
} from '@shopify/polaris';

import {
    RefreshIcon,
    ArrowLeftIcon,
} from '@shopify/polaris-icons';

import { router, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import ScoreDetailModal from './ScoreDetailModal';
import ProductTable from '@/Components/Products/ProductTable';

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function formatDate(value) {
    if (!value) return '-';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function routeUrl(name, params = {}, fallback = '#') {
    if (typeof route === 'function') {
        try {
            return route(name, params);
        } catch {
            return fallback;
        }
    }

    return fallback;
}

function StatCard({
    label,
    value,
    helper,
    tone = 'base',
    badge,
}) {
    const colorMap = {
        critical: '#8e0b21',
        warning: '#8a6116',
        success: '#006c5b',
        info: '#0b4b87',
        base: '#202223',
    };

    return (
        <Card>
            <Box padding="400">
                <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" variant="bodySm" tone="subdued">
                            {label}
                        </Text>

                        {badge ? (
                            <Badge tone={tone === 'base' ? undefined : tone}>
                                {badge}
                            </Badge>
                        ) : null}
                    </InlineStack>

                    <Text as="h3" variant="heading2xl" fontWeight="bold">
                        <span style={{ color: colorMap[tone] || colorMap.base }}>
                            {value ?? '-'}
                        </span>
                    </Text>

                    {helper ? (
                        <Text as="p" variant="bodySm" tone="subdued">
                            {helper}
                        </Text>
                    ) : null}
                </BlockStack>
            </Box>
        </Card>
    );
}

function DonutChart({
    items = [],
    centerLabel = 'Products',
}) {
    const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const radius = 44;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;

    const colorMap = {
        Critical: '#d72c0d',
        High: '#e08b00',
        Medium: '#f3c94b',
        Low: '#21a67a',
        Unscored: '#8c9196',
    };

    return (
        <InlineStack gap="500" blockAlign="center" wrap={false}>
            <svg width="150" height="150" viewBox="0 0 130 130">
                <circle
                    cx="65"
                    cy="65"
                    r={radius}
                    fill="transparent"
                    stroke="#edf0f2"
                    strokeWidth="16"
                />

                {items.map((item) => {
                    const value = Number(item.value || 0);
                    const dash = total > 0 ? (value / total) * circumference : 0;

                    const circle = (
                        <circle
                            key={item.label}
                            cx="65"
                            cy="65"
                            r={radius}
                            fill="transparent"
                            stroke={colorMap[item.label] || '#5c6ac4'}
                            strokeWidth="16"
                            strokeDasharray={`${dash} ${circumference - dash}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="round"
                            transform="rotate(-90 65 65)"
                        />
                    );

                    offset += dash;

                    return circle;
                })}

                <text
                    x="65"
                    y="60"
                    textAnchor="middle"
                    fontSize="20"
                    fontWeight="700"
                    fill="#202223"
                >
                    {formatNumber(total)}
                </text>

                <text
                    x="65"
                    y="80"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6d7175"
                >
                    {centerLabel}
                </text>
            </svg>

            <BlockStack gap="250">
                {items.map((item) => (
                    <InlineStack key={item.label} gap="200" blockAlign="center">
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                background: colorMap[item.label] || '#5c6ac4',
                                display: 'inline-block',
                            }}
                        />

                        <Text as="span" variant="bodySm">
                            {item.label}: {formatNumber(item.value)}
                        </Text>
                    </InlineStack>
                ))}
            </BlockStack>
        </InlineStack>
    );
}

function BarChart({
    items = [],
    emptyText = 'No graph data available yet.',
    maxBars = 5,
}) {
    const visibleItems = items.slice(0, maxBars);
    const maxValue = Math.max(...visibleItems.map((item) => Number(item.value || item.count || 0)), 1);

    if (visibleItems.length === 0) {
        return (
            <Text as="p" variant="bodySm" tone="subdued">
                {emptyText}
            </Text>
        );
    }

    return (
        <BlockStack gap="300">
            {visibleItems.map((item, index) => {
                const value = Number(item.value || item.count || 0);
                const width = `${Math.max((value / maxValue) * 100, 4)}%`;
                const label = item.label || item.reason || 'Unknown';

                return (
                    <BlockStack gap="100" key={`${label}-${index}`}>
                        <InlineStack align="space-between" blockAlign="center">
                            <Tooltip content={label}>
                                <div style={{ maxWidth: 260 }}>
                                    <Text as="span" variant="bodySm" truncate>
                                        {label}
                                    </Text>
                                </div>
                            </Tooltip>

                            <Text as="span" variant="bodySm" tone="subdued">
                                {formatNumber(value)}
                            </Text>
                        </InlineStack>

                        <div
                            style={{
                                width: '100%',
                                height: 9,
                                background: '#edf0f2',
                                borderRadius: 999,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width,
                                    height: '100%',
                                    background: index === 0 ? '#5c6ac4' : '#8c9eff',
                                    borderRadius: 999,
                                }}
                            />
                        </div>
                    </BlockStack>
                );
            })}
        </BlockStack>
    );
}

function PriorityBars({ stats }) {
    const items = [
        {
            label: 'Critical',
            value: stats?.critical_priority_products || 0,
            color: '#d72c0d',
        },
        {
            label: 'High',
            value: stats?.high_priority_products || 0,
            color: '#e08b00',
        },
        {
            label: 'Medium',
            value: stats?.medium_priority_products || 0,
            color: '#f3c94b',
        },
        {
            label: 'Low',
            value: stats?.low_priority_products || 0,
            color: '#21a67a',
        },
    ];

    const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);

    return (
        <BlockStack gap="300">
            {items.map((item) => {
                const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;

                return (
                    <BlockStack gap="100" key={item.label}>
                        <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">
                                {item.label}
                            </Text>

                            <Text as="span" variant="bodySm" tone="subdued">
                                {formatNumber(item.value)} ({percent}%)
                            </Text>
                        </InlineStack>

                        <div
                            style={{
                                width: '100%',
                                height: 10,
                                background: '#edf0f2',
                                borderRadius: 999,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${Math.max(percent, item.value > 0 ? 4 : 0)}%`,
                                    height: '100%',
                                    background: item.color,
                                    borderRadius: 999,
                                }}
                            />
                        </div>
                    </BlockStack>
                );
            })}
        </BlockStack>
    );
}

function InventoryHealthChart({ stats }) {
    const outOfStock = Number(stats?.out_of_stock_products || 0);
    const lowStock = Number(stats?.low_inventory_products || 0);
    const total = Number(stats?.total_products || 0);
    const healthy = Math.max(total - outOfStock - lowStock, 0);

    const items = [
        {
            label: 'Healthy inventory',
            value: healthy,
            color: '#21a67a',
        },
        {
            label: 'Low stock',
            value: lowStock,
            color: '#e08b00',
        },
        {
            label: 'Out of stock',
            value: outOfStock,
            color: '#d72c0d',
        },
    ];

    const maxValue = Math.max(...items.map((item) => item.value), 1);

    return (
        <BlockStack gap="300">
            {items.map((item) => {
                const percent = Math.round((item.value / maxValue) * 100);

                return (
                    <BlockStack gap="100" key={item.label}>
                        <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">
                                {item.label}
                            </Text>

                            <Text as="span" variant="bodySm" tone="subdued">
                                {formatNumber(item.value)}
                            </Text>
                        </InlineStack>

                        <div
                            style={{
                                width: '100%',
                                height: 10,
                                background: '#edf0f2',
                                borderRadius: 999,
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${Math.max(percent, item.value > 0 ? 4 : 0)}%`,
                                    height: '100%',
                                    background: item.color,
                                    borderRadius: 999,
                                }}
                            />
                        </div>
                    </BlockStack>
                );
            })}
        </BlockStack>
    );
}

export default function ProductAnalyticsPage() {
    const pageProps = usePage().props;
    const query = pageProps?.ziggy?.query || {};
    const shopDomain = query?.shop || null;

    const [products, setProducts] = useState([]);
    const [stats, setStats] = useState(null);
    const [paginationMeta, setPaginationMeta] = useState(null);

    const [productsLoading, setProductsLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [syncLoading, setSyncLoading] = useState(false);
    const [rescoreLoading, setRescoreLoading] = useState(false);
    const [rowRescoreLoading, setRowRescoreLoading] = useState({});

    const [error, setError] = useState(null);
    const [feedback, setFeedback] = useState(null);

    const [search, setSearch] = useState('');
    const [scoreLevel, setScoreLevel] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');
    const [inventoryIssueFilter, setInventoryIssueFilter] = useState('');

    const [sortSelected, setSortSelected] = useState(['score desc']);
    const [sortBy, setSortBy] = useState('score');
    const [sortDirection, setSortDirection] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);

    const [detailProductId, setDetailProductId] = useState(null);

    const { mode, setMode } = useSetIndexFiltersMode();

    const fetchStats = useCallback(async () => {
        setStatsLoading(true);

        try {
            const response = await fetch(routeUrl('dashboard.stats', { ...query }, '/dashboard/stats'));

            if (!response.ok) {
                throw new Error('Stats request failed.');
            }

            const result = await response.json();

            setStats(result.data || result);
        } catch (err) {
            console.error('[ProductAnalytics] Stats fetch failed:', err);
            setError('Failed to load analytics stats.');
        } finally {
            setStatsLoading(false);
        }
    }, [query]);

    const fetchProducts = useCallback(async () => {
        setProductsLoading(true);
        setError(null);

        try {
            const params = {
                ...query,
                page: currentPage,
                per_page: 10,
                sort_by: sortBy,
                sort_direction: sortDirection,
            };

            if (search) params.search = search;
            if (scoreLevel) params.score_level = scoreLevel;
            if (statusFilter) params.status = statusFilter;
            if (vendorFilter) params.vendor = vendorFilter;
            if (inventoryIssueFilter) params.inventory_issue = inventoryIssueFilter;

            const response = await fetch(routeUrl('products.index', params, '/products'));

            if (!response.ok) {
                throw new Error('Products request failed.');
            }

            const result = await response.json();

            setProducts(result.data || []);
            setPaginationMeta(result.meta || null);
        } catch (err) {
            console.error('[ProductAnalytics] Products fetch failed:', err);
            setError('Failed to load product analytics table.');
        } finally {
            setProductsLoading(false);
        }
    }, [
        query,
        currentPage,
        search,
        scoreLevel,
        statusFilter,
        vendorFilter,
        inventoryIssueFilter,
        sortBy,
        sortDirection,
    ]);

    const refreshAll = useCallback(() => {
        fetchStats();
        fetchProducts();
    }, [fetchStats, fetchProducts]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts();
        }, 350);

        return () => clearTimeout(timer);
    }, [fetchProducts]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, scoreLevel, statusFilter, vendorFilter, inventoryIssueFilter, sortBy, sortDirection]);

    const handleSort = useCallback((selected) => {
        setSortSelected(selected);

        const [field, direction] = (selected[0] || 'score desc').split(' ');

        setSortBy(field);
        setSortDirection(direction);
    }, []);

    const handleSync = async () => {
        setSyncLoading(true);
        setFeedback(null);

        try {
            const response = await fetch(routeUrl('products.sync', { ...query }, '/products/sync'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                },
            });

            const result = await response.json();

            setFeedback({
                type: result.success ? 'success' : 'critical',
                text: result.message || 'Product sync completed.',
            });

            if (result.success) {
                setCurrentPage(1);
                refreshAll();
            }
        } catch {
            setFeedback({
                type: 'critical',
                text: 'Sync request failed.',
            });
        } finally {
            setSyncLoading(false);
        }
    };

    const handleRescoreAll = async () => {
        setRescoreLoading(true);
        setFeedback(null);

        try {
            const response = await fetch(routeUrl('scores.recalculate-all', { ...query }, '/scores/recalculate-all'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                },
            });

            const result = await response.json();

            setFeedback({
                type: result.success ? 'success' : 'critical',
                text: result.message || 'Scores recalculated successfully.',
            });

            if (result.success) {
                refreshAll();
            }
        } catch {
            setFeedback({
                type: 'critical',
                text: 'Score recalculation request failed.',
            });
        } finally {
            setRescoreLoading(false);
        }
    };

    const handleRescoreOne = async (productId, productTitle) => {
        setRowRescoreLoading((prev) => ({
            ...prev,
            [productId]: true,
        }));

        setFeedback(null);

        try {
            const response = await fetch(
                routeUrl(
                    'products.recalculate-score',
                    { ...query, id: productId },
                    `/products/${productId}/recalculate-score`,
                ),
                {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                    },
                },
            );

            const result = await response.json();

            setFeedback({
                type: result.success ? 'success' : 'critical',
                text: result.message || `Rescored ${productTitle}.`,
            });

            if (result.success) {
                refreshAll();
            }
        } catch {
            setFeedback({
                type: 'critical',
                text: `Failed to rescore ${productTitle}.`,
            });
        } finally {
            setRowRescoreLoading((prev) => ({
                ...prev,
                [productId]: false,
            }));
        }
    };

    const clearFilters = useCallback(() => {
        setSearch('');
        setScoreLevel('');
        setStatusFilter('');
        setVendorFilter('');
        setInventoryIssueFilter('');
        setCurrentPage(1);
    }, []);

    const hasActiveFilters = Boolean(
        search ||
        scoreLevel ||
        statusFilter ||
        vendorFilter ||
        inventoryIssueFilter,
    );

    const sortOptions = [
        { label: 'Score', value: 'score desc', directionLabel: 'Highest first' },
        { label: 'Score', value: 'score asc', directionLabel: 'Lowest first' },
        { label: 'Title', value: 'title asc', directionLabel: 'A-Z' },
        { label: 'Title', value: 'title desc', directionLabel: 'Z-A' },
        { label: 'Price', value: 'price desc', directionLabel: 'Highest first' },
        { label: 'Price', value: 'price asc', directionLabel: 'Lowest first' },
        { label: 'Inventory', value: 'inventory desc', directionLabel: 'Highest first' },
        { label: 'Inventory', value: 'inventory asc', directionLabel: 'Lowest first' },
        { label: 'Last synced', value: 'synced_at desc', directionLabel: 'Newest first' },
        { label: 'Last updated', value: 'updated_at desc', directionLabel: 'Newest first' },
    ];

    const filtersConfig = [
        {
            key: 'scoreLevel',
            label: 'Priority level',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Priority level"
                    titleHidden
                    choices={[
                        { label: 'Critical (101+)', value: 'critical' },
                        { label: 'High (61-100)', value: 'high' },
                        { label: 'Medium (31-60)', value: 'medium' },
                        { label: 'Low (0-30)', value: 'low' },
                    ]}
                    selected={scoreLevel ? [scoreLevel] : []}
                    onChange={([value]) => setScoreLevel(value || '')}
                />
            ),
        },
        {
            key: 'statusFilter',
            label: 'Status',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Product status"
                    titleHidden
                    choices={[
                        { label: 'Active', value: 'active' },
                        { label: 'Draft', value: 'draft' },
                        { label: 'Archived', value: 'archived' },
                    ]}
                    selected={statusFilter ? [statusFilter] : []}
                    onChange={([value]) => setStatusFilter(value || '')}
                />
            ),
        },
        {
            key: 'inventoryIssueFilter',
            label: 'Inventory issue',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Inventory issue"
                    titleHidden
                    choices={[
                        { label: 'Out of stock', value: 'out_of_stock' },
                        { label: 'Low stock (< 10)', value: 'low_stock' },
                        { label: 'No stock issue', value: 'no_issue' },
                    ]}
                    selected={inventoryIssueFilter ? [inventoryIssueFilter] : []}
                    onChange={([value]) => setInventoryIssueFilter(value || '')}
                />
            ),
        },
        {
            key: 'vendorFilter',
            label: 'Vendor',
            filter: (
                <TextField
                    label="Vendor"
                    labelHidden
                    value={vendorFilter}
                    onChange={setVendorFilter}
                    placeholder="Filter by vendor"
                    autoComplete="off"
                />
            ),
        },
    ];

    const appliedFilters = useMemo(() => {
        const filters = [];

        if (scoreLevel) {
            filters.push({
                key: 'scoreLevel',
                label: `Priority: ${scoreLevel}`,
                onRemove: () => setScoreLevel(''),
            });
        }

        if (statusFilter) {
            filters.push({
                key: 'statusFilter',
                label: `Status: ${statusFilter}`,
                onRemove: () => setStatusFilter(''),
            });
        }

        if (vendorFilter) {
            filters.push({
                key: 'vendorFilter',
                label: `Vendor: ${vendorFilter}`,
                onRemove: () => setVendorFilter(''),
            });
        }

        if (inventoryIssueFilter) {
            filters.push({
                key: 'inventoryIssueFilter',
                label: `Inventory: ${inventoryIssueFilter}`,
                onRemove: () => setInventoryIssueFilter(''),
            });
        }

        return filters;
    }, [scoreLevel, statusFilter, vendorFilter, inventoryIssueFilter]);

    const scoreDistribution = [
        {
            label: 'Critical',
            value: stats?.critical_priority_products || 0,
        },
        {
            label: 'High',
            value: stats?.high_priority_products || 0,
        },
        {
            label: 'Medium',
            value: stats?.medium_priority_products || 0,
        },
        {
            label: 'Low',
            value: stats?.low_priority_products || 0,
        },
        {
            label: 'Unscored',
            value: stats?.unscored_products || 0,
        },
    ];

    const productsNeedingAttention =
        Number(stats?.critical_priority_products || 0) +
        Number(stats?.high_priority_products || 0);

    return (
        <Box background="bg-surface-secondary" minHeight="100vh" paddingBlock="500">
            <ScoreDetailModal
                open={detailProductId !== null}
                productId={detailProductId}
                query={query}
                onClose={() => setDetailProductId(null)}
                onRescored={(message) => {
                    setDetailProductId(null);
                    setFeedback({
                        type: 'success',
                        text: message || 'Product score recalculated.',
                    });
                    refreshAll();
                }}
            />

            <Page
                fullWidth
                title="Product Analytics"
                subtitle="Understand product health, scoring risks, inventory issues, and scoring performance across your Shopify catalog."
                backAction={{
                    content: 'Dashboard',
                    icon: ArrowLeftIcon,
                    onAction: () => router.visit(routeUrl('scoring', { ...query }, '/scoring')),
                }}
                primaryAction={{
                    content: 'Sync Products',
                    icon: RefreshIcon,
                    loading: syncLoading,
                    onAction: handleSync,
                }}
                secondaryActions={[
                    {
                        content: 'Recalculate All Scores',
                        loading: rescoreLoading,
                        onAction: handleRescoreAll,
                    },
                    {
                        content: 'Scoring Rules',
                        onAction: () => router.visit(routeUrl('scoring-rules.page', { ...query }, '/scoring-rules-page')),
                    },
                ]}
            >
                <BlockStack gap="500">
                    {feedback ? (
                        <Banner
                            tone={feedback.type}
                            onDismiss={() => setFeedback(null)}
                        >
                            <p>{feedback.text}</p>
                        </Banner>
                    ) : null}

                    {error ? (
                        <Banner
                            tone="critical"
                            title="Unable to load analytics"
                            action={{
                                content: 'Retry',
                                onAction: refreshAll,
                            }}
                            onDismiss={() => setError(null)}
                        >
                            <p>{error}</p>
                        </Banner>
                    ) : null}

                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between" blockAlign="center">
                                <BlockStack gap="100">
                                    <Text as="h2" variant="headingMd">
                                        Catalog Health Overview
                                    </Text>

                                    <Text as="p" variant="bodySm" tone="subdued">
                                        Snapshot of product scoring, priority levels, and sync freshness.
                                    </Text>
                                </BlockStack>

                                <Button
                                    icon={RefreshIcon}
                                    onClick={refreshAll}
                                    loading={statsLoading || productsLoading}
                                >
                                    Refresh
                                </Button>
                            </InlineStack>

                            {statsLoading ? (
                                <SkeletonBodyText lines={4} />
                            ) : (
                                <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                                    <StatCard
                                        label="Total Products"
                                        value={formatNumber(stats?.total_products)}
                                        helper="Products currently synced"
                                        tone="info"
                                    />

                                    <StatCard
                                        label="Need Attention"
                                        value={formatNumber(productsNeedingAttention)}
                                        helper="Critical + High priority products"
                                        tone="critical"
                                        badge="Priority"
                                    />

                                    <StatCard
                                        label="Average Score"
                                        value={stats?.average_score != null ? `${stats.average_score} pts` : '-'}
                                        helper="Average risk score"
                                        tone="warning"
                                    />

                                    <StatCard
                                        label="Unscored Products"
                                        value={formatNumber(stats?.unscored_products)}
                                        helper="Need first scoring pass"
                                        tone="info"
                                    />

                                    <StatCard
                                        label="Out of Stock"
                                        value={formatNumber(stats?.out_of_stock_products)}
                                        helper="Inventory is zero"
                                        tone="critical"
                                    />

                                    <StatCard
                                        label="Low Inventory"
                                        value={formatNumber(stats?.low_inventory_products)}
                                        helper="Inventory below threshold"
                                        tone="warning"
                                    />

                                    <StatCard
                                        label="Last Product Sync"
                                        value={formatDate(stats?.last_sync_time)}
                                        helper="Most recent sync"
                                    />

                                    <StatCard
                                        label="Last Score Calculation"
                                        value={formatDate(stats?.last_score_calculation_time)}
                                        helper="Most recent scoring run"
                                    />
                                </InlineGrid>
                            )}
                        </BlockStack>
                    </Card>

                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                        <Card>
                            <Box padding="400">
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="headingMd">
                                            Score Distribution
                                        </Text>

                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Visual breakdown of products by priority level.
                                        </Text>
                                    </BlockStack>

                                    {statsLoading ? (
                                        <SkeletonBodyText lines={5} />
                                    ) : (
                                        <DonutChart
                                            items={scoreDistribution}
                                            centerLabel="Products"
                                        />
                                    )}
                                </BlockStack>
                            </Box>
                        </Card>

                        <Card>
                            <Box padding="400">
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="headingMd">
                                            Priority Breakdown
                                        </Text>

                                        <Text as="p" variant="bodySm" tone="subdued">
                                            See how much of your catalog needs urgent attention.
                                        </Text>
                                    </BlockStack>

                                    {statsLoading ? (
                                        <SkeletonBodyText lines={5} />
                                    ) : (
                                        <PriorityBars stats={stats} />
                                    )}
                                </BlockStack>
                            </Box>
                        </Card>
                    </InlineGrid>

                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                        <Card>
                            <Box padding="400">
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="headingMd">
                                            Most Common Scoring Reasons
                                        </Text>

                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Top reasons products are receiving risk points.
                                        </Text>
                                    </BlockStack>

                                    {statsLoading ? (
                                        <SkeletonBodyText lines={5} />
                                    ) : (
                                        <BarChart
                                            items={stats?.top_scoring_reasons || []}
                                            emptyText="No scoring reasons available yet."
                                        />
                                    )}
                                </BlockStack>
                            </Box>
                        </Card>

                        <Card>
                            <Box padding="400">
                                <BlockStack gap="400">
                                    <BlockStack gap="100">
                                        <Text as="h3" variant="headingMd">
                                            Inventory Health
                                        </Text>

                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Understand stock-related risk across your synced products.
                                        </Text>
                                    </BlockStack>

                                    {statsLoading ? (
                                        <SkeletonBodyText lines={5} />
                                    ) : (
                                        <InventoryHealthChart stats={stats} />
                                    )}
                                </BlockStack>
                            </Box>
                        </Card>
                    </InlineGrid>

                    <Card padding="0">
                        <Box padding="400">
                            <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                    <BlockStack gap="100">
                                        <Text as="h2" variant="headingMd">
                                            All Products
                                        </Text>

                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Search, filter, sort, and review every synced product.
                                        </Text>
                                    </BlockStack>

                                    {paginationMeta ? (
                                        <Badge>
                                            {formatNumber(paginationMeta.total)} products
                                        </Badge>
                                    ) : null}
                                </InlineStack>

                                <IndexFilters
                                    queryValue={search}
                                    queryPlaceholder="Search by title, vendor, tags..."
                                    onQueryChange={setSearch}
                                    onQueryClear={() => setSearch('')}
                                    sortOptions={sortOptions}
                                    sortSelected={sortSelected}
                                    onSort={handleSort}
                                    filters={filtersConfig}
                                    appliedFilters={appliedFilters}
                                    onClearAll={clearFilters}
                                    mode={mode}
                                    setMode={setMode}
                                    tabs={[]}
                                    selected={0}
                                    cancelAction={{
                                        onAction: clearFilters,
                                        disabled: !hasActiveFilters,
                                    }}
                                    loading={productsLoading}
                                />
                            </BlockStack>
                        </Box>

                        {productsLoading ? (
                            <Box padding="800">
                                <BlockStack gap="300">
                                    <InlineStack align="center" blockAlign="center" gap="200">
                                        <Spinner size="large" />
                                        <Text as="p" tone="subdued">
                                            Loading products and analytics...
                                        </Text>
                                    </InlineStack>

                                    <SkeletonBodyText lines={4} />
                                </BlockStack>
                            </Box>
                        ) : products.length === 0 ? (
                            <EmptyState
                                heading="No products found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                action={
                                    hasActiveFilters
                                        ? {
                                            content: 'Clear filters',
                                            onAction: clearFilters,
                                        }
                                        : {
                                            content: 'Sync Products',
                                            onAction: handleSync,
                                            loading: syncLoading,
                                        }
                                }
                            >
                                <p>
                                    {hasActiveFilters
                                        ? 'No products match your current filters.'
                                        : 'Sync your Shopify products first, then run Recalculate All Scores.'}
                                </p>
                            </EmptyState>
                        ) : (
                            <ProductTable
                                products={products}
                                shopDomain={shopDomain}
                                onRecalculate={handleRescoreOne}
                                onViewDetail={setDetailProductId}
                                rowRescoreLoading={rowRescoreLoading}
                                selectable={false}
                            />
                        )}
                    </Card>

                    {paginationMeta && paginationMeta.total > 0 ? (
                        <InlineStack align="center">
                            <Pagination
                                hasPrevious={currentPage > 1}
                                onPrevious={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                                hasNext={currentPage < paginationMeta.last_page}
                                onNext={() => setCurrentPage((page) => page + 1)}
                                label={`Page ${currentPage} of ${paginationMeta.last_page}`}
                            />
                        </InlineStack>
                    ) : null}
                </BlockStack>
            </Page>
        </Box>
    );
}
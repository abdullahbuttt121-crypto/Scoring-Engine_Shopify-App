/**
 * ScoreDetailModal
 *
 * Path: resources/js/Pages/Embedded/Products/ScoreDetailModal.jsx
 *
 * WHAT THIS COMPONENT DOES:
 * ──────────────────────────
 * Opens as a Polaris Modal when the merchant clicks "View Details" on any
 * product row. It fetches GET /products/{id} which returns the full product
 * record including:
 *   - score_info   (current score, level, reasons)
 *   - score_logs   (last 10 scoring events)
 *
 * It then:
 * 1. Displays core product info (title, status, vendor, price, inventory, image)
 * 2. Shows the current score with a visual bar and level badge
 * 3. Lists each scoring reason with its points contribution
 * 4. Generates merchant-friendly RECOMMENDATIONS based on which reasons fired
 * 5. Shows the last 10 score log entries as a change history table
 * 6. Provides a "Recalculate Score" button
 *
 * RECOMMENDATIONS SYSTEM:
 * ────────────────────────
 * Recommendations are generated CLIENT-SIDE from the reasons array.
 * Each reason string is checked against known keywords (e.g. "inventory",
 * "image", "description"). When a keyword matches, a friendly action tip
 * is shown. This keeps the backend simple — it only needs to return the
 * raw reason strings.
 *
 * PROPS:
 *   open           boolean         — whether modal is visible
 *   productId      number|null     — local product ID to load (null = nothing to load)
 *   query          object          — Ziggy { shop: "..." } from usePage().props.ziggy
 *   onClose        function()      — called when merchant closes the modal
 *   onRescored     function(msg)   — called after rescore is queued (shows banner in parent)
 */

import {
    Badge,
    Banner,
    BlockStack,
    Box,
    Button,
    DataTable,
    Divider,
    InlineStack,
    Modal,
    SkeletonBodyText,
    SkeletonDisplayText,
    Text,
    Thumbnail,
} from '@shopify/polaris';
import { ImageIcon, RefreshIcon } from '@shopify/polaris-icons';
import { useCallback, useEffect, useState } from 'react';
import PriorityBadge from '@/Components/Scoring/PriorityBadge';
import ScoreIndicator from '@/Components/Scoring/ScoreIndicator';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — mirrors ProductScore.php level thresholds
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_BAR_COLOR = {
    critical: '#d72c0d',
    high:     '#e08b00',
    medium:   '#f3c94b',
    low:      '#21a67a',
};

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps known reason keywords → merchant-friendly action recommendations.
 *
 * Each entry has:
 *   match   — a substring to look for in a reason string (case-insensitive)
 *   text    — the recommendation to show the merchant
 *   tone    — Polaris Banner tone: 'critical' | 'warning' | 'info'
 *
 * The engine checks EACH reason string against EACH rule.
 * Only matching rules are shown — no duplicates.
 *
 * WHY CLIENT-SIDE?
 * ─────────────────
 * The backend returns reason strings like:
 *   "Low/zero inventory (0 units) [+40 pts]"
 *   "Missing featured image [+15 pts]"
 * These contain all the information we need to generate recommendations.
 * Generating them in React keeps the backend lean and the UI dynamic.
 */
const RECOMMENDATION_RULES = [
    {
        match: 'out of stock',
        text:  'Restock this product as soon as possible — it is currently showing 0 inventory and costing you sales.',
        tone:  'critical',
    },
    {
        match: 'low/zero inventory',
        text:  'Inventory is critically low. Review stock levels and consider reordering before you run out.',
        tone:  'critical',
    },
    {
        match: 'low inventory',
        text:  'Inventory is running low. Review stock and consider restocking soon.',
        tone:  'warning',
    },
    {
        match: 'not updated in',
        text:  'This product has not been updated recently. Review the title, description, and images to keep it fresh.',
        tone:  'warning',
    },
    {
        match: 'missing featured image',
        text:  'Add a high-quality product image. Products with images convert significantly better.',
        tone:  'warning',
    },
    {
        match: 'missing product description',
        text:  'Add a clear, detailed product description to improve customer confidence and SEO.',
        tone:  'info',
    },
    {
        match: 'missing product tags',
        text:  'Add relevant tags to improve product organisation and internal search.',
        tone:  'info',
    },
    {
        match: 'status is draft',
        text:  'This product is a Draft and is not visible to customers. Publish it when it is ready.',
        tone:  'warning',
    },
    {
        match: 'status is archived',
        text:  'This product is Archived. Consider whether it should be re-activated or permanently removed.',
        tone:  'info',
    },
    {
        match: 'price',
        text:  'This product\'s price triggered a scoring rule. Review your pricing strategy.',
        tone:  'info',
    },
];

/**
 * Generate recommendations from an array of reason strings.
 * Returns a deduplicated array of { text, tone } objects.
 *
 * @param {string[]} reasons
 * @returns {{ text: string, tone: string }[]}
 */
function generateRecommendations(reasons) {
    if (!Array.isArray(reasons) || reasons.length === 0) return [];

    const recommendations = [];
    const seenMatches     = new Set();

    for (const reason of reasons) {
        const lowerReason = reason.toLowerCase();

        for (const rule of RECOMMENDATION_RULES) {
            if (seenMatches.has(rule.match)) continue; // already added this one
            if (lowerReason.includes(rule.match)) {
                recommendations.push({ text: rule.text, tone: rule.tone });
                seenMatches.add(rule.match);
            }
        }
    }

    return recommendations;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(isoString) {
    if (!isoString) return '–';
    return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDateShort(isoString) {
    if (!isoString) return '–';
    return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

// Extract the numeric points value from a reason string like "Low inventory [+40 pts]"
function parsePoints(reason) {
    const m = reason.match(/\[([+-]?\d+)\s*pts\]/i);
    return m ? parseInt(m[1], 10) : null;
}
// Strip the trailing " [+40 pts]" bracket so we can show it separately
function stripPoints(reason) {
    return reason.replace(/\s*\[[+-]?\d+\s*pts\]/i, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Score card — coloured panel that shows score + bar prominently
// ─────────────────────────────────────────────────────────────────────────────
function ScoreCard({ score, level, calculatedAt }) {
    const color    = LEVEL_BAR_COLOR[level] || '#8c9196';
    const bgAlpha  = `${color}18`;
    const borderCl = `${color}55`;

    return (
        <div style={{
            background: bgAlpha,
            border: `1px solid ${borderCl}`,
            borderRadius: 12,
            padding: '20px 24px',
        }}>
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <BlockStack gap="050">
                    <Text variant="heading2xl" as="p" fontWeight="bold">{score ?? 0} pts</Text>
                    <ScoreIndicator score={score} />
                    {calculatedAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                            Last calculated: {formatDate(calculatedAt)}
                        </Text>
                    )}
                </BlockStack>
                <PriorityBadge level={level} />
            </InlineStack>

            {/* Score bar */}
            <div style={{ marginTop: 16 }}>
                <div style={{
                    width: '100%', height: 10,
                    background: '#e4e5e7', borderRadius: 5, overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${Math.min(((score || 0) / 120) * 100, 100)}%`, height: '100%',
                        background: color, borderRadius: 5,
                        transition: 'width 0.5s ease',
                    }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text variant="bodySm" tone="subdued" as="span">0 — No issues</Text>
                    <Text variant="bodySm" tone="subdued" as="span">101+ — Critical</Text>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single scored rule row in the "Why this score?" table
// ─────────────────────────────────────────────────────────────────────────────
function ReasonRow({ reason, index }) {
    const pts     = parsePoints(reason);
    const label   = stripPoints(reason);
    const isFirst = index === 0;
    const dot     = pts !== null && pts >= 30 ? '#d72c0d'
                  : pts !== null && pts >= 15 ? '#e08b00'
                  : '#8c9196';
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 12px',
            borderTop: isFirst ? 'none' : '1px solid #f1f2f3',
        }}>
            <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: dot, flexShrink: 0,
            }} />
            <Text variant="bodySm" as="span" style={{ flex: 1 }}>{label}</Text>
            {pts !== null && (
                <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: `${dot}22`, color: dot,
                    borderRadius: 20, padding: '2px 10px',
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}>
                    {pts >= 0 ? `+${pts}` : pts} pts
                </span>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact recommendation card (replaces heavy Banner)
// ─────────────────────────────────────────────────────────────────────────────
const REC_COLORS = { critical: '#d72c0d', warning: '#e08b00', info: '#0070f3' };
function RecCard({ text, tone }) {
    const color = REC_COLORS[tone] || REC_COLORS.info;
    return (
        <div style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            background: '#fff', border: '1px solid #e1e3e5',
            borderLeft: `4px solid ${color}`,
            borderRadius: 8, padding: '10px 14px',
        }}>
            <span style={{
                width: 10,
                height: 10,
                marginTop: 5,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
            }} />
            <Text variant="bodySm" as="p">{text}</Text>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ScoreDetailModal({ open, productId, query, onClose, onRescored }) {

    // ── State ─────────────────────────────────────────────────────────────
    const [product,       setProduct]       = useState(null);
    const [loading,       setLoading]       = useState(false);
    const [error,         setError]         = useState(null);
    const [rescoreLoading, setRescoreLoading] = useState(false);

    // ─────────────────────────────────────────────────────────────────────
    // LOAD PRODUCT DETAIL on open
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Fetches GET /products/{id} which returns:
     *   - All product fields
     *   - score_info  (current score, level, reasons array)
     *   - score_logs  (last 10 scoring events)
     *
     * The `query` prop contains { shop: "..." } from Ziggy — must be spread
     * into the route() call so the verify.shopify middleware can authenticate.
     */
    const fetchDetail = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        setError(null);
        setProduct(null);
        try {
            const response = await fetch(route('products.show', { ...query, id: productId }));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            setProduct(result.data);
        } catch (err) {
            setError('Could not load product details. Please try again.');
            console.error('[ScoreDetailModal] Fetch failed:', err);
        } finally {
            setLoading(false);
        }
    }, [productId, query]);

    useEffect(() => {
        if (open && productId) {
            fetchDetail();
        }
    }, [open, productId]);

    // ─────────────────────────────────────────────────────────────────────
    // RESCORE ONE PRODUCT
    // ─────────────────────────────────────────────────────────────────────

    const handleRescore = async () => {
        if (!product) return;
        setRescoreLoading(true);
        try {
            const response = await fetch(
                route('products.recalculate-score', { ...query, id: product.id }),
                { method: 'POST' }
            );
            const result = await response.json();
            const msg = result.message || 'Rescore queued.';
            if (onRescored) onRescored(msg);
            onClose();
        } catch (err) {
            setError('Rescore request failed. Make sure the queue worker is running.');
        } finally {
            setRescoreLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    // DERIVED DATA (only computed when product is loaded)
    // ─────────────────────────────────────────────────────────────────────

    const scoreInfo      = product?.score_info   || null;
    const score          = scoreInfo?.score       ?? product?.score ?? null;
    const level          = scoreInfo?.level       ?? null;
    const reasons        = scoreInfo?.reasons     || product?.score_breakdown || [];
    const scoreLogs      = product?.score_logs    || [];
    const recommendations = generateRecommendations(reasons);

    // ─────────────────────────────────────────────────────────────────────
    // SCORE LOG TABLE ROWS for Polaris DataTable
    // DataTable expects: rows = array of arrays (each inner array = one row)
    // ─────────────────────────────────────────────────────────────────────
    const logTableRows = scoreLogs.map(log => [
        log.old_score !== null ? `${log.old_score} pts` : '–',
        `${log.new_score} pts`,
        log.score_changed ? (
            <Badge tone={log.new_score > (log.old_score || 0) ? 'attention' : 'success'}>
                {log.new_score > (log.old_score || 0) ? 'Increased' : 'Decreased'}
            </Badge>
        ) : <Badge tone="new">No change</Badge>,
        log.calculated_by || '–',
        formatDate(log.logged_at),
    ]);

    // ─────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={product ? product.title : 'Product Score Detail'}
            large
            primaryAction={{
                content:     'Recalculate Score',
                icon:        RefreshIcon,
                loading:     rescoreLoading,
                onAction:    handleRescore,
                disabled:    !product || loading,
            }}
            secondaryActions={[
                { content: 'Close', onAction: onClose },
            ]}
        >
            <Modal.Section>

                {/* ── Loading skeleton ───────────────────────────────── */}
                {loading && (
                    <BlockStack gap="400">
                        <SkeletonDisplayText size="small" />
                        <SkeletonBodyText lines={3} />
                        <SkeletonBodyText lines={5} />
                    </BlockStack>
                )}

                {/* ── Error state ────────────────────────────────────── */}
                {!loading && error && (
                    <Banner
                        tone="critical"
                        onDismiss={() => setError(null)}
                        action={productId ? { content: 'Retry', onAction: fetchDetail } : undefined}
                    >
                        <p>{error}</p>
                    </Banner>
                )}

                {/* ── Main content ───────────────────────────────────── */}
                {!loading && product && (
                    <BlockStack gap="500">

                        {/* ── 1. Product header ───────────────────────── */}
                        <BlockStack gap="300">
                            <InlineStack gap="300" blockAlign="start" wrap={false}>
                                <Thumbnail
                                    source={product.image_url || ImageIcon}
                                    alt={product.title}
                                    size="large"
                                />
                                <BlockStack gap="100">
                                    <Text variant="headingMd" as="h2">{product.title}</Text>
                                    <InlineStack gap="150" blockAlign="center">
                                        <Badge
                                            tone={
                                                product.status === 'active' ? 'success' :
                                                product.status === 'archived' ? 'critical' : 'warning'
                                            }
                                        >
                                            {product.status
                                                ? product.status.charAt(0).toUpperCase() + product.status.slice(1)
                                                : 'Unknown'}
                                        </Badge>
                                        {product.vendor ? <Text variant="bodySm" tone="subdued" as="span">{product.vendor}</Text> : null}
                                    </InlineStack>
                                </BlockStack>
                            </InlineStack>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: 8,
                            }}>
                                {[
                                    { label: 'Price', value: product.price != null ? `$${parseFloat(product.price).toFixed(2)}` : '–' },
                                    {
                                        label: 'Inventory',
                                        value: `${product.inventory_quantity ?? '–'} units`,
                                        tone: product.inventory_quantity === 0 ? 'critical' : product.inventory_quantity < 10 ? 'caution' : undefined,
                                    },
                                    { label: 'Last Updated', value: formatDateShort(product.shopify_updated_at) },
                                    { label: 'Last Synced', value: formatDateShort(product.synced_at) },
                                ].map((stat) => (
                                    <Box key={stat.label} background="bg-surface-secondary" padding="200" borderRadius="200">
                                        <BlockStack gap="050">
                                            <Text variant="bodySm" tone="subdued" as="p">{stat.label}</Text>
                                            <Text variant="bodyMd" fontWeight="semibold" tone={stat.tone} as="p">{stat.value}</Text>
                                        </BlockStack>
                                    </Box>
                                ))}
                            </div>
                        </BlockStack>

                        <Divider />

                        {/* ── 2. Score card ────────────────────────────── */}
                        {score !== null ? (
                            <ScoreCard
                                score={score}
                                level={level}
                                calculatedAt={scoreInfo?.calculated_at}
                            />
                        ) : (
                            <Banner tone="info">
                                <p>This product has not been scored yet. Click "Recalculate Score" to generate a score.</p>
                            </Banner>
                        )}

                        {/* ── 3. Why this score ────────────────────────── */}
                        {reasons.length > 0 && (
                            <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                                        Why this score?
                                    </Text>
                                    <Badge>{reasons.length} rule{reasons.length !== 1 ? 's' : ''} matched</Badge>
                                </InlineStack>
                                <div style={{
                                    border: '1px solid #e1e3e5',
                                    borderRadius: 8, overflow: 'hidden',
                                    background: '#fff',
                                }}>
                                    {reasons.map((reason, i) => (
                                        <ReasonRow key={i} reason={reason} index={i} />
                                    ))}
                                </div>
                            </BlockStack>
                        )}

                        {/* ── 4. Recommendations ───────────────────────── */}
                        {recommendations.length > 0 && (
                            <BlockStack gap="200">
                                <Text variant="headingSm" as="h3" fontWeight="semibold">
                                    Recommendations
                                </Text>
                                <BlockStack gap="150">
                                    {recommendations.map((rec, i) => (
                                        <RecCard key={i} text={rec.text} tone={rec.tone} />
                                    ))}
                                </BlockStack>
                            </BlockStack>
                        )}

                        {/* ── All-clear ────────────────────────────────── */}
                        {score !== null && recommendations.length === 0 && reasons.length === 0 && (
                            <Banner tone="success">
                                <p>Great job! No scoring issues were found for this product.</p>
                            </Banner>
                        )}

                        {/* ── 5. Score history ─────────────────────────── */}
                        <BlockStack gap="200">
                            <Text variant="headingSm" as="h3" fontWeight="semibold">
                                Score History
                            </Text>
                            {scoreLogs.length === 0 ? (
                                <Text tone="subdued" as="p">
                                    No scoring history yet. History is recorded each time the score is calculated.
                                </Text>
                            ) : (
                                <div style={{ border: '1px solid #e1e3e5', borderRadius: 8, overflow: 'hidden' }}>
                                    <DataTable
                                        columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                                        headings={['Old', 'New', 'Change', 'Triggered by', 'Date']}
                                        rows={logTableRows}
                                        footerContent={
                                            scoreLogs.length === 10
                                                ? 'Showing last 10 events'
                                                : `${scoreLogs.length} event${scoreLogs.length !== 1 ? 's' : ''} total`
                                        }
                                    />
                                </div>
                            )}
                        </BlockStack>

                    </BlockStack>
                )}

            </Modal.Section>
        </Modal>
    );
}

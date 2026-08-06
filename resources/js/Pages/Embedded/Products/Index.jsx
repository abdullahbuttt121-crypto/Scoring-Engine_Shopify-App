/**
 * Dynamic Product Scoring Engine — Dashboard
 *
 * Path: resources/js/Pages/Embedded/Products/Index.jsx
 *
 * WHAT THIS PAGE DOES:
 * ─────────────────────
 * 1. Loads a summary stats bar from GET /dashboard/stats
 * 2. Loads a paginated, filterable, sortable product list from GET /products
 * 3. Lets merchants:
 *    - Sync products from Shopify (POST /products/sync)
 *    - Recalculate all scores   (POST /scores/recalculate-all)
 *    - Recalculate one score    (POST /products/{id}/recalculate-score)
 *    - Open the product in Shopify Admin
 *
 * FETCH PATTERN (boilerplate convention):
 * ────────────────────────────────────────
 * The embedded.blade.php JS interceptor automatically adds:
 *   Authorization: Bearer <shopify_idToken>
 *   Accept: application/json
 * to every fetch() call. We never add these headers manually.
 *
 * const { query } = usePage().props.ziggy
 * → Contains { shop: "yourstore.myshopify.com" }
 * → Must be spread into every route() call so the middleware can authenticate.
 */

import {
    ActionList,
    Badge,
    Banner,
    BlockStack,
    Box,
    Button,
    Card,
    ChoiceList,
    EmptyState,
    FormLayout,
    IndexFilters,
    IndexTable,
    InlineStack,
    Modal,
    Page,
    Pagination,
    Popover,
    Select,
    SkeletonBodyText,
    Spinner,
    Text,
    TextField,
    Thumbnail,
    Tooltip,
    useIndexResourceState,
    useSetIndexFiltersMode,
} from '@shopify/polaris';
import { ImageIcon, RefreshIcon, ViewIcon, EditIcon, DeleteIcon, PlusIcon } from '@shopify/polaris-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePage } from '@inertiajs/react';
import ScoreDetailModal from './ScoreDetailModal';
import DashboardStatCard from '@/Components/Scoring/DashboardStatCard';
import InsightCard from '@/Components/Scoring/InsightCard';
import PriorityBadge from '@/Components/Scoring/PriorityBadge';
import ScoreIndicator from '@/Components/Scoring/ScoreIndicator';
import ProductTable from '@/Components/Products/ProductTable';
import { SCORE_LEVEL_OPTIONS, levelFromScore, reasonText } from '@/Config/scoring';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// SCORING RULES — constants (mirrors ScoringRule PHP model)
// ─────────────────────────────────────────────────────────────────────────────
const RULE_TYPES = [
    { label: 'Status',      value: 'status',      hint: 'Product status (active / draft / archived)' },
    { label: 'Price',       value: 'price',       hint: 'Minimum variant price (numeric)' },
    { label: 'Inventory',   value: 'inventory',   hint: 'Total inventory across all variants (integer)' },
    { label: 'Recency',     value: 'recency',     hint: 'Days since last Shopify update (integer)' },
    { label: 'Tags',        value: 'tags',        hint: 'Product tags (comma-separated string)' },
    { label: 'Image',       value: 'image',       hint: 'Featured image URL (present or absent)' },
    { label: 'Description', value: 'description', hint: 'Product description HTML (present or absent)' },
    { label: 'Vendor',      value: 'vendor',      hint: 'Product vendor (string)' },
];

const OPERATORS = [
    { label: 'equals',             value: 'equals',          allowedFor: ['status', 'vendor', 'tags'],                needsValue: true  },
    { label: 'not equals',         value: 'not_equals',      allowedFor: ['status', 'vendor', 'tags'],                needsValue: true  },
    { label: 'contains',           value: 'contains',        allowedFor: ['tags', 'vendor', 'description'],           needsValue: true  },
    { label: 'less than',          value: 'less_than',       allowedFor: ['price', 'inventory', 'recency'],           needsValue: true  },
    { label: 'greater than',       value: 'greater_than',    allowedFor: ['price', 'inventory', 'recency'],           needsValue: true  },
    { label: 'older than (days)',  value: 'older_than_days', allowedFor: ['recency'],                                 needsValue: true  },
    { label: 'is empty',           value: 'empty',           allowedFor: ['image', 'description', 'tags', 'vendor'],  needsValue: false },
    { label: 'is not empty',       value: 'not_empty',       allowedFor: ['image', 'description', 'tags', 'vendor'],  needsValue: false },
];

const TYPE_LABEL = Object.fromEntries(RULE_TYPES.map(t => [t.value, t.label]));
const OP_LABEL   = Object.fromEntries(OPERATORS.map(o => [o.value, o.label]));

const BLANK_FORM = {
    rule_name: '', rule_type: 'inventory', condition_operator: 'less_than',
    condition_value: '', points: '10', is_active: true, sort_order: '',
};

function operatorsFor(ruleType) {
    return OPERATORS.filter(op => op.allowedFor.includes(ruleType));
}
function operatorNeedsValue(operatorValue) {
    const op = OPERATORS.find(o => o.value === operatorValue);
    return op ? op.needsValue : true;
}
function ruleSummary(rule) {
    const typeLbl = TYPE_LABEL[rule.rule_type] || rule.rule_type;
    const opLbl   = OP_LABEL[rule.condition_operator] || rule.condition_operator;
    const val     = operatorNeedsValue(rule.condition_operator) && rule.condition_value != null ? ` ${rule.condition_value}` : '';
    const pts     = rule.points >= 0 ? `+${rule.points}` : `${rule.points}`;
    return `${typeLbl} ${opLbl}${val}  →  ${pts} pts`;
}
function validateRuleForm(form) {
    const errors = {};
    if (!form.rule_name.trim())   errors.rule_name = 'Rule name is required.';
    if (!form.rule_type)          errors.rule_type = 'Rule type is required.';
    if (!form.condition_operator) errors.condition_operator = 'Operator is required.';
    if (operatorNeedsValue(form.condition_operator) && !form.condition_value.trim())
        errors.condition_value = 'A condition value is required for this operator.';
    const pts = parseInt(form.points, 10);
    if (isNaN(pts))                           errors.points = 'Points must be a number.';
    else if (pts < -10000 || pts > 10000)     errors.points = 'Points must be between -10,000 and 10,000.';
    if (!errors.rule_name && form.rule_name.length > 100)
        errors.rule_name = 'Rule name must be 100 characters or fewer.';
    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: derive level from numeric score (mirrors PHP ProductScore::levelFromScore)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: format ISO date string into a readable short form
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(isoString) {
    if (!isoString) return '–';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Product row action menu (three-dot button)
// ─────────────────────────────────────────────────────────────────────────────
function ProductActions({ product, shopDomain, onRecalculate, onViewDetail }) {
    const [open, setOpen] = useState(false);

    const toggle = useCallback(() => setOpen(o => !o), []);

    // Build the Shopify Admin URL for this product (if we have the shop domain and numeric ID)
    const adminUrl = shopDomain && product.shopify_product_id
        ? `https://admin.shopify.com/store/${shopDomain.replace('.myshopify.com', '')}/products/${product.shopify_product_id}`
        : null;

    const items = [
        {            content: 'View Details',
            icon: ViewIcon,
            onAction: () => {
                setOpen(false);
                onViewDetail(product.id);
            },
        },
        {            content: 'Recalculate Score',
            icon: RefreshIcon,
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

// ─────────────────────────────────────────────────────────────────────────────
// RULE FORM MODAL
// ─────────────────────────────────────────────────────────────────────────────
function RuleFormModal({ open, initialData, onClose, onSave, saving }) {
    const isEdit = initialData !== null;
    const [form,   setForm]   = useState(BLANK_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (open) {
            if (initialData) {
                setForm({
                    rule_name:          initialData.rule_name || '',
                    rule_type:          initialData.rule_type || 'inventory',
                    condition_operator: initialData.condition_operator || 'less_than',
                    condition_value:    initialData.condition_value ?? '',
                    points:             String(initialData.points ?? 10),
                    is_active:          initialData.is_active !== false,
                    sort_order:         String(initialData.sort_order ?? ''),
                });
            } else {
                setForm(BLANK_FORM);
            }
            setErrors({});
        }
    }, [open, initialData]);

    const handleTypeChange = useCallback((newType) => {
        const validOps = operatorsFor(newType);
        setForm(f => ({ ...f, rule_type: newType, condition_operator: validOps[0]?.value || '', condition_value: '' }));
        setErrors(e => ({ ...e, rule_type: undefined, condition_operator: undefined }));
    }, []);

    const handleField = useCallback((field, value) => {
        setForm(f => ({ ...f, [field]: value }));
        setErrors(e => ({ ...e, [field]: undefined }));
    }, []);

    const handleOperatorChange = useCallback((op) => {
        setForm(f => ({ ...f, condition_operator: op, condition_value: operatorNeedsValue(op) ? f.condition_value : '' }));
        setErrors(e => ({ ...e, condition_operator: undefined, condition_value: undefined }));
    }, []);

    const handleSubmit = () => {
        const errs = validateRuleForm(form);
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }
        onSave({
            rule_name:          form.rule_name.trim(),
            rule_type:          form.rule_type,
            condition_operator: form.condition_operator,
            condition_value:    operatorNeedsValue(form.condition_operator) ? form.condition_value.trim() : null,
            points:             parseInt(form.points, 10),
            is_active:          form.is_active,
            sort_order:         form.sort_order !== '' ? parseInt(form.sort_order, 10) : null,
        });
    };

    const availableOps    = useMemo(() => operatorsFor(form.rule_type), [form.rule_type]);
    const typeHint        = RULE_TYPES.find(t => t.value === form.rule_type)?.hint;
    const showValueField  = operatorNeedsValue(form.condition_operator);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={isEdit ? 'Edit Scoring Rule' : 'Create Scoring Rule'}
            primaryAction={{ content: 'Save Rule', loading: saving, onAction: handleSubmit }}
            secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
        >
            <Modal.Section>
                <FormLayout>
                    <TextField label="Rule name" value={form.rule_name} onChange={v => handleField('rule_name', v)}
                        error={errors.rule_name} helpText="e.g. 'Low Stock Warning'" autoComplete="off" />
                    <Select label="Rule type"
                        options={RULE_TYPES.map(t => ({ label: t.label, value: t.value }))}
                        value={form.rule_type} onChange={handleTypeChange}
                        error={errors.rule_type} helpText={typeHint} />
                    <Select label="Condition"
                        options={availableOps.map(o => ({ label: o.label, value: o.value }))}
                        value={form.condition_operator} onChange={handleOperatorChange}
                        error={errors.condition_operator} />
                    {showValueField && (
                        <TextField label="Condition value" value={form.condition_value}
                            onChange={v => handleField('condition_value', v)}
                            error={errors.condition_value}
                            helpText={
                                form.rule_type === 'recency'   ? 'Number of days, e.g. 90' :
                                form.rule_type === 'status'    ? 'e.g. active, draft, or archived' :
                                form.rule_type === 'inventory' ? 'A number, e.g. 10' :
                                form.rule_type === 'price'     ? 'A number, e.g. 100.00' :
                                'The value to compare against.'
                            }
                            autoComplete="off" />
                    )}
                    <TextField label="Points" type="number" value={form.points}
                        onChange={v => handleField('points', v)}
                        error={errors.points}
                        helpText="Positive points reduce health when the issue matches. Negative points add a health bonus."
                        autoComplete="off" suffix="pts" />
                    <Select label="Status"
                        options={[
                            { label: 'Active — applied when scoring', value: 'true' },
                            { label: 'Inactive — skipped',            value: 'false' },
                        ]}
                        value={form.is_active ? 'true' : 'false'}
                        onChange={v => handleField('is_active', v === 'true')} />
                </FormLayout>
            </Modal.Section>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE CONFIRM MODAL
// ─────────────────────────────────────────────────────────────────────────────
function DeleteConfirmModal({ open, rule, onClose, onConfirm, deleting }) {
    if (!rule) return null;
    const isGlobal = rule.is_global;
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={isGlobal ? 'Disable global rule' : 'Delete rule'}
            primaryAction={{
                content: isGlobal ? 'Disable for my shop' : 'Delete',
                destructive: true, loading: deleting, onAction: onConfirm,
            }}
            secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
        >
            <Modal.Section>
                {isGlobal ? (
                    <BlockStack gap="200">
                        <Banner tone="warning">
                            <p><strong>{rule.rule_name}</strong> is a global rule. Disabling it creates a shop-specific inactive copy.</p>
                        </Banner>
                        <Text as="p" tone="subdued">The global rule remains for other shops. Run "Recalculate All Scores" to apply the change.</Text>
                    </BlockStack>
                ) : (
                    <BlockStack gap="200">
                        <Text as="p">Are you sure you want to delete <strong>{rule.rule_name}</strong>? This cannot be undone.</Text>
                        <Text as="p" tone="subdued">Run "Recalculate All Scores" afterwards to update product scores.</Text>
                    </BlockStack>
                )}
            </Modal.Section>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function ProductScoringDashboard() {

    // ── Ziggy query contains { shop: "..." } — spread into every route() call
    const { query } = usePage().props.ziggy;

    // Derive the shop domain from the Ziggy query for building admin URLs
    const shopDomain = query?.shop || null;

    // ── Data state ────────────────────────────────────────────────────────
    const [products,       setProducts]       = useState([]);
    const [stats,          setStats]          = useState(null);
    const [paginationMeta, setPaginationMeta] = useState(null);

    // ── Detail modal state ────────────────────────────────────────────────
    // detailProductId = null means modal is closed; set to a product ID to open it
    const [detailProductId, setDetailProductId] = useState(null);

    // ── Loading / feedback state ──────────────────────────────────────────
    const [productsLoading, setProductsLoading] = useState(true);
    const [statsLoading,    setStatsLoading]    = useState(true);
    const [syncLoading,     setSyncLoading]     = useState(false);
    const [rescoreLoading,  setRescoreLoading]  = useState(false);
    // Map of product ID → boolean for per-row rescore loading
    const [rowRescoreLoading, setRowRescoreLoading] = useState({});
    const [error,    setError]    = useState(null);
    const [feedback, setFeedback] = useState(null); // { type: 'success'|'critical', text: '' }

    // ── Filter state ──────────────────────────────────────────────────────
    const [search,        setSearch]        = useState('');
    const [scoreLevel,    setScoreLevel]    = useState('');
    const [statusFilter,  setStatusFilter]  = useState('');
    // IndexFilters sort — a single "field dir" string in an array, e.g. ['score desc']
    const [sortSelected,  setSortSelected]  = useState(['score asc']);
    const [sortBy,        setSortBy]        = useState('score');
    const [sortDirection, setSortDirection] = useState('asc');
    const [currentPage,   setCurrentPage]   = useState(1);
    const [filterVersion, setFilterVersion] = useState(0);
    const { mode, setMode } = useSetIndexFiltersMode();

    // ── Scoring rules state ───────────────────────────────────────────────
    const [rules,          setRules]          = useState([]);
    const [rulesLoading,   setRulesLoading]   = useState(true);
    const [rulesChanged,   setRulesChanged]   = useState(false);
    const [ruleFormOpen,   setRuleFormOpen]   = useState(false);
    const [editingRule,    setEditingRule]     = useState(null);
    const [ruleSaving,     setRuleSaving]      = useState(false);
    const [ruleDeleteOpen, setRuleDeleteOpen] = useState(false);
    const [deletingRule,   setDeletingRule]    = useState(null);
    const [ruleDeleting,   setRuleDeleting]    = useState(false);
    const [hasActiveFilters ,   setHasActiveFilters]    = useState(false);
    

    // ── IndexTable selection (Polaris built-in) ───────────────────────────
    const { selectedResources, allResourcesSelected, handleSelectionChange } =
        useIndexResourceState(products, { resourceIDResolver: (p) => String(p.id) });

    // ─────────────────────────────────────────────────────────────────────
    // API CALLS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Load stats bar data from GET /dashboard/stats
     */
    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const response = await fetch(route('dashboard.stats', { ...query }));
            if (!response.ok) throw new Error('Stats request failed');
            const result = await response.json();
            setStats(result.data);
        } catch (err) {
            // Stats failing shouldn't block the whole page
            console.error('[ProductScoring] Stats fetch failed:', err);
        } finally {
            setStatsLoading(false);
        }
    }, [query]);

    /**
     * Load products list from GET /products with current filters applied.
     * Called on mount and whenever a filter/sort/page changes.
     */
    const fetchProducts = useCallback(async () => {
        setProductsLoading(true);
        setError(null);
        try {
            const params = {
                ...query,
                page: 1,
                per_page: 5,
                sort_by: 'score',
                sort_direction: 'asc',
            };

            const response = await fetch(route('products.index', params));
            if (!response.ok) throw new Error('Products request failed');
            const result = await response.json();

            setProducts(result.data   || []);
            setPaginationMeta(result.meta || null);
        } catch (err) {
            setError('Failed to load products. Please try again.');
            console.error('[ProductScoring] Products fetch failed:', err);
        } finally {
            setProductsLoading(false);
        }
    }, [query]);

    /**
     * Trigger a full product sync from Shopify (POST /products/sync).
     * Runs synchronously — waits for the real result, then reloads products + stats.
     */
    const handleSync = async () => {
        setSyncLoading(true);
        setFeedback(null);
        try {
            const response = await fetch(route('products.sync', { ...query }), { method: 'POST' });
            const result = await response.json();
            const type = result.success ? 'success' : 'critical';
            setFeedback({ type, text: result.message || 'Sync complete.' });
            if (result.success) {
                // Reload products and stats immediately — data is ready now
                fetchStats();
                setCurrentPage(1);
                setFilterVersion(v => v + 1);
            }
        } catch (err) {
            setFeedback({ type: 'critical', text: 'Sync request failed.' });
        } finally {
            setSyncLoading(false);
        }
    };

    /**
     * Recalculate scores for ALL products (POST /scores/recalculate-all).
     * Runs synchronously — waits for the real result, then reloads products + stats.
     */
    const handleRescoreAll = async () => {
        setRescoreLoading(true);
        setFeedback(null);
        try {
            const response = await fetch(route('scores.recalculate-all', { ...query }), { method: 'POST' });
            const result = await response.json();
            const type = result.success ? 'success' : 'critical';
            setFeedback({ type, text: result.message || 'Scoring complete.' });
            if (result.success) {
                // Reload to show the new scores immediately
                fetchStats();
                setFilterVersion(v => v + 1);
            }
        } catch (err) {
            setFeedback({ type: 'critical', text: 'Scoring request failed.' });
        } finally {
            setRescoreLoading(false);
        }
    };

    /**
     * Recalculate score for a single product (POST /products/{id}/recalculate-score).
     * Runs synchronously — reloads the product list so the new score shows immediately.
     */
    const handleRescoreOne = async (productId, productTitle) => {
        setRowRescoreLoading(prev => ({ ...prev, [productId]: true }));
        setFeedback(null);
        try {
            const response = await fetch(
                route('products.recalculate-score', { ...query, id: productId }),
                { method: 'POST' }
            );
            const result = await response.json();
            const type = result.success ? 'success' : 'critical';
            setFeedback({ type, text: result.message || `Rescored "${productTitle}".` });
            if (result.success) {
                fetchStats();
                setFilterVersion(v => v + 1);
            }
        } catch (err) {
            setFeedback({ type: 'critical', text: `Failed to rescore "${productTitle}".` });
        } finally {
            setRowRescoreLoading(prev => ({ ...prev, [productId]: false }));
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    // SCORING RULES — API CALLS
    // ─────────────────────────────────────────────────────────────────────

    const fetchRules = useCallback(async () => {
        setRulesLoading(true);
        try {
            const res    = await fetch(route('scoring-rules.index', { ...query }));
            const result = await res.json();
            setRules(result.data || []);
        } catch (err) {
            console.error('[ScoringRules] Fetch failed:', err);
        } finally {
            setRulesLoading(false);
        }
    }, [query]);

    const handleRuleSave = useCallback(async (formData) => {
        setRuleSaving(true);
        try {
            const isEdit = editingRule !== null;
            const url    = isEdit
                ? route('scoring-rules.update', { ...query, id: editingRule.id })
                : route('scoring-rules.store', { ...query });
            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(formData),
            });
            const result = await res.json();
            if (!res.ok) {
                const msg = result.errors ? Object.values(result.errors)[0]?.[0] : result.message || 'Save failed.';
                setFeedback({ type: 'critical', text: msg });
                return;
            }
            setRuleFormOpen(false);
            setFeedback({ type: 'success', text: result.message });
            setRulesChanged(true);
            fetchRules();
        } catch {
            setFeedback({ type: 'critical', text: 'Save failed. Please try again.' });
        } finally {
            setRuleSaving(false);
        }
    }, [editingRule, query, fetchRules]);

    const handleRuleDelete = useCallback(async () => {
        if (!deletingRule) return;
        setRuleDeleting(true);
        try {
            const res    = await fetch(route('scoring-rules.destroy', { ...query, id: deletingRule.id }), { method: 'DELETE' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Delete failed.');
            setRuleDeleteOpen(false);
            setDeletingRule(null);
            setFeedback({ type: 'success', text: result.message });
            setRulesChanged(true);
            fetchRules();
        } catch (err) {
            setFeedback({ type: 'critical', text: err.message });
        } finally {
            setRuleDeleting(false);
        }
    }, [deletingRule, query, fetchRules]);

    // ─────────────────────────────────────────────────────────────────────
    // EFFECTS — load data on mount and when filters change
    // ─────────────────────────────────────────────────────────────────────

    // Load stats + rules once on mount
    useEffect(() => {
        fetchStats();
        fetchRules();
    }, []);

    // Reload products when refresh is requested (sync/rescore actions)
    useEffect(() => {
        fetchProducts();
    }, [filterVersion]);

    const topReason = useMemo(() => {
        const reasonMap = new Map();

        products.forEach((product) => {
            const reason = reasonText((product.score_breakdown || product.score_info?.reasons || [])[0]);
            if (!reason) return;
            const key = reason.length > 80 ? `${reason.substring(0, 80)}...` : reason;
            reasonMap.set(key, (reasonMap.get(key) || 0) + 1);
        });

        const ranked = [...reasonMap.entries()].sort((a, b) => b[1] - a[1]);
        return ranked[0] || null;
    }, [products]);

    const attentionCount =
        (stats?.low_health_products || 0) +
        (stats?.medium_health_products || 0);

    // ─────────────────────────────────────────────────────────────────────
    // INDEXFILTERS — sort options, filters, applied filters
    // ─────────────────────────────────────────────────────────────────────
    const sortOptions = [
        { label: 'Score',        value: 'score desc',      directionLabel: 'Highest first' },
        { label: 'Score',        value: 'score asc',       directionLabel: 'Lowest first'  },
        { label: 'Title',        value: 'title asc',       directionLabel: 'A–Z'           },
        { label: 'Title',        value: 'title desc',      directionLabel: 'Z–A'           },
        { label: 'Price',        value: 'price desc',      directionLabel: 'Highest first' },
        { label: 'Price',        value: 'price asc',       directionLabel: 'Lowest first'  },
        { label: 'Inventory',    value: 'inventory desc',  directionLabel: 'Highest first' },
        { label: 'Inventory',    value: 'inventory asc',   directionLabel: 'Lowest first'  },
        { label: 'Last updated', value: 'updated_at desc', directionLabel: 'Newest first'  },
    ];

    const filtersConfig = [
        {
            key:    'scoreLevel',
            label:  'Score level',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Score level"
                    titleHidden
                    choices={SCORE_LEVEL_OPTIONS}
                    selected={scoreLevel ? [scoreLevel] : []}
                    onChange={([val]) => setScoreLevel(val || '')}
                />
            ),
        },
        {
            key:    'statusFilter',
            label:  'Status',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Product status"
                    titleHidden
                    choices={[
                        { label: 'Active',   value: 'active'   },
                        { label: 'Draft',    value: 'draft'    },
                        { label: 'Archived', value: 'archived' },
                    ]}
                    selected={statusFilter ? [statusFilter] : []}
                    onChange={([val]) => setStatusFilter(val || '')}
                />
            ),
        },
    ];

    const appliedFilters = useMemo(() => {
        const af = [];
        if (scoreLevel)   af.push({ key: 'scoreLevel',   label: `Level: ${scoreLevel}`,    onRemove: () => setScoreLevel('') });
        if (statusFilter) af.push({ key: 'statusFilter', label: `Status: ${statusFilter}`, onRemove: () => setStatusFilter('') });
        return af;
    }, [scoreLevel, statusFilter]);

    // ─────────────────────────────────────────────────────────────────────
    // TABLE COLUMNS
    // ─────────────────────────────────────────────────────────────────────
    const columnHeadings = [
        { title: 'Image',         width: '60px' },
        { title: 'Product',       width: '220px' },
        { title: 'Vendor',        width: '120px' },
        { title: 'Status',        width: '90px' },
        { title: 'Price',         width: '80px' },
        { title: 'Inventory',     width: '90px' },
        { title: 'Score',         width: '120px' },
        { title: 'Level',         width: '100px' },
        { title: 'Top reason',    width: '200px' },
        { title: 'Last updated',  width: '110px' },
        { title: '',              width: '90px' },   // Actions column (no heading)
    ];

    // ─────────────────────────────────────────────────────────────────────
    // TABLE ROWS
    // ─────────────────────────────────────────────────────────────────────
    const rowMarkup = products.map((product, index) => {
        const score      = product.score;
        const level      = product.score_info?.level || (score !== null ? levelFromScore(score) : null);
        // Show the first reason from the score breakdown as a preview in the table
        const topReason  = reasonText((product.score_breakdown || product.score_info?.reasons || [])[0]);

        return (
            <IndexTable.Row
                id={String(product.id)}
                key={product.id}
                selected={selectedResources.includes(String(product.id))}
                position={index}
            >
                {/* Image */}
                <IndexTable.Cell>
                    <Thumbnail
                        source={product.image_url || ImageIcon}
                        alt={product.title}
                        size="small"
                    />
                </IndexTable.Cell>

                {/* Title */}
                <IndexTable.Cell>
                    <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {product.title}
                        </Text>
                        {product.product_type && (
                            <Text variant="bodySm" tone="subdued" as="span">
                                {product.product_type}
                            </Text>
                        )}
                    </BlockStack>
                </IndexTable.Cell>

                {/* Vendor */}
                <IndexTable.Cell>
                    <Text variant="bodySm" as="span">{product.vendor || '–'}</Text>
                </IndexTable.Cell>

                {/* Status badge */}
                <IndexTable.Cell>
                    <Badge
                        tone={
                            product.status === 'active'   ? 'success' :
                            product.status === 'archived' ? 'critical' :
                            'warning'
                        }
                    >
                        {product.status ? product.status.charAt(0).toUpperCase() + product.status.slice(1) : '–'}
                    </Badge>
                </IndexTable.Cell>

                {/* Price */}
                <IndexTable.Cell>
                    <Text variant="bodySm" as="span">
                        {product.price != null ? `$${parseFloat(product.price).toFixed(2)}` : '–'}
                    </Text>
                </IndexTable.Cell>

                {/* Inventory */}
                <IndexTable.Cell>
                    <Text
                        variant="bodySm"
                        as="span"
                        tone={product.inventory_quantity === 0 ? 'critical' : product.inventory_quantity < 10 ? 'caution' : undefined}
                    >
                        {product.inventory_quantity ?? '–'}
                    </Text>
                </IndexTable.Cell>

                {/* Score bar */}
                <IndexTable.Cell>
                    <ScoreIndicator score={score} compact />
                </IndexTable.Cell>

                {/* Level badge */}
                <IndexTable.Cell>
                    <PriorityBadge level={level} />
                </IndexTable.Cell>

                {/* Top reason (truncated) */}
                <IndexTable.Cell>
                    {topReason ? (
                        <Tooltip content={topReason}>
                            <Text variant="bodySm" tone="subdued" as="span">
                                {topReason.length > 58 ? `${topReason.substring(0, 58)}...` : topReason}
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text tone="subdued" as="span">–</Text>
                    )}
                </IndexTable.Cell>

                {/* Last updated */}
                <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued" as="span">
                        {formatDate(product.shopify_updated_at)}
                    </Text>
                </IndexTable.Cell>

                {/* Actions */}
                <IndexTable.Cell>
                    <ProductActions
                        product={product}
                        shopDomain={shopDomain}
                        onRecalculate={handleRescoreOne}
                        onViewDetail={(id) => setDetailProductId(id)}
                    />
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    // ─────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────
    return (
        <Box paddingInline="600">
                {/* Product Score Detail Modal */}
                <ScoreDetailModal
                    open={detailProductId !== null}
                    productId={detailProductId}
                    query={query}
                    onClose={() => setDetailProductId(null)}
                    onRescored={(msg) => {
                        setDetailProductId(null);
                        setFeedback({ type: 'success', text: msg });
                    }}
                />

                {/* Scoring Rule Form Modal */}
                <RuleFormModal
                    open={ruleFormOpen}
                    initialData={editingRule}
                    onClose={() => setRuleFormOpen(false)}
                    onSave={handleRuleSave}
                    saving={ruleSaving}
                />

                {/* Delete / Disable Confirm Modal */}
                <DeleteConfirmModal
                    open={ruleDeleteOpen}
                    rule={deletingRule}
                    onClose={() => { setRuleDeleteOpen(false); setDeletingRule(null); }}
                    onConfirm={handleRuleDelete}
                    deleting={ruleDeleting}
                />

                <Page
                    title="Dynamic Product Scoring Engine"
                    subtitle="Prioritise products based on inventory, price, recency, and completeness."
                    fullWidth
                    primaryAction={{
                        content:     'Sync Products',
                        icon:        RefreshIcon,
                        loading:     syncLoading,
                        onAction:    handleSync,
                    }}
                    secondaryActions={[
                        {
                            content: 'Scoring Rules',
                            onAction: () => {
                                window.location.href = route('scoring-rules.page', { ...query });
                            },
                        },
                        {
                            content:  'Recalculate All Scores',
                            loading:  rescoreLoading,
                            onAction: handleRescoreAll,
                        },
                    ]}
                >
                    <BlockStack gap="500">

                        {/* ── Feedback banner ─────────────────────────────── */}
                        {feedback && (
                            <Banner
                                tone={feedback.type}
                                onDismiss={() => setFeedback(null)}
                            >
                                <p>{feedback.text}</p>
                            </Banner>
                        )}

                        {/* ── Error banner ─────────────────────────────────── */}
                        {error && (
                            <Banner tone="critical" onDismiss={() => setError(null)}>
                                <p>{error}</p>
                            </Banner>
                        )}

                        {/* ── Stats grid ────────────────────────────────────── */}
                        <Card>
                            <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm" as="h2">Overview</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Snapshot of current product health
                                    </Text>
                                </InlineStack>
                                {statsLoading ? (
                                    <Box padding="300">
                                        <SkeletonBodyText lines={4} />
                                    </Box>
                                ) : (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                        gap: 12,
                                    }}>
                                        <DashboardStatCard label="Total Products" value={stats?.total_products} helper="Products currently synced" />
                                        <DashboardStatCard label="Low Health" value={stats?.low_health_products} helper="Immediate attention required" tone="critical" emphasisLabel="Priority" />
                                        <DashboardStatCard label="Medium Health" value={stats?.medium_health_products} helper="Optimize soon" tone="warning" />
                                        <DashboardStatCard label="High Health" value={stats?.high_health_products} helper="Performing well" tone="caution" />
                                        <DashboardStatCard label="Excellent Health" value={stats?.excellent_health_products} helper="Strong products" tone="success" />
                                        <DashboardStatCard label="Average Score" value={stats?.average_score != null ? `${stats.average_score} pts` : '–'} helper="Across scored products" />
                                        <DashboardStatCard label="Last Product Sync" value={formatDate(stats?.last_sync_time)} helper="Last successful product sync" />
                                        <DashboardStatCard label="Last Score Calculation" value={formatDate(stats?.last_score_calculation_time)} helper="Last scoring run time" />
                                    </div>
                                )}
                            </BlockStack>
                        </Card>

                        <div style={{
                            display: 'grid',
                            gap: 12,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        }}>
                            <InsightCard
                                title="Products Needing Attention"
                                body={`${attentionCount} products currently have Low or Medium health.`}
                                tone={attentionCount > 0 ? 'critical' : 'success'}
                                footer="Focus on these first for the fastest quality lift."
                            />
                            <InsightCard
                                title="Score Distribution"
                                body={`Low ${stats?.low_health_products || 0} • Medium ${stats?.medium_health_products || 0} • High ${stats?.high_health_products || 0} • Excellent ${stats?.excellent_health_products || 0}`}
                                footer="Based on the latest score calculation."
                            />
                            <InsightCard
                                title="Most Common Issue"
                                body={topReason ? `${topReason[0]}` : 'No scoring reasons available yet.'}
                                footer={topReason ? `Appears in ${topReason[1]} product(s) on this page.` : 'Run scoring to surface issue patterns.'}
                            />
                            <InsightCard
                                title="Sync and Scoring Status"
                                body={
                                    stats?.last_sync_time
                                        ? `Synced ${formatDate(stats?.last_sync_time)} and scored ${formatDate(stats?.last_score_calculation_time)}.`
                                        : 'No successful sync yet. Start with Sync Products.'
                                }
                                footer="Use Sync Products and Recalculate All Scores to refresh insights."
                            />
                        </div>

                        {/* ── Top attention products table ───────────────────── */}
                        <Card padding="0">
                            <Box padding="400">
                                <InlineStack align="space-between" blockAlign="center">
                                    <BlockStack gap="100">
                                        <Text variant="headingSm" as="h2">Top Products Needing Attention</Text>
                                        <Text variant="bodySm" tone="subdued" as="p">
                                            Showing the 5 highest scoring products that need merchant attention.
                                        </Text>
                                    </BlockStack>
                                    <Button
                                        onClick={() => {
                                            window.location.href = route('products-analytics.page', { ...query });
                                        }}
                                    >
                                        View all products
                                    </Button>
                                </InlineStack>
                            </Box>
                            {productsLoading ? (
                                /* Loading state */
                                <Box padding="800">
                                    <BlockStack gap="300">
                                        <InlineStack align="center" blockAlign="center" gap="200">
                                            <Spinner size="large" />
                                            <Text tone="subdued">Loading products and scoring data...</Text>
                                        </InlineStack>
                                        <SkeletonBodyText lines={3} />
                                    </BlockStack>
                                </Box>
                            ) : products.length === 0 ? (
                                /* Empty state */
                                <EmptyState
                                    heading="No products found"
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                    action={
                                        hasActiveFilters
                                            ? { content: 'Clear filters', onAction: clearFilters }
                                            : { content: 'Sync Products', onAction: handleSync, loading: syncLoading }
                                    }
                                >
                                    <p>
                                        {hasActiveFilters
                                            ? 'No products match your current filters.'
                                            : 'Sync your Shopify products first, then run "Recalculate All Scores".'}
                                    </p>
                                </EmptyState>
                            ) : (
                                /* Product table */
                                <div className="ProductsTableWrap">
                                    {error && (
                                        <Box padding="300">
                                            <Banner
                                                tone="critical"
                                                title="Could not refresh product table"
                                                action={{ content: 'Retry', onAction: fetchProducts }}
                                            >
                                                <p>{error}</p>
                                            </Banner>
                                        </Box>
                                    )}
                                    <ProductTable
                                        products={products}
                                        shopDomain={shopDomain}
                                        onRecalculate={handleRescoreOne}
                                        onViewDetail={(id) => setDetailProductId(id)}
                                        rowRescoreLoading={rowRescoreLoading}
                                        selectable={false}
                                    />
                                </div>
                            )}
                        </Card>

                        <style>{`
                            .ProductsTableWrap [class*="Polaris-IndexTable__ScrollBarContainer"] {
                                display: none !important;
                            }

                            .ProductsTableWrap [class*="Polaris-IndexTable__ScrollLeft"],
                            .ProductsTableWrap [class*="Polaris-IndexTable__ScrollRight"] {
                                display: none !important;
                            }
                        `}</style>

                    </BlockStack>
                </Page>

                <style>{`
                    .ProductsTableWrap [class*="Polaris-IndexTable__ScrollBarContainer"] {
                        display: none !important;
                    }

                    .ProductsTableWrap [class*="Polaris-IndexTable__ScrollLeft"],
                    .ProductsTableWrap [class*="Polaris-IndexTable__ScrollRight"] {
                        display: none !important;
                    }
                `}</style>
        </Box>

    );
}

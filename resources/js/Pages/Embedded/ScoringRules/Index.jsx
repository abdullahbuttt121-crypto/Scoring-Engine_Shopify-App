/**
 * ScoringRules/Index.jsx
 *
 * Path: resources/js/Pages/Embedded/ScoringRules/Index.jsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PAGE DOES
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets merchants view, create, edit, toggle, and delete scoring rules.
 *
 * Each scoring rule defines one condition that adds points to a product score:
 *   "If [rule_type] [operator] [value] → add [points] points"
 *
 * For example:
 *   "If inventory less_than 10  → +30 points"
 *   "If status equals draft     → +20 points"
 *   "If image empty             → +15 points"
 *
 * GLOBAL vs SHOP RULES:
 * ─────────────────────
 * Global rules (seeded as defaults) are shown with a "Global" badge.
 * Merchants can edit or disable them — the backend creates a shop-specific
 * copy and leaves the global rule untouched.
 *
 * AFTER CHANGES:
 * ────────────────
 * Rule changes automatically queue a safe background rescore for the shop.
 *
 * API CALLS:
 * ──────────
 *   GET    /scoring-rules         → load all rules on mount
 *   POST   /scoring-rules         → create new rule
 *   PUT    /scoring-rules/{id}    → update rule
 *   DELETE /scoring-rules/{id}    → delete or disable rule
 *   POST   /scores/recalculate-all → trigger full rescore after rule changes
 */

import {
    Badge,
    Banner,
    BlockStack,
    Box,
    Button,
    Card,
    ChoiceList,
    Divider,
    EmptyState,
    FormLayout,
    IndexFilters,
    IndexTable,
    InlineStack,
    Modal,
    Page,
    Pagination,
    Select,
    SkeletonBodyText,
    Spinner,
    Text,
    TextField,
    Tooltip,
    useIndexResourceState,
    useSetIndexFiltersMode,
} from '@shopify/polaris';
import {
    EditIcon,
    DeleteIcon,
    PlusIcon,
    RefreshIcon,
    AlertCircleIcon,
    CheckCircleIcon,
    LockIcon,
} from '@shopify/polaris-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePage } from '@inertiajs/react';
import DashboardStatCard from '@/Components/Scoring/DashboardStatCard';
import InsightCard from '@/Components/Scoring/InsightCard';
import { SCORE_LEVEL_OPTIONS } from '@/Config/scoring';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — must stay in sync with ScoringRule PHP model constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid rule types. The label is shown in the UI; the value is sent to the API.
 * Each type maps to a specific product field in ProductScoringService.
 */
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

/**
 * All valid operators. Some are only valid for certain rule types.
 * `allowedFor` lists the types that can use this operator — used to filter the
 * dropdown so merchants can't choose a meaningless combination.
 */
const OPERATORS = [
    { label: 'equals',           value: 'equals',         allowedFor: ['status', 'vendor', 'tags'],                needsValue: true  },
    { label: 'not equals',       value: 'not_equals',     allowedFor: ['status', 'vendor', 'tags'],                needsValue: true  },
    { label: 'contains',         value: 'contains',       allowedFor: ['tags', 'vendor', 'description'],           needsValue: true  },
    { label: 'less than',        value: 'less_than',      allowedFor: ['price', 'inventory', 'recency'],           needsValue: true  },
    { label: 'greater than',     value: 'greater_than',   allowedFor: ['price', 'inventory', 'recency'],           needsValue: true  },
    { label: 'older than (days)','value': 'older_than_days', allowedFor: ['recency'],                              needsValue: true  },
    { label: 'is empty',         value: 'empty',          allowedFor: ['image', 'description', 'tags', 'vendor'],  needsValue: false },
    { label: 'is not empty',     value: 'not_empty',      allowedFor: ['image', 'description', 'tags', 'vendor'],  needsValue: false },
];

/** Maps rule type → readable label */
const TYPE_LABEL   = Object.fromEntries(RULE_TYPES.map(t => [t.value, t.label]));
/** Maps operator value → readable label */
const OP_LABEL     = Object.fromEntries(OPERATORS.map(o => [o.value, o.label]));

// ─────────────────────────────────────────────────────────────────────────────
// BLANK FORM STATE — used when opening the "Create" modal
// ─────────────────────────────────────────────────────────────────────────────
const BLANK_FORM = {
    rule_name:          '',
    rule_type:          'inventory',
    condition_operator: 'less_than',
    condition_value:    '',
    points:             '10',
    score_effect:       'subtract',
    is_active:          true,
    sort_order:         '',
    condition_tree: {
        node_type: 'group', combinator: 'all',
        children: [{ node_type: 'condition', rule_type: 'inventory', operator: 'less_than', value: '' }],
    },
    action_type: 'attention',
    recommendation: '',
};

const ACTION_OPTIONS = [
    { label: 'Needs attention', value: 'attention' },
    { label: 'Promote', value: 'promote' },
    { label: 'Optimize', value: 'optimize' },
    { label: 'Restock', value: 'restock' },
    { label: 'Review', value: 'review' },
];

function newCondition() {
    return { node_type: 'condition', rule_type: 'inventory', operator: 'less_than', value: '' };
}

function updateTreeNode(node, path, updater) {
    if (path.length === 0) return updater(node);
    const [index, ...rest] = path;
    return { ...node, children: node.children.map((child, i) => i === index ? updateTreeNode(child, rest, updater) : child) };
}

function ConditionTreeEditor({ node, path = [], onChange, onRemove, depth = 0 }) {
    if (node.node_type === 'condition') {
        const available = operatorsFor(node.rule_type);
        return (
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                    <InlineStack gap="200" wrap={false} blockAlign="end">
                        <div style={{ flex: 1 }}><Select label="Product field" options={RULE_TYPES} value={node.rule_type} onChange={(rule_type) => {
                            const operator = operatorsFor(rule_type)[0]?.value || '';
                            onChange(path, () => ({ ...node, rule_type, operator, value: '' }));
                        }} /></div>
                        <div style={{ flex: 1 }}><Select label="Condition" options={available} value={node.operator} onChange={(operator) => onChange(path, () => ({ ...node, operator, value: operatorNeedsValue(operator) ? node.value : null }))} /></div>
                        {operatorNeedsValue(node.operator) && <div style={{ flex: 1 }}><TextField label="Value" value={String(node.value ?? '')} onChange={(value) => onChange(path, () => ({ ...node, value }))} autoComplete="off" /></div>}
                        {onRemove && <Button tone="critical" onClick={onRemove}>Remove</Button>}
                    </InlineStack>
                </BlockStack>
            </Box>
        );
    }

    return (
        <Box padding="300" borderColor="border" borderWidth="025" borderRadius="300">
            <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                    <Select label={depth === 0 ? 'Match logic' : 'Nested group logic'} labelHidden={false} options={[{ label: 'ALL conditions (AND)', value: 'all' }, { label: 'ANY condition (OR)', value: 'any' }]} value={node.combinator} onChange={(combinator) => onChange(path, () => ({ ...node, combinator }))} />
                    {onRemove && <Button tone="critical" onClick={onRemove}>Remove group</Button>}
                </InlineStack>
                {(node.children || []).map((child, index) => (
                    <ConditionTreeEditor key={`${path.join('-')}-${index}`} node={child} path={[...path, index]} depth={depth + 1} onChange={onChange} onRemove={() => onChange(path, (group) => ({ ...group, children: group.children.filter((_, i) => i !== index) }))} />
                ))}
                <InlineStack gap="200">
                    <Button onClick={() => onChange(path, (group) => ({ ...group, children: [...group.children, newCondition()] }))}>Add condition</Button>
                    {depth < 4 && <Button onClick={() => onChange(path, (group) => ({ ...group, children: [...group.children, { node_type: 'group', combinator: 'all', children: [newCondition()] }] }))}>Add nested group</Button>}
                </InlineStack>
            </BlockStack>
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns operators valid for the given rule_type */
function operatorsFor(ruleType) {
    return OPERATORS.filter(op => op.allowedFor.includes(ruleType));
}

/** Returns true if the selected operator requires a condition_value */
function operatorNeedsValue(operatorValue) {
    const op = OPERATORS.find(o => o.value === operatorValue);
    return op ? op.needsValue : true;
}

function conditionTreeSummary(node) {
    if (!node) return '';
    if (node.node_type === 'condition') {
        const value = operatorNeedsValue(node.operator) ? ` "${node.value}"` : '';
        return `${TYPE_LABEL[node.rule_type] || node.rule_type} ${OP_LABEL[node.operator] || node.operator}${value}`;
    }
    const joiner = node.combinator === 'any' ? ' OR ' : ' AND ';
    return `(${(node.children || []).map(conditionTreeSummary).join(joiner)})`;
}

/** Validates the form before submission. Returns error object (empty = valid). */
function validateForm(form) {
    const errors = {};
    if (!form.rule_name.trim())          errors.rule_name = 'Rule name is required.';
    const pts = parseInt(form.points, 10);
    if (isNaN(pts))                      errors.points = 'Points must be a number.';
    else if (pts < 0 || pts > 10000) errors.points = 'Points must be between 0 and 10,000.';
    if (!errors.rule_name && form.rule_name.length > 100)
        errors.rule_name = 'Rule name must be 100 characters or fewer.';
    const validateNode = (node) => {
        if (node.node_type === 'group') {
            if (!node.children?.length) return false;
            return node.children.every(validateNode);
        }
        return Boolean(node.rule_type && node.operator && (!operatorNeedsValue(node.operator) || String(node.value ?? '').trim()));
    };
    if (!validateNode(form.condition_tree)) errors.condition_tree = 'Every group needs a valid condition and every required value must be filled in.';
    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE FORM MODAL — shared for both create and edit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RuleFormModal
 *
 * Renders a Polaris Modal with all the fields for one scoring rule.
 *
 * Props:
 *   open         boolean       — whether modal is visible
 *   initialData  object|null   — if editing, the existing rule; null = create
 *   onClose      fn()          — close without saving
 *   onSave       fn(formData)  — called with validated form when Save is clicked
 *   saving       boolean       — shows spinner on Save button
 */
function RuleFormModal({ open, initialData, onClose, onSave, saving }) {
    const isEdit = initialData !== null;

    // Initialise form from existing rule when editing, or blank when creating
    const [form,   setForm]   = useState(BLANK_FORM);
    const [errors, setErrors] = useState({});

    // Reset form when modal opens/closes or the editing target changes
    useEffect(() => {
        if (open) {
            if (initialData) {
                const existingTree = initialData.condition_tree || newCondition();
                setForm({
                    rule_name:          initialData.rule_name || '',
                    rule_type:          initialData.rule_type || 'inventory',
                    condition_operator: initialData.condition_operator || 'less_than',
                    condition_value:    initialData.condition_value ?? '',
                    points:             String(initialData.points ?? 10),
                    score_effect:       initialData.score_effect || 'subtract',
                    is_active:          initialData.is_active !== false,
                    sort_order:         String(initialData.sort_order ?? ''),
                    condition_tree:     existingTree.node_type === 'group'
                        ? existingTree
                        : { node_type: 'group', combinator: 'all', children: [existingTree] },
                    action_type:        initialData.action_type || 'attention',
                    recommendation:     initialData.recommendation || '',
                });
            } else {
                setForm(structuredClone(BLANK_FORM));
            }
            setErrors({});
        }
    }, [open, initialData]);

    // When rule_type changes, reset the operator to the first valid one
    const handleTypeChange = useCallback((newType) => {
        const validOps = operatorsFor(newType);
        setForm(f => ({
            ...f,
            rule_type:          newType,
            condition_operator: validOps[0]?.value || '',
            condition_value:    '',
        }));
        setErrors(e => ({ ...e, rule_type: undefined, condition_operator: undefined }));
    }, []);

    const handleField = useCallback((field, value) => {
        setForm(f => ({ ...f, [field]: value }));
        setErrors(e => ({ ...e, [field]: undefined }));
    }, []);

    // When operator changes, clear condition_value if the new operator doesn't need it
    const handleOperatorChange = useCallback((op) => {
        setForm(f => ({
            ...f,
            condition_operator: op,
            condition_value: operatorNeedsValue(op) ? f.condition_value : '',
        }));
        setErrors(e => ({ ...e, condition_operator: undefined, condition_value: undefined }));
    }, []);

    const handleSubmit = () => {
        const errs = validateForm(form);
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }
        onSave({
            rule_name:          form.rule_name.trim(),
            rule_type:          form.rule_type,
            condition_operator: form.condition_operator,
            condition_value:    operatorNeedsValue(form.condition_operator) ? form.condition_value.trim() : null,
            points:             parseInt(form.points, 10),
            score_effect:       form.score_effect,
            is_active:          form.is_active,
            sort_order:         form.sort_order !== '' ? parseInt(form.sort_order, 10) : null,
            condition_tree:     form.condition_tree,
            action_type:        form.action_type || null,
            recommendation:     form.recommendation.trim() || null,
        });
    };

    const handleTreeChange = useCallback((path, updater) => {
        setForm(current => ({ ...current, condition_tree: updateTreeNode(current.condition_tree, path, updater) }));
        setErrors(current => ({ ...current, condition_tree: undefined }));
    }, []);

    // Operators available for the current rule_type
    const availableOps = useMemo(() => operatorsFor(form.rule_type), [form.rule_type]);

    // Hint text for the current rule type
    const typeHint = RULE_TYPES.find(t => t.value === form.rule_type)?.hint;

    const showValueField = operatorNeedsValue(form.condition_operator);

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

                    {/* Rule name */}
                    <TextField
                        label="Rule name"
                        value={form.rule_name}
                        onChange={v => handleField('rule_name', v)}
                        error={errors.rule_name}
                        helpText="A short label shown in the rules list, e.g. 'Low Stock Warning'."
                        autoComplete="off"
                    />

                    <BlockStack gap="200">
                        <Text variant="headingSm" as="h3">Conditions</Text>
                        <Text variant="bodySm" tone="subdued" as="p">Build nested ALL/AND or ANY/OR groups. Points apply once only when the complete tree matches.</Text>
                        <ConditionTreeEditor node={form.condition_tree} onChange={handleTreeChange} />
                        {errors.condition_tree && <Text tone="critical" as="p">{errors.condition_tree}</Text>}
                    </BlockStack>

                    <div style={{ display: 'none' }}>

                    {/* Rule type */}
                    <Select
                        label="Rule type"
                        options={RULE_TYPES.map(t => ({ label: t.label, value: t.value }))}
                        value={form.rule_type}
                        onChange={handleTypeChange}
                        error={errors.rule_type}
                        helpText={typeHint}
                    />

                    {/* Condition operator — filtered to valid ops for the chosen type */}
                    <Select
                        label="Condition"
                        options={availableOps.map(o => ({ label: o.label, value: o.value }))}
                        value={form.condition_operator}
                        onChange={handleOperatorChange}
                        error={errors.condition_operator}
                        helpText="The comparison to apply to the product field."
                    />

                    {/* Condition value — hidden for empty/not_empty operators */}
                    {showValueField && (
                        <TextField
                            label="Condition value"
                            value={form.condition_value}
                            onChange={v => handleField('condition_value', v)}
                            error={errors.condition_value}
                            helpText={
                                form.rule_type === 'recency'     ? 'Number of days, e.g. 90' :
                                form.rule_type === 'status'      ? 'e.g. active, draft, or archived' :
                                form.rule_type === 'inventory'   ? 'A number, e.g. 10' :
                                form.rule_type === 'price'       ? 'A number, e.g. 100.00' :
                                'The value to compare against.'
                            }
                            autoComplete="off"
                        />
                    )}
                    </div>

                    {/* Points */}
                    <TextField
                        label="Points"
                        type="number"
                        value={form.points}
                        onChange={v => handleField('points', v)}
                        error={errors.points}
                        helpText="Enter the number of points to apply once when the complete condition tree matches."
                        autoComplete="off"
                        suffix="pts"
                    />

                    <Select
                        label="Score effect"
                        options={[
                            { label: 'Subtract / cut points from health', value: 'subtract' },
                            { label: 'Add points to health', value: 'add' },
                        ]}
                        value={form.score_effect}
                        onChange={v => handleField('score_effect', v)}
                        helpText={form.score_effect === 'subtract'
                            ? 'Example: health 100 minus 20 points becomes 80.'
                            : 'Example: health 80 plus 20 points becomes 100.'}
                    />

                    <Select
                        label="Merchant action"
                        options={ACTION_OPTIONS}
                        value={form.action_type}
                        onChange={v => handleField('action_type', v)}
                        helpText="The business action suggested when this rule matches."
                    />

                    <TextField
                        label="Recommendation (optional)"
                        value={form.recommendation}
                        onChange={v => handleField('recommendation', v)}
                        multiline={3}
                        maxLength={1000}
                        showCharacterCount
                        autoComplete="off"
                    />

                    {/* Active toggle */}
                    <Select
                        label="Status"
                        options={[
                            { label: 'Active — rule is applied when scoring', value: 'true' },
                            { label: 'Inactive — rule is skipped',            value: 'false' },
                        ]}
                        value={form.is_active ? 'true' : 'false'}
                        onChange={v => handleField('is_active', v === 'true')}
                        helpText="Inactive rules are stored but not used during score calculation."
                    />

                    {/* Sort order */}
                    <TextField
                        label="Sort order (optional)"
                        type="number"
                        value={form.sort_order}
                        onChange={v => handleField('sort_order', v)}
                        helpText="Lower numbers are evaluated first. Leave blank to add at the end."
                        autoComplete="off"
                    />

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
                content:     isGlobal ? 'Disable for my shop' : 'Delete',
                destructive: true,
                loading:     deleting,
                onAction:    onConfirm,
            }}
            secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
        >
            <Modal.Section>
                {isGlobal ? (
                    <BlockStack gap="300">
                        <Banner tone="warning">
                            <p>
                                <strong>{rule.rule_name}</strong> is a global default rule shared
                                across all shops. It cannot be permanently deleted here.
                            </p>
                        </Banner>
                        <Text as="p">
                            Clicking "Disable for my shop" will create a shop-specific copy with
                            <strong> is_active = false</strong>. The global default remains intact
                            for other shops, but this rule will be skipped for your store.
                        </Text>
                        <Text as="p" tone="subdued">
                            Product rescoring will be queued automatically after disabling.
                        </Text>
                    </BlockStack>
                ) : (
                    <BlockStack gap="200">
                        <Text as="p">
                            Are you sure you want to delete <strong>{rule.rule_name}</strong>?
                        </Text>
                        <Text as="p" tone="subdued">
                            This cannot be undone. Product rescoring will be queued automatically.
                        </Text>
                    </BlockStack>
                )}
            </Modal.Section>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ScoringRulesIndex() {
    const { ziggy } = usePage().props;
    const query     = ziggy?.query || {};

    // ── State ─────────────────────────────────────────────────────────────
    const [rules,        setRules]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [feedback,     setFeedback]     = useState(null);  // { type, text }
    const [rulesChanged, setRulesChanged] = useState(false); // show "rescore" banner

    // Form modal state
    const [formOpen,     setFormOpen]     = useState(false);
    const [editingRule,  setEditingRule]  = useState(null);  // null = create mode
    const [saving,       setSaving]       = useState(false);

    // Delete modal state
    const [deleteOpen,   setDeleteOpen]   = useState(false);
    const [deletingRule, setDeletingRule] = useState(null);
    const [deleting,     setDeleting]     = useState(false);

    // Rescore banner loading
    const [rescoring,    setRescoring]    = useState(false);

    // UI filters
    const [searchValue,   setSearchValue]   = useState('');
    const [typeFilter,    setTypeFilter]    = useState('all');
    const [statusFilter,  setStatusFilter]  = useState('all');
    const [sourceFilter,  setSourceFilter]  = useState('all');
    const [sortSelected,  setSortSelected]  = useState(['order asc']);
    const [sortBy,        setSortBy]        = useState('order');
    const [sortDirection, setSortDirection] = useState('asc');
    const { mode, setMode } = useSetIndexFiltersMode();

    // Pagination — client-side: all rules load at once, we slice for display
    const RULES_PER_PAGE = 10;
    const [rulesPage, setRulesPage] = useState(1);

    const filteredRules = useMemo(() => {
        let next = rules;

        if (searchValue.trim()) {
            const term = searchValue.toLowerCase();
            next = next.filter(rule => {
                const condition = `${OP_LABEL[rule.condition_operator] || rule.condition_operator} ${rule.condition_value || ''}`.toLowerCase();
                return (
                    (rule.rule_name || '').toLowerCase().includes(term) ||
                    (TYPE_LABEL[rule.rule_type] || rule.rule_type || '').toLowerCase().includes(term) ||
                    condition.includes(term)
                );
            });
        }

        if (typeFilter !== 'all') {
            next = next.filter(rule => rule.rule_type === typeFilter);
        }

        if (statusFilter !== 'all') {
            const active = statusFilter === 'active';
            next = next.filter(rule => Boolean(rule.is_active) === active);
        }

        if (sourceFilter !== 'all') {
            const global = sourceFilter === 'global';
            next = next.filter(rule => Boolean(rule.is_global) === global);
        }

        next = [...next].sort((a, b) => {
            const dir = sortDirection === 'asc' ? 1 : -1;
            if (sortBy === 'points') {
                return ((a.points || 0) - (b.points || 0)) * dir;
            }
            if (sortBy === 'name') {
                return (a.rule_name || '').localeCompare(b.rule_name || '') * dir;
            }
            const aOrder = a.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(a.sort_order);
            const bOrder = b.sort_order == null ? Number.MAX_SAFE_INTEGER : Number(b.sort_order);
            return (aOrder - bOrder) * dir;
        });

        return next;
    }, [rules, searchValue, typeFilter, statusFilter, sourceFilter, sortBy, sortDirection]);

    const pagedRules = filteredRules.slice((rulesPage - 1) * RULES_PER_PAGE, rulesPage * RULES_PER_PAGE);
    const totalPages = Math.max(1, Math.ceil(filteredRules.length / RULES_PER_PAGE));

    const summary = useMemo(() => ({
        total: rules.length,
        active: rules.filter(rule => rule.is_active).length,
        inactive: rules.filter(rule => !rule.is_active).length,
        global: rules.filter(rule => rule.is_global).length,
    }), [rules]);

    const ruleHealth = useMemo(() => {
        if (summary.total === 0) return null;
        const activePct = Math.round((summary.active / summary.total) * 100);
        return {
            activePct,
            statusText: activePct >= 70 ? 'Healthy coverage' : 'Needs activation review',
        };
    }, [summary]);

    // ── Load rules on mount ───────────────────────────────────────────────
    const fetchRules = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res    = await fetch(route('scoring-rules.index', query));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result = await res.json();
            setRules(result.data || []);
            setRulesPage(1); // always go back to page 1 after a reload
        } catch (err) {
            setError('Could not load scoring rules. Please refresh the page.');
            console.error('[ScoringRules] Fetch failed:', err);
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => { fetchRules(); }, []);

    useEffect(() => {
        setRulesPage(1);
    }, [searchValue, typeFilter, statusFilter, sourceFilter, sortBy, sortDirection]);

    const handleSort = useCallback((selected) => {
        setSortSelected(selected);
        const [field, direction] = (selected[0] || 'order asc').split(' ');
        setSortBy(field || 'order');
        setSortDirection(direction || 'asc');
    }, []);

    const clearFilters = useCallback(() => {
        setSearchValue('');
        setTypeFilter('all');
        setStatusFilter('all');
        setSourceFilter('all');
    }, []);

    const sortOptions = [
        { label: 'Order', value: 'order asc', directionLabel: 'Low to high' },
        { label: 'Order', value: 'order desc', directionLabel: 'High to low' },
        { label: 'Points', value: 'points desc', directionLabel: 'Highest first' },
        { label: 'Points', value: 'points asc', directionLabel: 'Lowest first' },
        { label: 'Rule name', value: 'name asc', directionLabel: 'A-Z' },
        { label: 'Rule name', value: 'name desc', directionLabel: 'Z-A' },
    ];

    const filtersConfig = [
        {
            key: 'type',
            label: 'Type',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Type"
                    titleHidden
                    choices={RULE_TYPES.map(type => ({ label: type.label, value: type.value }))}
                    selected={typeFilter === 'all' ? [] : [typeFilter]}
                    onChange={([value]) => setTypeFilter(value || 'all')}
                />
            ),
        },
        {
            key: 'status',
            label: 'Status',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Status"
                    titleHidden
                    choices={[
                        { label: 'Active', value: 'active' },
                        { label: 'Inactive', value: 'inactive' },
                    ]}
                    selected={statusFilter === 'all' ? [] : [statusFilter]}
                    onChange={([value]) => setStatusFilter(value || 'all')}
                />
            ),
        },
        {
            key: 'source',
            label: 'Source',
            shortcut: true,
            filter: (
                <ChoiceList
                    title="Source"
                    titleHidden
                    choices={[
                        { label: 'Global', value: 'global' },
                        { label: 'Custom', value: 'custom' },
                    ]}
                    selected={sourceFilter === 'all' ? [] : [sourceFilter]}
                    onChange={([value]) => setSourceFilter(value || 'all')}
                />
            ),
        },
    ];

    const appliedFilters = useMemo(() => {
        const items = [];
        if (typeFilter !== 'all') {
            items.push({ key: 'type', label: `Type: ${TYPE_LABEL[typeFilter] || typeFilter}`, onRemove: () => setTypeFilter('all') });
        }
        if (statusFilter !== 'all') {
            items.push({ key: 'status', label: `Status: ${statusFilter}`, onRemove: () => setStatusFilter('all') });
        }
        if (sourceFilter !== 'all') {
            items.push({ key: 'source', label: `Source: ${sourceFilter}`, onRemove: () => setSourceFilter('all') });
        }
        return items;
    }, [typeFilter, statusFilter, sourceFilter]);

    // ── Create / Edit ─────────────────────────────────────────────────────

    const openCreate = () => { setEditingRule(null); setFormOpen(true); };

    const openEdit = (rule) => { setEditingRule(rule); setFormOpen(true); };

    const handleSave = useCallback(async (formData) => {
        setSaving(true);
        try {
            const isEdit = editingRule !== null;
            const url    = isEdit
                ? route('scoring-rules.update', { ...query, id: editingRule.id })
                : route('scoring-rules.store', query);
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(formData),
            });
            const result = await res.json();

            if (!res.ok) {
                // Show server validation errors if present
                const firstError = result.errors
                    ? Object.values(result.errors)[0]?.[0]
                    : result.message || 'Save failed.';
                setFeedback({ type: 'critical', text: firstError });
                return;
            }

            setFormOpen(false);
            setFeedback({ type: 'success', text: result.message });
            setRulesChanged(false);
            await fetchRules();
        } catch (err) {
            setFeedback({ type: 'critical', text: 'Save failed. Please try again.' });
        } finally {
            setSaving(false);
        }
    }, [editingRule, query, fetchRules]);

    // ── Toggle active state inline ────────────────────────────────────────

    const handleToggleActive = useCallback(async (rule) => {
        try {
            const res = await fetch(
                route('scoring-rules.update', { ...query, id: rule.id }),
                {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ is_active: !rule.is_active }),
                }
            );
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Toggle failed.');
            setFeedback({ type: 'success', text: result.message });
            setRulesChanged(false);
            await fetchRules();
        } catch (err) {
            setFeedback({ type: 'critical', text: err.message });
        }
    }, [query, fetchRules]);

    // ── Delete ────────────────────────────────────────────────────────────

    const openDelete = (rule) => { setDeletingRule(rule); setDeleteOpen(true); };

    const handleDelete = useCallback(async () => {
        if (!deletingRule) return;
        setDeleting(true);
        try {
            const res = await fetch(
                route('scoring-rules.destroy', { ...query, id: deletingRule.id }),
                { method: 'DELETE' }
            );
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Delete failed.');
            setDeleteOpen(false);
            setDeletingRule(null);
            setFeedback({ type: 'success', text: result.message });
            setRulesChanged(false);
            await fetchRules();
        } catch (err) {
            setFeedback({ type: 'critical', text: err.message });
        } finally {
            setDeleting(false);
        }
    }, [deletingRule, query, fetchRules]);

    // ── Recalculate all scores ────────────────────────────────────────────

    const handleRescoreAll = useCallback(async () => {
        setRescoring(true);
        try {
            const res    = await fetch(route('scores.recalculate-all', query), { method: 'POST' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Rescore failed.');
            setFeedback({ type: 'success', text: result.message });
            setRulesChanged(false);
        } catch (err) {
            setFeedback({ type: 'critical', text: err.message });
        } finally {
            setRescoring(false);
        }
    }, [query]);

    // ── Table rows ────────────────────────────────────────────────────────

    /*
     * Polaris IndexTable needs a list of resources with an `id` field.
     * We pass `rules` directly — each rule already has `id`.
     */
    const { selectedResources, allResourcesSelected, handleSelectionChange } =
        useIndexResourceState(filteredRules, {
            resourceIDResolver: (rule) => String(rule.id),
        });

    // Use only the current page's slice for the table rows
    const rowMarkup = pagedRules.map((rule, index) => (
        <IndexTable.Row
            id={String(rule.id)}
            key={rule.id}
            selected={selectedResources.includes(String(rule.id))}
            position={index}
        >
            {/* Rule name + global badge */}
            <IndexTable.Cell>
                <InlineStack gap="200" blockAlign="center">
                    <Text variant="bodyMd" fontWeight="semibold" as="span">{rule.rule_name}</Text>
                    {rule.is_global && (
                        <Badge tone="info" size="small">Global</Badge>
                    )}
                </InlineStack>
            </IndexTable.Cell>

            {/* Type */}
            <IndexTable.Cell>
                <Badge>{TYPE_LABEL[rule.rule_type] || rule.rule_type}</Badge>
            </IndexTable.Cell>

            {/* Condition summary */}
            <IndexTable.Cell>
                <Text variant="bodySm" tone="subdued" as="span">
                    {conditionTreeSummary(rule.condition_tree)}
                </Text>
            </IndexTable.Cell>

            {/* Points */}
            <IndexTable.Cell>
                <Text
                    variant="bodyMd"
                    fontWeight="semibold"
                    tone={rule.score_effect === 'add' ? 'success' : 'critical'}
                    as="span"
                >
                    {rule.score_effect === 'add' ? '+' : '−'}{rule.points} pts
                </Text>
            </IndexTable.Cell>

            {/* Sort order */}
            <IndexTable.Cell>
                <Text variant="bodySm" tone="subdued" as="span">{rule.sort_order}</Text>
            </IndexTable.Cell>

            {/* Active status */}
            <IndexTable.Cell>
                <Badge tone={rule.is_active ? 'success' : 'new'}>
                    {rule.is_active ? 'Active' : 'Inactive'}
                </Badge>
            </IndexTable.Cell>

            {/* Actions */}
            <IndexTable.Cell>
                <InlineStack gap="150">
                    <Tooltip content="Edit rule">
                        <Button
                            icon={EditIcon}
                            variant="plain"
                            size="slim"
                            onClick={() => openEdit(rule)}
                            accessibilityLabel={`Edit ${rule.rule_name}`}
                        />
                    </Tooltip>
                    <Tooltip content={rule.is_active ? 'Deactivate rule' : 'Activate rule'}>
                        <Button
                            icon={rule.is_active ? CheckCircleIcon : AlertCircleIcon}
                            variant="plain"
                            size="slim"
                            tone={rule.is_active ? 'success' : undefined}
                            onClick={() => handleToggleActive(rule)}
                            accessibilityLabel={rule.is_active ? 'Deactivate' : 'Activate'}
                        />
                    </Tooltip>
                    <Tooltip content={rule.is_global ? 'Disable global rule for this shop' : 'Delete rule'}>
                        <Button
                            icon={rule.is_global ? LockIcon : DeleteIcon}
                            variant="plain"
                            size="slim"
                            tone="critical"
                            onClick={() => openDelete(rule)}
                            accessibilityLabel={rule.is_global ? 'Disable' : 'Delete'}
                        />
                    </Tooltip>
                </InlineStack>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <Box paddingInline="600" paddingBlock="500">
            {/* Form modal (create + edit) */}
            <RuleFormModal
                open={formOpen}
                initialData={editingRule}
                onClose={() => setFormOpen(false)}
                onSave={handleSave}
                saving={saving}
            />

            {/* Delete confirmation modal */}
            <DeleteConfirmModal
                open={deleteOpen}
                rule={deletingRule}
                onClose={() => { setDeleteOpen(false); setDeletingRule(null); }}
                onConfirm={handleDelete}
                deleting={deleting}
            />

            <Page
                title="Scoring Rules"
                subtitle="Define business conditions that reduce product health and surface the products needing attention first."
                primaryAction={{
                    content: 'Create rule',
                    icon:    PlusIcon,
                    onAction: openCreate,
                }}
                secondaryActions={[
                    {
                        content: 'Open Product Dashboard',
                        onAction: () => {
                            window.location.href = route('scoring', { ...query });
                        },
                    },
                    {
                        content: 'Refresh rules',
                        icon: RefreshIcon,
                        onAction: fetchRules,
                    },
                ]}
            >
                <BlockStack gap="400">

                    <Card>
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingSm" as="h2">Rules Overview</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                    Maintain reliable and explainable scoring logic
                                </Text>
                            </InlineStack>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                <DashboardStatCard label="Total Rules" value={summary.total} helper="All available scoring rules" />
                                <DashboardStatCard label="Active Rules" value={summary.active} helper="Rules currently used during scoring" tone="success" emphasisLabel="Live" />
                                <DashboardStatCard label="Inactive Rules" value={summary.inactive} helper="Stored but ignored by scoring" tone="subdued" />
                                <DashboardStatCard label="Global Defaults" value={summary.global} helper="Shared default rules" tone="info" />
                            </div>
                        </BlockStack>
                    </Card>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                        <InsightCard
                            title="Activation Health"
                            body={ruleHealth ? `${ruleHealth.activePct}% of rules are active.` : 'No rules available yet.'}
                            tone={ruleHealth && ruleHealth.activePct >= 70 ? 'success' : 'warning'}
                            footer={ruleHealth?.statusText || 'Create your first rule to enable scoring.'}
                        />
                        <InsightCard
                            title="Rule Sources"
                            body={`${summary.global} global defaults and ${summary.total - summary.global} custom shop rules.`}
                            footer="Global rules are shared, custom rules belong only to your shop."
                        />
                        <InsightCard
                            title="Rule Changes"
                            body={rulesChanged ? 'A manual rescore is available.' : 'Rule changes automatically queue product rescoring.'}
                            tone={rulesChanged ? 'warning' : 'success'}
                            footer="Use the manual rescore only when you want to refresh immediately."
                        />
                    </div>

                    {/* Feedback banner */}
                    {feedback && (
                        <Banner
                            tone={feedback.type === 'success' ? 'success' : 'critical'}
                            onDismiss={() => setFeedback(null)}
                        >
                            <p>{feedback.text}</p>
                        </Banner>
                    )}

                    {/* "Rules changed — rescore" prompt */}
                    {rulesChanged && (
                        <Banner
                            tone="warning"
                            title="Rules changed — product scores may be out of date"
                            action={{
                                content: 'Recalculate all scores now',
                                loading: rescoring,
                                onAction: handleRescoreAll,
                            }}
                            onDismiss={() => setRulesChanged(false)}
                        >
                            <p>
                                Score changes are not applied automatically. Click the button to
                                re-evaluate all products against the updated rule set.
                            </p>
                        </Banner>
                    )}

                    {/* Rules table */}
                    <Card padding="0">
                        <Box padding="400">
                            <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm" as="h2">Rule Library</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">{filteredRules.length} matching rule(s)</Text>
                                </InlineStack>
                                <IndexFilters
                                    queryValue={searchValue}
                                    queryPlaceholder="Search by rule name, type, condition..."
                                    onQueryChange={setSearchValue}
                                    onQueryClear={() => setSearchValue('')}
                                    sortOptions={sortOptions}
                                    sortSelected={sortSelected}
                                    onSort={handleSort}
                                    filters={filtersConfig}
                                    appliedFilters={appliedFilters}
                                    onClearAll={clearFilters}
                                    mode={mode}
                                    setMode={setMode}
                                    tabs={[]}
                                    cancelAction={{
                                        onAction: clearFilters,
                                        disabled:
                                            !searchValue &&
                                            typeFilter === 'all' &&
                                            statusFilter === 'all' &&
                                            sourceFilter === 'all',
                                    }}
                                    selected={0}
                                    canCreateNewView={false}
                                />
                            </BlockStack>
                        </Box>
                        <Divider />
                        {loading ? (
                            <Box padding="600">
                                <BlockStack gap="300">
                                    <InlineStack align="center">
                                        <Spinner size="large" />
                                    </InlineStack>
                                    <SkeletonBodyText lines={3} />
                                </BlockStack>
                            </Box>
                        ) : error ? (
                            <Box padding="600">
                                <Banner tone="critical" action={{ content: 'Retry', onAction: fetchRules }}>
                                    <p>{error}</p>
                                </Banner>
                            </Box>
                        ) : filteredRules.length === 0 ? (
                            <EmptyState
                                heading="No rules match your current filters"
                                image=""
                                action={{
                                    content: rules.length === 0 ? 'Create your first rule' : 'Clear filters',
                                    onAction: rules.length === 0
                                        ? openCreate
                                        : clearFilters,
                                }}
                            >
                                <p>
                                    {rules.length === 0
                                        ? 'Scoring rules define which conditions reduce product health and which merchant action to take. Create a rule to get started.'
                                        : 'Try changing your filters to see more rules.'}
                                </p>
                            </EmptyState>
                        ) : (
                            <>
                            <div className="RulesTableWrap">
                                <IndexTable
                                    resourceName={{ singular: 'rule', plural: 'rules' }}
                                    itemCount={filteredRules.length}
                                    selectedItemsCount={
                                        allResourcesSelected ? 'All' : selectedResources.length
                                    }
                                    onSelectionChange={handleSelectionChange}
                                    headings={[
                                        { title: 'Rule name' },
                                        { title: 'Type' },
                                        { title: 'Condition' },
                                        { title: 'Points' },
                                        { title: 'Order' },
                                        { title: 'Status' },
                                        { title: 'Actions' },
                                    ]}
                                >
                                    {rowMarkup}
                                </IndexTable>
                            </div>
                            {/* Pagination controls */}
                            <Box padding="0">
                                <div style={{
                                    borderTop: '1px solid #e1e3e5',
                                    background: 'linear-gradient(180deg, #ffffff 0%, #f6f6f7 100%)',
                                    padding: '14px 16px',
                                }}>
                                <BlockStack gap="200">
                                    <InlineStack align="center">
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            border: '1px solid #d2d5d8',
                                            borderRadius: 999,
                                            background: '#fff',
                                            padding: '6px 10px',
                                        }}>
                                            <Pagination
                                                hasPrevious={rulesPage > 1}
                                                onPrevious={() => setRulesPage(p => p - 1)}
                                                hasNext={rulesPage < totalPages}
                                                onNext={() => setRulesPage(p => p + 1)}
                                                label={`Page ${rulesPage} of ${totalPages}`}
                                            />
                                        </div>
                                    </InlineStack>
                                </BlockStack>
                                </div>
                            </Box>
                            </>
                        )}
                    </Card>

                    <style>{`
                        .RulesTableWrap [class*="Polaris-IndexTable__ScrollBarContainer"] {
                            display: none !important;
                        }

                        .RulesTableWrap [class*="Polaris-IndexTable__ScrollLeft"],
                        .RulesTableWrap [class*="Polaris-IndexTable__ScrollRight"] {
                            display: none !important;
                        }
                    `}</style>

                    {/* How scoring works info card */}
                    <Card>
                        <BlockStack gap="300">
                            <Text variant="headingSm" as="h2">How scoring works</Text>
                            <Divider />
                            <BlockStack gap="200">
                                <Text as="p" tone="subdued">
                                    Products start with 100 health points. When a complete nested condition tree
                                    matches, the selected Add or Subtract effect is applied exactly once.
                                </Text>
                                <Text as="p" tone="subdued">
                                    Score levels: {SCORE_LEVEL_OPTIONS.map(option => <span key={option.value}><Badge tone={option.value === 'low' ? 'critical' : option.value === 'medium' ? 'warning' : option.value === 'high' ? 'attention' : 'success'}>{option.label}</Badge>&nbsp;</span>)}
                                </Text>
                                <Text as="p" tone="subdued">
                                    <strong>Global rules</strong> are shared defaults visible to all shops.
                                    Editing or disabling a global rule creates a shop-specific copy — the
                                    original is never modified.
                                </Text>
                                <Text as="p" tone="subdued">
                                    After adding or changing rules, product rescoring is queued automatically.
                                </Text>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                </BlockStack>
            </Page>
        </Box>
    );
}

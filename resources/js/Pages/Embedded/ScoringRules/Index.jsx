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
 * Rule changes don't automatically rescore all products (expensive for large
 * catalogs). A "Recalculate All Scores" banner appears after any change.
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
    is_active:          true,
    sort_order:         '',
};

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

/** Validates the form before submission. Returns error object (empty = valid). */
function validateForm(form) {
    const errors = {};
    if (!form.rule_name.trim())          errors.rule_name = 'Rule name is required.';
    if (!form.rule_type)                 errors.rule_type = 'Rule type is required.';
    if (!form.condition_operator)        errors.condition_operator = 'Operator is required.';
    if (operatorNeedsValue(form.condition_operator) && !form.condition_value.trim()) {
        errors.condition_value = 'A condition value is required for this operator.';
    }
    const pts = parseInt(form.points, 10);
    if (isNaN(pts))                      errors.points = 'Points must be a number.';
    else if (pts < -10000 || pts > 10000) errors.points = 'Points must be between -10,000 and 10,000.';
    if (!errors.rule_name && form.rule_name.length > 100)
        errors.rule_name = 'Rule name must be 100 characters or fewer.';
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
            is_active:          form.is_active,
            sort_order:         form.sort_order !== '' ? parseInt(form.sort_order, 10) : null,
        });
    };

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

                    {/* Points */}
                    <TextField
                        label="Points"
                        type="number"
                        value={form.points}
                        onChange={v => handleField('points', v)}
                        error={errors.points}
                        helpText="Positive = adds to risk score. Negative = reduces score. Range: -10,000 to 10,000."
                        autoComplete="off"
                        suffix="pts"
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
                            After disabling, click "Recalculate All Scores" to update your product scores.
                        </Text>
                    </BlockStack>
                ) : (
                    <BlockStack gap="200">
                        <Text as="p">
                            Are you sure you want to delete <strong>{rule.rule_name}</strong>?
                        </Text>
                        <Text as="p" tone="subdued">
                            This cannot be undone. Click "Recalculate All Scores" afterwards to
                            update your product scores.
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
            setRulesChanged(true);
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
            setRulesChanged(true);
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
            setRulesChanged(true);
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
                    {OP_LABEL[rule.condition_operator] || rule.condition_operator}
                    {operatorNeedsValue(rule.condition_operator) && rule.condition_value != null
                        ? ` "${rule.condition_value}"`
                        : ''}
                </Text>
            </IndexTable.Cell>

            {/* Points */}
            <IndexTable.Cell>
                <Text
                    variant="bodyMd"
                    fontWeight="semibold"
                    tone={rule.points > 0 ? 'critical' : rule.points < 0 ? 'success' : undefined}
                    as="span"
                >
                    {rule.points >= 0 ? `+${rule.points}` : rule.points} pts
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
        
        <Box paddingInline="300">
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
                subtitle="Define which product conditions add points to the risk score. Higher score = more merchant attention needed."
                primaryAction={{
                    content: 'Create rule',
                    icon:    PlusIcon,
                    onAction: openCreate,
                }}
            >
                <BlockStack gap="400">

                    <Card>
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingSm" as="h2">Rules Overview</Text>
                                <Button icon={RefreshIcon} onClick={fetchRules}>Refresh</Button>
                            </InlineStack>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                gap: 12,
                            }}>
                                <Card>
                                    <BlockStack gap="100">
                                        <Text tone="subdued" variant="bodySm" as="p">Total rules</Text>
                                        <Text variant="headingLg" as="p">{summary.total}</Text>
                                    </BlockStack>
                                </Card>
                                <Card>
                                    <BlockStack gap="100">
                                        <Text tone="subdued" variant="bodySm" as="p">Active</Text>
                                        <Text variant="headingLg" as="p" tone="success">{summary.active}</Text>
                                    </BlockStack>
                                </Card>
                                <Card>
                                    <BlockStack gap="100">
                                        <Text tone="subdued" variant="bodySm" as="p">Inactive</Text>
                                        <Text variant="headingLg" as="p" tone="subdued">{summary.inactive}</Text>
                                    </BlockStack>
                                </Card>
                                <Card>
                                    <BlockStack gap="100">
                                        <Text tone="subdued" variant="bodySm" as="p">Global defaults</Text>
                                        <Text variant="headingLg" as="p" tone="info">{summary.global}</Text>
                                    </BlockStack>
                                </Card>
                            </div>
                        </BlockStack>
                    </Card>

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
                            <BlockStack gap="00">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingSm" as="h2">Rule Library</Text>
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
                                <InlineStack align="center">
                                    <Spinner size="large" />
                                </InlineStack>
                            </Box>
                        ) : error ? (
                            <Box padding="600">
                                <Banner tone="critical"><p>{error}</p></Banner>
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
                                        ? 'Scoring rules define which product conditions add points to the risk score. Create a rule to get started.'
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
                                    When a product is scored, the engine evaluates every <strong>active</strong> rule
                                    against the product's data. For each rule that matches, the rule's points are
                                    added to the total score.
                                </Text>
                                <Text as="p" tone="subdued">
                                    Score levels: <Badge tone="success">Low (0–30)</Badge>&nbsp;
                                    <Badge tone="warning">Medium (31–60)</Badge>&nbsp;
                                    <Badge tone="attention">High (61–100)</Badge>&nbsp;
                                    <Badge tone="critical">Critical (101+)</Badge>
                                </Text>
                                <Text as="p" tone="subdued">
                                    <strong>Global rules</strong> are shared defaults visible to all shops.
                                    Editing or disabling a global rule creates a shop-specific copy — the
                                    original is never modified.
                                </Text>
                                <Text as="p" tone="subdued">
                                    After adding or changing rules, use <strong>"Recalculate all scores"</strong> on
                                    the Product Scoring page (or the banner above) to apply the changes.
                                </Text>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                </BlockStack>
            </Page>
        </Box>
    );
}

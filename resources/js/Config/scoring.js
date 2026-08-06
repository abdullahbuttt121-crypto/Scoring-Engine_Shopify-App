export const SCORE_LEVELS = {
    low: { label: 'Low', min: 0, max: 30, color: '#d72c0d', tone: 'critical' },
    medium: { label: 'Medium', min: 31, max: 60, color: '#f3c94b', tone: 'warning' },
    high: { label: 'High', min: 61, max: 89, color: '#8b5a2b', tone: 'attention' },
    excellent: { label: 'Excellent', min: 90, max: null, color: '#21a67a', tone: 'success' },
};

export const SCORE_LEVEL_OPTIONS = Object.entries(SCORE_LEVELS).map(([value, meta]) => ({
    value,
    label: `${meta.label} (${meta.min}${meta.max === null ? '+' : `–${meta.max}`})`,
}));

export function levelFromScore(score) {
    if (score === null || score === undefined) return null;
    return Object.entries(SCORE_LEVELS).find(([, meta]) =>
        Number(score) >= meta.min && (meta.max === null || Number(score) <= meta.max)
    )?.[0] || 'low';
}

export function scoreLevelMeta(level) {
    return SCORE_LEVELS[level] || { label: level, color: '#8c9196', tone: 'subdued' };
}

export function reasonText(reason) {
    if (!reason) return '';
    return typeof reason === 'string' ? reason : (reason.reason || reason.label || 'Matched rule');
}

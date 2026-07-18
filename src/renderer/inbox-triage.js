import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';

const MAX_DAYS = 90;
const MAX_DAILY_ITEMS = 3;
const CAPTURE_MARKER = '专注中随手收集';

function createdAt(task) {
    return Number.isFinite(Number(task?.createdAt)) ? Number(task.createdAt) : 0;
}

function cleanIds(value) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map((id) => String(id || '').trim().slice(0, 80))
        .filter(Boolean))].slice(0, MAX_DAILY_ITEMS);
}

export function isCapturedThought(task) {
    return todoBucket(task) === 'inbox'
        && String(task?.note || '').includes(CAPTURE_MARKER);
}

export function buildInboxTriage({ todos = [], inboxTriage = {}, now = new Date() } = {}) {
    const todayKey = localDateKey(now);
    const thoughts = (Array.isArray(todos) ? todos : [])
        .filter(isCapturedThought)
        .sort((left, right) => createdAt(left) - createdAt(right));
    const latest = [...thoughts].sort((left, right) => createdAt(right) - createdAt(left))[0] || null;
    const record = inboxTriage && typeof inboxTriage === 'object' ? inboxTriage[todayKey] : null;
    const storedIds = cleanIds(record?.taskIds);
    const byId = new Map(thoughts.map((task) => [task.id, task]));
    const hasDailySelection = storedIds.length > 0;
    const offeredIds = hasDailySelection
        ? storedIds
        : thoughts.slice(0, MAX_DAILY_ITEMS).map((task) => task.id);

    return {
        todayKey,
        count: thoughts.length,
        latest,
        hasDailySelection,
        offeredIds,
        candidates: offeredIds.map((id) => byId.get(id)).filter(Boolean),
    };
}

export function inboxTriageRecordPatch({ inboxTriage = {}, date, taskIds = [], now = Date.now() } = {}) {
    const key = localDateKey(date || new Date(now));
    if (!key) return {};
    const next = {
        ...(inboxTriage && typeof inboxTriage === 'object' ? inboxTriage : {}),
        [key]: { taskIds: cleanIds(taskIds), updatedAt: Number.isInteger(now) ? now : Date.now() },
    };
    const dates = Object.keys(next).sort();
    for (const oldDate of dates.slice(0, Math.max(0, dates.length - MAX_DAYS))) delete next[oldDate];
    return next;
}

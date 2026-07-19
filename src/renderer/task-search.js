import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';

const SEARCHABLE_BUCKETS = new Set(['inbox', 'today', 'later', 'waiting', 'archive']);
const BUCKET_ORDER = Object.freeze({ today: 0, inbox: 1, later: 2, waiting: 3, archive: 4 });

export function normalizeTaskSearchQuery(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
}

/** Search active task titles without persisting the user's query. */
export function searchTasks({ todos = [], query = '', now = new Date() } = {}) {
    const needle = normalizeTaskSearchQuery(query);
    if (!needle) return [];
    const today = localDateKey(now);
    return (Array.isArray(todos) ? todos : [])
        .map((task, index) => ({ task, index, bucket: todoBucket(task, today) }))
        .filter(({ task, bucket }) => SEARCHABLE_BUCKETS.has(bucket)
            && normalizeTaskSearchQuery(task?.title).includes(needle))
        .sort((a, b) => (BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]) || (a.index - b.index))
        .map(({ task, bucket }) => ({ task, bucket }));
}

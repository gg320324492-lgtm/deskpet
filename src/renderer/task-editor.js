import { normalizeMicroSteps } from './micro-steps.js';

const TASK_BUCKETS = new Set(['inbox', 'today', 'later', 'archive']);

export function normalizeTaskText(value, maxLength) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

/** Build a safe, self-contained edit patch for a task in the character room. */
export function taskEditorPatch({ task = {}, title, note, microSteps, bucket } = {}, now = new Date()) {
    const nextTitle = normalizeTaskText(title, 120);
    if (!nextTitle) throw new Error('任务标题不能为空。');
    const nextBucket = TASK_BUCKETS.has(bucket) ? bucket : 'inbox';
    const isToday = nextBucket === 'today';
    return {
        title: nextTitle,
        note: normalizeTaskText(note, 240),
        microSteps: normalizeMicroSteps(microSteps),
        bucket: nextBucket,
        dueAt: isToday ? new Date(now).toISOString() : null,
        timeBlock: isToday && task.bucket === 'today' ? task.timeBlock || '' : '',
        tomorrowPlan: '',
    };
}

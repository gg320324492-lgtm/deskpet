import { normalizeMicroSteps } from './micro-steps.js';

const TASK_BUCKETS = new Set(['inbox', 'today', 'later', 'waiting', 'archive']);

export function normalizeTaskText(value, maxLength) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

/** Build a safe, self-contained edit patch for a task in the character room. */
export function taskEditorPatch({ task = {}, title, note, waitingNote, threadNote, microSteps, bucket } = {}, now = new Date()) {
    const nextTitle = normalizeTaskText(title, 120);
    if (!nextTitle) throw new Error('任务标题不能为空。');
    const nextBucket = TASK_BUCKETS.has(bucket) ? bucket : 'inbox';
    const isToday = nextBucket === 'today';
    const nextThreadNote = normalizeTaskText(threadNote, 160);
    const threadAt = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
    return {
        title: nextTitle,
        note: normalizeTaskText(note, 240),
        ...(waitingNote === undefined ? {} : { waitingNote: normalizeTaskText(waitingNote, 160) }),
        ...(threadNote === undefined ? {} : { threadNote: nextThreadNote, threadAt: nextThreadNote && Number.isFinite(threadAt) ? threadAt : (task.threadAt || 0) }),
        microSteps: normalizeMicroSteps(microSteps),
        bucket: nextBucket,
        dueAt: isToday ? new Date(now).toISOString() : null,
        timeBlock: (isToday && ['today', 'waiting'].includes(task.bucket)) || nextBucket === 'waiting' ? task.timeBlock || '' : '',
        tomorrowPlan: '',
    };
}

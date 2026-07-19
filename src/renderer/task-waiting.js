const MAX_WAITING_NOTE_TEXT = 160;

export function normalizeWaitingNote(value) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, MAX_WAITING_NOTE_TEXT);
}

/** Put an unfinished task aside without treating it as complete or overdue. */
export function waitingTaskPatch(note = '') {
    return {
        bucket: 'waiting',
        dueAt: null,
        tomorrowPlan: '',
        waitingNote: normalizeWaitingNote(note),
    };
}

/** Return a waiting task to Today while preserving its other local context. */
export function resumeWaitingTaskPatch(task = {}, now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    const dueAt = Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
    return { bucket: 'today', dueAt, timeBlock: task.timeBlock || '', tomorrowPlan: '' };
}

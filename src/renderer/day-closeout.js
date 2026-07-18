import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';

/** Return a gentle, local-only closing snapshot for the current calendar day. */
export function buildDayCloseout({ todos = [], now = new Date() } = {}) {
    const date = now instanceof Date ? now : new Date(now);
    const todayKey = localDateKey(date);
    const items = Array.isArray(todos) ? todos : [];
    const pending = items.filter((task) => todoBucket(task, todayKey) === 'today');
    const completed = items.filter((task) => task?.completed && localDateKey(task.doneAt) === todayKey).length;
    const later = items.filter((task) => todoBucket(task, todayKey) === 'later').length;
    const summary = pending.length
        ? `今天完成了 ${completed} 件；还有 ${pending.length} 件可以慢慢归位。`
        : `今天完成了 ${completed} 件；其余任务已经妥善归位。`;
    return { todayKey, pending, completed, inProgress: pending.length, later, summary };
}

export function tomorrowDueAt(now = new Date()) {
    const date = now instanceof Date ? new Date(now) : new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.toISOString();
}

/** Map a closeout decision to a safe task patch. */
export function dayCloseoutPatch(action, now = new Date()) {
    if (action === 'tomorrow') return { bucket: 'later', dueAt: tomorrowDueAt(now), timeBlock: '', tomorrowPlan: '' };
    if (action === 'inbox') return { bucket: 'inbox', dueAt: null, timeBlock: '', tomorrowPlan: '' };
    return { bucket: 'later', dueAt: null, timeBlock: '', tomorrowPlan: '' };
}

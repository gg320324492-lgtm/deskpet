import { localDateKey } from './rhythm.js';

export function completedToday({ todos = [], now = new Date() } = {}) {
    const today = localDateKey(now);
    return (Array.isArray(todos) ? todos : [])
        .filter((task) => task?.completed && Number.isFinite(Number(task.doneAt))
            && localDateKey(task.doneAt) === today)
        .sort((left, right) => Number(right.doneAt) - Number(left.doneAt));
}

/** Return the reversible patch for a recently completed task. */
export function restoreCompletedTaskPatch(task = {}, destination = 'today', now = new Date()) {
    const toToday = destination === 'today';
    return {
        completed: false,
        doneAt: null,
        bucket: toToday ? 'today' : 'inbox',
        dueAt: toToday ? new Date(now).toISOString() : null,
        timeBlock: toToday ? task.timeBlock || '' : '',
        tomorrowPlan: '',
    };
}

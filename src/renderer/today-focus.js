import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';

export function buildTodayFocus({ focus = null, todos = [], now = new Date() } = {}) {
    const todayKey = localDateKey(now);
    if (!focus || focus.date !== todayKey || !focus.taskId) return { todayKey, task: null };
    const task = (Array.isArray(todos) ? todos : []).find((item) => item?.id === focus.taskId
        && todoBucket(item, todayKey) === 'today') || null;
    return { todayKey, task };
}

export function todayFocusPatch(task, now = new Date()) {
    if (!task?.id) throw new TypeError('Today focus requires a task id');
    return { date: localDateKey(now), taskId: task.id, updatedAt: new Date(now).valueOf() };
}

export const clearTodayFocusPatch = () => null;

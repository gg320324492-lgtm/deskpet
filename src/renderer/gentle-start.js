import { todoBucket } from './todo.js';
import { buildTodayFocus } from './today-focus.js';

function taskOrder(left, right) {
    const priority = Number(right?.priority || 1) - Number(left?.priority || 1);
    if (priority) return priority;
    return Number(left?.createdAt || 0) - Number(right?.createdAt || 0);
}

export function buildGentleStart({ todos = [], focus = null, now = new Date() } = {}) {
    const list = Array.isArray(todos) ? todos : [];
    const todayFocus = buildTodayFocus({ focus, todos: list, now });
    const todayTasks = list
        .filter((task) => todoBucket(task) === 'today')
        .sort(taskOrder);
    const task = todayFocus.task || todayTasks[0] || null;
    return {
        task,
        isMainline: !!todayFocus.task,
        todayCount: todayTasks.length,
    };
}

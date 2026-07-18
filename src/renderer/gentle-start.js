import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';
import { buildTodayFocus } from './today-focus.js';

function taskOrder(left, right) {
    const nextStep = Number(right?.nextStepAt || 0) - Number(left?.nextStepAt || 0);
    if (nextStep) return nextStep;
    const priority = Number(right?.priority || 1) - Number(left?.priority || 1);
    if (priority) return priority;
    return Number(left?.createdAt || 0) - Number(right?.createdAt || 0);
}

export function buildGentleStart({ todos = [], focus = null, now = new Date() } = {}) {
    const list = Array.isArray(todos) ? todos : [];
    const todayFocus = buildTodayFocus({ focus, todos: list, now });
    const todayKey = localDateKey(now);
    const todayTasks = list
        .filter((task) => todoBucket(task, todayKey) === 'today')
        .sort(taskOrder);
    const followUp = todayTasks.find((item) => Number(item?.nextStepAt || 0) > 0) || null;
    const task = followUp || todayFocus.task || todayTasks[0] || null;
    return {
        task,
        isMainline: !!todayFocus.task && task?.id === todayFocus.task.id,
        isFollowUp: !!followUp && task?.id === followUp.id,
        todayCount: todayTasks.length,
    };
}

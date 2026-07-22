import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';
import { buildTodayFocus } from './today-focus.js';
import { hasFinishedMicroSteps } from './micro-steps.js';
import { hasPendingResumeHint, taskResumeOrder } from './task-resume.js';

export function buildGentleStart({ todos = [], focus = null, now = new Date() } = {}) {
    const list = Array.isArray(todos) ? todos : [];
    const todayFocus = buildTodayFocus({ focus, todos: list, now });
    const todayKey = localDateKey(now);
    const allTodayTasks = list
        .filter((task) => todoBucket(task, todayKey) === 'today')
        .sort(taskResumeOrder);
    const todayTasks = allTodayTasks.filter((task) => !hasFinishedMicroSteps(task) || hasPendingResumeHint(task));
    const followUp = todayTasks.find((item) => hasPendingResumeHint(item)) || null;
    const focusedTask = todayFocus.task && (!hasFinishedMicroSteps(todayFocus.task) || hasPendingResumeHint(todayFocus.task)) ? todayFocus.task : null;
    const task = followUp || focusedTask || todayTasks[0] || null;
    return {
        task,
        isMainline: !!todayFocus.task && task?.id === todayFocus.task.id,
        isFollowUp: !!followUp && task?.id === followUp.id,
        todayCount: allTodayTasks.length,
    };
}

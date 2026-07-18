import { localDateKey } from './rhythm.js';
import { todoBucket } from './todo.js';
import { buildTodayFocus } from './today-focus.js';
import { hasFinishedMicroSteps } from './micro-steps.js';
import { hasPendingResumeHint } from './task-resume.js';

function taskOrder(left, right) {
    const nextStep = (hasPendingResumeHint(right) ? Number(right?.nextStepAt || 0) : 0)
        - (hasPendingResumeHint(left) ? Number(left?.nextStepAt || 0) : 0);
    if (nextStep) return nextStep;
    const priority = Number(right?.priority || 1) - Number(left?.priority || 1);
    if (priority) return priority;
    return Number(left?.createdAt || 0) - Number(right?.createdAt || 0);
}

export function buildGentleStart({ todos = [], focus = null, now = new Date() } = {}) {
    const list = Array.isArray(todos) ? todos : [];
    const todayFocus = buildTodayFocus({ focus, todos: list, now });
    const todayKey = localDateKey(now);
    const allTodayTasks = list
        .filter((task) => todoBucket(task, todayKey) === 'today')
        .sort(taskOrder);
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

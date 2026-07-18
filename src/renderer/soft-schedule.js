import { localDateKey } from './rhythm.js';
import { timeBlockForHour, timeBlockLabel } from './time-blocks.js';
import { todoBucket } from './todo.js';
import { hasFinishedMicroSteps } from './micro-steps.js';
import { hasPendingResumeHint } from './task-resume.js';

const BLOCK_ORDER = ['morning', 'afternoon', 'evening'];

function asDate(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    return Number.isNaN(date.valueOf()) ? new Date() : date;
}

function taskOrder(left, right) {
    const nextStep = (hasPendingResumeHint(right) ? Number(right?.nextStepAt || 0) : 0)
        - (hasPendingResumeHint(left) ? Number(left?.nextStepAt || 0) : 0);
    if (nextStep) return nextStep;
    const priority = Number(right?.priority || 1) - Number(left?.priority || 1);
    if (priority) return priority;
    return Number(left?.createdAt || 0) - Number(right?.createdAt || 0);
}

function tomorrowMorning(date) {
    const due = new Date(date);
    due.setDate(due.getDate() + 1);
    due.setHours(9, 0, 0, 0);
    return due.toISOString();
}

/** The next soft window after this moment; it may be tomorrow morning. */
export function nextSoftTimeBlock(now = new Date()) {
    const date = asDate(now);
    const minutes = date.getHours() * 60 + date.getMinutes();
    if (minutes < 8 * 60) return { id: 'morning', label: timeBlockLabel('morning'), tomorrow: false };
    if (minutes < 13 * 60) return { id: 'afternoon', label: timeBlockLabel('afternoon'), tomorrow: false };
    if (minutes < 19 * 60) return { id: 'evening', label: timeBlockLabel('evening'), tomorrow: false };
    return { id: 'morning', label: timeBlockLabel('morning'), tomorrow: true };
}

/** Safe patch that moves an unfinished task into the next soft window. */
export function nextSoftTimeBlockPatch(now = new Date()) {
    const date = asDate(now);
    const next = nextSoftTimeBlock(date);
    if (next.tomorrow) {
        return { bucket: 'later', dueAt: tomorrowMorning(date), timeBlock: next.id, tomorrowPlan: '' };
    }
    return { bucket: 'today', dueAt: date.toISOString(), timeBlock: next.id, tomorrowPlan: '' };
}

/** Build a quiet, local-only suggestion for the active soft window. */
export function buildSoftSchedule({ todos = [], now = new Date() } = {}) {
    const date = asDate(now);
    const todayKey = localDateKey(date);
    const currentId = timeBlockForHour(date.getHours());
    const currentIndex = BLOCK_ORDER.indexOf(currentId);
    const list = Array.isArray(todos) ? todos : [];
    const todayTasks = list
        .filter((task) => todoBucket(task, todayKey) === 'today' && (!hasFinishedMicroSteps(task) || hasPendingResumeHint(task)))
        .sort(taskOrder);
    const assigned = currentId ? todayTasks.filter((task) => task.timeBlock === currentId) : [];
    const unassigned = todayTasks.filter((task) => !task.timeBlock);
    const resumeTask = todayTasks.find((task) => hasPendingResumeHint(task)) || null;
    const task = resumeTask || assigned[0] || unassigned[0] || null;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const endMinutes = currentId === 'morning' ? 12 * 60 : currentId === 'afternoon' ? 18 * 60 : currentId === 'evening' ? 23 * 60 : 0;
    const nearEnd = !!currentId && endMinutes - minutes <= 60;
    const next = currentId ? nextSoftTimeBlock(date) : null;
    return {
        todayKey,
        currentId,
        currentLabel: currentId ? timeBlockLabel(currentId) : '',
        currentIndex,
        task,
        taskIsAssigned: !!task && task.timeBlock === currentId,
        nearEnd,
        next,
        currentCount: assigned.length,
    };
}

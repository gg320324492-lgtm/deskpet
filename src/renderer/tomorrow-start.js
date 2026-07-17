import { tomorrowDueAt } from './day-closeout.js';
import { localDateKey } from './rhythm.js';

export const TOMORROW_PLAN_ROLES = Object.freeze(['', 'important', 'doable']);

export function tomorrowKey(now = new Date()) {
    const date = now instanceof Date ? new Date(now) : new Date(now);
    date.setDate(date.getDate() + 1);
    return localDateKey(date);
}

export function buildTomorrowStart({ todos = [], now = new Date() } = {}) {
    const dateKey = tomorrowKey(now);
    const planned = (Array.isArray(todos) ? todos : []).filter((task) => task && !task.completed
        && task.dueAt?.slice(0, 10) === dateKey
        && TOMORROW_PLAN_ROLES.includes(task.tomorrowPlan || '')
        && task.tomorrowPlan);
    return {
        dateKey,
        important: planned.find((task) => task.tomorrowPlan === 'important') || null,
        doable: planned.filter((task) => task.tomorrowPlan === 'doable').slice(0, 2),
    };
}

export function canPlanTomorrow({ todos = [], role, now = new Date() } = {}) {
    const plan = buildTomorrowStart({ todos, now });
    if (role === 'important') return !plan.important;
    if (role === 'doable') return plan.doable.length < 2;
    return false;
}

export function tomorrowPlanPatch(role, now = new Date()) {
    if (!['important', 'doable'].includes(role)) throw new TypeError('Unsupported tomorrow plan role');
    return {
        bucket: 'later',
        dueAt: tomorrowDueAt(now),
        timeBlock: '',
        tomorrowPlan: role,
        priority: role === 'important' ? 1 : 2,
    };
}

export function returnToInboxPatch() {
    return { bucket: 'inbox', dueAt: null, timeBlock: '', tomorrowPlan: '' };
}

import { localDateKey } from './rhythm.js';
import { TIME_BLOCKS } from './time-blocks.js';

export function buildTodayStart({ todos = [], now = new Date() } = {}) {
    const todayKey = localDateKey(now);
    const carried = (Array.isArray(todos) ? todos : []).filter((task) => task && !task.completed
        && task.dueAt?.slice(0, 10) === todayKey
        && ['important', 'doable'].includes(task.tomorrowPlan));
    return {
        todayKey,
        important: carried.find((task) => task.tomorrowPlan === 'important') || null,
        doable: carried.filter((task) => task.tomorrowPlan === 'doable').slice(0, 2),
    };
}

export function nextOpenTimeBlock(tasks = []) {
    return TIME_BLOCKS.find((block) => !(Array.isArray(tasks) ? tasks : []).some((task) => task?.timeBlock === block.id)) || TIME_BLOCKS[0];
}

export function beginTodayPatch({ timeBlock = '' } = {}) {
    return {
        tomorrowPlan: '',
        ...(TIME_BLOCKS.some((block) => block.id === timeBlock) ? { timeBlock } : {}),
    };
}

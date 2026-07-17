const DAY = 86_400_000;

export function staleTasks({ todos = [], now = Date.now(), days = 7 } = {}) {
    const cutoff = Number(now) - Math.max(1, days) * DAY;
    return (Array.isArray(todos) ? todos : []).filter((task) => !task?.completed
        && ['inbox', 'later'].includes(task.bucket)
        && Number(task.createdAt || 0) > 0
        && Number(task.createdAt) <= cutoff);
}

export const archiveTaskPatch = () => ({ bucket: 'archive', dueAt: null, timeBlock: '', tomorrowPlan: '' });
export const restoreTaskPatch = () => ({ bucket: 'inbox', dueAt: null, timeBlock: '', tomorrowPlan: '' });

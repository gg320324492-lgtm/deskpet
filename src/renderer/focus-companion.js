const REST_PHASES = new Set(['rest', 'longRest']);

function safeMs(value) {
    return Number.isFinite(value) && value > 0 ? Math.min(value, 24 * 60 * 60 * 1000) : 0;
}

export function formatFocusElapsed(value) {
    const totalMinutes = Math.floor(safeMs(value) / 60_000);
    if (totalMinutes < 1) return '刚刚开始';
    if (totalMinutes < 60) return `已投入 ${totalMinutes} 分钟`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `已投入 ${hours} 小时 ${minutes} 分钟` : `已投入 ${hours} 小时`;
}

export function formatFocusRemaining(value) {
    const totalMinutes = Math.max(1, Math.ceil(safeMs(value) / 60_000));
    if (totalMinutes < 60) return `还剩约 ${totalMinutes} 分钟`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `还剩约 ${hours} 小时 ${minutes} 分钟` : `还剩约 ${hours} 小时`;
}

export function buildFocusCompanion(state = {}) {
    const phase = ['idle', 'work', 'paused', 'rest', 'longRest'].includes(state.phase) ? state.phase : 'idle';
    const task = state.task?.id && state.task?.title ? state.task : null;
    const awaitingDecision = REST_PHASES.has(phase) && state.awaitingDecision === true && !!task;
    const active = phase === 'work' || phase === 'paused';
    const mode = awaitingDecision ? 'decision' : active ? phase : REST_PHASES.has(phase) ? 'rest' : 'idle';
    const copy = {
        work: ['IN THIS MOMENT', '正在陪你走这一段'],
        paused: ['A SOFT PAUSE', '暂停也可以，进度留在这里'],
        decision: ['A SMALL LANDING', '这一段已经走完了'],
        rest: ['RESTING', '先让自己松一口气'],
        idle: ['FOCUS COMPANION', '准备好时，我们再开始'],
    }[mode];
    return {
        phase,
        mode,
        task,
        awaitingDecision,
        active,
        kicker: copy[0],
        heading: copy[1],
        elapsed: formatFocusElapsed(state.elapsedMs),
        remaining: formatFocusRemaining(state.remainingMs),
        message: typeof state.message === 'string' ? state.message.slice(0, 180) : '',
    };
}

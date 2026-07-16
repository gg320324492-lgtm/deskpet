function validHour(value) {
    return Number.isInteger(value) && value >= 0 && value <= 23;
}

export function formatHour(hour) {
    return validHour(hour) ? `${String(hour).padStart(2, '0')}:00` : '—';
}

function atHour(date, hour, dayOffset = 0) {
    const next = new Date(date);
    next.setMinutes(0, 0, 0);
    next.setHours(hour);
    next.setDate(next.getDate() + dayOffset);
    return next;
}

function formatRemaining(ms) {
    const minutes = Math.max(0, Math.round(ms / 60_000));
    if (minutes < 60) return `约 ${minutes} 分钟后`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `约 ${hours} 小时 ${rest} 分钟后` : `约 ${hours} 小时后`;
}

/** Present the effective DND reason and the next scheduled boundary for the room UI. */
export function getDndScheduleStatus(settings = {}, now = new Date()) {
    const start = settings.dndHoursStart;
    const end = settings.dndHoursEnd;
    const manual = !!settings.dndManual;
    const auto = !!settings.dndAutoEnabled;
    if (!auto) {
        return { tone: manual ? 'active' : 'idle', label: manual ? '手动勿扰中' : '定时未启用', detail: manual ? '手动勿扰正在抑制提醒。' : '开启定时勿扰后会显示下一次切换。' };
    }
    if (!validHour(start) || !validHour(end) || start === end) {
        return { tone: manual ? 'active' : 'warning', label: manual ? '手动勿扰中' : '定时未生效', detail: '开始和结束时间相同，定时勿扰不会自动开启。' };
    }
    const hour = now.getHours();
    const scheduled = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    const nextHour = scheduled ? end : start;
    let next = atHour(now, nextHour);
    if (next <= now) next = atHour(now, nextHour, 1);
    const prefix = scheduled ? '定时勿扰中' : '下一次定时开启';
    const label = manual && !scheduled ? '手动勿扰中' : prefix;
    return {
        tone: manual || scheduled ? 'active' : 'idle',
        label,
        detail: `将在 ${formatHour(nextHour)} ${scheduled ? '结束' : '开启'}（${formatRemaining(next - now)}）。`,
        scheduled,
        nextAt: next,
    };
}

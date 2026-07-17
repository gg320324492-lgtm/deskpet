/** Local, bounded daily rhythm ledger shared by the pet and the character room. */
const MAX_EVENTS = 360;
const MAX_REFLECTIONS = 90;

const EVENT_LABELS = Object.freeze({
    'focus-start': '开始专注',
    'focus-complete': '完成专注',
    'focus-skip': '跳过专注',
    'focus-stop': '结束专注',
    'task-complete': '完成任务',
    'scene-change': '切换场景',
});

export function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatRhythmTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return '--:--';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatRhythmEvent(event = {}) {
    const label = EVENT_LABELS[event.type] || '记录事件';
    if (event.type === 'scene-change' && event.title) return `切换到${event.title}`;
    if (event.title) return `${label} · ${event.title}`;
    return label;
}

function clampText(value, max) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeEvent(input, now) {
    const at = Number.isInteger(input.at) && input.at >= 0 ? input.at : now;
    const minutes = Math.max(0, Math.min(1_440, Math.round(Number(input.minutes) || 0)));
    return {
        id: clampText(input.id, 80) || `rhythm-${at}-${Math.random().toString(36).slice(2, 8)}`,
        type: EVENT_LABELS[input.type] ? input.type : 'scene-change',
        at,
        title: clampText(input.title, 120),
        detail: clampText(input.detail, 120),
        minutes,
        ...(clampText(input.taskId, 80) ? { taskId: clampText(input.taskId, 80) } : {}),
    };
}

function currentRhythm(value) {
    const rhythm = value && typeof value === 'object' ? value : {};
    return {
        ...rhythm,
        events: Array.isArray(rhythm.events) ? rhythm.events : [],
        reflections: rhythm.reflections && typeof rhythm.reflections === 'object' && !Array.isArray(rhythm.reflections)
            ? rhythm.reflections : {},
    };
}

export class RhythmTracker {
    constructor({ getSettings, setSettings, now = () => Date.now() }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._now = now;
    }

    snapshot() { return currentRhythm(this._getSettings().rhythm); }

    record(input) {
        const rhythm = this.snapshot();
        const event = normalizeEvent(input || {}, this._now());
        const events = [...rhythm.events, event].slice(-MAX_EVENTS);
        this._setSettings({ rhythm: { ...rhythm, events } });
        return event;
    }

    saveReflection({ date = localDateKey(this._now()), note = '', tomorrow = '' } = {}) {
        const rhythm = this.snapshot();
        const reflection = {
            note: clampText(note, 280),
            tomorrow: clampText(tomorrow, 120),
            updatedAt: this._now(),
        };
        const reflections = { ...rhythm.reflections, [date]: reflection };
        const dates = Object.keys(reflections).sort();
        for (const oldDate of dates.slice(0, Math.max(0, dates.length - MAX_REFLECTIONS))) delete reflections[oldDate];
        this._setSettings({ rhythm: { ...rhythm, reflections } });
        return reflection;
    }
}

function dayOffset(date, offset) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + offset);
    return next;
}

function eventMinutes(event) {
    return ['focus-complete', 'focus-skip', 'focus-stop'].includes(event.type)
        ? Math.max(0, Number(event.minutes) || 0) : 0;
}

export function buildRhythmSummary({ rhythm: value, todos = [], now = new Date(), days = 7 } = {}) {
    const rhythm = currentRhythm(value);
    const today = now instanceof Date ? now : new Date(now);
    const todayKey = localDateKey(today);
    const events = rhythm.events
        .filter((event) => event && typeof event === 'object' && localDateKey(event.at))
        .sort((a, b) => Number(a.at) - Number(b.at));
    const todayEvents = events.filter((event) => localDateKey(event.at) === todayKey);
    const completedTaskIds = new Set(todayEvents.filter((event) => event.type === 'task-complete' && event.taskId).map((event) => event.taskId));
    const openTaskIds = new Set((Array.isArray(todos) ? todos : [])
        .filter((task) => task && !task.completed && (!task.dueAt || task.dueAt.slice(0, 10) <= todayKey))
        .map((task) => task.id)
        .filter(Boolean));
    const plannedTasks = new Set([...completedTaskIds, ...openTaskIds]);
    const focusMinutes = todayEvents.reduce((sum, event) => sum + eventMinutes(event), 0);
    const completedFocus = todayEvents.filter((event) => event.type === 'focus-complete').length;
    const skippedFocus = todayEvents.filter((event) => event.type === 'focus-skip').length;
    const week = Array.from({ length: Math.max(1, Math.min(14, days)) }, (_, index) => {
        const date = dayOffset(today, index - Math.max(1, Math.min(14, days)) + 1);
        const key = localDateKey(date);
        const dayEvents = events.filter((event) => localDateKey(event.at) === key);
        const minutes = dayEvents.reduce((sum, event) => sum + eventMinutes(event), 0);
        const tasks = dayEvents.filter((event) => event.type === 'task-complete').length;
        return {
            date: key,
            weekday: `周${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`,
            day: date.getDate(),
            focusMinutes: minutes,
            tasks,
            level: minutes >= 120 ? 4 : minutes >= 75 ? 3 : minutes >= 25 ? 2 : minutes > 0 ? 1 : 0,
        };
    });

    return {
        todayKey,
        focusMinutes,
        completedFocus,
        skippedFocus,
        completedTasks: completedTaskIds.size,
        plannedTasks: plannedTasks.size,
        completionRate: plannedTasks.size ? Math.round((completedTaskIds.size / plannedTasks.size) * 100) : 0,
        todayEvents: [...todayEvents].reverse(),
        week,
        reflection: rhythm.reflections[todayKey] || { note: '', tomorrow: '', updatedAt: 0 },
    };
}

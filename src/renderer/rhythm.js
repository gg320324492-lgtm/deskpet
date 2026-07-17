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
        weeklyPlans: rhythm.weeklyPlans && typeof rhythm.weeklyPlans === 'object' && !Array.isArray(rhythm.weeklyPlans)
            ? rhythm.weeklyPlans : {},
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
        const previous = rhythm.reflections[date] || {};
        const reflection = {
            note: clampText(note, 280),
            tomorrow: clampText(tomorrow, 120),
            closeout: clampText(previous.closeout, 280),
            updatedAt: this._now(),
        };
        const reflections = { ...rhythm.reflections, [date]: reflection };
        const dates = Object.keys(reflections).sort();
        for (const oldDate of dates.slice(0, Math.max(0, dates.length - MAX_REFLECTIONS))) delete reflections[oldDate];
        this._setSettings({ rhythm: { ...rhythm, reflections } });
        return reflection;
    }

    saveWeeklyPlan({ week = weekStartKey(dayOffset(new Date(this._now()), 7)), goals = [] } = {}) {
        const rhythm = this.snapshot();
        const normalizedGoals = [...new Set((Array.isArray(goals) ? goals : [])
            .map((goal) => clampText(goal, 100))
            .filter(Boolean))].slice(0, 3);
        const weeklyPlans = {
            ...rhythm.weeklyPlans,
            [week]: { goals: normalizedGoals, updatedAt: this._now() },
        };
        const weeks = Object.keys(weeklyPlans).sort();
        for (const oldWeek of weeks.slice(0, Math.max(0, weeks.length - 26))) delete weeklyPlans[oldWeek];
        this._setSettings({ rhythm: { ...rhythm, weeklyPlans } });
        return weeklyPlans[week];
    }
}

function dayOffset(date, offset) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + offset);
    return next;
}

export function weekStartKey(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.valueOf())) return '';
    date.setHours(0, 0, 0, 0);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    return localDateKey(date);
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
        .filter((task) => task && !task.completed && (
            (typeof task.dueAt === 'string' && task.dueAt.slice(0, 10) <= todayKey)
            || (!task.dueAt && task.bucket === 'today')
        ))
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
        reflection: rhythm.reflections[todayKey] || { note: '', tomorrow: '', closeout: '', updatedAt: 0 },
    };
}

export function buildWeeklyReview({ rhythm: value, now = new Date() } = {}) {
    const rhythm = currentRhythm(value);
    const summary = buildRhythmSummary({ rhythm, now, days: 7 });
    const focusMinutes = summary.week.reduce((sum, day) => sum + day.focusMinutes, 0);
    const completedTasks = summary.week.reduce((sum, day) => sum + day.tasks, 0);
    const activeDays = summary.week.filter((day) => day.focusMinutes > 0).length;
    const bestDay = summary.week.reduce((best, day) => day.focusMinutes > (best?.focusMinutes || 0) ? day : best, null);
    const nextWeekKey = weekStartKey(dayOffset(now instanceof Date ? now : new Date(now), 7));
    const goals = rhythm.weeklyPlans[nextWeekKey]?.goals || [];
    let encouragement = '下一周从一件最小、最想开始的事开始就很好。';
    if (summary.focusMinutes >= 180 && activeDays >= 4) encouragement = '这周的节奏很稳定，保留最舒服的那段时间就够了。';
    else if (summary.focusMinutes > 0) encouragement = '你已经找到了可持续的开始方式，不需要补回空白的日子。';
    else encouragement = '这周还没有专注记录；下周留出 15 分钟开始，就已经很足够。';

    return {
        ...summary,
        focusMinutes,
        completedTasks,
        activeDays,
        bestDay: bestDay?.focusMinutes > 0 ? bestDay : null,
        nextWeekKey,
        goals,
        encouragement,
    };
}

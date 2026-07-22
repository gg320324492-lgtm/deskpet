import { localDateKey } from './rhythm.js';
import { cleanText } from './strings.js';

export function buildTodayFocusEchoes({ rhythm = {}, todayFocus = null, now = new Date() } = {}) {
    const todayKey = localDateKey(now);
    const events = Array.isArray(rhythm.events) ? rhythm.events : [];
    const echoes = events
        .filter((event) => event?.type === 'focus-complete' && localDateKey(event.at) === todayKey)
        .sort((a, b) => Number(b.at) - Number(a.at))
        .slice(0, 6)
        .map((event) => ({
            id: cleanText(event.id, 80),
            at: Number(event.at) || 0,
            title: cleanText(event.title, 120),
            taskId: cleanText(event.taskId, 80),
            minutes: Math.max(0, Math.round(Number(event.minutes) || 0)),
            detail: cleanText(event.detail, 120),
        }));
    const mainlineId = todayFocus?.task?.id || '';
    return {
        todayKey,
        mainlineTitle: todayFocus?.task?.title || '',
        echoes,
        mainlineEchoes: mainlineId ? echoes.filter((event) => event.taskId === mainlineId) : [],
    };
}

export function focusReflectionPatch({ rhythm = {}, eventId, detail } = {}) {
    const id = cleanText(eventId, 80);
    if (!id) throw new TypeError('Focus reflection requires an event id');
    const events = Array.isArray(rhythm.events) ? rhythm.events : [];
    let found = false;
    const nextEvents = events.map((event) => {
        if (event?.id !== id) return event;
        if (event.type !== 'focus-complete') throw new TypeError('Focus reflection can only update a completed focus');
        found = true;
        return { ...event, detail: cleanText(detail, 120) };
    });
    if (!found) throw new Error('Focus record is no longer available');
    return { ...rhythm, events: nextEvents };
}

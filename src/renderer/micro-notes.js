import { cleanText } from './strings.js';

const MAX_MICRO_NOTES = 3;
const MAX_MICRO_NOTE_TEXT = 160;

export function normalizeMicroNoteText(value) {
    return cleanText(value, MAX_MICRO_NOTE_TEXT);
}

/** Keep only a small, chronological local trace of what a task has moved through. */
export function normalizeMicroNotes(value) {
    const raw = Array.isArray(value) ? value : [];
    const notes = [];
    for (const item of raw) {
        const text = normalizeMicroNoteText(typeof item === 'string' ? item : item?.text);
        if (!text) continue;
        const at = Number.isInteger(item?.at) && item.at >= 0 ? item.at : 0;
        notes.push({
            id: String(item?.id || `micro-note-${notes.length + 1}`).slice(0, 48),
            text,
            at,
        });
    }
    return notes.slice(-MAX_MICRO_NOTES);
}

export function latestMicroNote(task = {}) {
    const notes = normalizeMicroNotes(task?.microNotes);
    return notes.at(-1) || null;
}

/** Add an optional, bounded note without changing task completion or scheduling state. */
export function appendMicroNotePatch(task = {}, text, now = Date.now()) {
    const nextText = normalizeMicroNoteText(text);
    if (!nextText) return {};
    const at = Number.isFinite(Number(now)) ? Math.max(0, Math.round(Number(now))) : Date.now();
    const notes = normalizeMicroNotes(task.microNotes);
    return {
        microNotes: normalizeMicroNotes([...notes, {
            id: `micro-note-${at}-${Math.random().toString(36).slice(2, 6)}`,
            text: nextText,
            at,
        }]),
    };
}

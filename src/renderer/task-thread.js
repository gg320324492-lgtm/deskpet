import { normalizeMicroNotes } from './micro-notes.js';
import { normalizeMicroSteps } from './micro-steps.js';

const MAX_THREAD_NOTE_TEXT = 160;

export function normalizeTaskThreadNote(value) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, MAX_THREAD_NOTE_TEXT);
}

/** Preserve one optional sentence when a task is gently closed or put away. */
export function taskThreadPatch(task = {}, note = '', now = Date.now()) {
    const threadNote = normalizeTaskThreadNote(note);
    if (!threadNote) return {};
    const threadAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return { threadNote, threadAt };
}

/** Build the small local-only trace used by a task's detail view and daily review. */
export function buildTaskThread(task = {}) {
    return {
        closingNote: normalizeTaskThreadNote(task.threadNote),
        waitingNote: normalizeTaskThreadNote(task.waitingNote),
        lastStartingPoint: String(task.note || '').trim().slice(0, 240),
        steps: normalizeMicroSteps(task.microSteps).slice(0, 3),
        notes: normalizeMicroNotes(task.microNotes).slice(-3).reverse(),
    };
}

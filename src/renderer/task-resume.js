import { beginNextMicroStepPatch, currentMicroStep, normalizeMicroSteps, normalizeMicroStepText } from './micro-steps.js';

const MAX_RESUME_HINT_TEXT = 240;

export function normalizeResumeHintText(value) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, MAX_RESUME_HINT_TEXT);
}

/** A hint is deliberate only when it has both words and a saved moment. */
export function hasResumeHint(task = {}) {
    return Boolean(normalizeResumeHintText(task?.note) && Number(task?.nextStepAt) > 0);
}

/** A return cue is pending only until the person deliberately picks it up. */
export function hasPendingResumeHint(task = {}) {
    return hasResumeHint(task) && Number(task?.nextStepAt) > Number(task?.resumeAcknowledgedAt || 0);
}

/** Reuse the task's existing next-step fields without changing its completion state. */
export function resumeHintPatch(text, now = Date.now()) {
    const note = normalizeResumeHintText(text);
    if (!note) return {};
    const at = Number.isFinite(Number(now)) ? Math.max(0, Math.round(Number(now))) : Date.now();
    return { note, nextStepAt: at, resumeAcknowledgedAt: 0 };
}

/** Preserve the words as a local history, while taking them out of suggestion priority. */
export function resumeAcknowledgementPatch(task = {}, now = Date.now()) {
    if (!hasResumeHint(task)) return {};
    const at = Number.isFinite(Number(now)) ? Math.max(0, Math.round(Number(now))) : Date.now();
    return { resumeAcknowledgedAt: Math.max(Number(task.nextStepAt) || 0, at) };
}

/**
 * Keep a return cue intact while the person explicitly chooses the one small
 * action for this new pass. An unfinished action can be renamed; a finished
 * set receives one fresh action. Empty text deliberately changes nothing.
 */
export function resumeContinuationPatch(task = {}, text) {
    const nextText = normalizeMicroStepText(text);
    if (!nextText) return {};
    const current = currentMicroStep(task);
    if (!current) return beginNextMicroStepPatch(nextText);
    if (current.text === nextText) return {};
    return {
        microSteps: normalizeMicroSteps(task.microSteps).map((step) => step.id === current.id
            ? { ...step, text: nextText }
            : step),
    };
}

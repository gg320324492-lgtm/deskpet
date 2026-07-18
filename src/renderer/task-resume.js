const MAX_RESUME_HINT_TEXT = 240;

export function normalizeResumeHintText(value) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, MAX_RESUME_HINT_TEXT);
}

/** A hint is deliberate only when it has both words and a saved moment. */
export function hasResumeHint(task = {}) {
    return Boolean(normalizeResumeHintText(task?.note) && Number(task?.nextStepAt) > 0);
}

/** Reuse the task's existing next-step fields without changing its completion state. */
export function resumeHintPatch(text, now = Date.now()) {
    const note = normalizeResumeHintText(text);
    if (!note) return {};
    const at = Number.isFinite(Number(now)) ? Math.max(0, Math.round(Number(now))) : Date.now();
    return { note, nextStepAt: at };
}

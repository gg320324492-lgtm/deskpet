import { cleanText } from './strings.js';

const MAX_MICRO_STEPS = 3;
const MAX_MICRO_STEP_TEXT = 120;

export function normalizeMicroStepText(value) {
    return cleanText(value, MAX_MICRO_STEP_TEXT);
}

/** Normalize one optional set of one-to-three tiny actions for a task. */
export function normalizeMicroSteps(value) {
    const raw = Array.isArray(value) ? value : [];
    const steps = [];
    for (const item of raw) {
        if (steps.length >= MAX_MICRO_STEPS) break;
        const text = normalizeMicroStepText(typeof item === 'string' ? item : item?.text);
        if (!text) continue;
        steps.push({
            id: `micro-${steps.length + 1}`,
            text,
            completed: typeof item === 'object' && item?.completed === true,
        });
    }
    return steps;
}

export function currentMicroStep(task = {}) {
    const steps = normalizeMicroSteps(task?.microSteps);
    return steps.find((step) => !step.completed) || null;
}

/** A finished set is a quiet checkpoint, never an implicit completion of its parent task. */
export function hasFinishedMicroSteps(task = {}) {
    const steps = normalizeMicroSteps(task?.microSteps);
    return steps.length > 0 && steps.every((step) => step.completed);
}

/** Mark one tiny action, leaving the parent task and every other action intact. */
export function completeMicroStepPatch(task = {}, id) {
    const target = String(id || '');
    return {
        microSteps: normalizeMicroSteps(task.microSteps).map((step) => step.id === target
            ? { ...step, completed: true }
            : step),
    };
}

/** Start a fresh tiny-action set after the previous one has been put away. */
export function beginNextMicroStepPatch(text) {
    const nextText = normalizeMicroStepText(text);
    if (!nextText) throw new TypeError('先写下想继续的这一小步。');
    return {
        microSteps: [{ id: 'micro-1', text: nextText, completed: false }],
    };
}

/** Repeating tasks retain the tiny-action wording but start each recurrence fresh. */
export function resetMicroSteps(value) {
    return normalizeMicroSteps(value).map((step) => ({ ...step, completed: false }));
}

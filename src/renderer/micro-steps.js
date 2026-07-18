const MAX_MICRO_STEPS = 3;
const MAX_MICRO_STEP_TEXT = 120;

export function normalizeMicroStepText(value) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, MAX_MICRO_STEP_TEXT);
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

/** Mark one tiny action, leaving the parent task and every other action intact. */
export function completeMicroStepPatch(task = {}, id) {
    const target = String(id || '');
    return {
        microSteps: normalizeMicroSteps(task.microSteps).map((step) => step.id === target
            ? { ...step, completed: true }
            : step),
    };
}

/** Repeating tasks retain the tiny-action wording but start each recurrence fresh. */
export function resetMicroSteps(value) {
    return normalizeMicroSteps(value).map((step) => ({ ...step, completed: false }));
}

import { normalizeMicroNotes } from './micro-notes.js';
import { normalizeMicroSteps } from './micro-steps.js';

/** Build the small, local-only trace shown before a finished micro-step set is placed. */
export function buildTaskCloseoutReview(task = {}) {
    return {
        steps: normalizeMicroSteps(task.microSteps)
            .filter((step) => step.completed)
            .slice(0, 3),
        notes: normalizeMicroNotes(task.microNotes)
            .slice(-3)
            .reverse(),
    };
}

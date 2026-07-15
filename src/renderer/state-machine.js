/**
 * state-machine.js
 *
 * PetStateMachine — finite state machine with explicit legal-transition table.
 * All state ids, allowed transitions, temporary durations, and category
 * classification are derived from `state-catalog.js` (SSOT).
 *
 * Categories (declared in catalog):
 *   - persistent : IDLE, SIT, SLEEP                  (no auto-revert)
 *   - temporary  : SURPRISE, CHEER, EAT, THINK, ...  (auto -> IDLE)
 *   - action     : WALK, RUN                          (event-driven exit)
 *   - sustained  : WORK                               (5s no-key idle -> IDLE)
 */
import {
    STATES,
    ALL_STATES,
    TEMPORARY_STATES,
    TEMP_DURATIONS,
    ALLOWED,
} from './state-catalog.mjs';

export { STATES, ALL_STATES, TEMPORARY_STATES, TEMP_DURATIONS, ALLOWED };
export { isAllowed } from './state-catalog.mjs';

export class PetStateMachine {
    constructor(initial = STATES.IDLE) {
        if (!ALL_STATES.includes(initial)) {
            throw new Error(`Invalid initial state: ${initial}`);
        }
        this._state = initial;
        this._prev = null;
        this._listeners = new Set();
    }

    get state() { return this._state; }
    get previousState() { return this._prev; }

    isTemporary(state = this._state) {
        return TEMPORARY_STATES.has(state);
    }

    /**
     * Attempt to transition to `next`. Returns true on success.
     * Failed transitions are no-ops (e.g. wrong source state).
     */
    transitionTo(next) {
        if (!ALL_STATES.includes(next)) {
            console.warn('[state-machine] unknown state:', next);
            return false;
        }
        if (next === this._state) return false;
        const allowed = ALLOWED[this._state];
        if (!allowed || !allowed.has(next)) {
            console.debug(`[state-machine] ${this._state} -> ${next} blocked`);
            return false;
        }
        const prev = this._state;
        this._prev = prev;
        this._state = next;
        for (const fn of this._listeners) fn(next, prev);
        return true;
    }

    /**
     * Force a transition bypassing ALLOWED.
     * Used only by idle-watcher for hard timeouts (e.g. entering SLEEP).
     */
    force(next) {
        if (!ALL_STATES.includes(next)) return false;
        if (next === this._state) return false;
        const prev = this._state;
        this._prev = prev;
        this._state = next;
        for (const fn of this._listeners) fn(next, prev);
        return true;
    }

    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }
}

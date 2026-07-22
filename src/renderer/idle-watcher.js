/**
 * idle-watcher.js
 * Multi-timer scheduler for auto behaviors:
 *   - _sleepTimer       (30s)            -> SLEEP
 *   - _microPeekTimer   (8s + 30s loop)  -> 10% PEEK
 *   - _yawnTimer        (SIT 25s)        -> YAWN
 *   - _workIdleTimer    (WORK 5s no-key) -> IDLE
 *   - _sleepBlinkTimer  (SLEEP 60s)      -> 5% peek then SLEEP
 *
 * poke() resets all timers and is called on any user input.
 */
import { STATES } from './state-machine.js';

const SLEEP_AFTER_MS         = 30_000;
const MICRO_PEEK_START_MS    = 8_000;
const MICRO_PEEK_INTERVAL_MS = 30_000;
const YAWN_AFTER_SIT_MS      = 25_000;
const WORK_IDLE_MS           = 5_000;
const WORK_INITIAL_MS        = 30_000;   // grace before first no-activity revert
const SLEEP_GLANCE_INTERVAL  = 60_000;

export class IdleWatcher {
    constructor(stateMachine) {
        this._sm = stateMachine;
        this._sleepTimer = null;
        this._microPeekTimer = null;
        this._yawnTimer = null;
        this._workIdleTimer = null;
        this._sleepBlinkTimer = null;
        this._inWork = false;
        this._lastGreeting = null;     // 'morning' | 'lunch' | 'evening' | null

        this._sm.onChange((next, prev) => this._onStateChange(next, prev));
        this._reset();
    }

    /** Call on any user input. Resets most timers. */
    poke() { this._reset(); }

    /** Called when a real key is pressed while in WORK (extends work session). */
    notifyKeyInWork() {
        if (this._inWork) {
            clearTimeout(this._workIdleTimer);
            this._workIdleTimer = setTimeout(() => {
                if (this._sm.state === STATES.WORK) {
                    this._sm.transitionTo(STATES.IDLE);
                }
            }, WORK_IDLE_MS);
        }
    }

    enterWork() {
        this._inWork = true;
        clearTimeout(this._workIdleTimer);
        this._workIdleTimer = setTimeout(() => {
            if (this._sm.state === STATES.WORK) {
                this._sm.transitionTo(STATES.IDLE);
            }
        }, WORK_INITIAL_MS);
    }

    exitWork() {
        this._inWork = false;
        clearTimeout(this._workIdleTimer);
    }

    markGreeted(period) { this._lastGreeting = period; }
    lastGreeting() { return this._lastGreeting; }

    _onStateChange(next, prev) {
        if (next === STATES.WORK) this.enterWork();
        else if (prev === STATES.WORK) this.exitWork();

        // Re-evaluate timers based on new state
        this._reset();
    }

    _reset() {
        clearTimeout(this._sleepTimer);
        clearTimeout(this._microPeekTimer);
        clearTimeout(this._yawnTimer);
        clearTimeout(this._sleepBlinkTimer);
        // do NOT clear _workIdleTimer here — managed by enterWork/exitWork/notifyKeyInWork

        const s = this._sm.state;

        if (s === STATES.IDLE) {
            this._armSleep(SLEEP_AFTER_MS);
            this._scheduleMicroPeek(MICRO_PEEK_START_MS);
        } else if (s === STATES.SIT) {
            this._armSleep(SLEEP_AFTER_MS);
            this._scheduleYawn();
        } else if (s === STATES.SLEEP) {
            this._scheduleSleepGlance();
        } else if (s === STATES.WORK) {
            this._armWorkIdle();
        } else {
            // temporary / WALK / etc.: still arm sleep so we eventually settle
            this._armSleep(SLEEP_AFTER_MS);
        }
    }

    _armSleep(ms) {
        clearTimeout(this._sleepTimer);
        this._sleepTimer = setTimeout(() => {
            if (this._sm.state === STATES.IDLE || this._sm.state === STATES.SIT) {
                this._sm.transitionTo(STATES.SLEEP);
            }
        }, ms);
    }

    _scheduleMicroPeek(delay) {
        clearTimeout(this._microPeekTimer);
        this._microPeekTimer = setTimeout(() => {
            if (this._sm.state === STATES.IDLE && Math.random() < 0.10) {
                this._sm.transitionTo(STATES.PEEK);
            }
            this._scheduleMicroPeek(MICRO_PEEK_INTERVAL_MS);
        }, delay);
    }

    _scheduleYawn() {
        clearTimeout(this._yawnTimer);
        this._yawnTimer = setTimeout(() => {
            if (this._sm.state === STATES.SIT) {
                this._sm.transitionTo(STATES.YAWN);
                setTimeout(() => {
                    if (this._sm.state === STATES.YAWN) {
                        this._sm.transitionTo(STATES.SIT);
                    }
                }, 2500);
            }
        }, YAWN_AFTER_SIT_MS);
    }

    _scheduleSleepGlance() {
        clearTimeout(this._sleepBlinkTimer);
        this._sleepBlinkTimer = setTimeout(() => {
            if (this._sm.state === STATES.SLEEP && Math.random() < 0.05) {
                this._sm.transitionTo(STATES.IDLE);
                setTimeout(() => {
                    if (this._sm.state === STATES.IDLE) {
                        this._sm.transitionTo(STATES.SLEEP);
                    }
                }, 700);
            } else {
                this._scheduleSleepGlance();
            }
        }, SLEEP_GLANCE_INTERVAL);
    }

    _armWorkIdle() {
        clearTimeout(this._workIdleTimer);
        this._workIdleTimer = setTimeout(() => {
            if (this._sm.state === STATES.WORK) {
                this._sm.transitionTo(STATES.IDLE);
            }
        }, WORK_IDLE_MS);
    }
}
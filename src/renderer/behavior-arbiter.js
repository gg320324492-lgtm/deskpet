/**
 * src/renderer/behavior-arbiter.js
 *
 * §13 priority dispatcher.  All "ambient" state selectors ask the arbiter
 * which behavior class is currently allowed to fire.
 *
 * Priority (high-to-low):
 *   1. user input                          (click / drag / wheel / key)
 *   2. system reminder (DND-aware)         (water / sit / eye break)
 *   3. pomodoro phase transition           (start / phase end / done)
 *   4. emotional / autonomous              (mood-driven idle)
 *   5. time-of-day                         (greeting bubble, behavior bias)
 *   6. random idle                         (last resort)
 *
 * Modules declare themselves by registering a `source` with:
 *   { id, weight, tryFire(): stateId | null, suppress?(pred): bool }
 *
 * The arbiter runs an internal tick at `_TICK_MS`; whichever source is
 * currently highest-priority and can fire wins.
 */
const _TICK_MS = 12_000;

export class BehaviorArbiter {
    constructor(stateMachine) {
        this._sm = stateMachine;
        this._sources = [];
        this._enabled = true;
        this._userSuppressUntil  = 0;
        this._dndHold            = false;

        this._tick = this._tick.bind(this);
        this._timer = setInterval(this._tick, _TICK_MS);
    }

    /**
     * Register an ambient behavior source.
     *   - id    : stable name
     *   - weight: 1..10 higher = preferred when multiple classes compete
     *   - tryFire(): stateId | null  called periodically
     *   - priorityClass: 'pomodoro' | 'reminder' | 'mood' | 'time' | 'idle'
     */
    registerSource(src) {
        if (!src || !src.id || typeof src.tryFire !== 'function') return;
        this._sources.push(src);
    }

    /** Called by interaction.js when a real user event occurs. */
    notifyUserActivity(durationMs = 8000) {
        this._userSuppressUntil = Date.now() + durationMs;
    }

    /** Set DND hold — blocks reminders + ambient bubbles. */
    setDndHolding(flag) { this._dndHold = !!flag; }

    setEnabled(flag) { this._enabled = !!flag; }

    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /** Tick loop: scan sources in priority order; first to fire wins. */
    _tick() {
        if (!this._enabled) return;
        // Skip while user is interacting (input just landed)
        if (Date.now() < this._userSuppressUntil) return;
        if (this._dndHold) return;                    // DND suppresses ambient

        // Hard cap: don't fire while in action/sustained categories.
        // (idle-watcher.js already handles SLEEP transitions; here we only
        //  pick between IDLE and adjacent temporary states.)
        if (this._sm.state !== 'idle' && this._sm.state !== 'sit' && this._sm.state !== 'sleep') {
            // For temporary states on autoresume, let idle-watcher handle returns.
            return;
        }

        // Priority class order: pomodoro > reminder > mood > time > idle
        const order = ['pomodoro', 'reminder', 'mood', 'time', 'idle'];

        for (const cls of order) {
            const candidates = this._sources
                .filter(s => s.priorityClass === cls)
                .sort((a, b) => (b.weight || 0) - (a.weight || 0));

            for (const src of candidates) {
                try {
                    const next = src.tryFire();
                    if (next && this._sm.transitionTo(next)) return;
                } catch (_) {/* swallow source errors */}
            }
        }
    }
}

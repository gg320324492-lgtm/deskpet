/**
 * src/renderer/pomodoro.js
 *
 * PomodoroTimer — state machine: IDLE -> WORKING -> RESTING -> IDLE, with
 * PAUSED interruption.  Hooks:
 *   - onPhaseEnter(name, ms)   called when entering a phase
 *   - onBubble(text)           small UI cue
 *   - storage                   persists workMin / breakMin / sessionsToday
 *
 * The renderer treats WORKING as suppression of random idle action (only
 * breath/blink/micro-peek allowed).  See behavior-arbiter.js.
 */

const PHASE_MS = {
    WORK: 'work', REST: 'rest', LONG_REST: 'longRest',
};

export class PomodoroTimer {
    constructor({ getSettings, setSettings, onBubble = () => {} }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._onBubble    = onBubble;
        this._phase = 'idle';        // 'idle' | 'work' | 'rest' | 'longRest' | 'paused'
        this._phaseStartedAt = 0;
        this._remainingMs = 0;
        this._interval = null;
        this._listeners = new Set();
    }

    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _emit() { for (const fn of this._listeners) fn(this.snapshot()); }

    snapshot() {
        return {
            phase: this._phase,
            remainingMs: this._phase === 'idle' ? 0 : this._remainingMs,
            sessionsToday: this._getSettings().pomodoro.sessionsToday,
        };
    }

    start(opts = {}) {
        if (this._phase === 'work' || this._phase === 'rest' || this._phase === 'longRest') return false;
        this._enter('work', opts.workMs ?? null);
        this._onBubble('开始专注 ' + (opts.workMs ? Math.round(opts.workMs/60000) + ' 分钟' : '25 分钟') + ' 🍅');
        return true;
    }

    pause() {
        if (this._phase === 'idle') return false;
        this._phaseRemainingBefore = this._remainingMs;
        this._pausedPhase = this._phase;   // remember which phase to resume into
        clearInterval(this._interval);
        this._interval = null;
        this._phase = 'paused';
        this._onBubble('暂停了');
        this._emit();
        return true;
    }

    resume() {
        if (this._phase !== 'paused') return false;
        this._enter(this._pausedPhase || 'work', this._phaseRemainingBefore);
        this._onBubble('继续');
        return true;
    }

    stop() {
        if (this._phase === 'idle') return false;
        clearInterval(this._interval);
        this._interval = null;
        this._phase = 'idle';
        this._remainingMs = 0;
        this._onBubble('番茄钟结束');
        this._emit();
        return true;
    }

    /** Hard cleanup — call when the renderer tears down to release timers. */
    dispose() {
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
        this._listeners.clear();
    }

    _enter(phase, ms) {
        const settings = this._getSettings().pomodoro;
        const minutes = ms ? Math.round(ms / 60000) : null;
        let durationMs;
        if (phase === 'work')   durationMs = (minutes ?? settings.workMin) * 60_000;
        else if (phase === 'rest')     durationMs = (minutes ?? settings.breakMin) * 60_000;
        else if (phase === 'longRest') durationMs = (minutes ?? settings.longBreakMin) * 60_000;
        else throw new Error('unknown phase ' + phase);

        this._phase = phase;
        this._phaseStartedAt = Date.now();
        this._remainingMs = durationMs;
        this._tickerBound = this._ticker.bind(this);
        this._interval = setInterval(this._tickerBound, 1000);
        this._emit();
    }

    _ticker() {
        if (this._phase === 'idle' || this._phase === 'paused') return;
        const elapsed = Date.now() - this._phaseStartedAt;
        const settings = this._getSettings().pomodoro;
        const totalMs = this._phase === 'work'
            ? settings.workMin * 60_000
            : (this._phase === 'rest' ? settings.breakMin * 60_000 : settings.longBreakMin * 60_000);
        this._remainingMs = Math.max(0, totalMs - elapsed);
        if (this._remainingMs <= 0) {
            clearInterval(this._interval);
            this._interval = null;
            this._advance();
            return;
        }
        this._emit();
    }

    _advance() {
        const settings = this._getSettings().pomodoro;
        if (this._phase === 'work') {
            const today = new Date().toISOString().slice(0, 10);
            const sToday = settings.date === today ? settings.sessionsToday : 0;
            const newCount = sToday + 1;
            this._setSettings({
                pomodoro: {
                    ...settings,
                    sessionsToday: newCount,
                    sessionsTotal: (settings.sessionsTotal || 0) + 1,
                    date: today,
                },
            });
            this._onBubble('专注完成！休息一下 ☕');
            const isLong = newCount % settings.longBreakEvery === 0;
            this._enter(isLong ? 'longRest' : 'rest', null);
            return;
        }
        if (this._phase === 'rest' || this._phase === 'longRest') {
            this._onBubble('休息结束，再来一轮？');
            this._phase = 'idle';
            this._remainingMs = 0;
            this._emit();
            return;
        }
    }
}

/**
 * src/renderer/mood.js
 *
 * Five emotion/affinity trackers persisted via storage.mood:
 *   - mood      (0..100) rises on interaction, decays slowly
 *   - energy    (0..100) drains over time, restores on rest / sleep
 *   - hunger    (0..100) rises over time, drops on EAT/FEED actions
 *   - affinity  (0..inf) monotonic, gains on user-interaction milestones
 *   - focus     (0..100) transient, set during pomodoro WORKING
 *
 * Decay / recharge is computed from elapsed wall-clock time (NOT from
 * tick counts) so app sleeps don't skew the model.  Tick interval is 60s.
 *
 * The mood snapshot is read by idle-watcher and animator to bias idle
 * action selection (low energy → SIT/SLEEP more; high affinity → unlock
 * mature dialogue; high hunger → bias EAT).
 */
const TICK_MS = 60_000;

const DECAY = {
    mood:   -0.03,    // per minute
    energy: -0.5,     // -30 per hour
    hunger: +0.4,     // +24 per hour
    affinity: 0,      // monotonic, no decay
    focus:  -3,       // -3 per minute (decays quickly)
};

const CLAMPS = {
    mood:   [0, 100],
    energy: [0, 100],
    hunger: [0, 100],
    affinity: [0, Number.POSITIVE_INFINITY],
    focus:  [0, 100],
};

export class MoodEngine {
    constructor({ getSettings, setSettings }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._interval = null;
        this._listeners = new Set();
        this._timerStart = Date.now();
    }

    start() {
        if (this._interval) return;
        // First decay on next micro-tick (immediate).
        this._decay();
        this._interval = setInterval(() => this._decay(), TICK_MS);
    }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
    }

    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _emit(snapshot) { for (const f of this._listeners) f(snapshot); }

    snapshot() {
        return { ...(this._getSettings().mood || {}) };
    }

    /** Atomic delta with clamp + persistence. */
    async bump(key, delta) {
        const m = { ...this.snapshot() };
        const [lo, hi] = CLAMPS[key] || [0, 100];
        m[key] = Math.max(lo, Math.min(hi, (m[key] ?? lo) + delta));
        m.lastTickAt = Date.now();
        await this._setSettings({ mood: m });
        this._emit(this.snapshot());
    }

    /** Convenience event hooks (consumed by ui / achievements / dialogue). */
    async onUserClick() {
        await this.bump('mood', +1);
        await this.bump('affinity', +0.5);
    }

    async onPomodoroComplete() {
        await this.bump('mood', +5);
        await this.bump('affinity', +5);
    }

    async onTodoComplete() {
        await this.bump('mood', +2);
        await this.bump('energy', +1);
        await this.bump('hunger', -3);
    }

    async onAllDayTodosDone() {
        await this.bump('mood', +15);
        await this.bump('affinity', +20);
    }

    async onFeed() {
        await this.bump('hunger', -20);
        await this.bump('mood',  +5);
    }

    async onSleepEnter() {
        await this.bump('energy', +40);
    }

    async onPomodoroStart() {
        await this.bump('focus', +80);
    }

    async onPomodoroEnd() {
        await this.bump('focus', -80);
    }

    _decay() {
        const m = this.snapshot();
        const now = Date.now();
        const last = m.lastTickAt || now;
        const elapsedMin = Math.max(0, (now - last) / 60_000);
        if (elapsedMin < 0.05) return;       // < 3 sec, skip
        const next = { ...m, lastTickAt: now };
        for (const key of Object.keys(DECAY)) {
            if (key === 'affinity') continue;
            const current = next[key] ?? 0;
            const newVal = current + DECAY[key] * elapsedMin;
            const [lo, hi] = CLAMPS[key];
            next[key] = Math.max(lo, Math.min(hi, newVal));
        }
        this._setSettings({ mood: next }).catch(() => {});
        this._emit(this.snapshot());
    }
}

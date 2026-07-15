/**
 * src/renderer/memory.js
 *
 * Three-tier memory model (per §8):
 *   1. Temp     - in-session only. Last N user inputs / observed facts.
 *   2. Persistent prefs - stored in storage.memory.* (opt-in toggles).
 *   3. Privacy-sensitive stuff - NEVER collected by default (no screen,
 *      mic, clipboard, file content).
 *
 * Phase 4 wires up (1) and (2).  The chat AI uses (1) for context; the
 * renderer reads (2) for personalized bubbles and achievements.
 */

const TEMP_LIMIT = 10;

export class MemoryEngine {
    constructor({ getSettings, setSettings }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._tempRing = []; // [{ ts, kind, text }]
    }

    /** Append to the in-memory ring. */
    note(kind, text) {
        this._tempRing.push({ ts: Date.now(), kind, text });
        if (this._tempRing.length > TEMP_LIMIT) this._tempRing.shift();
    }

    recent(n = 5) {
        return this._tempRing.slice(-n);
    }

    /** Persistent preferences (opt-in). */
    async setPref(key, value) {
        const mem = this._getSettings().memory || {};
        await this._setSettings({ memory: { ...mem, [key]: value, rememberedAt: Date.now() } });
    }

    prefs() {
        const mem = this._getSettings().memory || {};
        return { ...mem };
    }

    /** Reset persistent prefs (for "forget me" privacy action). */
    async forget() {
        await this._setSettings({
            memory: {
                name: '',
                workStartHour: 9,
                workEndHour:   18,
                favoriteFood: '',
                rememberedAt:  0,
            },
        });
        this._tempRing.length = 0;
    }
}

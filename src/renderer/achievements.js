/**
 * src/renderer/achievements.js
 *
 * AchievementEngine — single fire-once unlock per id, persisted to
 * storage.achievements.unlocked.
 *
 * Sources of unlocks:
 *   - pomodoro (10 / 100 / 1000 sessions)
 *   - todo completion (1 / 10 / 100 / streak)
 *   - first-boot & boot streaks
 *   - secret / hidden (e.g. feeding at night, hitting 5 in a row on click)
 *
 * Each achievement is a tiny `unlock(id, meta)`; the engine records
 * `{ id: unlockedAtMs, ... }` and emits a 'unlock' event for chat / room UI.
 */

export const ACHIEVEMENTS = Object.freeze({
    FIRST_BOOT:        { id: 'first_boot',           label: '初次见面',    hidden: false },
    STREAK_7:          { id: 'streak_7',             label: '陪伴 7 天',  hidden: false },
    STREAK_30:         { id: 'streak_30',            label: '陪伴 30 天', hidden: false },
    POMODORO_10:       { id: 'pomodoro_10',          label: '10 个番茄钟', hidden: false },
    POMODORO_100:      { id: 'pomodoro_100',         label: '100 个番茄钟', hidden: false },
    TODOS_10:          { id: 'todos_10',             label: '10 个待办',  hidden: false },
    TODOS_100:         { id: 'todos_100',            label: '100 个待办', hidden: false },
    NIGHT_COMPANION:   { id: 'night_companion',      label: '深夜陪伴',   hidden: true },
    MUNCHIES:          { id: 'munchies',             label: '吃到撑',     hidden: false },
    SECRET_FIVE_IN_ROW:{ id: 'secret_five_in_a_row', label: '???',         hidden: true },
    ROOM_OPENED:       { id: 'room_opened',          label: '打开过房间', hidden: false },
    AUTO_DND_HIT:      { id: 'auto_dnd_hit',         label: '自动进入勿扰', hidden: true },
});

export class AchievementEngine {
    constructor({ getSettings, setSettings }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._listeners = new Set();
    }

    onUnlock(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

    async unlock(id, meta = {}) {
        // bootstrap passes the flat achievements-domain root
        // (`{ unlocked: {...} }`), NOT a nested `{ achievements: {...} }` envelope.
        const cur = this._getSettings() || {};
        const unlocked = cur.unlocked || {};
        if (unlocked[id]) return false;
        const at = Date.now();
        const def = Object.values(ACHIEVEMENTS).find(a => a.id === id) || { id, label: id, hidden: false };
        const nextUnlocked = { ...unlocked, [id]: { ...meta, unlockedAt: at, label: def.label } };
        await this._setSettings({ achievements: { ...cur, unlocked: nextUnlocked } });
        const payload = { id, label: def.label, at, ...meta };
        for (const fn of this._listeners) {
            try { fn(payload); } catch (_) {}
        }
        return true;
    }

    snapshot() {
        const cur = this._getSettings() || {};
        const unlocked = cur.unlocked || {};
        const all = Object.values(ACHIEVEMENTS);
        const visible = all.filter(a => !a.hidden || unlocked[a.id]).map(a => ({
            ...a,
            unlocked: !!unlocked[a.id],
            unlockedAt: unlocked[a.id]?.unlockedAt || null,
        }));
        return {
            all: visible,
            count: visible.filter(a => a.unlocked).length,
            hiddenCount: all.filter(a => a.hidden).length,
        };
    }
}

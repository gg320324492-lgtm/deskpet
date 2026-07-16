const SCENE_IDS = Object.freeze(['manual', 'focus', 'relaxed', 'night']);

export const SCENES = Object.freeze({
    manual: { id: 'manual', label: '自由陪伴', autonomyLevel: null, dnd: false },
    focus: { id: 'focus', label: '专注工作', autonomyLevel: 'low', dnd: true },
    relaxed: { id: 'relaxed', label: '轻松陪伴', autonomyLevel: 'high', dnd: false },
    night: { id: 'night', label: '深夜休息', autonomyLevel: 'low', dnd: true },
});

export function isWithinSceneHours(date, startHour, endHour) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return false;
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 || startHour === endHour) return false;
    const hour = date.getHours();
    return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

export function getSceneStatus(settings = {}, now = new Date()) {
    const manualId = SCENE_IDS.includes(settings.sceneMode) ? settings.sceneMode : 'manual';
    const scheduledId = SCENE_IDS.includes(settings.sceneAutoPreset) ? settings.sceneAutoPreset : 'focus';
    const scheduled = !!settings.sceneAutoEnabled && isWithinSceneHours(now, settings.sceneAutoStart, settings.sceneAutoEnd);
    const id = scheduled ? scheduledId : manualId;
    return { ...SCENES[id], scheduled, active: id !== 'manual' };
}

export class SceneController {
    constructor({ getSettings, onChange = () => {}, now = () => new Date(), setIntervalFn = (fn, ms) => globalThis.setInterval(fn, ms), clearIntervalFn = (id) => globalThis.clearInterval(id) }) {
        this._getSettings = getSettings;
        this._onChange = onChange;
        this._now = now;
        this._setInterval = setIntervalFn;
        this._clearInterval = clearIntervalFn;
        this._timer = null;
        this._status = SCENES.manual;
    }

    start() {
        this.sync({ notify: false });
        if (this._timer == null) this._timer = this._setInterval(() => this.sync(), 30_000);
    }

    stop() {
        if (this._timer != null) this._clearInterval(this._timer);
        this._timer = null;
    }

    snapshot() { return this._status; }

    sync({ notify = true } = {}) {
        const settings = this._getSettings()?.settings || {};
        const next = getSceneStatus(settings, this._now());
        const changed = next.id !== this._status.id || next.scheduled !== this._status.scheduled;
        this._status = next;
        if (changed || !this._initialized) this._onChange(next, { notify: notify && this._initialized && changed });
        this._initialized = true;
        return next;
    }
}

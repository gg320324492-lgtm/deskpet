/**
 * Manual and scheduled Do Not Disturb controller.
 *
 * Manual intent is persisted in settings.dndManual. Scheduled DND is derived
 * from settings.dndAutoEnabled and the [start, end) hour range; it is never
 * written back into the manual flag.
 */

const SCHEDULE_INTERVAL_MS = 30_000;

export function isWithinDndHours(date, startHour, endHour) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) return false;
    if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23) return false;
    if (startHour === endHour) return false;

    const hour = date.getHours();
    if (startHour < endHour) return hour >= startHour && hour < endHour;
    return hour >= startHour || hour < endHour;
}
export class DndController {
    constructor({
        getSettings,
        setSettings,
        behaviorArbiter,
        sound,
        reminders,
        onChange,
        now = () => new Date(),
        setIntervalFn = (callback, delay) => globalThis.setInterval(callback, delay),
        clearIntervalFn = (timer) => globalThis.clearInterval(timer),
    }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._arbiter = behaviorArbiter;
        this._sound = sound;
        this._reminders = reminders;
        this._onChange = onChange || (() => {});
        this._now = now;
        this._setInterval = setIntervalFn;
        this._clearInterval = clearIntervalFn;
        this._scheduleTimer = null;
        this._started = false;
        this._initialized = false;
        this._manualActive = false;
        this._scheduledActive = false;
        this._sceneActive = false;
        this._effective = false;
    }

    start() {
        if (this._started) return;
        this._started = true;
        this.syncFromSettings({ notify: false, source: 'startup' });
    }

    stop() {
        this._started = false;
        this._clearScheduleTimer();
    }

    async toggle() {
        const settings = this._settings();
        const next = !settings.dndManual;
        await this._setSettings({ settings: { dndManual: next } });
        this.syncFromSettings({ source: 'manual' });
        return next;
    }

    snapshot() {
        const settings = this._settings();
        return {
            manual: this._manualActive,
            auto: !!settings.dndAutoEnabled,
            scheduled: this._scheduledActive,
            scene: this._sceneActive,
            effective: this._effective,
            startHour: settings.dndHoursStart,
            endHour: settings.dndHoursEnd,
        };
    }

    /** Apply settings that have already been persisted by the room or menu. */
    setAutoEnabled(flag) {
        this.syncFromSettings({ autoEnabled: !!flag, source: 'settings' });
    }

    syncFromSettings({ notify = true, source = 'settings', autoEnabled, sceneActive = this._sceneActive } = {}) {
        const settings = this._settings();
        const manual = !!settings.dndManual;
        const auto = autoEnabled ?? !!settings.dndAutoEnabled;
        const scheduled = auto && isWithinDndHours(
            this._now(),
            settings.dndHoursStart,
            settings.dndHoursEnd,
        );

        if (auto && this._started) this._ensureScheduleTimer();
        else this._clearScheduleTimer();
        this._applyEffective({ manual, scheduled, scene: !!sceneActive, notify, source });
        return this.snapshot();
    }

    refreshSchedule() {
        return this.syncFromSettings({ source: 'schedule' });
    }

    _settings() {
        return this._getSettings()?.settings || {};
    }

    _ensureScheduleTimer() {
        if (this._scheduleTimer != null) return;
        this._scheduleTimer = this._setInterval(
            () => this.refreshSchedule(),
            SCHEDULE_INTERVAL_MS,
        );
    }

    _clearScheduleTimer() {
        if (this._scheduleTimer == null) return;
        this._clearInterval(this._scheduleTimer);
        this._scheduleTimer = null;
    }

    _applyEffective({ manual, scheduled, scene, notify, source }) {
        const nextEffective = manual || scheduled || scene;
        const changed = !this._initialized || nextEffective !== this._effective;
        this._manualActive = manual;
        this._scheduledActive = scheduled;
        this._sceneActive = scene;
        this._effective = nextEffective;

        if (changed) {
            if (nextEffective) this._on();
            else this._off();
        }
        if (this._initialized && changed && notify) {
            this._onChange({ manual, scheduled, scene, effective: nextEffective, source });
        }
        this._initialized = true;
    }

    _on() {
        this._arbiter.setDndHolding(true);
        this._sound?.setMute(true);
        this._reminders?.setDnd(true);
    }

    _off() {
        this._arbiter.setDndHolding(false);
        this._sound?.setMute(false);
        this._reminders?.setDnd(false);
    }
}

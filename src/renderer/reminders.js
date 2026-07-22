/**
 * src/renderer/reminders.js
 *
 * ReminderEngine:
 *   - Three built-in reminders: water (60min), sit (45min), eye (20min)
 *     — intervals from settings.json.
 *   - User-added custom reminders: `{ id, label, kind: 'interval' | 'time',
 *     intervalMin, fireAt, snoozedUntil, enabled }`
 *   - Snooze (5 min) on dismiss.
 *   - DND suppresses with a quiet acknowledgment.
 *
 * Each fire event:
 *   - shows a toast near the pet sprite via Popover
 *   - pings `onBubble(text)` for state-driven ambient bubbles
 */

const BUILTINS = [
    { id: 'water', label: '喝水', defaultMin: 60 },
    { id: 'sit',   label: '起来走走', defaultMin: 45 },
    { id: 'eye',   label: '眼休 20 秒', defaultMin: 20 },
];

const SNOOZE_MS = 5 * 60_000;

export class ReminderEngine {
    constructor({ getSettings, setSettings, onBubble, onFire, popover, dialogue }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._onBubble    = onBubble;
        this._onFire      = onFire || (() => {});
        this._popover     = popover;
        this._dialogue    = dialogue;
        this._dndHold     = false;
        this._builtInNextFire = {};
        this._customNextFire = [];
        this._interval = null;
        this._recomputeAll();
        this._tick = this._tick.bind(this);
        this._interval = setInterval(this._tick, 30_000);   // 30s tick
    }

    setDnd(flag) { this._dndHold = !!flag; }

    /** Pull the latest settings (e.g. after the settings UI mutates them). */
    sync() { this._recomputeAll(); }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
    }

    /** Add a custom reminder. */
    addCustom(reminder) {
        const list = this._getSettings().reminders;
        const next = { id: 'r' + Date.now(), enabled: true, ...reminder };
        this._setSettings({ reminders: { ...list, custom: [...(list.custom || []), next] } });
        this._recomputeAll();
        return next;
    }

    removeCustom(id) {
        const list = this._getSettings().reminders;
        this._setSettings({ reminders: { ...list, custom: (list.custom || []).filter(r => r.id !== id) } });
        this._recomputeAll();
    }

    /** Force-fire (e.g., "remind me now" UI). */
    fireNow(id) {
        this._fire(id, 'manual');
    }

    snooze(id) {
        const until = Date.now() + SNOOZE_MS;
        const snoozes = { ...(this._getSettings().reminders.snoozes || {}) };
        snoozes[id] = until;
        this._setSettings({ reminders: { ...this._getSettings().reminders, snoozes } });
        this._recomputeAll();
    }

    _recomputeAll() {
        const state = this._getSettings();
        const settings = state.settings;
        const snoozes = state.reminders.snoozes || {};
        const now = Date.now();
        for (const bi of BUILTINS) {
            const enabled = settings[`${bi.id}Enabled`];
            const intervalMs = (settings[`${bi.id}IntervalMin`] || bi.defaultMin) * 60_000;
            const prev = this._builtInNextFire[bi.id];
            const snooze = snoozes[bi.id];
            if (!enabled) {
                // Disabled reminders never fire.
                this._builtInNextFire[bi.id] = Number.POSITIVE_INFINITY;
            } else if (snooze && snooze > now) {
                // A snooze is an explicit override for both built-in and
                // custom reminders, so it takes priority over the interval.
                this._builtInNextFire[bi.id] = snooze;
            } else if (!prev || prev === Number.POSITIVE_INFINITY) {
                // Freshly enabled / first run: schedule one interval out from now.
                // (Do NOT accumulate onto an already-scheduled time — recompute is
                //  called on every add/remove/snooze and would otherwise push
                //  built-in reminders further into the future each time.)
                this._builtInNextFire[bi.id] = now + intervalMs;
            }
            // else: keep the existing pending schedule untouched.
        }
        const customs = (this._getSettings().reminders.custom || []).filter(c => c.enabled);
        this._customNextFire = customs.map(c => {
            let fireAt = c.fireAt || (now + (c.intervalMin || 60) * 60_000);
            const snooze = snoozes[c.id];
            if (snooze && snooze > now) fireAt = snooze;
            return { ...c, fireAt };
        });
    }

    _tick() {
        if (this._dndHold) return;
        const now = Date.now();

        for (const bi of BUILTINS) {
            if (now >= this._builtInNextFire[bi.id]) {
                this._fire(bi.id, 'builtin');
                // Reschedule by 1 default interval; the user just got reminded.
                const settings = this._getSettings().settings;
                const intervalMs = (settings[`${bi.id}IntervalMin`] || bi.defaultMin) * 60_000;
                this._builtInNextFire[bi.id] = now + intervalMs;
            }
        }

        const liveCustom = this._customNextFire.filter(c => c.fireAt <= now);
        for (const c of liveCustom) {
            this._fire(c.id, 'custom');
            c.fireAt = now + (c.intervalMin || 60) * 60_000;
        }
    }

    _fire(id, kind) {
        const def = BUILTINS.find(b => b.id === id);
        const label = def?.label
            || (this._getSettings().reminders.custom || []).find(r => r.id === id)?.label
            || id;
        const text = this._dialogue?.reminder(id) || ('🔔 ' + label);
        this._onBubble(text);
        this._onFire({ id, label, kind, at: Date.now() });
        if (this._popover) {
            this._popover.open({
                html: `
                    <div style="font-weight:600;margin-bottom:4px">${label}</div>
                    <div style="font-size:11px;opacity:.7">${kind === 'manual' ? '手动提醒' : '定时提醒'}</div>
                    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
                        <button data-act="snooze" data-id="${id}">5 分钟后再提醒</button>
                        <button data-act="ok" data-id="${id}">好的</button>
                    </div>
                `,
                width: 220,
                position: 'right',
            });
            // Attach handlers post-render
            const host = document.getElementById('pet-popover');
            if (host) {
                host.querySelector('button[data-act="snooze"]')
                    ?.addEventListener('click', () => { this.snooze(id); host.remove(); });
                host.querySelector('button[data-act="ok"]')
                    ?.addEventListener('click', () => { host.remove(); });
            }
        }
    }

    /** Read all reminders (built-in status + customs) for UI display. */
    snapshot() {
        const settings = this._getSettings().settings;
        return {
            builtin: BUILTINS.map(b => ({
                id: b.id,
                label: b.label,
                enabled: !!settings[`${b.id}Enabled`],
                intervalMin: settings[`${b.id}IntervalMin`] || b.defaultMin,
                nextFire: this._builtInNextFire[b.id],
            })),
            custom: this._customNextFire.map(c => ({ ...c })),
        };
    }
}

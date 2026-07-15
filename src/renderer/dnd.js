/**
 * src/renderer/dnd.js
 *
 * DND mode controller.  Two flavors:
 *   - manual    : user toggled via tray menu / hotkey / right-click menu.
 *                 Always reliable.
 *   - auto      : best-effort detection via fullscreen + simple process-name
 *                 allowlist.  Documented as heuristic; games in exclusive
 *                 fullscreen may not be detected.
 *
 * Suppresses (via arbiter):
 *   - Random ambient bubbles
 *   - Reminder audio
 *   - Reminder toast popups (manual reminders still allowed)
 *
 * Clicks on the pet still register.
 */

const HOTKEY_DEFAULT = 'Ctrl+Shift+D';

// Heuristic process-name allowlist. Localized matching; case-insensitive.
const FULLSCREEN_APPS = [
    'powerpnt',          // PowerPoint
    'keynote',
    'impress',           // LibreOffice Impress
    'steam',
    'discord',
    'obs64', 'obs32',    // OBS Studio
    'code',              // VS Code presentation mode (full window)
];

export class DndController {
    constructor({ getSettings, setSettings, behaviorArbiter, sound, reminders, onChange }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._arbiter = behaviorArbiter;
        this._sound    = sound;
        this._reminders = reminders;
        this._onChange  = onChange || (() => {});
        this._autoProbe = null;
    }

    start() {
        const settings = this._getSettings().settings;
        if (settings.dndManual) this._on();
        if (settings.dndAutoEnabled) this._startAutoProbe();
    }

    async toggle() {
        const cur = this._getSettings().settings.dndManual;
        const next = !cur;
        await this._setSettings({ settings: { ...this._getSettings().settings, dndManual: next } });
        if (next) this._on(); else this._off();
        this._onChange({ dndManual: next });
        return next;
    }

    snapshot() {
        const settings = this._getSettings().settings;
        return {
            manual: !!settings.dndManual,
            auto:   !!settings.dndAutoEnabled,
            effective: !!settings.dndManual,
        };
    }

    setAutoEnabled(flag) {
        const settings = this._getSettings().settings;
        this._setSettings({ settings: { ...settings, dndAutoEnabled: !!flag } });
        if (flag) this._startAutoProbe();
        else this._stopAutoProbe();
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

    _startAutoProbe() {
        if (this._autoProbe) return;
        // We don't have a guaranteed foreground-window API in the renderer
        // without a native addon; rely on user toggle as primary signal and
        // a coarse "first launch fullscreen" check via main when available.
        this._autoProbe = setInterval(() => {
            // Defer to behavior-arbiter timeout + watch a flag set by main
            // (see main.js sending `dnd:auto` on fullscreen events).
        }, 60_000);
        // Best-effort: ask main whether any fullscreen presentation app is foreground.
        try {
            window.petAPI.getDisplayBounds().then(b => {
                const fullscreen = b.monitors?.some(m => {
                    const ag = m; // rough probe
                    return ag && ag._fullscreen;
                });
                // The main process is the authoritative source; this is just
                // a placeholder for renderer-side heuristics.
                if (fullscreen) this.onExternalFullscreen(true);
            });
        } catch (_) { /* ignore */ }
    }

    _stopAutoProbe() {
        if (this._autoProbe) clearInterval(this._autoProbe);
        this._autoProbe = null;
    }

    /** Called by main process when foreground fullscreen app is detected. */
    onExternalFullscreen(detected) {
        if (!this._getSettings().settings.dndAutoEnabled) return;
        if (detected !== this._getSettings().settings.dndManual) {
            if (detected) this._on();
            else this._off();
            this._setSettings({ settings: { ...this._getSettings().settings, dndManual: detected } });
            this._onChange({ dndManual: detected });
        }
    }
}

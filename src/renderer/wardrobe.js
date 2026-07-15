/**
 * src/renderer/wardrobe.js
 *
 * Wardrobe — manages the active outfit.  The pet window reads
 * `settings.outfit` and passes it to sprite-loader.setOutfit().  The room
 * window's Outfits tab calls wardrobe.set() to switch.
 *
 * For now only the literal "default" outfit is wired (alias for
 * `assets/processed/`).  When the user drops new PNG sets into
 * `assets/outfits/<name>/`, we add entries here and the room UI lights up.
 */

const KNOWN_OUTFITS = ['default'];

export class Wardrobe {
    constructor({ getSettings, setSettings, spriteLoader }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._loader = spriteLoader;
        this._listeners = new Set();
    }

    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

    async loadActive() {
        const settings = this._getSettings();
        const outfit = settings.outfit || 'default';
        if (KNOWN_OUTFITS.includes(outfit)) {
            this._loader.setOutfit(outfit);
        }
    }

    async set(outfitName) {
        if (!KNOWN_OUTFITS.includes(outfitName)) return false;
        const settings = this._getSettings();
        await this._setSettings({ settings: { ...settings, outfit: outfitName } });
        this._loader.setOutfit(outfitName);
        for (const fn of this._listeners) {
            try { fn(outfitName); } catch (_) {}
        }
        return true;
    }

    snapshot() {
        const settings = this._getSettings();
        return {
            active: settings.outfit || 'default',
            available: KNOWN_OUTFITS.slice(),
        };
    }
}

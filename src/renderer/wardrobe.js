/**
 * Wardrobe manages the active sprite set. Outfit packs may be incomplete:
 * SpriteLoader falls back to the default sprite for each missing state.
 */

export const OUTFITS = Object.freeze([
    Object.freeze({
        id: 'default',
        label: '默认白裙',
        description: '清爽的经典造型',
        swatchClass: 'default-swatch',
    }),
    Object.freeze({
        id: 'sleepwear',
        label: '薰衣草睡衣',
        description: '柔软的居家陪伴装',
        swatchClass: 'sleepwear-swatch',
        completedStates: Object.freeze(['idle', 'walk', 'sit', 'eat', 'think', 'cheer', 'surprise', 'sleep', 'yawn', 'love', 'work', 'peek', 'wave', 'drink', 'run', 'land', 'angry', 'stretch']),
    }),
]);

const KNOWN_OUTFITS = new Set(OUTFITS.map((outfit) => outfit.id));

export class Wardrobe {
    constructor({ getSettings, setSettings, spriteLoader }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._loader = spriteLoader;
        this._listeners = new Set();
    }

    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

    async loadActive() {
        const requested = this._getSettings().outfit || 'default';
        const outfit = KNOWN_OUTFITS.has(requested) ? requested : 'default';
        const changed = await this._loader.setOutfit(outfit);
        if (changed) this._emit(outfit);
        return outfit;
    }

    async set(outfitName) {
        if (!KNOWN_OUTFITS.has(outfitName)) return false;
        const settings = this._getSettings();
        await this._setSettings({ settings: { ...settings, outfit: outfitName } });
        const changed = await this._loader.setOutfit(outfitName);
        if (changed) this._emit(outfitName);
        return true;
    }

    snapshot() {
        const requested = this._getSettings().outfit || 'default';
        return {
            active: KNOWN_OUTFITS.has(requested) ? requested : 'default',
            available: OUTFITS.map((outfit) => outfit.id),
        };
    }

    _emit(outfitName) {
        for (const fn of this._listeners) {
            try { fn(outfitName); } catch (_) { /* isolate subscribers */ }
        }
    }
}

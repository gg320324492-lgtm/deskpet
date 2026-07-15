/**
 * sprite-loader.js
 *
 * Preload every catalog sprite into <img> objects and build per-state
 * 128x128 alpha masks used for hit-testing.  When a catalog entry declares
 * `hasSprite: false`, the loader pulls its `fallbackSprite` and marks the
 * entry so the renderer can show a "新" badge and skip it in the menu
 * (unless the user enables "show unfinished actions" in settings).
 *
 * Only one image is loaded per unique filename — both `love` and `drink`
 * for example may resolve to the same source if drink had a fallback that
 * pointed at love.png.
 */
import {
    ALL_STATES,
    STATES,
    resolveSprite,
    resolveFallbackSprite,
    hasSprite,
    stateEntry,
} from './state-catalog.mjs';

class SpriteLoader {
    constructor() {
        this._images        = new Map();   // state id -> <img>
        this._masks         = new Map();   // state id -> Uint8Array
        this._missing       = new Set();   // state ids whose art is missing
        this._fallbackFor   = new Map();   // state id -> the fallback state's id (if any)
        this._maskW = 128;
        this._maskH = 128;
        this._outfit = 'default';
        this._cacheByOutfit = new Map();  // outfit -> Map(stateId -> <img>)
        this._ready = null;
    }

    setOutfit(name) {
        if (this._outfit === name) return false;
        this._outfit = name || 'default';
        this._images = this._cacheByOutfit.get(this._outfit) || new Map();
        // If we already preloaded before outfit change, masks need rebuild.
        // Easiest path: re-preload.  When outfit assets don't exist, the
        // loader falls back to default for any missing files.
        if (this._ready) {
            this._ready = null;
            this.preload();
        }
        return true;
    }

    /** Compute the URL prefix for the active outfit. */
    _base() {
        return this._outfit === 'default'
            ? '../../assets/processed'
            : `../../assets/outfits/${this._outfit}`;
    }

    async preload() {
        if (this._ready) return this._ready;
        const urlCache = new Map();

        const tasks = ALL_STATES.map(async (stateId) => {
            const has = hasSprite(stateId);
            const spriteName = has ? resolveSprite(stateId) : resolveFallbackSprite(stateId);
            if (!spriteName) return;
            const url = `${this._base()}/${spriteName}`;

            let img = urlCache.get(url);
            if (!img) {
                img = new Image();
                img.src = url;
                try {
                    await new Promise((res, rej) => {
                        img.onload  = res;
                        img.onerror = () => rej(new Error(`load failed: ${img.src}`));
                    });
                    urlCache.set(url, img);
                } catch (err) {
                    // Outfit may be missing some files — silently no-op so
                    // the pet can keep showing the default.  Until we
                    // implement a per-file fallback chain, the visible sprite
                    // remains the last-loaded or default.
                    return;
                }
            }

            this._images.set(stateId, img);
            this._buildMask(stateId, img);

            if (!has) {
                this._missing.add(stateId);
                const fbId = stateEntry(stateId)?.fallbackSprite?.replace(/\.png$/, '');
                if (fbId && ALL_STATES.includes(fbId)) {
                    this._fallbackFor.set(stateId, fbId);
                }
            }
        });

        await Promise.all(tasks);
        this._cacheByOutfit.set(this._outfit, this._images);
        this._ready = Promise.resolve(this);
        return this;
    }

    _buildMask(stateId, img) {
        const c = document.createElement('canvas');
        c.width = this._maskW;
        c.height = this._maskH;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, this._maskW, this._maskH);
        const data = ctx.getImageData(0, 0, this._maskW, this._maskH).data;
        const mask = new Uint8Array(this._maskW * this._maskH);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            mask[p] = data[i + 3] > 32 ? 1 : 0;
        }
        this._masks.set(stateId, mask);
    }

    getImage(stateId) { return this._images.get(stateId); }

    hasImage(stateId) { return this._images.has(stateId); }

    isMissing(stateId) { return this._missing.has(stateId); }

    missingStates() { return [...this._missing]; }

    /**
     * Hit-test against the sprite image for `state`. Uses the same mask as
     * sprites that fall back to the same source, so e.g. `drink → eat` hit
     * shape matches `eat` hit shape.
     */
    hitTest(state, x, y, spriteW, spriteH) {
        const mask = this._masks.get(state);
        if (!mask) return false;
        if (x < 0 || y < 0 || x >= spriteW || y >= spriteH) return false;
        const mx = Math.min(this._maskW - 1, Math.max(0,
            Math.floor(x / spriteW * this._maskW)));
        const my = Math.min(this._maskH - 1, Math.max(0,
            Math.floor(y / spriteH * this._maskH)));
        return mask[my * this._maskW + mx] === 1;
    }
}

export const spriteLoader = new SpriteLoader();

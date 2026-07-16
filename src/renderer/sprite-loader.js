/**
 * sprite-loader.js
 *
 * Preload every catalog sprite into <img> objects and build per-state
 * 128x128 alpha masks used for hit-testing. Alternate outfits are resolved
 * per state, with a default-sprite fallback when a pack is still incomplete.
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

export function spriteCandidates(outfit, spriteName) {
    const defaultUrl = `../../assets/processed/${spriteName}`;
    if (!outfit || outfit === 'default') return [defaultUrl];
    return [`../../assets/outfits/${outfit}/${spriteName}`, defaultUrl];
}

class SpriteLoader {
    constructor() {
        this._images        = new Map();   // state id -> <img>
        this._masks         = new Map();   // state id -> Uint8Array
        this._missing       = new Set();   // state ids whose art is missing
        this._fallbackFor   = new Map();   // state id -> the fallback state's id (if any)
        this._maskW = 128;
        this._maskH = 128;
        this._outfit = 'default';
        this._ready = null;
    }

    async setOutfit(name) {
        const next = name || 'default';
        if (this._outfit === next) return false;
        this._outfit = next;
        this._images = new Map();
        this._masks = new Map();
        this._missing = new Set();
        this._fallbackFor = new Map();
        this._ready = null;
        await this.preload();
        return true;
    }

    async preload() {
        if (this._ready) return this._ready;
        const urlCache = new Map();

        const tasks = ALL_STATES.map(async (stateId) => {
            const has = hasSprite(stateId);
            const spriteName = has ? resolveSprite(stateId) : resolveFallbackSprite(stateId);
            if (!spriteName) return;
            let img = null;
            for (const url of spriteCandidates(this._outfit, spriteName)) {
                img = urlCache.get(url) || null;
                if (img) break;

                const candidate = new Image();
                candidate.src = url;
                try {
                    await new Promise((res, rej) => {
                        candidate.onload = res;
                        candidate.onerror = () => rej(new Error(`load failed: ${candidate.src}`));
                    });
                    img = candidate;
                    urlCache.set(url, candidate);
                    break;
                } catch (_) {
                    img = null;
                }
            }
            if (!img) return;

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

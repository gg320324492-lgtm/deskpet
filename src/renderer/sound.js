/**
 * src/renderer/sound.js
 *
 * SoundManager — small wrapper around HTML5 <audio> that loads ~8 short
 * effects once and replays them on demand.  Honours:
 *   - settings.volume (0..1)          live
 *   - settings.mute (boolean)         live
 *   - external DND hold (dnd.setMute(true))
 *   - missing files: gracefully no-ops, never throws
 *
 * Audio directory layout:
 *   assets/audio/footstep.mp3
 *   assets/audio/pop.mp3
 *   assets/audio/chime.mp3
 *   assets/audio/yawn.mp3
 *   assets/audio/water.mp3
 *   assets/audio/pomodoro-start.mp3
 *   assets/audio/pomodoro-end.mp3
 *   assets/audio/happy.mp3
 *
 * Multiple instances of the same clip are allowed (footsteps during walk).
 */
const SOUND_FILES = {
    footstep:        'footstep.mp3',
    pop:             'pop.mp3',
    chime:           'chime.mp3',
    yawn:            'yawn.mp3',
    water:           'water.mp3',
    pomodoroStart:   'pomodoro-start.mp3',
    pomodoroEnd:     'pomodoro-end.mp3',
    happy:           'happy.mp3',
};

export class SoundManager {
    constructor({ basePath, getSettings } = {}) {
        this._basePath = basePath || '../../assets/audio';
        this._getSettings = getSettings || (() => ({ volume: 0.3, mute: false }));
        this._externalMute = false;
        this._cache = new Map();
        this._ready = false;
    }

    /** Preload every clip; resolves even if files are missing. */
    async preload() {
        if (this._ready) return;
        const promises = Object.entries(SOUND_FILES).map(([key, file]) => {
            return new Promise((resolve) => {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.volume = this._computeVolume();
                audio.addEventListener('canplaythrough', () => {
                    this._cache.set(key, audio);
                    resolve();
                }, { once: true });
                audio.addEventListener('error', () => {
                    // File missing or unsupported — keep null entry; play() becomes no-op.
                    resolve();
                }, { once: true });
                try {
                    audio.src = `${this._basePath}/${file}`;
                    audio.load();
                } catch (_) {
                    resolve();
                }
            });
        });
        await Promise.all(promises);
        this._ready = true;
    }

    setMute(flag) { this._externalMute = !!flag; }

    /** Play a named effect. Safe to call repeatedly. */
    play(name) {
        const audio = this._cache.get(name);
        if (!audio) return false;       // file missing or unsupported
        if (this._externalMute) return false;
        const s = this._getSettings() || {};
        if (s.mute) return false;
        try {
            audio.currentTime = 0;
            audio.volume = (this._computeVolume() || 0.3);
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) { /* never throw */ }
        return true;
    }

    _computeVolume() {
        const s = this._getSettings() || {};
        if (s.mute || this._externalMute) return 0;
        return Math.max(0, Math.min(1, Number(s.volume) || 0.3));
    }

    /** List effects that failed to load (useful for the settings UI). */
    unavailable() {
        return Object.keys(SOUND_FILES).filter(k => !this._cache.has(k));
    }
}

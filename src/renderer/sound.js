/**
 * SoundManager — plays optional audio files and falls back to small Web Audio
 * effects generated at runtime. Missing files never make an interaction silent.
 *
 * Honours live settings.volume (0..1), settings.mute and the DND mute hold.
 */

const SOUND_FILES = Object.freeze({
    footstep:        'footstep.mp3',
    pop:             'pop.mp3',
    chime:           'chime.mp3',
    yawn:            'yawn.mp3',
    water:           'water.mp3',
    pomodoroStart:   'pomodoro-start.mp3',
    pomodoroEnd:     'pomodoro-end.mp3',
    happy:           'happy.mp3',
});

/**
 * Each tone is { at, duration, type, from, to, gain }. Frequencies are in Hz;
 * times are seconds. Keeping recipes as data makes the fallback deterministic
 * and easy to test without an audio device.
 */
export const PROCEDURAL_RECIPES = Object.freeze({
    footstep: Object.freeze([
        { at: 0, duration: 0.09, type: 'sine', from: 125, to: 72, gain: 0.22 },
    ]),
    pop: Object.freeze([
        { at: 0, duration: 0.11, type: 'triangle', from: 430, to: 780, gain: 0.18 },
    ]),
    chime: Object.freeze([
        { at: 0, duration: 0.24, type: 'sine', from: 659, to: 659, gain: 0.16 },
        { at: 0.10, duration: 0.30, type: 'sine', from: 880, to: 880, gain: 0.13 },
    ]),
    yawn: Object.freeze([
        { at: 0, duration: 0.42, type: 'triangle', from: 280, to: 155, gain: 0.10 },
    ]),
    water: Object.freeze([
        { at: 0, duration: 0.09, type: 'sine', from: 720, to: 560, gain: 0.11 },
        { at: 0.10, duration: 0.09, type: 'sine', from: 820, to: 620, gain: 0.10 },
        { at: 0.20, duration: 0.13, type: 'sine', from: 920, to: 680, gain: 0.09 },
    ]),
    pomodoroStart: Object.freeze([
        { at: 0, duration: 0.17, type: 'sine', from: 440, to: 440, gain: 0.13 },
        { at: 0.17, duration: 0.24, type: 'sine', from: 660, to: 660, gain: 0.15 },
    ]),
    pomodoroEnd: Object.freeze([
        { at: 0, duration: 0.18, type: 'sine', from: 660, to: 660, gain: 0.13 },
        { at: 0.14, duration: 0.20, type: 'sine', from: 880, to: 880, gain: 0.14 },
        { at: 0.29, duration: 0.28, type: 'sine', from: 1047, to: 1047, gain: 0.12 },
    ]),
    happy: Object.freeze([
        { at: 0, duration: 0.15, type: 'triangle', from: 523, to: 523, gain: 0.13 },
        { at: 0.12, duration: 0.17, type: 'triangle', from: 659, to: 659, gain: 0.14 },
        { at: 0.25, duration: 0.25, type: 'triangle', from: 784, to: 784, gain: 0.15 },
    ]),
});

export const STATE_SOUND_MAP = Object.freeze({
    walk: 'footstep',
    run: 'footstep',
    land: 'footstep',
    surprise: 'chime',
    love: 'pop',
    wave: 'pop',
    eat: 'pop',
    drink: 'water',
    cheer: 'happy',
    yawn: 'yawn',
    stretch: 'yawn',
});

export class SoundManager {
    constructor({ basePath, getSettings, AudioCtor, AudioContextCtor } = {}) {
        this._basePath = basePath || '../../assets/audio';
        this._getSettings = getSettings || (() => ({ volume: 0.3, mute: false }));
        this._AudioCtor = AudioCtor === undefined ? globalThis.Audio : AudioCtor;
        this._AudioContextCtor = AudioContextCtor === undefined
            ? (globalThis.AudioContext || globalThis.webkitAudioContext)
            : AudioContextCtor;
        this._externalMute = false;
        this._cache = new Map();
        this._context = null;
        this._ready = false;
    }

    /** Preload optional clips; procedural effects remain available if absent. */
    async preload() {
        if (this._ready) return;
        if (typeof this._AudioCtor !== 'function') {
            this._ready = true;
            return;
        }

        const promises = Object.entries(SOUND_FILES).map(([key, file]) => new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            try {
                const audio = new this._AudioCtor();
                audio.preload = 'auto';
                audio.volume = this._computeVolume();
                audio.addEventListener('canplaythrough', () => {
                    this._cache.set(key, audio);
                    finish();
                }, { once: true });
                audio.addEventListener('error', finish, { once: true });
                audio.src = `${this._basePath}/${file}`;
                audio.load();
            } catch (_) {
                finish();
            }
        }));
        await Promise.all(promises);
        this._ready = true;
    }

    setMute(flag) { this._externalMute = !!flag; }

    /** Play a named effect. Returns false only when muted or unsupported. */
    play(name) {
        if (!Object.hasOwn(SOUND_FILES, name)) return false;
        const volume = this._computeVolume();
        if (volume <= 0) return false;

        const audio = this._cache.get(name);
        if (!audio) return this._playProcedural(name, volume);

        try {
            audio.currentTime = 0;
            audio.volume = volume;
            const result = audio.play();
            if (result && typeof result.catch === 'function') {
                result.catch(() => this._playProcedural(name, volume));
            }
            return true;
        } catch (_) {
            return this._playProcedural(name, volume);
        }
    }

    playForState(state) {
        const effect = STATE_SOUND_MAP[state];
        return effect ? this.play(effect) : false;
    }

    _playProcedural(name, volume) {
        const recipe = PROCEDURAL_RECIPES[name];
        const context = this._ensureContext();
        if (!recipe || !context) return false;

        try {
            if (context.state === 'suspended' && typeof context.resume === 'function') {
                const result = context.resume();
                if (result && typeof result.catch === 'function') result.catch(() => {});
            }
            const origin = context.currentTime + 0.01;
            for (const tone of recipe) this._scheduleTone(context, origin, tone, volume);
            return true;
        } catch (_) {
            return false;
        }
    }

    _ensureContext() {
        if (this._context) return this._context;
        if (typeof this._AudioContextCtor !== 'function') return null;
        try {
            this._context = new this._AudioContextCtor();
        } catch (_) {
            this._context = null;
        }
        return this._context;
    }

    _scheduleTone(context, origin, tone, volume) {
        const startAt = origin + tone.at;
        const endAt = startAt + tone.duration;
        const attackEnd = Math.min(endAt, startAt + 0.018);
        const oscillator = context.createOscillator();
        const envelope = context.createGain();

        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.from, startAt);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), endAt);
        envelope.gain.setValueAtTime(0.0001, startAt);
        envelope.gain.linearRampToValueAtTime(Math.max(0.0001, volume * tone.gain), attackEnd);
        envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

        oscillator.connect(envelope);
        envelope.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(endAt + 0.02);
    }

    _computeVolume() {
        const settings = this._getSettings() || {};
        if (settings.mute || this._externalMute) return 0;
        const parsed = Number(settings.volume);
        const volume = Number.isFinite(parsed) ? parsed : 0.3;
        return Math.max(0, Math.min(1, volume));
    }

    /** Effects unavailable through both an external file and Web Audio. */
    unavailable() {
        const canSynthesize = typeof this._AudioContextCtor === 'function';
        return Object.keys(SOUND_FILES).filter((key) => (
            !this._cache.has(key) && !(canSynthesize && PROCEDURAL_RECIPES[key])
        ));
    }

    /** Optional external clips that were not loaded; useful for diagnostics. */
    missingFiles() {
        return Object.keys(SOUND_FILES).filter((key) => !this._cache.has(key));
    }

    dispose() {
        if (this._context && typeof this._context.close === 'function') {
            try {
                const result = this._context.close();
                if (result && typeof result.catch === 'function') result.catch(() => {});
            } catch (_) { /* best-effort cleanup */ }
        }
        this._context = null;
        this._cache.clear();
    }
}

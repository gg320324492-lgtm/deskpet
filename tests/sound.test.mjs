import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    PROCEDURAL_RECIPES,
    STATE_SOUND_MAP,
    SoundManager,
} from '../src/renderer/sound.js';

class FakeParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
    linearRampToValueAtTime() {}
}

class FakeAudioContext {
    constructor() {
        this.currentTime = 1;
        this.destination = {};
        this.state = 'running';
        this.oscillators = [];
    }

    createOscillator() {
        const oscillator = {
            frequency: new FakeParam(),
            connect() {},
            start: (at) => { oscillator.startedAt = at; },
            stop: (at) => { oscillator.stoppedAt = at; },
        };
        this.oscillators.push(oscillator);
        return oscillator;
    }

    createGain() {
        return { gain: new FakeParam(), connect() {} };
    }

    close() { return Promise.resolve(); }
}

function manager(settings = { volume: 0.4, mute: false }) {
    return new SoundManager({
        getSettings: () => settings,
        AudioCtor: null,
        AudioContextCtor: FakeAudioContext,
    });
}

test('every state mapping targets a procedural recipe', () => {
    for (const effect of Object.values(STATE_SOUND_MAP)) {
        assert.ok(PROCEDURAL_RECIPES[effect]);
    }
});

test('procedural fallback schedules a state effect without audio files', () => {
    const sound = manager();
    assert.equal(sound.playForState('wave'), true);
    assert.ok(sound._context.oscillators.length > 0);
    assert.equal(sound.playForState('idle'), false);
    assert.deepEqual(sound.unavailable(), []);
    sound.dispose();
});

test('an explicit zero volume stays silent', () => {
    const sound = manager({ volume: 0, mute: false });
    assert.equal(sound.play('chime'), false);
    assert.equal(sound._context, null);
});

test('mute and DND suppress generated effects', () => {
    const muted = manager({ volume: 0.8, mute: true });
    assert.equal(muted.play('happy'), false);

    const dnd = manager({ volume: 0.8, mute: false });
    dnd.setMute(true);
    assert.equal(dnd.play('happy'), false);
});

test('invalid volume falls back to 30 percent and values are clamped', () => {
    assert.equal(manager({ volume: 'invalid', mute: false })._computeVolume(), 0.3);
    assert.equal(manager({ volume: 4, mute: false })._computeVolume(), 1);
    assert.equal(manager({ volume: -2, mute: false })._computeVolume(), 0);
});

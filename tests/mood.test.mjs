/**
 * tests/mood.test.mjs
 *
 * Smoke tests for src/renderer/mood.js — no DOM or Electron needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MoodEngine } from '../src/renderer/mood.js';

function makeStore(initial) {
    // Contract: bootstrap wires `() => cache.get('mood')` (flat domain root)
    // into MoodEngine, so the getter here mirrors that flat shape, NOT a
    // nested `{ mood: { ... } }` envelope.
    const store = { mood: 60, energy: 80, hunger: 30, affinity: 0, focus: 0, lastTickAt: 0, ...(initial || {}) };
    return {
        store,
        getSettings: () => store,
        setSettings: async (patch) => {
            for (const [k, v] of Object.entries(patch)) Object.assign(store, v);
        },
    };
}

test('initial snapshot returns defaults', () => {
    const { store, getSettings, setSettings } = makeStore();
    const e = new MoodEngine({ getSettings, setSettings });
    const s = e.snapshot();
    assert.equal(s.mood, 60);
    assert.equal(s.energy, 80);
});

test('bump clamps within bounds', async () => {
    const { store, getSettings, setSettings } = makeStore();
    const e = new MoodEngine({ getSettings, setSettings });
    await e.bump('mood', 200);
    assert.equal(store.mood, 100);
    await e.bump('energy', -500);
    assert.equal(store.energy, 0);
});

test('affinity is monotonic and unbounded', async () => {
    const { store, getSettings, setSettings } = makeStore();
    const e = new MoodEngine({ getSettings, setSettings });
    await e.bump('affinity', 50);
    await e.bump('affinity', 50);
    assert.equal(store.affinity, 100);
});

test('convenience events update multiple stats', async () => {
    const { store, getSettings, setSettings } = makeStore();
    const e = new MoodEngine({ getSettings, setSettings });
    await e.onPomodoroComplete();
    assert.equal(store.mood, 65);
    assert.equal(store.affinity, 5);

    await e.onTodoComplete();
    assert.equal(store.hunger, 27);

    await e.onSleepEnter();
    assert.equal(store.energy, 100);

    await e.onFeed();
    assert.equal(store.hunger, 7);
});

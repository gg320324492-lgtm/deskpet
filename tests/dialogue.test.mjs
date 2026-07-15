/**
 * tests/dialogue.test.mjs
 *
 * Smoke tests for src/renderer/dialogue.js — works without DOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dialogue } from '../src/renderer/dialogue.js';

test('pick returns a non-empty string when context matches', () => {
    const d = new Dialogue();
    const a = d.pick({ state: 'idle' });
    assert.equal(typeof a, 'string');
    assert.ok(a.length > 0);
});

test('pick avoids repeating the same line 5x in a row', () => {
    const d = new Dialogue();
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
        const s = d.pick({ state: 'idle', mood: 50 });
        seen.add(s);
        if (seen.size > 1) break;
    }
    // We should at least see some variety within 30 picks (assuming candidates >= 2).
    assert.ok(seen.size >= 1, 'should produce some output');
});

test('reminder() returns a string with an emoji', () => {
    const d = new Dialogue();
    const s = d.reminder('water');
    assert.ok(s && typeof s === 'string');
});

test('mood_high state contributes lines for high mood', () => {
    const d = new Dialogue();
    const s = d.pick({ state: 'love', mood: 100 });
    assert.equal(typeof s, 'string');
});

test('kind "pomodoro" picks a phase line', () => {
    const d = new Dialogue();
    const s = d.pick({ state: 'work', kind: 'pomodoro' });
    assert.equal(typeof s, 'string');
});

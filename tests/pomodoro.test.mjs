/**
 * tests/pomodoro.test.mjs
 *
 * Smoke test for src/renderer/pomodoro.js — works without an Electron runtime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PomodoroTimer } from '../src/renderer/pomodoro.js';

function fresh() {
    const store = {
        pomodoro: {
            workMin: 25,
            breakMin: 5,
            longBreakMin: 15,
            longBreakEvery: 4,
            sessionsToday: 0,
            sessionsTotal: 0,
            date: '2026-07-15',
        },
    };
    const bubbles = [];
    return {
        store,
        bubbles,
        timer: new PomodoroTimer({
            getSettings: () => store,
            setSettings: (p) => Object.assign(store.pomodoro, p.pomodoro),
            onBubble: (text) => bubbles.push(text),
        }),
    };
}

test('initial phase is idle', () => {
    const { timer } = fresh();
    assert.equal(timer.snapshot().phase, 'idle');
    timer.dispose();
});

test('start enters work phase', () => {
    const { timer } = fresh();
    timer.start();
    assert.equal(timer.snapshot().phase, 'work');
    timer.dispose();
});

test('stop from work returns to idle', () => {
    const { timer } = fresh();
    timer.start();
    timer.stop();
    assert.equal(timer.snapshot().phase, 'idle');
    timer.dispose();
});

test('pause/resume work keeps the same phase', () => {
    const { timer } = fresh();
    timer.start();
    timer.pause();
    assert.equal(timer.snapshot().phase, 'paused');
    timer.resume();
    assert.equal(timer.snapshot().phase, 'work');
    timer.dispose();
});

test('start while already in work is a no-op', () => {
    const { timer } = fresh();
    timer.start();
    const ok = timer.start();
    assert.equal(ok, false);
    timer.dispose();
});

test('skip moves a work phase to rest without counting a completed session', () => {
    const { timer, store } = fresh();
    timer.start();
    assert.equal(timer.skip(), true);
    assert.equal(timer.snapshot().phase, 'rest');
    assert.equal(store.pomodoro.sessionsToday, 0);
    timer.dispose();
});

test('continueWork starts another work period only from a rest phase', () => {
    const { timer } = fresh();
    assert.equal(timer.continueWork(), false);
    timer.start();
    timer.skip();
    assert.equal(timer.snapshot().phase, 'rest');
    assert.equal(timer.continueWork(), true);
    assert.equal(timer.snapshot().phase, 'work');
    timer.dispose();
});

test.afterEach(() => { /* ensure cleanup via dispose in each test */ });

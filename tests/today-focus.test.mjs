import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayFocus, clearTodayFocusPatch, todayFocusPatch } from '../src/renderer/today-focus.js';

test('today focus resolves only an open task that belongs to the current local day', () => {
    const now = new Date(2026, 6, 18, 10);
    const task = { id: 'main', title: '写提纲', bucket: 'today', dueAt: now.toISOString(), completed: false };
    const focus = todayFocusPatch(task, now);
    assert.equal(buildTodayFocus({ focus, todos: [task], now }).task.id, 'main');
    assert.equal(buildTodayFocus({ focus: { ...focus, date: '2026-07-17' }, todos: [task], now }).task, null);
    assert.equal(buildTodayFocus({ focus, todos: [{ ...task, completed: true }], now }).task, null);
});

test('today focus can be cleared without touching task data', () => {
    assert.equal(clearTodayFocusPatch(), null);
    assert.throws(() => todayFocusPatch(null), /requires a task id/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FocusFlow } from '../src/renderer/focus-flow.js';

class FakePomodoro {
    constructor() { this.phase = 'idle'; this.listeners = new Set(); }
    snapshot() { return { phase: this.phase, remainingMs: 0, sessionsToday: 0 }; }
    onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    transition(phase) { this.phase = phase; for (const listener of this.listeners) listener(this.snapshot()); }
    start() { if (this.phase !== 'idle') return false; this.transition('work'); return true; }
    pause() { if (this.phase === 'idle') return false; this.transition('paused'); return true; }
    resume() { if (this.phase !== 'paused') return false; this.transition('work'); return true; }
    continueWork() { if (this.phase !== 'rest' && this.phase !== 'longRest') return false; this.transition('work'); return true; }
    stop() { if (this.phase === 'idle') return false; this.transition('idle'); return true; }
    skip() { if (this.phase === 'idle') return false; this.transition('rest'); return true; }
}

test('linked focus work asks before marking its task complete, then restores the base scene', () => {
    const pomodoro = new FakePomodoro();
    const calls = [];
    const completed = [];
    const notices = [];
    const events = [];
    const flow = new FocusFlow({
        pomodoro,
        scene: {
            setOverride: (id) => calls.push(['override', id]),
            clearOverride: () => calls.push(['clear']),
        },
        todoList: { complete: (id) => completed.push(id) },
        onNotice: (text) => notices.push(text),
        onEvent: (event) => events.push(event),
    });

    assert.equal(flow.start({ id: 't1', title: '整理方案' }), true);
    assert.deepEqual(calls, [['override', 'focus']]);
    pomodoro.transition('rest');
    assert.deepEqual(calls.at(-1), ['override', 'relaxed']);
    assert.deepEqual(completed, []);
    assert.match(notices[0], /整理方案/);
    assert.deepEqual(events.map((event) => event.type), ['focus-start', 'focus-complete']);
    assert.equal(flow.snapshot().awaitingDecision, true);
    assert.equal(flow.completeTask(), true);
    assert.deepEqual(completed, ['t1']);
    assert.equal(flow.snapshot().awaitingDecision, false);
    pomodoro.transition('idle');
    assert.deepEqual(calls.at(-1), ['clear']);
    assert.equal(flow.snapshot().task, null);
    flow.dispose();
});

test('linked focus can continue from its gentle landing or keep resting without completing the task', () => {
    const pomodoro = new FakePomodoro();
    const completed = [];
    const flow = new FocusFlow({
        pomodoro,
        scene: { setOverride: () => {}, clearOverride: () => {} },
        todoList: { complete: (id) => completed.push(id) },
    });
    flow.start({ id: 't3', title: '继续写一段' });
    pomodoro.transition('rest');
    assert.equal(flow.rest(), true);
    assert.deepEqual(completed, []);
    assert.equal(flow.continue(), true);
    assert.equal(flow.snapshot().phase, 'work');
    assert.equal(flow.snapshot().task?.id, 't3');
    flow.stop();
    flow.dispose();
});

test('skipping a linked work period never marks its task as complete', () => {
    const pomodoro = new FakePomodoro();
    const completed = [];
    const events = [];
    const flow = new FocusFlow({
        pomodoro,
        scene: { setOverride: () => {}, clearOverride: () => {} },
        todoList: { complete: (id) => completed.push(id) },
        onEvent: (event) => events.push(event),
    });
    flow.start({ id: 't2', title: '不应完成' });
    flow.skip();
    assert.deepEqual(completed, []);
    assert.deepEqual(events.map((event) => event.type), ['focus-start', 'focus-skip']);
    flow.stop();
    flow.dispose();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGentleStart } from '../src/renderer/gentle-start.js';

test('gentle start prefers the chosen today mainline', () => {
    const now = new Date(2026, 6, 18, 10);
    const todos = [
        { id: 'other', title: '整理桌面', bucket: 'today', completed: false, createdAt: 1 },
        { id: 'main', title: '写提纲', bucket: 'today', completed: false, createdAt: 2 },
    ];
    const result = buildGentleStart({
        todos,
        focus: { date: '2026-07-18', taskId: 'main', updatedAt: now.valueOf() },
        now,
    });
    assert.equal(result.task.id, 'main');
    assert.equal(result.isMainline, true);
});

test('gentle start falls back to one current today task without pulling future work forward', () => {
    const now = new Date(2026, 6, 18, 10);
    const result = buildGentleStart({
        now,
        todos: [
            { id: 'future', title: '明天再做', bucket: 'later', dueAt: '2026-07-19T09:00:00.000Z', completed: false, priority: 3 },
            { id: 'today', title: '先做这一件', bucket: 'today', completed: false, priority: 1, createdAt: 5 },
        ],
    });
    assert.equal(result.task.id, 'today');
    assert.equal(result.isMainline, false);
    assert.equal(result.todayCount, 1);
});

test('a next step saved after focus is prioritized over a different today mainline', () => {
    const now = new Date(2026, 6, 18, 10);
    const result = buildGentleStart({
        now,
        focus: { date: '2026-07-18', taskId: 'main', updatedAt: now.valueOf() },
        todos: [
            { id: 'main', title: '整理桌面', bucket: 'today', completed: false, priority: 3, createdAt: 1 },
            { id: 'follow-up', title: '写提纲', note: '先列三个小标题', nextStepAt: now.valueOf(), bucket: 'today', completed: false, createdAt: 2 },
        ],
    });
    assert.equal(result.task.id, 'follow-up');
    assert.equal(result.isMainline, false);
    assert.equal(result.isFollowUp, true);
});

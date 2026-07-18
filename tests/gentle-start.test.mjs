import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayCloseoutPatch } from '../src/renderer/day-closeout.js';
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

test('a focus next step naturally returns as tomorrow\'s starting point after closeout', () => {
    const evening = new Date(2026, 6, 18, 20);
    const nextDay = new Date(2026, 6, 19, 10);
    const carried = {
        id: 'carry',
        title: '继续整理提纲',
        note: '先补上开头的三个小标题',
        nextStepAt: evening.valueOf(),
        bucket: 'today',
        completed: false,
        createdAt: 1,
        ...dayCloseoutPatch('tomorrow', evening),
    };
    const result = buildGentleStart({
        now: nextDay,
        todos: [
            { id: 'other', title: '另一件明天的事', bucket: 'today', completed: false, priority: 3, createdAt: 2 },
            carried,
        ],
    });
    assert.equal(result.task.id, 'carry');
    assert.equal(result.task.note, '先补上开头的三个小标题');
    assert.equal(result.isFollowUp, true);
});

test('a finished tiny-action set stays out of the next-start suggestion', () => {
    const now = new Date(2026, 6, 18, 10);
    const result = buildGentleStart({
        now,
        todos: [
            { id: 'closed', title: '已收好小步', bucket: 'today', completed: false, priority: 3, microSteps: [{ text: '打开资料', completed: true }] },
            { id: 'next', title: '另一件轻事', bucket: 'today', completed: false, priority: 1 },
        ],
    });
    assert.equal(result.task.id, 'next');
    assert.equal(result.todayCount, 2);
});

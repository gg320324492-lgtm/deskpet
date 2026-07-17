import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDayCloseout, dayCloseoutPatch, tomorrowDueAt } from '../src/renderer/day-closeout.js';

test('day closeout includes only unfinished Today tasks and gives a gentle local summary', () => {
    const now = new Date(2026, 6, 17, 20, 0, 0);
    const closeout = buildDayCloseout({
        now,
        todos: [
            { id: 'today', title: '写复盘', bucket: 'today', completed: false, dueAt: null },
            { id: 'future', title: '明天再说', bucket: 'later', completed: false, dueAt: new Date(2026, 6, 18, 9).toISOString() },
            { id: 'done', title: '完成专注', bucket: 'today', completed: true, doneAt: now.valueOf() },
        ],
    });
    assert.equal(closeout.pending.length, 1);
    assert.equal(closeout.pending[0].id, 'today');
    assert.equal(closeout.completed, 1);
    assert.match(closeout.summary, /完成了 1 件/);
    assert.match(closeout.summary, /还有 1 件/);
});

test('closeout task actions preserve tasks while clearing the old time block', () => {
    const now = new Date(2026, 6, 17, 20, 0, 0);
    const tomorrow = dayCloseoutPatch('tomorrow', now);
    assert.equal(tomorrow.bucket, 'later');
    assert.equal(tomorrow.timeBlock, '');
    assert.equal(new Date(tomorrow.dueAt).getDate(), 18);
    assert.deepEqual(dayCloseoutPatch('inbox', now), { bucket: 'inbox', dueAt: null, timeBlock: '', tomorrowPlan: '' });
    assert.deepEqual(dayCloseoutPatch('later', now), { bucket: 'later', dueAt: null, timeBlock: '', tomorrowPlan: '' });
    assert.equal(new Date(tomorrowDueAt(now)).getHours(), 9);
});

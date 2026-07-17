import { test } from 'node:test';
import assert from 'node:assert/strict';

import { beginTodayPatch, buildTodayStart, nextOpenTimeBlock } from '../src/renderer/today-start.js';

test('today start only surfaces tasks carried exactly into the current day', () => {
    const now = new Date(2026, 6, 18, 9, 0, 0);
    const today = now.toISOString();
    const view = buildTodayStart({
        now,
        todos: [
            { id: 'important', title: '先做这个', completed: false, dueAt: today, tomorrowPlan: 'important' },
            { id: 'doable', title: '然后做', completed: false, dueAt: today, tomorrowPlan: 'doable' },
            { id: 'old', title: '旧计划', completed: false, dueAt: new Date(2026, 6, 17, 9).toISOString(), tomorrowPlan: 'important' },
            { id: 'plain', title: '普通任务', completed: false, dueAt: today, tomorrowPlan: '' },
        ],
    });
    assert.equal(view.important.id, 'important');
    assert.deepEqual(view.doable.map((task) => task.id), ['doable']);
});

test('starting a carried task clears its tomorrow label and can reserve the next open block', () => {
    assert.deepEqual(beginTodayPatch(), { tomorrowPlan: '' });
    assert.deepEqual(beginTodayPatch({ timeBlock: 'afternoon' }), { tomorrowPlan: '', timeBlock: 'afternoon' });
    assert.equal(nextOpenTimeBlock([{ timeBlock: 'morning' }, { timeBlock: 'afternoon' }]).id, 'evening');
    assert.equal(nextOpenTimeBlock([{ timeBlock: 'morning' }, { timeBlock: 'afternoon' }, { timeBlock: 'evening' }]).id, 'morning');
});

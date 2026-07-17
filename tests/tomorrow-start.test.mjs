import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTomorrowStart, canPlanTomorrow, returnToInboxPatch, tomorrowKey, tomorrowPlanPatch } from '../src/renderer/tomorrow-start.js';

test('tomorrow start limits the plan to one important task and two doable tasks', () => {
    const now = new Date(2026, 6, 17, 20, 0, 0);
    const dueAt = tomorrowPlanPatch('important', now).dueAt;
    const todos = [
        { id: 'i', title: '最重要', dueAt, completed: false, tomorrowPlan: 'important' },
        { id: 'd1', title: '可做一', dueAt, completed: false, tomorrowPlan: 'doable' },
        { id: 'd2', title: '可做二', dueAt, completed: false, tomorrowPlan: 'doable' },
        { id: 'future', title: '以后', dueAt: new Date(2026, 6, 19, 9).toISOString(), completed: false, tomorrowPlan: 'doable' },
    ];
    const plan = buildTomorrowStart({ todos, now });
    assert.equal(tomorrowKey(now), '2026-07-18');
    assert.equal(plan.important.id, 'i');
    assert.deepEqual(plan.doable.map((task) => task.id), ['d1', 'd2']);
    assert.equal(canPlanTomorrow({ todos, role: 'important', now }), false);
    assert.equal(canPlanTomorrow({ todos, role: 'doable', now }), false);
});

test('planned tasks receive a due date and can be returned to the inbox', () => {
    const now = new Date(2026, 6, 17, 20, 0, 0);
    assert.deepEqual(tomorrowPlanPatch('important', now), {
        bucket: 'later', dueAt: new Date(2026, 6, 18, 9, 0, 0).toISOString(), timeBlock: '', tomorrowPlan: 'important', priority: 1,
    });
    assert.equal(tomorrowPlanPatch('doable', now).priority, 2);
    assert.deepEqual(returnToInboxPatch(), { bucket: 'inbox', dueAt: null, timeBlock: '', tomorrowPlan: '' });
});

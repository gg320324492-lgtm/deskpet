import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSoftSchedule, nextSoftTimeBlock, nextSoftTimeBlockPatch } from '../src/renderer/soft-schedule.js';

test('soft schedule prefers the current window task, then one unscheduled Today task', () => {
    const now = new Date(2026, 6, 18, 14, 20);
    const schedule = buildSoftSchedule({
        now,
        todos: [
            { id: 'unplanned', title: '整理桌面', bucket: 'today', completed: false, createdAt: 1 },
            { id: 'morning', title: '写晨间笔记', bucket: 'today', timeBlock: 'morning', completed: false, createdAt: 2 },
            { id: 'afternoon', title: '回复邮件', bucket: 'today', timeBlock: 'afternoon', completed: false, createdAt: 3 },
        ],
    });
    assert.equal(schedule.currentId, 'afternoon');
    assert.equal(schedule.currentLabel, '下午');
    assert.equal(schedule.task.id, 'afternoon');
    assert.equal(schedule.taskIsAssigned, true);
    assert.equal(schedule.currentCount, 1);
});

test('soft schedule is only a quiet end-of-window hint and does not infer a task outside soft hours', () => {
    const nearingEnd = buildSoftSchedule({
        now: new Date(2026, 6, 18, 17, 20),
        todos: [{ id: 'afternoon', title: '整理资料', bucket: 'today', timeBlock: 'afternoon', completed: false }],
    });
    assert.equal(nearingEnd.nearEnd, true);
    assert.deepEqual(nearingEnd.next, { id: 'evening', label: '晚上', tomorrow: false });
    const transition = buildSoftSchedule({ now: new Date(2026, 6, 18, 18, 20), todos: [] });
    assert.equal(transition.currentId, '');
    assert.equal(transition.task, null);
});

test('the next soft window moves forward within today, then safely carries evening work to tomorrow morning', () => {
    const afternoon = new Date(2026, 6, 18, 14, 20);
    assert.deepEqual(nextSoftTimeBlock(afternoon), { id: 'evening', label: '晚上', tomorrow: false });
    assert.deepEqual(nextSoftTimeBlockPatch(afternoon), {
        bucket: 'today', dueAt: afternoon.toISOString(), timeBlock: 'evening', tomorrowPlan: '',
    });
    const evening = new Date(2026, 6, 18, 22, 20);
    const tomorrow = nextSoftTimeBlockPatch(evening);
    assert.equal(tomorrow.bucket, 'later');
    assert.equal(tomorrow.timeBlock, 'morning');
    assert.equal(new Date(tomorrow.dueAt).getDate(), 19);
    assert.equal(new Date(tomorrow.dueAt).getHours(), 9);
});

test('a next-window handoff leaves the task and its saved next step intact', () => {
    const task = {
        id: 'carry', title: '整理提纲', note: '先补上开头', nextStepAt: 123,
        bucket: 'today', timeBlock: 'afternoon', completed: false,
    };
    const carried = { ...task, ...nextSoftTimeBlockPatch(new Date(2026, 6, 18, 17, 20)) };
    assert.equal(carried.title, '整理提纲');
    assert.equal(carried.note, '先补上开头');
    assert.equal(carried.nextStepAt, 123);
    assert.equal(carried.timeBlock, 'evening');
});

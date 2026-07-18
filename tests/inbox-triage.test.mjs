import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInboxTriage, inboxTriageRecordPatch, isCapturedThought } from '../src/renderer/inbox-triage.js';

const captured = (id, createdAt, title = id) => ({
    id, title, createdAt, completed: false, bucket: 'inbox', note: '专注中随手收集 · 稍后再看',
});

test('inbox triage shows captured thoughts, the latest one, and no more than three daily choices', () => {
    const now = new Date(2026, 6, 18, 10, 0);
    const result = buildInboxTriage({
        now,
        todos: [
            captured('one', 1, '查资料'),
            captured('two', 2, '回消息'),
            captured('three', 3, '整理照片'),
            captured('four', 4, '买收纳盒'),
            { id: 'plain', title: '普通收件箱', createdAt: 5, completed: false, bucket: 'inbox', note: '' },
        ],
    });

    assert.equal(result.count, 4);
    assert.equal(result.latest.title, '买收纳盒');
    assert.deepEqual(result.candidates.map((task) => task.id), ['one', 'two', 'three']);
    assert.equal(isCapturedThought({ ...captured('done', 1), completed: true }), false);
});

test('today keeps one fixed light triage set instead of continually offering new tasks', () => {
    const now = new Date(2026, 6, 18, 10, 0);
    const todos = [captured('one', 1), captured('two', 2), captured('three', 3), captured('four', 4)];
    const first = buildInboxTriage({ todos, now });
    const inboxTriage = inboxTriageRecordPatch({ date: now, taskIds: first.offeredIds, now: now.valueOf() });
    const afterOneDecision = buildInboxTriage({
        now,
        inboxTriage,
        todos: todos.map((task) => task.id === 'one' ? { ...task, bucket: 'later' } : task),
    });

    assert.equal(afterOneDecision.hasDailySelection, true);
    assert.deepEqual(afterOneDecision.candidates.map((task) => task.id), ['two', 'three']);
    assert.equal(afterOneDecision.candidates.some((task) => task.id === 'four'), false);
});

test('triage records remain bounded and normalize duplicate ids', () => {
    const initial = Object.fromEntries(Array.from({ length: 90 }, (_, index) => [`2026-04-${String(index + 1).padStart(2, '0')}`, { taskIds: ['old'], updatedAt: index }]));
    const next = inboxTriageRecordPatch({
        inboxTriage: initial,
        date: new Date(2026, 6, 18),
        taskIds: ['a', 'a', 'b', 'c', 'd'],
        now: 1,
    });

    assert.equal(Object.keys(next).length, 90);
    assert.deepEqual(next['2026-07-18'].taskIds, ['a', 'b', 'c']);
});

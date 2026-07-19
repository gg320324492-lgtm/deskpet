import { test } from 'node:test';
import assert from 'node:assert/strict';

import { todoBucket } from '../src/renderer/todo.js';
import { taskEditorPatch } from '../src/renderer/task-editor.js';
import { normalizeWaitingNote, resumeWaitingTaskPatch, waitingTaskPatch } from '../src/renderer/task-waiting.js';

test('waiting is an optional, reversible local task state that does not surface today', () => {
    const task = {
        id: 'wait-1', title: '确认拍摄时间', bucket: 'today', dueAt: '2026-07-18T10:00:00.000Z',
        timeBlock: 'afternoon', note: '上次先列联系人', nextStepAt: 8, resumeAcknowledgedAt: 9,
        microSteps: [{ id: 'micro-1', text: '整理候选日期', completed: false }], completed: false,
    };
    const waiting = { ...task, ...waitingTaskPatch('  等对方回复\u0000  ') };
    assert.equal(waiting.bucket, 'waiting');
    assert.equal(waiting.dueAt, null);
    assert.equal(waiting.waitingNote, '等对方回复');
    assert.equal(waiting.note, '上次先列联系人');
    assert.equal(waiting.microSteps[0].text, '整理候选日期');
    assert.equal(todoBucket(waiting, '2026-07-18'), 'waiting');

    const resumed = { ...waiting, ...resumeWaitingTaskPatch(waiting, new Date(2026, 6, 18, 14)) };
    assert.equal(resumed.bucket, 'today');
    assert.equal(resumed.timeBlock, 'afternoon');
    assert.equal(resumed.waitingNote, '等对方回复');
    assert.equal(todoBucket(resumed, '2026-07-18'), 'today');
});

test('task editor can save a waiting reason without discarding its saved starting point or soft block', () => {
    const now = new Date(2026, 6, 18, 14);
    const patch = taskEditorPatch({
        task: { bucket: 'today', timeBlock: 'afternoon' }, title: '等回复', note: '上次先发出资料',
        waitingNote: '等对方确认', microSteps: [{ text: '整理已发内容', completed: false }], bucket: 'waiting',
    }, now);
    assert.equal(patch.bucket, 'waiting');
    assert.equal(patch.dueAt, null);
    assert.equal(patch.timeBlock, 'afternoon');
    assert.equal(patch.note, '上次先发出资料');
    assert.equal(patch.waitingNote, '等对方确认');
    assert.equal(normalizeWaitingNote('x'.repeat(161)).length, 160);
});

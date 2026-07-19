import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTaskThread, normalizeTaskThreadNote, taskThreadPatch } from '../src/renderer/task-thread.js';

test('a task thread keeps only a concise local closing note', () => {
    const patch = taskThreadPatch({}, '  已整理好资料\u0000，等确认后继续  ', 123);
    assert.deepEqual(patch, { threadNote: '已整理好资料，等确认后继续', threadAt: 123 });
    assert.deepEqual(taskThreadPatch({ threadNote: '旧句子' }, '   ', 456), {});
    assert.equal(normalizeTaskThreadNote('x'.repeat(161)).length, 160);
});

test('a task thread gathers the useful task context without inventing progress', () => {
    const thread = buildTaskThread({
        threadNote: '资料已整理好，准备收尾', waitingNote: '等对方确认时间', note: '从候选方案开始看',
        microSteps: [{ id: 'one', text: '整理资料', completed: true }, { id: 'two', text: '发出确认', completed: false }],
        microNotes: [{ id: 'a', text: '找齐来源', at: 1 }, { id: 'b', text: '确认格式', at: 2 }],
    });
    assert.equal(thread.closingNote, '资料已整理好，准备收尾');
    assert.equal(thread.waitingNote, '等对方确认时间');
    assert.equal(thread.lastStartingPoint, '从候选方案开始看');
    assert.deepEqual(thread.steps.map((step) => step.text), ['整理资料', '发出确认']);
    assert.deepEqual(thread.notes.map((note) => note.text), ['确认格式', '找齐来源']);
});

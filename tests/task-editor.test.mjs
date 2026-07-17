import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTaskText, taskEditorPatch } from '../src/renderer/task-editor.js';

test('task editor keeps a concise title and optional next step without unsafe characters', () => {
    assert.equal(normalizeTaskText('  下一步\u0000：找资料  ', 240), '下一步：找资料');
    const patch = taskEditorPatch({
        task: { bucket: 'inbox' }, title: '  整理资料  ', note: '  先找三份参考  ', bucket: 'later',
    }, new Date(2026, 6, 18, 9));
    assert.deepEqual(patch, {
        title: '整理资料', note: '先找三份参考', bucket: 'later', dueAt: null, timeBlock: '', tomorrowPlan: '',
    });
});

test('task editor moves a task into today, retains its current soft block, and rejects empty titles', () => {
    const now = new Date(2026, 6, 18, 9);
    const patch = taskEditorPatch({
        task: { bucket: 'today', timeBlock: 'morning' }, title: '收尾邮件', note: '', bucket: 'today',
    }, now);
    assert.equal(patch.bucket, 'today');
    assert.equal(patch.timeBlock, 'morning');
    assert.equal(patch.dueAt, now.toISOString());
    assert.throws(() => taskEditorPatch({ task: {}, title: '   ', note: '', bucket: 'inbox' }), /不能为空/);
});

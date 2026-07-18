import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasPendingResumeHint, hasResumeHint, normalizeResumeHintText, resumeAcknowledgementPatch, resumeContinuationPatch, resumeHintPatch } from '../src/renderer/task-resume.js';

test('a resume hint reuses the existing next-step fields and remains optional', () => {
    assert.equal(normalizeResumeHintText('  从开头继续\u0000  '), '从开头继续');
    assert.deepEqual(resumeHintPatch('   ', 7), {});
    assert.deepEqual(resumeHintPatch('从开头继续', 7), { note: '从开头继续', nextStepAt: 7, resumeAcknowledgedAt: 0 });
    assert.equal(hasResumeHint({ note: '从开头继续', nextStepAt: 7 }), true);
    assert.equal(hasResumeHint({ note: '从开头继续', nextStepAt: 0 }), false);
});

test('an acknowledged cue remains visible as history but no longer counts as a pending return', () => {
    const task = { note: '从开头继续', nextStepAt: 7, resumeAcknowledgedAt: 0, completed: false };
    const acknowledged = { ...task, ...resumeAcknowledgementPatch(task, 9) };
    assert.equal(acknowledged.note, '从开头继续');
    assert.equal(acknowledged.nextStepAt, 7);
    assert.equal(acknowledged.resumeAcknowledgedAt, 9);
    assert.equal(hasResumeHint(acknowledged), true);
    assert.equal(hasPendingResumeHint(acknowledged), false);

    const fresh = { ...acknowledged, ...resumeHintPatch('下次从资料页继续', 12) };
    assert.equal(fresh.resumeAcknowledgedAt, 0);
    assert.equal(hasPendingResumeHint(fresh), true);
});

test('resuming keeps the saved cue and only creates or edits an explicitly confirmed tiny action', () => {
    const closed = {
        note: '下次从开头继续', nextStepAt: 7, completed: false,
        microSteps: [{ id: 'micro-1', text: '列出标题', completed: true }],
    };
    const resumed = { ...closed, ...resumeContinuationPatch(closed, '先写一句开头') };
    assert.equal(resumed.note, '下次从开头继续');
    assert.equal(resumed.nextStepAt, 7);
    assert.equal(resumed.completed, false);
    assert.deepEqual(resumed.microSteps, [{ id: 'micro-1', text: '先写一句开头', completed: false }]);

    const active = {
        note: '继续整理', nextStepAt: 8,
        microSteps: [{ id: 'micro-1', text: '打开资料', completed: false }, { id: 'micro-2', text: '列标题', completed: false }],
    };
    assert.deepEqual(resumeContinuationPatch(active, ''), {});
    assert.deepEqual(resumeContinuationPatch(active, '先定位上次段落').microSteps, [
        { id: 'micro-1', text: '先定位上次段落', completed: false },
        { id: 'micro-2', text: '列标题', completed: false },
    ]);
});

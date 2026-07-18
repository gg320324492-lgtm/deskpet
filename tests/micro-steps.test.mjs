import { test } from 'node:test';
import assert from 'node:assert/strict';

import { completeMicroStepPatch, currentMicroStep, normalizeMicroSteps, resetMicroSteps } from '../src/renderer/micro-steps.js';

test('micro steps are optional, concise, and limited to three local actions', () => {
    const steps = normalizeMicroSteps(['  打开资料\u0000文件夹 ', '列出三个标题', '写第一段', '不应保留']);
    assert.deepEqual(steps, [
        { id: 'micro-1', text: '打开资料文件夹', completed: false },
        { id: 'micro-2', text: '列出三个标题', completed: false },
        { id: 'micro-3', text: '写第一段', completed: false },
    ]);
    assert.equal(currentMicroStep({ microSteps: steps }).text, '打开资料文件夹');
});

test('completing one micro step reveals the next one without completing the parent task', () => {
    const task = {
        id: 'task-1', title: '整理提纲', completed: false,
        microSteps: normalizeMicroSteps(['打开资料', '列出标题']),
    };
    const patch = completeMicroStepPatch(task, 'micro-1');
    const updated = { ...task, ...patch };
    assert.equal(updated.completed, false);
    assert.equal(updated.microSteps[0].completed, true);
    assert.equal(currentMicroStep(updated).text, '列出标题');
});

test('a recurring task can carry its micro-step wording into a fresh recurrence', () => {
    const reset = resetMicroSteps([
        { id: 'micro-1', text: '打开资料', completed: true },
        { id: 'micro-2', text: '列出标题', completed: false },
    ]);
    assert.equal(reset.every((step) => step.completed === false), true);
    assert.deepEqual(reset.map((step) => step.text), ['打开资料', '列出标题']);
});

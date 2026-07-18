import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasResumeHint, normalizeResumeHintText, resumeHintPatch } from '../src/renderer/task-resume.js';

test('a resume hint reuses the existing next-step fields and remains optional', () => {
    assert.equal(normalizeResumeHintText('  从开头继续\u0000  '), '从开头继续');
    assert.deepEqual(resumeHintPatch('   ', 7), {});
    assert.deepEqual(resumeHintPatch('从开头继续', 7), { note: '从开头继续', nextStepAt: 7 });
    assert.equal(hasResumeHint({ note: '从开头继续', nextStepAt: 7 }), true);
    assert.equal(hasResumeHint({ note: '从开头继续', nextStepAt: 0 }), false);
});

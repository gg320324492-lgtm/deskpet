import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTaskCloseoutReview } from '../src/renderer/task-closeout-review.js';

test('quiet closeout review keeps the completed step path and newest three local notes', () => {
    const review = buildTaskCloseoutReview({
        microSteps: [
            { id: 'micro-1', text: '打开资料', completed: true },
            { id: 'micro-2', text: '列出标题', completed: true },
            { id: 'micro-3', text: '写下开头', completed: true },
        ],
        microNotes: [
            { id: 'a', text: '找到资料', at: 1 },
            { id: 'b', text: '标题排好顺序', at: 2 },
            { id: 'c', text: '开头更清楚了', at: 3 },
            { id: 'd', text: '补上例子', at: 4 },
        ],
    });

    assert.deepEqual(review.steps.map((step) => step.text), ['打开资料', '列出标题', '写下开头']);
    assert.deepEqual(review.notes.map((note) => note.text), ['补上例子', '开头更清楚了', '标题排好顺序']);
});

test('quiet closeout review leaves optional notes empty without inventing progress', () => {
    const review = buildTaskCloseoutReview({
        microSteps: [{ id: 'micro-1', text: '打开资料', completed: true }],
        microNotes: [],
    });
    assert.equal(review.steps.length, 1);
    assert.deepEqual(review.notes, []);
});

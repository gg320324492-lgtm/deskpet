import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedToday, restoreCompletedTaskPatch } from '../src/renderer/task-completion-review.js';

test('completion review keeps only tasks completed on the local current day and sorts newest first', () => {
    const now = new Date(2026, 6, 18, 20);
    const items = [
        { id: 'old', completed: true, doneAt: new Date(2026, 6, 17, 23).valueOf() },
        { id: 'early', completed: true, doneAt: new Date(2026, 6, 18, 9).valueOf() },
        { id: 'late', completed: true, doneAt: new Date(2026, 6, 18, 18).valueOf() },
        { id: 'open', completed: false, doneAt: new Date(2026, 6, 18, 19).valueOf() },
    ];
    assert.deepEqual(completedToday({ todos: items, now }).map((task) => task.id), ['late', 'early']);
});

test('completion review restores a task to today or inbox without removing its other task fields', () => {
    const task = {
        id: 'done', timeBlock: 'afternoon', note: '先把资料摊开',
        microNotes: [{ id: 'note-1', text: '整理了开头', at: 1 }],
    };
    const now = new Date(2026, 6, 18, 10);
    const today = restoreCompletedTaskPatch(task, 'today', now);
    assert.equal(today.completed, false);
    assert.equal(today.bucket, 'today');
    assert.equal(today.timeBlock, 'afternoon');
    assert.equal(today.dueAt, now.toISOString());
    assert.deepEqual({ ...task, ...today }.microNotes, task.microNotes);
    assert.deepEqual(restoreCompletedTaskPatch(task, 'inbox', now), {
        completed: false, doneAt: null, bucket: 'inbox', dueAt: null, timeBlock: '', tomorrowPlan: '',
    });
});

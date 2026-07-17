import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveTaskPatch, restoreTaskPatch, staleTasks } from '../src/renderer/task-triage.js';

test('triage finds only old open inbox or later tasks and archives reversibly', () => {
    const now = new Date(2026, 6, 18, 12).valueOf();
    const old = now - 8 * 86_400_000;
    const items = [
        { id: 'old', bucket: 'inbox', createdAt: old, completed: false },
        { id: 'new', bucket: 'later', createdAt: now - 2 * 86_400_000, completed: false },
        { id: 'done', bucket: 'inbox', createdAt: old, completed: true },
        { id: 'archived', bucket: 'archive', createdAt: old, completed: false },
    ];
    assert.deepEqual(staleTasks({ todos: items, now }).map((item) => item.id), ['old']);
    assert.equal(archiveTaskPatch().bucket, 'archive');
    assert.equal(restoreTaskPatch().bucket, 'inbox');
});

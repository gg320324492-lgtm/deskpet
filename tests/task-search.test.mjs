import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTaskSearchQuery, searchTasks } from '../src/renderer/task-search.js';

test('task search matches titles across active locations and orders the nearest work first', () => {
    const todos = [
        { id: 'inbox', title: '整理桌面', bucket: 'inbox', completed: false },
        { id: 'later', title: '整理照片', bucket: 'later', dueAt: '2026-07-21T10:00:00.000Z', completed: false },
        { id: 'today', title: '整理房间', bucket: 'today', dueAt: '2026-07-18T10:00:00.000Z', completed: false },
        { id: 'archive', title: '整理旧文件', bucket: 'archive', completed: false },
        { id: 'done', title: '整理完成', bucket: 'inbox', completed: true },
    ];
    const results = searchTasks({ todos, query: '整理', now: new Date(2026, 6, 18, 12) });
    assert.deepEqual(results.map(({ task, bucket }) => [task.id, bucket]), [
        ['today', 'today'], ['inbox', 'inbox'], ['later', 'later'], ['archive', 'archive'],
    ]);
});

test('task search normalizes whitespace and case, and does not show results for an empty query', () => {
    const todos = [{ id: 'one', title: 'Read BOOK', bucket: 'inbox', completed: false }];
    assert.equal(normalizeTaskSearchQuery('  READ book  '), 'read book');
    assert.deepEqual(searchTasks({ todos, query: ' book ' }).map(({ task }) => task.id), ['one']);
    assert.deepEqual(searchTasks({ todos, query: '   ' }), []);
});

test('task search keeps waiting tasks discoverable without treating them as today work', () => {
    const results = searchTasks({
        todos: [{ id: 'waiting', title: '等待法务回复', bucket: 'waiting', completed: false }],
        query: '法务', now: new Date(2026, 6, 18, 12),
    });
    assert.deepEqual(results.map(({ task, bucket }) => [task.id, bucket]), [['waiting', 'waiting']]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TodoList, todoBucket } from '../src/renderer/todo.js';

test('quick-captured todos stay in inbox until deliberately placed', () => {
    let settings = { todos: { items: [] } };
    const list = new TodoList({
        getSettings: () => settings,
        setSettings: (patch) => { settings = { ...settings, ...patch }; },
    });

    const captured = list.add({ title: '记下这个想法' });
    assert.equal(list.snapshot().inbox[0].id, captured.id);
    assert.equal(todoBucket(captured), 'inbox');

    assert.equal(list.move(captured.id, 'today'), true);
    assert.equal(list.snapshot().today[0].id, captured.id);
    assert.equal(list.move(captured.id, 'later'), true);
    assert.equal(list.snapshot().later[0].id, captured.id);
    assert.equal(list.complete(captured.id), true);
    assert.equal(list.snapshot().done[0].id, captured.id);
});

test('due items automatically surface today while future due items stay later', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const now = new Date().toISOString();
    assert.equal(todoBucket({ id: 'now', completed: false, dueAt: now, bucket: 'later' }), 'today');
    assert.equal(todoBucket({ id: 'later', completed: false, dueAt: tomorrow.toISOString(), bucket: 'today' }), 'later');
});

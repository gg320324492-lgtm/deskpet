import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendMicroNotePatch, latestMicroNote, normalizeMicroNotes } from '../src/renderer/micro-notes.js';

test('micro notes are concise, chronological, and bounded to the latest three local traces', () => {
    const notes = normalizeMicroNotes([
        { id: 'a', text: '  打开资料\u0000  ', at: 1 },
        { id: 'b', text: '列出标题', at: 2 },
        { id: 'c', text: '写下开头', at: 3 },
        { id: 'd', text: '补了例子', at: 4 },
    ]);
    assert.deepEqual(notes.map((note) => note.text), ['列出标题', '写下开头', '补了例子']);
    assert.equal(latestMicroNote({ microNotes: notes }).text, '补了例子');
});

test('adding an optional micro note leaves an empty entry untouched and keeps only the newest traces', () => {
    const task = { microNotes: [
        { id: 'a', text: '第一轮', at: 1 },
        { id: 'b', text: '第二轮', at: 2 },
        { id: 'c', text: '第三轮', at: 3 },
    ] };
    assert.deepEqual(appendMicroNotePatch(task, '   '), {});
    const patch = appendMicroNotePatch(task, '第四轮', 4);
    assert.deepEqual(patch.microNotes.map((note) => note.text), ['第二轮', '第三轮', '第四轮']);
    assert.equal(latestMicroNote({ ...task, ...patch }).at, 4);
});

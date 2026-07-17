import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTodayFocusEchoes, focusReflectionPatch } from '../src/renderer/focus-reflection.js';

test('focus echoes show only completed local-day sessions and recognize the selected mainline', () => {
    const now = new Date(2026, 6, 18, 20, 0);
    const rhythm = { events: [
        { id: 'old', type: 'focus-complete', at: new Date(2026, 6, 17, 20, 0).valueOf(), title: '旧任务' },
        { id: 'skip', type: 'focus-skip', at: new Date(2026, 6, 18, 10, 0).valueOf(), title: '跳过' },
        { id: 'main', type: 'focus-complete', at: new Date(2026, 6, 18, 14, 0).valueOf(), taskId: 'task-1', title: '整理照片', minutes: 25, detail: '挑出了第一批照片' },
    ] };
    const result = buildTodayFocusEchoes({ rhythm, todayFocus: { task: { id: 'task-1', title: '整理照片' } }, now });
    assert.equal(result.echoes.length, 1);
    assert.equal(result.mainlineEchoes[0].detail, '挑出了第一批照片');
});

test('focus reflection patch updates just the matching completed focus and supports clearing it', () => {
    const rhythm = { events: [
        { id: 'focus-1', type: 'focus-complete', at: 1, title: '整理照片', detail: '' },
        { id: 'task-1', type: 'task-complete', at: 2, title: '别动' },
    ] };
    const updated = focusReflectionPatch({ rhythm, eventId: 'focus-1', detail: '选好了封面' });
    assert.equal(updated.events[0].detail, '选好了封面');
    assert.equal(updated.events[1].title, '别动');
    assert.equal(focusReflectionPatch({ rhythm: updated, eventId: 'focus-1', detail: '' }).events[0].detail, '');
    assert.throws(() => focusReflectionPatch({ rhythm, eventId: 'task-1', detail: 'x' }), /completed focus/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RhythmTracker, buildRhythmSummary, buildWeeklyReview, localDateKey } from '../src/renderer/rhythm.js';

test('rhythm summary uses recorded elapsed focus minutes instead of configured Pomodoro length', () => {
    const now = new Date(2026, 6, 17, 20, 30, 0);
    const summary = buildRhythmSummary({
        now,
        todos: [{ id: 'open', title: '明日方案', completed: false, dueAt: null }],
        rhythm: {
            events: [
                { id: 'a', type: 'focus-complete', at: new Date(2026, 6, 17, 9, 0).valueOf(), title: '写提纲', minutes: 32 },
                { id: 'b', type: 'focus-stop', at: new Date(2026, 6, 17, 11, 0).valueOf(), title: '整理资料', minutes: 11 },
                { id: 'c', type: 'task-complete', at: new Date(2026, 6, 17, 12, 0).valueOf(), title: '复盘', taskId: 'done', minutes: 0 },
            ],
            reflections: {},
        },
    });

    assert.equal(summary.focusMinutes, 43);
    assert.equal(summary.completedFocus, 1);
    assert.equal(summary.completedTasks, 1);
    assert.equal(summary.plannedTasks, 2);
    assert.equal(summary.completionRate, 50);
    assert.equal(summary.week.length, 7);
    assert.equal(summary.todayEvents[0].id, 'c');
});

test('rhythm tracker keeps the most recent bounded local history and reflection', () => {
    let settings = { rhythm: { version: 1, events: [], reflections: {} } };
    const tracker = new RhythmTracker({
        getSettings: () => settings,
        setSettings: (patch) => { settings = { ...settings, ...patch }; },
        now: () => new Date(2026, 6, 17, 21, 0).valueOf(),
    });

    for (let index = 0; index < 362; index += 1) tracker.record({ id: `e${index}`, type: 'scene-change', title: '自由陪伴' });
    tracker.saveReflection({ note: '完成了最重要的一步', tomorrow: '先整理桌面' });

    assert.equal(settings.rhythm.events.length, 360);
    assert.equal(settings.rhythm.events[0].id, 'e2');
    assert.deepEqual(settings.rhythm.reflections[localDateKey(new Date(2026, 6, 17, 21, 0))], {
        note: '完成了最重要的一步',
        tomorrow: '先整理桌面',
        updatedAt: new Date(2026, 6, 17, 21, 0).valueOf(),
    });
});

test('weekly review identifies a sustainable best day and saves up to three next-week goals', () => {
    const now = new Date(2026, 6, 17, 21, 0);
    let settings = { rhythm: { version: 1, events: [
        { id: 'a', type: 'focus-complete', at: new Date(2026, 6, 13, 9, 0).valueOf(), minutes: 25, title: '' },
        { id: 'b', type: 'focus-complete', at: new Date(2026, 6, 15, 9, 0).valueOf(), minutes: 85, title: '' },
        { id: 'c', type: 'task-complete', at: new Date(2026, 6, 15, 11, 0).valueOf(), minutes: 0, taskId: 'done', title: '' },
    ], reflections: {}, weeklyPlans: {} } };
    const tracker = new RhythmTracker({
        getSettings: () => settings,
        setSettings: (patch) => { settings = { ...settings, ...patch }; },
        now: () => now.valueOf(),
    });
    const before = buildWeeklyReview({ rhythm: settings.rhythm, now });

    assert.equal(before.focusMinutes, 110);
    assert.equal(before.activeDays, 2);
    assert.equal(before.bestDay.date, '2026-07-15');
    assert.equal(before.nextWeekKey, '2026-07-20');

    tracker.saveWeeklyPlan({ week: before.nextWeekKey, goals: ['整理桌面', '完成一轮专注', '整理桌面', '额外目标'] });
    assert.deepEqual(settings.rhythm.weeklyPlans['2026-07-20'].goals, ['整理桌面', '完成一轮专注', '额外目标']);
    assert.deepEqual(buildWeeklyReview({ rhythm: settings.rhythm, now }).goals, ['整理桌面', '完成一轮专注', '额外目标']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SceneController, getSceneStatus, isWithinSceneHours } from '../src/renderer/scene-controller.js';

function atHour(hour) {
    return new Date(2026, 6, 17, hour, 0, 0, 0);
}

test('scene schedules support daytime and overnight half-open ranges', () => {
    assert.equal(isWithinSceneHours(atHour(9), 9, 18), true);
    assert.equal(isWithinSceneHours(atHour(18), 9, 18), false);
    assert.equal(isWithinSceneHours(atHour(23), 22, 7), true);
    assert.equal(isWithinSceneHours(atHour(6), 22, 7), true);
    assert.equal(isWithinSceneHours(atHour(7), 22, 7), false);
    assert.equal(isWithinSceneHours(atHour(12), 12, 12), false);
});

test('scheduled scene temporarily wins without replacing the manual scene preference', () => {
    const settings = {
        sceneMode: 'relaxed',
        sceneAutoEnabled: true,
        sceneAutoPreset: 'focus',
        sceneAutoStart: 9,
        sceneAutoEnd: 18,
    };
    const scheduled = getSceneStatus(settings, atHour(10));
    assert.equal(scheduled.id, 'focus');
    assert.equal(scheduled.scheduled, true);
    assert.equal(settings.sceneMode, 'relaxed');

    const manual = getSceneStatus(settings, atHour(19));
    assert.equal(manual.id, 'relaxed');
    assert.equal(manual.scheduled, false);
    assert.equal(manual.dnd, false);
});

test('controller notifies only after its initial scene state and releases timers', () => {
    const store = { settings: {
        sceneMode: 'manual',
        sceneAutoEnabled: true,
        sceneAutoPreset: 'night',
        sceneAutoStart: 22,
        sceneAutoEnd: 7,
    } };
    let now = atHour(21);
    let timer = null;
    let cleared = 0;
    const changes = [];
    const controller = new SceneController({
        getSettings: () => store,
        onChange: (status, meta) => changes.push({ id: status.id, scheduled: status.scheduled, notify: meta.notify }),
        now: () => now,
        setIntervalFn: (callback) => { timer = callback; return 88; },
        clearIntervalFn: (value) => { assert.equal(value, 88); cleared += 1; },
    });

    controller.start();
    assert.deepEqual(changes, [{ id: 'manual', scheduled: false, notify: false }]);
    now = atHour(23);
    timer();
    assert.deepEqual(controller.snapshot().id, 'night');
    assert.deepEqual(changes.at(-1), { id: 'night', scheduled: true, notify: true });
    controller.stop();
    assert.equal(cleared, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DndController, isWithinDndHours } from '../src/renderer/dnd.js';

function atHour(hour) {
    return new Date(2026, 6, 17, hour, 0, 0, 0);
}

test('scheduled DND handles daytime and overnight half-open ranges', () => {
    assert.equal(isWithinDndHours(atHour(9), 9, 17), true);
    assert.equal(isWithinDndHours(atHour(16), 9, 17), true);
    assert.equal(isWithinDndHours(atHour(17), 9, 17), false);

    assert.equal(isWithinDndHours(atHour(22), 22, 7), true);
    assert.equal(isWithinDndHours(atHour(6), 22, 7), true);
    assert.equal(isWithinDndHours(atHour(7), 22, 7), false);
    assert.equal(isWithinDndHours(atHour(12), 22, 7), false);
    assert.equal(isWithinDndHours(atHour(12), 12, 12), false);
});

function fresh({ manual = false, auto = true, hour = 23 } = {}) {
    const store = {
        settings: {
            dndManual: manual,
            dndAutoEnabled: auto,
            dndHoursStart: 22,
            dndHoursEnd: 7,
        },
    };
    let now = atHour(hour);
    let intervalCallback = null;
    let cleared = 0;
    const effects = [];
    const changes = [];

    const controller = new DndController({
        getSettings: () => store,
        setSettings: async ({ settings }) => Object.assign(store.settings, settings),
        behaviorArbiter: { setDndHolding: (value) => effects.push(['arbiter', value]) },
        sound: { setMute: (value) => effects.push(['sound', value]) },
        reminders: { setDnd: (value) => effects.push(['reminders', value]) },
        onChange: (value) => changes.push(value),
        now: () => now,
        setIntervalFn: (callback) => {
            intervalCallback = callback;
            return 42;
        },
        clearIntervalFn: (timer) => {
            assert.equal(timer, 42);
            cleared += 1;
        },
    });

    return {
        store,
        controller,
        effects,
        changes,
        setHour: (hourValue) => { now = atHour(hourValue); },
        tick: () => intervalCallback?.(),
        cleared: () => cleared,
    };
}

test('startup applies scheduled DND without rewriting or announcing the manual flag', () => {
    const ctx = fresh({ manual: false, auto: true, hour: 23 });
    ctx.controller.start();

    assert.deepEqual(ctx.controller.snapshot(), {
        manual: false,
        auto: true,
        scheduled: true,
        scene: false,
        effective: true,
        startHour: 22,
        endHour: 7,
    });
    assert.equal(ctx.store.settings.dndManual, false);
    assert.deepEqual(ctx.changes, []);
    assert.deepEqual(ctx.effects, [
        ['arbiter', true],
        ['sound', true],
        ['reminders', true],
    ]);
});

test('schedule transitions update effective DND while preserving manual intent', () => {
    const ctx = fresh({ manual: false, auto: true, hour: 23 });
    ctx.controller.start();
    ctx.setHour(8);
    ctx.tick();

    assert.equal(ctx.controller.snapshot().scheduled, false);
    assert.equal(ctx.controller.snapshot().effective, false);
    assert.equal(ctx.store.settings.dndManual, false);
    assert.deepEqual(ctx.changes.at(-1), {
        manual: false,
        scheduled: false,
        scene: false,
        effective: false,
        source: 'schedule',
    });
});

test('manual DND remains effective when the schedule ends or auto mode is disabled', async () => {
    const ctx = fresh({ manual: true, auto: true, hour: 23 });
    ctx.controller.start();
    ctx.setHour(8);
    ctx.controller.refreshSchedule();
    assert.equal(ctx.controller.snapshot().effective, true);

    ctx.store.settings.dndAutoEnabled = false;
    ctx.controller.syncFromSettings();
    assert.equal(ctx.controller.snapshot().manual, true);
    assert.equal(ctx.controller.snapshot().scheduled, false);
    assert.equal(ctx.controller.snapshot().effective, true);

    await ctx.controller.toggle();
    assert.equal(ctx.store.settings.dndManual, false);
    assert.equal(ctx.controller.snapshot().effective, false);
});

test('stopping the controller clears the schedule timer', () => {
    const ctx = fresh();
    ctx.controller.start();
    ctx.controller.stop();
    assert.equal(ctx.cleared(), 1);
});

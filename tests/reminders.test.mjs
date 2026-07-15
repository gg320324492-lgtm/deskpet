import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ReminderEngine } from '../src/renderer/reminders.js';

function fresh() {
    const store = {
        settings: {
            waterEnabled: true,
            waterIntervalMin: 60,
            sitEnabled: false,
            eyeEnabled: false,
        },
        reminders: { custom: [], snoozes: {} },
    };

    const engine = new ReminderEngine({
        getSettings: () => store,
        setSettings: ({ reminders }) => {
            if (reminders) store.reminders = reminders;
        },
        onBubble: () => {},
        onFire: () => {},
        popover: null,
        dialogue: null,
    });

    return { store, engine };
}

test('snoozing a built-in reminder overrides its interval schedule', () => {
    const { store, engine } = fresh();
    const before = Date.now();

    engine.snooze('water');

    const after = Date.now();
    const water = engine.snapshot().builtin.find((item) => item.id === 'water');
    assert.ok(store.reminders.snoozes.water >= before + 5 * 60_000);
    assert.ok(store.reminders.snoozes.water <= after + 5 * 60_000);
    assert.equal(water.nextFire, store.reminders.snoozes.water);
    engine.stop();
});

test('disabled built-in reminders stay unscheduled', () => {
    const { engine } = fresh();
    const sit = engine.snapshot().builtin.find((item) => item.id === 'sit');
    assert.equal(sit.nextFire, Number.POSITIVE_INFINITY);
    engine.stop();
});

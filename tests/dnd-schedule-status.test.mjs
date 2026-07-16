import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatHour, getDndScheduleStatus } from '../src/room/dnd-schedule-status.js';

const at = (hour, minute = 0) => new Date(2026, 6, 17, hour, minute, 0, 0);

test('DND status distinguishes inactive schedules, manual intent and equal hour ranges', () => {
    assert.equal(getDndScheduleStatus({ dndManual: false, dndAutoEnabled: false }, at(12)).label, '定时未启用');
    assert.equal(getDndScheduleStatus({ dndManual: true, dndAutoEnabled: false }, at(12)).label, '手动勿扰中');
    assert.equal(getDndScheduleStatus({ dndManual: false, dndAutoEnabled: true, dndHoursStart: 8, dndHoursEnd: 8 }, at(12)).label, '定时未生效');
});

test('DND status describes next boundary for daytime and overnight schedules', () => {
    const before = getDndScheduleStatus({ dndAutoEnabled: true, dndHoursStart: 9, dndHoursEnd: 17 }, at(8, 30));
    assert.equal(before.label, '下一次定时开启');
    assert.equal(before.nextAt.getHours(), 9);

    const active = getDndScheduleStatus({ dndAutoEnabled: true, dndHoursStart: 22, dndHoursEnd: 7 }, at(23));
    assert.equal(active.label, '定时勿扰中');
    assert.equal(active.nextAt.getHours(), 7);
    assert.equal(active.nextAt.getDate(), 18);
    assert.equal(formatHour(7), '07:00');
});

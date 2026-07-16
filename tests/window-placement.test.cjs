'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    clampWindowBounds,
    displayTargetForId,
    isDisplayTarget,
    resolveStartupBounds,
    selectTargetDisplay,
    serializeWindowPosition,
} = require('../src/main/window-placement.cjs');

const primary = {
    id: 1,
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const secondary = {
    id: 2,
    workArea: { x: -1600, y: 40, width: 1600, height: 900 },
};
const displays = [primary, secondary];

test('cursor target selects the display containing the cursor, including negative coordinates', () => {
    assert.equal(selectTargetDisplay({
        displays,
        primaryDisplay: primary,
        cursorPoint: { x: -900, y: 400 },
        target: 'cursor',
    }).id, 2);

    assert.equal(selectTargetDisplay({
        displays,
        primaryDisplay: primary,
        cursorPoint: { x: -900, y: 400 },
        target: 'primary',
    }).id, 1);
});

test('a named display target selects its matching monitor and validates only safe ids', () => {
    assert.equal(selectTargetDisplay({
        displays,
        primaryDisplay: primary,
        cursorPoint: { x: 600, y: 400 },
        target: displayTargetForId(2),
    }).id, 2);
    assert.equal(isDisplayTarget('display:2'), true);
    assert.equal(isDisplayTarget('display:second monitor'), false);
    assert.equal(isDisplayTarget('not-a-target'), false);
});

test('first launch uses the selected display work-area origin and safe default margins', () => {
    const bounds = resolveStartupBounds({
        settings: { multiDisplayTarget: 'cursor' },
        displays,
        primaryDisplay: primary,
        cursorPoint: { x: -900, y: 400 },
        width: 320,
        height: 360,
    });

    assert.deepEqual(bounds, { x: -400, y: 160, width: 320, height: 360, displayId: '2' });
});

test('a valid saved pet position wins over the startup display preference', () => {
    const bounds = resolveStartupBounds({
        settings: {
            multiDisplayTarget: 'primary',
            petWindowX: -1200,
            petWindowY: 240,
            petDisplayId: '2',
        },
        displays,
        primaryDisplay: primary,
        cursorPoint: { x: 600, y: 400 },
        width: 320,
        height: 360,
    });

    assert.deepEqual(bounds, { x: -1200, y: 240, width: 320, height: 360, displayId: '2' });
});

test('saved coordinates are clamped inside their live display work area', () => {
    assert.deepEqual(clampWindowBounds({ x: -50, y: 900, width: 320, height: 360 }, secondary), {
        x: -320,
        y: 580,
        width: 320,
        height: 360,
    });
});

test('a missing saved display falls back to the configured live target', () => {
    const bounds = resolveStartupBounds({
        settings: {
            multiDisplayTarget: 'cursor',
            petWindowX: 9000,
            petWindowY: 9000,
            petDisplayId: '99',
        },
        displays,
        primaryDisplay: primary,
        cursorPoint: { x: -900, y: 400 },
        width: 320,
        height: 360,
    });

    assert.deepEqual(bounds, { x: -400, y: 160, width: 320, height: 360, displayId: '2' });
});

test('serialized window position is bounded and uses a stable string display id', () => {
    assert.deepEqual(serializeWindowPosition({ x: -1200.7, y: 240.4 }, secondary), {
        petWindowX: -1201,
        petWindowY: 240,
        petDisplayId: '2',
    });
});

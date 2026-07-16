import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    attachMenuKeyboardNavigation,
    clampMenuPosition,
} from '../src/renderer/menu-layout.mjs';

test('context menu stays inside the pet viewport near the lower-right edge', () => {
    assert.deepEqual(
        clampMenuPosition({
            x: 300,
            y: 340,
            menuWidth: 140,
            menuHeight: 348,
            viewportWidth: 320,
            viewportHeight: 360,
        }),
        { left: 174, top: 6 },
    );
});

test('oversized context menus pin to the safe viewport margin', () => {
    assert.deepEqual(
        clampMenuPosition({
            x: 100,
            y: 100,
            menuWidth: 400,
            menuHeight: 500,
            viewportWidth: 320,
            viewportHeight: 360,
        }),
        { left: 6, top: 6 },
    );
});

test('context menu position sanitizes invalid input', () => {
    assert.deepEqual(
        clampMenuPosition({
            x: Number.NaN,
            y: Number.POSITIVE_INFINITY,
            menuWidth: 140,
            menuHeight: 100,
            viewportWidth: 320,
            viewportHeight: 360,
        }),
        { left: 6, top: 6 },
    );
});

test('context menu keyboard navigation reaches offscreen actions', () => {
    const ownerDocument = { activeElement: null };
    let clicked = '';
    let escaped = false;
    let keydown;
    const makeItem = (id) => ({
        id,
        focus() { ownerDocument.activeElement = this; },
        scrollIntoView() {},
        click() { clicked = id; },
    });
    const items = ['first', 'middle', 'last'].map(makeItem);
    const menu = {
        ownerDocument,
        querySelectorAll: () => items,
        addEventListener: (_event, handler) => { keydown = handler; },
    };
    const press = (key) => keydown({ key, preventDefault() {} });

    attachMenuKeyboardNavigation({ menu, onEscape: () => { escaped = true; } });
    assert.equal(ownerDocument.activeElement.id, 'first');
    press('End');
    assert.equal(ownerDocument.activeElement.id, 'last');
    press('Enter');
    assert.equal(clicked, 'last');
    press('ArrowDown');
    assert.equal(ownerDocument.activeElement.id, 'first');
    press('Escape');
    assert.equal(escaped, true);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const {
    MAX_STORAGE_PATCH_BYTES,
    assertStoragePatch,
    assertPetState,
    normalizeRoomTab,
    assertBoolean,
    assertFiniteNumber,
} = require('../src/main/ipc-policy.cjs');
const { lockDownWebContents } = require('../src/main/security.js');

test('storage policy accepts known domains and fields', () => {
    const patch = { volume: 0.5, mute: true };
    assert.equal(assertStoragePatch('settings', patch), patch);
    assert.deepEqual(assertStoragePatch('todos', { items: [] }), { items: [] });
});

test('storage policy rejects unknown domains, fields and non-records', () => {
    assert.throws(() => assertStoragePatch('secrets', {}), /Unknown storage domain/);
    assert.throws(() => assertStoragePatch('settings', { admin: true }), /Unknown settings field/);
    assert.throws(() => assertStoragePatch('settings', []), /plain object/);
    assert.throws(() => assertStoragePatch('settings', { volume: 2 }), /allowed range/);
    assert.throws(() => assertStoragePatch('todos', {
        items: [{ id: 'safe', title: '任务', priority: 9 }],
    }), /unsupported value/);
    assert.throws(() => assertStoragePatch('reminders', {
        snoozes: { water: Number.POSITIVE_INFINITY },
    }), /allowed range/);
});

test('storage policy caps serialized payload size', () => {
    const oversized = { preferredName: 'x'.repeat(MAX_STORAGE_PATCH_BYTES + 1) };
    assert.throws(() => assertStoragePatch('settings', oversized), /exceeds/);
});

test('pet states and room tabs are allow-listed', () => {
    assert.equal(assertPetState('idle'), 'idle');
    assert.throws(() => assertPetState('__proto__'), /Unknown pet state/);
    assert.equal(normalizeRoomTab('settings'), 'settings');
    assert.equal(normalizeRoomTab('developer-tools'), 'stats');
});

test('primitive IPC parameters require exact safe types and ranges', () => {
    assert.equal(assertBoolean(false, 'enabled'), false);
    assert.throws(() => assertBoolean(0, 'enabled'), /boolean/);
    assert.equal(assertFiniteNumber(12, 'x', { min: 0, max: 20 }), 12);
    assert.throws(() => assertFiniteNumber(Infinity, 'x'), /finite number/);
    assert.throws(() => assertFiniteNumber(21, 'x', { min: 0, max: 20 }), /between/);
});

test('window security denies popups, webviews and external navigation', () => {
    const listeners = new Map();
    let openHandler = null;
    const win = {
        webContents: {
            setWindowOpenHandler(handler) { openHandler = handler; },
            on(name, handler) { listeners.set(name, handler); },
        },
    };
    const localPath = 'C:\\deskpet\\src\\room\\index.html';
    lockDownWebContents(win, localPath);

    assert.deepEqual(openHandler(), { action: 'deny' });

    let blocked = false;
    listeners.get('will-navigate')({ preventDefault: () => { blocked = true; } }, 'https://example.com');
    assert.equal(blocked, true);

    blocked = false;
    listeners.get('will-navigate')({ preventDefault: () => { blocked = true; } }, pathToFileURL(localPath).href);
    assert.equal(blocked, false);

    let webviewBlocked = false;
    listeners.get('will-attach-webview')({ preventDefault: () => { webviewBlocked = true; } });
    assert.equal(webviewBlocked, true);
});

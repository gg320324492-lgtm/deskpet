/**
 * tests/storage-roundtrip.test.cjs
 *
 * Smoke tests for src/main/storage.js.  Mocks Electron's `app` and
 * `powerMonitor` in the require cache so the storage engine loads cleanly
 * without an actual Electron runtime.
 *
 * Run with: node --test tests/storage-roundtrip.test.cjs
 */
'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const os       = require('node:os');
const path     = require('node:path');
const Module   = require('node:module');
const { EventEmitter } = require('node:events');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-store-'));

// Stub the `electron` module before storage.js calls require('electron').
const electronStub = {
    app: {
        getPath: (k) => TMP_DIR,
        on: () => {},
    },
    powerMonitor: { on: () => {} },
    EventEmitter,
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'electron') return 'electron-stub';
    return origResolve.call(this, req, parent, ...rest);
};
require.cache['electron-stub'] = {
    id: 'electron-stub',
    filename: 'electron-stub',
    loaded: true,
    exports: electronStub,
};

const { Storage } = require('../src/main/storage.js');

test('Storage creates defaults on first launch', async () => {
    const s = new Storage();
    await s.init();
    const settings = s.get('settings');
    assert.equal(settings.volume, 0.3);
    assert.equal(settings.autonomyLevel, 'normal');
    assert.equal(fs.existsSync(path.join(TMP_DIR, 'settings.json')), true);
});

test('set patches in-memory immediately', async () => {
    const s = new Storage();
    await s.init();
    await s.set('settings', { volume: 0.7, mute: true });
    assert.equal(s.get('settings').volume, 0.7);
    assert.equal(s.get('settings').mute, true);
});

test('corrupted JSON is backed up and replaced with defaults', async () => {
    const target = path.join(TMP_DIR, 'mood.json');
    fs.writeFileSync(target, '{ this is not JSON', 'utf8');

    const s = new Storage();
    await s.init();
    const mood = s.get('mood');
    assert.equal(mood.mood, 60);
    const quarantined = fs.readdirSync(TMP_DIR).filter((name) => /^mood\.json\.corrupt-\d+\.bak$/.test(name));
    assert.equal(quarantined.length >= 1, true);
});

test('flushAll writes pending writes immediately', async () => {
    const s = new Storage();
    await s.init();
    await s.set('mood', { mood: 88 });
    s.flushAll();
    const onDisk = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 'mood.json'), 'utf8'));
    assert.equal(onDisk.mood, 88);
});

test('list returns all 8 domains', async () => {
    const s = new Storage();
    await s.init();
    const all = s.list();
    assert.equal(Object.keys(all).length, 8);
    for (const k of ['settings','mood','todos','pomodoro','reminders','memory','achievements','stats']) {
        assert.ok(k in all, `missing ${k}`);
    }
});

test('events fire on every change', async () => {
    const s = new Storage();
    await s.init();
    const events = [];
    s.on('change', ({ domain }) => events.push(domain));
    await s.set('todos', { items: [{ id: 'a', title: 'x', priority: 1 }] });
    await s.set('memory', { name: 'iris' });
    s.flushAll();
    // At least the two above fired.
    assert.ok(events.includes('todos'));
    assert.ok(events.includes('memory'));
});

test('each changed write keeps the previous valid payload as a rolling backup', async () => {
    const s = new Storage();
    await s.init();
    await s.set('mood', { mood: 71 });
    s.flushAll();
    await s.set('mood', { mood: 72 });
    s.flushAll();

    const backup = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 'mood.json.bak'), 'utf8'));
    assert.equal(backup.mood, 71);
});

test('snapshot export and import round-trips all domains and preserves pre-import data', async () => {
    const s = new Storage();
    await s.init();
    await s.set('settings', { volume: 0.65, preferredName: '小糖' });
    await s.set('mood', { mood: 91 });
    s.flushAll();
    const snapshot = s.createSnapshot();

    await s.set('settings', { volume: 0.1 });
    s.flushAll();
    const result = s.importSnapshot(snapshot);

    assert.equal(result.imported, true);
    assert.equal(s.get('settings').volume, 0.65);
    assert.equal(s.get('settings').preferredName, '小糖');
    assert.equal(s.get('mood').mood, 91);
    assert.equal(Object.keys(snapshot.data).length, 8);
    const backup = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 'settings.json.bak'), 'utf8'));
    assert.equal(backup.volume, 0.1);
});

test('invalid snapshot is rejected before cache or disk data changes', async () => {
    const s = new Storage();
    await s.init();
    const before = s.list();
    const invalid = s.createSnapshot();
    invalid.data.mood.mood = 999;

    assert.throws(() => s.importSnapshot(invalid), /outside its allowed range/);
    assert.deepEqual(s.list(), before);
});

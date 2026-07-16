'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    DOMAINS,
    DOMAIN_DEFAULTS,
    BACKUP_FORMAT,
    sanitizeDomain,
    validateDomainPatch,
    createBackupSnapshot,
    parseBackupSnapshot,
} = require('../src/shared/schema.cjs');

function defaultsByDomain() {
    return Object.fromEntries(DOMAINS.map((domain) => [domain, structuredClone(DOMAIN_DEFAULTS[domain])]));
}

test('disk sanitization drops unknown fields and resets invalid primitive values', () => {
    const normalized = sanitizeDomain('settings', {
        version: 99,
        volume: 7,
        mute: true,
        preferredName: '小糖',
        injected: 'drop-me',
    });

    assert.equal(normalized.version, 1);
    assert.equal(normalized.volume, 0.3);
    assert.equal(normalized.mute, true);
    assert.equal(normalized.preferredName, '小糖');
    assert.equal('injected' in normalized, false);
});

test('collection sanitization keeps valid records and normalizes optional fields', () => {
    const normalized = sanitizeDomain('todos', {
        items: [
            { id: 'a', title: '保留我', priority: 2 },
            { id: 'b', title: '', priority: 1 },
            { id: 'c', title: '非法优先级', priority: 7 },
        ],
    });

    assert.equal(normalized.items.length, 1);
    assert.deepEqual(normalized.items[0], {
        id: 'a',
        title: '保留我',
        priority: 2,
        dueAt: null,
        repeat: 'none',
        completed: false,
        doneAt: null,
        createdAt: 0,
    });
});

test('deep patch validation rejects malformed nested records and unsafe keys', () => {
    assert.throws(() => validateDomainPatch('memory', { workStartHour: 24 }), /allowed range/);
    assert.throws(() => validateDomainPatch('achievements', {
        unlocked: { first_boot: { unlockedAt: 'yesterday' } },
    }), /allowed range/);
    assert.throws(() => validateDomainPatch('reminders', {
        custom: [{ id: 'r1', label: '喝水', kind: 'sometimes' }],
    }), /unsupported value/);
});

test('versioned backup parser accepts complete snapshots and rejects drift', () => {
    const snapshot = createBackupSnapshot(defaultsByDomain(), {
        appVersion: '1.0.0',
        exportedAt: '2026-07-15T08:00:00.000Z',
    });
    const parsed = parseBackupSnapshot(snapshot);
    assert.equal(parsed.format, BACKUP_FORMAT);
    assert.equal(parsed.data.settings.volume, 0.3);

    const missing = structuredClone(snapshot);
    delete missing.data.stats;
    assert.throws(() => parseBackupSnapshot(missing), /stats is required/);

    const unknown = structuredClone(snapshot);
    unknown.data.telemetry = {};
    assert.throws(() => parseBackupSnapshot(unknown), /Unknown backup.data field/);
});

test('older backups receive defaults for newly added AI settings', () => {
    const snapshot = createBackupSnapshot(defaultsByDomain(), {
        appVersion: '1.0.0',
        exportedAt: '2026-07-15T08:00:00.000Z',
    });
    delete snapshot.data.settings.aiBackend;
    delete snapshot.data.settings.aiBaseUrl;
    delete snapshot.data.settings.aiModel;

    const parsed = parseBackupSnapshot(snapshot);
    assert.equal(parsed.data.settings.aiBackend, 'local-template');
    assert.equal(parsed.data.settings.aiBaseUrl, '');
    assert.equal(parsed.data.settings.aiModel, '');
    assert.equal(parsed.data.settings.updateAutoCheck, true);
});

test('older settings receive nullable persisted pet window coordinates', () => {
    const normalized = sanitizeDomain('settings', {
        volume: 0.5,
        multiDisplayTarget: 'cursor',
    });

    assert.equal(normalized.petWindowX, null);
    assert.equal(normalized.petWindowY, null);
    assert.equal(normalized.petDisplayId, '');

    assert.doesNotThrow(() => validateDomainPatch('settings', {
        petWindowX: -1600,
        petWindowY: 240,
        petDisplayId: '246873',
    }));
    assert.throws(() => validateDomainPatch('settings', { petWindowX: 'left' }), /number or null/);
    assert.throws(() => validateDomainPatch('settings', { petDisplayId: 'x'.repeat(65) }), /up to 64/);
});

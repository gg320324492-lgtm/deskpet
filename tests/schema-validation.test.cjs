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
        note: '',
        nextStepAt: 0,
        priority: 2,
        dueAt: null,
        repeat: 'none',
        bucket: 'inbox',
        timeBlock: '',
        tomorrowPlan: '',
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
    assert.throws(() => validateDomainPatch('todos', {
        items: [{ id: 't1', title: '错误收件箱', bucket: 'someday' }],
    }), /unsupported value/);
    assert.throws(() => validateDomainPatch('todos', {
        items: [{ id: 't1', title: '错误时间块', timeBlock: 'midnight' }],
    }), /unsupported value/);
    assert.throws(() => validateDomainPatch('todos', {
        items: [{ id: 't1', title: '错误明日计划', tomorrowPlan: 'everything' }],
    }), /unsupported value/);
    assert.throws(() => validateDomainPatch('todos', {
        items: [{ id: 't1', title: '备注过长', note: 'x'.repeat(241) }],
    }), /up to 240 characters/);
    assert.throws(() => validateDomainPatch('todos', {
        items: [{ id: 't1', title: '错误下一步时间', nextStepAt: -1 }],
    }), /allowed range/);
});

test('weekly plans accept up to three concise goals and reject malformed entries', () => {
    assert.doesNotThrow(() => validateDomainPatch('rhythm', {
        weeklyPlans: {
            '2026-07-20': { goals: ['整理桌面', '完成一轮专注'], updatedAt: 1_784_534_400_000 },
        },
    }));
    assert.throws(() => validateDomainPatch('rhythm', {
        weeklyPlans: {
            '2026-07-20': { goals: ['一', '二', '三', '四'], updatedAt: 1 },
        },
    }), /at most 3 goals/);
});

test('today focus stores one dated local task selection or can be cleared', () => {
    assert.doesNotThrow(() => validateDomainPatch('rhythm', {
        todayFocus: { date: '2026-07-20', taskId: 'task-1', updatedAt: 1_784_534_400_000 },
    }));
    assert.doesNotThrow(() => validateDomainPatch('rhythm', { todayFocus: null }));
    assert.throws(() => validateDomainPatch('rhythm', {
        todayFocus: { date: 'not-a-date', taskId: '', updatedAt: -1 },
    }), /todayFocus/);
});

test('daily inbox triage stores at most three local task ids', () => {
    assert.doesNotThrow(() => validateDomainPatch('rhythm', {
        inboxTriage: {
            '2026-07-18': { taskIds: ['task-1', 'task-2'], updatedAt: 1_784_534_400_000 },
        },
    }));
    assert.throws(() => validateDomainPatch('rhythm', {
        inboxTriage: {
            '2026-07-18': { taskIds: ['one', 'two', 'three', 'four'], updatedAt: 1 },
        },
    }), /at most 3 items/);
});

test('older rhythm data receives an empty inbox triage history', () => {
    const normalized = sanitizeDomain('rhythm', {
        events: [], reflections: {}, weeklyPlans: {}, todayFocus: null,
    });
    assert.deepEqual(normalized.inboxTriage, {});
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
    assert.equal(parsed.data.settings.timeBlockRemindersEnabled, true);
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
    assert.doesNotThrow(() => validateDomainPatch('settings', { multiDisplayTarget: 'display:246873' }));
    assert.throws(() => validateDomainPatch('settings', { multiDisplayTarget: 'display:unsafe id' }), /display id/);
});

test('scene settings migrate safely and validate their supported values', () => {
    const normalized = sanitizeDomain('settings', { volume: 0.5 });
    assert.equal(normalized.sceneMode, 'manual');
    assert.equal(normalized.sceneAutoEnabled, false);
    assert.equal(normalized.sceneAutoPreset, 'focus');
    assert.equal(normalized.sceneAutoStart, 9);
    assert.equal(normalized.sceneAutoEnd, 18);

    assert.doesNotThrow(() => validateDomainPatch('settings', {
        sceneMode: 'night',
        sceneAutoEnabled: true,
        sceneAutoPreset: 'relaxed',
        sceneAutoStart: 22,
        sceneAutoEnd: 7,
    }));
    assert.throws(() => validateDomainPatch('settings', { sceneMode: 'party' }), /unsupported value/);
    assert.throws(() => validateDomainPatch('settings', { sceneAutoPreset: 'manual' }), /unsupported value/);
    assert.throws(() => validateDomainPatch('settings', { sceneAutoStart: 24 }), /allowed range/);
});

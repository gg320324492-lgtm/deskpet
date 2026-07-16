/**
 * src/shared/schema.cjs
 *
 * Pure CommonJS persistence defaults.  Electron's main-process Node
 * (which uses CJS) requires this file directly.
 *
 * If the renderer ever needs direct access (currently it accesses via
 * petAPI IPC), write a tiny `schema.mjs` shim that re-exports these.
 *
 * Domains (8):
 *   - settings, mood, todos, pomodoro, reminders, memory, achievements, stats
 */

const STORAGE_VERSION = 1;
const BACKUP_FORMAT = 'date-night-girl-backup';
const BACKUP_VERSION = 1;

const DOMAIN_DEFAULTS = Object.freeze({
    settings: Object.freeze({
        version: STORAGE_VERSION,
        volume: 0.3,
        mute: false,
        autonomyLevel: 'normal',
        allowProactiveChat: false,
        randomIdleEnabled: true,
        waterEnabled: true,           waterIntervalMin: 60,
        sitEnabled:  true,            sitIntervalMin:  45,
        eyeEnabled:  true,            eyeIntervalMin:  20,
        dndManual: false,
        dndAutoEnabled: false,
        dndHoursStart: 22,
        dndHoursEnd:   7,
        size: 1.0,
        outfit: 'default',
        autostart: false,
        multiDisplayTarget: 'primary',
        onboardingDone: false,
        preferredName: '',
        aiBackend: 'local-template',
        aiBaseUrl: '',
        aiModel: '',
        updateAutoCheck: true,
    }),

    mood: Object.freeze({
        version: STORAGE_VERSION,
        mood:     60,
        energy:   80,
        hunger:   30,
        affinity: 0,
        focus:    0,
        lastTickAt: 0,
    }),

    todos: Object.freeze({
        version: STORAGE_VERSION,
        items: [],
    }),

    pomodoro: Object.freeze({
        version: STORAGE_VERSION,
        workMin: 25,
        breakMin: 5,
        longBreakMin: 15,
        longBreakEvery: 4,
        sessionsToday: 0,
        sessionsTotal: 0,
        date: '',
    }),

    reminders: Object.freeze({
        version: STORAGE_VERSION,
        custom: [],
        snoozes: {},
    }),

    memory: Object.freeze({
        version: STORAGE_VERSION,
        name: '',
        workStartHour: 9,
        workEndHour:   18,
        favoriteFood: '',
        rememberedAt:  0,
    }),

    achievements: Object.freeze({
        version: STORAGE_VERSION,
        unlocked: {},
    }),

    stats: Object.freeze({
        version: STORAGE_VERSION,
        companionStartedAt: 0,
        companionMinutesToday: 0,
        lastSessionDate: '',
        streakDays: 0,
        streakLastDay: '',
        totalCompanionMinutes: 0,
    }),
});

const DOMAINS = Object.freeze(Object.keys(DOMAIN_DEFAULTS));

const _MIGRATIONS = {
    settings: [
        (data) => {
            if (!('multiDisplayTarget' in data)) data.multiDisplayTarget = 'primary';
            if (!('aiBackend' in data)) data.aiBackend = 'local-template';
            if (!('aiBaseUrl' in data)) data.aiBaseUrl = '';
            if (!('aiModel' in data)) data.aiModel = '';
            if (!('updateAutoCheck' in data)) data.updateAutoCheck = true;
            return data;
        },
    ],
};

function migrate(domain, data) {
    if (!isPlainRecord(data)) return {};
    const migrations = _MIGRATIONS[domain] || [];
    for (const m of migrations) m(data);
    return data;
}

function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function assertPlainRecord(value, name) {
    if (!isPlainRecord(value)) throw new TypeError(`${name} must be a plain object`);
    return value;
}

function assertSafeKey(key, name) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) {
        throw new TypeError(`${name} contains an unsafe key`);
    }
}

function assertKnownKeys(value, allowed, name) {
    for (const key of Object.keys(value)) {
        assertSafeKey(key, name);
        if (!allowed.includes(key)) throw new TypeError(`Unknown ${name} field: ${key}`);
    }
}

function assertString(value, name, maxLength, { allowEmpty = true } = {}) {
    if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.trim().length === 0)) {
        throw new TypeError(`${name} must be a string up to ${maxLength} characters`);
    }
    if (/\u0000/.test(value)) throw new TypeError(`${name} contains a null character`);
}

function assertBoolean(value, name) {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
}

function assertNumber(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new RangeError(`${name} is outside its allowed range`);
    }
}

function assertEnum(value, allowed, name) {
    if (!allowed.includes(value)) throw new TypeError(`${name} has an unsupported value`);
}

function assertDate(value, name) {
    assertString(value, name, 10);
    if (value !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
        throw new TypeError(`${name} must be an ISO date`);
    }
}

function assertOptionalDateTime(value, name) {
    if (value === null) return;
    assertString(value, name, 64, { allowEmpty: false });
    if (Number.isNaN(Date.parse(value))) throw new TypeError(`${name} must be an ISO date-time or null`);
}

function assertJsonValue(value, name, depth = 0) {
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') return assertString(value, name, 256);
    if (typeof value === 'number') return assertNumber(value, name, { min: -10_000_000, max: 10_000_000 });
    if (depth >= 3) throw new RangeError(`${name} is nested too deeply`);
    if (Array.isArray(value)) {
        if (value.length > 50) throw new RangeError(`${name} has too many items`);
        value.forEach((item, index) => assertJsonValue(item, `${name}[${index}]`, depth + 1));
        return;
    }
    assertPlainRecord(value, name);
    if (Object.keys(value).length > 32) throw new RangeError(`${name} has too many fields`);
    for (const [key, item] of Object.entries(value)) {
        assertSafeKey(key, name);
        assertJsonValue(item, `${name}.${key}`, depth + 1);
    }
}

function validateTodoItem(item, index = 0) {
    const name = `todos.items[${index}]`;
    assertPlainRecord(item, name);
    assertKnownKeys(item, ['id', 'title', 'priority', 'dueAt', 'repeat', 'completed', 'doneAt', 'createdAt'], name);
    assertString(item.id, `${name}.id`, 80, { allowEmpty: false });
    assertString(item.title, `${name}.title`, 120, { allowEmpty: false });
    if (Object.hasOwn(item, 'priority')) assertEnum(item.priority, [1, 2, 3], `${name}.priority`);
    if (Object.hasOwn(item, 'dueAt')) assertOptionalDateTime(item.dueAt, `${name}.dueAt`);
    if (Object.hasOwn(item, 'repeat')) assertEnum(item.repeat, ['none', 'daily', 'weekly'], `${name}.repeat`);
    if (Object.hasOwn(item, 'completed')) assertBoolean(item.completed, `${name}.completed`);
    if (Object.hasOwn(item, 'doneAt') && item.doneAt !== null) assertNumber(item.doneAt, `${name}.doneAt`, { integer: true });
    if (Object.hasOwn(item, 'createdAt')) assertNumber(item.createdAt, `${name}.createdAt`, { integer: true });
}

function normalizeTodoItem(item, index) {
    validateTodoItem(item, index);
    return {
        id: item.id,
        title: item.title,
        priority: item.priority ?? 1,
        dueAt: item.dueAt ?? null,
        repeat: item.repeat ?? 'none',
        completed: item.completed ?? false,
        doneAt: item.doneAt ?? null,
        createdAt: item.createdAt ?? 0,
    };
}

function validateReminder(reminder, index = 0) {
    const name = `reminders.custom[${index}]`;
    assertPlainRecord(reminder, name);
    assertKnownKeys(reminder, ['id', 'label', 'kind', 'intervalMin', 'fireAt', 'snoozedUntil', 'enabled'], name);
    assertString(reminder.id, `${name}.id`, 80, { allowEmpty: false });
    assertString(reminder.label, `${name}.label`, 120, { allowEmpty: false });
    if (Object.hasOwn(reminder, 'kind')) assertEnum(reminder.kind, ['interval', 'time'], `${name}.kind`);
    if (Object.hasOwn(reminder, 'intervalMin')) assertNumber(reminder.intervalMin, `${name}.intervalMin`, { min: 1, max: 10_080 });
    if (Object.hasOwn(reminder, 'fireAt') && reminder.fireAt !== null) assertNumber(reminder.fireAt, `${name}.fireAt`, { integer: true });
    if (Object.hasOwn(reminder, 'snoozedUntil') && reminder.snoozedUntil !== null) assertNumber(reminder.snoozedUntil, `${name}.snoozedUntil`, { integer: true });
    if (Object.hasOwn(reminder, 'enabled')) assertBoolean(reminder.enabled, `${name}.enabled`);
}

function normalizeReminder(reminder, index) {
    validateReminder(reminder, index);
    const out = {
        id: reminder.id,
        label: reminder.label,
        kind: reminder.kind ?? 'interval',
        intervalMin: reminder.intervalMin ?? 60,
        fireAt: reminder.fireAt ?? null,
        enabled: reminder.enabled ?? true,
    };
    if (Object.hasOwn(reminder, 'snoozedUntil')) out.snoozedUntil = reminder.snoozedUntil;
    return out;
}

function validateTimestampMap(value, name, maxEntries = 200) {
    assertPlainRecord(value, name);
    if (Object.keys(value).length > maxEntries) throw new RangeError(`${name} has too many entries`);
    for (const [key, timestamp] of Object.entries(value)) {
        assertSafeKey(key, name);
        assertNumber(timestamp, `${name}.${key}`, { integer: true });
    }
}

function validateAchievements(value) {
    assertPlainRecord(value, 'achievements.unlocked');
    if (Object.keys(value).length > 200) throw new RangeError('achievements.unlocked has too many entries');
    for (const [key, record] of Object.entries(value)) {
        assertSafeKey(key, 'achievements.unlocked');
        assertPlainRecord(record, `achievements.unlocked.${key}`);
        if (!Object.hasOwn(record, 'unlockedAt')) throw new TypeError(`achievements.unlocked.${key}.unlockedAt is required`);
        assertNumber(record.unlockedAt, `achievements.unlocked.${key}.unlockedAt`, { integer: true });
        if (Object.hasOwn(record, 'label')) assertString(record.label, `achievements.unlocked.${key}.label`, 120);
        for (const [metaKey, metaValue] of Object.entries(record)) {
            assertSafeKey(metaKey, `achievements.unlocked.${key}`);
            if (!['unlockedAt', 'label'].includes(metaKey)) {
                assertJsonValue(metaValue, `achievements.unlocked.${key}.${metaKey}`, 1);
            }
        }
    }
}

const FIELD_VALIDATORS = {
    settings: {
        volume: (v) => assertNumber(v, 'settings.volume', { min: 0, max: 1 }),
        mute: (v) => assertBoolean(v, 'settings.mute'),
        autonomyLevel: (v) => assertEnum(v, ['low', 'normal', 'high'], 'settings.autonomyLevel'),
        allowProactiveChat: (v) => assertBoolean(v, 'settings.allowProactiveChat'),
        randomIdleEnabled: (v) => assertBoolean(v, 'settings.randomIdleEnabled'),
        waterEnabled: (v) => assertBoolean(v, 'settings.waterEnabled'),
        waterIntervalMin: (v) => assertNumber(v, 'settings.waterIntervalMin', { min: 1, max: 1_440 }),
        sitEnabled: (v) => assertBoolean(v, 'settings.sitEnabled'),
        sitIntervalMin: (v) => assertNumber(v, 'settings.sitIntervalMin', { min: 1, max: 1_440 }),
        eyeEnabled: (v) => assertBoolean(v, 'settings.eyeEnabled'),
        eyeIntervalMin: (v) => assertNumber(v, 'settings.eyeIntervalMin', { min: 1, max: 1_440 }),
        dndManual: (v) => assertBoolean(v, 'settings.dndManual'),
        dndAutoEnabled: (v) => assertBoolean(v, 'settings.dndAutoEnabled'),
        dndHoursStart: (v) => assertNumber(v, 'settings.dndHoursStart', { min: 0, max: 23, integer: true }),
        dndHoursEnd: (v) => assertNumber(v, 'settings.dndHoursEnd', { min: 0, max: 23, integer: true }),
        size: (v) => assertNumber(v, 'settings.size', { min: 0.5, max: 2 }),
        outfit: (v) => assertString(v, 'settings.outfit', 64, { allowEmpty: false }),
        autostart: (v) => assertBoolean(v, 'settings.autostart'),
        multiDisplayTarget: (v) => assertEnum(v, ['primary', 'cursor'], 'settings.multiDisplayTarget'),
        onboardingDone: (v) => assertBoolean(v, 'settings.onboardingDone'),
        preferredName: (v) => assertString(v, 'settings.preferredName', 80),
        aiBackend: (v) => assertEnum(v, ['local-template', 'openai-compatible'], 'settings.aiBackend'),
        aiBaseUrl: (v) => assertString(v, 'settings.aiBaseUrl', 2_048),
        aiModel: (v) => assertString(v, 'settings.aiModel', 120),
        updateAutoCheck: (v) => assertBoolean(v, 'settings.updateAutoCheck'),
    },
    mood: {
        mood: (v) => assertNumber(v, 'mood.mood', { min: 0, max: 100 }),
        energy: (v) => assertNumber(v, 'mood.energy', { min: 0, max: 100 }),
        hunger: (v) => assertNumber(v, 'mood.hunger', { min: 0, max: 100 }),
        affinity: (v) => assertNumber(v, 'mood.affinity', { min: 0, max: 1_000_000_000 }),
        focus: (v) => assertNumber(v, 'mood.focus', { min: 0, max: 100 }),
        lastTickAt: (v) => assertNumber(v, 'mood.lastTickAt', { integer: true }),
    },
    todos: {
        items: (v) => {
            if (!Array.isArray(v) || v.length > 500) throw new RangeError('todos.items must contain at most 500 items');
            v.forEach(validateTodoItem);
        },
    },
    pomodoro: {
        workMin: (v) => assertNumber(v, 'pomodoro.workMin', { min: 1, max: 240 }),
        breakMin: (v) => assertNumber(v, 'pomodoro.breakMin', { min: 1, max: 240 }),
        longBreakMin: (v) => assertNumber(v, 'pomodoro.longBreakMin', { min: 1, max: 240 }),
        longBreakEvery: (v) => assertNumber(v, 'pomodoro.longBreakEvery', { min: 1, max: 20, integer: true }),
        sessionsToday: (v) => assertNumber(v, 'pomodoro.sessionsToday', { integer: true }),
        sessionsTotal: (v) => assertNumber(v, 'pomodoro.sessionsTotal', { integer: true }),
        date: (v) => assertDate(v, 'pomodoro.date'),
    },
    reminders: {
        custom: (v) => {
            if (!Array.isArray(v) || v.length > 100) throw new RangeError('reminders.custom must contain at most 100 items');
            v.forEach(validateReminder);
        },
        snoozes: (v) => validateTimestampMap(v, 'reminders.snoozes'),
    },
    memory: {
        name: (v) => assertString(v, 'memory.name', 80),
        workStartHour: (v) => assertNumber(v, 'memory.workStartHour', { min: 0, max: 23, integer: true }),
        workEndHour: (v) => assertNumber(v, 'memory.workEndHour', { min: 0, max: 23, integer: true }),
        favoriteFood: (v) => assertString(v, 'memory.favoriteFood', 120),
        rememberedAt: (v) => assertNumber(v, 'memory.rememberedAt', { integer: true }),
    },
    achievements: {
        unlocked: validateAchievements,
    },
    stats: {
        companionStartedAt: (v) => assertNumber(v, 'stats.companionStartedAt', { integer: true }),
        companionMinutesToday: (v) => assertNumber(v, 'stats.companionMinutesToday'),
        lastSessionDate: (v) => assertDate(v, 'stats.lastSessionDate'),
        streakDays: (v) => assertNumber(v, 'stats.streakDays', { integer: true }),
        streakLastDay: (v) => assertDate(v, 'stats.streakLastDay'),
        totalCompanionMinutes: (v) => assertNumber(v, 'stats.totalCompanionMinutes'),
    },
};

function validateDomainPatch(domain, patch) {
    if (!DOMAINS.includes(domain)) throw new TypeError(`Unknown storage domain: ${String(domain)}`);
    assertPlainRecord(patch, `${domain} patch`);
    const allowed = Object.keys(DOMAIN_DEFAULTS[domain]);
    assertKnownKeys(patch, allowed, domain);
    for (const [key, value] of Object.entries(patch)) {
        if (key === 'version') {
            assertNumber(value, `${domain}.version`, { min: 1, max: STORAGE_VERSION, integer: true });
        } else {
            FIELD_VALIDATORS[domain][key](value);
        }
    }
    return patch;
}

function validateDomainData(domain, data) {
    validateDomainPatch(domain, data);
    for (const key of Object.keys(DOMAIN_DEFAULTS[domain])) {
        if (!Object.hasOwn(data, key)) throw new TypeError(`${domain}.${key} is required`);
    }
    return data;
}

function sanitizeCollection(items, limit, normalize) {
    if (!Array.isArray(items)) return [];
    const out = [];
    for (let index = 0; index < items.length && out.length < limit; index += 1) {
        try { out.push(normalize(items[index], index)); } catch (_) {}
    }
    return out;
}

function sanitizeMap(value, validator) {
    if (!isPlainRecord(value)) return {};
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
        try {
            validator({ [key]: entry });
            out[key] = structuredClone(entry);
        } catch (_) {}
    }
    return out;
}

function sanitizeDomain(domain, data) {
    if (!DOMAINS.includes(domain)) throw new TypeError(`Unknown storage domain: ${String(domain)}`);
    const defaults = DOMAIN_DEFAULTS[domain];
    const out = structuredClone(defaults);
    if (!isPlainRecord(data)) return out;

    for (const key of Object.keys(defaults)) {
        if (key === 'version' || !Object.hasOwn(data, key)) continue;
        try {
            validateDomainPatch(domain, { [key]: data[key] });
            out[key] = structuredClone(data[key]);
        } catch (_) {
            if (domain === 'todos' && key === 'items') {
                out.items = sanitizeCollection(data.items, 500, normalizeTodoItem);
            } else if (domain === 'reminders' && key === 'custom') {
                out.custom = sanitizeCollection(data.custom, 100, normalizeReminder);
            } else if (domain === 'reminders' && key === 'snoozes') {
                out.snoozes = sanitizeMap(data.snoozes, (value) => validateTimestampMap(value, 'reminders.snoozes'));
            } else if (domain === 'achievements' && key === 'unlocked') {
                out.unlocked = sanitizeMap(data.unlocked, validateAchievements);
            }
        }
    }
    out.version = STORAGE_VERSION;
    return out;
}

function withDefaults(domain, data) {
    return sanitizeDomain(domain, data);
}

function createBackupSnapshot(data, { appVersion = 'unknown', exportedAt = new Date().toISOString() } = {}) {
    assertString(appVersion, 'backup.appVersion', 64, { allowEmpty: false });
    assertString(exportedAt, 'backup.exportedAt', 64, { allowEmpty: false });
    if (Number.isNaN(Date.parse(exportedAt))) throw new TypeError('backup.exportedAt must be an ISO date-time');
    assertPlainRecord(data, 'backup.data');
    const normalized = {};
    for (const domain of DOMAINS) normalized[domain] = sanitizeDomain(domain, data[domain]);
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        appVersion,
        exportedAt,
        data: normalized,
    };
}

function parseBackupSnapshot(snapshot) {
    assertPlainRecord(snapshot, 'backup');
    assertKnownKeys(snapshot, ['format', 'version', 'appVersion', 'exportedAt', 'data'], 'backup');
    if (snapshot.format !== BACKUP_FORMAT || snapshot.version !== BACKUP_VERSION) {
        throw new TypeError('Unsupported backup format or version');
    }
    assertString(snapshot.appVersion, 'backup.appVersion', 64, { allowEmpty: false });
    assertString(snapshot.exportedAt, 'backup.exportedAt', 64, { allowEmpty: false });
    if (Number.isNaN(Date.parse(snapshot.exportedAt))) throw new TypeError('backup.exportedAt must be an ISO date-time');
    assertPlainRecord(snapshot.data, 'backup.data');
    assertKnownKeys(snapshot.data, DOMAINS, 'backup.data');

    const data = {};
    for (const domain of DOMAINS) {
        if (!Object.hasOwn(snapshot.data, domain)) throw new TypeError(`backup.data.${domain} is required`);
        // Backups remain forward-compatible when a later app version adds
        // optional fields with defaults. Domains themselves are required, but
        // missing fields are migrated by sanitizeDomain().
        validateDomainPatch(domain, snapshot.data[domain]);
        data[domain] = sanitizeDomain(domain, snapshot.data[domain]);
    }
    return { ...snapshot, data };
}

module.exports = {
    STORAGE_VERSION,
    BACKUP_FORMAT,
    BACKUP_VERSION,
    DOMAIN_DEFAULTS,
    DOMAINS,
    migrate,
    withDefaults,
    sanitizeDomain,
    validateDomainPatch,
    validateDomainData,
    createBackupSnapshot,
    parseBackupSnapshot,
};

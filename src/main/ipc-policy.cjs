'use strict';

const { DOMAIN_DEFAULTS, DOMAINS, validateDomainPatch } = require('../shared/schema.cjs');

const MAX_STORAGE_PATCH_BYTES = 256 * 1024;

const PET_STATES = Object.freeze([
    'idle', 'walk', 'sit', 'eat', 'think', 'cheer', 'surprise', 'sleep',
    'yawn', 'love', 'work', 'peek', 'wave', 'drink', 'run', 'land',
    'angry', 'stretch',
]);

const ROOM_TABS = Object.freeze([
    'stats', 'achievements', 'outfits', 'feed', 'settings',
]);

function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function assertStoragePatch(domain, patch) {
    if (!DOMAINS.includes(domain)) {
        throw new TypeError(`Unknown storage domain: ${String(domain)}`);
    }
    if (!isPlainRecord(patch)) {
        throw new TypeError('Storage patch must be a plain object');
    }

    const allowedKeys = DOMAIN_DEFAULTS[domain];
    for (const key of Object.keys(patch)) {
        if (!Object.hasOwn(allowedKeys, key)) {
            throw new TypeError(`Unknown ${domain} field: ${key}`);
        }
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            throw new TypeError(`Unsafe storage field: ${key}`);
        }
    }

    let serialized;
    try {
        serialized = JSON.stringify(patch);
    } catch {
        throw new TypeError('Storage patch must be JSON serializable');
    }
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_PATCH_BYTES) {
        throw new RangeError(`Storage patch exceeds ${MAX_STORAGE_PATCH_BYTES} bytes`);
    }
    validateDomainPatch(domain, patch);
    return patch;
}

function assertPetState(state) {
    if (!PET_STATES.includes(state)) {
        throw new TypeError(`Unknown pet state: ${String(state)}`);
    }
    return state;
}

function normalizeRoomTab(tab) {
    return ROOM_TABS.includes(tab) ? tab : 'stats';
}

function assertBoolean(value, name = 'value') {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
    return value;
}

function assertFiniteNumber(value, name = 'value', { min = -10_000_000, max = 10_000_000 } = {}) {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`${name} must be a finite number between ${min} and ${max}`);
    }
    return value;
}

module.exports = {
    MAX_STORAGE_PATCH_BYTES,
    PET_STATES,
    ROOM_TABS,
    assertStoragePatch,
    assertPetState,
    normalizeRoomTab,
    assertBoolean,
    assertFiniteNumber,
};

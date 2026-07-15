'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CredentialVault } = require('../src/main/credential-vault.cjs');

function makeSafeStorage(available = true) {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
        decryptString: (value) => {
            const decoded = value.toString('utf8');
            if (!decoded.startsWith('encrypted:')) throw new Error('bad ciphertext');
            return decoded.slice('encrypted:'.length);
        },
    };
}

function freshVault(available = true) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-vault-'));
    const filePath = path.join(dir, 'credentials.v1.json');
    const vault = new CredentialVault({ safeStorageImpl: makeSafeStorage(available), getFilePath: () => filePath });
    return { dir, filePath, vault };
}

test('credential vault persists ciphertext and never writes the plain API key', () => {
    const { dir, filePath, vault } = freshVault();
    try {
        vault.setApiKey('sk-super-secret');
        const raw = fs.readFileSync(filePath, 'utf8');
        assert.equal(raw.includes('sk-super-secret'), false);
        assert.equal(vault.getApiKey(), 'sk-super-secret');
        assert.deepEqual(vault.status(), { encryptionAvailable: true, hasApiKey: true, unreadable: false });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('credential vault refuses plaintext fallback when system encryption is unavailable', () => {
    const { dir, filePath, vault } = freshVault(false);
    try {
        assert.throws(() => vault.setApiKey('sk-secret'), /安全存储/);
        assert.equal(fs.existsSync(filePath), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('credential vault reports corrupted encrypted records without exposing content', () => {
    const { dir, filePath, vault } = freshVault();
    try {
        fs.writeFileSync(filePath, '{"format":"wrong","apiKey":"abc"}', 'utf8');
        assert.deepEqual(vault.status(), { encryptionAvailable: true, hasApiKey: false, unreadable: true });
        assert.throws(() => vault.getApiKey(), /格式无效/);
        vault.clearApiKey();
        assert.equal(fs.existsSync(filePath), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

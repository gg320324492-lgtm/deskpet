'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VAULT_FORMAT = 'date-night-girl-credentials';
const VAULT_VERSION = 1;
const MAX_CIPHERTEXT_CHARS = 32 * 1024;

class CredentialVaultError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'CredentialVaultError';
        this.code = code;
    }
}

class CredentialVault {
    constructor({ safeStorageImpl, getFilePath, fsImpl = fs } = {}) {
        if (!safeStorageImpl || !getFilePath) {
            const { app, safeStorage } = require('electron');
            safeStorageImpl ||= safeStorage;
            getFilePath ||= () => path.join(app.getPath('userData'), 'credentials.v1.json');
        }
        this._safeStorage = safeStorageImpl;
        this._getFilePath = getFilePath;
        this._fs = fsImpl;
    }

    encryptionAvailable() {
        try { return this._safeStorage.isEncryptionAvailable() === true; } catch (_) { return false; }
    }

    status() {
        const encryptionAvailable = this.encryptionAvailable();
        if (!this._fs.existsSync(this._getFilePath())) {
            return { encryptionAvailable, hasApiKey: false, unreadable: false };
        }
        try {
            const key = this.getApiKey();
            return { encryptionAvailable, hasApiKey: key.length > 0, unreadable: false };
        } catch (_) {
            return { encryptionAvailable, hasApiKey: false, unreadable: true };
        }
    }

    setApiKey(apiKey) {
        if (typeof apiKey !== 'string' || !apiKey || apiKey.length > 512 || /\s/.test(apiKey)) {
            throw new CredentialVaultError('CREDENTIAL_INVALID', 'API 密钥格式无效');
        }
        if (!this.encryptionAvailable()) {
            throw new CredentialVaultError('ENCRYPTION_UNAVAILABLE', '系统安全存储当前不可用');
        }

        let encrypted;
        try { encrypted = this._safeStorage.encryptString(apiKey); } catch (_) {
            throw new CredentialVaultError('ENCRYPTION_FAILED', 'API 密钥加密失败');
        }
        if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
            throw new CredentialVaultError('ENCRYPTION_FAILED', 'API 密钥加密失败');
        }

        const filePath = this._getFilePath();
        const tempPath = `${filePath}.tmp`;
        const payload = {
            format: VAULT_FORMAT,
            version: VAULT_VERSION,
            apiKey: encrypted.toString('base64'),
        };
        try {
            this._fs.mkdirSync(path.dirname(filePath), { recursive: true });
            this._fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
            this._fs.renameSync(tempPath, filePath);
        } catch (_) {
            try { if (this._fs.existsSync(tempPath)) this._fs.unlinkSync(tempPath); } catch (_) {}
            throw new CredentialVaultError('CREDENTIAL_WRITE_FAILED', 'API 密钥保存失败');
        }
    }

    getApiKey() {
        const filePath = this._getFilePath();
        if (!this._fs.existsSync(filePath)) return '';
        if (!this.encryptionAvailable()) {
            throw new CredentialVaultError('ENCRYPTION_UNAVAILABLE', '系统安全存储当前不可用');
        }

        let record;
        try { record = JSON.parse(this._fs.readFileSync(filePath, 'utf8')); } catch (_) {
            throw new CredentialVaultError('CREDENTIAL_UNREADABLE', '已保存的 API 密钥无法读取');
        }
        if (!record || record.format !== VAULT_FORMAT || record.version !== VAULT_VERSION
            || typeof record.apiKey !== 'string' || record.apiKey.length === 0
            || record.apiKey.length > MAX_CIPHERTEXT_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(record.apiKey)) {
            throw new CredentialVaultError('CREDENTIAL_UNREADABLE', '已保存的 API 密钥格式无效');
        }

        try {
            const decrypted = this._safeStorage.decryptString(Buffer.from(record.apiKey, 'base64'));
            if (typeof decrypted !== 'string' || !decrypted) throw new Error('empty credential');
            return decrypted;
        } catch (_) {
            throw new CredentialVaultError('CREDENTIAL_UNREADABLE', '已保存的 API 密钥无法解密');
        }
    }

    clearApiKey() {
        const filePath = this._getFilePath();
        try {
            if (this._fs.existsSync(filePath)) this._fs.unlinkSync(filePath);
            const tempPath = `${filePath}.tmp`;
            if (this._fs.existsSync(tempPath)) this._fs.unlinkSync(tempPath);
        } catch (_) {
            throw new CredentialVaultError('CREDENTIAL_CLEAR_FAILED', 'API 密钥清除失败');
        }
    }
}

module.exports = {
    VAULT_FORMAT,
    VAULT_VERSION,
    CredentialVault,
    CredentialVaultError,
};

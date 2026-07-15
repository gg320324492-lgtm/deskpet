'use strict';

const {
    MAX_REPLY_CHARS,
    MAX_RESPONSE_BYTES,
    AI_REQUEST_TIMEOUT_MS,
    AI_TEST_TIMEOUT_MS,
    isLoopbackHostname,
    normalizeAiConfiguration,
    normalizeBaseUrl,
    normalizeModel,
    assertPrompt,
    buildAiEndpoint,
    buildChatMessages,
} = require('./ai-policy.cjs');
const { CredentialVaultError } = require('./credential-vault.cjs');

class AiServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AiServiceError';
        this.code = code;
    }
}

function publicAiError(error) {
    if (error instanceof AiServiceError || error instanceof CredentialVaultError) {
        return { code: error.code, message: error.message };
    }
    return { code: 'AI_INTERNAL', message: 'AI 服务暂时不可用' };
}

async function readLimitedText(response, maxBytes = MAX_RESPONSE_BYTES) {
    const contentLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new AiServiceError('AI_RESPONSE_TOO_LARGE', 'AI 服务返回的数据过大');
    }
    if (!response.body?.getReader) {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            throw new AiServiceError('AI_RESPONSE_TOO_LARGE', 'AI 服务返回的数据过大');
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            total += chunk.length;
            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                throw new AiServiceError('AI_RESPONSE_TOO_LARGE', 'AI 服务返回的数据过大');
            }
            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock?.();
    }
    return Buffer.concat(chunks).toString('utf8');
}

class AiService {
    constructor({ storage, vault, fetchImpl = globalThis.fetch } = {}) {
        if (!storage || !vault || typeof fetchImpl !== 'function') {
            throw new TypeError('AiService requires storage, vault and fetch');
        }
        this._storage = storage;
        this._vault = vault;
        this._fetch = fetchImpl;
        this._history = [];
    }

    status() {
        const settings = this._storage.get('settings');
        const vault = this._vault.status();
        let baseUrl = '';
        let model = '';
        let loopback = false;
        let configValid = true;
        try {
            if (settings.aiBaseUrl) {
                baseUrl = normalizeBaseUrl(settings.aiBaseUrl);
                loopback = isLoopbackHostname(new URL(baseUrl).hostname);
            }
            if (settings.aiModel) model = normalizeModel(settings.aiModel);
        } catch (_) {
            configValid = false;
        }
        const remoteReady = configValid
            && !!baseUrl
            && !!model
            && (loopback || vault.hasApiKey);
        return {
            backend: settings.aiBackend === 'openai-compatible' ? 'openai-compatible' : 'local-template',
            baseUrl: settings.aiBaseUrl || '',
            model: settings.aiModel || '',
            configured: remoteReady,
            hasApiKey: vault.hasApiKey,
            encryptionAvailable: vault.encryptionAvailable,
            credentialUnreadable: vault.unreadable,
            loopback,
        };
    }

    async configure(input) {
        const config = normalizeAiConfiguration(input);
        if (config.clearKey) this._vault.clearApiKey();
        if (config.apiKey) this._vault.setApiKey(config.apiKey);

        const loopback = config.baseUrl
            ? isLoopbackHostname(new URL(config.baseUrl).hostname)
            : false;
        const vault = this._vault.status();
        if (config.backend === 'openai-compatible' && !loopback && !vault.hasApiKey) {
            if (!vault.encryptionAvailable) {
                throw new AiServiceError('ENCRYPTION_UNAVAILABLE', '系统安全存储不可用，无法保存远程服务密钥');
            }
            throw new AiServiceError('AI_KEY_REQUIRED', '远程 HTTPS 服务需要 API 密钥');
        }

        await this._storage.set('settings', {
            aiBackend: config.backend,
            aiBaseUrl: config.baseUrl,
            aiModel: config.model,
        });
        if (config.backend === 'local-template') this.reset();
        return this.status();
    }

    reset() {
        this._history.length = 0;
        return { reset: true };
    }

    async testConnection() {
        const context = this._remoteContext();
        const response = await this._request(buildAiEndpoint(context.baseUrl, 'models'), {
            method: 'GET',
            headers: this._headers(context.apiKey),
        }, AI_TEST_TIMEOUT_MS);
        if (!response.ok) throw this._httpError(response.status);
        await readLimitedText(response, 256 * 1024);
        return { connected: true, status: response.status };
    }

    async chat(prompt) {
        const safePrompt = assertPrompt(prompt);
        const context = this._remoteContext({ requireActive: true });
        const startedAt = Date.now();
        const body = {
            model: context.model,
            messages: buildChatMessages(this._history, safePrompt),
            temperature: 0.7,
            max_tokens: 220,
        };
        const response = await this._request(buildAiEndpoint(context.baseUrl, 'chat/completions'), {
            method: 'POST',
            headers: this._headers(context.apiKey),
            body: JSON.stringify(body),
        }, AI_REQUEST_TIMEOUT_MS);
        if (!response.ok) throw this._httpError(response.status);

        const text = await readLimitedText(response);
        let data;
        try { data = JSON.parse(text); } catch (_) {
            throw new AiServiceError('AI_RESPONSE_INVALID', 'AI 服务返回了无法解析的数据');
        }
        const rawReply = data?.choices?.[0]?.message?.content;
        if (typeof rawReply !== 'string' || !rawReply.trim()) {
            throw new AiServiceError('AI_RESPONSE_INVALID', 'AI 服务没有返回有效回复');
        }
        const reply = rawReply.trim().slice(0, MAX_REPLY_CHARS);
        this._history.push({ role: 'user', content: safePrompt });
        this._history.push({ role: 'assistant', content: reply });
        if (this._history.length > 12) this._history.splice(0, this._history.length - 12);
        const tokens = Number.isFinite(data?.usage?.total_tokens) ? data.usage.total_tokens : undefined;
        return {
            reply,
            tokens,
            latencyMs: Date.now() - startedAt,
            backend: 'openai-compatible',
        };
    }

    _remoteContext({ requireActive = false } = {}) {
        const settings = this._storage.get('settings');
        if (requireActive && settings.aiBackend !== 'openai-compatible') {
            throw new AiServiceError('AI_NOT_ENABLED', '远程 AI 尚未启用');
        }
        let baseUrl;
        let model;
        try {
            baseUrl = normalizeBaseUrl(settings.aiBaseUrl || '');
            model = normalizeModel(settings.aiModel || '');
        } catch (_) {
            throw new AiServiceError('AI_NOT_CONFIGURED', '远程 AI 配置不完整');
        }
        const loopback = isLoopbackHostname(new URL(baseUrl).hostname);
        let apiKey = '';
        if (!loopback || this._vault.status().hasApiKey) apiKey = this._vault.getApiKey();
        if (!loopback && !apiKey) throw new AiServiceError('AI_KEY_REQUIRED', '远程 HTTPS 服务需要 API 密钥');
        return { baseUrl, model, apiKey };
    }

    _headers(apiKey) {
        const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        return headers;
    }

    async _request(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await this._fetch(url, {
                ...options,
                signal: controller.signal,
                redirect: 'error',
            });
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new AiServiceError('AI_TIMEOUT', 'AI 服务响应超时');
            }
            throw new AiServiceError('AI_NETWORK', '无法连接到 AI 服务');
        } finally {
            clearTimeout(timer);
        }
    }

    _httpError(status) {
        if (status === 401 || status === 403) return new AiServiceError('AI_AUTH', 'AI 服务身份验证失败');
        if (status === 429) return new AiServiceError('AI_RATE_LIMIT', 'AI 服务请求过于频繁');
        if (status >= 500) return new AiServiceError('AI_UPSTREAM', 'AI 服务暂时不可用');
        return new AiServiceError('AI_HTTP', 'AI 服务拒绝了请求');
    }
}

module.exports = {
    AiService,
    AiServiceError,
    publicAiError,
    readLimitedText,
};

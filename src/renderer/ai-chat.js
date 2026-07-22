/**
 * src/renderer/ai-chat.js
 *
 * AIBackend interface + registered backends.
 *
 *   interface AIBackend {
 *     id:           string             // 'local-template' | 'openai-compatible'
 *     label:        string             // human-readable
 *     available():  boolean            // quick predicate
 *     async chat(prompt, ctx): { reply, tokens?, latencyMs? }
 *   }
 *
 * Currently shipped:
 *   - LocalTemplateBackend   : always available, uses Dialogue library + mood/affinity
 *   - OpenAICompatibleBackend: delegates to the main-process AI proxy. The
 *                              renderer never receives credentials and keeps
 *                              `connect-src 'none'` under its CSP.
 *
 * AiChat orchestrator:
 *   - Holds the active backend id
 *   - Tracks conversation context (kept short, never persisted, opt-in only)
 *   - Falls back to local-template on failure or opt-out
 */
import { S } from './strings.js';

// =============================================================================
// Local template backend — deterministic, fully offline, no privacy risk
// =============================================================================
export class LocalTemplateBackend {
    constructor({ dialogue, getMood, getMemory, getTime }) {
        this.id = 'local-template';
        this.label = '本地对话库';
        this._dialogue = dialogue;
        this._getMood = getMood;
        this._getMemory = getMemory;
        this._getTime = getTime || (() => new Date());
    }
    available() { return true; }

    async chat(prompt, ctx = {}) {
        const t0 = Date.now();
        const stripped = String(prompt || '').trim();
        const mood = this._getMood?.()?.mood ?? 50;
        const memory = this._getMemory?.() || {};
        const lower = stripped.toLowerCase();

        // Pattern-matched responses for common questions
        let reply;
        if (!stripped) {
            reply = '你可以问我今天怎么样、想做什么，或者就打个招呼。';
        } else if (/你好|hello|hi|嗨/.test(lower)) {
            reply = `你好呀，我是${S.NICKNAME}。${this._dialogue.pick({ state: 'idle', mood })}`;
        } else if (/喜欢|爱|favorite/.test(lower)) {
            const fav = memory.favoriteFood ? `你喜欢 ${memory.favoriteFood}，我记住了。` : '你还没告诉我呢。';
            reply = '我喜欢你陪着我。' + fav;
        } else if (/吃|饿|food|drink|柠檬/.test(lower)) {
            reply = this._dialogue.pick({ state: 'eat', mood }) || '要一起吃点吗？';
        } else if (/累|tired|休息/.test(lower)) {
            reply = mood < 30 ? '坐下来歇会儿吧。' : '要不要先喝口水？';
        } else if (/做什么|干什么|接下来|next|how|should/.test(lower)) {
            const hour = this._getTime().getHours();
            if (hour >= 5 && hour < 9)  reply = '早上推荐先打开今天的待办，过一遍再开始。';
            else if (hour >= 9 && hour < 12) reply = '专注一个番茄钟试试。';
            else if (hour >= 12 && hour < 14) reply = '该吃饭啦。';
            else if (hour >= 14 && hour < 18) reply = '慢慢做，别忘了眨眼。';
            else if (hour >= 18 && hour < 22) reply = '晚上好，要不要来杯柠檬饮料？';
            else reply = '该睡觉啦，明天再做也来得及。';
        } else if (/bye|再见|good night|晚安/.test(lower)) {
            reply = '晚安，做个好梦。';
        } else if (/name|叫什么|你是/.test(lower)) {
            reply = `我是${S.NICKNAME}。`;
        } else if (mood >= 80) {
            reply = this._dialogue.pick({ state: 'love', mood });
        } else {
            // Generic fallback: pick a bubble line relevant to state and mood
            reply = this._dialogue.pick({ state: ctx.lastState || 'idle', mood });
        }

        // The local backend is the guaranteed "always-works" path. dialogue.pick
        // can legitimately return '' when no candidates match the current state /
        // time bucket, so never surface an empty reply to the user.
        if (typeof reply !== 'string' || !reply.trim()) {
            reply = '我在这儿呢，想聊点什么都可以。';
        }

        return { reply, tokens: stripped.length, latencyMs: Date.now() - t0, backend: this.id };
    }
}

// =============================================================================
// OpenAI-compatible backend — renderer-side adapter only. Network access,
// credential decryption, prompt policy and response limits live in main.
// =============================================================================
export class OpenAICompatibleBackend {
    constructor({ request } = {}) {
        this.id = 'openai-compatible';
        this.label = 'OpenAI 兼容接口';
        this._request = request;
        this.enabled = false;
    }

    setAvailable(value) {
        this.enabled = value === true && typeof this._request === 'function';
    }

    available() { return this.enabled; }

    async chat(prompt) {
        if (!this.available()) throw new Error('openai-compatible: not configured');
        const result = await this._request(String(prompt || ''));
        if (!result?.ok) throw new Error(result?.error?.message || '远程 AI 请求失败');
        if (typeof result.reply !== 'string' || !result.reply.trim()) {
            throw new Error('远程 AI 没有返回有效回复');
        }
        return {
            reply: result.reply,
            tokens: result.tokens,
            latencyMs: result.latencyMs,
            backend: this.id,
        };
    }
}

// =============================================================================
// AiChat orchestrator
// =============================================================================
export class AiChat {
    constructor({ dialogue, getMood, getMemory, getTime, remoteChat, remoteReset }) {
        this._local = new LocalTemplateBackend({ dialogue, getMood, getMemory, getTime });
        this._openai = new OpenAICompatibleBackend({ request: remoteChat });
        this._remoteReset = remoteReset;

        this._history = [];   // ephemeral, in-session only, never persisted
        this._listeners = new Set();

        this._backendId = this._local.id;
    }

    /** Selectable backends list. */
    availableBackends() {
        return [this._local, this._openai].map(b => ({
            id: b.id, label: b.label, available: b.available(),
        }));
    }

    setRemoteAvailable(value) {
        this._openai.setAvailable(value);
        if (!this._openai.available() && this._backendId === this._openai.id) {
            this._backendId = this._local.id;
        }
    }

    /** Switch the active backend (e.g. user enables OpenAI). */
    async setBackend(id) {
        if (![this._local.id, this._openai.id].includes(id)) {
            throw new Error(`unknown backend "${id}"`);
        }
        if (id === 'openai-compatible') {
            if (!this._openai.available()) {
                throw new Error('backend "openai-compatible" is not configured');
            }
        }
        this._backendId = id;
        return id;
    }

    activeBackend() { return this._backendId; }

    onAnswer(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

    /** Synchronous-like API: returns a Promise<{ reply, backend, latencyMs }>. */
    async ask(prompt) {
        // Pick backend; auto-fall-back to local on failure.
        let backend = this._backendId === 'openai-compatible' && this._openai.available()
            ? this._openai
            : this._local;
        let result;
        try {
            result = await backend.chat(prompt, {
                history: this._history.slice(-10),
                lastState: this._lastState,
            });
        } catch (e) {
            // Network or auth failure — fall back to local.
            console.warn(`[ai] backend ${backend.id} failed, falling back to local:`, e.message);
            result = await this._local.chat(prompt, { lastState: this._lastState });
            backend = this._local;
        }

        this._history.push({ who: 'user', text: String(prompt || ''), at: Date.now() });
        this._history.push({ who: 'bot',  text: result.reply, at: Date.now() });
        if (this._history.length > 20) this._history.splice(0, this._history.length - 20);

        for (const fn of this._listeners) {
            try { fn({ prompt, ...result }); } catch (_) {}
        }

        return result;
    }

    noteState(state) { this._lastState = state; }

    /** Forget the in-session history (privacy hygiene). */
    reset() {
        this._history.length = 0;
        if (typeof this._remoteReset === 'function') {
            Promise.resolve(this._remoteReset()).catch(() => {});
        }
    }
}

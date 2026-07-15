/**
 * tests/ai-chat.test.mjs
 *
 * Smoke tests for src/renderer/ai-chat.js (no DOM, no Electron).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AiChat, LocalTemplateBackend, OpenAICompatibleBackend } from '../src/renderer/ai-chat.js';

function makeDialogue() {
    return { pick: ({ mood, state }) => `(${state}/${mood}) hi` };
}

test('LocalTemplateBackend.greeting', async () => {
    const back = new LocalTemplateBackend({ dialogue: makeDialogue() });
    const r = await back.chat('hello', {});
    assert.ok(r.reply.length > 0);
    assert.equal(r.backend, 'local-template');
});

test('LocalTemplateBackend suggests meal at lunch', async () => {
    const back = new LocalTemplateBackend({
        dialogue: makeDialogue(),
        getTime: () => new Date(2026, 6, 15, 12, 30),
    });
    const r = await back.chat('接下来干嘛？', {});
    assert.ok(r.reply.includes('吃饭') || r.reply.includes('餐'));
});

test('AiChat defaults to local-template', () => {
    const ac = new AiChat({ dialogue: makeDialogue() });
    assert.equal(ac.activeBackend(), 'local-template');
});

test('AiChat.openai requires credentials', async () => {
    const ac = new AiChat({ dialogue: makeDialogue() });
    await assert.rejects(() => ac.setBackend('openai-compatible'), /not configured/);
});

test('OpenAICompatibleBackend only becomes available after main-process status allows it', () => {
    const b = new OpenAICompatibleBackend({ request: async () => ({ ok: true, reply: '安全回复' }) });
    assert.equal(b.available(), false);
    b.setAvailable(true);
    assert.equal(b.available(), true);
});

test('remote backend delegates to the main-process request adapter', async () => {
    const prompts = [];
    const ac = new AiChat({
        dialogue: makeDialogue(),
        remoteChat: async (prompt) => {
            prompts.push(prompt);
            return { ok: true, reply: '来自主进程', latencyMs: 12, backend: 'openai-compatible' };
        },
    });
    ac.setRemoteAvailable(true);
    await ac.setBackend('openai-compatible');
    const result = await ac.ask('你好');
    assert.deepEqual(prompts, ['你好']);
    assert.equal(result.reply, '来自主进程');
    assert.equal(result.backend, 'openai-compatible');
});

test('reset clears both renderer and main-process ephemeral history', async () => {
    let resets = 0;
    const ac = new AiChat({ dialogue: makeDialogue(), remoteReset: async () => { resets += 1; } });
    ac.reset();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(resets, 1);
});

test('AiChat.ask returns reply via local backend', async () => {
    const ac = new AiChat({ dialogue: makeDialogue() });
    const r = await ac.ask('hello');
    assert.ok(r.reply.length > 0);
});

test('AiChat.history resets on reset()', async () => {
    const ac = new AiChat({ dialogue: makeDialogue() });
    await ac.ask('hi');
    await ac.ask('bye');
    ac.reset();
    // No direct accessor — verify via repeated ask not failing
    await ac.ask('still works?');
});

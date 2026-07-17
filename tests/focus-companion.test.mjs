import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFocusCompanion, formatFocusElapsed, formatFocusRemaining } from '../src/renderer/focus-companion.js';

test('focus companion formats elapsed and remaining time in calm local copy', () => {
    assert.equal(formatFocusElapsed(0), '刚刚开始');
    assert.equal(formatFocusElapsed(65 * 60_000), '已投入 1 小时 5 分钟');
    assert.equal(formatFocusRemaining(1), '还剩约 1 分钟');
});

test('focus companion exposes a gentle three-choice landing only for a linked completed focus', () => {
    const decision = buildFocusCompanion({
        phase: 'rest', awaitingDecision: true, task: { id: 'task-1', title: '整理照片' }, remainingMs: 300_000,
    });
    assert.equal(decision.mode, 'decision');
    assert.equal(decision.awaitingDecision, true);
    assert.equal(decision.heading, '这一段已经走完了');

    const freeFocus = buildFocusCompanion({ phase: 'rest', awaitingDecision: true, remainingMs: 300_000 });
    assert.equal(freeFocus.mode, 'rest');
    assert.equal(freeFocus.awaitingDecision, false);
});

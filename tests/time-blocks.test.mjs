import { test } from 'node:test';
import assert from 'node:assert/strict';

import { timeBlockForHour, timeBlockLabel } from '../src/renderer/time-blocks.js';

test('time blocks deliberately leave transition and night hours empty', () => {
    assert.equal(timeBlockForHour(8), 'morning');
    assert.equal(timeBlockForHour(12), '');
    assert.equal(timeBlockForHour(13), 'afternoon');
    assert.equal(timeBlockForHour(18), '');
    assert.equal(timeBlockForHour(19), 'evening');
    assert.equal(timeBlockForHour(23), '');
    assert.equal(timeBlockForHour(24), '');
    assert.equal(timeBlockLabel('evening'), '晚上');
    assert.equal(timeBlockLabel(''), '未安排');
});

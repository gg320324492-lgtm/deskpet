/**
 * tests/state-machine.test.mjs
 *
 * Smoke tests for the state-machine driven from state-catalog.mjs.
 * Run with: node --test tests/state-machine.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    STATES,
    ALL_STATES,
    TEMPORARY_STATES,
    TEMP_DURATIONS,
    ALLOWED,
} from '../src/renderer/state-catalog.mjs';
import { PetStateMachine } from '../src/renderer/state-machine.js';

test('all 18 states registered (12 stable + 6 MVP placeholders)', () => {
    assert.equal(ALL_STATES.length, 18);
    assert.ok(ALL_STATES.includes(STATES.IDLE));
    assert.ok(ALL_STATES.includes(STATES.LAND));   // placeholder
});

test('temporary states and durations match', () => {
    assert.ok(TEMPORARY_STATES.has(STATES.SURPRISE));
    assert.ok(TEMPORARY_STATES.has(STATES.LOVE));
    assert.ok(!TEMPORARY_STATES.has(STATES.IDLE));
    assert.ok(!TEMPORARY_STATES.has(STATES.SLEEP));
    assert.equal(TEMP_DURATIONS[STATES.SURPRISE], 1500);
    assert.equal(TEMP_DURATIONS[STATES.EAT], 5000);
});

test('illegal transitions are blocked', () => {
    const sm = new PetStateMachine();
    // EAT only allows -> IDLE
    sm.force(STATES.EAT);
    sm._state = STATES.EAT;
    assert.equal(sm.transitionTo(STATES.WALK), false);
    assert.equal(sm.state, STATES.EAT);
});

test('legal transitions succeed', () => {
    const sm = new PetStateMachine();
    sm.force(STATES.IDLE);
    sm._state = STATES.IDLE;
    assert.equal(sm.transitionTo(STATES.SIT), true);
    assert.equal(sm.state, STATES.SIT);
});

test('force bypasses transition table', () => {
    const sm = new PetStateMachine(STATES.IDLE);
    sm.force(STATES.SLEEP);    // not in IDLE->X
    assert.equal(sm.state, STATES.SLEEP);
});

test('listeners fire on every transition', () => {
    const sm = new PetStateMachine(STATES.IDLE);
    const events = [];
    const unsub = sm.onChange((next, prev) => events.push({ next, prev }));
    sm.transitionTo(STATES.WALK);
    sm.transitionTo(STATES.SIT);
    sm.force(STATES.SLEEP);
    unsub();
    assert.deepEqual(events, [
        { next: STATES.WALK, prev: STATES.IDLE },
        { next: STATES.SIT,  prev: STATES.WALK },
        { next: STATES.SLEEP, prev: STATES.SIT },
    ]);
});

test('unknown state rejected by transitionTo', () => {
    const sm = new PetStateMachine(STATES.IDLE);
    assert.equal(sm.transitionTo('not-a-state'), false);
});

test('LAND placeholder accessible & only transitions to IDLE/SIT', () => {
    const sm = new PetStateMachine(STATES.IDLE);
    assert.ok(ALLOWED[STATES.IDLE].has(STATES.LAND));
    sm._state = STATES.LAND;
    assert.ok(!ALLOWED[STATES.LAND].has(STATES.WALK));
    assert.ok(ALLOWED[STATES.LAND].has(STATES.IDLE));
    assert.ok(ALLOWED[STATES.LAND].has(STATES.SIT));
});

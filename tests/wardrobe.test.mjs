import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { OUTFITS, Wardrobe } from '../src/renderer/wardrobe.js';
import { spriteCandidates } from '../src/renderer/sprite-loader.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const manifestStates = JSON.parse(
    readFileSync(new URL('../assets/state-manifest.json', import.meta.url), 'utf8'),
).states.map((state) => state.key);

function fresh(outfit = 'default') {
    const settings = { outfit };
    const loads = [];
    const loader = {
        async setOutfit(name) {
            loads.push(name);
            return loads.at(-2) !== name;
        },
    };
    const wardrobe = new Wardrobe({
        getSettings: () => settings,
        setSettings: async ({ settings: patch }) => Object.assign(settings, patch),
        spriteLoader: loader,
    });
    return { wardrobe, settings, loads };
}

test('the bundled wardrobe exposes default and sleepwear outfits', () => {
    assert.deepEqual(OUTFITS.map((outfit) => outfit.id), ['default', 'sleepwear']);
});

test('sleepwear covers every manifest state with raw and processed sprites', () => {
    const sleepwear = OUTFITS.find((outfit) => outfit.id === 'sleepwear');
    assert.equal(manifestStates.length, 18);
    assert.deepEqual(sleepwear.completedStates, manifestStates);
    assert.equal(new Set(sleepwear.completedStates).size, 18);
    for (const state of sleepwear.completedStates) {
        assert.equal(
            existsSync(`${projectRoot}/assets/outfits/sleepwear/${state}.png`),
            true,
            `missing processed sleepwear sprite: ${state}`,
        );
        assert.equal(
            existsSync(`${projectRoot}/assets/raw_outfits/sleepwear/${state}.png`),
            true,
            `missing raw sleepwear sprite: ${state}`,
        );
    }
});

test('sleepwear loads as an active outfit', async () => {
    const { wardrobe, loads } = fresh('sleepwear');
    assert.equal(await wardrobe.loadActive(), 'sleepwear');
    assert.deepEqual(loads, ['sleepwear']);
    assert.equal(wardrobe.snapshot().active, 'sleepwear');
});

test('unknown persisted outfits recover to default', async () => {
    const { wardrobe, loads } = fresh('unknown-pack');
    assert.equal(await wardrobe.loadActive(), 'default');
    assert.deepEqual(loads, ['default']);
    assert.equal(wardrobe.snapshot().active, 'default');
});

test('set persists known outfits and rejects unknown names', async () => {
    const { wardrobe, settings } = fresh();
    assert.equal(await wardrobe.set('sleepwear'), true);
    assert.equal(settings.outfit, 'sleepwear');
    assert.equal(await wardrobe.set('../escape'), false);
    assert.equal(settings.outfit, 'sleepwear');
});

test('outfit sprite candidates fall back to the matching default state', () => {
    assert.deepEqual(spriteCandidates('default', 'walk.png'), [
        '../../assets/processed/walk.png',
    ]);
    assert.deepEqual(spriteCandidates('sleepwear', 'walk.png'), [
        '../../assets/outfits/sleepwear/walk.png',
        '../../assets/processed/walk.png',
    ]);
});

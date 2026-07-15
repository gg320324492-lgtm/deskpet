#!/usr/bin/env node
/**
 * scripts/gen_state_manifest.mjs
 *
 * Reads src/renderer/state-catalog.mjs (Phase 1a SSOT) and writes a small
 * JSON manifest to assets/state-manifest.json that the Python preprocess
 * script (scripts/preprocess_assets.py) consumes.
 *
 * Why a separate JSON step:
 *   - Keeps Python free of any JS toolchain dependency.
 *   - Acts as the cross-language contract between renderer (JS) and the
 *     asset pipeline (Python).
 *
 * Run automatically by the launch/build hooks in package.json.
 * If state-catalog.mjs is missing (early setup), writes an empty manifest
 * so the build doesn't break.
 *
 * Usage:
 *   node scripts/gen_state_manifest.mjs
 *   node scripts/gen_state_manifest.mjs --check
 *   node scripts/gen_state_manifest.mjs --out <path>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const CATALOG   = join(ROOT, 'src', 'renderer', 'state-catalog.mjs');
const DEFAULT_MANIFEST = join(ROOT, 'assets', 'state-manifest.json');

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const OUT = resolve(arg('out', DEFAULT_MANIFEST));
const CHECK = process.argv.includes('--check');

async function loadCatalog() {
    if (!existsSync(CATALOG)) return null;
    try {
        // URL import avoids Windows path quirks.
        const mod = await import(pathToFileURL(CATALOG).href);
        return mod;
    } catch (e) {
        console.warn('[gen_manifest] failed to import catalog:', e.message);
        return null;
    }
}

function buildManifest(catalogMod) {
    if (!catalogMod || !catalogMod.STATE_CATALOG) {
        return {
            version: 1,
            generatedAt: new Date().toISOString(),
            source: 'gen_state_manifest.mjs',
            note: 'state-catalog.mjs not present yet — empty manifest',
            states: [],
        };
    }
    const states = Object.entries(catalogMod.STATE_CATALOG).map(([key, entry]) => ({
        key: entry.id,                       // lowercase runtime state id (matches sprite filename)
        catalogKey: key,                     // uppercase JS enum key (for debugging / cross-ref)
        sprite:           entry.sprite ?? null,
        fallbackSprite:   entry.fallbackSprite ?? entry.sprite ?? null,
        hasSprite:        !!entry.hasSprite,
        category:         entry.category ?? 'temporary',
        defaultDuration:  entry.defaultDuration ?? 2000,
        cssClass:         entry.cssClass ?? null,
        particles:        entry.particles ?? null,
        bubbleKey:        entry.bubbleKey ?? null,
        transitionGroup:  entry.transitionGroup ?? null,
        menuGroup:        entry.menuGroup ?? null,
        sources:          entry.sources ?? null,
    }));
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        source: 'state-catalog.mjs',
        states,
    };
}

function comparable(manifest) {
    if (!manifest || typeof manifest !== 'object') return null;
    const { generatedAt: _generatedAt, ...rest } = manifest;
    return rest;
}

function sameContent(left, right) {
    return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function readExisting() {
    if (!existsSync(OUT)) return null;
    try {
        return JSON.parse(readFileSync(OUT, 'utf8'));
    } catch (error) {
        if (CHECK) console.error(`[gen_manifest] invalid JSON at ${OUT}: ${error.message}`);
        return null;
    }
}

async function main() {
    const catalogMod = await loadCatalog();
    const manifest = buildManifest(catalogMod);
    const existing = readExisting();

    if (CHECK) {
        if (existing && sameContent(existing, manifest)) {
            console.log(`[gen_manifest] manifest is current -> ${OUT}`);
            return;
        }
        console.error(`[gen_manifest] manifest is missing or stale -> ${OUT}`);
        process.exitCode = 1;
        return;
    }

    if (existing && sameContent(existing, manifest)) {
        console.log(`[gen_manifest] unchanged -> ${OUT}`);
        return;
    }

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    const n = manifest.states.length;
    console.log(`[gen_manifest] wrote ${n} state${n === 1 ? '' : 's'} -> ${OUT}`);
}

main().catch((e) => {
    console.error('[gen_manifest] failed:', e);
    process.exit(1);
});

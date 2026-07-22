/**
 * src/renderer/state-catalog.mjs
 *
 * SSOT (single source of truth) for every pet state.
 *
 * - 12 original shipped states from v1.x.
 * - 6 completed v2 states with generated, identity-matched sprite art.
 * All 18 states retain fallbackSprite metadata so future outfit packs can
 * recover gracefully from an incomplete asset set.
 *
 * This file is consumed by:
 *   - state-machine.js (STATES / TEMP_DURATIONS / ALLOWED via `transitions`)
 *   - animator.js     (BREATH_STATES / BUBBLE_MESSAGES / particles)
 *   - interaction.js  (MENU_GROUPS / KEY_MAP / state-class list)
 *   - tray.js         (tray group definitions) — via shared JSON manifest
 *   - scripts/gen_state_manifest.mjs — emits assets/state-manifest.json for Python preprocess_assets.py
 *
 * Adding a new state:
 *   1. Add a `STATE_KEY: { ... }` entry below.
 *   2. Drop the source PNG into assets/raw/ or assets/raw_v2/ matching
 *      `sources.v1` / `sources.v2` filenames.
 *   3. Run `npm run preprocess`.  Phase 1b's sprite-loader picks it up
 *      automatically; flip `hasSprite: true` when art lands.
 *
 * Removing a state:  remove the entry.  The derived exports below update
 * automatically; nothing else in the project needs editing.
 */

const _CATALOG = Object.freeze({
    // ─── existing 12 states (stable since v1.0) ───────────────────────────────
    IDLE: {
        id: 'idle',
        sprite: 'idle.png',
        fallbackSprite: 'idle.png',
        hasSprite: true,
        sources: { v2: null,        v1: '02_walk.png' },
        category: 'persistent',
        cssClass: 'state-idle',
        menuGroup: '常用',
        label: '待机',
        key: '1',
        breath: true,
        particles: null,
        bubble: '',
        bubbleMood: null,
        transitions: [
            'WALK','SIT','EAT','THINK','CHEER','SURPRISE','SLEEP','YAWN',
            'LOVE','WORK','PEEK','WAVE','DRINK','RUN','LAND','ANGRY','STRETCH',
        ],
    },
    WALK: {
        id: 'walk',
        sprite: 'walk.png',
        fallbackSprite: 'walk.png',
        hasSprite: true,
        sources: { v2: '03_run_strong.png', v1: '03_sit.png' },
        category: 'action',
        cssClass: 'state-walk',
        menuGroup: '行为',
        label: '行走',
        key: '2',
        breath: false,
        particles: null,
        bubble: '',
        bubbleMood: null,
        transitions: ['IDLE','SIT','PEEK'],
    },
    SIT: {
        id: 'sit',
        sprite: 'sit.png',
        fallbackSprite: 'sit.png',
        hasSprite: true,
        sources: { v2: '06_sit_pillow.png', v1: '04_eat.png' },
        category: 'persistent',
        cssClass: 'state-sit',
        menuGroup: '常用',
        label: '坐下',
        key: '3',
        breath: true,
        particles: null,
        bubble: '',
        bubbleMood: null,
        transitions: ['IDLE','EAT','SLEEP','LOVE','THINK','YAWN'],
    },
    EAT: {
        id: 'eat',
        sprite: 'eat.png',
        fallbackSprite: 'eat.png',
        hasSprite: true,
        sources: { v2: null,         v1: '04_eat.png' },
        category: 'temporary',
        cssClass: 'state-eat',
        menuGroup: '行为',
        label: '吃饭',
        key: '4',
        breath: false,
        particles: null,
        bubble: '好吃~',
        bubbleMood: null,
        defaultDuration: 5000,
        transitions: ['IDLE'],
    },
    THINK: {
        id: 'think',
        sprite: 'think.png',
        fallbackSprite: 'think.png',
        hasSprite: true,
        sources: { v2: null,         v1: '06_think.png' },
        category: 'temporary',
        cssClass: 'state-think',
        menuGroup: '行为',
        label: '思考',
        key: '5',
        breath: false,
        particles: null,
        bubble: '嗯…',
        bubbleMood: null,
        defaultDuration: 4000,
        transitions: ['IDLE'],
    },
    CHEER: {
        id: 'cheer',
        sprite: 'cheer.png',
        fallbackSprite: 'cheer.png',
        hasSprite: true,
        sources: { v2: '04_spin_dress.png', v1: '07_cheer.png' },
        category: 'temporary',
        cssClass: 'state-cheer',
        menuGroup: '表情',
        label: '干杯',
        key: '6',
        breath: false,
        particles: null,
        bubble: '干杯!',
        bubbleMood: null,
        defaultDuration: 2000,
        transitions: ['IDLE'],
    },
    SURPRISE: {
        id: 'surprise',
        sprite: 'surprise.png',
        fallbackSprite: 'surprise.png',
        hasSprite: true,
        sources: { v2: null,         v1: '08_surprise.png' },
        category: 'temporary',
        cssClass: 'state-surprise',
        menuGroup: '表情',
        label: '惊喜',
        key: '7',
        breath: false,
        particles: null,
        bubble: '哇!',
        bubbleMood: null,
        defaultDuration: 1500,
        transitions: ['IDLE'],
    },
    SLEEP: {
        id: 'sleep',
        sprite: 'sleep.png',
        fallbackSprite: 'sleep.png',
        hasSprite: true,
        sources: { v2: null,         v1: '09_sleep.png' },
        category: 'persistent',
        cssClass: 'state-sleep',
        menuGroup: '常用',
        label: '睡觉',
        key: '8',
        breath: true,
        particles: 'sleep_z',
        bubble: 'Zzz…',
        bubbleMood: 'mood-night',
        transitions: ['IDLE'],
    },
    YAWN: {
        id: 'yawn',
        sprite: 'yawn.png',
        fallbackSprite: 'yawn.png',
        hasSprite: true,
        sources: { v2: '02_yawn.png', v1: null },
        category: 'temporary',
        cssClass: 'state-yawn',
        menuGroup: '表情',
        label: '哈欠',
        key: '9',
        breath: true,
        particles: null,
        bubble: '哈～',
        bubbleMood: 'mood-morning',
        defaultDuration: 2500,
        transitions: ['IDLE','SIT','SLEEP','STRETCH'],
    },
    LOVE: {
        id: 'love',
        sprite: 'love.png',
        fallbackSprite: 'love.png',
        hasSprite: true,
        sources: { v2: '05_heart.png', v1: null },
        category: 'temporary',
        cssClass: 'state-love',
        menuGroup: '表情',
        label: '比心',
        key: '0',
        breath: false,
        particles: 'love_hearts',
        bubble: '喜欢你~',
        bubbleMood: 'mood-love',
        defaultDuration: 2000,
        transitions: ['IDLE'],
    },
    WORK: {
        id: 'work',
        sprite: 'work.png',
        fallbackSprite: 'work.png',
        hasSprite: true,
        sources: { v2: '07_laptop.png', v1: null },
        category: 'sustained',
        cssClass: 'state-work',
        menuGroup: '常用',
        label: '工作',
        key: 'w',
        breath: false,
        particles: 'work_keys',
        bubble: '工作中…',
        bubbleMood: 'mood-morning',
        transitions: ['IDLE','SLEEP'],
    },
    PEEK: {
        id: 'peek',
        sprite: 'peek.png',
        fallbackSprite: 'peek.png',
        hasSprite: true,
        sources: { v2: '08_tilt_wink.png', v1: null },
        category: 'temporary',
        cssClass: 'state-peek',
        menuGroup: '行为',
        label: '偷看',
        key: 'p',
        breath: true,
        particles: null,
        bubble: '咦？',
        bubbleMood: null,
        defaultDuration: 1500,
        transitions: ['IDLE'],
    },

    // ─── 6 completed v2 states ────────────────────────────────────────────────
    WAVE: {
        id: 'wave',
        sprite: 'wave.png',
        fallbackSprite: 'cheer.png',   // fall back to standing spin/cheer pose
        hasSprite: true,
        sources: { v2: '14_wave.png', v1: null },
        category: 'temporary',
        cssClass: 'state-wave',
        menuGroup: '互动',
        label: '挥手',
        key: 'v',
        breath: false,
        particles: null,
        bubble: '嗨~',
        bubbleMood: null,
        defaultDuration: 1500,
        transitions: ['IDLE'],
    },
    DRINK: {
        id: 'drink',
        sprite: 'drink.png',
        fallbackSprite: 'eat.png',     // mouth-open pose is closest analog
        hasSprite: true,
        sources: { v2: '09_drink.png', v1: null },
        category: 'temporary',
        cssClass: 'state-drink',
        menuGroup: '互动',
        label: '举杯',
        key: 'b',
        breath: false,
        particles: 'love_hearts',      // reuse heart particle as celebration
        bubble: '干杯!',
        bubbleMood: 'mood-love',
        defaultDuration: 2000,
        transitions: ['IDLE'],
    },
    RUN: {
        id: 'run',
        sprite: 'run.png',
        fallbackSprite: 'walk.png',    // jog uses walk sprite until art arrives
        hasSprite: true,
        sources: { v2: '10_run.png', v1: null },
        category: 'action',
        cssClass: 'state-run',
        menuGroup: '行为',
        label: '小跑',
        key: 'r',
        breath: false,
        particles: null,
        bubble: '',
        bubbleMood: null,
        transitions: ['IDLE','SIT','PEEK'],
    },
    LAND: {
        id: 'land',
        sprite: 'land.png',
        fallbackSprite: 'sit.png',     // post-landing settles into sit pose
        hasSprite: true,
        sources: { v2: '11_land.png', v1: null },
        category: 'temporary',
        cssClass: 'state-land',
        menuGroup: null,               // not in menu — triggered on drop
        label: '落地',
        key: null,
        breath: true,
        particles: null,
        bubble: '',
        bubbleMood: null,
        defaultDuration: 1500,
        transitions: ['IDLE','SIT'],
    },
    ANGRY: {
        id: 'angry',
        sprite: 'angry.png',
        fallbackSprite: 'surprise.png',// closest wide-mouth / shocked pose
        hasSprite: true,
        sources: { v2: '12_angry.png', v1: null },
        category: 'temporary',
        cssClass: 'state-angry',
        menuGroup: '表情',
        label: '生气',
        key: 'x',
        breath: false,
        particles: null,
        bubble: '哼!',
        bubbleMood: null,
        defaultDuration: 1500,
        transitions: ['IDLE','SURPRISE'],
    },
    STRETCH: {
        id: 'stretch',
        sprite: 'stretch.png',
        fallbackSprite: 'yawn.png',    // yawn pose is the closest "stretch" analog
        hasSprite: true,
        sources: { v2: '13_stretch.png', v1: null },
        category: 'temporary',
        cssClass: 'state-stretch',
        menuGroup: '互动',
        label: '伸懒腰',
        key: 's',
        breath: true,
        particles: null,
        bubble: '放松一下~',
        bubbleMood: 'mood-morning',
        defaultDuration: 2500,
        transitions: ['IDLE','YAWN'],
    },
});

// =============================================================================
// Derived exports — never edit these by hand; they re-derive from _CATALOG.
// =============================================================================

// State keys (upper-case enum, freeze-stable)
export const STATE_KEYS = Object.freeze(Object.keys(_CATALOG));

// id -> STATE_KEY lookup
const _idToKey = new Map();
for (const key of STATE_KEYS) _idToKey.set(_CATALOG[key].id, key);

// Upper -> id (frozen) e.g. { IDLE: 'idle', WALK: 'walk', ... }
const _STATES = {};
for (const key of STATE_KEYS) _STATES[key] = _CATALOG[key].id;
export const STATES = Object.freeze(_STATES);

// All state ids (lowercase). Use as the canonical runtime state string.
export const ALL_STATES = Object.freeze(Object.values(STATES));

// Temporary-only set (those with defaultDuration).
const _TEMP = new Set();
for (const key of STATE_KEYS) {
    if (_CATALOG[key].category === 'temporary') _TEMP.add(_CATALOG[key].id);
}
export const TEMPORARY_STATES = _TEMP;

// defaultDuration map (ms).
const _DURATIONS = {};
for (const key of STATE_KEYS) {
    if (_CATALOG[key].category === 'temporary') {
        _DURATIONS[_CATALOG[key].id] = _CATALOG[key].defaultDuration;
    }
}
export const TEMP_DURATIONS = Object.freeze(_DURATIONS);

// States that get the breath animation.
const _BREATH = new Set();
for (const key of STATE_KEYS) {
    if (_CATALOG[key].breath) _BREATH.add(_CATALOG[key].id);
}
export const BREATH_STATES = _BREATH;

// Legal transitions (derived from each state's `transitions` list).
const _ALLOWED = {};
for (const key of STATE_KEYS) {
    const target = new Set();
    for (const t of _CATALOG[key].transitions) {
        if (_CATALOG[t]) target.add(_CATALOG[t].id);
    }
    _ALLOWED[_CATALOG[key].id] = target;
}
export const ALLOWED = _ALLOWED;
export function isAllowed(from, to) {
    return _ALLOWED[from]?.has(to) ?? false;
}

// Bubble text per state.
const _BUBBLES = {};
const _BUBBLE_MOOD = {};
for (const key of STATE_KEYS) {
    _BUBBLES[_CATALOG[key].id] = _CATALOG[key].bubble ?? '';
    _BUBBLE_MOOD[_CATALOG[key].id] = _CATALOG[key].bubbleMood ?? '';
}
export const BUBBLE_MESSAGES = Object.freeze(_BUBBLES);
export const BUBBLE_MOOD = Object.freeze(_BUBBLE_MOOD);

// Per-state CSS class.
export const STATE_CLASSES = Object.freeze(
    Object.fromEntries(STATE_KEYS.map(k => [_CATALOG[k].id, _CATALOG[k].cssClass]))
);

// Particles per state.
export const STATE_PARTICLES = Object.freeze(
    Object.fromEntries(STATE_KEYS.map(k => [_CATALOG[k].id, _CATALOG[k].particles ?? null]))
);

// Right-click menu rebuilt from `menuGroup`.
// Order follows STATE_KEYS for stable rendering; groups emit in encounter order.
const _menuOrder = [];
const _menuGroupsMap = new Map();
for (const key of STATE_KEYS) {
    const g = _CATALOG[key].menuGroup;
    if (!g) continue;
    if (!_menuGroupsMap.has(g)) {
        _menuGroupsMap.set(g, []);
        _menuOrder.push(g);
    }
    if (!_CATALOG[key].hasSprite) continue;   // keep future incomplete states out of the menu
    _menuGroupsMap.get(g).push({
        id: _CATALOG[key].id,
        key: _CATALOG[key].key,
        label: _CATALOG[key].label,
    });
}
export const MENU_GROUPS = Object.freeze(
    _menuOrder.map(label => ({ label, items: Object.freeze(_menuGroupsMap.get(label)) }))
);

// All menu entries flattened.
export const ALL_MENU_ITEMS = Object.freeze(MENU_GROUPS.flatMap(g => g.items));

// Keyboard map (key -> state id).
const _KEY_MAP = {};
for (const key of STATE_KEYS) {
    const k = _CATALOG[key].key;
    if (k) _KEY_MAP[k.toLowerCase()] = _CATALOG[key].id;
}
// Escape always returns to idle (kept for compatibility).
_KEY_MAP['escape'] = STATES.IDLE;
export const KEY_MAP = Object.freeze(_KEY_MAP);

// Per-state sprite resolution: returns the filename to load, with fallback.
export function resolveSprite(stateId) {
    const key = _idToKey.get(stateId);
    if (!key) return null;
    const e = _CATALOG[key];
    // Resolve through the active outfit prefix in Phase 5.  For now, default
    // outfit == processed dir at the same filename.
    return e.sprite;
}

export function resolveFallbackSprite(stateId) {
    const key = _idToKey.get(stateId);
    if (!key) return null;
    return _CATALOG[key].fallbackSprite ?? _CATALOG[key].sprite;
}

export function hasSprite(stateId) {
    const key = _idToKey.get(stateId);
    if (!key) return false;
    return _CATALOG[key].hasSprite;
}

// Read-only view of the full catalog.
export const STATE_CATALOG = Object.freeze(
    Object.fromEntries(STATE_KEYS.map(k => [k, Object.freeze(_CATALOG[k])]))
);

// Read-only view of raw catalog for the manifest generator (Python pipeline).
// Only includes fields the preprocess script needs.
export function manifestView() {
    return Object.fromEntries(STATE_KEYS.map(k => [
        k,
        {
            sprite: _CATALOG[k].sprite,
            fallbackSprite: _CATALOG[k].fallbackSprite,
            hasSprite: _CATALOG[k].hasSprite,
            sources: _CATALOG[k].sources,
        },
    ]));
}

// Lookup helpers.
export function stateKeyFromId(stateId) {
    return _idToKey.get(stateId) ?? null;
}

export function stateEntry(stateId) {
    const key = _idToKey.get(stateId);
    return key ? _CATALOG[key] : null;
}

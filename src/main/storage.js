/**
 * src/main/storage.js
 *
 * Pet-persistence engine. Eight small JSON files in userData, one per
 * persistence domain (settings, mood, todos, pomodoro, reminders, memory,
 * achievements, stats). Each file is independently:
 *   - JSON-encoded
 *   - atomically written via .tmp + rename
 *   - debounced on writes (2-5s) per file, NOT a global 30s window
 *   - flushed on `before-quit`, `powerMonitor` shutdown/suspend events,
 *     and the optional explicit flushAll() hook
 *   - rolled back to the previous valid write via `.bak`
 *   - quarantined as `.corrupt-<timestamp>.bak` if parsing fails
 *
 * Schema version lives in each file under `version`.  Older payloads are
 * migrated via src/shared/schema.js's migrate(domain, data).
 *
 * API:
 *   const store = require('./storage');
 *   await store.init();                       // wire lifecycle + flush hooks
 *   await store.get('settings');              // -> { ...defaults, ...loaded }
 *   await store.set('settings', { volume: 0.5 });   // shallow merge, persisted
 *   await store.patch('todos', (prev) => [...prev, newItem]);  // functional
 *   await store.list();                       // -> { settings, mood, todos, ... }
 *   store.on('change', ({ domain, data }) => ...);
 *   store.flushAll();                         // sync write everything pending
 */

const fs   = require('fs');
const path = require('path');
const { app, powerMonitor } = require('electron');
const { EventEmitter } = require('events');

const { getUserDataDir } = require('./paths');
const {
    DOMAINS,
    DOMAIN_DEFAULTS,
    migrate,
    withDefaults,
    sanitizeDomain,
    validateDomainPatch,
    createBackupSnapshot,
    parseBackupSnapshot,
    STORAGE_VERSION,
} = require('../shared/schema.cjs');

const DEBOUNCE_MS  = 3000;          // per-file write debounce
const FLUSH_TIMEOUT_MS = 5000;      // graceful flush on quit

class Storage extends EventEmitter {
    constructor() {
        super();
        this._dir        = null;
        this._cache      = new Map();   // domain -> in-memory data
        this._pending    = new Map();   // domain -> debounce timer
        this._ready      = false;
        this._wired      = false;
    }

    async init() {
        if (this._ready) return;
        this._dir = getUserDataDir();
        // Load all domains eagerly so the renderer can hydrate synchronously
        // from a single `list()` call.
        for (const d of DOMAINS) {
            this._cache.set(d, this._loadOne(d));
        }
        this._ready = true;
        this._wireLifecycle();
        console.log(`[storage] ready (${DOMAINS.length} domains, dir=${this._dir})`);
    }

    // ============ Public API ============

    get(domain) {
        this._assertDomain(domain);
        return structuredClone(this._cache.get(domain));
    }

    /** Shallow merge + debounced write. */
    async set(domain, patch) {
        this._assertDomain(domain);
        validateDomainPatch(domain, patch);
        const prev = this._cache.get(domain) || {};
        const next = sanitizeDomain(domain, { ...prev, ...patch, version: STORAGE_VERSION });
        this._cache.set(domain, next);
        this._scheduleWrite(domain);
        this.emit('change', { domain, data: structuredClone(next) });
        return structuredClone(next);
    }

    /** Functional update; returns the new data. */
    async patch(domain, updater) {
        this._assertDomain(domain);
        const prev = this._cache.get(domain) || {};
        const updated = updater(structuredClone(prev)) || prev;
        const next = sanitizeDomain(domain, { ...updated, version: STORAGE_VERSION });
        this._cache.set(domain, next);
        this._scheduleWrite(domain);
        this.emit('change', { domain, data: structuredClone(next) });
        return structuredClone(next);
    }

    list() {
        const out = {};
        for (const [d, v] of this._cache) out[d] = structuredClone(v);
        return out;
    }

    flushAll() {
        for (const timer of this._pending.values()) clearTimeout(timer);
        this._pending.clear();
        for (const d of DOMAINS) {
            if (this._cache.has(d)) this._writeSync(d, this._cache.get(d));
        }
    }

    /** Create a versioned, portable snapshot of all persistence domains. */
    createSnapshot() {
        const appVersion = typeof app.getVersion === 'function' ? app.getVersion() : 'unknown';
        return createBackupSnapshot(this.list(), { appVersion });
    }

    /**
     * Validate and atomically stage a complete snapshot before replacing data.
     * Existing files become each domain's rolling `.bak` copy.
     */
    importSnapshot(snapshot) {
        const parsed = parseBackupSnapshot(snapshot);
        this.flushAll();

        const staged = [];
        const committed = [];
        try {
            for (const domain of DOMAINS) {
                const target = this._pathFor(domain);
                const temp = `${target}.import.tmp`;
                fs.writeFileSync(temp, JSON.stringify(parsed.data[domain], null, 2), 'utf8');
                staged.push({ domain, target, temp, backup: `${target}.bak` });
            }
            for (const item of staged) {
                if (fs.existsSync(item.target)) fs.copyFileSync(item.target, item.backup);
            }
            for (const item of staged) {
                fs.renameSync(item.temp, item.target);
                committed.push(item);
            }
        } catch (error) {
            for (const item of committed) {
                try {
                    if (fs.existsSync(item.backup)) fs.copyFileSync(item.backup, item.target);
                } catch (_) {}
            }
            for (const item of staged) {
                try { if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp); } catch (_) {}
            }
            throw new Error(`storage: import failed (${error.message})`);
        }

        for (const domain of DOMAINS) {
            const next = structuredClone(parsed.data[domain]);
            this._cache.set(domain, next);
            this.emit('change', { domain, data: structuredClone(next) });
        }
        return { imported: true, exportedAt: parsed.exportedAt, appVersion: parsed.appVersion };
    }

    /** Replace the entire payload for a domain (mainly for tests / migrations). */
    async replace(domain, data) {
        this._assertDomain(domain);
        const next = withDefaults(domain, data);
        next.version = STORAGE_VERSION;
        this._cache.set(domain, next);
        this._scheduleWrite(domain);
        this.emit('change', { domain, data: structuredClone(next) });
        return structuredClone(next);
    }

    // ============ Internals ============

    _assertDomain(domain) {
        if (!DOMAINS.includes(domain)) {
            throw new Error(`storage: unknown domain "${domain}"`);
        }
    }

    _loadOne(domain) {
        const filePath = this._pathFor(domain);
        if (!fs.existsSync(filePath)) {
            // First-launch: write defaults immediately so the on-disk layout is consistent.
            const data = structuredClone(DOMAIN_DEFAULTS[domain]);
            this._writeSync(domain, data);
            return data;
        }
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            const migrated = migrate(domain, structuredClone(parsed));
            const merged = withDefaults(domain, migrated);
            // If migration introduced new fields, write the merged result back
            // so future loads see a normalized file.
            if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
                this._writeSync(domain, merged);
            }
            return merged;
        } catch (e) {
            console.warn(`[storage] ${domain} corrupted, backing up and substituting defaults:`, e.message);
            const quarantine = `${filePath}.corrupt-${Date.now()}.bak`;
            try { fs.renameSync(filePath, quarantine); } catch (_) {}
            const data = structuredClone(DOMAIN_DEFAULTS[domain]);
            this._writeSync(domain, data);
            return data;
        }
    }

    _pathFor(domain) {
        if (!this._dir) throw new Error('[storage] not initialized');
        return path.join(this._dir, `${domain}.json`);
    }

    _scheduleWrite(domain) {
        if (this._pending.has(domain)) clearTimeout(this._pending.get(domain));
        this._pending.set(domain, setTimeout(() => {
            this._pending.delete(domain);
            this._writeSync(domain, this._cache.get(domain));
        }, DEBOUNCE_MS));
    }

    _writeSync(domain, data) {
        const filePath = this._pathFor(domain);
        const tmp = filePath + '.tmp';
        const serialized = JSON.stringify(sanitizeDomain(domain, data), null, 2);
        try {
            fs.mkdirSync(this._dir, { recursive: true });
            if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === serialized) return true;
            fs.writeFileSync(tmp, serialized, 'utf8');
            if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`);
            fs.renameSync(tmp, filePath);
            return true;
        } catch (e) {
            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
            console.error(`[storage] failed to write ${domain}:`, e.message);
            return false;
        }
    }

    _wireLifecycle() {
        if (this._wired) return;
        this._wired = true;
        const flush = () => {
            try { this.flushAll(); } catch (e) { console.error('[storage] flushAll failed:', e); }
        };
        app.on('before-quit', flush);
        // powerMonitor is best-effort; safe no-op if not available.
        try {
            if (powerMonitor && typeof powerMonitor.on === 'function') {
                powerMonitor.on('suspend', flush);
                powerMonitor.on('shutdown', flush);
            }
        } catch (_) {}
    }
}

// Singleton
const storage = new Storage();

module.exports = { storage, Storage };

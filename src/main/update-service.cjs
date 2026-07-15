'use strict';

const { EventEmitter } = require('node:events');

const INITIAL_CHECK_DELAY_MS = 30_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const MANUAL_CHECK_COOLDOWN_MS = 30_000;

class UpdateServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'UpdateServiceError';
        this.code = code;
    }
}

function publicUpdateError(error) {
    if (error instanceof UpdateServiceError) {
        return { code: error.code, message: error.message };
    }
    return { code: 'UPDATE_INTERNAL', message: '更新服务暂时不可用' };
}

function getUnavailableReason({ isPackaged, platform, portable, feedAvailable }) {
    if (platform !== 'win32') return 'unsupported-platform';
    if (!isPackaged) return 'development';
    if (portable) return 'portable';
    if (!feedAvailable) return 'missing-feed';
    return '';
}

function safeVersion(info) {
    return typeof info?.version === 'string' && info.version.length <= 64 ? info.version : '';
}

function clampPercent(value) {
    const percent = Number(value);
    if (!Number.isFinite(percent)) return null;
    return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
}

class UpdateService extends EventEmitter {
    constructor({
        updater,
        app,
        dialog,
        storage,
        getParentWindow = () => null,
        platform = process.platform,
        portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
        feedAvailable = false,
        now = () => Date.now(),
        setTimeoutImpl = setTimeout,
        clearTimeoutImpl = clearTimeout,
        setIntervalImpl = setInterval,
        clearIntervalImpl = clearInterval,
        logger = console,
    } = {}) {
        super();
        if (!updater || !app || !dialog || !storage) {
            throw new TypeError('UpdateService requires updater, app, dialog and storage');
        }
        this._updater = updater;
        this._app = app;
        this._dialog = dialog;
        this._storage = storage;
        this._getParentWindow = getParentWindow;
        this._now = now;
        this._setTimeout = setTimeoutImpl;
        this._clearTimeout = clearTimeoutImpl;
        this._setInterval = setIntervalImpl;
        this._clearInterval = clearIntervalImpl;
        this._logger = logger;
        this._reason = getUnavailableReason({
            isPackaged: app.isPackaged === true,
            platform,
            portable,
            feedAvailable,
        });
        this._state = this._reason ? 'unavailable' : 'idle';
        this._availableVersion = '';
        this._progress = null;
        this._lastCheckedAt = '';
        this._lastManualCheckAt = 0;
        this._error = null;
        this._started = false;
        this._initialTimer = null;
        this._intervalTimer = null;
        this._promptedVersion = '';
        this._listeners = [];
        this._autoCheckEnabled = null;
    }

    status() {
        const settings = this._storage.get('settings');
        const currentVersion = String(this._app.getVersion?.() || 'unknown');
        return {
            supported: !this._reason,
            reason: this._reason,
            state: this._state,
            currentVersion,
            availableVersion: this._availableVersion,
            channel: currentVersion.includes('-beta') ? 'beta' : 'stable',
            autoCheck: settings.updateAutoCheck !== false,
            progress: this._progress,
            lastCheckedAt: this._lastCheckedAt,
            installReady: this._state === 'downloaded',
            error: this._error ? { ...this._error } : null,
        };
    }

    start() {
        if (this._started) return this.status();
        this._started = true;
        this._updater.autoDownload = true;
        this._updater.autoInstallOnAppQuit = true;
        this._updater.allowDowngrade = false;
        this._bindUpdaterEvents();
        this.setAutoCheck(this._storage.get('settings').updateAutoCheck !== false);
        return this.status();
    }

    stop() {
        this._cancelSchedule();
        for (const [event, handler] of this._listeners) this._updater.removeListener(event, handler);
        this._listeners.length = 0;
        this._started = false;
        this._autoCheckEnabled = null;
    }

    setAutoCheck(enabled) {
        const nextEnabled = enabled === true;
        if (this._autoCheckEnabled === nextEnabled) {
            this._emitStatus();
            return this.status();
        }
        this._autoCheckEnabled = nextEnabled;
        this._cancelSchedule();
        if (!nextEnabled || this._reason || !this._started) {
            this._emitStatus();
            return this.status();
        }

        this._initialTimer = this._setTimeout(() => {
            this.check({ manual: false }).catch((error) => {
                this._logger.warn?.(`[update] scheduled check failed (${publicUpdateError(error).code})`);
            });
        }, INITIAL_CHECK_DELAY_MS);
        this._initialTimer?.unref?.();

        this._intervalTimer = this._setInterval(() => {
            this.check({ manual: false }).catch((error) => {
                this._logger.warn?.(`[update] scheduled check failed (${publicUpdateError(error).code})`);
            });
        }, UPDATE_CHECK_INTERVAL_MS);
        this._intervalTimer?.unref?.();
        this._emitStatus();
        return this.status();
    }

    async check({ manual = true } = {}) {
        if (this._reason) return this.status();
        if (['checking', 'downloading'].includes(this._state)) return this.status();
        if (this._state === 'downloaded') return this.status();

        const now = this._now();
        if (manual && this._lastManualCheckAt && now - this._lastManualCheckAt < MANUAL_CHECK_COOLDOWN_MS) {
            throw new UpdateServiceError('UPDATE_RATE_LIMIT', '检查过于频繁，请稍后再试');
        }
        if (manual) this._lastManualCheckAt = now;

        this._setState('checking', { progress: null, error: null });
        try {
            await this._updater.checkForUpdates();
            this._lastCheckedAt = new Date(this._now()).toISOString();
            this._emitStatus();
            return this.status();
        } catch (_) {
            const error = new UpdateServiceError('UPDATE_CHECK_FAILED', '无法连接更新服务，请稍后再试');
            this._setState('error', { error: publicUpdateError(error), progress: null });
            throw error;
        }
    }

    install() {
        if (this._state !== 'downloaded') {
            throw new UpdateServiceError('UPDATE_NOT_READY', '更新尚未下载完成');
        }
        this._updater.quitAndInstall(false, true);
        return { installing: true };
    }

    _bindUpdaterEvents() {
        const on = (event, handler) => {
            this._updater.on(event, handler);
            this._listeners.push([event, handler]);
        };
        on('checking-for-update', () => this._setState('checking', { progress: null, error: null }));
        on('update-available', (info) => {
            this._availableVersion = safeVersion(info);
            this._setState('available', { progress: 0, error: null });
        });
        on('update-not-available', () => {
            this._availableVersion = '';
            this._lastCheckedAt = new Date(this._now()).toISOString();
            this._setState('up-to-date', { progress: null, error: null });
        });
        on('download-progress', (progress) => {
            this._setState('downloading', { progress: clampPercent(progress?.percent), error: null });
        });
        on('update-downloaded', (info) => {
            this._availableVersion = safeVersion(info) || this._availableVersion;
            this._setState('downloaded', { progress: 100, error: null });
            this._promptForInstall().catch(() => {});
        });
        on('error', () => {
            const error = new UpdateServiceError('UPDATE_FAILED', '更新失败，请稍后重试');
            this._setState('error', { progress: null, error: publicUpdateError(error) });
        });
    }

    async _promptForInstall() {
        const version = this._availableVersion || 'new';
        if (this._promptedVersion === version) return;
        this._promptedVersion = version;
        const options = {
            type: 'info',
            title: '更新已准备好',
            message: this._availableVersion ? `Date Night Girl ${this._availableVersion} 已下载完成` : '新版本已下载完成',
            detail: '现在重启即可完成安装；也可以稍后从设置页安装。',
            buttons: ['稍后', '立即重启安装'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
        };
        const parent = this._getParentWindow();
        const result = parent && !parent.isDestroyed?.()
            ? await this._dialog.showMessageBox(parent, options)
            : await this._dialog.showMessageBox(options);
        if (result.response === 1) this.install();
    }

    _setState(state, { progress = this._progress, error = this._error } = {}) {
        this._state = state;
        this._progress = progress;
        this._error = error;
        this._emitStatus();
    }

    _emitStatus() {
        this.emit('status', this.status());
    }

    _cancelSchedule() {
        if (this._initialTimer) this._clearTimeout(this._initialTimer);
        if (this._intervalTimer) this._clearInterval(this._intervalTimer);
        this._initialTimer = null;
        this._intervalTimer = null;
    }
}

module.exports = {
    INITIAL_CHECK_DELAY_MS,
    UPDATE_CHECK_INTERVAL_MS,
    MANUAL_CHECK_COOLDOWN_MS,
    UpdateService,
    UpdateServiceError,
    publicUpdateError,
    getUnavailableReason,
};

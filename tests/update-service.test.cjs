'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
    MANUAL_CHECK_COOLDOWN_MS,
    UpdateService,
    UpdateServiceError,
    publicUpdateError,
    getUnavailableReason,
} = require('../src/main/update-service.cjs');

class FakeUpdater extends EventEmitter {
    constructor(check = async () => {}) {
        super();
        this._check = check;
        this.checks = 0;
        this.installs = 0;
    }

    async checkForUpdates() {
        this.checks += 1;
        return this._check(this);
    }

    quitAndInstall() {
        this.installs += 1;
    }
}

function makeService({
    updater = new FakeUpdater(),
    isPackaged = true,
    platform = 'win32',
    portable = false,
    feedAvailable = true,
    autoCheck = true,
    now = () => 100_000,
    response = 0,
} = {}) {
    const timers = [];
    const cleared = [];
    const storage = { get: () => ({ updateAutoCheck: autoCheck }) };
    const app = { isPackaged, getVersion: () => '1.2.3' };
    const dialog = { showMessageBox: async () => ({ response }) };
    const service = new UpdateService({
        updater,
        app,
        dialog,
        storage,
        platform,
        portable,
        feedAvailable,
        now,
        setTimeoutImpl: (handler, delay) => {
            const timer = { type: 'timeout', handler, delay, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimeoutImpl: (timer) => cleared.push(timer),
        setIntervalImpl: (handler, delay) => {
            const timer = { type: 'interval', handler, delay, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearIntervalImpl: (timer) => cleared.push(timer),
        logger: { warn() {} },
    });
    return { service, updater, timers, cleared };
}

test('update availability excludes development, portable, unsupported and feedless builds', () => {
    assert.equal(getUnavailableReason({ isPackaged: false, platform: 'win32', portable: false, feedAvailable: true }), 'development');
    assert.equal(getUnavailableReason({ isPackaged: true, platform: 'win32', portable: true, feedAvailable: true }), 'portable');
    assert.equal(getUnavailableReason({ isPackaged: true, platform: 'linux', portable: false, feedAvailable: true }), 'unsupported-platform');
    assert.equal(getUnavailableReason({ isPackaged: true, platform: 'win32', portable: false, feedAvailable: false }), 'missing-feed');
    assert.equal(getUnavailableReason({ isPackaged: true, platform: 'win32', portable: false, feedAvailable: true }), '');
});

test('development builds never schedule or contact an update provider', async () => {
    const { service, updater, timers } = makeService({ isPackaged: false });
    const status = service.start();
    assert.equal(status.supported, false);
    assert.equal(status.reason, 'development');
    assert.equal(timers.length, 0);
    await service.check();
    assert.equal(updater.checks, 0);
});

test('supported builds configure secure updater defaults and schedule checks', () => {
    const { service, updater, timers, cleared } = makeService();
    service.start();
    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, true);
    assert.equal(updater.allowDowngrade, false);
    assert.equal(timers.length, 2);
    assert.deepEqual(timers.map((timer) => timer.type), ['timeout', 'interval']);
    service.stop();
    assert.equal(cleared.length, 2);
    assert.equal(updater.listenerCount('update-downloaded'), 0);
});

test('manual checks expose only safe current state and enforce a cooldown', async () => {
    let clock = 100_000;
    const updater = new FakeUpdater(async (instance) => {
        instance.emit('checking-for-update');
        instance.emit('update-not-available', { version: '1.2.3' });
    });
    const { service } = makeService({ updater, now: () => clock });
    service.start();
    const status = await service.check();
    assert.equal(status.state, 'up-to-date');
    assert.equal(status.lastCheckedAt, new Date(clock).toISOString());
    await assert.rejects(() => service.check(), (error) => error.code === 'UPDATE_RATE_LIMIT');
    clock += MANUAL_CHECK_COOLDOWN_MS;
    await service.check();
    assert.equal(updater.checks, 2);
});

test('download progress becomes installable and user confirmation controls restart', async () => {
    const { service, updater } = makeService({ response: 1 });
    service.start();
    updater.emit('update-available', { version: '1.3.0' });
    updater.emit('download-progress', { percent: 63.26 });
    assert.equal(service.status().state, 'downloading');
    assert.equal(service.status().progress, 63.3);
    updater.emit('update-downloaded', { version: '1.3.0' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.status().installReady, true);
    assert.equal(service.status().availableVersion, '1.3.0');
    assert.equal(updater.installs, 1);
});

test('install is rejected before a verified update is downloaded', () => {
    const { service } = makeService();
    service.start();
    assert.throws(() => service.install(), (error) => error.code === 'UPDATE_NOT_READY');
});

test('provider failures are replaced with stable public error messages', async () => {
    const secretError = new Error('token=never-expose-this');
    const updater = new FakeUpdater(async () => { throw secretError; });
    const { service } = makeService({ updater });
    service.start();
    await assert.rejects(() => service.check(), (error) => {
        assert.equal(error.code, 'UPDATE_CHECK_FAILED');
        assert.equal(error.message.includes('never-expose'), false);
        return true;
    });
    assert.deepEqual(publicUpdateError(secretError), {
        code: 'UPDATE_INTERNAL',
        message: '更新服务暂时不可用',
    });
    assert.deepEqual(publicUpdateError(new UpdateServiceError('SAFE', '安全消息')), {
        code: 'SAFE',
        message: '安全消息',
    });
});

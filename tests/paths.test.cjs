'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const appRoot = path.join('C:', 'Program Files', 'DateNightGirl', 'resources', 'app.asar');
const electronStub = {
    app: {
        isPackaged: true,
        getAppPath: () => appRoot,
        getPath: () => path.join('C:', 'Users', 'tester', 'AppData', 'Roaming', 'DateNightGirl'),
    },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'electron') return 'electron-paths-stub';
    return originalResolve.call(this, request, parent, ...rest);
};
require.cache['electron-paths-stub'] = {
    id: 'electron-paths-stub',
    filename: 'electron-paths-stub',
    loaded: true,
    exports: electronStub,
};

const paths = require('../src/main/paths.js');

test('packaged resources resolve inside app.asar instead of nonexistent resources folders', () => {
    assert.equal(paths.getAssetRoot(), path.join(appRoot, 'assets'));
    assert.equal(paths.getRendererDir(), path.join(appRoot, 'src', 'renderer'));
    assert.equal(paths.getRoomDir(), path.join(appRoot, 'src', 'room'));
    assert.equal(paths.getSharedDir(), path.join(appRoot, 'src', 'shared'));
});

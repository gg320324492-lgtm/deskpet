'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const packageJson = require('../package.json');

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
    assert.equal(paths.getIconPath(), path.join(appRoot, 'assets', 'icon.ico'));
    assert.equal(paths.getRendererDir(), path.join(appRoot, 'src', 'renderer'));
    assert.equal(paths.getRoomDir(), path.join(appRoot, 'src', 'room'));
    assert.equal(paths.getSharedDir(), path.join(appRoot, 'src', 'shared'));
});

test('runtime icon is packaged separately from the Windows build resource', () => {
    assert.equal(packageJson.build.win.icon, 'build/icon.ico');
    assert.ok(packageJson.build.files.includes('assets/icon.ico'));
    assert.equal(packageJson.build.extraResources, undefined);
});

test('Windows release artifacts use stable update-safe names', () => {
    assert.equal(
        packageJson.build.nsis.artifactName,
        '${productName}-Setup-${version}.${ext}',
    );
    assert.equal(
        packageJson.build.portable.artifactName,
        '${productName}-Portable-${version}.${ext}',
    );
    assert.equal(packageJson.build.nsis.runAfterFinish, false);
    assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
});

test('Windows installer can close tray-resident builds during an upgrade', () => {
    const installerInclude = fs.readFileSync(
        path.join(__dirname, '..', packageJson.build.nsis.include),
        'utf8',
    );

    assert.match(installerInclude, /!macro customCheckAppRunning/);
    assert.match(installerInclude, /nsProcess::CloseProcess/);
    assert.match(installerInclude, /taskkill\.exe.*\/F.*\/T.*\/IM/);
    assert.ok(installerInclude.indexOf('nsProcess::CloseProcess') < installerInclude.indexOf('taskkill.exe'));
    assert.match(installerInclude, /!macro customInstall/);
    assert.match(installerInclude, /CreateShortCut "\$newStartMenuLink" "\$appExe"/);
    assert.match(installerInclude, /\$PROFILE\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs/);
});

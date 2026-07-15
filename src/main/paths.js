/**
 * paths.js
 * Resource path resolution: compatible with both dev mode and packaged builds.
 *
 * Layouts:
 *   - dev mode:  app.getAppPath() is the project root
 *   - packaged:  app.getAppPath() is resources/app.asar
 *
 * User data directory (settings.json etc.) lives under app.getPath('userData').
 */
const path = require('path');
const { app } = require('electron');

function getAssetRoot() {
    return path.join(app.getAppPath(), 'assets');
}

function getAssetDir() {
    return path.join(getAssetRoot(), 'processed');
}

function getAudioDir() {
    return path.join(getAssetRoot(), 'audio');
}

function getOutfitsDir() {
    return path.join(getAssetRoot(), 'outfits');
}

function getStateManifestPath() {
    return path.join(getAssetRoot(), 'state-manifest.json');
}

function getIconPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'build', 'icon.ico');
    }
    return path.join(__dirname, '..', '..', 'build', 'icon.ico');
}

function getRendererDir() {
    return path.join(app.getAppPath(), 'src', 'renderer');
}

function getRoomDir() {
    return path.join(app.getAppPath(), 'src', 'room');
}

function getSharedDir() {
    return path.join(app.getAppPath(), 'src', 'shared');
}

/** Path for app-specific user data (settings, mood, todos, etc.) */
function getUserDataDir() {
    // app.getPath('userData') returns %APPDATA%/DateNightGirl on Windows
    return app.getPath('userData');
}

module.exports = {
    getAssetRoot,
    getAssetDir,
    getAudioDir,
    getOutfitsDir,
    getStateManifestPath,
    getIconPath,
    getRendererDir,
    getRoomDir,
    getSharedDir,
    getUserDataDir,
};

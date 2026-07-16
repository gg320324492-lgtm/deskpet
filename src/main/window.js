/**
 * Create and manage the transparent pet window, including persisted placement
 * and safe recovery when the active monitor layout changes.
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getIconPath, getRendererDir } = require('./paths');
const { lockDownWebContents } = require('./security');
const {
    clampWindowBounds,
    defaultWindowBounds,
    displayTargetForId,
    displayForSavedPosition,
    isDisplayTarget,
    resolveStartupBounds,
    selectTargetDisplay,
    serializeWindowPosition,
} = require('./window-placement.cjs');

const PET_WIDTH = 320;
const PET_HEIGHT = 360;
const SPRITE_HEIGHT = 220;
const POSITION_SAVE_DELAY_MS = 350;

let petWindow = null;
let ignoreMouse = true;
let placementSettings = {};
let onPositionChanged = () => {};
let positionSaveTimer = null;
const displayListeners = [];

function displaySnapshot() {
    return {
        displays: screen.getAllDisplays(),
        primaryDisplay: screen.getPrimaryDisplay(),
        cursorPoint: screen.getCursorScreenPoint(),
    };
}

function createPetWindow({ settings = {}, persistPosition = () => {} } = {}) {
    placementSettings = { ...settings };
    onPositionChanged = typeof persistPosition === 'function' ? persistPosition : () => {};
    const startup = resolveStartupBounds({
        settings: placementSettings,
        ...displaySnapshot(),
        width: PET_WIDTH,
        height: PET_HEIGHT,
    });
    placementSettings.petDisplayId = startup.displayId;

    const rendererPath = path.join(getRendererDir(), 'index.html');
    petWindow = new BrowserWindow({
        width: PET_WIDTH,
        height: PET_HEIGHT,
        x: startup.x,
        y: startup.y,
        transparent: true,
        frame: false,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        show: false,
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            spellcheck: false,
            safeDialogs: true,
            backgroundThrottling: false,
        },
    });

    lockDownWebContents(petWindow, rendererPath);
    petWindow.loadFile(rendererPath);

    petWindow.once('ready-to-show', () => {
        petWindow.show();
        setIgnoreMouseEvents(true);
    });

    petWindow.on('move', schedulePositionSave);
    wireDisplayRecovery();

    petWindow.on('closed', () => {
        clearPositionSaveTimer();
        unwireDisplayRecovery();
        petWindow = null;
    });

    const sendVisibility = (visible) => {
        if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send('window-visibility', visible);
        }
    };
    petWindow.on('show', () => sendVisibility(true));
    petWindow.on('hide', () => sendVisibility(false));

    petWindow.on('close', (event) => {
        if (!global.appIsQuitting) {
            event.preventDefault();
            petWindow.hide();
        }
    });

    return petWindow;
}

function getPetWindow() {
    return petWindow;
}

function setIgnoreMouseEvents(ignore) {
    if (!petWindow || petWindow.isDestroyed()) return;
    ignoreMouse = ignore;
    petWindow.setIgnoreMouseEvents(ignore, { forward: ignore });
}

function dragBy(dx, dy) {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
}

function moveTo(x, y) {
    if (!petWindow || petWindow.isDestroyed()) return;
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x, y });
    const next = clampWindowBounds({ ...bounds, x, y }, display);
    petWindow.setPosition(next.x, next.y);
}

function setDisplayTarget(target) {
    if (!isDisplayTarget(target)) return false;
    const changed = placementSettings.multiDisplayTarget !== target;
    placementSettings.multiDisplayTarget = target;
    if (!changed || !petWindow || petWindow.isDestroyed()) return changed;

    const snapshot = displaySnapshot();
    const display = selectTargetDisplay({ ...snapshot, target });
    const bounds = defaultWindowBounds(display, PET_WIDTH, PET_HEIGHT);
    petWindow.setBounds(bounds);
    schedulePositionSave();
    return true;
}

function movePetToCursorDisplay() {
    if (!petWindow || petWindow.isDestroyed()) return false;
    const snapshot = displaySnapshot();
    const display = selectTargetDisplay({ ...snapshot, target: 'cursor' });
    petWindow.setBounds(defaultWindowBounds(display, PET_WIDTH, PET_HEIGHT));
    schedulePositionSave();
    return true;
}

function resetPetWindowPosition() {
    if (!petWindow || petWindow.isDestroyed()) return false;
    const snapshot = displaySnapshot();
    const display = selectTargetDisplay({ ...snapshot, target: placementSettings.multiDisplayTarget });
    petWindow.setBounds(defaultWindowBounds(display, PET_WIDTH, PET_HEIGHT));
    schedulePositionSave();
    return true;
}

function getPetWindowStatus() {
    const snapshot = displaySnapshot();
    const primaryId = String(snapshot.primaryDisplay?.id ?? '');
    const displays = snapshot.displays.map((display, index) => ({
        id: String(display.id),
        label: String(display.label || `显示器 ${index + 1}`),
        primary: String(display.id) === primaryId,
        workArea: { ...display.workArea },
    }));
    if (!petWindow || petWindow.isDestroyed()) {
        return { available: false, target: placementSettings.multiDisplayTarget || 'primary', displays };
    }
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    return {
        available: true,
        target: placementSettings.multiDisplayTarget || 'primary',
        displayId: String(display.id),
        displayTarget: displayTargetForId(display.id),
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        displays,
    };
}

function ensurePetWindowVisible() {
    if (!petWindow || petWindow.isDestroyed()) return false;
    const current = petWindow.getBounds();
    const snapshot = displaySnapshot();
    const currentSettings = {
        ...placementSettings,
        petWindowX: current.x,
        petWindowY: current.y,
        petDisplayId: '',
    };
    const liveDisplay = displayForSavedPosition(
        currentSettings,
        snapshot.displays,
        current.width,
        current.height,
    );
    const display = liveDisplay || selectTargetDisplay({
        ...snapshot,
        target: placementSettings.multiDisplayTarget,
    });
    const next = liveDisplay
        ? clampWindowBounds(current, display)
        : defaultWindowBounds(display, current.width, current.height);
    const changed = next.x !== current.x || next.y !== current.y;
    if (changed) petWindow.setBounds(next);
    schedulePositionSave();
    return changed;
}

function schedulePositionSave() {
    clearPositionSaveTimer();
    positionSaveTimer = setTimeout(() => {
        positionSaveTimer = null;
        persistCurrentPosition();
    }, POSITION_SAVE_DELAY_MS);
}

function clearPositionSaveTimer() {
    if (positionSaveTimer != null) clearTimeout(positionSaveTimer);
    positionSaveTimer = null;
}

function persistCurrentPosition() {
    if (!petWindow || petWindow.isDestroyed()) return null;
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const patch = serializeWindowPosition(bounds, display);
    const unchanged = patch.petWindowX === placementSettings.petWindowX
        && patch.petWindowY === placementSettings.petWindowY
        && patch.petDisplayId === String(placementSettings.petDisplayId || '');
    placementSettings = { ...placementSettings, ...patch };
    if (unchanged) return patch;

    try {
        const result = onPositionChanged(patch);
        if (result && typeof result.catch === 'function') {
            result.catch((error) => console.warn('[window] failed to persist position:', error.message));
        }
    } catch (error) {
        console.warn('[window] failed to persist position:', error.message);
    }
    return patch;
}

function flushPetWindowPosition() {
    clearPositionSaveTimer();
    return persistCurrentPosition();
}

function wireDisplayRecovery() {
    unwireDisplayRecovery();
    for (const eventName of ['display-removed', 'display-metrics-changed']) {
        const listener = () => setTimeout(ensurePetWindowVisible, 0);
        screen.on(eventName, listener);
        displayListeners.push([eventName, listener]);
    }
}

function unwireDisplayRecovery() {
    for (const [eventName, listener] of displayListeners.splice(0)) {
        screen.removeListener(eventName, listener);
    }
}

function showWindow() {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (!petWindow.isVisible()) petWindow.show();
}

function hideWindow() {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.hide();
}

function toggleWindow() {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (petWindow.isVisible()) petWindow.hide();
    else { petWindow.show(); petWindow.focus(); }
}

module.exports = {
    createPetWindow,
    ensurePetWindowVisible,
    flushPetWindowPosition,
    getPetWindowStatus,
    getPetWindow,
    setDisplayTarget,
    setIgnoreMouseEvents,
    dragBy,
    moveTo,
    movePetToCursorDisplay,
    resetPetWindowPosition,
    showWindow,
    hideWindow,
    toggleWindow,
    PET_WIDTH,
    PET_HEIGHT,
    SPRITE_HEIGHT,
};

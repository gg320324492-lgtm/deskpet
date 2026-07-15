/**
 * src/main/room-window.js
 *
 * Single BrowserWindow that hosts the "character room" UI.  Tabs are
 * rendered client-side via class toggling (Stats / Achievements / Outfits /
 * Feed / Settings).
 *
 * Rules of thumb:
 *   - One room window at a time.  Re-opening focuses the existing one.
 *   - Persists last-opened tab across launches.
 *   - Hidden to tray when closed, not destroyed.
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getRoomDir, getIconPath } = require('./paths');
const { lockDownWebContents } = require('./security');
const { normalizeRoomTab } = require('./ipc-policy.cjs');

const ROOM_W = 720;
const ROOM_H = 540;

let roomWindow = null;

function createRoomWindow({ initialTab = 'stats' } = {}) {
    initialTab = normalizeRoomTab(initialTab);
    if (roomWindow && !roomWindow.isDestroyed()) {
        roomWindow.show();
        roomWindow.focus();
        roomWindow.webContents.send('room:tab', initialTab);
        return roomWindow;
    }

    // Center on primary display if no prior bounds remembered.
    const display = screen.getPrimaryDisplay();
    const wa = display.workArea;
    const x = Math.round(wa.x + (wa.width  - ROOM_W) / 2);
    const y = Math.round(wa.y + (wa.height - ROOM_H) / 2);

    const roomPath = path.join(getRoomDir(), 'index.html');

    roomWindow = new BrowserWindow({
        width: ROOM_W,
        height: ROOM_H,
        x, y,
        title: '角色房间',
        icon: getIconPath(),
        backgroundColor: '#1c1d2b',
        autoHideMenuBar: true,
        minimizable: true,
        maximizable: true,
        resizable: true,
        show: false,
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
            additionalArguments: ['--room-window', `--room-tab=${initialTab}`],
        },
    });

    lockDownWebContents(roomWindow, roomPath);
    roomWindow.loadFile(roomPath);

    roomWindow.once('ready-to-show', () => {
        roomWindow.show();
    });

    roomWindow.on('closed', () => { roomWindow = null; });

    // Closing the window hides it, doesn't terminate the app
    roomWindow.on('close', (e) => {
        if (!global.appIsQuitting) {
            e.preventDefault();
            roomWindow.hide();
        }
    });

    return roomWindow;
}

function getRoomWindow() {
    if (roomWindow && !roomWindow.isDestroyed()) return roomWindow;
    return null;
}

function sendRoomCommand(cmd, payload) {
    const w = getRoomWindow();
    if (!w) return;
    w.webContents.send(cmd, payload);
}

module.exports = { createRoomWindow, getRoomWindow, sendRoomCommand, ROOM_W, ROOM_H };

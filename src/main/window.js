/**
 * window.js
 * 创建无边框透明宠物窗口。负责：
 *  - 窗口配置（透明、置顶、无边框、跳任务栏）
 *  - 鼠标穿透控制（仅 sprite 不透明区响应点击）
 *  - 拖拽（主进程直接移动窗口，跨屏流畅）
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getAssetDir, getIconPath, getRendererDir } = require('./paths');
const { lockDownWebContents } = require('./security');

const PET_WIDTH = 320;
const PET_HEIGHT = 360;
const SPRITE_HEIGHT = 220;

let petWindow = null;
let ignoreMouse = true;

function createPetWindow() {
    // 启动位置：屏幕右下角偏上
    const display = screen.getPrimaryDisplay();
    const { width: sw } = display.workAreaSize;
    const startX = Math.max(0, sw - PET_WIDTH - 80);
    const startY = 120;

    const rendererPath = path.join(getRendererDir(), 'index.html');

    petWindow = new BrowserWindow({
        width: PET_WIDTH,
        height: PET_HEIGHT,
        x: startX,
        y: startY,
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
        // 默认忽略鼠标（穿透）
        setIgnoreMouseEvents(true);
    });

    petWindow.on('closed', () => {
        petWindow = null;
    });

    // Notify the renderer of visibility changes so it can wake the pet after a
    // long hide (see bootstrap.js onVisibility).
    const sendVisibility = (visible) => {
        if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send('window-visibility', visible);
        }
    };
    petWindow.on('show', () => sendVisibility(true));
    petWindow.on('hide', () => sendVisibility(false));

    // 防止用户误关闭（隐藏到托盘）
    petWindow.on('close', (e) => {
        if (!global.appIsQuitting) {
            e.preventDefault();
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

/**
 * 主进程直接拖拽窗口（不经过渲染层）
 * @param {number} dx 鼠标 X 位移
 * @param {number} dy 鼠标 Y 位移
 */
function dragBy(dx, dy) {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + dx, y + dy);
}

/**
 * 边界限制移动（不超出当前显示器工作区）
 */
function moveTo(x, y) {
    if (!petWindow || petWindow.isDestroyed()) return;
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x, y });
    const wa = display.workArea;
    const nx = Math.max(wa.x, Math.min(x, wa.x + wa.width - bounds.width));
    const ny = Math.max(wa.y, Math.min(y, wa.y + wa.height - bounds.height));
    petWindow.setPosition(nx, ny);
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
    getPetWindow,
    setIgnoreMouseEvents,
    dragBy,
    moveTo,
    showWindow,
    hideWindow,
    toggleWindow,
    PET_WIDTH,
    PET_HEIGHT,
    SPRITE_HEIGHT,
};

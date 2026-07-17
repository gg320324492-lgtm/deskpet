/**
 * main.js
 * Electron 主进程入口。负责：
 *  - 应用生命周期
 *  - 创建宠物窗口
 *  - 注册 IPC 处理
 *  - 创建系统托盘
 *  - 单实例锁（防止多开）
 *  - 初始化持久化层（src/main/storage.js）
 */
const { app, dialog, ipcMain, screen, session } = require('electron');
const fs = require('fs');
const path = require('path');

const {
    createPetWindow,
    getPetWindow,
    setIgnoreMouseEvents,
    dragBy,
    moveTo,
    movePetToCursorDisplay,
    resetPetWindowPosition,
    getPetWindowStatus,
    toggleWindow,
    setDisplayTarget,
    flushPetWindowPosition,
} = require('./window');
const { createTray } = require('./tray');
const { storage } = require('./storage');
const { CredentialVault } = require('./credential-vault.cjs');
const { AiService, publicAiError } = require('./ai-service.cjs');
const { autoUpdater } = require('electron-updater');
const { UpdateService, publicUpdateError } = require('./update-service.cjs');
const { createRoomWindow, getRoomWindow } = require('./room-window');
const {
    assertStoragePatch,
    assertPetState,
    normalizeRoomTab,
    assertBoolean,
    assertFiniteNumber,
} = require('./ipc-policy.cjs');
const { parseBackupSnapshot } = require('../shared/schema.cjs');

const MAX_BACKUP_FILE_BYTES = 2 * 1024 * 1024;
const aiService = new AiService({ storage, vault: new CredentialVault() });
let updateService = null;

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    const win = getPetWindow();
    if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
    }
});

// Windows 高 DPI：避免界面被放大
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// 渲染进程状态（用于托盘菜单与 IPC）
let rendererState = 'idle';

// === IPC 处理 ===

function senderKind(event) {
    const pet = getPetWindow();
    if (pet && !pet.isDestroyed() && event.sender === pet.webContents) return 'pet';
    const room = getRoomWindow();
    if (room && !room.isDestroyed() && event.sender === room.webContents) return 'room';
    return null;
}

function assertSender(event, allowedKinds) {
    const kind = senderKind(event);
    if (!kind || !allowedKinds.includes(kind)) {
        throw new Error(`Unauthorized IPC sender for ${event.type || 'channel'}`);
    }
    return kind;
}

function onFrom(channel, allowedKinds, handler) {
    ipcMain.on(channel, (event, ...args) => {
        try {
            assertSender(event, allowedKinds);
            handler(event, ...args);
        } catch (error) {
            console.warn(`[ipc] rejected ${channel}: ${error.message}`);
        }
    });
}

function handleFrom(channel, allowedKinds, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        assertSender(event, allowedKinds);
        return handler(event, ...args);
    });
}

// 鼠标穿透切换
onFrom('set-ignore-mouse', ['pet'], (_event, ignore) => {
    setIgnoreMouseEvents(assertBoolean(ignore, 'ignore'));
});

// 主进程接管拖拽（避免渲染层延迟）
onFrom('drag-by', ['pet'], (_event, dx, dy) => {
    dragBy(
        assertFiniteNumber(dx, 'dx', { min: -4096, max: 4096 }),
        assertFiniteNumber(dy, 'dy', { min: -4096, max: 4096 }),
    );
});

// 移动到指定坐标（带边界裁剪）
onFrom('move-to', ['pet'], (_event, x, y) => {
    moveTo(assertFiniteNumber(x, 'x'), assertFiniteNumber(y, 'y'));
});

// Show/hide toggle from tray/renderer
onFrom('toggle-window', ['pet'], () => toggleWindow());

// 退出应用
onFrom('quit-app', ['pet'], () => {
    global.appIsQuitting = true;
    app.quit();
});

handleFrom('get-initial-state', ['pet'], () => rendererState);

handleFrom('window:status', ['room'], () => getPetWindowStatus());
handleFrom('window:action', ['room'], (_event, action) => {
    if (action === 'move-to-cursor') return { ok: movePetToCursorDisplay() };
    if (action === 'reset-position') return { ok: resetPetWindowPosition() };
    throw new Error('Unsupported window action');
});

function normalizeFocusCommand(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw new TypeError('Focus command must be an object');
    const action = command.action;
    if (!['start', 'toggle', 'skip', 'stop'].includes(action)) throw new TypeError('Unsupported focus command');
    if (action !== 'start') return { action };
    if (command.task == null) return { action };
    if (!command.task || typeof command.task !== 'object' || Array.isArray(command.task)) throw new TypeError('Focus task must be an object');
    const id = typeof command.task.id === 'string' ? command.task.id.trim() : '';
    const title = typeof command.task.title === 'string' ? command.task.title.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !title || title.length > 120) throw new TypeError('Invalid focus task');
    return { action, task: { id, title } };
}

handleFrom('focus:command', ['room'], (_event, command) => {
    const normalized = normalizeFocusCommand(command);
    const pet = getPetWindow();
    if (!pet || pet.isDestroyed()) return { ok: false, reason: 'pet-unavailable' };
    pet.webContents.send('focus:command', normalized);
    return { ok: true };
});

// === Storage IPC ===

handleFrom('storage:set', ['pet', 'room'], async (_event, domain, patch) => {
    assertStoragePatch(domain, patch);
    return storage.set(domain, patch);
});
handleFrom('storage:list', ['pet', 'room'], () => storage.list());

async function runAiAction(action) {
    try {
        const result = await action();
        return { ok: true, ...result };
    } catch (error) {
        const safe = publicAiError(error);
        console.warn(`[ai] request failed (${safe.code})`);
        return { ok: false, error: safe };
    }
}

handleFrom('ai:status', ['pet', 'room'], () => runAiAction(() => aiService.status()));
handleFrom('ai:configure', ['room'], (_event, config) => runAiAction(() => aiService.configure(config)));
handleFrom('ai:test', ['room'], () => runAiAction(() => aiService.testConnection()));
handleFrom('ai:chat', ['pet'], (_event, prompt) => runAiAction(() => aiService.chat(prompt)));
handleFrom('ai:reset', ['pet'], () => runAiAction(() => aiService.reset()));

async function runUpdateAction(action) {
    try {
        const result = await action();
        return { ok: true, ...result };
    } catch (error) {
        const safe = publicUpdateError(error);
        console.warn(`[update] action failed (${safe.code})`);
        return { ok: false, error: safe };
    }
}

handleFrom('update:status', ['room'], () => runUpdateAction(() => updateService.status()));
handleFrom('update:check', ['room'], () => runUpdateAction(() => updateService.check({ manual: true })));
handleFrom('update:install', ['room'], () => runUpdateAction(() => updateService.install()));

handleFrom('data:export', ['room'], async () => {
    const room = getRoomWindow();
    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(room, {
        title: '导出桌宠数据',
        defaultPath: `DateNightGirl-backup-${date}.json`,
        filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const snapshot = storage.createSnapshot();
    const serialized = JSON.stringify(snapshot, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BACKUP_FILE_BYTES) {
        throw new Error('备份数据超过安全大小限制');
    }
    await fs.promises.writeFile(result.filePath, serialized, { encoding: 'utf8', flag: 'w' });
    return {
        canceled: false,
        fileName: path.basename(result.filePath),
        exportedAt: snapshot.exportedAt,
    };
});

handleFrom('data:import', ['room'], async () => {
    const room = getRoomWindow();
    const picked = await dialog.showOpenDialog(room, {
        title: '导入桌宠数据',
        properties: ['openFile'],
        filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };

    const filePath = picked.filePaths[0];
    try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BACKUP_FILE_BYTES) {
            throw new Error('invalid backup size');
        }
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const snapshot = parseBackupSnapshot(JSON.parse(raw));
        const confirmation = await dialog.showMessageBox(room, {
            type: 'warning',
            title: '确认导入数据',
            message: '导入会覆盖当前桌宠数据',
            detail: '当前数据会先保存为每个数据域的滚动备份。应用中的状态会在导入后立即刷新。',
            buttons: ['取消', '导入并覆盖'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
        });
        if (confirmation.response !== 1) return { canceled: true };
        const imported = storage.importSnapshot(snapshot);
        return { canceled: false, fileName: path.basename(filePath), ...imported };
    } catch (error) {
        console.warn(`[data] rejected import: ${error.message}`);
        throw new Error('备份文件无效、已损坏或超过安全大小限制');
    }
});

// === Room window IPC ===

handleFrom('room:open', ['pet'], (_event, payload = {}) => {
    const tab = normalizeRoomTab(payload && typeof payload === 'object' ? payload.tab : undefined);
    createRoomWindow({ initialTab: tab });
    return { opened: true, tab };
});

storage.on('change', ({ domain, data }) => {
    const targets = [];
    if (getPetWindow() && !getPetWindow().isDestroyed()) targets.push(getPetWindow());
    const r = getRoomWindow();
    if (r && !r.isDestroyed()) targets.push(r);
    for (const win of targets) {
        win.webContents.send('storage:onchanged', { domain, data });
    }
    if (domain === 'settings') {
        updateService?.setAutoCheck(data.updateAutoCheck !== false);
        setDisplayTarget(data.multiDisplayTarget);
    }
});

// === Display / multi-monitor ===

handleFrom('display:bounds', ['pet'], () => {
    const displays = screen.getAllDisplays();
    const primary  = screen.getPrimaryDisplay();
    return {
        workArea:    primary.workArea,
        monitors:    displays.map(d => ({
            id: d.id, x: d.workArea.x, y: d.workArea.y,
            width: d.workArea.width, height: d.workArea.height,
            primary: d.id === primary.id,
        })),
        cursor:      screen.getCursorScreenPoint(),
    };
});

handleFrom('autostart:get', ['pet'], () => app.getLoginItemSettings());
handleFrom('autostart:set', ['pet', 'room'], (_event, enable) => {
    app.setLoginItemSettings({ openAtLogin: assertBoolean(enable, 'enable') });
    return app.getLoginItemSettings();
});

function broadcastState(state) {
    const win = getPetWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send('state-from-tray', state);
    }
}

// === 应用生命周期 ===

app.whenReady().then(async () => {
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

    // Storage must be initialized before the renderer asks for state.
    await storage.init();

    updateService = new UpdateService({
        updater: autoUpdater,
        app,
        dialog,
        storage,
        feedAvailable: fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')),
        getParentWindow: () => getRoomWindow() || getPetWindow(),
    });
    updateService.on('status', (status) => {
        const room = getRoomWindow();
        if (room && !room.isDestroyed()) room.webContents.send('update:onstatus', status);
    });
    updateService.start();

    createPetWindow({
        settings: storage.get('settings'),
        persistPosition: (patch) => storage.set('settings', patch),
    });

    // 托盘菜单选择状态时通过 broadcastState 通知渲染进程
    createTray(async (stateOrCmd) => {
        // Tray now sends `__cmd:*` strings for commands, plain state ids otherwise.
        if (typeof stateOrCmd === 'string' && stateOrCmd.startsWith('__cmd:')) {
            const win = getPetWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send('tray:command', stateOrCmd.slice('__cmd:'.length));
            }
            return;
        }
        try {
            rendererState = assertPetState(stateOrCmd);
            broadcastState(rendererState);
        } catch (error) {
            console.warn(`[tray] ignored invalid state: ${error.message}`);
        }
    });

    // 不要在所有窗口关闭时退出（托盘仍在运行）
    app.on('window-all-closed', (e) => {
        e.preventDefault();
    });
});

app.on('before-quit', () => {
    global.appIsQuitting = true;
    flushPetWindowPosition();
    storage.flushAll();
});

app.on('will-quit', () => {
    updateService?.stop();
    // storage.js attaches its own before-quit listener for atomic flush.
});

/**
 * preload.js
 *
 * Secure bridge: contextIsolation mode exposes only the surface needed by
 * the renderer through `window.petAPI`.
 *
 * Channels follow `domain:verb` (defined in src/shared/ipc-channels.js)
 * for everything added after v1.1. Legacy kebab-case channels are kept
 * to avoid churn on existing wiring.
 *
 * The same preload is used by both the pet window and the room window;
 * the room window simply calls the same APIs against the same userData
 * storage.  No window-specific channel is needed.
 */
const { contextBridge, ipcRenderer } = require('electron');

const isRoom = process.argv.includes('--room-window');
const ROOM_TABS = new Set(['stats', 'achievements', 'outfits', 'feed', 'settings']);
const roomTabArg = process.argv.find((value) => value.startsWith('--room-tab='));
const requestedRoomTab = roomTabArg?.slice('--room-tab='.length);
const initialRoomTab = ROOM_TABS.has(requestedRoomTab) ? requestedRoomTab : 'stats';

function subscribe(channel, handler) {
    if (typeof handler !== 'function') throw new TypeError('IPC subscription requires a function');
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

const commonAPI = {
    storageSet:      (domain, patch) => ipcRenderer.invoke('storage:set', domain, patch),
    storageList:     ()              => ipcRenderer.invoke('storage:list'),
    autostartSet:    (enable)        => ipcRenderer.invoke('autostart:set', enable),
    aiStatus:        ()              => ipcRenderer.invoke('ai:status'),
    onStorageChange: (handler)       => subscribe('storage:onchanged', handler),
    context: Object.freeze({ isRoom, initialRoomTab }),
};

const roomAPI = {
    ...commonAPI,
    onRoomTab:  (handler) => subscribe('room:tab', handler),
    dataExport: ()        => ipcRenderer.invoke('data:export'),
    dataImport: ()        => ipcRenderer.invoke('data:import'),
    aiConfigure: (config) => ipcRenderer.invoke('ai:configure', config),
    aiTest: ()            => ipcRenderer.invoke('ai:test'),
    updateStatus: ()      => ipcRenderer.invoke('update:status'),
    updateCheck: ()       => ipcRenderer.invoke('update:check'),
    updateInstall: ()     => ipcRenderer.invoke('update:install'),
    onUpdateStatus: (handler) => subscribe('update:onstatus', handler),
    windowStatus: ()       => ipcRenderer.invoke('window:status'),
    windowAction: (action) => ipcRenderer.invoke('window:action', action),
    focusCommand: (command) => ipcRenderer.invoke('focus:command', command),
};

const petAPI = {
    ...commonAPI,
    setIgnoreMouse:  (ignore)  => ipcRenderer.send('set-ignore-mouse', ignore),
    dragBy:          (dx, dy)   => ipcRenderer.send('drag-by', dx, dy),
    moveTo:          (x, y)     => ipcRenderer.send('move-to', x, y),
    toggleWindow:    ()         => ipcRenderer.send('toggle-window'),
    quitApp:         ()         => ipcRenderer.send('quit-app'),
    getInitialState: ()         => ipcRenderer.invoke('get-initial-state'),
    getDisplayBounds:()         => ipcRenderer.invoke('display:bounds'),
    autostartGet:    ()         => ipcRenderer.invoke('autostart:get'),
    openRoom:        (payload)  => ipcRenderer.invoke('room:open', payload || {}),
    aiChat:          (prompt)   => ipcRenderer.invoke('ai:chat', prompt),
    aiReset:         ()         => ipcRenderer.invoke('ai:reset'),
    onStateFromTray: (handler)  => subscribe('state-from-tray', handler),
    onVisibility:    (handler)  => subscribe('window-visibility', handler),
    onTrayCommand:   (handler)  => subscribe('tray:command', handler),
    onFocusCommand:  (handler)  => subscribe('focus:command', handler),
};

contextBridge.exposeInMainWorld('petAPI', Object.freeze(isRoom ? roomAPI : petAPI));

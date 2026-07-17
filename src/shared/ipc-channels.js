/**
 * src/shared/ipc-channels.js
 *
 * Single source of truth for IPC channel names.
 * Use Node `require('../shared/ipc-channels')` in main process;
 * the renderer imports via `<script type="module">` from src/renderer/.
 *
 * Convention: <domain>:<verb> in lowercase.
 * Legacy kebab-case channels (set-ignore-mouse, drag-by, etc.) are
 * intentionally kept to avoid churn — new channels follow the convention.
 */

export const IPC = Object.freeze({
    // ---- Legacy (kept as-is for backwards compat) ----
    SET_IGNORE_MOUSE: 'set-ignore-mouse',
    DRAG_BY:          'drag-by',
    MOVE_TO:          'move-to',
    SET_STATE:        'set-state',
    QUIT_APP:         'quit-app',
    GET_INITIAL_STATE:'get-initial-state',
    STATE_FROM_TRAY:  'state-from-tray',
    WINDOW_VISIBILITY:'window-visibility',
    TOGGLE_WINDOW:    'toggle-window',

    // ---- Storage ----
    STORAGE_GET:      'storage:get',
    STORAGE_SET:      'storage:set',
    STORAGE_LIST:     'storage:list',
    STORAGE_ONCHANGE: 'storage:onchanged',   // main -> renderer event

    // ---- Pomodoro ----
    POMODORO_START:   'pomodoro:start',
    POMODORO_PAUSE:   'pomodoro:pause',
    POMODORO_RESUME:  'pomodoro:resume',
    POMODORO_STOP:    'pomodoro:stop',
    POMODORO_TICK:    'pomodoro:tick',      // main -> renderer event
    POMODORO_PHASE:   'pomodoro:phase',     // main -> renderer event
    POMODORO_STATE:   'pomodoro:state',     // invoke
    FOCUS_COMMAND:    'focus:command',      // room -> pet command relay

    // ---- Todos ----
    TODOS_ADD:        'todos:add',
    TODOS_UPDATE:     'todos:update',
    TODOS_DELETE:     'todos:delete',
    TODOS_COMPLETE:   'todos:complete',
    TODOS_LIST:       'todos:list',
    TODOS_ONCHANGE:   'todos:onchanged',

    // ---- Reminders ----
    REMINDERS_GET:    'reminders:get',
    REMINDERS_SET:    'reminders:set',
    REMINDERS_FIRE:   'reminders:fire',     // main -> renderer event
    REMINDERS_SNOOZE: 'reminders:snooze',

    // ---- DND ----
    DND_TOGGLE:       'dnd:toggle',
    DND_STATE:        'dnd:state',          // invoke
    DND_ONCHANGE:     'dnd:onchanged',

    // ---- Affinity / achievements / stats ----
    AFFINITY_DELTA:   'affinity:delta',     // renderer -> main
    ACHIEVEMENT_UNLOCK:'achievement:unlock',
    STATS_UPDATE:     'stats:update',

    // ---- Mood ----
    MOOD_GET:         'mood:get',
    MOOD_PATCH:       'mood:patch',
    MOOD_TICK:        'mood:tick',          // renderer-internal, no IPC

    // ---- Wardrobe / outfit ----
    WARDROBE_LIST:    'wardrobe:list',
    WARDROBE_SET:     'wardrobe:set',
    WARDROBE_ONCHANGE:'wardrobe:onchanged',

    // ---- Room window ----
    ROOM_OPEN:        'room:open',
    ROOM_CLOSE:       'room:close',
    ROOM_TAB:         'room:tab',           // renderer -> renderer event

    // ---- AI chat ----
    AI_CHAT:          'ai:chat',
    AI_BACKENDS:      'ai:backends',
    AI_SET_BACKEND:   'ai:set-backend',

    // ---- Settings / preferences ----
    SETTINGS_GET:     'settings:get',
    SETTINGS_SET:     'settings:set',
    SETTINGS_ONCHANGE:'settings:onchanged',
    SETTINGS_AUTOSTART:'settings:autostart', // renderer -> main

    // ---- Onboarding ----
    ONBOARDING_NEEDED:'onboarding:needed',
    ONBOARDING_DONE:  'onboarding:done',

    // ---- Diagnostic ----
    DIAG:             'diag:info',
});

// Channel categories for monitoring / docs.
export const CHANNEL_GROUPS = Object.freeze({
    'legacy': [
        IPC.SET_IGNORE_MOUSE, IPC.DRAG_BY, IPC.MOVE_TO, IPC.SET_STATE,
        IPC.QUIT_APP, IPC.GET_INITIAL_STATE, IPC.STATE_FROM_TRAY,
        IPC.WINDOW_VISIBILITY, IPC.TOGGLE_WINDOW,
    ],
    'storage': [IPC.STORAGE_GET, IPC.STORAGE_SET, IPC.STORAGE_LIST, IPC.STORAGE_ONCHANGE],
    'pomodoro': [
        IPC.POMODORO_START, IPC.POMODORO_PAUSE, IPC.POMODORO_RESUME,
        IPC.POMODORO_STOP, IPC.POMODORO_TICK, IPC.POMODORO_PHASE, IPC.POMODORO_STATE, IPC.FOCUS_COMMAND,
    ],
    'todos': [
        IPC.TODOS_ADD, IPC.TODOS_UPDATE, IPC.TODOS_DELETE,
        IPC.TODOS_COMPLETE, IPC.TODOS_LIST, IPC.TODOS_ONCHANGE,
    ],
    'reminders': [IPC.REMINDERS_GET, IPC.REMINDERS_SET, IPC.REMINDERS_FIRE, IPC.REMINDERS_SNOOZE],
    'dnd': [IPC.DND_TOGGLE, IPC.DND_STATE, IPC.DND_ONCHANGE],
    'ai': [IPC.AI_CHAT, IPC.AI_BACKENDS, IPC.AI_SET_BACKEND],
    'room': [IPC.ROOM_OPEN, IPC.ROOM_CLOSE, IPC.ROOM_TAB],
    'settings': [IPC.SETTINGS_GET, IPC.SETTINGS_SET, IPC.SETTINGS_ONCHANGE, IPC.SETTINGS_AUTOSTART],
});

// CommonJS mirror for the main process. Both refer to the same strings.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IPC, CHANNEL_GROUPS };
}

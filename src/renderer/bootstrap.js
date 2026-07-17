/**
 * bootstrap.js
 *
 * Renderer entry.  Wires up:
 *   - storage hydration (settings, mood, todos, pomodoro, reminders,
 *     memory, achievements, stats) with on-disk listener
 *   - state machine + sprite loader + animator
 *   - behavior-arbiter (priority dispatcher)
 *   - popover host
 *   - pomodoro timer (state, IPC, persistence)
 *   - reminders engine (water/sit/eye + customs)
 *   - todo list
 *   - DND controller (manual + auto heuristic)
 *   - idle watcher with powerMonitor-aware hooks
 *   - right-click menu (4-group) + tray command routing
 *   - mouse pass-through for sprite hit-test
 *   - time-of-day greeting bubbles
 *   - reactivity to storage:onchanged for live settings updates
 *
 * Future phases add: dialogue.js, sound.js, mood.js, achievements.js,
 * ai-chat.js, room window.
 */
import {
    PetStateMachine,
    STATES,
    TEMP_DURATIONS,
} from './state-machine.js';
import {
    ALL_STATES,
    MENU_GROUPS,
    isAllowed,
} from './state-catalog.mjs';
import { spriteLoader } from './sprite-loader.js';
import { Animator } from './animator.js';
import { Interaction } from './interaction.js';
import { IdleWatcher } from './idle-watcher.js';
import { Popover } from './popover.js';
import { BehaviorArbiter } from './behavior-arbiter.js';
import { PomodoroTimer } from './pomodoro.js';
import { FocusFlow } from './focus-flow.js';
import { ReminderEngine } from './reminders.js';
import { TodoList } from './todo.js';
import { DndController } from './dnd.js';
import { SceneController } from './scene-controller.js';
import { SoundManager } from './sound.js';
import { Dialogue } from './dialogue.js';
import { MoodEngine } from './mood.js';
import { AffinityEngine } from './affinity.js';
import { AchievementEngine, ACHIEVEMENTS } from './achievements.js';
import { MemoryEngine } from './memory.js';
import { Wardrobe } from './wardrobe.js';
import { AiChat } from './ai-chat.js';
import { runOnboarding } from './onboarding.js';
import { S, interpolate } from './strings.js';

const TIME_GREETINGS = [
    { start: 5,  end: 9,  text: '早上好~',           mood: 'mood-morning', period: 'morning' },
    { start: 12, end: 14, text: '该吃饭啦 🍱',       mood: 'mood-morning', period: 'lunch' },
    { start: 18, end: 22, text: '晚上好 ☕',         mood: 'mood-night',   period: 'evening' },
];

async function main() {
    const root = document.getElementById('pet');
    const spriteEl = root.querySelector('.pet-sprite');

    // 1. Hydrate storage (main process writes JSON files in userData)
    const allSettings = await window.petAPI.storageList();
    applySettingsToStorageShape(allSettings);

    const cache = new Map(Object.entries(allSettings));   // domain -> data
    const getSettings = () => Object.fromEntries(cache);
    const setSettings  = async (patch) => {
        // patch: { domain: partialObject }
        for (const [dom, p] of Object.entries(patch)) {
            const cur = cache.get(dom) || {};
            const next = { ...cur, ...(p || {}) };
            cache.set(dom, next);
            try { await window.petAPI.storageSet(dom, p); } catch (_) {}
        }
    };

    // 2. Sound + dialogue + personality (mood, affinity, achievements, memory)
    const sound = new SoundManager({
        basePath: '../../assets/audio',
        getSettings: () => cache.get('settings') || {},
    });
    sound.preload();
    const dialogue = new Dialogue();

    // 3. Mood engine (5 trackers) — started below after storage is ready
    const mood = new MoodEngine({
        getSettings: () => cache.get('mood') || {},
        setSettings: async (patch) => setSettings(patch),
    });

    const affinity = new AffinityEngine({
        getMood: () => mood.snapshot(),
        setMood: async (next) => setSettings({ mood: next }),
        achievements: null, // wired after achievements
    });

    const achievements = new AchievementEngine({
        getSettings: () => cache.get('achievements') || {},
        setSettings: async (patch) => setSettings(patch),
    });
    // Late-bind achievements into affinity
    affinity._achievements = achievements;

    const memory = new MemoryEngine({
        getSettings: () => cache.get('memory') || {},
        setSettings: async (patch) => setSettings(patch),
    });

    // 4. Wardrobe
    const wardrobe = new Wardrobe({
        getSettings: () => cache.get('settings') || {},
        setSettings: async (p) => setSettings(p),
        spriteLoader,
    });

    // 5. AI chat. Remote requests are delegated to the credential-isolated
    // main process; this sandboxed renderer never receives an API key.
    const aiChat = new AiChat({
        dialogue,
        getMood: () => mood.snapshot(),
        getMemory: () => memory.prefs(),
        remoteChat: (prompt) => window.petAPI.aiChat(prompt),
        remoteReset: () => window.petAPI.aiReset(),
    });
    await syncAiBackend(aiChat);

    // 2. Load sprites (after catalog presence)
    await spriteLoader.preload();
    // Apply the active outfit setting after sprites load
    await wardrobe.loadActive();

    // 3. Init state machine
    const initial = await window.petAPI.getInitialState();
    const sm = new PetStateMachine(
        Object.values(STATES).includes(initial) ? initial : STATES.IDLE
    );
    // Feed state changes into the AI chat context and matching sound cue.
    // (Must be after `sm` exists.)
    sm.onChange((next) => aiChat.noteState(next));
    sm.onChange((next) => sound.playForState(next));

    // 4. Animator
    const animator = new Animator(root, sm);

    // 5. Idle watcher (sleeper / micro-peek / work-idle)
    const idleWatcher = new IdleWatcher(sm);

    // 6. Popover host
    const popover = new Popover(root);

    // 7. Pomodoro
    const pomodoro = new PomodoroTimer({
        getSettings: () => ({ pomodoro: cache.get('pomodoro') }),
        setSettings: (p) => setSettings(p),
        onBubble: (text) => animator.setBubbleText(text),
    });

    // 8. Reminders — bubbles come from Dialogue when possible
    const reminders = new ReminderEngine({
        getSettings: () => ({
            settings: cache.get('settings') || {},
            reminders: cache.get('reminders') || {},
        }),
        setSettings: (p) => setSettings(p),
        onBubble: (text) => animator.setBubbleText(text),
        onFire: (info) => {
            // Pick a more conversational line for the kind of reminder
            const line = dialogue.reminder(info.id);
            if (line) animator.setBubbleText(line);
            sound.play(info.id === 'water' ? 'water' : 'chime');
            window.dispatchEvent(new CustomEvent('reminder:fire', { detail: info }));
        },
        popover,
        dialogue,
    });

    // 9. Todo list
    const todoList = new TodoList({
        getSettings: () => ({ todos: cache.get('todos') || { items: [] } }),
        setSettings: (p) => setSettings(p),
        onAfterChange: ({ kind, id }) => {
            if (kind === 'complete') {
                sm.transitionTo(STATES.CHEER);
                setTimeout(() => sm.transitionTo(STATES.IDLE), TEMP_DURATIONS[STATES.CHEER] || 2000);
            }
        },
    });

    // 10. Behavior arbiter
    const arbiter = new BehaviorArbiter(sm);

    // Register reminder source (priorityClass 'reminder')
    arbiter.registerSource({
        id: 'reminders',
        priorityClass: 'reminder',
        weight: 8,
        tryFire: () => null,    // reminders fire their own bubbles via onBubble
    });

    // 11. DND controller
    const dnd = new DndController({
        getSettings: () => ({ settings: cache.get('settings') || {} }),
        setSettings: (p) => setSettings(p),
        behaviorArbiter: arbiter,
        sound,                     // Phase 3: mute sound under DND
        reminders,
        onChange: ({ manual, scheduled, effective }) => {
            const message = effective
                ? (scheduled && !manual ? '已进入定时勿扰' : '进入勿扰模式')
                : '已退出勿扰';
            animator.setBubbleText(message);
            setTimeout(() => sm.transitionTo(STATES.IDLE), 1500);
        },
    });
    dnd.start();

    const scene = new SceneController({
        getSettings: () => ({ settings: cache.get('settings') || {} }),
        onChange: (status, { notify }) => {
            const settings = cache.get('settings') || {};
            arbiter.setEnabled((status.autonomyLevel || settings.autonomyLevel) !== 'low');
            dnd.syncFromSettings({ sceneActive: status.dnd, source: 'scene', notify: false });
            if (notify) animator.setBubbleText(`已切换到${status.label}`);
        },
    });
    scene.start();

    const focusFlow = new FocusFlow({
        pomodoro,
        scene,
        todoList,
        onNotice: (text) => animator.setBubbleText(text),
    });

    // 12. Right-click menu — extra groups filled in
    const extraGroups = buildExtraMenuGroups({ pomodoro, focusFlow, todoList, reminders, dnd });

    // 13. Interaction
    const interaction = new Interaction(root, sm, idleWatcher, {
        actionHandlers: buildActionHandlers({ pomodoro, focusFlow, todoList, reminders, dnd, popover, animator, getSettings, setSettings, allSettings, cache, root, wardrobe, aiChat, sm, dialogue, mood, memory }),
        extraMenuGroups: extraGroups,
    });

    // Sync state class
    sm.onChange((next) => interaction.syncStateClass(next));
    interaction.syncStateClass(sm.state);

    // Pass user input into arbiter so ambient bubbles don't fire mid-action.
    interaction.onUserInput(() => arbiter.notifyUserActivity(8_000));

    // 14. Focus root on user click for keyboard
    root.addEventListener('mousedown', () => root.focus(), true);

    // 15. Tray / main process event routes
    window.petAPI.onStateFromTray((state) => sm.transitionTo(state));
    window.petAPI.onTrayCommand((cmd) => handleTrayCommand(cmd, {
        pomodoro, focusFlow, todoList, reminders, dnd, scene, sm, animator, popover, getSettings, setSettings, allSettings, cache,
    }));
    window.petAPI.onFocusCommand((command) => focusFlow.command(command));
    window.petAPI.onVisibility((visible) => {
        if (visible && sm.state === STATES.SLEEP) {
            // Wake the pet when window becomes visible after long hide.
            sm.transitionTo(STATES.IDLE);
        }
    });

    // 16. Mouse pass-through (alpha-mask hit test)
    setupMouseHitTest(root, sm, spriteEl);

    // 17. Time-of-day greeting (kept from v1.0; reuses animator.showTimeGreeting)
    let lastGreeting = null;
    setInterval(() => maybeGreet(animator, () => lastGreeting, (p) => lastGreeting = p), 60_000);
    setTimeout(() => maybeGreet(animator, () => lastGreeting, (p) => lastGreeting = p), 3000);

    // 18. React to external storage changes
    window.petAPI.onStorageChange(async ({ domain, data }) => {
        cache.set(domain, data);
        if (domain === 'settings') {
            applyLiveSettings(data, { interaction, arbiter, dnd, scene });
            syncAiBackend(aiChat).catch(() => {});
            if (Object.hasOwn(data, 'outfit')) {
                await wardrobe.loadActive();
                animator.renderCurrent();
            }
        }
    });

    // 19. Initial render — paint the sprite for whatever state we booted into.
    // (transitionTo(sm.state) is a no-op since next === current, so it never
    //  fired the animator; render explicitly instead.)
    animator.renderCurrent();

    // 20. Start mood engine (60s decay tick)
    mood.start();

    // 21. Persona event hooks
    let clickCount = 0;
    interaction.onUserInput(async () => {
        clickCount++;
        if (clickCount >= 5) {
            achievements.unlock(ACHIEVEMENTS.SECRET_FIVE_IN_ROW.id, { source: 'combo', n: 5 });
            clickCount = 0;
        }
        mood.onUserClick().catch(() => {});
        affinity.bump(0.5, 'click').catch(() => {});
    });

    let previousPomodoroPhase = pomodoro.snapshot().phase;
    let pomodoroFocusActive = false;
    pomodoro.onChange(() => {
        const snap = pomodoro.snapshot();
        if (snap.phase === previousPomodoroPhase) return;

        if (snap.phase === 'work') {
            sound.play('pomodoroStart');
            if (!pomodoroFocusActive) mood.onPomodoroStart().catch(() => {});
            pomodoroFocusActive = true;
        }
        if (snap.phase === 'rest' || snap.phase === 'longRest') {
            sound.play('pomodoroEnd');
            if (pomodoroFocusActive) mood.onPomodoroEnd().catch(() => {});
            pomodoroFocusActive = false;
        }
        if (snap.phase === 'idle') {
            if (previousPomodoroPhase === 'rest' || previousPomodoroPhase === 'longRest') {
                sound.play('pomodoroEnd');
            }
            if (pomodoroFocusActive) mood.onPomodoroEnd().catch(() => {});
            pomodoroFocusActive = false;
        }
        previousPomodoroPhase = snap.phase;
    });

    // Todo completion side-effects (CHEER + return-to-IDLE) are handled in the
    // TodoList onAfterChange hook wired above.

    achievements.onUnlock((info) => {
        sound.play('chime');
        animator.setBubbleText(`🏆 ${info.label}`);
    });
    achievements.unlock(ACHIEVEMENTS.FIRST_BOOT.id, { source: 'boot' });

    // Greet on first launch (use S.NICKNAME template) and run onboarding wizard
    if (!cache.get('settings')?.onboardingDone) {
        setTimeout(() => {
            runOnboarding({
                root,
                getSettings: () => cache.get('settings') || {},
                setSettings: async (p) => setSettings(p),
                popover,
                autostartGet: () => window.petAPI.autostartGet(),
                autostartSet: (enable) => window.petAPI.autostartSet(enable),
                animator,
            });
        }, 3500);
    }

    // Debug handle
    window.__sm = sm;
    window.__pet = { animator, idleWatcher, interaction, popover, pomodoro, focusFlow, reminders, todoList, dnd, scene, sound, dialogue, mood, affinity, achievements, memory, wardrobe, cache };
    console.log('[pet] Date Night Girl v2 ready (18 states + mood + affinity + achievements + room).');
}

// ============================================================================
// Helpers
// ============================================================================

function applySettingsToStorageShape(allSettings) {
    // Defensive: some domains might be missing from disk on first launch.
    for (const k of ['settings','mood','todos','pomodoro','reminders','memory','achievements','stats']) {
        if (!allSettings[k]) allSettings[k] = {};
    }
}

function applyLiveSettings(settings, { interaction, arbiter, dnd, scene }) {
    const sceneStatus = scene?.sync({ notify: false });
    if ('autonomyLevel' in settings || sceneStatus) {
        arbiter.setEnabled((sceneStatus?.autonomyLevel || settings.autonomyLevel) !== 'low');
    }
    if (['dndManual', 'dndAutoEnabled', 'dndHoursStart', 'dndHoursEnd', 'sceneMode', 'sceneAutoEnabled', 'sceneAutoPreset', 'sceneAutoStart', 'sceneAutoEnd']
        .some((key) => Object.hasOwn(settings, key))) {
        dnd.syncFromSettings({ sceneActive: !!sceneStatus?.dnd, notify: false });
    }
}

async function syncAiBackend(aiChat) {
    const status = await window.petAPI.aiStatus();
    const remoteReady = status?.ok && status.configured;
    aiChat.setRemoteAvailable(remoteReady);
    const requested = remoteReady && status.backend === 'openai-compatible'
        ? 'openai-compatible'
        : 'local-template';
    await aiChat.setBackend(requested);
}

function setupMouseHitTest(root, sm, spriteEl) {
    window.petAPI.setIgnoreMouse(true);
    // While an injected overlay (right-click menu / popover) is open the window
    // must stay clickable. Otherwise moving the cursor off the sprite's opaque
    // pixels — or onto the menu, which sits above #pet as a body-level sibling —
    // fires mousemove/mouseleave here, flips the window back to click-through,
    // and the overlay silently stops receiving clicks.
    const overlayOpen = () =>
        document.getElementById('pet-context-menu') ||
        document.getElementById('pet-popover');
    root.addEventListener('mousemove', (e) => {
        if (overlayOpen()) { window.petAPI.setIgnoreMouse(false); return; }
        const rect = spriteEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            window.petAPI.setIgnoreMouse(true);
            return;
        }
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = spriteLoader.hitTest(sm.state, x, y, rect.width, rect.height);
        window.petAPI.setIgnoreMouse(!hit);
    });
    root.addEventListener('mouseleave', () => {
        if (overlayOpen()) return;
        window.petAPI.setIgnoreMouse(true);
    });
}

function maybeGreet(animator, getter, setter) {
    const h = new Date().getHours();
    for (const g of TIME_GREETINGS) {
        if (h >= g.start && h < g.end) {
            if (getter() !== g.period) {
                animator.showTimeGreeting(g.text, g.mood);
                setter(g.period);
            }
            return;
        }
    }
    if (h >= 22 || h < 5) {
        if (getter() !== 'night') setter('night');
    }
}

function buildExtraMenuGroups({ pomodoro, focusFlow, todoList, dnd }) {
    return [
        {
            label: '互动',
            items: [
                { id: 'interact:greet',   label: '打个招呼',    shortcut: '👋' },
                { id: 'interact:ask',     label: '问她一句话',  shortcut: '💬' },
                { id: 'interact:feed',    label: '喂食',        shortcut: '🍰' },
                { id: 'interact:random',  label: '随机动作',    shortcut: '🎲' },
            ],
        },
        {
            label: '效率',
            items: [
                { id: 'pomo:start',     label: '开始番茄钟',  shortcut: '⏱' },
                { id: 'pomo:toggle',    label: '暂停 / 继续', shortcut: '⏸' },
                { id: 'pomo:skip',      label: '跳过当前阶段', shortcut: '⏭' },
                { id: 'pomo:stop',      label: '结束番茄钟',  shortcut: '⏹' },
                { id: 'todo:open',      label: '今日待办',    shortcut: '☐' },
                { id: 'remind:water',   label: '提醒我喝水',  shortcut: '💧' },
                { id: 'remind:eye',     label: '眼睛休息',    shortcut: '👁' },
            ],
        },
        {
            label: '角色',
            items: [
                { id: 'room:open',         label: '打开角色房间',  shortcut: '🏠', target: 'stats' },
                { id: 'room:todos',        label: '房间里的待办',  shortcut: '☐',  target: 'feed' },
                { id: 'room:achievements', label: '查看成就',      shortcut: '🏆', target: 'achievements' },
                { id: 'character:feed',    label: '喂食（系统状态良好）', shortcut: '🍰' },
            ],
        },
        {
            label: '设置',
            items: [
                { id: 'settings:dnd',      label: dnd.snapshot().manual ? '退出勿扰' : '进入勿扰', shortcut: '🌙' },
                { id: 'settings:open',     label: '偏好设置',      shortcut: '⚙' },
            ],
        },
    ];
}

function buildActionHandlers({ pomodoro, focusFlow, todoList, reminders, dnd, popover, animator, getSettings, setSettings, cache, root, wardrobe, aiChat, sm, dialogue, mood, memory }) {
    return {
        // Interact
        'interact:greet':   () => {
            const line = dialogue.pick({ state: STATES.IDLE, mood: mood.snapshot().mood });
            animator.setBubbleText(line || '嗨~');
        },
        'interact:ask':     () => openAskPopover({ aiChat, popover, animator, memory }),
        'interact:feed':    () => {
            sm.transitionTo(STATES.EAT);
            mood.onFeed().catch(() => {});
        },
        'interact:random':  () => {
            // Only pick states that are actually reachable from the current one,
            // otherwise transitionTo silently no-ops and the action looks broken.
            const candidates = ['walk','sit','cheer','think','peek','yawn','eat']
                .filter(s => isAllowed(sm.state, s));
            if (!candidates.length) return;
            const pick = candidates[(Math.random() * candidates.length) | 0];
            sm.transitionTo(pick);
        },

        // Productivity
        'dnd:toggle':         () => dnd.toggle(),
        'pomo:start':         () => focusFlow.start(),
        'pomo:toggle':        () => focusFlow.togglePause(),
        'pomo:skip':          () => focusFlow.skip(),
        'pomo:stop':          () => focusFlow.stop(),
        'todo:open':          () => openTodoPopover({ todoList, focusFlow, popover }),
        'remind:water':       () => reminders.fireNow('water'),
        'remind:eye':         () => reminders.fireNow('eye'),

        // Room
        'room:open':          (dataset) => window.petAPI.openRoom({ tab: dataset?.target || 'stats' }),
        'room:todos':         () => window.petAPI.openRoom({ tab: 'feed' }),
        'room:achievements':  () => window.petAPI.openRoom({ tab: 'achievements' }),
        'character:feed':     () => {
            sm.transitionTo(STATES.EAT);
            mood.onFeed().catch(() => {});
        },

        // Settings
        'settings:dnd':       () => dnd.toggle(),
        'settings:open':      () => openSettingsPopover({ cache, setSettings, popover, root }),
    };
}

async function openAskPopover({ aiChat, popover, animator, memory }) {
    const { close, host } = popover.open({
        html: `
            <div style="font-weight:700;margin-bottom:6px">问她一句话</div>
            <input id="ai-input" placeholder="想问什么…" style="width:100%;padding:6px;border-radius:6px;border:1px solid #ddd"/>
            <div id="ai-reply" style="margin-top:8px;font-size:13px;color:#555;min-height:18px"></div>
            <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
                <button data-act="send">发送</button>
                <button data-act="forget" title="忘记这一段对话">清空</button>
            </div>
            <div style="opacity:.5;font-size:10px;margin-top:6px">本地对话库始终可用；自定义 LLM 接口需在偏好设置中填写。</div>
        `,
        width: 280,
        position: 'right',
    });
    const input = host.querySelector('#ai-input');
    const replyEl = host.querySelector('#ai-reply');
    host.querySelector('button[data-act="send"]').addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        replyEl.textContent = '…';
        try {
            const r = await aiChat.ask(text);
            replyEl.textContent = r.reply;
            animator.setBubbleText(r.reply);
            memory.note('user-asked', text);
        } catch (e) {
            replyEl.textContent = '（本次回答失败）' + e.message;
        }
    });
    host.querySelector('button[data-act="forget"]').addEventListener('click', () => {
        aiChat.reset();
        replyEl.textContent = '已清空本次对话。';
    });
    input.focus();
}

function openTodoPopover({ todoList, focusFlow, popover }) {
    const snap = todoList.snapshot();
    const itemsHtml = snap.today.map(it => `
        <div class="todo-row" data-id="${it.id}">
            <input type="checkbox" ${it.completed ? 'checked' : ''}/>
            <span class="todo-title" style="flex:1">${escapeHtml(it.title)}</span>
            <span class="todo-prio" data-p="${it.priority}">P${it.priority}</span>
            <button type="button" data-focus="${it.id}">专注</button>
        </div>
    `).join('') || `<div style="opacity:.6;text-align:center;padding:8px">今天没有待办</div>`;
    popover.open({
        html: `
            <div style="font-weight:700;margin-bottom:6px">今日待办</div>
            <div id="pet-popover-todo-list">${itemsHtml}</div>
            <div style="display:flex;gap:6px;margin-top:8px">
                <input id="pet-popover-todo-input" placeholder="添加待办…" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #ddd"/>
                <button data-act="add">添加</button>
            </div>
        `,
        width: 280,
        position: 'right',
        onClose: () => {},
    });
    const host = document.getElementById('pet-popover');
    if (!host) return;
    host.querySelector('button[data-act="add"]')?.addEventListener('click', () => {
        const inp = host.querySelector('#pet-popover-todo-input');
        if (inp && inp.value.trim()) {
            todoList.add({ title: inp.value.trim(), priority: 1 });
            inp.value = '';
            openTodoPopover({ todoList, focusFlow, popover });
        }
    });
    host.querySelectorAll('.todo-row input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.closest('.todo-row').dataset.id;
            todoList.complete(id);
            openTodoPopover({ todoList, focusFlow, popover });
        });
    });
    host.querySelectorAll('button[data-focus]').forEach((button) => {
        button.addEventListener('click', () => {
            const task = snap.today.find((item) => item.id === button.dataset.focus);
            if (task && focusFlow.start(task)) popover.close();
        });
    });
}

function openSettingsPopover({ cache, setSettings, popover, root }) {
    const settings = cache.get('settings') || {};
    popover.open({
        html: `
            <div style="font-weight:700;margin-bottom:6px">偏好设置</div>
            <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span>音量</span>
                <input id="set-vol" type="range" min="0" max="1" step="0.05" value="${settings.volume ?? 0.3}"/>
            </label>
            <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span>活跃度</span>
                <select id="set-auto">
                    <option value="low" ${settings.autonomyLevel==='low'?'selected':''}>安静</option>
                    <option value="normal" ${settings.autonomyLevel==='normal'?'selected':''}>正常</option>
                    <option value="high" ${settings.autonomyLevel==='high'?'selected':''}>活跃</option>
                </select>
            </label>
            <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span>开机启动</span>
                <input id="set-auto2" type="checkbox" ${settings.autostart ? 'checked' : ''}/>
            </label>
            <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
                <button data-act="save">保存</button>
            </div>
            <div style="opacity:.6;font-size:11px;margin-top:6px">更多设置前往角色房间 → 设置。</div>
        `,
        width: 260,
        position: 'right',
    });
    const host = document.getElementById('pet-popover');
    if (!host) return;
    host.querySelector('button[data-act="save"]')?.addEventListener('click', async () => {
        const requestedAutostart = host.querySelector('#set-auto2').checked;
        let actualAutostart = !!settings.autostart;
        try {
            const loginSettings = await window.petAPI.autostartSet(requestedAutostart);
            actualAutostart = !!loginSettings?.openAtLogin;
        } catch (_) {}
        const newSettings = {
            ...settings,
            volume:  Number(host.querySelector('#set-vol').value),
            autonomyLevel: host.querySelector('#set-auto').value,
            autostart: actualAutostart,
        };
        await setSettings({ settings: newSettings });
        cache.set('settings', newSettings);
        host.remove();
    });
}

function handleTrayCommand(cmd, refs) {
    // cmd strings like 'pomodoro:start', 'room:open:todos', 'dnd:toggle'.
    const parts = cmd.split(':');
    if (parts[0] === 'pomodoro' && parts[1] === 'start') refs.focusFlow.start();
    else if (parts[0] === 'focus' && parts[1] === 'toggle') refs.focusFlow.togglePause();
    else if (parts[0] === 'focus' && parts[1] === 'skip') refs.focusFlow.skip();
    else if (parts[0] === 'focus' && parts[1] === 'stop') refs.focusFlow.stop();
    else if (parts[0] === 'room' && parts[1] === 'open') {
        const requestedTab = parts[2] === 'todos' ? 'feed' : (parts[2] || 'stats');
        window.petAPI.openRoom({ tab: requestedTab });
    } else if (parts[0] === 'dnd' && parts[1] === 'toggle') {
        refs.dnd.toggle();
    } else if (parts[0] === 'scene' && ['manual', 'focus', 'relaxed', 'night'].includes(parts[1])) {
        refs.setSettings({ settings: { sceneMode: parts[1] } });
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

main().catch(err => console.error('[pet] bootstrap failed:', err));

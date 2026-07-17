/**
 * Character-room entry: shared storage, accessible tabs and live updates.
 */
import { statsTab, achievementsTab, outfitsTab, feedTab, settingsTab } from './tabs.js';
import { buildFocusCompanion } from '../renderer/focus-companion.js';

const TABS = {
    stats: statsTab,
    achievements: achievementsTab,
    outfits: outfitsTab,
    feed: feedTab,
    settings: settingsTab,
};

async function main() {
    const status = document.getElementById('room-status');
    let statusTimer = null;
    const announce = (message, tone = 'info') => {
        clearTimeout(statusTimer);
        status.dataset.tone = tone;
        status.textContent = message;
        statusTimer = setTimeout(() => {
            status.textContent = '';
            delete status.dataset.tone;
        }, 3600);
    };

    const [data, initialFocusState] = await Promise.all([
        window.petAPI.storageList(),
        window.petAPI.focusState(),
    ]);
    const cache = new Map(Object.entries(data));
    const pendingWrites = new Map();
    const getSettings = () => Object.fromEntries(cache);
    let focusState = initialFocusState;
    const markWrite = (domain, delta) => {
        const next = (pendingWrites.get(domain) || 0) + delta;
        if (next > 0) pendingWrites.set(domain, next);
        else pendingWrites.delete(domain);
    };

    const setSettings = async (patch) => {
        const results = {};
        for (const [domain, value] of Object.entries(patch)) {
            let domainPatch = value || {};
            if (domain === 'settings' && Object.hasOwn(domainPatch, 'autostart')) {
                const loginSettings = await window.petAPI.autostartSet(!!domainPatch.autostart);
                domainPatch = { ...domainPatch, autostart: !!loginSettings?.openAtLogin };
            }

            markWrite(domain, 1);
            try {
                const stored = await window.petAPI.storageSet(domain, domainPatch);
                cache.set(domain, stored);
                results[domain] = stored;
            } finally {
                markWrite(domain, -1);
            }
        }
        return results;
    };

    const context = {
        getSettings,
        setSettings,
        announce,
        dataExport: () => window.petAPI.dataExport(),
        dataImport: () => window.petAPI.dataImport(),
        aiStatus: () => window.petAPI.aiStatus(),
        aiConfigure: (config) => window.petAPI.aiConfigure(config),
        aiTest: () => window.petAPI.aiTest(),
        updateStatus: () => window.petAPI.updateStatus(),
        updateCheck: () => window.petAPI.updateCheck(),
        updateInstall: () => window.petAPI.updateInstall(),
        onUpdateStatus: (handler) => window.petAPI.onUpdateStatus(handler),
        windowStatus: () => window.petAPI.windowStatus(),
        windowAction: (action) => window.petAPI.windowAction(action),
        focusCommand: (command) => window.petAPI.focusCommand(command),
        getFocusState: () => focusState,
        refreshCurrent: () => renderPanel(activeTab),
    };
    const tabButtons = [...document.querySelectorAll('[role="tab"]')];
    const panels = [...document.querySelectorAll('[role="tabpanel"]')];
    const panelCleanup = new Map();
    let activeTab = 'stats';

    const renderPanel = (name) => {
        const root = document.querySelector(`[data-panel="${name}"]`);
        if (!root || !TABS[name]) return;
        panelCleanup.get(name)?.();
        panelCleanup.delete(name);
        root.replaceChildren();
        const cleanup = TABS[name].render(root, context);
        if (typeof cleanup === 'function') panelCleanup.set(name, cleanup);
    };

    const refreshAll = () => {
        for (const name of Object.keys(TABS)) renderPanel(name);
    };

    const activate = (name, { focus = false, render = true, notify = false } = {}) => {
        if (!TABS[name]) return;
        activeTab = name;
        for (const button of tabButtons) {
            const selected = button.dataset.tab === name;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            if (selected && focus) button.focus();
        }
        for (const panel of panels) {
            const selected = panel.dataset.panel === name;
            panel.classList.toggle('active', selected);
            panel.hidden = !selected;
        }
        if (render) renderPanel(name);
        if (notify) {
            const label = tabButtons.find((button) => button.dataset.tab === name)?.textContent?.trim() || name;
            announce(`已打开${label}面板`);
        }
    };

    tabButtons.forEach((button, index) => {
        button.addEventListener('click', () => activate(button.dataset.tab));
        button.addEventListener('keydown', (event) => {
            let nextIndex = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabButtons.length;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = tabButtons.length - 1;
            if (nextIndex == null) return;
            event.preventDefault();
            activate(tabButtons[nextIndex].dataset.tab, { focus: true });
        });
    });

    window.petAPI.onRoomTab((name) => activate(name, { notify: true }));
    window.petAPI.onFocusState((nextState) => {
        focusState = nextState;
        if (activeTab !== 'feed') return;
        const card = document.querySelector('[data-focus-companion]');
        const next = buildFocusCompanion(focusState);
        const nextKey = `${next.phase}:${next.task?.id || ''}:${next.awaitingDecision}:${focusState.reflectionEventId || ''}:${next.capturedCount}`;
        if (!card || card.dataset.focusKey !== nextKey) {
            renderPanel('feed');
            return;
        }
        const elapsed = card.querySelector('[data-focus-elapsed]');
        const remaining = card.querySelector('[data-focus-remaining]');
        const message = card.querySelector('[data-focus-message]');
        if (elapsed) elapsed.textContent = next.elapsed;
        if (remaining) remaining.textContent = next.remaining;
        if (message && next.message) message.textContent = next.message;
    });
    window.petAPI.onStorageChange(({ domain, data: nextData }) => {
        cache.set(domain, nextData);
        if (pendingWrites.has(domain)) return;

        const focusId = document.activeElement?.id;
        renderPanel(activeTab);
        if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    });

    const initial = TABS[window.petAPI.context.initialRoomTab]
        ? window.petAPI.context.initialRoomTab
        : 'stats';

    refreshAll();
    activate(initial, { render: false });
    console.log(`[room] ready, activeTab=${activeTab}`);
}

main().catch((error) => {
    console.error('[room] failed:', error);
    const status = document.getElementById('room-status');
    if (status) {
        status.dataset.tone = 'error';
        status.textContent = '房间加载失败，请重新打开窗口。';
    }
});

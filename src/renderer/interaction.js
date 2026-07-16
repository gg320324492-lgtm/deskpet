/**
 * interaction.js
 *
 * Click combos, drag, wheel, keyboard, and menu — all the runtime input glue.
 *
 * v2 menu:
 *   - 互动 (interact)
 *   - 效率 (productivity)
 *   - 角色 (character)
 *   - 设置 (settings)
 *
 * The right-click menu is built from MENU_GROUPS (state-derived) plus an
 * application-supplied `extraMenuGroups` (productivity / character / settings).
 * Action callbacks are registered via `setActionHandlers({ id: fn })` —
 * any menu item carrying `data-action="<id>"` will dispatch there.
 */
import {
    STATES,
    TEMP_DURATIONS,
    MENU_GROUPS,
    KEY_MAP,
    STATE_CLASSES,
} from './state-catalog.mjs';
import { spriteLoader } from './sprite-loader.js';
import { attachMenuKeyboardNavigation, clampMenuPosition } from './menu-layout.mjs';

const DRAG_THRESHOLD     = 5;
const CLICK_DOUBLE_MS    = 300;
const CLICK_WINDOW_MS    = 500;
const HOVER_DELAY_MS    = 3_000;
const BOTTOM_REST_PX     = 100;
const TOP_PEEK_PX        = 60;
const EDGE_CACHE_MS      = 250;

class EdgeBounds {
    static _cache = null;
    static _timestamp = 0;
    static async get() {
        const now = Date.now();
        if (EdgeBounds._cache && now - EdgeBounds._timestamp < EDGE_CACHE_MS) {
            return EdgeBounds._cache;
        }
        let bounds;
        try {
            bounds = await window.petAPI.getDisplayBounds();
        } catch {
            bounds = null;
        }
        if (!bounds) {
            bounds = {
                workArea: { x: 0, y: 0, width: window.screen.width, height: window.screen.height },
                monitors: [{ x: 0, y: 0, width: window.screen.width, height: window.screen.height }],
            };
        }
        EdgeBounds._cache = bounds;
        EdgeBounds._timestamp = now;
        return bounds;
    }
}

export class Interaction {
    constructor(rootEl, stateMachine, idleWatcher, options = {}) {
        this._root = rootEl;
        this._sm = stateMachine;
        this._idle = idleWatcher;
        this._showUnfinished = !!options.showUnfinished;
        this._actionHandlers = options.actionHandlers || {};
        this._extraMenuGroups = options.extraMenuGroups || [];

        this._pressTimer = null;
        this._lastClickTime = 0;
        this._clickTimes = [];
        this._pressStart = null;
        this._dragging = false;
        this._hoverTimer = null;
        this._tempReturnTimer = null;
        this._userInputListeners = new Set();

        this._bind();
    }

    setActionHandlers(map) {
        this._actionHandlers = { ...this._actionHandlers, ...map };
    }

    setExtraMenuGroups(groups) {
        this._extraMenuGroups = Array.isArray(groups) ? groups : [];
    }

    setShowUnfinished(flag) { this._showUnfinished = !!flag; }

    onUserInput(fn) { this._userInputListeners.add(fn); return () => this._userInputListeners.delete(fn); }
    _notifyUser() { for (const f of this._userInputListeners) { try { f(); } catch (_) {} } }

    _bind() {
        this._root.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this._root.addEventListener('mousemove', (e) => this._onMouseMove(e));
        window.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this._root.addEventListener('mouseenter', () => this._onEnter());
        this._root.addEventListener('mouseleave', () => this._onLeave());
        this._root.addEventListener('contextmenu', (e) => this._onContext(e));
        this._root.addEventListener('auxclick', (e) => this._onAuxClick(e));
        this._root.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        document.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    _onEnter() {
        if (this._sm.state !== STATES.IDLE) return;
        this._hoverTimer = setTimeout(() => {
            if (this._sm.state === STATES.IDLE) {
                this._sm.transitionTo(STATES.THINK);
                this._scheduleReturn(STATES.THINK);
            }
        }, HOVER_DELAY_MS);
    }
    _onLeave() {
        clearTimeout(this._hoverTimer);
        this._hoverTimer = null;
    }

    _onMouseDown(e) {
        this._idle.poke();
        this._notifyUser();
        if (e.button === 2) return;
        if (e.button === 1) return;
        this._shiftDown = e.shiftKey;
        this._pressStart = {
            x: e.screenX, y: e.screenY,
            time: Date.now(),
            moved: false,
        };
        this._dragging = false;
    }

    _onMouseMove(e) {
        if (!this._pressStart) return;
        const dx = e.screenX - this._pressStart.x;
        const dy = e.screenY - this._pressStart.y;
        if (!this._pressStart.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
            this._pressStart.moved = true;
            this._dragging = true;
            // force(): dragging must enter WALK from ANY source state (SIT,
            // SLEEP, THINK, …) — a plain transitionTo would be rejected by the
            // table and leave the pet frozen in its old pose while it moves.
            this._sm.force(STATES.WALK);
            window.petAPI.setIgnoreMouse(false);
        }
        if (this._dragging) {
            window.petAPI.dragBy(dx, dy);
            this._pressStart.x = e.screenX;
            this._pressStart.y = e.screenY;
            this._checkDragToEdge();
        }
    }

    _onMouseUp(e) {
        if (e.button === 2) return;
        if (!this._pressStart) return;
        const wasDragging = this._dragging;
        const wasShift = this._shiftDown;
        const press = this._pressStart;
        this._pressStart = null;
        this._dragging = false;
        this._shiftDown = false;

        if (wasDragging) {
            this._postDrag(press.x, press.y);
            window.petAPI.setIgnoreMouse(true);
            return;
        }

        const now = Date.now();
        this._clickTimes = this._clickTimes.filter(t => now - t < CLICK_WINDOW_MS);
        this._clickTimes.push(now);

        clearTimeout(this._pressTimer);
        this._lastClickTime = now;
        this._pressTimer = setTimeout(() => {
            this._pressTimer = null;
            this._handleClickSequence(wasShift);
        }, CLICK_DOUBLE_MS);
    }

    _handleClickSequence(wasShift) {
        const n = this._clickTimes.length;
        if (n >= 5) {
            this._clickTimes = [];
            return this._trigger(STATES.CHEER);
        }
        if (n >= 3) {
            this._clickTimes = [];
            return this._trigger(STATES.LOVE);
        }
        if (n === 2) {
            return this._trigger(STATES.CHEER);
        }
        if (wasShift) return this._trigger(STATES.WORK);
        if (this._sm.state === STATES.SLEEP) {
            this._sm.transitionTo(STATES.IDLE);
            return;
        }
        this._trigger(STATES.SURPRISE);
    }

    _trigger(state) {
        if (!state) return;
        if (!this._sm.transitionTo(state)) return;
        if (state !== STATES.SLEEP && state !== STATES.WORK && state !== STATES.LAND) {
            this._scheduleReturn(state);
        }
    }

    async _postDrag(absoluteX, absoluteY) {
        const bounds = await EdgeBounds.get();
        const monitor = this._monitorAt(bounds, absoluteX, absoluteY) || bounds.workArea;
        const distBottom = monitor.y + monitor.height - absoluteY;
        const distTop    = absoluteY - monitor.y;

        if (distBottom < BOTTOM_REST_PX) {
            this._sm.transitionTo(STATES.SIT);
        } else if (distTop < TOP_PEEK_PX) {
            this._sm.transitionTo(STATES.PEEK);
            this._scheduleReturn(STATES.PEEK);
        } else {
            if (this._showUnfinished && spriteLoader.hasImage(STATES.LAND)) {
                this._sm.transitionTo(STATES.LAND);
                this._scheduleReturn(STATES.LAND);
            } else {
                this._sm.transitionTo(STATES.IDLE);
            }
        }
    }

    _monitorAt(bounds, x, y) {
        for (const m of bounds.monitors) {
            if (x >= m.x && x < m.x + m.width &&
                y >= m.y && y < m.y + m.height) {
                return m;
            }
        }
        return null;
    }

    async _checkDragToEdge() {
        if (this._sm.state !== STATES.WALK) return;
        const bounds = await EdgeBounds.get();
        const monitor = this._monitorAt(bounds, this._pressStart.x, this._pressStart.y);
        if (!monitor) return;
        const distBottom = monitor.y + monitor.height - this._pressStart.y;
        const distTop    = this._pressStart.y - monitor.y;
        if (distBottom < BOTTOM_REST_PX) {
            this._sm.transitionTo(STATES.SIT);
        } else if (distTop < TOP_PEEK_PX) {
            this._sm.transitionTo(STATES.PEEK);
            this._scheduleReturn(STATES.PEEK);
        }
    }

    _onAuxClick(e) {
        if (e.button !== 1) return;
        e.preventDefault();
        this._trigger(STATES.EAT);
    }

    _onWheel(e) {
        e.preventDefault();
        this._idle.poke();
        this._notifyUser();
        if (e.deltaY < 0) this._trigger(STATES.LOVE);
        else if (e.deltaY > 0) this._trigger(STATES.SURPRISE);
    }

    _onKeyDown(e) {
        if (document.activeElement !== this._root) return;
        const k = e.key.toLowerCase();

        // Ctrl+Shift+D → DND toggle (always consumed; not in pet-only mode)
        if (e.ctrlKey && e.shiftKey && k === 'd') {
            e.preventDefault();
            (this._actionHandlers['dnd:toggle'] || (() => {}))();
            return;
        }

        if (KEY_MAP[k]) {
            this._idle.poke();
            this._notifyUser();
            this._trigger(KEY_MAP[k]);
            e.preventDefault();
            return;
        }
        if (k === 'h') {
            window.petAPI.toggleWindow();
            e.preventDefault();
        }
    }

    _onContext(e) {
        e.preventDefault();
        this._showContextMenu(e.clientX, e.clientY);
    }

    _showContextMenu(x, y) {
        const old = document.getElementById('pet-context-menu');
        if (old) old.remove();

        const menu = document.createElement('div');
        menu.id = 'pet-context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', '\u684c\u5ba0\u64cd\u4f5c');

        // 1. State-derived menu groups (pre-existing 12 + 6 placeholders that have art)
        const stateHtml = MENU_GROUPS.map(g => {
            const items = g.items.filter(it =>
                this._showUnfinished ? true : spriteLoader.hasImage(it.id)
            );
            if (!items.length) return '';
            return this._renderGroup(g.label, items.map(i => ({
                type: 'state',
                stateId: i.id,
                label: i.label,
                key: i.key,
            })));
        }).filter(Boolean).join('');

        // 2. Extra (productivity + character + settings) — supplied by app
        const extraHtml = this._extraMenuGroups.map(g =>
            this._renderGroup(g.label, g.items || [])
        ).join('');

        menu.innerHTML = stateHtml + extraHtml + `
            <div class="ctx-sep"></div>
            <div class="ctx-item ctx-quit" data-act="quit" role="menuitem" tabindex="-1">
                <span>退出</span><span class="key">Esc×2</span>
            </div>
        `;
        menu.style.left = x + 'px';
        menu.style.top  = y + 'px';
        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();
        const position = clampMenuPosition({
            x,
            y,
            menuWidth: rect.width,
            menuHeight: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        });
        menu.style.left = `${position.left}px`;
        menu.style.top = `${position.top}px`;

        // Removing the menu must also restore mouse-ignore: while the menu is
        // open the hit-test keeps the window clickable (see bootstrap
        // setupMouseHitTest), so on close we hand control back to click-through
        // until the next mousemove re-evaluates over the sprite.
        const closeMenu = () => {
            menu.remove();
            try { window.petAPI.setIgnoreMouse(true); } catch (_) {}
            try { this._root.focus({ preventScroll: true }); } catch (_) {}
        };

        attachMenuKeyboardNavigation({ menu, onEscape: closeMenu });

        menu.addEventListener('click', (ev) => {
            const item = ev.target.closest('.ctx-item');
            if (!item) return;
            const action = item.dataset.act;
            const stateId = item.dataset.state;
            this._idle.poke();
            this._notifyUser();
            if (stateId) {
                this._trigger(stateId);
            } else if (action === 'quit') {
                window.petAPI.quitApp();
            } else if (action) {
                const fn = this._actionHandlers[action];
                if (fn) {
                    try { fn(item.dataset); } catch (e) { console.warn('[ctx] action failed:', e); }
                }
            }
            closeMenu();
        });

        setTimeout(() => {
            const close = (ev) => {
                if (!menu.contains(ev.target)) {
                    closeMenu();
                    document.removeEventListener('mousedown', close, true);
                }
            };
            document.addEventListener('mousedown', close, true);
        }, 0);
    }

    _renderGroup(label, items) {
        const html = items.map(i => {
            const payload = i.type === 'state'
                ? `data-state="${i.stateId}"`
                : `data-act="${i.id}"` + (i.payload ? ` data-payload='${encodeURIComponent(JSON.stringify(i.payload))}'` : '');
            const key = i.key ? `<span class="key">${i.key.toUpperCase()}</span>` : (i.shortcut ? `<span class="key">${i.shortcut}</span>` : '');
            return `<div class="ctx-item${i.danger ? ' ctx-danger' : ''}" ${payload} role="menuitem" tabindex="-1">
                        <span>${i.label}</span>${key}
                    </div>`;
        }).join('');
        return `
            <div class="ctx-group">${label}</div>
            ${html}
        `;
    }

    syncStateClass(state) {
        const all = Object.values(STATE_CLASSES);
        this._root.classList.remove(...all);
        this._root.classList.add(STATE_CLASSES[state] || `state-${state}`);
    }

    _scheduleReturn(state) {
        if (this._tempReturnTimer) clearTimeout(this._tempReturnTimer);
        const dur = TEMP_DURATIONS[state] ?? 2000;
        this._tempReturnTimer = setTimeout(() => {
            if (this._sm.state === state) {
                this._sm.transitionTo(STATES.IDLE);
            }
            this._tempReturnTimer = null;
        }, dur);
    }
}

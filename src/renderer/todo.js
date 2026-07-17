/**
 * src/renderer/todo.js
 *
 * TodoList backed by storage.todos.items:  CRUD + today filter + reactive
 * snapshot.  Multiple UIs can subscribe:
 *   - the popover "quick add" input
 *   - the dedicated BrowserWindow "今日待办" tab (Phase 5)
 *
 * Item shape:
 *   { id, title, priority: 1|2|3, dueAt, repeat: 'none'|'daily'|'weekly',
 *     completed, doneAt, createdAt }
 */

const REPEAT_DEFAULT = 'none';

export class TodoList {
    constructor({ getSettings, setSettings, onAfterChange }) {
        this._getSettings = getSettings;
        this._setSettings = setSettings;
        this._onAfterChange = onAfterChange || (() => {});
        this._listeners = new Set();
    }

    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _emit() { for (const fn of this._listeners) fn(this.snapshot()); }

    snapshot() {
        const items = this._getSettings().todos?.items || [];
        return {
            today:    this._filterToday(items),
            upcoming: this._filterUpcoming(items),
            done:     items.filter(i => i.completed),
            all:      items,
            count: { total: items.length, done: items.filter(i => i.completed).length, today: this._filterToday(items).length },
        };
    }

    add({ title, priority = 1, dueAt = null, repeat = REPEAT_DEFAULT }) {
        const item = {
            id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
            title: String(title || '').trim().slice(0, 120),
            priority: Number(priority) || 1,
            dueAt: dueAt || null,
            repeat,
            completed: false,
            doneAt: null,
            createdAt: Date.now(),
        };
        if (!item.title) return null;
        const list = [...(this._getSettings().todos?.items || []), item];
        this._commit(list);
        return item;
    }

    update(id, patch) {
        const list = (this._getSettings().todos?.items || []).map(it => {
            if (it.id !== id) return it;
            return { ...it, ...patch };
        });
        this._commit(list);
    }

    remove(id) {
        const list = (this._getSettings().todos?.items || []).filter(it => it.id !== id);
        this._commit(list);
    }

    complete(id) {
        const now = Date.now();
        const rescheduled = [];
        let completedItem = null;
        const list = (this._getSettings().todos?.items || []).map(it => {
            if (it.id !== id) return it;
            if (it.completed) return it;
            const updated = { ...it, completed: true, doneAt: now };
            completedItem = updated;
            // If repeat != none, queue a fresh item to append in the same commit.
            if (it.repeat && it.repeat !== 'none') {
                rescheduled.push(this._makeReschedule(updated, it.repeat));
            }
            return updated;
        });
        if (!completedItem) return false;
        this._commit([...list, ...rescheduled]);
        this._onAfterChange({ kind: 'complete', id, item: completedItem });
        return true;
    }

    _makeReschedule(done, repeat) {
        const base = new Date(done.doneAt);
        const due = new Date(base);
        if (repeat === 'daily')  due.setDate(due.getDate() + 1);
        if (repeat === 'weekly') due.setDate(due.getDate() + 7);
        return {
            id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
            title: done.title,
            priority: done.priority,
            dueAt: due.toISOString(),
            repeat,
            completed: false,
            doneAt: null,
            createdAt: Date.now(),
        };
    }

    _commit(list) {
        this._setSettings({ todos: { ...this._getSettings().todos, items: list } });
        this._emit();
    }

    _filterToday(items) {
        const today = new Date().toISOString().slice(0, 10);
        return items.filter(i => !i.completed &&
            (!i.dueAt || i.dueAt.slice(0, 10) <= today));
    }
    _filterUpcoming(items) {
        const today = new Date().toISOString().slice(0, 10);
        return items.filter(i => !i.completed && i.dueAt && i.dueAt.slice(0,10) > today);
    }
}

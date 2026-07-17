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
 *     bucket: 'inbox'|'today'|'later', timeBlock: '', completed, doneAt, createdAt }
 */

const REPEAT_DEFAULT = 'none';
const TODO_BUCKETS = new Set(['inbox', 'today', 'later']);

function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todoBucket(item, today = localDateKey()) {
    if (!item || item.completed) return 'done';
    const dueDate = typeof item.dueAt === 'string' ? item.dueAt.slice(0, 10) : '';
    if (dueDate) return dueDate <= today ? 'today' : 'later';
    return TODO_BUCKETS.has(item.bucket) ? item.bucket : 'inbox';
}

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
        const today = localDateKey();
        return {
            inbox:    items.filter((item) => todoBucket(item, today) === 'inbox'),
            today:    items.filter((item) => todoBucket(item, today) === 'today'),
            later:    items.filter((item) => todoBucket(item, today) === 'later'),
            upcoming: items.filter((item) => todoBucket(item, today) === 'later'),
            done:     items.filter(i => i.completed),
            all:      items,
            count: {
                total: items.length,
                done: items.filter((item) => item.completed).length,
                inbox: items.filter((item) => todoBucket(item, today) === 'inbox').length,
                today: items.filter((item) => todoBucket(item, today) === 'today').length,
                later: items.filter((item) => todoBucket(item, today) === 'later').length,
            },
        };
    }

    add({ title, priority = 1, dueAt = null, repeat = REPEAT_DEFAULT, bucket = 'inbox', timeBlock = '' }) {
        const item = {
            id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
            title: String(title || '').trim().slice(0, 120),
            priority: Number(priority) || 1,
            dueAt: dueAt || null,
            repeat,
            bucket: TODO_BUCKETS.has(bucket) ? bucket : 'inbox',
            timeBlock: ['morning', 'afternoon', 'evening'].includes(timeBlock) ? timeBlock : '',
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

    move(id, bucket) {
        if (!TODO_BUCKETS.has(bucket)) return false;
        const items = this._getSettings().todos?.items || [];
        if (!items.some((item) => item.id === id && !item.completed)) return false;
        this.update(id, {
            bucket,
            dueAt: bucket === 'today' ? new Date().toISOString() : null,
            timeBlock: bucket === 'today' ? (items.find((item) => item.id === id)?.timeBlock || '') : '',
        });
        return true;
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
            bucket: 'later',
            timeBlock: '',
            completed: false,
            doneAt: null,
            createdAt: Date.now(),
        };
    }

    _commit(list) {
        this._setSettings({ todos: { ...this._getSettings().todos, items: list } });
        this._emit();
    }

}

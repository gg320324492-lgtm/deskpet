/** Runtime-only bridge between Pomodoro, companion scenes and a linked task. */
const REST_PHASES = new Set(['rest', 'longRest']);

function normalizeTask(task) {
    if (!task || typeof task !== 'object') return null;
    const id = typeof task.id === 'string' ? task.id.trim() : '';
    const title = typeof task.title === 'string' ? task.title.trim().slice(0, 120) : '';
    return id && title ? { id, title } : null;
}

export class FocusFlow {
    constructor({ pomodoro, scene, todoList, onNotice = () => {}, onEvent = () => {} }) {
        this._pomodoro = pomodoro;
        this._scene = scene;
        this._todoList = todoList;
        this._onNotice = onNotice;
        this._onEvent = onEvent;
        this._listeners = new Set();
        this._task = null;
        this._skipPending = false;
        this._focusStartedAt = 0;
        this._focusElapsedMs = 0;
        this._previousPhase = pomodoro.snapshot().phase;
        this._unsubscribe = pomodoro.onChange((snapshot) => this._onPomodoroChange(snapshot));
    }

    dispose() { this._unsubscribe?.(); this._listeners.clear(); }
    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _emit() { for (const listener of this._listeners) listener(this.snapshot()); }

    _record(type, { minutes = 0 } = {}) {
        this._onEvent({
            type,
            title: this._task?.title || '',
            taskId: this._task?.id || '',
            minutes,
        });
    }

    _finishFocusMinutes() {
        const activeMs = this._focusStartedAt ? Date.now() - this._focusStartedAt : 0;
        const minutes = Math.max(0, Math.round((this._focusElapsedMs + activeMs) / 60_000));
        this._focusStartedAt = 0;
        this._focusElapsedMs = 0;
        return minutes;
    }

    snapshot() {
        const timer = this._pomodoro.snapshot();
        return {
            ...timer,
            task: this._task ? { ...this._task } : null,
            sceneOverride: timer.phase === 'work' || timer.phase === 'paused'
                ? 'focus'
                : (REST_PHASES.has(timer.phase) ? 'relaxed' : null),
        };
    }

    start(task = null) {
        const nextTask = normalizeTask(task);
        const current = this._pomodoro.snapshot().phase;
        if (current === 'paused') return this.resume();
        if (current !== 'idle') return false;
        this._task = nextTask;
        const started = this._pomodoro.start();
        if (!started) this._task = null;
        return started;
    }

    pause() { return this._pomodoro.pause(); }
    resume() { return this._pomodoro.resume(); }
    stop() { return this._pomodoro.stop(); }
    togglePause() { return this._pomodoro.snapshot().phase === 'paused' ? this.resume() : this.pause(); }

    skip() {
        const phase = this._pomodoro.snapshot().phase;
        if (phase === 'work' || phase === 'paused') this._skipPending = true;
        return this._pomodoro.skip();
    }

    command(command = {}) {
        switch (command.action) {
        case 'start': return this.start(command.task);
        case 'toggle': return this.togglePause();
        case 'skip': return this.skip();
        case 'stop': return this.stop();
        default: return false;
        }
    }

    _onPomodoroChange(snapshot) {
        const phase = snapshot.phase;
        if (phase === this._previousPhase) return;
        if (phase === 'work') {
            if (this._previousPhase !== 'paused') {
                this._focusElapsedMs = 0;
                this._record('focus-start');
            }
            this._focusStartedAt = Date.now();
            this._scene.setOverride('focus', { notify: false, source: 'focus-flow' });
        }
        if (phase === 'paused' && this._previousPhase === 'work') {
            this._focusElapsedMs += Math.max(0, Date.now() - this._focusStartedAt);
            this._focusStartedAt = 0;
        }
        if (REST_PHASES.has(phase)) {
            this._scene.setOverride('relaxed', { notify: false, source: 'focus-flow' });
            const minutes = this._finishFocusMinutes();
            const endedWork = this._previousPhase === 'work' || this._previousPhase === 'paused';
            if (endedWork) this._record(this._skipPending ? 'focus-skip' : 'focus-complete', { minutes });
            if (this._previousPhase === 'work' && this._task && !this._skipPending) {
                const task = this._task;
                this._task = null;
                this._todoList.complete(task.id);
                this._onNotice(`已完成「${task.title}」，先休息一下吧。`);
            }
            this._skipPending = false;
        }
        if (phase === 'idle') {
            if ((this._previousPhase === 'work' || this._previousPhase === 'paused') && (this._focusStartedAt || this._focusElapsedMs)) {
                this._record('focus-stop', { minutes: this._finishFocusMinutes() });
            } else {
                this._focusStartedAt = 0;
                this._focusElapsedMs = 0;
            }
            this._scene.clearOverride({ notify: false, source: 'focus-flow' });
            this._task = null;
            this._skipPending = false;
        }
        this._previousPhase = phase;
        this._emit();
    }
}

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
        this._awaitingDecision = false;
        this._reflectionEventId = '';
        this._capturedCount = 0;
        this._message = '';
        this._focusStartedAt = 0;
        this._focusElapsedMs = 0;
        this._previousPhase = pomodoro.snapshot().phase;
        this._unsubscribe = pomodoro.onChange((snapshot) => this._onPomodoroChange(snapshot));
    }

    dispose() { this._unsubscribe?.(); this._listeners.clear(); }
    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _emit() { for (const listener of this._listeners) listener(this.snapshot()); }

    _record(type, { minutes = 0 } = {}) {
        return this._onEvent({
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

    _elapsedMs() {
        const activeMs = this._focusStartedAt ? Math.max(0, Date.now() - this._focusStartedAt) : 0;
        return Math.max(0, this._focusElapsedMs + activeMs);
    }

    _say(message) {
        this._message = message;
        this._onNotice(message);
    }

    snapshot() {
        const timer = this._pomodoro.snapshot();
        return {
            ...timer,
            task: this._task ? { ...this._task } : null,
            elapsedMs: this._elapsedMs(),
            awaitingDecision: this._awaitingDecision,
            reflectionEventId: this._reflectionEventId,
            capturedCount: this._capturedCount,
            message: this._message,
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
        this._awaitingDecision = false;
        this._reflectionEventId = '';
        this._capturedCount = 0;
        this._message = nextTask
            ? `从「${nextTask.title}」开始，我们先走这一小段。`
            : '先陪你安静走一小段。';
        const started = this._pomodoro.start();
        if (!started) {
            this._task = null;
            this._message = '';
        } else {
            this._say(this._message);
        }
        return started;
    }

    pause() {
        const paused = this._pomodoro.pause();
        if (paused) {
            this._say('暂停也可以，进度会留在这里。');
            this._emit();
        }
        return paused;
    }
    resume() {
        const resumed = this._pomodoro.resume();
        if (resumed) {
            this._say('回来啦，继续陪你走。');
            this._emit();
        }
        return resumed;
    }
    stop() { return this._pomodoro.stop(); }
    togglePause() { return this._pomodoro.snapshot().phase === 'paused' ? this.resume() : this.pause(); }

    skip() {
        const phase = this._pomodoro.snapshot().phase;
        if (phase === 'work' || phase === 'paused') this._skipPending = true;
        return this._pomodoro.skip();
    }

    capture(title) {
        const text = typeof title === 'string' ? title.trim().slice(0, 120) : '';
        const phase = this._pomodoro.snapshot().phase;
        if (!text || (phase !== 'work' && phase !== 'paused')) return false;
        this._capturedCount = Math.min(50, this._capturedCount + 1);
        this._say(`收好了「${text}」，稍后再看就好。`);
        this._emit();
        return true;
    }

    continue() {
        const phase = this._pomodoro.snapshot().phase;
        if (!REST_PHASES.has(phase) || !this._task) return false;
        this._awaitingDecision = false;
        const continued = this._pomodoro.continueWork();
        if (continued) {
            this._say('再陪你走一小段。');
            this._emit();
        }
        return continued;
    }

    rest() {
        if (!REST_PHASES.has(this._pomodoro.snapshot().phase)) return false;
        this._awaitingDecision = false;
        this._say('好，先休息一会儿。');
        this._emit();
        return true;
    }

    completeTask() {
        if (!this._awaitingDecision || !this._task) return false;
        const task = this._task;
        this._todoList.complete(task.id);
        this._task = null;
        this._awaitingDecision = false;
        this._say(`已收好「${task.title}」，这一段做得很好。`);
        this._emit();
        return true;
    }

    command(command = {}) {
        switch (command.action) {
        case 'start': return this.start(command.task);
        case 'toggle': return this.togglePause();
        case 'skip': return this.skip();
        case 'stop': return this.stop();
        case 'continue': return this.continue();
        case 'rest': return this.rest();
        case 'complete': return this.completeTask();
        case 'capture': return this.capture(command.title);
        default: return false;
        }
    }

    _onPomodoroChange(snapshot) {
        const phase = snapshot.phase;
        if (phase === this._previousPhase) {
            this._emit();
            return;
        }
        if (phase === 'work') {
            if (this._previousPhase !== 'paused') {
                this._focusElapsedMs = 0;
                this._reflectionEventId = '';
                this._capturedCount = 0;
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
            if (endedWork) {
                const event = this._record(this._skipPending ? 'focus-skip' : 'focus-complete', { minutes });
                this._reflectionEventId = !this._skipPending && typeof event?.id === 'string' ? event.id : '';
            }
            if (endedWork && this._task && !this._skipPending) {
                this._awaitingDecision = true;
                const collected = this._capturedCount ? `刚才收下了 ${this._capturedCount} 件事，` : '';
                this._say(`这一段已经走完了。${collected}「${this._task.title}」接下来想怎么安排？`);
            } else if (this._skipPending) {
                this._task = null;
                this._awaitingDecision = false;
                this._reflectionEventId = '';
                this._capturedCount = 0;
                this._message = '这一段先停在这里，先休息也很好。';
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
            this._awaitingDecision = false;
            this._reflectionEventId = '';
            this._capturedCount = 0;
            this._message = '';
        }
        this._previousPhase = phase;
        this._emit();
    }
}

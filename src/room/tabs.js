/** Five accessible client-side panels for the character room. */
import { ACHIEVEMENTS } from '../renderer/achievements.js';
import { OUTFITS } from '../renderer/wardrobe.js';
import { getDndScheduleStatus } from './dnd-schedule-status.js';
import { SCENES, getSceneStatus } from '../renderer/scene-controller.js';
import { buildRhythmSummary, buildWeeklyReview, formatRhythmEvent, formatRhythmTime } from '../renderer/rhythm.js';
import { todoBucket } from '../renderer/todo.js';
import { TIME_BLOCKS, timeBlockLabel } from '../renderer/time-blocks.js';
import { buildDayCloseout, dayCloseoutPatch } from '../renderer/day-closeout.js';
import { buildTomorrowStart, canPlanTomorrow, returnToInboxPatch, tomorrowPlanPatch } from '../renderer/tomorrow-start.js';
import { beginTodayPatch, buildTodayStart, nextOpenTimeBlock } from '../renderer/today-start.js';
import { archiveTaskPatch, restoreTaskPatch, staleTasks } from '../renderer/task-triage.js';
import { searchTasks } from '../renderer/task-search.js';
import { taskEditorPatch } from '../renderer/task-editor.js';
import { completedToday, restoreCompletedTaskPatch } from '../renderer/task-completion-review.js';
import { buildTodayFocus, clearTodayFocusPatch, todayFocusPatch } from '../renderer/today-focus.js';
import { buildFocusCompanion } from '../renderer/focus-companion.js';
import { buildTodayFocusEchoes, focusReflectionPatch } from '../renderer/focus-reflection.js';
import { buildInboxTriage, inboxTriageRecordPatch } from '../renderer/inbox-triage.js';
import { buildGentleStart } from '../renderer/gentle-start.js';
import { buildSoftSchedule, nextSoftTimeBlock, nextSoftTimeBlockPatch } from '../renderer/soft-schedule.js';
import { beginNextMicroStepPatch, completeMicroStepPatch, currentMicroStep, hasFinishedMicroSteps, resetMicroSteps } from '../renderer/micro-steps.js';
import { appendMicroNotePatch, latestMicroNote, normalizeMicroNotes } from '../renderer/micro-notes.js';
import { buildTaskCloseoutReview } from '../renderer/task-closeout-review.js';
import { hasPendingResumeHint, hasResumeHint, resumeAcknowledgementPatch, resumeContinuationPatch, resumeHintPatch } from '../renderer/task-resume.js';
import { resumeWaitingTaskPatch } from '../renderer/task-waiting.js';
import { buildTaskThread, taskThreadPatch } from '../renderer/task-thread.js';

const meterPct = (value, low, high) => {
    if (!Number.isFinite(value) || high <= low) return 0;
    return Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
};

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        if (key === 'class') node.className = value;
        else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2), value);
        } else if (key.startsWith('aria-') || key.startsWith('data-') || ['role', 'title', 'for'].includes(key)) {
            node.setAttribute(key, String(value));
        } else if (key in node) {
            node[key] = value;
        } else {
            node.setAttribute(key, String(value));
        }
    }
    for (const child of children) {
        if (child == null) continue;
        if (typeof child === 'string' || typeof child === 'number') {
            node.appendChild(document.createTextNode(String(child)));
        } else {
            node.appendChild(child);
        }
    }
    return node;
}

function panelHeader(kicker, title, description) {
    return el('header', { class: 'panel-head' },
        el('p', { class: 'eyebrow' }, kicker),
        el('h2', {}, title),
        description ? el('p', { class: 'panel-description' }, description) : null,
    );
}

function sectionTitle(text) {
    return el('h3', { class: 'section-title' }, text);
}

function runAsync(button, task, { announce, success, failure }) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    return Promise.resolve()
        .then(task)
        .then((result) => {
            const message = typeof success === 'function' ? success(result) : success;
            if (message) announce(message);
            return result;
        })
        .catch((error) => {
            if (error) console.error('[room] async task failed:', error);
            const message = typeof failure === 'function'
                ? failure(error)
                : (failure || '保存失败，请稍后再试。');
            announce(message, 'error');
        })
        .finally(() => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });
}

function makeInboxTodo(title, note = '') {
    return {
        id: `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        title: String(title || '').trim().slice(0, 120),
        note: String(note || '').replace(/\u0000/g, '').trim().slice(0, 240),
        waitingNote: '',
        threadNote: '',
        threadAt: 0,
        nextStepAt: 0,
        resumeAcknowledgedAt: 0,
        microSteps: [],
        microNotes: [],
        priority: 1,
        dueAt: null,
        repeat: 'none',
        bucket: 'inbox',
        timeBlock: '',
        tomorrowPlan: '',
        completed: false,
        doneAt: null,
        createdAt: Date.now(),
    };
}

/** A shared, user-confirmed bridge from a saved return cue back to Today. */
function resumeReconnectEntry(task, { announce, onResume, surface }) {
    const current = currentMicroStep(task);
    const input = el('input', {
        class: 'resume-reconnect-input', type: 'text', maxlength: 120,
        value: current?.text || task.note || '',
        placeholder: '这一轮只做什么？（可改）',
        'aria-label': `${task.title} 的这一轮小步骤`,
    });
    let resumeButton;
    resumeButton = el('button', {
        class: 'resume-reconnect-action primary', type: 'button',
        onclick: () => runAsync(resumeButton, () => onResume(input.value), {
            announce,
            success: `已接上「${task.title}」；这一轮只陪它走一点。`,
            failure: (error) => error?.message || '暂时没能接上这件事。',
        }),
    }, '接上这件事');
    const laterButton = el('button', {
        class: 'resume-reconnect-action quiet', type: 'button',
        onclick: () => announce('先不接也没关系；这句提示会留在这里。'),
    }, '暂时不接');
    return el('div', { class: `resume-reconnect-entry ${surface}` },
        el('label', { class: 'resume-reconnect-label' },
            el('span', {}, '这一轮只做 · 可改'),
            input,
        ),
        el('div', { class: 'resume-reconnect-actions' }, resumeButton, laterButton),
        el('small', { class: 'resume-reconnect-note' }, '接上后只会设为今日主线；不会自动开始专注，也不会改动原来的安放。'),
    );
}

function taskThreadDetail(task) {
    const thread = buildTaskThread(task);
    const hasTrace = thread.closingNote || thread.waitingNote || thread.lastStartingPoint || thread.steps.length || thread.notes.length;
    return el('aside', { class: 'task-thread-detail', 'aria-label': `${task.title} 的任务脉络` },
        el('div', { class: 'task-thread-detail-head' },
            el('span', {}, 'TASK THREAD'),
            el('small', {}, hasTrace ? '只留下几段有用的线索' : '还没有需要回看的线索'),
        ),
        hasTrace ? el('div', { class: 'task-thread-detail-list' },
            thread.closingNote ? el('p', { class: 'task-thread-detail-note closing' }, el('span', {}, '这次做到哪了'), thread.closingNote) : null,
            thread.waitingNote ? el('p', { class: 'task-thread-detail-note waiting' }, el('span', {}, '曾在等什么'), thread.waitingNote) : null,
            thread.lastStartingPoint ? el('p', { class: 'task-thread-detail-note start' }, el('span', {}, '上次起点'), thread.lastStartingPoint) : null,
            thread.steps.length ? el('p', { class: 'task-thread-detail-note steps' }, el('span', {}, '微步骤'), thread.steps.map((step) => `${step.completed ? '✓' : '·'} ${step.text}`).join('  ·  ')) : null,
            thread.notes.length ? el('p', { class: 'task-thread-detail-note notes' }, el('span', {}, '最近小记'), thread.notes.map((note) => note.text).join('  ·  ')) : null,
        ) : el('p', { class: 'task-thread-detail-empty' }, '推进、等待或收尾时留下的一句话，会安静放在这里。'),
    );
}

function openTaskThreadCapture(root, task, { kicker, title, actionLabel, success, announce, onSave }) {
    const input = el('input', {
        class: 'task-thread-capture-input', type: 'text', maxlength: 160,
        value: task.threadNote || '', placeholder: '例如：资料已整理好，等确认后继续（可选）',
        'aria-label': `${task.title} 这次做到哪了（可选）`,
    });
    const close = () => backdrop.remove();
    let saveButton;
    const form = el('form', {
        class: 'task-thread-capture-form',
        onsubmit: (event) => {
            event.preventDefault();
            runAsync(saveButton, async () => { await onSave(input.value); close(); }, { announce, success, failure: (error) => error?.message || '暂时没能保存这件事。' });
        },
    },
    el('div', { class: 'task-thread-capture-head' },
        el('div', {}, el('span', {}, kicker), el('h3', {}, title)),
        el('button', { class: 'task-editor-close', type: 'button', onclick: close, 'aria-label': '关闭' }, '×'),
    ),
    el('p', { class: 'task-thread-capture-copy' }, '可留一句“这次做到哪了”。不写也没关系，任务本身不会被删掉。'),
    el('label', { class: 'task-editor-label' }, '这次做到哪了（可选）', input),
    el('div', { class: 'task-thread-capture-actions' },
        el('button', { class: 'task-editor-cancel', type: 'button', onclick: close }, '取消'),
        saveButton = el('button', { class: 'task-editor-save', type: 'submit' }, actionLabel),
    ));
    const backdrop = el('div', { class: 'task-editor-backdrop task-thread-capture-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, form);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    root.appendChild(backdrop);
    input.focus();
    input.select();
}

// ============ Stats ============
export const statsTab = {
    render(root, { getSettings, setSettings, announce, refreshCurrent, focusCommand, getFocusState }) {
        const mood = getSettings().mood || {};
        const pomodoro = getSettings().pomodoro || {};
        const stats = getSettings().stats || {};
        const todos = getSettings().todos?.items || [];
        const rhythm = getSettings().rhythm || {};
        const rhythmSummary = buildRhythmSummary({ rhythm, todos });
        const weeklyReview = buildWeeklyReview({ rhythm });
        const todayFocus = buildTodayFocus({ focus: rhythm.todayFocus, todos });
        const nextFocusTask = (todayFocus.task && !hasFinishedMicroSteps(todayFocus.task) ? todayFocus.task : null)
            || todos.find((item) => todoBucket(item) === 'today' && !hasFinishedMicroSteps(item));
        const inboxTriage = buildInboxTriage({ todos, inboxTriage: rhythm.inboxTriage });
        const gentleStart = buildGentleStart({ todos, focus: rhythm.todayFocus });
        const focusCompanion = buildFocusCompanion(getFocusState());
        const homeCloseout = buildDayCloseout({ todos });
        const softSchedule = buildSoftSchedule({ todos });
        const finishedMicroTasks = todos.filter((item) => todoBucket(item) === 'today' && hasFinishedMicroSteps(item));
        const gentleMicroStep = currentMicroStep(gentleStart.task);
        const scheduleMicroStep = currentMicroStep(softSchedule.task);

        root.appendChild(panelHeader('今日陪伴', '状态总览', '看看小糖现在的心情、精力和陪伴进度。'));
        root.appendChild(sectionTitle('身心状态'));

        const metric = (label, key, low, high, note = '') => {
            const value = Number(mood[key]) || 0;
            const display = `${Math.round(value)} / ${high}`;
            return el('article', { class: 'card metric-card' },
                el('div', { class: 'card-row metric-copy' },
                    el('span', { class: 'metric-label' }, label),
                    el('span', { class: 'metric-value' }, display),
                ),
                el('progress', {
                    class: 'meter',
                    max: 100,
                    value: meterPct(value, low, high),
                    'aria-label': `${label}：${display}${note ? `，${note}` : ''}`,
                }),
                note ? el('p', { class: 'metric-note' }, note) : null,
            );
        };

        root.appendChild(el('div', { class: 'metric-grid' },
            metric('心情', 'mood', 0, 100),
            metric('精力', 'energy', 0, 100),
            metric('饥饿', 'hunger', 0, 100, '数值越低越舒适'),
            el('article', { class: 'card metric-card affinity-card' },
                el('span', { class: 'metric-label' }, '亲密度'),
                el('strong', { class: 'affinity-value' }, String(Math.round(Number(mood.affinity) || 0))),
                el('p', { class: 'metric-note' }, '每次陪伴都会留下积累'),
            ),
        ));

        root.appendChild(sectionTitle('专注与陪伴'));
        root.appendChild(el('div', { class: 'summary-grid' },
            el('article', { class: 'card summary-card' },
                el('span', { class: 'summary-label' }, '今日番茄钟'),
                el('strong', {}, String(pomodoro.sessionsToday ?? 0)),
                el('small', {}, `累计 ${pomodoro.sessionsTotal ?? 0} 次`),
            ),
            el('article', { class: 'card summary-card' },
                el('span', { class: 'summary-label' }, '连续陪伴'),
                el('strong', {}, `${stats.streakDays ?? 0} 天`),
                el('small', {}, `累计 ${stats.totalCompanionMinutes ?? 0} 分钟`),
            ),
            el('article', { class: 'card summary-card focus-summary-card' },
                el('span', { class: 'summary-label' }, '真实专注时长'),
                el('strong', {}, `${rhythmSummary.focusMinutes} 分钟`),
                el('small', {}, nextFocusTask ? `下一项：${nextFocusTask.title}` : '没有待开始的今日任务'),
            ),
        ));

        const decideCapturedThought = async (task, destination, threadNote = '') => {
            const patch = destination === 'today'
                ? { bucket: 'today', dueAt: new Date().toISOString(), timeBlock: '', tomorrowPlan: '' }
                : destination === 'later'
                    ? { bucket: 'later', dueAt: null, timeBlock: '', tomorrowPlan: '' }
                    : { bucket: 'archive', dueAt: null, timeBlock: '', tomorrowPlan: '' };
            const nextTriage = inboxTriageRecordPatch({
                inboxTriage: rhythm.inboxTriage,
                date: inboxTriage.todayKey,
                taskIds: inboxTriage.offeredIds,
                now: Date.now(),
            });
            await setSettings({
                todos: { items: todos.map((item) => item.id === task.id ? {
                    ...item, ...patch, ...(destination === 'archive' ? taskThreadPatch(task, threadNote) : {}),
                } : item) },
                rhythm: { ...rhythm, inboxTriage: nextTriage },
            });
            refreshCurrent();
        };
        const triageRow = (task) => {
            let todayButton;
            todayButton = el('button', {
                class: 'inbox-landing-action today', type: 'button',
                onclick: () => runAsync(todayButton, () => decideCapturedThought(task, 'today'), {
                    announce, success: '已轻轻放进今天。', failure: (error) => error?.message || '暂时没能更新这件事。',
                }),
            }, '放进今天');
            let laterButton;
            laterButton = el('button', {
                class: 'inbox-landing-action later', type: 'button',
                onclick: () => runAsync(laterButton, () => decideCapturedThought(task, 'later'), {
                    announce, success: '已留在以后。', failure: (error) => error?.message || '暂时没能更新这件事。',
                }),
            }, '留在以后');
            let archiveButton;
            archiveButton = el('button', {
                class: 'inbox-landing-action archive', type: 'button',
                onclick: () => openTaskThreadCapture(root, task, {
                    kicker: 'PUT AWAY, NOT LOST', title: '先把这一段收在这里', actionLabel: '归档任务', success: '已归档，想找回时仍在。',
                    announce, onSave: (threadNote) => decideCapturedThought(task, 'archive', threadNote),
                }),
            }, '归档');
            return el('article', { class: 'inbox-landing-row' },
                el('div', { class: 'inbox-landing-copy' },
                    el('span', {}, 'PARKED THOUGHT'),
                    el('strong', {}, task.title),
                    task.note ? el('small', {}, '专注时收下 · 现在再决定也来得及') : null,
                ),
                el('div', { class: 'inbox-landing-actions' }, todayButton, laterButton, archiveButton),
            );
        };
        root.appendChild(sectionTitle('收下的念头'));
        root.appendChild(el('section', { class: 'card inbox-landing-card' },
            el('div', { class: 'inbox-landing-head' },
                el('div', {},
                    el('span', { class: 'inbox-landing-kicker' }, 'A SOFT INBOX'),
                    el('h3', {}, inboxTriage.count ? `有 ${inboxTriage.count} 件事在等你有空再看` : '收件箱现在很轻'),
                ),
                el('span', { class: 'inbox-landing-badge' }, inboxTriage.count ? `稍后再看 · ${inboxTriage.count}` : '没有催办'),
            ),
            inboxTriage.latest
                ? el('div', { class: 'inbox-landing-latest' },
                    el('span', {}, '最近收下'),
                    el('strong', {}, inboxTriage.latest.title),
                )
                : el('p', { class: 'inbox-landing-empty' }, '专注时想到的事会先安静放在这里，不需要马上处理。'),
            inboxTriage.candidates.length
                ? el('div', { class: 'inbox-landing-list' },
                    el('p', { class: 'inbox-landing-description' }, `今天只邀请你看看这 ${inboxTriage.candidates.length} 件；不处理也完全没关系。`),
                    ...inboxTriage.candidates.map(triageRow),
                )
                : inboxTriage.hasDailySelection
                    ? el('p', { class: 'inbox-landing-done' }, '今天这一小组已经整理完了。其余念头继续安心待着，明天再说也很好。')
                    : null,
            el('p', { class: 'inbox-landing-note' }, '没有倒计时、没有连续提醒；它们会一直留在本机，等你想决定的时候。'),
        ));

        const startGentleFocus = async (task) => {
            const result = await focusCommand({ action: 'start', task: { id: task.id, title: task.title } });
            if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
            await setSettings({ rhythm: { ...rhythm, todayFocus: todayFocusPatch(task) } });
            refreshCurrent();
        };
        const resumeTaskIntoToday = async (task, microStepText) => {
            const current = todos.find((item) => item.id === task?.id && !item.completed);
            if (!current) throw new Error('这件事已经不在待办里了。');
            await setSettings({
                todos: { items: todos.map((item) => item.id === current.id
                    ? { ...item, ...resumeContinuationPatch(item, microStepText), ...resumeAcknowledgementPatch(item) }
                    : item) },
                rhythm: { ...rhythm, todayFocus: todayFocusPatch(current) },
            });
            refreshCurrent();
        };
        root.appendChild(sectionTitle('现在这一小段'));
        if (focusCompanion.phase !== 'idle') {
            root.appendChild(el('section', { class: 'card gentle-start-card active' },
                el('div', { class: 'gentle-start-head' },
                    el('div', {}, el('span', {}, 'ONE SMALL STEP'), el('h3', {}, '这一段已经开始了')),
                    el('span', {}, focusCompanion.mode === 'paused' ? '暂停中' : '专注中'),
                ),
                el('p', { class: 'gentle-start-copy' }, focusCompanion.task?.title
                    ? `正陪你走「${focusCompanion.task.title}」。不用再安排别的。`
                    : '这一段正安静进行；想到了什么，也可以先收进收件箱。'),
            ));
        } else if (gentleStart.task) {
            let startButton;
            let laterButton;
            const gentleReconnect = gentleStart.isFollowUp && todayFocus.task?.id !== gentleStart.task.id
                ? resumeReconnectEntry(gentleStart.task, { announce, onResume: resumeTaskIntoToday, surface: 'gentle-start-reconnect' })
                : null;
            startButton = el('button', {
                class: 'gentle-start-button', type: 'button',
                onclick: () => runAsync(startButton, () => startGentleFocus(gentleStart.task), {
                    announce, success: `开始一小段：${gentleStart.task.title}`, failure: (error) => error?.message || '无法开始专注。',
                }),
            }, gentleReconnect ? '直接开始一小段' : '开始一小段');
            laterButton = el('button', {
                class: 'gentle-start-later', type: 'button',
                onclick: () => announce('先放在这里也很好，等你准备好了再开始。'),
            }, '先放着');
            root.appendChild(el('section', { class: 'card gentle-start-card' },
                el('div', { class: 'gentle-start-head' },
                    el('div', {},
                        el('span', {}, gentleStart.isFollowUp ? 'PICK UP HERE' : gentleStart.isMainline ? 'TODAY\'S THREAD' : 'ONE SMALL STEP'),
                        el('h3', {}, gentleStart.isFollowUp ? '上次留的这一步，从这里接着走' : gentleStart.isMainline ? '今天先陪这一件走一小段' : '只需要从这一件开始'),
                    ),
                    el('span', {}, gentleStart.isFollowUp ? '下一步' : gentleStart.isMainline ? '今日主线' : `今天 ${gentleStart.todayCount} 件`),
                ),
                el('strong', { class: 'gentle-start-task' }, gentleStart.task.title),
                el('p', { class: 'gentle-start-copy' }, gentleMicroStep
                    ? `现在这一小步：${gentleMicroStep.text}`
                    : gentleStart.isFollowUp ? `下次从这里开始：${gentleStart.task.note}`
                        : hasResumeHint(gentleStart.task) ? `上次起点：${gentleStart.task.note}`
                            : gentleStart.task.note || '不用完成全部。点一下，先给自己一小段安静的开始。'),
                gentleReconnect,
                el('div', { class: 'gentle-start-actions' }, startButton, laterButton),
                el('small', { class: 'gentle-start-note' }, gentleStart.isFollowUp ? '这是上次专注后留下的下一步；点击才会开始。' : '不会自动开始，也不会因为暂时不做而提醒你。'),
            ));
        } else {
            root.appendChild(el('section', { class: 'card gentle-start-card empty' },
                el('div', { class: 'gentle-start-head' },
                    el('div', {}, el('span', {}, 'ONE SMALL STEP'), el('h3', {}, '今天还没有需要开始的事')),
                    el('span', {}, '留一点空白'),
                ),
                el('p', { class: 'gentle-start-copy' }, '想开始的时候，再从收件箱轻轻放一件到今天；现在什么都不做也没关系。'),
            ));
        }

        const completeFinishedMicroTask = async (task, microNote = '') => {
            const now = Date.now();
            const completed = { ...task, ...appendMicroNotePatch(task, microNote, now), ...taskThreadPatch(task, microNote, now), completed: true, doneAt: now };
            const items = todos.map((item) => item.id === task.id ? completed : item);
            if (task.repeat && task.repeat !== 'none') {
                const due = new Date(now);
                due.setDate(due.getDate() + (task.repeat === 'daily' ? 1 : 7));
                items.push({
                    ...makeInboxTodo(task.title, task.note),
                    microSteps: resetMicroSteps(task.microSteps),
                    dueAt: due.toISOString(), repeat: task.repeat, bucket: 'later',
                });
            }
            const event = {
                id: `rhythm-${now}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'task-complete', at: now, title: task.title, taskId: task.id, minutes: 0,
            };
            await setSettings({
                todos: { items },
                rhythm: { ...rhythm, events: [...(rhythm.events || []), event].slice(-360) },
            });
            refreshCurrent();
        };
        const placeFinishedMicroTask = async (task, action, microNote = '', resumeHint = '') => {
            const notePatch = appendMicroNotePatch(task, microNote);
            const resumePatch = resumeHintPatch(resumeHint);
            if (action === 'today') {
                if (!Object.keys(notePatch).length && !Object.keys(resumePatch).length) return;
                await setSettings({ todos: { items: todos.map((item) => item.id === task.id ? { ...item, ...notePatch, ...resumePatch } : item) } });
                refreshCurrent();
                return;
            }
            const patch = action === 'next'
                ? nextSoftTimeBlockPatch(new Date())
                : dayCloseoutPatch('tomorrow');
            await setSettings({
                todos: { items: todos.map((item) => item.id === task.id ? { ...item, ...notePatch, ...resumePatch, ...patch } : item) },
            });
            refreshCurrent();
        };
        const finishedMicroRow = (task) => {
            const review = buildTaskCloseoutReview(task);
            const input = el('input', {
                class: 'task-closeout-input', type: 'text', maxlength: 120,
                placeholder: '还想继续哪一小步？', 'aria-label': `${task.title} 的下一条微步骤`,
            });
            const microNoteInput = el('input', {
                class: 'task-closeout-note-input', type: 'text', maxlength: 160,
                placeholder: '这一轮推进了什么？（可选）', 'aria-label': `${task.title} 的这一轮小记`,
            });
            const resumeHintInput = el('input', {
                class: 'task-closeout-resume-input', type: 'text', maxlength: 240,
                placeholder: '下次想从哪里接上？（可选）', value: task.note || '', 'aria-label': `${task.title} 的下次开始提示`,
            });
            let addButton;
            const addNextMicroStep = () => runAsync(addButton, () => setSettings({
                todos: { items: todos.map((item) => item.id === task.id ? {
                    ...item, ...beginNextMicroStepPatch(input.value), ...appendMicroNotePatch(task, microNoteInput.value), ...resumeHintPatch(resumeHintInput.value),
                } : item) },
            }).then(() => refreshCurrent()), {
                announce,
                success: '新的这一小步已经放好，想继续时再从这里开始。',
                failure: (error) => error?.message || '先写下想继续的这一小步。',
            });
            addButton = el('button', { class: 'task-closeout-add', type: 'button', onclick: addNextMicroStep }, '补一条小步骤');
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') { event.preventDefault(); addNextMicroStep(); }
            });
            let completeButton;
            completeButton = el('button', {
                class: 'task-closeout-action complete', type: 'button',
                onclick: () => runAsync(completeButton, () => completeFinishedMicroTask(task, microNoteInput.value), {
                    announce, success: `已标记完成：${task.title}`, failure: (error) => error?.message || '暂时没能完成这件事。',
                }),
            }, '标记完成');
            const placeButtons = [
                ['today', '留在今天', '好，它会继续安静留在今天。'],
                ['next', '留到下一段', '已留给下一段；不用现在决定更多。'],
                ['tomorrow', '留给明天', '已留给明天；它会和这组小步骤一起等你。'],
            ].map(([action, label, success]) => {
                let button;
                button = el('button', {
                    class: `task-closeout-action ${action}`, type: 'button',
                    onclick: () => runAsync(button, () => placeFinishedMicroTask(task, action, microNoteInput.value, resumeHintInput.value), {
                        announce, success, failure: (error) => error?.message || '暂时没能安放这件事。',
                    }),
                }, label);
                return button;
            });
            const trace = el('aside', { class: 'task-closeout-trace', 'aria-label': `${task.title} 的本轮回看` },
                el('div', { class: 'task-closeout-trace-head' },
                    el('span', {}, 'JUST WALKED'),
                    el('small', {}, '这件事已经推进了这些'),
                ),
                el('ol', { class: 'task-closeout-trace-steps' }, ...review.steps.map((step, index) => el('li', {},
                    el('span', {}, String(index + 1).padStart(2, '0')),
                    el('strong', {}, step.text),
                ))),
                review.notes.length
                    ? el('ul', { class: 'task-closeout-trace-notes' }, ...review.notes.map((note) => el('li', {},
                        el('span', {}, '小记'),
                        el('p', {}, note.text),
                    )))
                    : el('p', { class: 'task-closeout-trace-empty' }, '这一轮还没有留小记，也不用补。'),
            );
            return el('article', { class: 'task-closeout-row' },
                el('div', { class: 'task-closeout-copy' },
                    el('strong', {}, task.title),
                    el('small', {}, '这几步已经走完了；整件事不必现在也结束。'),
                ),
                trace,
                el('label', { class: 'task-closeout-resume-entry' },
                    el('span', {}, '下次从这里开始 · 可选'),
                    resumeHintInput,
                ),
                el('div', { class: 'task-closeout-entry' }, input, addButton),
                el('div', { class: 'task-closeout-actions' }, completeButton, ...placeButtons),
                el('label', { class: 'task-closeout-note-entry' },
                    el('span', {}, '这一轮小记 · 可选'),
                    microNoteInput,
                ),
            );
        };
        if (finishedMicroTasks.length) {
            root.appendChild(sectionTitle('这几步已经走完了'));
            root.appendChild(el('section', { class: 'card task-closeout-card' },
                el('div', { class: 'task-closeout-head' },
                    el('div', {},
                        el('span', { class: 'task-closeout-kicker' }, 'A QUIET CHECKPOINT'),
                        el('h3', {}, '停在这里，也已经很好'),
                    ),
                    el('span', { class: 'task-closeout-badge' }, '不自动结束'),
                ),
                el('p', { class: 'task-closeout-description' }, '你可以标记完成、补一条新的微步骤，或只是把它留在合适的时间。没有进度条，也不用马上决定。'),
                el('div', { class: 'task-closeout-list' }, ...finishedMicroTasks.slice(0, 3).map(finishedMicroRow)),
            ));
        }

        const placeInCurrentWindow = async (task) => {
            if (!softSchedule.currentId) return;
            await setSettings({
                todos: { items: todos.map((item) => item.id === task.id ? {
                    ...item, bucket: 'today', dueAt: new Date().toISOString(), timeBlock: softSchedule.currentId, tomorrowPlan: '',
                } : item) },
            });
            refreshCurrent();
        };
        const moveToNextWindow = async (task) => {
            await setSettings({
                todos: { items: todos.map((item) => item.id === task.id ? {
                    ...item, ...nextSoftTimeBlockPatch(new Date()),
                } : item) },
            });
            refreshCurrent();
        };
        root.appendChild(sectionTitle('现在这段时间'));
        if (softSchedule.currentId && softSchedule.task) {
            const scheduleReconnect = hasPendingResumeHint(softSchedule.task) && todayFocus.task?.id !== softSchedule.task.id
                ? resumeReconnectEntry(softSchedule.task, { announce, onResume: resumeTaskIntoToday, surface: 'soft-schedule-reconnect' })
                : null;
            let startWindowFocus;
            startWindowFocus = el('button', {
                class: 'soft-schedule-action primary', type: 'button',
                onclick: () => runAsync(startWindowFocus, () => startGentleFocus(softSchedule.task), {
                    announce, success: `开始一小段：${softSchedule.task.title}`, failure: (error) => error?.message || '无法开始专注。',
                }),
            }, scheduleReconnect ? '直接开始一小段' : '开始一小段');
            let scheduleCurrent;
            if (!softSchedule.taskIsAssigned) {
                scheduleCurrent = el('button', {
                    class: 'soft-schedule-action quiet', type: 'button',
                    onclick: () => runAsync(scheduleCurrent, () => placeInCurrentWindow(softSchedule.task), {
                        announce, success: `已轻轻放进${softSchedule.currentLabel}。`, failure: (error) => error?.message || '暂时没能安排这件事。',
                    }),
                }, `放进${softSchedule.currentLabel}`);
            }
            let moveNext;
            if (softSchedule.nearEnd && softSchedule.next) {
                moveNext = el('button', {
                    class: 'soft-schedule-action next', type: 'button',
                    onclick: () => runAsync(moveNext, () => moveToNextWindow(softSchedule.task), {
                        announce,
                        success: softSchedule.next.tomorrow
                            ? '已留给明天上午。'
                            : `已留给${softSchedule.next.label}。`,
                        failure: (error) => error?.message || '暂时没能把它留到下一段。',
                    }),
                }, softSchedule.next.tomorrow ? '留给明天上午' : `留给${softSchedule.next.label}`);
            }
            root.appendChild(el('section', { class: `card soft-schedule-card ${softSchedule.nearEnd ? 'near-end' : ''}` },
                el('div', { class: 'soft-schedule-head' },
                    el('div', {},
                        el('span', { class: 'soft-schedule-kicker' }, softSchedule.nearEnd ? 'A GENTLE HANDOFF' : 'THIS SOFT WINDOW'),
                        el('h3', {}, softSchedule.nearEnd ? `${softSchedule.currentLabel}快到尾声了` : `这会儿，适合先陪这一件走一小段`),
                    ),
                    el('span', { class: 'soft-schedule-badge' }, `${softSchedule.currentLabel} · ${softSchedule.currentCount} 件`),
                ),
                el('strong', { class: 'soft-schedule-task' }, softSchedule.task.title),
                el('p', { class: 'soft-schedule-copy' }, softSchedule.nearEnd
                    ? `还没开始也没关系；它可以安静留给${softSchedule.next?.tomorrow ? '明天上午' : softSchedule.next?.label || '下一段'}。`
                    : (scheduleMicroStep ? `现在这一小步：${scheduleMicroStep.text}` : hasPendingResumeHint(softSchedule.task) ? `下次从这里开始：${softSchedule.task.note}` : hasResumeHint(softSchedule.task) ? `上次起点：${softSchedule.task.note}` : softSchedule.task.note || '不需要填满这一段。想开始时，先做一点点就好。')),
                scheduleReconnect,
                el('div', { class: 'soft-schedule-actions' }, startWindowFocus, scheduleCurrent, moveNext),
                el('small', { class: 'soft-schedule-note' }, '只在首页静静出现；不会发通知，也不会替你开始。'),
            ));
        } else {
            root.appendChild(el('section', { class: 'card soft-schedule-card empty' },
                el('div', { class: 'soft-schedule-head' },
                    el('div', {},
                        el('span', { class: 'soft-schedule-kicker' }, 'A LITTLE OPEN SPACE'),
                        el('h3', {}, softSchedule.currentId ? `${softSchedule.currentLabel}先留一点空白` : '此刻不在需要安排的时段'),
                    ),
                    el('span', { class: 'soft-schedule-badge' }, softSchedule.currentId ? '没有催促' : '自在一点'),
                ),
                el('p', { class: 'soft-schedule-copy' }, softSchedule.currentId
                    ? '这一段没有待处理的安排。想休息、发呆，或晚点再回来都可以。'
                    : '上午、下午和晚上之间本来就有留白；不需要把每一刻都安排起来。'),
            ));
        }

        const placeCloseoutTask = async (task, action) => {
            if (action === 'today') return;
            const patch = dayCloseoutPatch(action);
            await setSettings({
                todos: { items: todos.map((item) => item.id === task.id ? { ...item, ...patch } : item) },
            });
            refreshCurrent();
        };
        const homeCloseoutRow = (task) => {
            const actions = [
                ['today', '留在今天'],
                ['tomorrow', '放到明天'],
                ['inbox', '回收件箱'],
            ].map(([action, label]) => {
                let button;
                button = el('button', {
                    class: `home-closeout-action ${action}`, type: 'button',
                    onclick: () => runAsync(button, () => placeCloseoutTask(task, action), {
                        announce,
                        success: action === 'today'
                            ? '好，它还留在今天。'
                            : action === 'tomorrow'
                                ? '已留给明天；下一步也会一起等你。'
                                : '已送回收件箱。',
                        failure: (error) => error?.message || '暂时没能更新这件事。',
                    }),
                }, label);
                return button;
            });
            return el('article', { class: 'home-closeout-row' },
                el('div', { class: 'home-closeout-copy' },
                    el('strong', {}, task.title),
                    currentMicroStep(task)
                        ? el('small', {}, `当前一小步：${currentMicroStep(task).text}`)
                        : task.note
                            ? el('small', {}, `下一步：${task.note}`)
                        : el('small', {}, '不必现在做完，先决定它待在哪里。'),
                ),
                el('div', { class: 'home-closeout-actions' }, ...actions),
            );
        };
        root.appendChild(sectionTitle('今天先收到这里'));
        root.appendChild(el('section', { class: 'card home-closeout-card' },
            el('div', { class: 'home-closeout-head' },
                el('div', {},
                    el('span', { class: 'home-closeout-kicker' }, 'A QUIET LANDING'),
                    el('h3', {}, homeCloseout.inProgress ? '今天，先轻轻收在这里' : '今天已经安稳落下了'),
                ),
                el('span', { class: 'home-closeout-badge' }, '不打扰'),
            ),
            el('div', { class: 'home-closeout-counts', 'aria-label': `今天已完成 ${homeCloseout.completed} 件，正在进行 ${homeCloseout.inProgress} 件，留待以后 ${homeCloseout.later} 件` },
                el('span', {}, '已完成', el('strong', {}, String(homeCloseout.completed))),
                el('span', {}, '正在进行', el('strong', {}, String(homeCloseout.inProgress))),
                el('span', {}, '留待以后', el('strong', {}, String(homeCloseout.later))),
            ),
            homeCloseout.pending.length
                ? el('div', { class: 'home-closeout-list' },
                    el('p', { class: 'home-closeout-description' }, '还在路上的事，给它一个去处就够了。'),
                    ...homeCloseout.pending.slice(0, 3).map(homeCloseoutRow),
                )
                : el('p', { class: 'home-closeout-empty' }, '没有正在等待归位的任务。留一点余白，也很好。'),
            el('p', { class: 'home-closeout-note' }, '不会自动弹出。专注后留下的下一步，会跟着任务自然续到明天。'),
        ));

        const weekDays = rhythmSummary.week.map((day) => el('article', {
            class: `rhythm-day level-${day.level} ${day.date === rhythmSummary.todayKey ? 'today' : ''}`,
            title: `${day.date}：${day.focusMinutes} 分钟专注，完成 ${day.tasks} 项任务`,
            'aria-label': `${day.date}，${day.focusMinutes} 分钟专注，完成 ${day.tasks} 项任务`,
        },
            el('span', { class: 'rhythm-weekday' }, day.weekday),
            el('strong', {}, String(day.day)),
            el('small', {}, day.focusMinutes ? `${day.focusMinutes}m` : '—'),
        ));
        const eventRows = rhythmSummary.todayEvents.slice(0, 6).map((event) => el('li', { class: `rhythm-event event-${event.type}` },
            el('time', { datetime: new Date(event.at).toISOString() }, formatRhythmTime(event.at)),
            el('span', { class: 'rhythm-event-dot', 'aria-hidden': 'true' }),
                el('span', { class: 'rhythm-event-copy' },
                    el('strong', {}, formatRhythmEvent(event)),
                    event.minutes ? el('small', {}, `实际 ${event.minutes} 分钟`) : null,
                    event.detail ? el('small', { class: 'rhythm-event-detail' }, event.detail) : null,
                ),
        ));
        const reflection = rhythmSummary.reflection;
        const reflectionNote = el('textarea', {
            class: 'rhythm-reflection-note',
            rows: 3,
            maxlength: 280,
            placeholder: '今天有哪些值得记住的进展？',
            value: reflection.note || '',
            'aria-label': '今日轻复盘',
        });
        const tomorrow = el('input', {
            class: 'rhythm-tomorrow',
            type: 'text',
            maxlength: 120,
            placeholder: '明天第一件事',
            value: reflection.tomorrow || '',
            'aria-label': '明天第一件事',
        });
        const tomorrowStart = buildTomorrowStart({ todos });
        let addTomorrowTask;
        addTomorrowTask = el('button', {
            class: 'secondary rhythm-tomorrow-add',
            type: 'button',
            onclick: () => runAsync(addTomorrowTask, async () => {
                const title = String(tomorrow.value || '').trim().slice(0, 120);
                if (!title) throw new Error('先写下明天第一件想开始的事。');
                if (tomorrowStart.important) throw new Error('明天已经有一件最重要的事了。');
                await setSettings({ todos: { items: [
                    ...todos,
                    { ...makeInboxTodo(title), ...tomorrowPlanPatch('important') },
                ] } });
            }, {
                announce,
                success: '已加入明天最重要的一件事。',
                failure: (error) => error.message,
            }),
        }, '加入明天');
        let saveReflection;
        saveReflection = el('button', {
            class: 'action rhythm-save',
            type: 'button',
            onclick: () => runAsync(saveReflection, async () => {
                const nextReflections = {
                    ...(rhythm.reflections || {}),
                    [rhythmSummary.todayKey]: {
                        note: String(reflectionNote.value || '').trim().slice(0, 280),
                        tomorrow: String(tomorrow.value || '').trim().slice(0, 120),
                        closeout: String(reflection.closeout || '').trim().slice(0, 280),
                        updatedAt: Date.now(),
                    },
                };
                await setSettings({ rhythm: { ...rhythm, reflections: nextReflections } });
            }, { announce, success: '今日复盘已保存。' }),
        }, '保存复盘');

        root.appendChild(el('section', { class: 'card rhythm-card' },
            el('div', { class: 'rhythm-card-head' },
                el('div', {},
                    el('span', { class: 'focus-kicker' }, 'RHYTHM LEDGER'),
                    el('h3', {}, '今日节奏，轻轻回看'),
                ),
                el('span', { class: 'rhythm-local-badge' }, '仅本机保存'),
            ),
            el('p', { class: 'rhythm-card-description' }, '真实记录来自专注、任务和场景切换；没有联网同步，也不需要打卡压力。'),
            el('div', { class: 'rhythm-week', role: 'list', 'aria-label': '最近七天专注记录' }, ...weekDays),
            el('div', { class: 'rhythm-today-grid' },
                el('div', { class: 'rhythm-stat' }, el('small', {}, '完成专注'), el('strong', {}, `${rhythmSummary.completedFocus} 次`)),
                el('div', { class: 'rhythm-stat' }, el('small', {}, '完成任务'), el('strong', {}, `${rhythmSummary.completedTasks} 项`)),
                el('div', { class: 'rhythm-stat' }, el('small', {}, '今日完成率'), el('strong', {}, rhythmSummary.plannedTasks ? `${rhythmSummary.completionRate}%` : '—')),
                el('div', { class: 'rhythm-stat subdued' }, el('small', {}, '跳过专注'), el('strong', {}, `${rhythmSummary.skippedFocus} 次`)),
            ),
            el('div', { class: 'rhythm-detail-grid' },
                el('div', { class: 'rhythm-timeline-wrap' },
                    el('h4', {}, '今日时间线'),
                    eventRows.length
                        ? el('ol', { class: 'rhythm-timeline' }, ...eventRows)
                        : el('p', { class: 'rhythm-empty' }, '还没有记录。开始一轮专注、完成一项任务，或切换场景都会出现在这里。'),
                ),
                el('div', { class: 'rhythm-reflection-wrap' },
                    el('h4', {}, '轻复盘'),
                    el('label', {}, '今天完成了什么？', reflectionNote),
                    el('label', {}, '明天第一件事', el('div', { class: 'rhythm-tomorrow-action' }, tomorrow, addTomorrowTask)),
                    saveReflection,
                ),
            ),
        ));

        const weeklyGoalInputs = Array.from({ length: 3 }, (_, index) => el('input', {
            class: 'weekly-goal-input',
            type: 'text',
            maxlength: 100,
            placeholder: `轻目标 ${index + 1}（可留空）`,
            value: weeklyReview.goals[index] || '',
            'aria-label': `下周轻目标 ${index + 1}`,
        }));
        let saveWeeklyPlan;
        saveWeeklyPlan = el('button', {
            class: 'action weekly-save',
            type: 'button',
            onclick: () => runAsync(saveWeeklyPlan, async () => {
                const goals = weeklyGoalInputs
                    .map((input) => String(input.value || '').trim().slice(0, 100))
                    .filter(Boolean)
                    .filter((goal, index, all) => all.indexOf(goal) === index)
                    .slice(0, 3);
                const weeklyPlans = {
                    ...(rhythm.weeklyPlans || {}),
                    [weeklyReview.nextWeekKey]: { goals, updatedAt: Date.now() },
                };
                await setSettings({ rhythm: { ...rhythm, weeklyPlans } });
            }, { announce, success: '下周轻目标已保存。' }),
        }, '保存下周目标');
        let addWeeklyGoals;
        addWeeklyGoals = el('button', {
            class: 'data-action secondary weekly-to-inbox',
            type: 'button',
            onclick: () => runAsync(addWeeklyGoals, async () => {
                const existing = new Set(todos
                    .filter((item) => !item.completed)
                    .map((item) => String(item.title || '').trim()));
                const additions = weeklyReview.goals
                    .filter((goal) => !existing.has(goal))
                    .map(makeInboxTodo);
                if (!additions.length) return 0;
                await setSettings({ todos: { items: [...todos, ...additions] } });
                return additions.length;
            }, {
                announce,
                success: (count) => count ? `已将 ${count} 个轻目标放进收件箱。` : '没有新的轻目标需要转成待办。',
            }),
        }, '轻目标转待办');
        const weeklyBars = weeklyReview.week.map((day) => el('div', {
            class: `weekly-bar level-${day.level}`,
            title: `${day.weekday}：${day.focusMinutes} 分钟`,
            'aria-label': `${day.weekday} ${day.focusMinutes} 分钟专注`,
        },
            el('span', { class: 'weekly-bar-fill' }),
            el('small', {}, day.weekday.replace('周', '')),
        ));
        const bestDayCopy = weeklyReview.bestDay
            ? `${weeklyReview.bestDay.weekday} · ${weeklyReview.bestDay.focusMinutes} 分钟`
            : '下周慢慢找到自己的节奏';

        root.appendChild(el('section', { class: 'card weekly-review-card' },
            el('div', { class: 'weekly-review-head' },
                el('div', {},
                    el('span', { class: 'weekly-kicker' }, 'WEEKEND NOTE'),
                    el('h3', {}, '这一周，已经做得很好'),
                ),
                el('span', { class: 'weekly-range' }, '最近 7 天'),
            ),
            el('p', { class: 'weekly-encouragement' }, weeklyReview.encouragement),
            el('div', { class: 'weekly-review-grid' },
                el('div', { class: 'weekly-total' },
                    el('span', {}, '真实专注'),
                    el('strong', {}, `${weeklyReview.focusMinutes}`),
                    el('small', {}, '分钟'),
                ),
                el('div', { class: 'weekly-facts' },
                    el('div', {}, el('span', {}, '有节奏的日子'), el('strong', {}, `${weeklyReview.activeDays} 天`)),
                    el('div', {}, el('span', {}, '完成任务'), el('strong', {}, `${weeklyReview.week.reduce((sum, day) => sum + day.tasks, 0)} 项`)),
                    el('div', {}, el('span', {}, '最稳定的一天'), el('strong', {}, bestDayCopy)),
                ),
                el('div', { class: 'weekly-bars', role: 'list', 'aria-label': '最近七天专注强度' }, ...weeklyBars),
            ),
            el('div', { class: 'weekly-plan-wrap' },
                el('div', { class: 'weekly-plan-copy' },
                    el('h4', {}, '下周轻目标'),
                    el('p', {}, '只留 1–3 件想推进的事；它们是方向，不是必须完成的清单。'),
                ),
                el('div', { class: 'weekly-goal-fields' }, ...weeklyGoalInputs,
                    el('div', { class: 'weekly-goal-actions' }, saveWeeklyPlan, addWeeklyGoals)),
            ),
        ));
    },
};

// ============ Achievements ============
export const achievementsTab = {
    render(root, { getSettings }) {
        const unlocked = getSettings().achievements?.unlocked || {};
        const achievements = Object.values(ACHIEVEMENTS);
        const unlockedCount = achievements.filter((item) => unlocked[item.id]).length;

        root.appendChild(panelHeader(
            `${unlockedCount} / ${achievements.length} 已解锁`,
            '成就收藏',
            '持续陪伴、完成专注和探索隐藏互动，都会留下纪念。',
        ));

        const tileGrid = (items) => el('div', { class: 'tile-grid achievement-grid' },
            ...items.map((achievement) => {
                const record = unlocked[achievement.id];
                const lockedLabel = achievement.hidden ? '隐藏成就' : achievement.label;
                const date = record?.unlockedAt ? new Date(record.unlockedAt) : null;
                return el('article', {
                    class: `tile achievement-tile ${record ? 'unlocked' : 'locked'}`,
                    'aria-label': `${record ? '已解锁' : '未解锁'}：${record ? achievement.label : lockedLabel}`,
                },
                    el('span', { class: 'tile-status' }, record ? '已解锁' : '未解锁'),
                    el('h4', {}, record ? achievement.label : lockedLabel),
                    date && !Number.isNaN(date.valueOf())
                        ? el('time', { datetime: date.toISOString() }, date.toLocaleDateString())
                        : el('small', {}, achievement.hidden ? '继续探索房间' : '等待达成条件'),
                );
            }),
        );

        root.appendChild(sectionTitle('公开成就'));
        root.appendChild(tileGrid(achievements.filter((item) => !item.hidden)));
        root.appendChild(sectionTitle('隐藏成就'));
        root.appendChild(tileGrid(achievements.filter((item) => item.hidden)));
    },
};

// ============ Outfits ============
export const outfitsTab = {
    render(root, { getSettings, setSettings, announce }) {
        const active = getSettings().settings?.outfit || 'default';
        root.appendChild(panelHeader('衣橱', '服装搭配', '服装可以即时切换；薰衣草睡衣已覆盖全部 18 个动作。'));

        const outfitTiles = OUTFITS.map((outfit) => {
            let button;
            button = el('button', {
                class: `tile outfit-tile interactive ${active === outfit.id ? 'active' : ''}`,
                type: 'button',
                'aria-pressed': String(active === outfit.id),
                onclick: () => runAsync(button, async () => {
                    await setSettings({ settings: { outfit: outfit.id } });
                    for (const tile of root.querySelectorAll('button.outfit-tile')) {
                        const selected = tile === button;
                        tile.classList.toggle('active', selected);
                        tile.setAttribute('aria-pressed', String(selected));
                        const status = tile.querySelector('[data-outfit-status]');
                        if (status) status.textContent = selected ? '当前穿着' : '点击换装';
                    }
                }, { announce, success: `已换上${outfit.label}。` }),
            },
                el('span', { class: `outfit-swatch ${outfit.swatchClass}`, 'aria-hidden': 'true' }),
                el('strong', {}, outfit.label),
                el('small', { 'data-outfit-status': '' }, active === outfit.id ? '当前穿着' : '点击换装'),
                el('small', { class: 'outfit-description' },
                    outfit.completedStates
                        ? `${outfit.description} · ${outfit.completedStates.length}/18 个动作`
                        : outfit.description),
            );
            return button;
        });

        const placeholders = ['樱花', '夜色', '运动', '学生'].map((name) =>
            el('article', { class: 'tile outfit-tile locked', 'aria-disabled': 'true' },
                el('span', { class: 'outfit-swatch locked-swatch', 'aria-hidden': 'true' }),
                el('strong', {}, name),
                el('small', {}, '等待素材'),
            ),
        );

        root.appendChild(el('div', { class: 'tile-grid outfit-grid' }, ...outfitTiles, ...placeholders));
        root.appendChild(el('p', { class: 'room-note' },
            '薰衣草睡衣已覆盖全部动作；换装无需重启应用。'));
    },
};

// ============ Feed / interaction ============
export const feedTab = {
    render(root, { getSettings, setSettings, announce, focusCommand, getFocusState, refreshCurrent }) {
        let mood = { ...(getSettings().mood || {}) };
        root.appendChild(panelHeader('陪伴行动', '一起做点什么', '选择一个轻量互动，状态会立即同步到桌面宠物。'));

        const allTodos = getSettings().todos?.items || [];
        const rhythm = getSettings().rhythm || {};
        const inboxTasks = allTodos.filter((item) => todoBucket(item) === 'inbox');
        const todayTasks = allTodos
            .filter((item) => todoBucket(item) === 'today' && (!hasFinishedMicroSteps(item) || hasPendingResumeHint(item)))
            .sort((left, right) => Number(hasPendingResumeHint(right)) - Number(hasPendingResumeHint(left))
                || (hasPendingResumeHint(right) ? Number(right.nextStepAt || 0) : 0) - (hasPendingResumeHint(left) ? Number(left.nextStepAt || 0) : 0));
        const storedTodayFocus = buildTodayFocus({ focus: rhythm.todayFocus, todos: allTodos });
        const todayFocus = storedTodayFocus.task && (!hasFinishedMicroSteps(storedTodayFocus.task) || hasPendingResumeHint(storedTodayFocus.task))
            ? storedTodayFocus
            : { ...storedTodayFocus, task: null };
        const todayResumeTask = todayFocus.task ? null : todayTasks.find((task) => hasPendingResumeHint(task)) || null;
        const companion = buildFocusCompanion(getFocusState());
        const focusEchoes = buildTodayFocusEchoes({ rhythm, todayFocus });
        const laterTasks = allTodos.filter((item) => todoBucket(item) === 'later');
        const waitingTasks = allTodos.filter((item) => todoBucket(item) === 'waiting');
        const archivedTasks = allTodos.filter((item) => todoBucket(item) === 'archive');
        const completedTasks = completedToday({ todos: allTodos });
        const stale = staleTasks({ todos: allTodos });
        const dayCloseout = buildDayCloseout({ todos: allTodos });
        const tomorrowStart = buildTomorrowStart({ todos: allTodos });
        const todayStart = buildTodayStart({ todos: allTodos });
        const nextTimeBlock = nextOpenTimeBlock(todayTasks);
        const applyTodoPatch = async (id, patch) => {
            await setSettings({ todos: {
                items: allTodos.map((item) => item.id === id ? { ...item, ...patch } : item),
            } });
            refreshCurrent();
        };
        const placeTodo = (task, bucket) => applyTodoPatch(task.id, bucket === 'today' && todoBucket(task) === 'waiting'
            ? resumeWaitingTaskPatch(task)
            : {
                bucket,
                dueAt: bucket === 'today' ? new Date().toISOString() : null,
                timeBlock: bucket === 'today' ? task.timeBlock || '' : '',
                tomorrowPlan: bucket === 'today' ? '' : task.tomorrowPlan || '',
            });
        const completeTodo = async (task, threadNote = '') => {
            const now = Date.now();
            const updated = { ...task, ...taskThreadPatch(task, threadNote, now), completed: true, doneAt: now };
            const nextItems = allTodos.map((item) => item.id === task.id ? updated : item);
            if (task.repeat && task.repeat !== 'none') {
                const due = new Date(now);
                due.setDate(due.getDate() + (task.repeat === 'daily' ? 1 : 7));
                nextItems.push({ ...makeInboxTodo(task.title, task.note), dueAt: due.toISOString(), repeat: task.repeat, bucket: 'later' });
            }
            const event = {
                id: `rhythm-${now}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'task-complete', at: now, title: task.title, taskId: task.id, minutes: 0,
            };
            await setSettings({
                todos: { items: nextItems },
                rhythm: { ...rhythm, events: [...(rhythm.events || []), event].slice(-360) },
            });
            refreshCurrent();
        };
        const closeoutTask = (task, action) => action === 'today'
            ? Promise.resolve()
            : applyTodoPatch(task.id, dayCloseoutPatch(action));
        const planTomorrowTask = (task, role) => {
            if (!canPlanTomorrow({ todos: allTodos, role })) throw new Error(role === 'important'
                ? '明天已经有一件最重要的事了。'
                : '明天的可做事项最多保留两件。');
            return applyTodoPatch(task.id, tomorrowPlanPatch(role));
        };
        const returnTomorrowTask = (task) => applyTodoPatch(task.id, returnToInboxPatch());
        const archiveTask = (task, threadNote = '') => applyTodoPatch(task.id, {
            ...archiveTaskPatch(), ...taskThreadPatch(task, threadNote),
        });
        const restoreTask = (task) => applyTodoPatch(task.id, restoreTaskPatch());
        const undoCompletion = (task, destination) => applyTodoPatch(task.id, restoreCompletedTaskPatch(task, destination));
        const setTodayFocus = async (task) => {
            await setSettings({ rhythm: { ...rhythm, todayFocus: task ? todayFocusPatch(task) : clearTodayFocusPatch() } });
            refreshCurrent();
        };
        const resumeTaskIntoToday = async (task, microStepText) => {
            const current = allTodos.find((item) => item.id === task?.id && !item.completed);
            if (!current) throw new Error('这件事已经不在待办里了。');
            await setSettings({
                todos: { items: allTodos.map((item) => item.id === current.id
                    ? { ...item, ...resumeContinuationPatch(item, microStepText), ...resumeAcknowledgementPatch(item) }
                    : item) },
                rhythm: { ...rhythm, todayFocus: todayFocusPatch(current) },
            });
            refreshCurrent();
        };
        const startTodayFocus = async (task) => {
            const result = await focusCommand({ action: 'start', task: { id: task.id, title: task.title } });
            if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
        };
        const startSearchFocus = async (task) => {
            const result = await focusCommand({ action: 'start', task: { id: task.id, title: task.title } });
            if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
        };
        const startCarriedFocus = async (task) => {
            const result = await focusCommand({ action: 'start', task: { id: task.id, title: task.title } });
            if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
            await applyTodoPatch(task.id, beginTodayPatch());
        };
        const sendFocusAction = async (action) => {
            const result = await focusCommand({ action });
            if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
        };
        const captureFocusThought = async (title) => {
            const todo = makeInboxTodo(title, '专注中随手收集 · 稍后再看');
            if (!todo.title) throw new Error('先写下一件想记住的事。');
            const result = await focusCommand({ action: 'capture', title: todo.title });
            if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
            await setSettings({ todos: { items: [...allTodos, todo] } });
            refreshCurrent();
            return todo;
        };
        const saveFocusNextStep = async (task, note, { scheduleNext = false } = {}) => {
            const nextStep = String(note || '').replace(/\u0000/g, '').trim().slice(0, 240);
            if (!nextStep && !scheduleNext) throw new Error('先写下一句想从哪里开始。');
            const current = allTodos.find((item) => item.id === task?.id && !item.completed);
            if (!current) throw new Error('这件事已经不在待办里了。');
            await setSettings({ todos: {
                items: allTodos.map((item) => item.id === current.id
                    ? {
                        ...item,
                        ...(scheduleNext ? nextSoftTimeBlockPatch(new Date()) : {}),
                        note: nextStep || current.note || '',
                        nextStepAt: Date.now(),
                    }
                    : item),
            } });
            refreshCurrent();
        };
        const saveDayCloseout = async () => {
            const now = Date.now();
            const previous = rhythm.reflections?.[dayCloseout.todayKey] || {};
            const closeout = buildDayCloseout({ todos: allTodos });
            const reflections = {
                ...(rhythm.reflections || {}),
                [closeout.todayKey]: {
                    note: String(previous.note || '').trim().slice(0, 280),
                    tomorrow: String(previous.tomorrow || '').trim().slice(0, 120),
                    closeout: closeout.summary,
                    updatedAt: now,
                },
            };
            await setSettings({ rhythm: { ...rhythm, reflections } });
            refreshCurrent();
        };
        const openTaskEditor = (task, { initialBucket = todoBucket(task), focusWaitingNote = false } = {}) => {
            const editableBucket = ['inbox', 'today', 'later', 'waiting', 'archive'].includes(initialBucket)
                ? initialBucket
                : (['inbox', 'today', 'later', 'waiting', 'archive'].includes(task.bucket) ? task.bucket : 'inbox');
            const noteLabel = hasPendingResumeHint(task)
                ? '下次起点（还会在首页轻轻出现）'
                : hasResumeHint(task)
                    ? '上次起点（已接上，可改）'
                    : '下一步（可选）';
            const noteHint = hasPendingResumeHint(task)
                ? '这句还在等你自然接上；保存可改写它。'
                : hasResumeHint(task)
                    ? '这句会留作上次起点，不会再反复抢占建议。'
                    : '想留下的话，它会在下一次收束时成为起点。';
            const titleInput = el('input', {
                class: 'task-editor-input', id: 'task-editor-title', type: 'text', maxlength: 120,
                value: task.title || '', 'aria-label': '任务标题',
            });
            const noteInput = el('textarea', {
                class: 'task-editor-note', maxlength: 240, rows: 3,
                placeholder: '例如：先找三份参考资料', 'aria-label': noteLabel, value: task.note || '',
            });
            const waitingNoteInput = el('input', {
                class: 'task-editor-input task-editor-waiting-note', type: 'text', maxlength: 160,
                placeholder: '例如：等对方确认时间（可选）', 'aria-label': '正在等什么（可选）', value: task.waitingNote || '',
            });
            const threadNoteInput = el('input', {
                class: 'task-editor-input', type: 'text', maxlength: 160,
                placeholder: '例如：资料已整理好，等确认后继续（可选）', 'aria-label': '这次做到哪了（可选）', value: task.threadNote || '',
            });
            const microStepInputs = [0, 1, 2].map((index) => el('input', {
                class: 'task-editor-micro-input', type: 'text', maxlength: 120,
                placeholder: index === 0 ? '例如：打开资料文件夹' : '再留一件小事（可选）',
                value: task.microSteps?.[index]?.text || '',
                'aria-label': `微步骤 ${index + 1}（可选）`,
            }));
            const bucketInput = el('select', { class: 'task-editor-location', 'aria-label': '任务位置', value: editableBucket },
                el('option', { value: 'inbox' }, '收件箱'),
                el('option', { value: 'today' }, '今天'),
                el('option', { value: 'later' }, '稍后'),
                el('option', { value: 'waiting' }, '先等着'),
                el('option', { value: 'archive' }, '归档'),
            );
            bucketInput.value = editableBucket;
            const close = () => backdrop.remove();
            let saveButton;
            const form = el('form', {
                class: 'task-editor-form',
                onsubmit: (event) => {
                    event.preventDefault();
                    runAsync(saveButton, async () => {
                        const patch = taskEditorPatch({
                            task, title: titleInput.value, note: noteInput.value, waitingNote: waitingNoteInput.value, threadNote: threadNoteInput.value,
                            microSteps: microStepInputs.map((input, index) => ({ text: input.value, completed: task.microSteps?.[index]?.completed === true })),
                            bucket: bucketInput.value,
                        });
                        if (patch.bucket === 'waiting' && todayFocus.task?.id === task.id) {
                            await setSettings({
                                todos: { items: allTodos.map((item) => item.id === task.id ? { ...item, ...patch } : item) },
                                rhythm: { ...rhythm, todayFocus: clearTodayFocusPatch() },
                            });
                            refreshCurrent();
                            return;
                        }
                        await applyTodoPatch(task.id, patch);
                    }, { announce, success: '任务已轻轻更新。', failure: (error) => error?.message || '无法保存任务。' });
                },
            },
            el('div', { class: 'task-editor-head' },
                el('div', {}, el('span', {}, 'TASK NOTE'), el('h3', {}, '把这件事改得刚刚好')),
                el('button', { class: 'task-editor-close', type: 'button', 'aria-label': '关闭编辑', onclick: close }, '×'),
            ),
            el('label', { class: 'task-editor-label', for: 'task-editor-title' }, '任务标题'),
            titleInput,
            el('label', { class: 'task-editor-label', for: 'task-editor-note' }, noteLabel),
            noteInput,
            el('small', { class: 'task-editor-note-hint' }, noteHint),
            el('label', { class: 'task-editor-label' }, '正在等什么（可选）'),
            waitingNoteInput,
            taskThreadDetail(task),
            el('label', { class: 'task-editor-label' }, '这次做到哪了（可选）'),
            threadNoteInput,
            el('small', { class: 'task-editor-note-hint' }, '完成或归档前留一句，之后仍可在这里补充或修改。'),
            el('div', { class: 'task-editor-micro' },
                el('div', { class: 'task-editor-micro-head' },
                    el('span', {}, 'TINY ACTIONS · 可选'),
                    el('small', {}, '留 1～3 件够小、够容易开始的事'),
                ),
                ...microStepInputs,
            ),
            el('label', { class: 'task-editor-label' }, '放在哪里', bucketInput),
            el('p', { class: 'task-editor-hint' }, '微步骤不计分，也不会自动完成任务；只会让当前的一小步更容易看见。'),
            el('div', { class: 'task-editor-actions' },
                el('button', { class: 'task-editor-cancel', type: 'button', onclick: close }, '先不改'),
                saveButton = el('button', { class: 'task-editor-save', type: 'submit' }, '保存修改'),
            ));
            const backdrop = el('div', { class: 'task-editor-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': '编辑任务' }, form);
            backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
            backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
            root.appendChild(backdrop);
            (focusWaitingNote ? waitingNoteInput : titleInput).focus();
            if (!focusWaitingNote) titleInput.select();
        };
        const laneRow = (task, lane) => {
            const actions = [];
            const activeMicroStep = currentMicroStep(task);
            const recentMicroNote = latestMicroNote(task);
            let completeButton;
            completeButton = el('button', {
                class: 'todo-complete-button', type: 'button',
                onclick: () => openTaskThreadCapture(root, task, {
                    kicker: 'A QUIET FINISH', title: '把这一段轻轻收好', actionLabel: '标记完成', success: `已完成：${task.title}`,
                    announce, onSave: (threadNote) => completeTodo(task, threadNote),
                }),
            }, '完成');
            actions.push(completeButton);
            if (activeMicroStep) {
                let completeMicroButton;
                completeMicroButton = el('button', {
                    class: 'todo-lane-button todo-micro-step-button', type: 'button',
                    onclick: () => runAsync(completeMicroButton, () => applyTodoPatch(
                        task.id,
                        completeMicroStepPatch(task, activeMicroStep.id),
                    ), {
                        announce,
                        success: '这一小步已经收好，下一步会自然出现。',
                        failure: (error) => error?.message || '暂时没能更新这一小步。',
                    }),
                }, '收好小步');
                actions.push(completeMicroButton);
            }
            if (lane !== 'today') {
                let todayButton;
                todayButton = el('button', {
                    class: 'todo-lane-button', type: 'button',
                    onclick: () => runAsync(todayButton, () => placeTodo(task, 'today'), { announce, success: '已放到今天。' }),
                }, '放到今天');
                actions.push(todayButton);
            }
            if (lane !== 'later') {
                let laterButton;
                laterButton = el('button', {
                    class: 'todo-lane-button', type: 'button',
                    onclick: () => runAsync(laterButton, () => placeTodo(task, 'later'), { announce, success: '已放到稍后。' }),
                }, '稍后');
                actions.push(laterButton);
            }
            if (lane !== 'waiting') {
                const waitButton = el('button', {
                    class: 'todo-lane-button todo-wait-button', type: 'button',
                    onclick: () => openTaskEditor(task, { initialBucket: 'waiting', focusWaitingNote: true }),
                }, '先等着');
                actions.push(waitButton);
            }
            if (lane === 'today') {
                let mainlineButton;
                const isMainline = todayFocus.task?.id === task.id;
                mainlineButton = el('button', {
                    class: `todo-lane-button todo-mainline-button ${isMainline ? 'active' : ''}`, type: 'button',
                    onclick: () => runAsync(mainlineButton, () => setTodayFocus(isMainline ? null : task), {
                        announce, success: isMainline ? '今日主线已清空。' : '已设为今日主线。',
                    }),
                }, isMainline ? '主线中' : '设为主线');
                actions.push(mainlineButton);
                if (!task.timeBlock) {
                    let nextBlockButton;
                    nextBlockButton = el('button', {
                        class: 'todo-lane-button todo-time-quick', type: 'button',
                        onclick: () => runAsync(nextBlockButton, () => applyTodoPatch(task.id, { timeBlock: nextTimeBlock.id }), {
                            announce, success: `已安排到${nextTimeBlock.label}。`,
                        }),
                    }, `安排${nextTimeBlock.label}`);
                    actions.push(nextBlockButton);
                }
                const timeSelect = el('select', {
                    class: 'todo-time-select', 'aria-label': `${task.title} 的时间块`, value: task.timeBlock || '',
                    onchange: (event) => runAsync(event.target, () => applyTodoPatch(task.id, { timeBlock: event.target.value }), {
                        announce,
                        success: () => event.target.value ? `已安排到${timeBlockLabel(event.target.value)}。` : '已移出时间块。',
                    }),
                },
                el('option', { value: '' }, '未安排'),
                ...TIME_BLOCKS.map((block) => el('option', { value: block.id }, block.label)));
                actions.push(timeSelect);
            }
            const editButton = el('button', {
                class: 'todo-lane-button todo-edit-button', type: 'button', onclick: () => openTaskEditor(task),
            }, '编辑');
            actions.push(editButton);
            return el('article', { class: `todo-board-row lane-${lane}` },
                el('div', { class: 'todo-board-copy' },
                    el('strong', {}, task.title),
                    el('small', {}, lane === 'waiting'
                        ? task.waitingNote ? `正在等 · ${task.waitingNote}` : '正在等一个合适的时机'
                        : activeMicroStep
                        ? `当前一小步 · ${activeMicroStep.text}`
                        : hasFinishedMicroSteps(task) ? '这几步已经走完了 · 任务仍由你决定何时结束'
                        : task.note ? `下一步 · ${task.note}` : task.dueAt ? `已安排 ${task.dueAt.slice(0, 10)}` : '尚未安排时间'),
                    recentMicroNote ? el('small', { class: 'todo-micro-note' }, `最近小记 · ${recentMicroNote.text}`) : null,
                ),
                el('div', { class: 'todo-board-actions' }, ...actions),
            );
        };
        const lane = (label, caption, tasks, laneName) => el('section', { class: `todo-lane lane-${laneName}` },
            el('div', { class: 'todo-lane-head' }, el('div', {}, el('h4', {}, label), el('small', {}, caption)), el('span', {}, String(tasks.length))),
            tasks.length
                ? el('div', { class: 'todo-board-list' }, ...tasks.slice(0, 4).map((task) => laneRow(task, laneName)))
                : el('p', { class: 'todo-lane-empty' }, laneName === 'inbox' ? '先随手记下，之后再决定。' : laneName === 'waiting' ? '暂时没有需要等着的事。' : '这里暂时很安静。'),
        );
        const captureInput = el('input', {
            class: 'todo-capture-input', type: 'text', maxlength: 120,
            placeholder: '记下一件事，不急着安排…', 'aria-label': '快速收集待办',
        });
        let captureButton;
        const capture = async () => {
            const todo = makeInboxTodo(captureInput.value);
            if (!todo.title) throw new Error('先写下一件想记住的事。');
            await setSettings({ todos: { items: [...allTodos, todo] } });
            refreshCurrent();
        };
        captureButton = el('button', {
            class: 'action todo-capture-button', type: 'button',
            onclick: () => runAsync(captureButton, capture, { announce, success: '已收进任务收件箱。', failure: (error) => error.message }),
        }, '收进来');
        captureInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); captureButton.click(); }
        });
        const timeBlockCard = el('section', { class: 'card time-block-card' },
            el('div', { class: 'time-block-head' },
                el('div', {}, el('span', { class: 'time-block-kicker' }, 'TODAY, SOFTLY'), el('h3', {}, '今天的三段时间')),
                el('span', { class: 'time-block-note' }, '不排到分钟'),
            ),
            el('p', { class: 'time-block-description' }, '把今天真正想做的事，轻轻放进上午、下午或晚上。没有安排也完全没关系。'),
            el('div', { class: 'time-block-track' }, ...TIME_BLOCKS.map((block) => {
                const tasks = todayTasks.filter((task) => task.timeBlock === block.id);
                return el('article', { class: `time-block-slot ${tasks.length ? 'has-tasks' : ''}` },
                    el('div', { class: 'time-block-slot-head' },
                        el('div', {}, el('strong', {}, block.label), el('small', {}, block.range)),
                        el('span', {}, tasks.length ? `${tasks.length} 件` : '留白'),
                    ),
                    tasks.length
                        ? el('div', { class: 'time-block-task-list' }, ...tasks.slice(0, 3).map((task) => el('span', { class: 'time-block-task' }, task.title)))
                        : el('p', { class: 'time-block-empty' }, '给自己留一点空白。'),
                );
            })),
        );
        if (todayStart.important || todayStart.doable.length) {
            const carriedRows = [
                ...(todayStart.important ? [[todayStart.important, '最重要']] : []),
                ...todayStart.doable.map((task) => [task, '可做']),
            ].map(([task, kind]) => {
                let scheduleButton;
                scheduleButton = el('button', {
                    class: 'today-start-action schedule', type: 'button',
                    onclick: () => runAsync(scheduleButton, () => applyTodoPatch(task.id, beginTodayPatch({ timeBlock: nextTimeBlock.id })), {
                        announce, success: `已安排到${nextTimeBlock.label}。`,
                    }),
                }, `安排${nextTimeBlock.label}`);
                let focusButton;
                focusButton = el('button', {
                    class: 'today-start-action focus', type: 'button',
                    onclick: () => runAsync(focusButton, () => startCarriedFocus(task), {
                        announce, success: `专注请求已发送：${task.title}`, failure: (error) => error?.message || '无法开始专注。',
                    }),
                }, '现在专注');
                return el('article', { class: `today-start-row ${kind === '最重要' ? 'important' : 'doable'}` },
                    el('div', { class: 'today-start-copy' },
                        el('span', {}, kind),
                        el('strong', {}, task.title),
                    ),
                    el('div', { class: 'today-start-actions' }, scheduleButton, focusButton),
                );
            });
            root.appendChild(el('section', { class: 'card today-start-card' },
                el('div', { class: 'today-start-head' },
                    el('div', {}, el('span', { class: 'today-start-kicker' }, 'TODAY, START HERE'), el('h3', {}, '昨天选的，今天从这里开始')),
                    el('span', { class: 'today-start-badge' }, '已到今天'),
                ),
                el('p', { class: 'today-start-description' }, '不必一次做完。先把其中一件放进下一段时间，或者直接开始一轮专注。'),
                el('div', { class: 'today-start-list' }, ...carriedRows),
            ));
        }
        if (todayTasks.length) {
            const focusPicker = el('select', { class: 'today-mainline-picker', 'aria-label': '选择今日主线', value: todayFocus.task?.id || '' },
                el('option', { value: '' }, '暂不选，也没关系'),
                ...todayTasks.map((task) => el('option', { value: task.id }, task.title)),
            );
            focusPicker.value = todayFocus.task?.id || '';
            focusPicker.addEventListener('change', () => {
                const task = todayTasks.find((item) => item.id === focusPicker.value) || null;
                runAsync(focusPicker, () => setTodayFocus(task), {
                    announce, success: task ? '今日主线已更新。' : '今日主线已清空。',
                });
            });
            let startButton;
            startButton = el('button', {
                class: 'today-mainline-start', type: 'button', disabled: !todayFocus.task,
                onclick: () => runAsync(startButton, () => startTodayFocus(todayFocus.task), {
                    announce, success: `专注请求已发送：${todayFocus.task?.title || ''}`,
                    failure: (error) => error?.message || '无法开始专注。',
                }),
            }, '现在开始');
            let clearButton;
            clearButton = el('button', {
                class: 'today-mainline-clear', type: 'button', disabled: !todayFocus.task,
                onclick: () => runAsync(clearButton, () => setTodayFocus(null), { announce, success: '今日主线已清空。' }),
            }, '清空');
            const mainlineDisplayTask = todayFocus.task || todayResumeTask;
            const mainlineReconnect = todayResumeTask
                ? resumeReconnectEntry(todayResumeTask, { announce, onResume: resumeTaskIntoToday, surface: 'today-mainline-reconnect' })
                : null;
            root.appendChild(el('section', { class: `card today-mainline-card ${todayFocus.task ? 'has-mainline' : ''} ${todayResumeTask ? 'has-resume-cue' : ''}` },
                el('div', { class: 'today-mainline-head' },
                    el('div', {}, el('span', {}, 'TODAY\'S THREAD'), el('h3', {}, todayFocus.task ? '先陪这一件走一小段' : todayResumeTask ? '上次留在这里，要不要接上？' : '今天，想先陪哪一件？')),
                    el('span', {}, todayFocus.task ? '已选主线' : todayResumeTask ? '回到这里' : '随时可换'),
                ),
                todayResumeTask ? el('p', { class: 'today-mainline-resume' }, el('span', {}, '候选'), el('strong', {}, todayResumeTask.title)) : null,
                el('p', { class: 'today-mainline-copy' }, currentMicroStep(mainlineDisplayTask)
                    ? `当前一小步：${currentMicroStep(mainlineDisplayTask).text}`
                    : hasPendingResumeHint(mainlineDisplayTask) ? `下次从这里开始：${mainlineDisplayTask.note}`
                        : hasResumeHint(mainlineDisplayTask) ? `上次起点：${mainlineDisplayTask.note}`
                            : mainlineDisplayTask?.note || (mainlineDisplayTask ? mainlineDisplayTask.title : '不是排名，也不需要完成所有事。只选一件现在愿意开始的。')),
                mainlineReconnect,
                el('div', { class: 'today-mainline-controls' }, focusPicker, startButton, clearButton),
            ));
        }
        if (companion.phase !== 'idle') {
            const companionTask = companion.task ? allTodos.find((item) => item.id === companion.task.id && !item.completed) : null;
            const companionMicroStep = currentMicroStep(companionTask);
            const companionActions = [];
            if (companion.mode === 'work' || companion.mode === 'paused') {
                let toggleButton;
                toggleButton = el('button', {
                    class: 'focus-companion-action primary', type: 'button',
                    onclick: () => runAsync(toggleButton, () => sendFocusAction('toggle'), {
                        announce,
                        success: companion.mode === 'work' ? '好，先暂停一下。' : '继续陪你走这一段。',
                    }),
                }, companion.mode === 'work' ? '暂停一下' : '继续');
                let endButton;
                endButton = el('button', {
                    class: 'focus-companion-action quiet', type: 'button',
                    onclick: () => runAsync(endButton, () => sendFocusAction('skip'), { announce, success: '这一段先放在这里。' }),
                }, '结束这一段');
                companionActions.push(toggleButton, endButton);
            }
            if (companion.mode === 'decision') {
                let continueButton;
                continueButton = el('button', {
                    class: 'focus-companion-action primary', type: 'button',
                    onclick: () => runAsync(continueButton, () => sendFocusAction('continue'), { announce, success: '再走一小段。' }),
                }, '继续一小段');
                let restButton;
                restButton = el('button', {
                    class: 'focus-companion-action quiet', type: 'button',
                    onclick: () => runAsync(restButton, () => sendFocusAction('rest'), { announce, success: '好，先休息。' }),
                }, '先休息');
                let completeButton;
                completeButton = el('button', {
                    class: 'focus-companion-action complete', type: 'button',
                    onclick: () => runAsync(completeButton, () => sendFocusAction('complete'), { announce, success: '已标记完成，做得很好。' }),
                }, '标记完成');
                companionActions.push(continueButton, restButton, completeButton);
            }
            let reflectionControl = null;
            if (companion.mode === 'decision' && companion.reflectionEventId) {
                const reflectionInput = el('input', {
                    class: 'focus-reflection-input', type: 'text', maxlength: 120,
                    placeholder: '这一段推进了什么？（可跳过）', 'aria-label': '这一段推进了什么',
                });
                let reflectionSave;
                reflectionSave = el('button', {
                    class: 'focus-reflection-save', type: 'button',
                    onclick: () => runAsync(reflectionSave, async () => {
                        await setSettings({ rhythm: focusReflectionPatch({
                            rhythm, eventId: companion.reflectionEventId, detail: reflectionInput.value,
                        }) });
                        refreshCurrent();
                    }, { announce, success: reflectionInput.value.trim() ? '这一小段已留下。' : '已保持空白。' }),
                }, '留下一句');
                reflectionControl = el('div', { class: 'focus-reflection-control' }, reflectionInput, reflectionSave);
            }
            let microStepControl = null;
            let nextStepControl = null;
            if (companion.mode === 'decision' && companion.task) {
                const linkedTask = allTodos.find((item) => item.id === companion.task.id && !item.completed);
                if (linkedTask) {
                    const activeMicroStep = currentMicroStep(linkedTask);
                    if (activeMicroStep) {
                        const microNoteInput = el('input', {
                            class: 'focus-micro-note-input', type: 'text', maxlength: 160,
                            placeholder: '这一段推进了什么？（可选）', 'aria-label': '这一小步的小记',
                        });
                        let completeMicroButton;
                        completeMicroButton = el('button', {
                            class: 'focus-micro-step-complete', type: 'button',
                            onclick: () => runAsync(completeMicroButton, () => applyTodoPatch(
                                linkedTask.id,
                                { ...completeMicroStepPatch(linkedTask, activeMicroStep.id), ...appendMicroNotePatch(linkedTask, microNoteInput.value) },
                            ), {
                                announce,
                                success: '这一小步已经收好；最后一步也不会自动完成整件事。',
                                failure: (error) => error?.message || '暂时没能更新这一小步。',
                            }),
                        }, '收好这一小步');
                        microStepControl = el('div', { class: 'focus-micro-step-control' },
                            el('div', { class: 'focus-micro-step-copy' },
                                el('span', {}, 'ONE TINY ACTION'),
                                el('strong', {}, activeMicroStep.text),
                                el('small', {}, '不等于完成整件事；只把眼前这一小步收好。'),
                            ),
                            microNoteInput,
                            completeMicroButton,
                        );
                    }
                    const nextStepInput = el('input', {
                        class: 'focus-next-step-input', type: 'text', maxlength: 240,
                        placeholder: '下一步想从哪里开始？（可选）', 'aria-label': '下一步想从哪里开始', value: linkedTask.note || '',
                    });
                    let nextStepSave;
                    const saveNextStep = () => runAsync(nextStepSave, () => saveFocusNextStep(linkedTask, nextStepInput.value), {
                        announce,
                        success: '下一步已留给下次开始。',
                        failure: (error) => error?.message || '暂时没能留下这一步。',
                    });
                    nextStepSave = el('button', { class: 'focus-next-step-save', type: 'button', onclick: saveNextStep }, '留给下次');
                    const nextWindow = nextSoftTimeBlock(new Date());
                    let nextWindowSave;
                    nextWindowSave = el('button', {
                        class: 'focus-next-step-schedule', type: 'button',
                        onclick: () => runAsync(nextWindowSave, () => saveFocusNextStep(linkedTask, nextStepInput.value, { scheduleNext: true }), {
                            announce,
                            success: nextWindow.tomorrow ? '下一步已留给明天上午。' : `下一步已放进${nextWindow.label}。`,
                            failure: (error) => error?.message || '暂时没能留到下一段。',
                        }),
                    }, nextWindow.tomorrow ? '留到明天上午' : `留到${nextWindow.label}`);
                    nextStepInput.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') { event.preventDefault(); saveNextStep(); }
                    });
                    nextStepControl = el('div', { class: 'focus-next-step-control' },
                        el('div', { class: 'focus-next-step-copy' },
                            el('span', {}, 'THE NEXT TINY STEP'),
                            el('small', {}, '不必现在做完；留一句可执行的开始就好。'),
                        ),
                        el('div', { class: 'focus-next-step-entry' }, nextStepInput, nextStepSave),
                        el('div', { class: 'focus-next-step-actions' }, nextWindowSave),
                    );
                }
            }
            let captureControl = null;
            if (companion.active) {
                const captureInput = el('input', {
                    class: 'focus-capture-input', type: 'text', maxlength: 120,
                    placeholder: '突然想到什么？先放到收件箱', 'aria-label': '专注中随手收集',
                });
                let captureButton;
                const capture = () => runAsync(captureButton, () => captureFocusThought(captureInput.value), {
                    announce,
                    success: '已收进收件箱，继续专注就好。',
                    failure: (error) => error.message,
                });
                captureButton = el('button', { class: 'focus-capture-save', type: 'button', onclick: capture }, '先收下');
                captureInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') { event.preventDefault(); capture(); }
                });
                captureControl = el('div', { class: 'focus-capture-control' },
                    el('div', { class: 'focus-capture-copy' },
                        el('span', {}, 'PARK IT HERE'),
                        el('small', {}, '不打断这一段，稍后再看。'),
                    ),
                    el('div', { class: 'focus-capture-entry' }, captureInput, captureButton),
                );
            }
            root.appendChild(el('section', {
                class: `card focus-companion-card mode-${companion.mode}`,
                'data-focus-companion': 'true',
                'data-focus-key': `${companion.phase}:${companion.task?.id || ''}:${companion.awaitingDecision}:${companion.reflectionEventId}:${companion.capturedCount}`,
            },
            el('div', { class: 'focus-companion-head' },
                el('div', {}, el('span', { class: 'focus-companion-kicker' }, companion.kicker), el('h3', {}, companion.heading)),
                el('span', { class: 'focus-companion-phase' }, companion.mode === 'paused' ? '暂停中' : companion.mode === 'decision' ? '刚完成一段' : companion.mode === 'rest' ? '休息中' : '专注中'),
            ),
            el('p', { class: 'focus-companion-task' }, companion.task?.title || '自由专注'),
            el('div', { class: 'focus-companion-time' },
                el('strong', { 'data-focus-elapsed': 'true' }, companion.elapsed),
                el('span', { 'data-focus-remaining': 'true' }, companion.remaining),
            ),
            el('p', { class: 'focus-companion-message', 'data-focus-message': 'true' }, companion.message || '不需要冲刺，只陪你把眼前这一段走完。'),
            companionMicroStep && companion.active ? el('div', { class: 'focus-active-micro' },
                el('span', {}, 'THIS ROUND'),
                el('strong', {}, `这次陪你：${companionMicroStep.text}`),
            ) : null,
            captureControl,
            microStepControl,
            nextStepControl,
            reflectionControl,
            companion.mode === 'decision' && companion.capturedCount
                ? el('p', { class: 'focus-capture-summary' }, `刚才收下了 ${companion.capturedCount} 件事，已经放进收件箱，稍后再看就好。`)
                : null,
            companionActions.length ? el('div', { class: 'focus-companion-actions' }, ...companionActions) : el('p', { class: 'focus-companion-rest-note' }, '这一段先放在这里。等休息结束，也可以再开始。'),
            el('small', { class: 'focus-companion-footnote' }, '不打卡，不比较；只是陪你把这段时间轻轻放在这里。'),
            ));
        }
        if (focusEchoes.echoes.length) {
            const echoRows = focusEchoes.echoes.map((event) => el('article', {
                class: `focus-echo-row ${event.taskId && event.taskId === todayFocus.task?.id ? 'mainline' : ''}`,
            },
            el('time', { datetime: new Date(event.at).toISOString() }, formatRhythmTime(event.at)),
            el('div', { class: 'focus-echo-copy' },
                el('strong', {}, event.title || '自由专注'),
                el('small', {}, event.detail || (event.minutes ? `陪自己走了 ${event.minutes} 分钟` : '留一点空白也很好')),
            ),
            event.minutes ? el('span', { class: 'focus-echo-minutes' }, `${event.minutes}m`) : null,
            ));
            root.appendChild(el('section', { class: 'card focus-echo-card' },
                el('div', { class: 'focus-echo-head' },
                    el('div', {}, el('span', {}, 'TODAY, IN SMALL PIECES'), el('h3', {}, focusEchoes.mainlineEchoes.length ? '今日主线留下的几小段' : '今天陪自己走过的几小段')),
                    el('span', {}, `${focusEchoes.echoes.length} 段`),
                ),
                el('p', { class: 'focus-echo-description' }, focusEchoes.mainlineTitle
                    ? `「${focusEchoes.mainlineTitle}」不需要一次做完；留下的每一小段都在这里。`
                    : '不需要完整总结，记得住的几小段就已经很好。'),
                el('div', { class: 'focus-echo-list' }, ...echoRows),
            ));
        }
        root.appendChild(timeBlockCard);
        const closeoutRows = dayCloseout.pending.slice(0, 5).map((task) => {
            const actions = [
                ['today', '留在今天'],
                ['tomorrow', '放到明天'],
                ['inbox', '回收件箱'],
            ].map(([action, label]) => {
                let button;
                button = el('button', {
                    class: `day-closeout-action ${action}`, type: 'button',
                    onclick: () => runAsync(button, () => closeoutTask(task, action), {
                        announce,
                        success: action === 'today' ? '好，它还留在今天。' : action === 'tomorrow' ? '已留给明天。' : '已送回收件箱。',
                    }),
                }, label);
                return button;
            });
            return el('article', { class: 'day-closeout-row' },
                el('div', { class: 'day-closeout-copy' },
                    el('strong', {}, task.title),
                    el('small', {}, task.timeBlock ? `原定${timeBlockLabel(task.timeBlock)}` : '还没安排时间'),
                ),
                el('div', { class: 'day-closeout-actions' }, ...actions),
            );
        });
        let saveCloseoutButton;
        saveCloseoutButton = el('button', {
            class: 'action day-closeout-save', type: 'button',
            onclick: () => runAsync(saveCloseoutButton, saveDayCloseout, { announce, success: '今天的小结已保存在本机。' }),
        }, '保存今天的小结');
        root.appendChild(el('section', { class: 'card day-closeout-card' },
            el('div', { class: 'day-closeout-head' },
                el('div', {}, el('span', { class: 'day-closeout-kicker' }, 'DAY CLOSEOUT'), el('h3', {}, '把今天轻轻收好')),
                el('span', { class: 'day-closeout-badge' }, '仅本机保存'),
            ),
            el('p', { class: 'day-closeout-description' }, dayCloseout.summary),
            dayCloseout.pending.length
                ? el('div', { class: 'day-closeout-list' }, ...closeoutRows)
                : el('p', { class: 'day-closeout-empty' }, '今天没有需要处理的任务。保留一点余白，也是一种完成。'),
            el('div', { class: 'day-closeout-footer' },
                el('small', {}, '三种去处都可以，任务不会被删除。'),
                saveCloseoutButton,
            ),
            rhythm.reflections?.[dayCloseout.todayKey]?.closeout
                ? el('p', { class: 'day-closeout-saved' }, `已保存：${rhythm.reflections[dayCloseout.todayKey].closeout}`)
                : null,
        ));
        const plannedTaskRow = (task, kind) => {
            let releaseButton;
            releaseButton = el('button', {
                class: 'tomorrow-release', type: 'button',
                onclick: () => runAsync(releaseButton, () => returnTomorrowTask(task), { announce, success: '已送回收件箱。' }),
            }, '放回收件箱');
            return el('div', { class: `tomorrow-planned-row ${kind}` },
                el('div', {}, el('strong', {}, task.title), el('small', {}, kind === 'important' ? '明天最重要' : '明天可做')),
                releaseButton,
            );
        };
        const inboxCandidates = inboxTasks.slice(0, 4).map((task) => {
            let importantButton;
            importantButton = el('button', {
                class: 'tomorrow-pick important', type: 'button', disabled: !!tomorrowStart.important,
                onclick: () => runAsync(importantButton, () => planTomorrowTask(task, 'important'), {
                    announce, success: '已选为明天最重要的一件事。', failure: (error) => error.message,
                }),
            }, '最重要');
            let doableButton;
            doableButton = el('button', {
                class: 'tomorrow-pick doable', type: 'button', disabled: tomorrowStart.doable.length >= 2,
                onclick: () => runAsync(doableButton, () => planTomorrowTask(task, 'doable'), {
                    announce, success: '已加入明天可做事项。', failure: (error) => error.message,
                }),
            }, '可做');
            return el('article', { class: 'tomorrow-candidate-row' },
                el('strong', {}, task.title),
                el('div', { class: 'tomorrow-pick-actions' }, importantButton, doableButton),
            );
        });
        root.appendChild(el('section', { class: 'card tomorrow-start-card' },
            el('div', { class: 'tomorrow-start-head' },
                el('div', {}, el('span', { class: 'tomorrow-start-kicker' }, 'TOMORROW, LIGHTLY'), el('h3', {}, '明天只留三件以内')),
                el('span', { class: 'tomorrow-start-date' }, `明天 · ${tomorrowStart.dateKey.slice(5).replace('-', ' / ')}`),
            ),
            el('p', { class: 'tomorrow-start-description' }, '先选一件最重要的，再补两件可做的；其余任务继续安心待在收件箱。'),
            el('div', { class: 'tomorrow-plan-grid' },
                el('section', { class: 'tomorrow-plan-slot important' },
                    el('div', { class: 'tomorrow-slot-head' }, el('span', {}, '①'), el('div', {}, el('h4', {}, '最重要'), el('small', {}, '只留 1 件'))),
                    tomorrowStart.important ? plannedTaskRow(tomorrowStart.important, 'important') : el('p', { class: 'tomorrow-slot-empty' }, '还没选。留给最值得开始的一步。'),
                ),
                el('section', { class: 'tomorrow-plan-slot doable' },
                    el('div', { class: 'tomorrow-slot-head' }, el('span', {}, '②'), el('div', {}, el('h4', {}, '可做'), el('small', {}, `已选 ${tomorrowStart.doable.length} / 2 件`))),
                    tomorrowStart.doable.length
                        ? el('div', { class: 'tomorrow-planned-list' }, ...tomorrowStart.doable.map((task) => plannedTaskRow(task, 'doable')))
                        : el('p', { class: 'tomorrow-slot-empty' }, '最多补两件，给临时变化留出位置。'),
                ),
            ),
            el('div', { class: 'tomorrow-candidates' },
                el('div', { class: 'tomorrow-candidates-head' }, el('h4', {}, '从收件箱慢慢挑'), el('small', {}, inboxTasks.length ? `展示前 ${Math.min(4, inboxTasks.length)} 件` : '暂时没有收件箱任务')),
                inboxCandidates.length ? el('div', { class: 'tomorrow-candidate-list' }, ...inboxCandidates) : el('p', { class: 'tomorrow-candidates-empty' }, '不用填满。明天也可以从一件空白开始。'),
            ),
        ));
        const triageRow = (task, archived = false) => {
            const editButton = el('button', { class: 'triage-action edit', type: 'button', onclick: () => openTaskEditor(task) }, '编辑');
            if (archived) {
                let restoreButton;
                restoreButton = el('button', {
                    class: 'triage-action', type: 'button',
                    onclick: () => runAsync(restoreButton, () => restoreTask(task), { announce, success: '已恢复到收件箱。' }),
                }, '恢复到收件箱');
                return el('article', { class: 'triage-row' }, el('strong', {}, task.title), el('div', {}, restoreButton, editButton));
            }
            let first;
            first = el('button', {
                class: 'triage-action', type: 'button',
                onclick: () => runAsync(first, () => archived ? restoreTask(task) : placeTodo(task, 'today'), {
                    announce, success: archived ? '已恢复到收件箱。' : '已放到今天。',
                }),
            }, '放到今天');
            let second;
            second = el('button', {
                class: 'triage-action archive', type: 'button',
                onclick: () => openTaskThreadCapture(root, task, {
                    kicker: 'PUT AWAY, NOT LOST', title: '先把这一段收在这里', actionLabel: '归档任务', success: '已归档，可随时恢复。',
                    announce, onSave: (threadNote) => archiveTask(task, threadNote),
                }),
            }, '归档');
            return el('article', { class: 'triage-row' }, el('strong', {}, task.title), el('div', {}, first, second, editButton));
        };
        if (stale.length || archivedTasks.length) root.appendChild(el('section', { class: 'card triage-card' },
            el('div', { class: 'triage-head' }, el('div', {}, el('span', {}, 'TASK RESET'), el('h3', {}, '回看一下，不必硬扛')), el('small', {}, '不删除数据')),
            stale.length ? el('div', { class: 'triage-list' }, ...stale.slice(0, 4).map((task) => triageRow(task))) : el('p', { class: 'triage-empty' }, '没有久留任务。'),
            archivedTasks.length ? el('details', { class: 'triage-archive' }, el('summary', {}, `已归档 ${archivedTasks.length} 件`), el('div', { class: 'triage-list' }, ...archivedTasks.slice(0, 6).map((task) => triageRow(task, true)))) : null,
        ));
        const locationLabel = { inbox: '收件箱', today: '今天', later: '稍后', waiting: '正在等', archive: '归档' };
        const searchInput = el('input', {
            class: 'task-search-input', type: 'search', maxlength: 120,
            placeholder: '搜索任务标题…', 'aria-label': '搜索任务标题',
        });
        const searchResults = el('div', { class: 'task-search-results', 'aria-live': 'polite' });
        const renderSearchResults = () => {
            const query = searchInput.value;
            const results = searchTasks({ todos: allTodos, query });
            searchResults.replaceChildren();
            if (!query.trim()) {
                searchResults.appendChild(el('p', { class: 'task-search-hint' }, '输入几个字，就能在收件箱、今天、稍后和归档里找到它。'));
                return;
            }
            if (!results.length) {
                searchResults.appendChild(el('p', { class: 'task-search-empty' }, '没有找到相符任务。换个词试试？'));
                return;
            }
            results.slice(0, 8).forEach(({ task, bucket }) => {
                let action;
                if (bucket === 'archive') {
                    action = el('button', {
                        class: 'task-search-action restore', type: 'button',
                        onclick: () => runAsync(action, () => restoreTask(task), { announce, success: '已恢复到收件箱。' }),
                    }, '恢复');
                } else if (bucket === 'today') {
                    action = el('button', {
                        class: 'task-search-action focus', type: 'button',
                        onclick: () => runAsync(action, () => startSearchFocus(task), {
                            announce, success: `专注请求已发送：${task.title}`,
                            failure: (error) => error?.message || '无法开始专注。',
                        }),
                    }, '开始专注');
                } else {
                    action = el('button', {
                        class: 'task-search-action today', type: 'button',
                        onclick: () => runAsync(action, () => placeTodo(task, 'today'), { announce, success: '已放到今天。' }),
                    }, '放到今天');
                }
                const editButton = el('button', { class: 'task-search-action edit', type: 'button', onclick: () => openTaskEditor(task) }, '编辑');
                searchResults.appendChild(el('article', { class: `task-search-row in-${bucket}` },
                    el('div', { class: 'task-search-copy' },
                        el('strong', {}, task.title),
                        el('span', {}, task.note ? `${locationLabel[bucket]} · 下一步：${task.note}` : locationLabel[bucket]),
                    ),
                    el('div', { class: 'task-search-actions' }, action, editButton),
                ));
            });
            if (results.length > 8) searchResults.appendChild(el('p', { class: 'task-search-more' }, `已显示前 8 项，共 ${results.length} 项。`));
        };
        let searchClearButton;
        searchClearButton = el('button', {
            class: 'task-search-clear', type: 'button', disabled: true,
            onclick: () => { searchInput.value = ''; renderSearchResults(); searchInput.focus(); },
        }, '清除');
        searchInput.addEventListener('input', () => {
            searchClearButton.disabled = !searchInput.value;
            renderSearchResults();
        });
        renderSearchResults();
        root.appendChild(el('section', { class: 'card task-search-card' },
            el('div', { class: 'task-search-head' },
                el('div', {}, el('span', { class: 'task-search-kicker' }, 'TASK FINDER'), el('h3', {}, '想找哪件事？')),
                el('span', { class: 'task-search-note' }, '仅本机搜索'),
            ),
            el('div', { class: 'task-search-control' }, searchInput, searchClearButton),
            searchResults,
        ));
        root.appendChild(el('section', { class: 'card todo-board-card' },
            el('div', { class: 'todo-board-head' },
                el('div', {}, el('span', { class: 'todo-kicker' }, 'TASK INBOX'), el('h3', {}, '先记下，再决定什么时候做')),
                el('span', { class: 'todo-board-note' }, '不会自动催促'),
            ),
            el('p', { class: 'todo-board-description' }, '收件箱是临时停靠处；只有你主动推进或设置日期，任务才会出现在今天。'),
            el('div', { class: 'todo-capture' }, captureInput, captureButton),
            el('div', { class: 'todo-lane-grid' },
                lane('收件箱', '尚未安排', inboxTasks, 'inbox'),
                lane('今天', '可以开始', todayTasks, 'today'),
                lane('稍后', '留给以后', laterTasks, 'later'),
            ),
            el('section', { class: 'todo-waiting-lane' },
                el('div', { class: 'todo-lane-head' }, el('div', {}, el('h4', {}, '正在等'), el('small', {}, '等条件到了，再接上')), el('span', {}, String(waitingTasks.length))),
                waitingTasks.length
                    ? el('div', { class: 'todo-board-list' }, ...waitingTasks.slice(0, 4).map((task) => laneRow(task, 'waiting')))
                    : el('p', { class: 'todo-lane-empty' }, '暂时没有需要等着的事。'),
            ),
        ));

        if (completedTasks.length) {
            const completionRows = completedTasks.slice(0, 6).map((task) => {
                let todayButton;
                todayButton = el('button', {
                    class: 'completion-review-action today', type: 'button',
                    onclick: () => runAsync(todayButton, () => undoCompletion(task, 'today'), { announce, success: '已回到今天。' }),
                }, '回到今天');
                let inboxButton;
                inboxButton = el('button', {
                    class: 'completion-review-action inbox', type: 'button',
                    onclick: () => runAsync(inboxButton, () => undoCompletion(task, 'inbox'), { announce, success: '已放回收件箱。' }),
                }, '放回收件箱');
                const detail = task.note
                    ? `完成于 ${formatRhythmTime(task.doneAt)} · 下一步：${task.note}`
                    : `完成于 ${formatRhythmTime(task.doneAt)}`;
                const microNotes = normalizeMicroNotes(task.microNotes).slice().reverse();
                return el('article', { class: 'completion-review-row' },
                    el('div', { class: 'completion-review-copy' },
                        el('strong', {}, task.title),
                        el('small', {}, detail),
                        microNotes.length ? el('ul', { class: 'completion-review-notes', 'aria-label': `${task.title} 的小步留痕` },
                            ...microNotes.map((note) => el('li', {}, note.text)),
                        ) : null,
                    ),
                    el('div', { class: 'completion-review-actions' }, todayButton, inboxButton),
                );
            });
            root.appendChild(el('section', { class: 'card completion-review-card' },
                el('div', { class: 'completion-review-head' },
                    el('div', {}, el('span', {}, 'DONE, STILL FLEXIBLE'), el('h3', {}, '刚完成的，也可以反悔')),
                    el('span', {}, `今天 ${completedTasks.length} 件`),
                ),
                el('p', { class: 'completion-review-description' }, '误点完成没关系。恢复后，任务和下一步备注都会留在原处。'),
                el('div', { class: 'completion-review-list' }, ...completionRows),
            ));
        }

        const dailyThreadTasks = [
            ...completedTasks.slice(0, 3).map((task) => ({ task, kind: 'completed' })),
            ...waitingTasks.slice(0, 2).map((task) => ({ task, kind: 'waiting' })),
        ].slice(0, 4);
        if (dailyThreadTasks.length) {
            const threadRows = dailyThreadTasks.map(({ task, kind }) => {
                const thread = buildTaskThread(task);
                const detail = kind === 'completed'
                    ? thread.closingNote || thread.notes[0]?.text || '已轻轻收好；需要时还能回到今天。'
                    : thread.waitingNote || thread.lastStartingPoint || '先等条件到了，再从这里接上。';
                return el('article', { class: `task-thread-review-row ${kind}` },
                    el('div', { class: 'task-thread-review-copy' },
                        el('span', {}, kind === 'completed' ? '已完成' : '正在等'),
                        el('strong', {}, task.title),
                        el('small', {}, detail),
                    ),
                    el('button', { class: 'task-thread-review-action', type: 'button', onclick: () => openTaskEditor(task) }, '查看脉络'),
                );
            });
            root.appendChild(el('section', { class: 'card task-thread-review-card' },
                el('div', { class: 'task-thread-review-head' },
                    el('div', {}, el('span', {}, 'TODAY\'S THREADS'), el('h3', {}, '今天留下的几段脉络')),
                    el('span', {}, `只看 ${dailyThreadTasks.length} 件`),
                ),
                el('p', { class: 'task-thread-review-description' }, '完成与等待都只是过程的一段。这里不催办、不评分，只留给以后接上的线索。'),
                el('div', { class: 'task-thread-review-list' }, ...threadRows),
            ));
        }

        const tasks = [
            ...(todayFocus.task ? [todayFocus.task] : []),
            ...todayTasks.filter((task) => task.id !== todayFocus.task?.id),
        ].slice(0, 3);
        const taskRows = tasks.length
            ? tasks.map((task) => {
                let startButton;
                startButton = el('button', {
                    class: 'focus-task-start',
                    type: 'button',
                    onclick: () => runAsync(startButton, async () => {
                        const result = await focusCommand({ action: 'start', task: { id: task.id, title: task.title } });
                        if (!result?.ok) throw new Error('桌面宠物未就绪，请稍后重试。');
                    }, { announce, success: `专注请求已发送：${task.title}`, failure: (error) => error?.message || '无法开始专注。' }),
                }, '开始专注');
                const isMainline = task.id === todayFocus.task?.id;
                return el('div', { class: `focus-task-row ${isMainline ? 'mainline' : ''}` },
                    el('div', { class: 'focus-task-copy' },
                        el('strong', {}, task.title),
                        el('small', {}, isMainline ? '今日主线 · 现在开始' : `优先级 P${task.priority || 1}`),
                    ),
                    startButton,
                );
            })
            : [el('p', { class: 'focus-empty' }, '今天没有待办任务；可直接从托盘开始一轮自由专注。')];
        root.appendChild(el('section', { class: 'card focus-queue-card' },
            el('div', { class: 'focus-queue-head' },
                el('div', {}, el('span', { class: 'focus-kicker' }, 'FOCUS FLOW'), el('h3', {}, '从一项任务开始')),
                el('span', { class: 'focus-orbit', 'aria-hidden': 'true' }),
            ),
            el('p', { class: 'focus-queue-detail' }, '完成一段后会自动进入休息；是否标记任务完成，始终留给你自己决定。'),
            el('div', { class: 'focus-task-list' }, ...taskRows),
        ));

        const actionCard = (title, body, success, makePatch) => {
            let button;
            button = el('button', {
                class: 'action',
                type: 'button',
                onclick: () => runAsync(button, async () => {
                    const patch = makePatch(mood);
                    await setSettings({ mood: patch });
                    mood = { ...mood, ...patch };
                }, { announce, success }),
            }, '执行');
            return el('article', { class: 'card action-card' },
                el('div', { class: 'action-copy' }, el('h3', {}, title), el('p', {}, body)),
                button,
            );
        };

        root.appendChild(el('div', { class: 'action-list' },
            actionCard('准备点心', '降低饥饿值，同时让心情稍微变好。', '点心准备好了。', (state) => ({
                hunger: Math.max(0, (state.hunger ?? 30) - 20),
                mood: Math.min(100, (state.mood ?? 60) + 5),
                lastTickAt: Date.now(),
            })),
            actionCard('一起看书', '恢复精力，也会增加一点亲密度。', '安静的阅读时间开始了。', (state) => ({
                mood: Math.min(100, (state.mood ?? 60) + 5),
                energy: Math.min(100, (state.energy ?? 80) + 10),
                affinity: (state.affinity ?? 0) + 5,
            })),
            actionCard('小憩一下', '快速恢复能量，适合专注间隙。', '已经安排好休息时间。', (state) => ({
                energy: Math.min(100, (state.energy ?? 80) + 30),
                lastTickAt: Date.now(),
            })),
        ));
    },
};

// ============ Settings ============
export const settingsTab = {
    render(root, {
        getSettings,
        setSettings,
        announce,
        dataExport,
        dataImport,
        aiStatus,
        aiConfigure,
        aiTest,
        updateStatus,
        updateCheck,
        updateInstall,
        onUpdateStatus,
        windowStatus,
        windowAction,
    }) {
        const settings = getSettings().settings || {};
        root.appendChild(panelHeader('偏好', '房间设置', '所有修改都会立即保存，并同步到桌面宠物。'));

        const persist = async (control, key, value, label) => {
            control.disabled = true;
            control.setAttribute('aria-busy', 'true');
            try {
                const result = await setSettings({ settings: { [key]: value } });
                announce(`${label}已更新。`);
                return result.settings?.[key] ?? value;
            } catch {
                announce(`${label}保存失败，请稍后再试。`, 'error');
                return settings[key];
            } finally {
                control.disabled = false;
                control.removeAttribute('aria-busy');
            }
        };

        const slider = (label, key, min, max, step) => {
            const id = `setting-${key}`;
            const initial = Number(settings[key] ?? 0);
            const output = el('output', { class: 'setting-value', for: id }, `${Math.round(initial * 100)}%`);
            const input = el('input', {
                id,
                type: 'range',
                min,
                max,
                step,
                value: initial,
                oninput: (event) => { output.value = `${Math.round(Number(event.target.value) * 100)}%`; },
                onchange: async (event) => {
                    const saved = await persist(event.target, key, Number(event.target.value), label);
                    event.target.value = saved;
                    output.value = `${Math.round(Number(saved) * 100)}%`;
                },
            });
            return el('div', { class: 'toggle-row slider-row' },
                el('label', { class: 'setting-label', for: id }, label),
                el('div', { class: 'slider-control' }, output, input),
            );
        };

        const toggle = (label, key) => {
            const id = `setting-${key}`;
            const labelId = `${id}-label`;
            let current = !!settings[key];
            const stateCopy = el('span', { class: 'switch-copy' }, current ? '已开启' : '已关闭');
            let button;
            button = el('button', {
                id,
                class: `switch ${current ? 'on' : ''}`,
                type: 'button',
                role: 'switch',
                'aria-checked': String(current),
                'aria-labelledby': labelId,
                onclick: async () => {
                    const saved = !!(await persist(button, key, !current, label));
                    current = saved;
                    button.classList.toggle('on', current);
                    button.setAttribute('aria-checked', String(current));
                    stateCopy.textContent = current ? '已开启' : '已关闭';
                },
            }, el('span', { class: 'switch-knob', 'aria-hidden': 'true' }));
            return el('div', { class: 'toggle-row' },
                el('span', { class: 'setting-label', id: labelId }, label),
                el('div', { class: 'switch-control' }, stateCopy, button),
            );
        };

        const select = (label, key, options, { numeric = false } = {}) => {
            const id = `setting-${key}`;
            const control = el('select', {
                id,
                onchange: async (event) => {
                    const value = numeric ? Number(event.target.value) : event.target.value;
                    const saved = await persist(event.target, key, value, label);
                    event.target.value = saved;
                },
            }, ...options.map((option) => el('option', {
                value: option.value,
                selected: settings[key] === option.value,
            }, option.label)));
            return el('div', { class: 'toggle-row select-row' },
                el('label', { class: 'setting-label', for: id }, label),
                control,
            );
        };

        const card = (title, description, ...rows) => el('section', { class: 'card settings-card' },
            el('div', { class: 'settings-card-head' }, el('h3', {}, title), el('p', {}, description)),
            ...rows,
        );
        const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
            value: hour,
            label: `${String(hour).padStart(2, '0')}:00`,
        }));

        const dndBadge = el('span', { class: 'control-status', 'data-state': 'loading' }, '正在读取…');
        const dndDetail = el('p', { class: 'control-status-detail' }, '正在计算勿扰状态。');
        const paintDndStatus = () => {
            const status = getDndScheduleStatus(getSettings().settings || {});
            dndBadge.dataset.state = status.tone;
            dndBadge.textContent = status.label;
            dndDetail.textContent = status.detail;
        };
        paintDndStatus();
        const dndStatusTimer = setInterval(paintDndStatus, 30_000);

        const sceneBadge = el('span', { class: 'control-status', 'data-state': 'loading' }, '正在读取…');
        const sceneDetail = el('p', { class: 'control-status-detail' }, '正在计算场景状态。');
        const sceneButtons = new Map();
        const paintSceneStatus = () => {
            const current = getSettings().settings || {};
            const status = getSceneStatus(current);
            sceneBadge.dataset.state = status.active ? 'active' : 'idle';
            sceneBadge.textContent = status.scheduled ? `定时中 · ${status.label}` : status.label;
            sceneDetail.textContent = status.active
                ? `${status.label}正在以临时叠加的方式调整互动与勿扰，不会改写你的手动偏好。`
                : '目前按你的常规偏好陪伴；选择一个场景可快速切换状态。';
            for (const [id, button] of sceneButtons) {
                const selected = id === status.id;
                button.classList.toggle('active', selected);
                button.setAttribute('aria-pressed', String(selected));
            }
        };
        const sceneStatusTimer = setInterval(paintSceneStatus, 30_000);

        const scenePicker = el('div', { class: 'scene-picker', role: 'group', 'aria-label': '选择陪伴场景' });
        for (const scene of Object.values(SCENES)) {
            const button = el('button', {
                class: 'scene-choice',
                type: 'button',
                'aria-pressed': 'false',
                onclick: async () => {
                    const saved = await persist(button, 'sceneMode', scene.id, '陪伴场景');
                    if (saved === scene.id) paintSceneStatus();
                },
            },
                el('strong', {}, scene.label),
                el('small', {}, scene.id === 'manual'
                    ? '沿用当前偏好'
                    : scene.dnd ? '安静 · 勿扰' : '更主动互动'),
            );
            sceneButtons.set(scene.id, button);
            scenePicker.appendChild(button);
        }
        const sceneCard = card('场景化陪伴', '为当前状态一键切换陪伴方式；场景只在运行时生效，不会覆盖原有设置。',
            el('div', { class: 'control-overview scene-overview' }, el('div', {}, sceneBadge, sceneDetail)),
            scenePicker,
            toggle('定时切换场景', 'sceneAutoEnabled'),
            select('定时场景', 'sceneAutoPreset', [
                { value: 'focus', label: '专注工作' },
                { value: 'relaxed', label: '轻松陪伴' },
                { value: 'night', label: '深夜休息' },
            ]),
            select('开始时间', 'sceneAutoStart', hourOptions, { numeric: true }),
            select('结束时间', 'sceneAutoEnd', hourOptions, { numeric: true }),
        );
        sceneCard.classList.add('scene-card');
        paintSceneStatus();

        const updateBadge = el('span', { class: 'update-status', 'data-state': 'loading' }, '正在读取…');
        const updateDetail = el('p', { class: 'update-detail' }, '正在检查此版本的更新能力。');
        const updateVersion = el('span', { class: 'update-version' }, '当前版本 —');
        const updateProgress = el('progress', { class: 'update-progress', max: 100, value: 0 });
        const updateProgressCopy = el('span', { class: 'update-progress-copy' }, '准备下载');
        const updateProgressRow = el('div', { class: 'update-progress-row', hidden: true },
            updateProgress,
            updateProgressCopy,
        );
        let latestUpdateStatus = null;
        let updateCheckButton;
        let updateInstallButton;

        const unavailableCopy = {
            'development': '开发模式不会连接发布服务器。安装正式签名版后可使用自动更新。',
            'portable': '便携版不会自修改，请下载新版便携包手动替换。',
            'missing-feed': '此构建未配置可信发布源，更新检查保持关闭。',
            'unsupported-platform': '当前系统暂不支持自动更新。',
        };

        const paintUpdateStatus = (status) => {
            latestUpdateStatus = status;
            let state = 'idle';
            let label = '等待检查';
            let detail = '自动更新已准备好。';
            if (!status || status.ok === false) {
                state = 'error';
                label = '状态不可用';
                detail = status?.error?.message || '无法读取更新状态。';
            } else if (!status.supported) {
                state = 'local';
                label = status.reason === 'portable' ? '便携版' : '当前不可用';
                detail = unavailableCopy[status.reason] || '此版本不支持自动更新。';
            } else if (status.state === 'checking') {
                state = 'loading';
                label = '正在检查';
                detail = '正在通过签名发布源检查新版本。';
            } else if (status.state === 'up-to-date') {
                state = 'ready';
                label = '已是最新版';
                detail = '当前安装包已是发布源提供的最新版本。';
            } else if (status.state === 'available' || status.state === 'downloading') {
                state = 'loading';
                label = status.availableVersion ? `发现 ${status.availableVersion}` : '发现新版本';
                detail = '正在后台下载，安装前会验证 Windows 代码签名。';
            } else if (status.state === 'downloaded') {
                state = 'ready';
                label = '可以安装';
                detail = '更新已下载并通过验证，可立即重启完成安装。';
            } else if (status.state === 'error') {
                state = 'error';
                label = '检查失败';
                detail = status.error?.message || '更新服务暂时不可用，请稍后重试。';
            }

            updateBadge.dataset.state = state;
            updateBadge.textContent = label;
            updateDetail.textContent = detail;
            updateVersion.textContent = `当前版本 ${status?.currentVersion || '—'} · ${status?.channel === 'beta' ? 'Beta 通道' : '稳定通道'}`;
            const progressVisible = ['available', 'downloading', 'downloaded'].includes(status?.state);
            const progress = Number.isFinite(status?.progress) ? status.progress : 0;
            updateProgressRow.hidden = !progressVisible;
            updateProgress.value = progress;
            updateProgressCopy.textContent = status?.state === 'downloaded' ? '下载完成' : `${Math.round(progress)}%`;
            if (updateCheckButton) {
                updateCheckButton.disabled = !status?.supported || ['checking', 'downloading', 'downloaded'].includes(status?.state);
                updateCheckButton.textContent = status?.state === 'checking'
                    ? '正在检查…'
                    : (['available', 'downloading'].includes(status?.state) ? '下载中…' : '立即检查');
            }
            if (updateInstallButton) {
                updateInstallButton.hidden = status?.state !== 'downloaded';
                updateInstallButton.disabled = status?.state !== 'downloaded';
            }
        };

        updateCheckButton = el('button', {
            class: 'data-action secondary',
            type: 'button',
            onclick: async () => {
                updateCheckButton.disabled = true;
                updateCheckButton.setAttribute('aria-busy', 'true');
                try {
                    const result = await updateCheck();
                    if (!result?.ok) throw new Error(result?.error?.message || '检查更新失败');
                    paintUpdateStatus(result);
                    announce(result.supported ? '更新检查已启动。' : '此版本未启用自动更新。');
                } catch (error) {
                    announce(error?.message || '检查更新失败，请稍后再试。', 'error');
                } finally {
                    updateCheckButton.removeAttribute('aria-busy');
                    paintUpdateStatus(latestUpdateStatus);
                }
            },
        }, '立即检查');

        updateInstallButton = el('button', {
            class: 'data-action primary',
            type: 'button',
            hidden: true,
            disabled: true,
            onclick: async () => {
                updateInstallButton.disabled = true;
                try {
                    const result = await updateInstall();
                    if (!result?.ok) throw new Error(result?.error?.message || '更新尚未准备好');
                    announce('正在重启并安装更新。');
                } catch (error) {
                    announce(error?.message || '无法开始安装，请稍后再试。', 'error');
                    paintUpdateStatus(latestUpdateStatus);
                }
            },
        }, '重启并安装');

        const updateCard = card('应用更新', '正式安装版通过签名发布源获取更新，便携版保持手动升级。',
            el('div', { class: 'update-overview' },
                el('div', {}, updateBadge, updateDetail),
                updateVersion,
            ),
            updateProgressRow,
            toggle('自动检查并下载', 'updateAutoCheck'),
            el('div', { class: 'update-actions', role: 'group', 'aria-label': '应用更新操作' },
                updateCheckButton,
                updateInstallButton,
            ),
        );
        updateCard.classList.add('update-card');

        const displayTarget = el('select', { id: 'setting-multi-display-target' },
            el('option', { value: 'primary' }, '主显示器'),
            el('option', { value: 'cursor' }, '跟随光标'));
        const desktopBadge = el('span', { class: 'control-status', 'data-state': 'loading' }, '正在读取…');
        const desktopDetail = el('p', { class: 'control-status-detail' }, '正在读取桌面窗口位置。');
        const renderDisplayOptions = (status) => {
            for (const option of [...displayTarget.querySelectorAll('option[data-display]')]) option.remove();
            for (const display of status?.displays || []) {
                const label = `${display.label}${display.primary ? ' · 主屏' : ''}`;
                displayTarget.appendChild(el('option', { value: `display:${display.id}`, 'data-display': 'true' }, label));
            }
            const value = getSettings().settings?.multiDisplayTarget || 'primary';
            if (!displayTarget.querySelector(`option[value="${CSS.escape(value)}"]`)) {
                displayTarget.appendChild(el('option', { value }, `已保存的显示器 (${value.replace('display:', '')})`));
            }
            displayTarget.value = value;
        };
        const paintDesktopStatus = (status) => {
            renderDisplayOptions(status);
            if (!status?.available) {
                desktopBadge.dataset.state = 'warning';
                desktopBadge.textContent = '桌宠未运行';
                desktopDetail.textContent = '桌面宠物窗口尚未就绪，请稍后重试。';
                return;
            }
            const current = status.displays?.find((display) => display.id === status.displayId);
            desktopBadge.dataset.state = 'active';
            desktopBadge.textContent = current?.label || '当前显示器';
            desktopDetail.textContent = `当前位置 ${status.bounds.x} × ${status.bounds.y} · 可随时移回当前屏幕或恢复默认位置。`;
        };
        const refreshDesktopStatus = async () => {
            try {
                paintDesktopStatus(await windowStatus());
            } catch {
                paintDesktopStatus(null);
            }
        };
        displayTarget.addEventListener('change', async (event) => {
            const saved = await persist(displayTarget, 'multiDisplayTarget', event.target.value, '显示器偏好');
            displayTarget.value = saved;
            refreshDesktopStatus();
        });
        const cursorButton = el('button', {
            class: 'data-action secondary', type: 'button',
            onclick: () => runAsync(cursorButton, async () => {
                const result = await windowAction('move-to-cursor');
                if (!result?.ok) throw new Error('桌宠窗口尚未就绪');
                await refreshDesktopStatus();
            }, { announce, success: '已移到光标所在屏幕。', failure: (error) => error?.message || '移动失败，请稍后重试。' }),
        }, '移到当前屏幕');
        const resetButton = el('button', {
            class: 'data-action primary', type: 'button',
            onclick: () => runAsync(resetButton, async () => {
                const result = await windowAction('reset-position');
                if (!result?.ok) throw new Error('桌宠窗口尚未就绪');
                await refreshDesktopStatus();
            }, { announce, success: '已恢复默认位置。', failure: (error) => error?.message || '恢复失败，请稍后重试。' }),
        }, '恢复默认位置');
        const desktopCard = card('桌面控制', '查看桌宠所在显示器，一键恢复到可见、安全的位置。',
            el('div', { class: 'control-overview' }, el('div', {}, desktopBadge, desktopDetail)),
            el('div', { class: 'toggle-row select-row' },
                el('label', { class: 'setting-label', for: 'setting-multi-display-target' }, '启动显示器'),
                displayTarget),
            el('div', { class: 'control-actions', role: 'group', 'aria-label': '桌面窗口控制' }, cursorButton, resetButton));
        desktopCard.classList.add('desktop-card');
        const desktopStatusTimer = setInterval(refreshDesktopStatus, 15_000);
        refreshDesktopStatus();

        const unsubscribeUpdate = typeof onUpdateStatus === 'function'
            ? onUpdateStatus(paintUpdateStatus)
            : () => {};
        Promise.resolve(typeof updateStatus === 'function' ? updateStatus() : null)
            .then(paintUpdateStatus)
            .catch(() => paintUpdateStatus(null));

        const backendSelect = el('select', { id: 'ai-backend' },
            el('option', { value: 'local-template', selected: settings.aiBackend !== 'openai-compatible' }, '本地对话（不联网）'),
            el('option', { value: 'openai-compatible', selected: settings.aiBackend === 'openai-compatible' }, 'OpenAI 兼容接口'),
        );
        const baseUrlInput = el('input', {
            id: 'ai-base-url',
            type: 'url',
            value: settings.aiBaseUrl || '',
            placeholder: 'https://api.example.com',
            autocomplete: 'off',
            spellcheck: false,
        });
        const modelInput = el('input', {
            id: 'ai-model',
            type: 'text',
            value: settings.aiModel || '',
            placeholder: '服务商提供的模型 ID',
            autocomplete: 'off',
            spellcheck: false,
        });
        const apiKeyInput = el('input', {
            id: 'ai-api-key',
            type: 'password',
            value: '',
            placeholder: '留空则保留已保存的密钥',
            autocomplete: 'new-password',
            spellcheck: false,
        });
        const statusBadge = el('span', { class: 'ai-status', 'data-state': 'loading' }, '正在检查…');
        const statusDetail = el('p', { class: 'ai-status-detail' }, '正在读取系统安全存储状态。');
        const remoteFields = el('div', { class: 'ai-fields' },
            el('label', { class: 'ai-field ai-field-wide', for: 'ai-base-url' },
                el('span', {}, '服务地址'),
                baseUrlInput,
                el('small', {}, '仅允许 HTTPS；本机 localhost / 127.0.0.1 可使用 HTTP。')),
            el('label', { class: 'ai-field', for: 'ai-model' },
                el('span', {}, '模型 ID'),
                modelInput),
            el('label', { class: 'ai-field', for: 'ai-api-key' },
                el('span', {}, 'API 密钥'),
                apiKeyInput),
        );

        let latestAiStatus = null;
        let testButton;
        const paintAiStatus = (status) => {
            latestAiStatus = status?.ok ? status : null;
            let state = 'local';
            let label = '本地模式';
            let detail = '本地对话库不会发送网络请求。';
            if (!status?.ok) {
                state = 'error';
                label = '状态不可用';
                detail = status?.error?.message || '无法读取 AI 配置状态。';
            } else if (status.backend === 'openai-compatible' && status.configured) {
                state = 'ready';
                label = '已安全配置';
                detail = status.loopback
                    ? '正在使用本机兼容服务；密钥可以留空。'
                    : '密钥已由系统安全存储加密，页面无法读取。';
            } else if (status.backend === 'openai-compatible') {
                state = 'warning';
                label = status.credentialUnreadable ? '密钥需重新输入' : '配置未完成';
                detail = !status.encryptionAvailable && !status.loopback
                    ? '系统安全存储不可用，暂时不能启用远程 HTTPS 服务。'
                    : '填写服务地址、模型 ID 和远程服务密钥后保存。';
            }
            statusBadge.dataset.state = state;
            statusBadge.textContent = label;
            statusDetail.textContent = detail;
            if (testButton) testButton.disabled = !(status?.ok && status.configured);
        };

        const syncAiMode = () => {
            const remote = backendSelect.value === 'openai-compatible';
            remoteFields.hidden = !remote;
            if (testButton) testButton.hidden = !remote;
        };
        backendSelect.addEventListener('change', syncAiMode);

        let saveAiButton;
        saveAiButton = el('button', {
            class: 'data-action primary',
            type: 'button',
            onclick: () => runAsync(saveAiButton, async () => {
                const payload = {
                    backend: backendSelect.value,
                    baseUrl: backendSelect.value === 'openai-compatible' ? baseUrlInput.value : '',
                    model: backendSelect.value === 'openai-compatible' ? modelInput.value : '',
                };
                if (apiKeyInput.value.trim()) payload.apiKey = apiKeyInput.value;
                const result = await aiConfigure(payload);
                apiKeyInput.value = '';
                if (!result?.ok) throw new Error(result?.error?.message || 'AI 配置保存失败');
                paintAiStatus(result);
                return result;
            }, {
                announce,
                success: () => backendSelect.value === 'openai-compatible' ? '远程 AI 配置已安全保存。' : '已切换到本地对话。',
                failure: (error) => error?.message || 'AI 配置保存失败。',
            }),
        }, '保存配置');

        testButton = el('button', {
            class: 'data-action secondary',
            type: 'button',
            disabled: true,
            onclick: () => runAsync(testButton, async () => {
                const result = await aiTest();
                if (!result?.ok) throw new Error(result?.error?.message || '连接测试失败');
                return result;
            }, {
                announce,
                success: '连接测试通过，服务响应正常。',
                failure: (error) => error?.message || '连接测试失败。',
            }),
        }, '测试连接');

        let clearAiButton;
        clearAiButton = el('button', {
            class: 'data-action ghost',
            type: 'button',
            onclick: () => runAsync(clearAiButton, async () => {
                const result = await aiConfigure({
                    backend: 'local-template',
                    baseUrl: '',
                    model: '',
                    clearKey: true,
                });
                if (!result?.ok) throw new Error(result?.error?.message || '远程配置清除失败');
                backendSelect.value = 'local-template';
                baseUrlInput.value = '';
                modelInput.value = '';
                apiKeyInput.value = '';
                paintAiStatus(result);
                syncAiMode();
                return result;
            }, {
                announce,
                success: '远程配置和密钥已清除。',
                failure: (error) => error?.message || '远程配置清除失败。',
            }),
        }, '清除远程配置');

        const aiCard = card('AI 对话', '默认使用本地对话库；只有主动启用后才会连接兼容服务。',
            el('div', { class: 'ai-status-row' },
                el('div', {}, statusBadge, statusDetail),
                el('label', { class: 'ai-mode', for: 'ai-backend' }, el('span', {}, '对话来源'), backendSelect)),
            remoteFields,
            el('p', { class: 'ai-privacy' }, '密钥只在提交时进入内存，随后由 Windows 安全存储加密；不会写入普通设置、备份文件或页面缓存。'),
            el('div', { class: 'ai-actions', role: 'group', 'aria-label': 'AI 配置操作' }, clearAiButton, testButton, saveAiButton),
        );
        aiCard.classList.add('ai-card');
        syncAiMode();
        Promise.resolve(aiStatus()).then(paintAiStatus).catch(() => paintAiStatus(null));

        let exportButton;
        exportButton = el('button', {
            class: 'data-action secondary',
            type: 'button',
            onclick: () => runAsync(exportButton, dataExport, {
                announce,
                success: (result) => result?.canceled
                    ? '已取消导出。'
                    : `数据已导出到 ${result?.fileName || '备份文件'}。`,
            }),
        }, '导出数据');

        let importButton;
        importButton = el('button', {
            class: 'data-action primary',
            type: 'button',
            onclick: () => runAsync(importButton, dataImport, {
                announce,
                success: (result) => result?.canceled
                    ? '已取消导入。'
                    : `已从 ${result?.fileName || '备份文件'} 恢复数据。`,
            }),
        }, '导入备份');

        const dataCard = card('数据与备份', '将九个数据域保存为一个可迁移的 JSON 备份。',
            el('div', { class: 'data-safety' },
                el('div', { class: 'data-safety-copy' },
                    el('strong', {}, '本地、安全、可恢复'),
                    el('p', {}, '导入前会校验文件格式、字段类型和大小，并先保留当前数据的滚动备份。'),
                ),
                el('div', { class: 'data-actions', role: 'group', 'aria-label': '数据备份操作' },
                    exportButton,
                    importButton,
                ),
            ));
        dataCard.classList.add('data-card');

        root.appendChild(el('div', { class: 'settings-grid' },
            card('声音', '控制提示音与互动音效。',
                slider('音量', 'volume', 0, 1, 0.05),
                toggle('静音', 'mute')),
            card('勿扰', '手动开启，或在每天指定时段自动静音并抑制提醒。',
                el('div', { class: 'control-overview dnd-overview' }, el('div', {}, dndBadge, dndDetail)),
                toggle('手动勿扰', 'dndManual'),
                toggle('定时勿扰', 'dndAutoEnabled'),
                select('开始时间', 'dndHoursStart', hourOptions, { numeric: true }),
                select('结束时间', 'dndHoursEnd', hourOptions, { numeric: true })),
            sceneCard,
            card('健康提醒', '按需启用周期性轻提醒。',
                toggle('喝水提醒', 'waterEnabled'),
                toggle('久坐提醒', 'sitEnabled'),
                toggle('眼睛休息', 'eyeEnabled')),
            card('日程提醒', '仅在应用运行时，按上午、下午、晚上轻轻提示一次。',
                toggle('时间块提醒', 'timeBlockRemindersEnabled')),
            card('行为', '调整宠物主动互动的频率。',
                select('活跃程度', 'autonomyLevel', [
                    { value: 'low', label: '安静' },
                    { value: 'normal', label: '正常' },
                    { value: 'high', label: '活跃' },
                ])),
            card('系统', '控制启动方式。', toggle('开机启动', 'autostart')),
            desktopCard,
            updateCard,
            aiCard,
            dataCard,
        ));
        return () => {
            unsubscribeUpdate();
            clearInterval(dndStatusTimer);
            clearInterval(sceneStatusTimer);
            clearInterval(desktopStatusTimer);
        };
    },
};

/**
 * src/renderer/dialogue.js
 *
 * Local dialogue library — 80+ short Chinese lines indexed by:
 *   time-of-day | state | mood   → list of candidates
 *
 * Picks one randomly while honouring an anti-repeat buffer (last 5).
 * This is the offline "always-works" reply engine behind the AI chat.
 * Phase 7 wraps this same library as a `local-template` AIBackend.
 */

const ANTI_REPEAT_WINDOW = 5;

const TIME_BUCKETS = {
    morning: { start:  5, end:  9 },
    lunch:   { start: 12, end: 14 },
    evening: { start: 18, end: 22 },
    night:   { start: 22, end:  5 },
};

const _DIALOGUE = {
    morning: {
        idle: ['早安呀 ☀️', '今天也慢慢来。', '先喝点水，再开始工作吧。', '今天准备做什么？', '要不要一起吃个早餐？'],
        sit:  ['今天的心情不错呢。', '别忘了待办里的事噢。'],
        work: ['专注 90 分钟是目标，慢慢来。'],
        general: ['身体也醒醒吧，动一动～', '先打开今天的待办清单。'],
    },
    lunch: {
        idle: ['该吃饭啦 🍱', '今天吃什么？', '闻到香味了吗？'],
        eat:  ['好好吃饭～', '慢点吃，别噎着。'],
        general: ['记得喝汤哦。'],
    },
    evening: {
        idle: ['晚上好 ☕', '今天辛苦了。', '要不要来杯柠檬饮料？'],
        sit:  ['休息一下吧。'],
        general: ['甜点要留到最后。'],
    },
    night: {
        sleep: ['Zzz…', '做个好梦 🌙'],
        idle:  ['夜深了，剩下的明天继续也可以。', '该睡觉啦，明天会更好。', '要不要关掉电脑一起睡？'],
        general: ['24 点以后她会睡得更香。'],
    },
    any: {
        love:      ['喜欢你~', '比心 ♥', '我也在想你呀。'],
        cheer:     ['干杯!', '今天也很好呢。', '开心！'],
        surprise:  ['哇!'],
        eat:       ['好吃~', '今天这个好像有点辣。', '甜点要留到最后。'],
        think:     ['嗯…', '让我想想。', '好像有什么要说的。'],
        work:      ['工作中…', '别忘了眨眼。'],
        peek:      ['咦？'],
        wave:      ['嗨~'],
        drink:     ['干杯!', '再来一杯？', '柠檬水最好喝。'],
        run:       ['小跑一下。'],
        stretch:   ['放松一下~'],
        angry:     ['哼!', '不要惹我！'],
        yawn:      ['哈～', '有点困了。'],
        walk:      ['走走看看。'],
    },
    mood_high: {
        love:    ['我今天很开心！', '你在真好。'],
        cheer:   ['今天超级顺利！'],
        idle:    ['心情很棒！'],
    },
    mood_low: {
        idle:    ['要不要休息一下？', '一直在等你回来。'],
        sleep:   ['陪你一起休息会儿。'],
    },
    reminder: {
        water: ['该喝水啦 💧', '小口小口喝～'],
        sit:   ['坐了很久啦，起来走走。'],
        eye:   ['眼睛休息 20 秒，看远处～'],
    },
    pomodoro: {
        work:     ['开始专注 25 分钟 🍅'],
        rest:     ['专注完成！休息一下 ☕'],
        longRest: ['专注完成！这是长休息～'],
        end:      ['番茄钟结束啦。'],
    },
};

function bucket() {
    const h = new Date().getHours();
    for (const [name, w] of Object.entries(TIME_BUCKETS)) {
        if (w.start < w.end) {
            if (h >= w.start && h < w.end) return name;
        } else {
            // wrap-around bucket (night: 22..5)
            if (h >= w.start || h < w.end) return name;
        }
    }
    return 'any';
}

export class Dialogue {
    constructor() {
        this._recent = [];
    }

    /** @param {object} ctx  { state, mood, moodAff, kind? } */
    pick(ctx = {}) {
        const { state, mood = 0, kind } = ctx;
        const b = bucket();
        const candidates = [];

        if (kind && _DIALOGUE[kind]) {
            candidates.push(...(_DIALOGUE[kind][state] || []));
            candidates.push(...(_DIALOGUE[kind].general || []));
        } else {
            if (_DIALOGUE[b]?.[state]) candidates.push(..._DIALOGUE[b][state]);
            if (_DIALOGUE.any?.[state]) candidates.push(..._DIALOGUE.any[state]);
            // Mood-driven extras (high=happy, low=tender)
            if (mood >= 75 && _DIALOGUE.mood_high?.[state]) candidates.push(..._DIALOGUE.mood_high[state]);
            if (mood <= 30 && _DIALOGUE.mood_low?.[state])  candidates.push(..._DIALOGUE.mood_low[state]);
            if (_DIALOGUE[b]?.general) candidates.push(..._DIALOGUE[b].general);
        }

        if (!candidates.length) return '';
        let pick;
        let attempts = 0;
        do {
            pick = candidates[(Math.random() * candidates.length) | 0];
            attempts++;
        } while (attempts < 6 && this._recent.includes(pick));

        this._recent.push(pick);
        if (this._recent.length > ANTI_REPEAT_WINDOW) this._recent.shift();
        return pick;
    }

    /** Convenience: pick a line for a reminder kind ('water'|'sit'|'eye'). */
    reminder(kind) {
        // The `kind`-based buckets in _DIALOGUE are keyed by the reminder id
        // under the sub-key that pick() reads from `state`, so pass it there.
        return this.pick({ state: kind, kind: 'reminder' }) || '🔔';
    }
}

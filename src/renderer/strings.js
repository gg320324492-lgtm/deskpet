/**
 * src/renderer/strings.js
 *
 * Centralized i18n-ish string table.  Currently Chinese-only (matching
 * the rest of the renderer), but every user-visible string is here so a
 * future English/Japanese variant is a one-file swap.
 *
 * The companion's canonical nickname is "小糖" (xiǎo táng, "Little Sugar")
 * — sweet, food-themed, easy to greet.  Replace by changing S.NICKNAME.
 */

export const S = Object.freeze({
    NICKNAME: '小糖',

    GOOD_MORNING:    '早上好 ☀️',
    GOOD_LUNCH:      '该吃饭啦 🍱',
    GOOD_EVENING:    '晚上好 ☕',
    GOOD_NIGHT:      '夜深啦，明天继续也很好。',
    GOING_OFFLINE:   '暂时下线，记得关电脑前喝口水。',
    COMING_BACK:     '我回来了～',

    WATER_REMINDER:  '该喝水啦 💧',
    SIT_REMINDER:    '该站起来走走啦。',
    EYE_REMINDER:    '眼睛休息 20 秒 👁',
    POMODORO_START:  '开始专注 25 分钟 🍅',
    POMODORO_DONE:   '专注完成！休息一下 ☕',
    POMODORO_LONG:   '专注完成！这是长休息～',
    POMODORO_END:    '番茄钟结束啦。',

    FEED_THANKS:    '好吃～ 谢谢投喂！',
    EAT_REMINDER:   '好像有点饿了。',

    AFFINITY_HUG_10: '给我比个心吧 ♥',

    DND_ON:          '进入勿扰模式',
    DND_OFF:         '已退出勿扰',

    ROOM_BUSY:       '房间正在准备，下一版开放。',

    ONBOARDING_GREET:  '你好，我是{S}。',
    ONBOARDING_ASK_NAME: '你可以给我起个昵称吗？（用于设置里的称呼）',
});

export function cleanText(value, max = Infinity) {
    const text = String(value ?? '').replace(/\u0000/g, '').trim();
    return Number.isFinite(max) ? text.slice(0, max) : text;
}

export function interpolate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

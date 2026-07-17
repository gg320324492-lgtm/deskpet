/**
 * A deliberately small scheduling vocabulary shared by the room and runtime.
 * These are soft parts of a day, not calendar appointments.
 */
export const TIME_BLOCKS = Object.freeze([
    { id: 'morning', label: '上午', range: '08:00–12:00' },
    { id: 'afternoon', label: '下午', range: '13:00–18:00' },
    { id: 'evening', label: '晚上', range: '19:00–23:00' },
]);

export function timeBlockForHour(hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return '';
    if (hour >= 8 && hour < 12) return 'morning';
    if (hour >= 13 && hour < 18) return 'afternoon';
    if (hour >= 19 && hour < 23) return 'evening';
    return '';
}

export function timeBlockLabel(id) {
    return TIME_BLOCKS.find((block) => block.id === id)?.label || '未安排';
}

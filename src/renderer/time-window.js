/**
 * Shared half-open hour-range check used by both DND scheduling and scene
 * scheduling. Kept dependency-free so it can be re-exported from renderer
 * modules without pulling in their side effects.
 *
 * Validation order intentionally matches the legacy DND helper: an invalid
 * start hour short-circuits before the end hour is inspected.
 */
export function isWithinHours(date, startHour, endHour) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) return false;
    if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23) return false;
    if (startHour === endHour) return false;

    const hour = date.getHours();
    if (startHour < endHour) return hour >= startHour && hour < endHour;
    return hour >= startHour || hour < endHour;
}
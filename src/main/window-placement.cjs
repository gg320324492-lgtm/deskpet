'use strict';

const DEFAULT_RIGHT_MARGIN = 80;
const DEFAULT_TOP_MARGIN = 120;
const POSITION_LIMIT = 100_000;

function workAreaOf(display) {
    const area = display?.workArea;
    if (!area || ![area.x, area.y, area.width, area.height].every(Number.isFinite)) {
        throw new TypeError('display.workArea must contain finite x, y, width and height values');
    }
    return area;
}

function pointInside(point, display) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const area = workAreaOf(display);
    return point.x >= area.x && point.x < area.x + area.width
        && point.y >= area.y && point.y < area.y + area.height;
}

function displayId(display) {
    return display?.id == null ? '' : String(display.id);
}

function displayTargetForId(id) {
    const value = String(id ?? '').trim();
    return value ? `display:${value}` : 'primary';
}

function isDisplayTarget(target) {
    return target === 'primary' || target === 'cursor'
        || (typeof target === 'string' && /^display:[A-Za-z0-9_.-]{1,64}$/.test(target));
}

function selectTargetDisplay({ displays, primaryDisplay, cursorPoint, target = 'primary' }) {
    const available = Array.isArray(displays) ? displays.filter(Boolean) : [];
    if (!available.length && primaryDisplay) available.push(primaryDisplay);
    if (!available.length) throw new Error('At least one display is required');

    const primaryId = displayId(primaryDisplay);
    const primary = available.find((display) => displayId(display) === primaryId)
        || available.find((display) => display.primary)
        || primaryDisplay
        || available[0];

    if (target === 'cursor') {
        return available.find((display) => pointInside(cursorPoint, display)) || primary;
    }
    if (typeof target === 'string' && target.startsWith('display:')) {
        const targetId = target.slice('display:'.length);
        return available.find((display) => displayId(display) === targetId) || primary;
    }
    return primary;
}

function clampWindowBounds(bounds, display) {
    const area = workAreaOf(display);
    const width = Math.max(1, Math.round(Number(bounds?.width) || 1));
    const height = Math.max(1, Math.round(Number(bounds?.height) || 1));
    const maxX = area.x + Math.max(0, area.width - width);
    const maxY = area.y + Math.max(0, area.height - height);
    const x = Math.max(area.x, Math.min(Math.round(Number(bounds?.x) || 0), maxX));
    const y = Math.max(area.y, Math.min(Math.round(Number(bounds?.y) || 0), maxY));
    return { x, y, width, height };
}

function defaultWindowBounds(display, width, height) {
    const area = workAreaOf(display);
    return clampWindowBounds({
        x: area.x + area.width - width - DEFAULT_RIGHT_MARGIN,
        y: area.y + DEFAULT_TOP_MARGIN,
        width,
        height,
    }, display);
}

function savedPosition(settings) {
    const x = settings?.petWindowX;
    const y = settings?.petWindowY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (Math.abs(x) > POSITION_LIMIT || Math.abs(y) > POSITION_LIMIT) return null;
    return { x, y };
}

function displayForSavedPosition(settings, displays, width, height) {
    const saved = savedPosition(settings);
    if (!saved) return null;

    const requestedId = settings?.petDisplayId == null ? '' : String(settings.petDisplayId);
    const byId = requestedId
        ? displays.find((display) => displayId(display) === requestedId)
        : null;
    if (byId) return byId;

    const center = { x: saved.x + width / 2, y: saved.y + height / 2 };
    return displays.find((display) => pointInside(center, display))
        || displays.find((display) => pointInside(saved, display))
        || null;
}

function resolveStartupBounds({
    settings = {},
    displays,
    primaryDisplay,
    cursorPoint,
    width,
    height,
}) {
    const available = Array.isArray(displays) ? displays.filter(Boolean) : [];
    const saved = savedPosition(settings);
    const savedDisplay = saved
        ? displayForSavedPosition(settings, available, width, height)
        : null;
    const display = savedDisplay || selectTargetDisplay({
        displays: available,
        primaryDisplay,
        cursorPoint,
        target: settings.multiDisplayTarget,
    });
    const bounds = savedDisplay
        ? clampWindowBounds({ ...saved, width, height }, display)
        : defaultWindowBounds(display, width, height);

    return { ...bounds, displayId: displayId(display) };
}

function serializeWindowPosition(bounds, display) {
    if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
        throw new TypeError('window bounds must contain finite x and y values');
    }
    return {
        petWindowX: Math.round(bounds.x),
        petWindowY: Math.round(bounds.y),
        petDisplayId: displayId(display),
    };
}

module.exports = {
    clampWindowBounds,
    defaultWindowBounds,
    displayForSavedPosition,
    displayTargetForId,
    isDisplayTarget,
    resolveStartupBounds,
    selectTargetDisplay,
    serializeWindowPosition,
};

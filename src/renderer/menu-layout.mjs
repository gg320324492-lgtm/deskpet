function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

export function clampMenuPosition({
    x,
    y,
    menuWidth,
    menuHeight,
    viewportWidth,
    viewportHeight,
    margin = 6,
}) {
    const safeMargin = Math.max(0, finite(margin));
    const width = Math.max(0, finite(menuWidth));
    const height = Math.max(0, finite(menuHeight));
    const viewportW = Math.max(0, finite(viewportWidth));
    const viewportH = Math.max(0, finite(viewportHeight));
    const maxLeft = Math.max(safeMargin, viewportW - width - safeMargin);
    const maxTop = Math.max(safeMargin, viewportH - height - safeMargin);

    return {
        left: clamp(finite(x, safeMargin), safeMargin, maxLeft),
        top: clamp(finite(y, safeMargin), safeMargin, maxTop),
    };
}

export function attachMenuKeyboardNavigation({ menu, onEscape = () => {} }) {
    if (!menu?.querySelectorAll || !menu?.addEventListener) {
        throw new TypeError('A menu element is required.');
    }

    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const focusAt = (index) => {
        if (!items.length) return;
        const normalized = (index + items.length) % items.length;
        items[normalized].focus({ preventScroll: true });
        items[normalized].scrollIntoView({ block: 'nearest' });
    };

    menu.addEventListener('keydown', (event) => {
        const current = Math.max(0, items.indexOf(menu.ownerDocument.activeElement));
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusAt(current + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusAt(current - 1);
        } else if (event.key === 'Home') {
            event.preventDefault();
            focusAt(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            focusAt(items.length - 1);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            menu.ownerDocument.activeElement?.click();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onEscape();
        }
    });

    focusAt(0);
}

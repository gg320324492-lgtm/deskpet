/**
 * src/renderer/popover.js
 *
 * Small reusable DOM popover that anchors to the pet sprite.  Used for:
 *   - Quick notes / quick add reminders / quick add todos
 *   - "问她一句话" chat input
 *   - DND confirmation banner
 *   - Pomodoro phase-end announcement
 *
 * One DOM host at a time — the most recent call wins and closes the prior.
 */
const HOST_ID = 'pet-popover';

export class Popover {
    constructor(petEl) {
        this._pet = petEl;
        this._current = null;  // { el, onClose }
    }

    /**
     * @param {object} opts
     *   - html      : string   innerHTML to render
     *   - onClose   : function called when popover is dismissed
     *   - width     : px       (default 240)
     *   - position  : 'above' | 'below' | 'right' | 'left' (default 'above')
     *   - autoClose : ms | false    (default 60000)
     *   - interactive : bool   true => accepts clicks inside
     */
    open(opts) {
        this.close();

        const host = document.createElement('div');
        host.id = HOST_ID;
        Object.assign(host.style, {
            position: 'absolute',
            background: 'rgba(255,255,255,0.97)',
            color: '#2B1F1A',
            borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
            padding: '10px 14px',
            fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
            fontSize: '13px',
            zIndex: '9000',
            width: (opts.width || 240) + 'px',
            maxWidth: '260px',
        });
        host.innerHTML = opts.html || '';

        const rect = this._pet.getBoundingClientRect();
        const petRight = rect.left + rect.width;
        const petTop   = rect.top;
        // Position relative to the pet root.
        const r = (this._pet.offsetParent || document.body).getBoundingClientRect();
        let top  = 0;
        let left = (rect.left - r.left) + rect.width + 6;
        switch (opts.position || 'right') {
            case 'above':  top  = -rect.height + 60; left = 20; break;
            case 'below':  top  = 0;                  left = 20; break;
            case 'left':   top  = 60; left = -rect.width - (opts.width || 240) - 12; break;
            case 'right':
            default:       top  = 60; left = rect.width + 6;
        }
        host.style.top  = top + 'px';
        host.style.left = left + 'px';

        this._pet.appendChild(host);

        const close = (reason) => {
            if (host.parentNode) host.parentNode.removeChild(host);
            if (this._current && this._current.el === host) {
                this._current = null;
                if (typeof opts.onClose === 'function') opts.onClose(reason);
            }
        };

        if (opts.autoClose !== false) {
            const ms = opts.autoClose || 60_000;
            this._autoCloseTimer = setTimeout(() => close('timeout'), ms);
        }

        // Click outside dismisses.
        const onDocDown = (ev) => {
            if (!host.contains(ev.target)) {
                document.removeEventListener('mousedown', onDocDown, true);
                close('outside-click');
            }
        };
        setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);

        this._current = { el: host, onClose: close };
        return { close, host };
    }

    close() {
        if (this._autoCloseTimer) clearTimeout(this._autoCloseTimer);
        this._autoCloseTimer = null;
        if (this._current) {
            try { this._current.el.remove(); } catch (_) {}
            this._current = null;
        }
    }
}

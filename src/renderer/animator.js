/**
 * animator.js
 *
 * Sprite cross-fade, idle breathing/blink, per-state particle effects, and
 * state-driven speech bubbles.  All per-state configurations are derived from
 * state-catalog.js (SSOT).
 */
import { spriteLoader } from './sprite-loader.js';
import {
    STATES,
    ALL_STATES,
    BREATH_STATES,
    BUBBLE_MESSAGES,
    BUBBLE_MOOD,
    TEMP_DURATIONS,
    STATE_PARTICLES,
} from './state-catalog.mjs';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export class Animator {
    constructor(petEl, stateMachine) {
        this._pet = petEl;
        this._sm = stateMachine;
        this._imgEl = petEl.querySelector('.pet-sprite');
        this._bubbleEl = petEl.querySelector('.bubble');
        this._timeBubbleEl = petEl.querySelector('.time-bubble');
        this._fxCanvas = petEl.querySelector('.fx-layer');
        this._fxCtx = this._fxCanvas.getContext('2d');
        this._activeEffect = null;     // { name, raf, stop }
        this._blinkTimeout = null;
        this._blinkPhase = 0;          // schedule next blink

        this._sm.onChange((next) => this._onStateChange(next));
        this._scheduleNextBlink();
    }

    // ===== Public API =====
    /** Paint the sprite/effects for the current state (initial boot render). */
    renderCurrent() {
        this._onStateChange(this._sm.state);
    }

    setBubbleText(text, mood = '') {
        this._bubbleEl.textContent = text;
        this._bubbleEl.className = 'bubble visible' + (mood ? ' ' + mood : '');
        if (text) {
            clearTimeout(this._bubbleHideTimer);
            this._bubbleHideTimer = setTimeout(() => {
                this._bubbleEl.classList.remove('visible');
            }, TEMP_DURATIONS[this._sm.state] || 2500);
        }
    }

    showTimeGreeting(text, mood = 'mood-morning') {
        this._timeBubbleEl.textContent = text;
        this._timeBubbleEl.className = 'time-bubble ' + mood + ' visible';
        clearTimeout(this._timeHideTimer);
        this._timeHideTimer = setTimeout(() => {
            this._timeBubbleEl.classList.remove('visible');
        }, 4000);
    }

    triggerWorkKeyFx() {
        this._spawnWorkKeyBurst();
    }

    // ===== State change handler =====
    async _onStateChange(state) {
        // 1) cross-fade sprite
        await this._crossFade(state);

        // 2) breathing
        if (BREATH_STATES.has(state)) {
            this._pet.classList.add('breathing-on');
        } else {
            this._pet.classList.remove('breathing-on');
        }

        // 3) bubble
        this._updateBubble(state);

        // 4) per-state particle effect
        this._stopActiveEffect();
        this._startEffectForState(state);

        // 5) schedule next blink on entering IDLE
        if (state === STATES.IDLE) {
            this._scheduleNextBlink();
        }
    }

    async _crossFade(state) {
        const img = spriteLoader.getImage(state);
        if (!img) return;
        if (this._imgEl.src === img.src) return;     // no-op for same state

        this._pet.classList.remove('entering');
        this._pet.classList.add('leaving');
        await wait(120);
        this._imgEl.src = img.src;
        this._pet.classList.remove('leaving');
        this._pet.classList.add('entering');
        await wait(180);
        this._pet.classList.remove('entering');

        // Update data-missing badge for missing-art states.
        if (spriteLoader.isMissing(state)) {
            this._pet.dataset.missing = state;
            this._imgEl.classList.add('sprite-missing');
        } else {
            delete this._pet.dataset.missing;
            this._imgEl.classList.remove('sprite-missing');
        }
    }

    _updateBubble(state) {
        const text = BUBBLE_MESSAGES[state] || '';
        const mood = BUBBLE_MOOD[state] || '';
        if (!text) {
            this._bubbleEl.classList.remove('visible');
            return;
        }
        this.setBubbleText(text, mood);
    }

    // ===== Blinking =====
    _scheduleNextBlink() {
        clearTimeout(this._blinkTimeout);
        const delay = 4000 + Math.random() * 3000;   // 4-7s
        this._blinkTimeout = setTimeout(() => this._blink(), delay);
    }

    _blink() {
        if (this._sm.state !== STATES.IDLE) {
            this._scheduleNextBlink();
            return;
        }
        this._pet.classList.add('blinking');
        setTimeout(() => this._pet.classList.remove('blinking'), 160);
        this._scheduleNextBlink();
    }

    // ===== Particle effect dispatcher =====
    _startEffectForState(state) {
        const kind = STATE_PARTICLES[state];
        if (!kind) return;
        switch (kind) {
            case 'sleep_z':     this._startSleepZ();     break;
            case 'love_hearts': this._startLoveHearts(); break;
            case 'work_keys':   this._startWorkKeys();   break;
        }
    }

    _stopActiveEffect() {
        if (this._activeEffect) {
            cancelAnimationFrame(this._activeEffect.raf);
            this._activeEffect = null;
            this._clearFx();
        }
    }

    _clearFx() {
        this._fxCtx.clearRect(0, 0, this._fxCanvas.width, this._fxCanvas.height);
    }

    // ===== SLEEP Z characters =====
    _startSleepZ() {
        const W = this._fxCanvas.width;
        const H = this._fxCanvas.height;
        const zs = [
            { x: 200, y: 100, size: 22, life: 1, dur: 4000, delay: 0   },
            { x: 215, y: 110, size: 18, life: 1, dur: 3500, delay: 600 },
            { x: 190, y: 95,  size: 16, life: 1, dur: 3200, delay: 1200},
        ];
        const start = performance.now();
        const tick = (now) => {
            this._clearFx();
            this._fxCtx.fillStyle = 'rgba(255,255,255,0.78)';
            this._fxCtx.font = 'bold 22px sans-serif';
            this._fxCtx.textAlign = 'center';
            for (const z of zs) {
                const t = (now - start - z.delay) / z.dur;
                if (t < 0 || t > 1) continue;
                const yOff = -40 * t;
                this._fxCtx.globalAlpha = (1 - t) * 0.85;
                this._fxCtx.font = `bold ${z.size}px sans-serif`;
                this._fxCtx.fillText('Z', z.x, z.y + yOff);
            }
            this._fxCtx.globalAlpha = 1;
            if (now - start < zs[zs.length-1].delay + zs[zs.length-1].dur + 500) {
                this._activeEffect = { raf: requestAnimationFrame(tick) };
            } else {
                this._activeEffect = null;
            }
        };
        this._activeEffect = { raf: requestAnimationFrame(tick) };
    }

    // ===== LOVE / DRINK hearts =====
    _startLoveHearts() {
        const W = this._fxCanvas.width, H = this._fxCanvas.height;
        const hearts = Array.from({length: 10}, () => ({
            x: W / 2 + (Math.random() - 0.5) * 30,
            y: H - 140,
            vx: (Math.random() - 0.5) * 80,
            vy: -60 - Math.random() * 50,
            size: 10 + Math.random() * 10,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.25,
            life: 1,
        }));
        const start = performance.now();
        const dur = 2000;
        const tick = (now) => {
            const t = (now - start) / 1000;
            this._clearFx();
            this._fxCtx.textAlign = 'center';
            for (const h of hearts) {
                h.x += h.vx * 0.016;
                h.y += h.vy * 0.016;
                h.vy += 30 * 0.016;       // gravity
                h.rot += h.vr;
                h.life = Math.max(0, 1 - t / 2);
                if (h.life <= 0) continue;
                this._fxCtx.save();
                this._fxCtx.translate(h.x, h.y);
                this._fxCtx.rotate(h.rot);
                this._fxCtx.globalAlpha = h.life;
                this._fxCtx.fillStyle = '#FF6B9D';
                this._fxCtx.font = `bold ${h.size * 1.5}px sans-serif`;
                this._fxCtx.fillText('♥', 0, 0);   // ♥
                this._fxCtx.restore();
            }
            this._fxCtx.globalAlpha = 1;
            if (t < dur / 1000) {
                this._activeEffect = { raf: requestAnimationFrame(tick) };
            } else {
                this._activeEffect = null;
                this._clearFx();
            }
        };
        this._activeEffect = { raf: requestAnimationFrame(tick) };
    }

    // ===== WORK keys =====
    _startWorkKeys() {
        this._clearFx();
        this._activeEffect = { raf: 0, periodic: true };
        this._drawWorkKeyFrame(0);
    }

    _drawWorkKeyFrame(t) {
        this._clearFx();
        this._fxCtx.textAlign = 'center';
        this._fxCtx.fillStyle = 'rgba(107,140,255,0.85)';
        this._fxCtx.font = 'bold 16px Consolas, monospace';
        const dots = '.'.repeat((t % 3) + 1);
        this._fxCtx.fillText(dots, 160, 270);
    }

    _spawnWorkKeyBurst() {
        if (this._sm.state !== STATES.WORK) return;
        this._clearFx();
        this._fxCtx.textAlign = 'center';
        this._fxCtx.fillStyle = '#6B8CFF';
        this._fxCtx.font = 'bold 18px Consolas, monospace';
        const chars = ['*', '.', '*', '.'];
        for (let i = 0; i < 5; i++) {
            this._fxCtx.globalAlpha = Math.random() * 0.6 + 0.4;
            this._fxCtx.fillText(
                chars[(Math.random() * chars.length) | 0],
                140 + Math.random() * 40,
                250 + Math.random() * 30
            );
        }
        this._fxCtx.globalAlpha = 1;
        setTimeout(() => this._drawWorkKeyFrame(0), 300);
    }
}

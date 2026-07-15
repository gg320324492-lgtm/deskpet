/**
 * src/renderer/affinity.js
 *
 * AffinityEngine — accepts "events" (click, pomodoro-complete, todo-all-done,
 * daily streak, etc.) and bumps an affinity score stored inside the mood
 * domain (`mood.affinity`). Affinity is monotonic (no decay).
 *
 * Affinity threshold table (one-way unlocks):
 *   >=  10   : First hug sound, mature dialogue tier 1
 *   >=  30   : Sit pose unlocked in wardrobe
 *   >=  60   : "Cherry blossom" decoration in room
 *   >= 100   : Voice line unlocked (Phase 7+)
 *   >= 200   : Anniversary outfit tile revealed
 *
 * The mood snapshot is `mood.affinity`; we update via setMood() rather than
 * reaching into achievements internals.
 */
const TIERS = [
    { min:  10, id: 'mature-dialogue-1' },
    { min:  30, id: 'sit-pose' },
    { min:  60, id: 'room-cherry' },
    { min: 100, id: 'voice-line' },
    { min: 200, id: 'anniversary-outfit' },
];

export class AffinityEngine {
    constructor({ getMood, setMood, achievements }) {
        this._getMood = getMood;
        this._setMood = setMood;
        this._achievements = achievements;
    }

    /** Increments + emits 'unlocked' events for any new tiers crossed. */
    async bump(delta, reason) {
        const m = this._getMood();
        const before = m.affinity ?? 0;
        const after = Math.max(0, before + delta);
        await this._setMood({ ...m, affinity: after, lastTickAt: Date.now() });
        const crossed = TIERS.filter(t => before < t.min && after >= t.min);
        for (const t of crossed) {
            if (this._achievements) await this._achievements.unlock(t.id, { source: 'affinity', reason });
        }
        return { delta, before, after, unlocked: crossed.map(t => t.id) };
    }

    snapshot() {
        const aff = this._getMood().affinity ?? 0;
        return {
            affinity: aff,
            tiers: TIERS.filter(t => aff >= t.min).map(t => t.id),
            nextTier: TIERS.find(t => aff < t.min) || null,
        };
    }
}

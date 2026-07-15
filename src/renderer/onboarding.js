/**
 * src/renderer/onboarding.js
 *
 * First-launch wizard:
 *   1. Greeting
 *   2. (Optional) nickname preference
 *   3. (Optional) autostart opt-in
 *   4. Privacy acknowledgement
 *   5. Save settings.onboardingDone = true and dismiss.
 */
import { S, interpolate } from './strings.js';

export function runOnboarding({ root, getSettings, setSettings, popover, autostartGet, autostartSet, animator }) {
    const settings = getSettings();
    if (settings.onboardingDone) return false;

    const onClose = async (accepted) => {
        await setSettings({
            settings: {
                ...settings,
                onboardingDone: true,
                preferredName: accepted ? (document.getElementById('onb-name')?.value || '') : '',
            },
        });
    };

    const { close, host } = popover.open({
        html: `
            <div style="font-weight:700;font-size:15px;margin-bottom:6px">你好呀，我是${S.NICKNAME} 👋</div>
            <div style="font-size:12px;color:#5a5a5a;margin-bottom:10px;line-height:1.5">
                很高兴见面。我会陪你工作、休息、做番茄钟。
                <br/>下面三步只是让体验更合适，你可以随时在偏好设置里改。
            </div>
            <label style="display:block;margin-bottom:8px">
                <div style="font-size:11px;color:#888">希望我怎么称呼你（可选）</div>
                <input id="onb-name" placeholder="昵称 (留空用默认)" style="width:100%;padding:6px;border-radius:6px;border:1px solid #ddd;margin-top:2px"/>
            </label>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <input id="onb-auto" type="checkbox"/>
                <span style="font-size:12px">开机自动启动</span>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
                <input id="onb-priv" type="checkbox" checked/>
                <span style="font-size:11px;color:#666;line-height:1.4">
                    我不会收集屏幕内容、麦克风或剪贴板。所有偏好只存在本机。
                </span>
            </label>
            <div style="display:flex;gap:6px;justify-content:flex-end">
                <button data-act="later">以后再说</button>
                <button data-act="ok">开始陪伴</button>
            </div>
        `,
        width: 320,
        position: 'above',
        onClose,
        autoClose: false,
    });

    host.querySelector('button[data-act="ok"]')?.addEventListener('click', async () => {
        const auto = host.querySelector('#onb-auto').checked;
        const priv = host.querySelector('#onb-priv').checked;
        if (!priv) {
            alert('请确认隐私说明后再继续。');
            return;
        }
        try {
            const cur = await autostartGet();
            const want = auto ? !cur.openAtLogin : cur.openAtLogin;
            if (auto !== !!cur.openAtLogin) {
                await autostartSet(auto);
            }
        } catch (_) {}
        close('ok');
    });

    host.querySelector('button[data-act="later"]')?.addEventListener('click', () => close('later'));

    animator.setBubbleText(interpolate(S.ONBOARDING_GREET, { S: S.NICKNAME }));
    return true;
}

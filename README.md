# Date Night Girl — 桌面动态宠物 v2

一个基于 **Electron + HTML/Canvas** 的 Windows 桌面动态宠物，以治愈系二次元少女"Date Night Girl"为形象。悬浮在桌面上方，背景透明、可拖拽、可交互。

v2 在 v1 的动画宠物之上，增加了**性格系统**（心情 / 好感 / 记忆）、**效率工具**（番茄钟 / 待办 / 提醒 / 勿扰）、**成就与换装**、**本地对话 + 可选 LLM 接入**，以及一个独立的**角色房间窗口**。所有状态通过磁盘持久化（9 个数据域）。

## 特性

- 🎨 **18 个完整状态**：全部配有独立透明立绘，覆盖待机、互动、表情、工作与休息动作
- 🪟 **真正的透明窗口**：PNG alpha 通道融入桌面，DWM 合成、始终置顶、不抢焦点
- 🖱️ **alpha 命中穿透**：鼠标在透明区时穿透到桌面，只有立绘实体区域可交互
- 🎬 **cross-fade 切换**：状态切换平滑过渡；呼吸 / 随机眨眼 / 粒子（爱心、Z、打字）效果
- 🧠 **性格系统**：心情 `mood`、能量 `energy`、饥饿 `hunger`、好感 `affinity`、专注 `focus`，随时间衰减、随互动变化
- 🏆 **成就系统**：首次启动、连击、陪伴时长等成就解锁
- ⏱ **番茄钟**：工作 / 短休 / 长休阶段，气泡提示
- ☑️ **待办清单**：支持收件箱、今天 / 稍后分类、上午 / 下午 / 晚上轻量时间块、每日收尾归位、明日 1+2 轻计划、今日启动接力、久留任务归档、本地标题搜索、轻量编辑与下一步备注、当天完成回看与撤销、今日主线与一键专注、专注过程轻反馈与结束三选一、专注后一行轻回顾与今日片段、专注中随手收集、首页轻整理与一小段轻启动、专注后下一步接力、优先级、每日 / 每周重复与一键专注
- 🔔 **提醒引擎**：内置喝水 / 久坐 / 护眼三类，可自定义，可贪睡 5 分钟
- 🌙 **勿扰模式**：手动或按时间段自动，支持跨夜时段，静音 + 抑制提醒
- 🎭 **场景化陪伴**：自由、专注、轻松与深夜四种快捷场景；可按时间自动切换，只临时叠加互动与勿扰效果，不会改写原有偏好
- 🍅 **专注流程闭环**：从待办直接开始番茄钟，工作/休息自动切换陪伴场景；工作完成后自动勾选关联任务，托盘可暂停、跳过或结束
- 🖥️ **多屏位置记忆与控制**：按主屏、鼠标所在屏幕或指定显示器启动，重启恢复拖动位置；设置页可一键移回当前屏或恢复默认位置
- 💬 **安全 AI 接入**：本地对话库始终可用；可选 OpenAI 兼容接口由主进程代理，密钥使用 Windows 安全存储加密
- 👗 **换装（Wardrobe）**：默认白裙与覆盖全部 18 个动作的薰衣草睡衣；不完整自定义套装可逐动作回退
- 🏠 **角色房间窗口**：状态 / 成就 / 换装 / 投喂 / 设置 5 个标签页
- 💾 **安全备份与迁移**：设置页可导出 / 导入九个数据域；导入前执行格式、类型、范围和大小校验
- 🔄 **签名更新链路**：NSIS 安装版可通过可信发布源检查、下载并验证更新；便携版保持手动升级
- 🧭 **首次启动引导（Onboarding）** 与 **时段问候气泡**
- 💤 **多级闲置行为**：闲置偶发 PEEK → SIT 后 YAWN → 进入 SLEEP

## 18 状态表

12 个核心状态：

| 状态 | 含义 | 键 | 类别 |
|------|------|----|------|
| IDLE | 待机 | `1` | persistent |
| WALK | 行走 / 跑动 | `2` | action |
| SIT | 盘腿抱枕 | `3` | persistent |
| EAT | 吃饭 | `4` | temporary |
| THINK | 思考 | `5` | temporary |
| CHEER | 干杯 / 旋转 | `6` | temporary |
| SURPRISE | 惊喜 / 指向 | `7` | temporary |
| SLEEP | 打瞌睡 | `8` | persistent |
| YAWN | 哈欠 | `9` | temporary |
| LOVE | 比心 | `0` | temporary |
| WORK | 膝上电脑 | `W` | sustained |
| PEEK | 歪头眨眼 | `P` | temporary |

6 个新增状态：

| 状态 | 含义 | 键 | 类别 |
|------|------|----|------|
| WAVE | 挥手 | `V` | temporary |
| DRINK | 喝饮料 | `B` | temporary |
| RUN | 奔跑 | `R` | action |
| LAND | 落地 | — | temporary |
| ANGRY | 生气 | `X` | temporary |
| STRETCH | 伸懒腰 | `S` | temporary |

> `Esc` 回到 IDLE。LAND 在宠物被拖放到普通位置时自动触发，其余新增动作可通过快捷键或右键菜单触发。

## 项目结构

```
deskpet/
├── assets/
│   ├── raw/ raw_v2/          # 原图素材（两代来源）
│   ├── processed/            # 输出的透明 PNG 立绘
│   ├── outfits/<name>/       # 换装立绘（可选）
│   ├── raw_outfits/<name>/   # 换装透明源图（不打包）
│   ├── audio/                # 音效
│   └── state-manifest.json   # 由 gen_state_manifest.mjs 生成，供 Python 预处理消费
├── src/
│   ├── main/                 # 主进程
│   │   ├── main.js           # 入口 + IPC
│   │   ├── window.js         # 透明宠物窗口 + 拖拽 + 命中穿透
│   │   ├── room-window.js    # 角色房间 BrowserWindow
│   │   ├── tray.js           # 系统托盘菜单
│   │   ├── storage.js        # 8 域 JSON 持久化（防抖写盘 + 滚动备份 + 损坏恢复）
│   │   ├── ai-policy.cjs     # AI 地址、模型、提示词和响应边界
│   │   ├── ai-service.cjs    # 主进程请求代理 + 对话历史
│   │   ├── credential-vault.cjs # Windows safeStorage 密钥保险库
│   │   ├── update-service.cjs # 自动更新状态机 + 调度 + 安装确认
│   │   ├── preload.js        # contextBridge 暴露 petAPI
│   │   └── paths.js
│   ├── shared/
│   │   ├── ipc-channels.js   # IPC 频道常量
│   │   └── schema.cjs        # 默认值 + 迁移 + 深层校验 + 备份格式
│   ├── renderer/             # 宠物渲染进程
│   │   ├── bootstrap.js      # 渲染入口，装配全部模块
│   │   ├── state-catalog.mjs # 18 状态 SSOT（键位 / 立绘 / 合法转移 / 菜单）
│   │   ├── state-machine.js  # 状态机 + 合法转移表
│   │   ├── sprite-loader.js  # 立绘加载 + alpha 命中测试
│   │   ├── animator.js       # cross-fade + 粒子 + 气泡
│   │   ├── interaction.js    # 连击 / 滚轮 / Shift / 键盘 / 右键菜单
│   │   ├── idle-watcher.js   # 闲置调度
│   │   ├── behavior-arbiter.js # 环境行为优先级仲裁
│   │   ├── mood.js affinity.js achievements.js memory.js # 性格系统
│   │   ├── pomodoro.js reminders.js todo.js dnd.js       # 效率工具
│   │   ├── dialogue.js ai-chat.js                        # 对话 + LLM
│   │   ├── wardrobe.js sound.js popover.js onboarding.js strings.js
│   │   ├── index.html styles.css
│   └── room/                 # 角色房间窗口
│       ├── index.html room.js styles.css tabs.js
├── scripts/
│   ├── launch.js             # 启动包装（清理 ELECTRON_RUN_AS_NODE）
│   ├── gen_state_manifest.mjs# 由 state-catalog.mjs 生成 state-manifest.json
│   ├── release.mjs           # 强制签名构建 + 元数据 + SHA-256 清单
│   ├── release-policy.mjs    # 发布源、tag 与签名凭据预检
│   └── preprocess_assets.py  # 立绘预处理（去背 / 阈值 / 缩放）
├── docs/RELEASE.md           # Windows 签名、自动更新与发布手册
├── tests/                    # node --test 单测
├── build/icon.ico
├── package.json
└── README.md
```

## 存储（9 个数据域）

主进程 `storage.js` 把每个域写成 `userData` 下独立的 JSON 文件，带**防抖写盘、原子替换和滚动备份**。每次有效变更会把上一版保留为 `<domain>.json.bak`；无法解析的文件会隔离为 `<domain>.json.corrupt-<timestamp>.bak`，随后回退默认值，不会覆盖可用滚动备份。

默认值、迁移、字段类型 / 范围约束以及备份格式统一定义在 `src/shared/schema.cjs`。磁盘加载会丢弃未知或非法字段，IPC 写入和备份导入则采用严格拒绝策略：

| 域 | 内容 |
|----|------|
| `settings` | 音量、活跃度、提醒开关与间隔、勿扰与场景时段、多屏目标与窗口位置、换装、开机启动、自动更新开关、AI 服务地址与模型等；不含 API 密钥 |
| `mood` | mood / energy / hunger / affinity / focus + lastTickAt |
| `todos` | 待办条目 |
| `pomodoro` | 番茄钟配置与今日 / 累计计数 |
| `reminders` | 自定义提醒 + 贪睡记录 |
| `memory` | 昵称、作息、喜好等（"忘记我"可清空） |
| `achievements` | 已解锁成就 |
| `stats` | 陪伴时长、连续天数等 |
| `rhythm` | 本地专注、任务与场景事件，以及每日轻复盘和每周轻目标 |

设置页的“数据与备份”可导出单个版本化 JSON 文件。导入时要求九个数据域完整，文件不超过 2 MB；只有在全部校验通过并经用户确认后才会替换数据，替换前仍会保留当前滚动备份。

## 角色房间窗口

右键菜单"角色"分组或托盘可打开独立窗口，含 5 个标签页：**状态（stats）/ 成就（achievements）/ 换装（outfits）/ 投喂（feed）/ 设置（settings）**。房间与宠物共享存储，任一侧改动通过 `storage:onchanged` 实时同步。数据导入 / 导出仅向沙箱化的房间窗口暴露，文件选择与读写由主进程接管。

## AI 配置与隐私

默认的“本地对话”不联网。若要使用自己的 OpenAI 兼容服务，在角色房间的“设置 → AI 对话”中选择“OpenAI 兼容接口”，填写服务地址、模型 ID 和 API 密钥，然后先保存、再测试连接。

- 远程地址必须使用 HTTPS；只有 `localhost`、`127.0.0.1` 和 `::1` 允许 HTTP。
- 可填写服务根地址、`/v1` 地址或完整的 `/v1/chat/completions` 地址，应用会规范化为兼容端点。
- API 密钥只通过最小化 IPC 传给主进程，使用 Electron `safeStorage` 加密后写入独立的 `credentials.v1.json`；渲染页面无法读回密钥。
- API 密钥不属于九个普通数据域，不会进入设置 JSON、导出的备份或 Web Storage。点击“清除远程配置”会同时删除密钥文件。
- 所有外部请求由主进程发起；渲染页 CSP 保持 `connect-src 'none'`。请求禁止重定向，并限制超时、提示词长度、历史条数和响应体大小。
- 对话仅发送当前输入和最多 12 条内存历史；关闭应用后历史不会持久化。系统提示会固定隐私和能力边界，用户历史不能提升为系统指令。

## 应用更新

“房间设置 → 应用更新”会显示当前版本、更新通道、检查状态和下载进度。自动更新仅在已安装、已签名且包含可信更新清单的 Windows NSIS 正式版启用；开发版、便携版、非 Windows 构建和未配置发布源的构建不会发起更新请求。

更新由主进程下载，安装前执行 Windows 代码签名验证；下载完成后由用户选择立即重启安装或稍后处理。完整证书配置、GitHub Actions 和自有服务器流程见 [Windows 签名与更新发布](docs/RELEASE.md)。

## 交互速查

| 操作 | 效果 |
|------|------|
| 左键单击 | SURPRISE |
| 左键双击 | CHEER |
| 左键三连击 | LOVE（+ 爱心粒子） |
| 中键 | EAT |
| 滚轮上 / 下 | LOVE / SURPRISE |
| 左键拖动 | WALK（窗口跟随） |
| 拖到屏幕底部 / 顶部 | SIT / PEEK |
| 悬停 ≥ 3s | THINK |
| Shift + 左键 | WORK |
| 数字键 `1`–`0` | 对应状态 |
| `W` / `P` | WORK / PEEK |
| `Esc` | 回 IDLE |
| `H` | 隐藏 / 显示 |
| 右键 | 分组菜单（互动 / 效率 / 角色 / 设置）+ 退出 |
| 闲置 | 偶发 PEEK → SIT 后 YAWN → SLEEP |
| 时段（早 / 午 / 晚） | 问候气泡 |

## 状态机合法转移

```
IDLE  → {全部其它状态}
WALK  → {IDLE, SIT, PEEK}
RUN   → {IDLE, SIT, PEEK}
SIT   → {IDLE, EAT, SLEEP, LOVE, THINK, YAWN}
YAWN  → {IDLE, SIT, SLEEP, STRETCH}
STRETCH → {IDLE, YAWN}
WORK  → {IDLE, SLEEP}
LAND  → {IDLE, SIT}
ANGRY → {IDLE, SURPRISE}
EAT/THINK/CHEER/SURPRISE/SLEEP/LOVE/PEEK/WAVE/DRINK → {IDLE}
```

> 合法转移由 `state-catalog.mjs` 单一来源（SSOT）派生，`state-machine.js` 据此拦截非法切换。

## 主题色（CSS 变量）

| 变量 | 值 | 用途 |
|------|----|----|
| `--pet-accent` | #FF6B9D | 主色（LOVE、WORK） |
| `--pet-accent-2` | #FFB3C8 | 辅色 |
| `--pet-bubble-bg` | rgba(255,255,255,0.94) | 默认气泡 |
| `--pet-morning` | #FFE4A0 | 早 / 午气泡 |
| `--pet-night` | #4A4E7C | 晚 / 睡气泡 |
| `--pet-heart` | #FF6B9D | LOVE 爱心 |
| `--pet-key` | #6B8CFF | WORK 按键粒子 |

## 开发

```bash
npm install
npm run preprocess          # (可选) 预处理立绘，需 Python + 依赖
npm run manifest            # 由 state-catalog.mjs 生成 state-manifest.json
npm start                   # 启动（predev/prebuild 会自动生成 manifest）
npm run dev                 # 带 --enable-logging 启动
npm test                    # node --test 运行单测
npm run release:preflight  # 检查签名、tag 与发布源配置，不构建
```

## 打包

```bash
npm run build:win           # 输出 dist/ 下的 NSIS 安装包 + 便携版
npm run release:win         # 强制签名并生成更新元数据、blockmap 与校验清单
```

`build:win` 用于本地测试，可生成无签名包；正式分发必须使用 `release:win` 或 `.github/workflows/release.yml`。缺少有效签名凭据时，正式构建会直接失败，不会静默生成“未知发布者”版本。

## 故障排除

- **宠物启动后无反应 / 白窗**：打开开发者工具看 renderer 报错；确认立绘已预处理到 `assets/processed/`
- **新状态不显示**：确认目录中的 `hasSprite` 为 `true`、`assets/processed/<状态>.png` 已生成，并重跑 `npm run manifest`
- **气泡位置错位**：立绘尺寸变更需同步更新 `SPRITE_W` / `SPRITE_H`（`bootstrap.js`）
- **键盘快捷键无效**：先点击宠物获得焦点
- **提醒 / 心情异常**：数据存于 `userData` 的各 JSON 文件；可先在房间设置中导出备份。损坏文件会隔离为 `.corrupt-<timestamp>.bak` 并回退默认值，上一版有效数据位于 `.bak`
- **AI 配置未完成**：远程 HTTPS 服务必须提供密钥；若提示系统安全存储不可用，应用会拒绝明文降级，请改用本地对话或修复 Windows 凭据环境
- **AI 连接测试失败**：确认地址和模型 ID 正确、服务实现了 `/v1/models` 与 `/v1/chat/completions`，并检查密钥权限；应用不会在错误消息或日志中回显服务响应和密钥
- **更新功能显示不可用**：开发版与便携版属于正常行为；安装版若提示“未配置发布源”，请重新安装由 `release:win` 生成并正式发布的签名包
- **正式构建拒绝执行**：按 `docs/RELEASE.md` 配置签名模式、证书 Secret、版本 tag 和公开 GitHub 仓库或 HTTPS 更新地址
- **打包后启动失败**：`launch.js` 会强制清理 `ELECTRON_RUN_AS_NODE`

## 许可

MIT

## 1.2.7 Daily Landing

The home page now has a quiet, non-scoring daily landing. It shows completed,
in-progress, and later task counts, then offers unfinished Today tasks three
gentle places: keep today, move to tomorrow, or return to the inbox. A focus
next step stays with its task and is naturally offered again the next day.

## 1.2.8 Soft Schedule Awareness

Morning, afternoon, and evening remain soft windows rather than appointments.
The home page can quietly offer one suitable Today task during the active
window. Near a window's end, an unfinished task can be left for the next
window, while a completed focus can carry its next step forward with one click.
Nothing starts automatically or sends a new notification.

## 1.2.9 Micro Steps

Any task can optionally hold one to three tiny actions. The room surfaces only
the current unfinished action, never a percentage or a required checklist. A
focus landing can put away that one action and reveal the next, while the task
itself remains under the user's control. All micro steps stay local and travel
with the task when it moves to another soft window or tomorrow.

## 1.3.0 Task Closeout

When a small set of micro steps is fully put away, the task remains open and
the home page offers a quiet checkpoint instead of a completion score or popup.
You can explicitly finish the task, begin a fresh one-step set, or simply leave
it for today, the next soft window, or tomorrow.

## 1.3.1 Micro Notes

At a micro-step checkpoint, an optional one-line note can quietly capture what
the finished set moved forward. Notes remain local and bounded to the latest
three per task. Active task cards surface only the newest note, while the
completion review preserves the short trace alongside its existing undo paths.

## 1.3.2 Focus-to-Step Continuity

An active focus companion now explicitly names the one unfinished micro step it
is accompanying. When that focus segment ends, you can put the same step away
and optionally leave one local note in the same small action. Even when it is
the last step, the parent task remains open and enters the existing quiet
checkpoint rather than being auto-completed.

## 1.3.3 Quiet Closeout Review

Before choosing where a finished micro-step set belongs, the quiet checkpoint
now shows its short local path: the one-to-three steps already walked and up to
three recent micro notes. It is a descriptive trace, not a score or completion
target; the task still moves only when you explicitly choose its next place.

## 1.3.4 Gentle Return Cue

While placing a finished micro-step set, you can optionally keep one “start
here next time” hint. The existing next-step fields store that local cue, which
then gets quiet priority in gentle start and soft-window suggestions; Today
shows it as a candidate without selecting or starting anything for you.

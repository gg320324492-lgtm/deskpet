# 状态目录说明（State Catalog）

> `src/renderer/state-catalog.mjs` 是整个桌宠的 **状态唯一真实来源**（SSOT）。所有运行时模块（状态机、动画师、交互层、托盘菜单、Python 预处理脚本）都从这里派生。

## 添加新状态

1. 在 `_CATALOG` 对象里加一个条目（建议按 §15 MVP 计划，命名小写）。例：

    ```js
    WAVE: {
        id: 'wave',
        sprite: 'wave.png',
        fallbackSprite: 'cheer.png',
        hasSprite: false,           // 还没给素材
        sources: null,             // 有图后再填
        category: 'temporary',
        cssClass: 'state-wave',
        menuGroup: '互动',
        label: '挥手',
        key: 'v',
        breath: false,
        particles: null,
        bubble: '嗨~',
        bubbleMood: null,
        defaultDuration: 1500,
        transitions: ['IDLE'],
    },
    ```

2. 把原始 PNG 放到 `assets/raw/`（旧版）或 `assets/raw_v2/`（新版），文件名匹配 `sources.v1` / `sources.v2`。
3. 把 `hasSprite` 改为 `true`。
4. 运行 `npm run preprocess`：脚本会读 `assets/state-manifest.json`（由 `state-catalog.mjs` 自动生成），生成 `assets/processed/<state>.png`。
5. 启动应用。

## 删除状态

直接从 `_CATALOG` 删条目。`STATES`、`ALL_STATES`、`ALLOWED`、`MENU_GROUPS`、`BUBBLE_MESSAGES` 等所有派生导出和托盘菜单、Python 脚本都会自动跟着更新。

## 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 小写字符串，运行时状态 ID（如 `'idle'`）。同时是 `assets/processed/<id>.png` 文件名的去后缀部分。 |
| `sprite` | 是 | 选定 fit 后的 PNG 文件名。 |
| `fallbackSprite` | 是 | `hasSprite: false` 时使用的回退 PNG。 |
| `hasSprite` | 是 | 当前是否有可用素材；false 时仍注册但渲染回退精灵 + "新"角标。 |
| `sources` | 否 | `{v2, v1}` — Python 预处理脚本读这个生成 processed 文件。 |
| `category` | 是 | `persistent`（待机类，无自动回退）/ `temporary`（临时类，到时回到 IDLE）/ `action`（动作类，由事件驱动退出）/ `sustained`（持续类，5s 无操作回 IDLE）。 |
| `cssClass` | 是 | 状态名对应的 CSS 类名（`.state-<id>`）。 |
| `menuGroup` | 否 | 右键菜单分组；null 表示不出现在右键菜单（如 LAND 是被触发而非主动选的）。 |
| `label` | 否 | 中文显示名。 |
| `key` | 否 | 键盘快捷键（无前缀键）；与 keymap 联动。 |
| `breath` | 否 | 是否启用呼吸动画。 |
| `particles` | 否 | 粒子效果类型：`sleep_z`、`love_hearts`、`work_keys`、null。 |
| `bubble` | 否 | 进入状态时显示的气泡文字。空字符串表示不显示。 |
| `bubbleMood` | 否 | `.mood-morning` / `.mood-night` / `.mood-love`，CSS 颜色主题。 |
| `defaultDuration` | 类目为 `temporary` 时必填 | 临时状态自动回 IDLE 的毫秒数。 |
| `transitions` | 是 | 允许转移到哪些状态（用大写 key）。所有状态机的合法转移表从这里派生。 |

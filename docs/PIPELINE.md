# 资产管理流水线

## 整体流程

```
┌─────────────────┐
│ ChatGPT / your  │
│ AI / Photoshop  │  ← 艺术家产出 PNG（任何大小、含/不含背景）
└────────┬────────┘
         │
         ▼
assets/raw/  或  assets/raw_v2/      ← 原始输入
         │
         ▼ (scripts/preprocess_assets.py + Pillow + rembg)
┌─────────────────┐
│ rembg 去背景    │
│ 去白边          │
│ alpha 阈值化   │
│ bbox 裁剪      │
│ 8px 透明 padding│
│ 高度等比缩放 220│
└────────┬────────┘
         │
         ▼
assets/processed/<state>.png        ← 运行时实际加载的精灵
         │
         ▼ (运行时)
桌宠窗口的 <img class="pet-sprite">
```

## 命令

| 步骤 | 命令 | 何时运行 |
|---|---|---|
| 1. 列出当前所有状态 | `npm run manifest` | state-catalog.mjs 改动后 |
| 2. 生成 PNG | `npm run preprocess` | 添加了新源 / 改动了任何 PNG |
| 3. 开发启动 | `npm run dev` | 自动先跑 manifest 生成 |
| 4. 打包 | `npm run build` | 自动先跑 manifest 生成 |

## Python 预处理脚本 (`scripts/preprocess_assets.py`)

读 `assets/state-manifest.json`，该 JSON 是 `scripts/gen_state_manifest.mjs` 在每次 `predev` / `prebuild` 时从 `state-catalog.mjs` 生成的。

如果 `assets/state-manifest.json` 缺失（早期环境或 `--force-legacy` 标志），脚本退回到内置 `LEGACY_STATE_SOURCES`，仅处理 12 个现有状态。

行为：
- 每个状态按 sources.v2 → sources.v1 顺序找源文件
- 用 rembg 的 isnet-general-use 模型去背景，回退到 u2net → u2netp
- `remove_white_halo()` 抑制 rembg 残留的浅白色边缘
- `threshold_alpha(64)` 把半透明边缘置为 0/255
- `crop_transparent()` bbox 裁剪
- `pad_transparent(8)` 加 8px 透明 padding
- `resize_to_height(220)` 高度缩放到 220

## 调试小贴士

- 不想要 rembg？用 `python scripts/preprocess_assets.py --no-rembg`，会用 `remove_white_pixels()` 白点兜底。
- 仅 12 个旧状态？用 `--force-legacy` 跳过 manifest。
- 单文件用 PNG 工具（如 Aseprite / GIMP）打开后用 `ImageMagick` 转：
  ```bash
  magick input.png -background none -alpha on PNG32:out.png
  ```

## 添加新状态的完整流程

1. 在 `state-catalog.mjs` 加条目，`hasSprite: false`。
2. 在 `assets/raw/` 或 `assets/raw_v2/` 放 PNG，文件名匹配 `sources` 字段。
3. （可选）在 `state-catalog.mjs` 把 `hasSprite` 改为 `true`。
4. 跑 `npm run preprocess` 生成 `assets/processed/<state>.png`。
5. 启动应用，新状态自动出现在右键菜单 + 托盘菜单 + 键盘映射。

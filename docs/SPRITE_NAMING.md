# 精灵命名规范

> 让新动作 PNG 与代码自动接驳。本规范既适用于默认服装，也适用于 `assets/outfits/` 下的其它服装。

## 文件命名

**文件名 = 状态 ID**（小写，与 `state-catalog.mjs` 里每条目的 `id` 字段一致），后缀 `.png`。

```
assets/processed/
  idle.png
  walk.png
  sit.png
  ...共 18 个完整状态
```

服装目录下同样命名（结构镜像 processed）：

```
assets/outfits/<outfit-name>/
  idle.png
  walk.png
  ...18 张各对应一个状态
```

## 输入源命名（preprocess 阶段）

Python 预处理读 `assets/state-manifest.json` 里的 `sources` 字段，按 v2 → v1 顺序查找：

```
assets/raw/
  02_walk.png
  03_sit.png
  04_eat.png
  06_think.png
  07_cheer.png
  08_surprise.png
  09_sleep.png
assets/raw_v2/
  02_yawn.png
  03_run_strong.png
  04_spin_dress.png
  05_heart.png
  06_sit_pillow.png
  07_laptop.png
  08_tilt_wink.png
```

源文件名不强制匹配状态 ID；它们在 `state-catalog.mjs` 的 `sources` 字段里显式映射。

## 像素规范

| 项 | 值 |
|---|---|
| 输出高度 | 220 px（`TARGET_HEIGHT` in `scripts/preprocess_assets.py`） |
| 输出宽度 | 按源 aspect 等比缩放 |
| 透明背景 | 是 — `rembg` 处理 |
| 边缘 | 8 px 透明 padding |
| Alpha | 阈值 64 → 二值 0/255（无半透明） |
| 锚点 | 脚底居中（在 DOM 里通过 `transform-origin: bottom center` 体现） |

## 缺图怎么办？

把 `hasSprite: false` 写在目录里。运行时：
- `sprite-loader.js` 加载 `fallbackSprite` 而不是 `sprite`
- DOM 上挂一个 `.sprite-missing` 的虚线提示
- 出现角标 "新"

新图就位后，把 `hasSprite` 改成 `true`，重启应用即可。

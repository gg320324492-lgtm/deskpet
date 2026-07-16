"""
preprocess_assets.py
====================
Two-source sprite preprocessor with quality post-processing.

Inputs:
  - assets/raw/                          (folder 1 legacy 9 PNGs)
  - assets/raw_v2/                       (folder 2 new 8 PNGs)
  - assets/state-manifest.json           (generated from src/renderer/state-catalog.js
                                          by scripts/gen_state_manifest.mjs)

Output:
  - assets/processed/{state}.png         (transparent 220-px-tall PNGs)

State -> source mapping is read from the manifest (v2 first, falls back to v1).
States missing from the manifest are loaded from the legacy hardcoded table for
backwards compatibility (so users with old setups still get the v1.x behaviour).

Post-processing per sprite:
  - rembg background removal (u2net)
  - Alpha-bbox crop (remove empty borders)
  - 8px transparent padding (avoid edge clipping during hit-test)
  - Threshold alpha to 0/255 (no semi-transparent halo)
  - Resize to TARGET_HEIGHT (220px) keeping aspect ratio

Usage:
  python scripts/preprocess_assets.py
  python scripts/preprocess_assets.py --no-rembg   # disable AI; white pixel fallback
  python scripts/preprocess_assets.py --force-legacy  # ignore manifest, use built-in map
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image

# Lazy-import rembg so --no-rembg can skip the heavy dep.
# Use isnet-general-use for better edge quality (vs default u2net).
def _rembg_remove(img: Image.Image) -> Image.Image:
    from rembg import remove, new_session
    # Try isnet-general-use (best edges), fall back to u2net if not available
    for model in ("isnet-general-use", "u2net", "u2netp"):
        try:
            session = new_session(model)
            return remove(img, session=session)
        except Exception:
            continue
    return remove(img)


# ============ Paths ============
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "assets" / "raw"
RAW_V2_DIR = ROOT / "assets" / "raw_v2"
OUTPUT_DIR = ROOT / "assets" / "processed"
RAW_OUTFITS_DIR = ROOT / "assets" / "raw_outfits"
OUTFITS_DIR = ROOT / "assets" / "outfits"
MANIFEST_PATH = ROOT / "assets" / "state-manifest.json"

# Sprite output size (px). Width auto-derived from aspect ratio.
TARGET_HEIGHT = 220

# Transparent padding (px) added on each side after bbox crop
TRANSPARENT_PAD = 8

# ============ State -> source mapping (v2 first, v1 fallback) ============
# Tuple: (v2_filename or None, v1_filename or None)
# None in v2 means "skip - no v2 source, must use v1"
#
# LEGACY TABLE — kept as a safety net for environments where the manifest is
# absent (e.g. CI with stale checkout).  Loaded only when the manifest does
# not list a state.
LEGACY_STATE_SOURCES = {
    "idle":     (None,                "02_walk.png"),   # keep calm standing pose
    "walk":     ("03_run_strong.png", "03_sit.png"),
    "sit":      ("06_sit_pillow.png", "04_eat.png"),
    "eat":      (None,                "04_eat.png"),
    "think":    (None,                "06_think.png"),
    "cheer":    ("04_spin_dress.png",  "07_cheer.png"),
    "surprise": (None,                "08_surprise.png"),
    "sleep":    (None,                "09_sleep.png"),
    "yawn":     ("02_yawn.png",       None),
    "love":     ("05_heart.png",      None),
    "work":     ("07_laptop.png",     None),
    "peek":     ("08_tilt_wink.png",  None),
}

def load_manifest_state_sources():
    """Read assets/state-manifest.json and return {state_id: (v2, v1)}.

    Only states whose catalog entry has sources.v1 or sources.v2 are listed.
    Missing-art states (hasSprite == False) are omitted from pre-processing
    because they have no source files yet.
    """
    if not MANIFEST_PATH.exists():
        return {}
    try:
        with MANIFEST_PATH.open("r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"[warn] state-manifest.json unreadable: {e}", file=sys.stderr)
        return {}
    out = {}
    for s in manifest.get("states", []):
        sources = s.get("sources")
        if not sources:
            continue
        v2 = sources.get("v2")
        v1 = sources.get("v1")
        if v2 is None and v1 is None:
            continue
        out[s["key"]] = (v2, v1)
    return out


# ============ Post-processing ============
def threshold_alpha(rgba: Image.Image) -> Image.Image:
    """Set alpha to 0 or 255 (no semi-transparent halo). Higher threshold = cleaner edges."""
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")
    alpha = rgba.split()[3]
    # Use threshold of 64 to aggressively remove faint edges (was 32)
    alpha = alpha.point(lambda v: 0 if v < 64 else 255)
    rgba.putalpha(alpha)
    return rgba


def crop_transparent(rgba: Image.Image) -> Image.Image:
    """Crop away fully-transparent borders using alpha bbox."""
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")
    bbox = rgba.getbbox()
    if bbox:
        return rgba.crop(bbox)
    return rgba


def pad_transparent(rgba: Image.Image, px: int = TRANSPARENT_PAD) -> Image.Image:
    """Add transparent padding on all four sides."""
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")
    w, h = rgba.size
    new = Image.new("RGBA", (w + px * 2, h + px * 2), (0, 0, 0, 0))
    new.paste(rgba, (px, px), rgba)
    return new


def remove_white_pixels(rgba: Image.Image) -> Image.Image:
    """Fallback: replace near-white pixels with transparent (RGB > 235)."""
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")
    data = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            # Threshold 235 (was 240) catches faint whites that look like halo
            if r > 235 and g > 235 and b > 235:
                data[x, y] = (r, g, b, 0)
    return rgba


def remove_white_halo(rgba: Image.Image) -> Image.Image:
    """
    Remove faint white halo around character that rembg sometimes leaves.
    For pixels that are mostly transparent AND near-white, force them transparent.
    """
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")
    data = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            # If pixel is mostly transparent (< 200 alpha) and white-ish, kill it
            if a < 200 and r > 220 and g > 220 and b > 220:
                data[x, y] = (r, g, b, 0)
    return rgba


def resize_to_height(rgba: Image.Image, target_h: int) -> Image.Image:
    """Resize proportionally so height = target_h."""
    if rgba.height == target_h:
        return rgba
    ratio = target_h / rgba.height
    new_w = max(1, int(rgba.width * ratio))
    return rgba.resize((new_w, target_h), Image.LANCZOS)


# ============ Main processing ============
def process_one(
    state: str,
    sources: tuple,
    use_rembg: bool = True,
    source_path: Path | None = None,
    output_dir: Path = OUTPUT_DIR,
) -> tuple[str, str, tuple[int, int], str]:
    """Process a single state. Returns (state, output_filename, size, source_tag)."""
    v2_name, v1_name = sources
    src_path = source_path
    source_tag = "outfit" if source_path else ""

    if src_path is None and v2_name:
        candidate = RAW_V2_DIR / v2_name
        if candidate.exists():
            src_path = candidate
            source_tag = "v2"

    if src_path is None and v1_name:
        candidate = RAW_DIR / v1_name
        if candidate.exists():
            src_path = candidate
            source_tag = "v1 (fallback)"

    if src_path is None:
        raise FileNotFoundError(
            f"State '{state}': no source found (v2={v2_name}, v1={v1_name})"
        )

    print(f"[{state:8s}] {source_tag:12s} {src_path.name}", end=" ", flush=True)
    img = Image.open(src_path).convert("RGBA")

    # Background removal
    alpha_min, _alpha_max = img.getchannel("A").getextrema()
    if alpha_min < 255:
        print("alpha source ...", end=" ", flush=True)
        cut = img
    elif use_rembg:
        print("rembg ...", end=" ", flush=True)
        try:
            cut = _rembg_remove(img)
        except Exception as e:
            print(f"rembg failed ({e}), using white-pixel fallback ...", end=" ", flush=True)
            cut = remove_white_pixels(img)
    else:
        print("white-pixel ...", end=" ", flush=True)
        cut = remove_white_pixels(img)

    # Post-processing
    cut = remove_white_halo(cut)        # remove faint white halo
    cut = threshold_alpha(cut)
    cut = crop_transparent(cut)
    cut = pad_transparent(cut, TRANSPARENT_PAD)
    cut = resize_to_height(cut, TARGET_HEIGHT)

    # Save
    out_path = output_dir / f"{state}.png"
    cut.save(out_path, "PNG", optimize=True)
    print(f"-> {out_path.name} {cut.size}")
    return state, out_path.name, cut.size, source_tag


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-rembg", action="store_true", help="Skip rembg (faster, lower quality)")
    parser.add_argument("--force-legacy", action="store_true",
                        help="Ignore state-manifest.json and use the built-in map")
    parser.add_argument("--state", action="append", default=[],
                        help="Process only this state ID (repeatable)")
    parser.add_argument("--outfit",
                        help="Process assets/raw_outfits/<name> into assets/outfits/<name>")
    args = parser.parse_args()

    outfit_name = (args.outfit or "").strip().lower()
    if outfit_name and not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,39}", outfit_name):
        parser.error("--outfit must use 1-40 lowercase letters, digits, dashes or underscores")

    output_dir = OUTFITS_DIR / outfit_name if outfit_name else OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    # Resolve state source mapping: manifest first; legacy only as safety net
    # when the manifest is unavailable, --force-legacy is set, or the manifest
    # returns nothing.
    state_sources = {} if args.force_legacy else load_manifest_state_sources()
    if not state_sources:
        print("[info] manifest empty or missing — using legacy built-in map", flush=True)
        state_sources = dict(LEGACY_STATE_SOURCES)
    # The JSON's `key` is already lowercased to match sprite filenames
    # (see scripts/gen_state_manifest.mjs).  Placeholder states without
    # `sources` are filtered out in load_manifest_state_sources().
    state_sources = {k: v for k, v in state_sources.items() if v[0] or v[1]}
    requested = {state.strip().lower() for state in args.state if state.strip()}
    known_states = set(state_sources)
    outfit_sources = {}
    if outfit_name:
        source_dir = RAW_OUTFITS_DIR / outfit_name
        if not source_dir.is_dir():
            parser.error(f"outfit source directory does not exist: {source_dir}")
        outfit_sources = {
            path.stem.lower(): path
            for path in source_dir.glob("*.png")
            if path.stem.lower() in known_states
        }
        if requested:
            missing = requested.difference(outfit_sources)
            if missing:
                parser.error(f"outfit source missing for state(s): {', '.join(sorted(missing))}")
        else:
            requested = set(outfit_sources)

    if requested:
        unknown = requested.difference(known_states)
        if unknown:
            parser.error(f"unknown or sourceless state(s): {', '.join(sorted(unknown))}")
        state_sources = {k: v for k, v in state_sources.items() if k in requested}

    print("=" * 72)
    print("Date Night Girl Asset Preprocessor")
    print("=" * 72)
    print(f"  v2 source : {RAW_V2_DIR}")
    print(f"  v1 source : {RAW_DIR}")
    if outfit_name:
        print(f"  outfit    : {outfit_name}")
        print(f"  source    : {RAW_OUTFITS_DIR / outfit_name}")
    print(f"  output    : {output_dir}")
    print(f"  manifest  : {MANIFEST_PATH}{'(ignored by --force-legacy)' if args.force_legacy else ''}")
    print(f"  size      : height={TARGET_HEIGHT}px, padded {TRANSPARENT_PAD}px")
    print(f"  rembg     : {'disabled (white-pixel fallback)' if args.no_rembg else 'enabled (u2net)'}")
    print(f"  states    : {len(state_sources)}")
    print()

    results = []
    for state in state_sources:
        try:
            r = process_one(
                state,
                sources=state_sources[state],
                use_rembg=not args.no_rembg,
                source_path=outfit_sources.get(state),
                output_dir=output_dir,
            )
            results.append(r)
        except Exception as e:
            print(f"\n[ERROR] {state}: {e}", file=sys.stderr)
            return 1

    print()
    print("=" * 72)
    print(f"[OK] Generated {len(results)} transparent PNGs:")
    print(f"{'state':10s} {'source':14s} {'size':10s} {'file':18s}")
    print("-" * 72)
    for state, fname, size, tag in results:
        print(f"  {state:8s} {tag:14s} {size[0]}x{size[1]:<6d} {fname}")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())

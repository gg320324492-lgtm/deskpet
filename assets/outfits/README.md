# Outfit assets

Outfits are alternate sprite sets. The default outfit maps to
`assets/processed/`. The bundled `sleepwear` pack includes all 18 states:
`idle`, `walk`, `sit`, `eat`, `think`, `cheer`, `surprise`, `sleep`, `yawn`,
`love`, `work`, `peek`, `wave`, `drink`, `run`, `land`, `angry`, and `stretch`.
Incomplete custom packs still fall back to their matching default sprites at runtime.

To add a new outfit, place transparent source PNGs under
`assets/raw_outfits/<outfit-name>/`, using state IDs as filenames:

```text
assets/raw_outfits/<outfit-name>/
  idle.png
  walk.png
  sit.png
  ...
```

Process the whole pack, or selected states:

```shell
python scripts/preprocess_assets.py --outfit <outfit-name>
python scripts/preprocess_assets.py --outfit <outfit-name> --state idle
```

Processed files are written to `assets/outfits/<outfit-name>/`. Add the pack's
metadata to `OUTFITS` in `src/renderer/wardrobe.js` to expose it in the UI.

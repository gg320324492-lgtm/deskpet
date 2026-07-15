# Outfit assets

Outfits are alternate sprite sets. The default outfit maps to `assets/processed/`.

To add a new outfit, create a folder here with the same sprite filenames
as in the default outfit and toggle via wardrobe.js:

    assets/outfits/<outfit-name>/
        idle.png
        walk.png
        ...etc

Each PNG must be 220px tall, transparent background, processed the same
way as defaults. The simplest way: run preprocess on a separate
`raw/outfits/<name>/` source set, then point wardrobe.js at the output.

Until art lands, wardrobe.js keeps the default "default" outfit active.

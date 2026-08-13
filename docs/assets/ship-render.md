# Player Ship Render Recipe

The v4 runtime player frames are realistic AI-generated renders composited by the world-atlas pipeline. Both frames share the same ship body, canvas, and anchor layout; the thrust frame adds a brightened engine plume and glow only.

The active gameplay runtime loads color-only derivatives from `assets/ship/semantic/`. Those files preserve these source renders' dimensions and alpha plane and are reproduced by `node tools/recolor-semantic-assets.js`; see `docs/assets/semantic-spectrum.md`.

## v4 pipeline

The master ship render lives in `assets-src/masters/` (prompt archived in `assets-src/PROMPTS.md`). The frames are derived during the world-atlas build:

```sh
python3 tools/build-world-atlases.py
```

The builder cleans the master (watermark erase, alpha threshold, trim), composites it onto a 512 × 384 transparent canvas with the hull occupying the upper 75 percent (the runtime anchors the sprite at `y = -0.75 × height`), dims the exhaust for `player-neutral.png`, and brightens the plume with an additive glow for `player-thrust.png`.

Outputs are transparent RGBA PNGs at 512 × 384. The app icon remains the 1024 × 1024 navy/cyan/gold command emblem, without text.

## Reproducible output hashes

- `tools/render-ship.swift`: `38e28dda6b373c1513e44cb377b085f7b5224e840bbac4fbece7c9f8dbbbdd1a` (legacy v3 renderer, kept for reference)
- `assets/ship/player-neutral.png`: `6759153f2228079f519536bcf457b0ac12ac6ea838bb65e2b36d74ba92f529b8`
- `assets/ship/player-thrust.png`: `3b914404ce0e9a78b6aa4e4116f0edbb404fa1ffe8f7579e46925d77986e3aa7`
- `app/AppIcon.png`: `47287912f71ec01b3d22669fb70c1bfc405142856ac9dfa2eb1a62c79c3c96aa`

## Legacy v3 SceneKit recipe (superseded)

The v3 frames were deterministic SceneKit renders derived from Quaternius' CC0 Striker model. The v3 reproduction command was:

```sh
swift tools/render-ship.swift \
  --model /path/to/Striker.obj \
  --texture /path/to/Striker_Blue.png \
  --neutral assets/ship/player-neutral.png \
  --thrust assets/ship/player-thrust.png \
  --icon app/AppIcon.png
```

v3 source inputs, downloaded on 2026-08-02 from the official Ultimate Spaceships page and its Google Drive folder:

- `Striker/OBJ/Striker.obj`: `0f3ba504f07d57a5a3dae64357ee82ba60361e121f46eb6beb1635cea74baf1f`
- `Striker/OBJ/Striker.mtl`: `813dd98ed7cca2ea167804352df0ba13324c4b3990bf0a20f0f6154f1d02b41c`
- `Striker/Textures/Striker_Blue.png`: `38b2477b43a1253a15a3bdf4eec3473d334f9c281049b6cb7daeea265a955435`

### Fixed v3 SceneKit settings

- Model: center the imported bounding box at the origin; retain source topology and convert to Y-up.
- Camera: orthographic, position `(0, 4.7, -12.8)`, target `(0, -0.18, 0.15)`, scale `2.35`, near/far `0.1/100`.
- Exposure: `+0.05`; HDR enabled; bloom intensity `0.16`, threshold `1.05`, radius `4`.
- Surface: source blue texture multiplied by calibrated RGB `(0.52, 0.65, 0.86)`; physically based lighting; metalness `0.42`; roughness `0.30`.
- Ambient fill: RGB `(0.10, 0.15, 0.24)`, intensity `420`.
- Upper-left cool key: RGB `(0.67, 0.83, 1.00)`, intensity `1750`, Euler rotation `(-0.85, -0.72, -0.20)`, soft shadow radius `5`.
- Cyan rim: RGB `(0.02, 0.89, 1.00)`, intensity `1200`, Euler rotation `(0.45, 2.25, 0)`.
- Gold accents: two narrow physically based panels at local `x ±0.72, y 0.12, z -0.45`; calibrated RGB `(0.80, 0.57, 0.18)`.
- Thrust only outer plume: paired `SCNCone` nodes with top radius `0.025`, bottom radius `0.11`, height `0.72`, local position `(x ±0.88, y -0.58, z -2.62)`, and X rotation `π/2`. The constant/additive material uses diffuse calibrated RGBA `(0.05, 0.58, 0.88, 0.24)`, emission RGB `(0.04, 0.62, 0.88)`, material transparency `0.36`, double-sided rendering, and no depth-buffer writes.
- Thrust only inner core: paired `SCNCone` nodes with top radius `0.008`, bottom radius `0.035`, height `0.40`, local position `(x ±0.88, y -0.58, z -2.47)`, and X rotation `π/2`. The constant/additive material uses diffuse calibrated RGBA `(0.30, 0.86, 1.00, 0.52)`, emission RGB `(0.16, 0.78, 1.00)`, material transparency `0.52`, double-sided rendering, and no depth-buffer writes.
- Renderer: time `0`, 4× multisample antialiasing, no jitter, transparent background.

The v3 camera deliberately looked from the rear and slightly above. At the game size it preserved the Striker's swept silhouette, dark navy mass, cool leading rim, and small gold accents without presenting the toy-like frontal view rejected during visual review.

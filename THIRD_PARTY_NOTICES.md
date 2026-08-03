# Third-Party Notices

Downloaded on **2026-08-02**. Only the files listed below are shipped. Source packs and model files used during rendering are not committed.

The repository's project license applies only to original project code and artwork. The third-party works below remain available under their respective licenses. Local semantic renaming, recoloring, raster rendering, compositing, and UI integration do not change those upstream licenses. "Upstream and committed" identifies byte-identical runtime copies; "upstream" alone identifies uncommitted render inputs. Derived output hashes are recorded separately in `docs/assets/ship-render.md`.

## Quaternius — Ultimate Spaceships

- Official source: https://quaternius.com/packs/ultimatespaceships.html
- Official download folder: https://drive.google.com/drive/folders/1NpfT3wqe2k3Jwue2xryi7tzxP4bWzETu
- License: CC0 1.0 Universal
- License copy: `licenses/Quaternius-Ultimate-Spaceships-CC0.txt` — upstream and committed SHA-256 `83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c`
- Selected upstream files:
  - `Striker/OBJ/Striker.obj` — upstream SHA-256 `0f3ba504f07d57a5a3dae64357ee82ba60361e121f46eb6beb1635cea74baf1f`
  - `Striker/OBJ/Striker.mtl` — upstream SHA-256 `813dd98ed7cca2ea167804352df0ba13324c4b3990bf0a20f0f6154f1d02b41c`
  - `Striker/Textures/Striker_Blue.png` — upstream SHA-256 `38b2477b43a1253a15a3bdf4eec3473d334f9c281049b6cb7daeea265a955435`
- Repository outputs: `assets/ship/player-neutral.png`, `assets/ship/player-thrust.png`, and the ship layer in `app/AppIcon.png`.
- Modifications: the Striker model was rendered from a fixed rear-high camera with a deep-navy texture multiply, cool key light, cyan rim light, restrained gold geometry, and optional cyan exhaust. See `docs/assets/ship-render.md`.

## Kenney — UI Pack: Sci-Fi 2.0

- Official source: https://kenney.nl/assets/ui-pack-sci-fi
- Official archive: https://kenney.nl/media/pages/assets/ui-pack-sci-fi/b67c2acd31-1724181109/kenney_ui-pack-space-expansion.zip
- License: Creative Commons Zero, CC0
- License copy: `licenses/Kenney-UI-Pack-Sci-Fi-CC0.txt` — upstream and committed SHA-256 `80e091ef18f6b88becb3b7c2306c159d16217ca620bfa21b7177582c72924221`
- Selected upstream files and repository paths:
  - `PNG/Extra/Double/panel_glass_notches.png` — upstream and committed SHA-256 `3e8dd90c8e44f1c1729ce8d304656c64c8b467985584f9a9394f5631a204f51a` → `assets/ui/panel-frame-cyan.png`
  - `PNG/Blue/Double/bar_round_gloss_large.png` — upstream and committed SHA-256 `af13ccda23a736cdf18049cbe05586178e7cde8fddb5617bcf19cd5b10fcc3b9` → `assets/ui/meter-frame-cyan.png`
- Modifications: selected PNGs were renamed semantically; their pixels and alpha dimensions are unchanged.

## Phosphor Icons Core

- Official source: https://github.com/phosphor-icons/core
- Source revision: `2b75f3ad12b420c9504ef05df8d2564a28f8500e`
- License: MIT
- License copy: `licenses/Phosphor-Icons-MIT.txt` — upstream and committed SHA-256 `b5b1f1da112d18ea2147decfd48ddc1bf2b5aeb6c265381579340e95b15a2bb2`
- Selected upstream files from `assets/regular/`:
  - `translate.svg` — upstream and committed SHA-256 `1e49dc31f3a172c9c7c67361511ee5314598b3f5b32788219325f589487f76c5` → `assets/icons/translate.svg`
  - `speaker-high.svg` — upstream and committed SHA-256 `caca5fc1ee8489ac19232301d2c96f6d4048802491d75d761bbb89d5c98e459d` → `assets/icons/speaker-high.svg`
  - `speaker-slash.svg` — upstream and committed SHA-256 `66b75267ea8ba8759a70e4c8312bfe06b834fc8fcf0dd1710d9819877f0c8013` → `assets/icons/speaker-slash.svg`
  - `trophy.svg` — upstream and committed SHA-256 `45b065edc939de7246e5b5c114dd26b9bd6fb25f88013d6ab09e6cbbf76da9fa` → `assets/icons/trophy.svg`
  - `pencil-simple.svg` — upstream and committed SHA-256 `999530da442f44d8cf0054364373d16150f3e082c2ac294a4988a9c3a4295c28` → `assets/icons/pencil-simple.svg`
  - `arrow-counter-clockwise.svg` — upstream and committed SHA-256 `4eb160d5ae781107c674481ac081962e6bce6281a646129e6c3f960b9dd5dac6` → `assets/icons/arrow-counter-clockwise.svg`
- Modifications: none; the regular SVGs are copied byte-for-byte and loaded locally.

## Orbitron

- Official source: https://github.com/googlefonts/orbitron-vf
- Source revision: `f16482824e0ce4d008dee59b9b632e9ce9663359` (archived upstream repository)
- License: SIL Open Font License 1.1 (OFL-1.1)
- License copy: `licenses/Orbitron-OFL-1.1.txt` — upstream and committed SHA-256 `ab609b0e110d622435ff337cdf233288556e011bbf9bd0550be98846c0630819`
- Selected upstream file: `fonts/ttf/Orbitron-Medium.ttf` — upstream and committed SHA-256 `bc96ab93d786e3417b92285b96cdfe40a3de263930ee99eebfd4e19a756df8d2` → `assets/fonts/Orbitron-Medium.ttf`
- Modifications: none. The font is used only for Latin and numeric display text; Chinese text stays on the system sans-serif stack.

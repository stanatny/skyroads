# Third-Party Notices

Downloaded on **2026-08-02** and **2026-08-03**. Only the files listed below are shipped. Source packs and model files used during rendering are not committed.

The repository's project license applies only to original project code and artwork. The third-party works below remain available under their respective licenses. Local semantic renaming, recoloring, raster rendering, compositing, and UI integration do not change those upstream licenses. "Upstream and committed" identifies byte-identical runtime copies; "upstream" alone identifies uncommitted render inputs. Derived output hashes are recorded separately in `docs/assets/ship-render.md` and `docs/assets/world-art.md`.

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
- Modifications: fixed rear-high rendering, deep-navy texture multiply, cool key light, cyan rim light, restrained gold geometry, and optional cyan exhaust. See `docs/assets/ship-render.md`.

## Kenney — Space Kit

- Official source: https://kenney.nl/assets/space-kit
- Archive: `kenney_space-kit.zip` — upstream SHA-256 `d5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9`
- License: Creative Commons CC0 1.0 Universal
- License copy: `licenses/Kenney-Space-Kit-CC0.txt` — upstream and committed SHA-256 `bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7`
- Selected upstream files:
  - `space-kit/Models/OBJ format/barrels_rail.mtl` — upstream SHA-256 `a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927`
  - `space-kit/Models/OBJ format/barrels_rail.obj` — upstream SHA-256 `51f6f46f6878242f0e5a11d0295a006099ebbec43777ef7def4efddd1f490181`
  - `space-kit/Models/OBJ format/craft_speederA.mtl` — upstream SHA-256 `91d172e7a3359183581919a7b5d2e6327f63388942e23dbd1a26ef714415c0e3`
  - `space-kit/Models/OBJ format/craft_speederA.obj` — upstream SHA-256 `534e1b1198be654d2925d6a785531974213ac8b43ae05c02aecfeb905c0166fc`
  - `space-kit/Models/OBJ format/craft_speederD.mtl` — upstream SHA-256 `ec579d3e3095fc6cb1e7aaf54be2392459383382334ede6b3f27b4cb4f3b127a`
  - `space-kit/Models/OBJ format/craft_speederD.obj` — upstream SHA-256 `090e01b12b0d1a0619929d507d8008893e0e13a69235564f677888202c8caea2`
  - `space-kit/Models/OBJ format/rocket_baseA.mtl` — upstream SHA-256 `a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927`
  - `space-kit/Models/OBJ format/rocket_baseA.obj` — upstream SHA-256 `3a6c4115e5994079abe83a7b97f14f2bcce0e97b76bd229dcb60fd0112060ccd`
  - `space-kit/Models/OBJ format/rocket_fuelA.mtl` — upstream SHA-256 `583541d566dd5edba66cc8e2353e379bdc3de155cd21e173fab33fe9a9248a52`
  - `space-kit/Models/OBJ format/rocket_fuelA.obj` — upstream SHA-256 `53f83c675728d51a12014724d413a7a264ae893512189313553581e1135bfa87`
  - `space-kit/Models/OBJ format/rocket_sidesA.mtl` — upstream SHA-256 `f1131066d3cdc671b79f7799d5ddf194b25b0027381aea415d8c91d24e0190ba`
  - `space-kit/Models/OBJ format/rocket_sidesA.obj` — upstream SHA-256 `3a69d1927e1ac09203c3b514a9714876cfeb4fb8688d003fff09a1e3b8237a8a`
  - `space-kit/Models/OBJ format/rocket_topA.mtl` — upstream SHA-256 `7e4036c7a7ec9d8081082f4778338a8bff9a01bebb40c51cae08c8a96bc61785`
  - `space-kit/Models/OBJ format/rocket_topA.obj` — upstream SHA-256 `d910a3dd8cccebb8f1eb259af29d436da6839e81ae362fc5e9fd8f4038146bb4`
  - `space-kit/Models/OBJ format/terrain_sideCliff.mtl` — upstream SHA-256 `3f5b98315cc38f85580e92d4ac82f2693534ac142098fd1dbe76cc07b962c02d`
  - `space-kit/Models/OBJ format/terrain_sideCliff.obj` — upstream SHA-256 `a321d44e8603bd3cdf59866464612d13d4720634bf46e0badb80ced32ba7379b`
  - `space-kit/Models/OBJ format/turret_double.mtl` — upstream SHA-256 `762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b`
  - `space-kit/Models/OBJ format/turret_double.obj` — upstream SHA-256 `f511dfa73a94274e1a13ab7d136f1087a99149853fa6659132ece1bbc28311e6`
  - `space-kit/Models/OBJ format/turret_single.mtl` — upstream SHA-256 `762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b`
  - `space-kit/Models/OBJ format/turret_single.obj` — upstream SHA-256 `2b3492cde9c9496d73963669d8d59e9f5ebccb9dcbf15dbf5336e7ca630c6a89`
- Repository outputs:
  - `assets/world/drone-scout.png` — SHA-256 `9ab7c75a5eb1afe52950b064e8d453798be0df8c9bc600fdc9952e3d1106ed5d`
  - `assets/world/drone-striker.png` — SHA-256 `8065eadf564c7b17aa301bc3738afd7591ba8c8cae695de98c96532b86c99736`
  - `assets/world/turret-sentry.png` — SHA-256 `78ae048ac6fa37c8c46efa584de197caa09daa9d2fb99ea26d6a34e61225dc2a`
  - `assets/world/turret-heavy.png` — SHA-256 `ebd1950a29d6424db4fc19f3f9643c3ff133b1d630460e8848f08862028194b7`
  - `assets/world/barrier-rail.png` — SHA-256 `f0a8f85fdb02e5c07400e7ff06567cfd9d066051f5406ca37c591daf8285d914`
  - `assets/world/structure-reactor.png` — SHA-256 `317a3b6dcb3fe72d4a065f4fd52d541494150681c9a068c4c6aff36b7d6db690`
  - `assets/world/gap-edge.png` — SHA-256 `c3a0962aee773cfa9ac129dba9b49764d297491307836472b1743fead4ebba49`

## Kenney — Modular Space Kit

- Official source: https://kenney.nl/assets/modular-space-kit
- Archive: `kenney_modular-space-kit_1.0.zip` — upstream SHA-256 `f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc`
- License: Creative Commons CC0 1.0 Universal
- License copy: `licenses/Kenney-Modular-Space-Kit-CC0.txt` — upstream and committed SHA-256 `38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb`
- Selected upstream files:
  - `modular-space-kit/Models/OBJ format/Textures/colormap.png` — upstream SHA-256 `5aa7d186416e85310d99308c8e5510ededda181f3354ba9f4887cd56273f2b1e`
  - `modular-space-kit/Models/OBJ format/gate-lasers.mtl` — upstream SHA-256 `45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060`
  - `modular-space-kit/Models/OBJ format/gate-lasers.obj` — upstream SHA-256 `1611d2d1d1d8429b8fffadb337dd570600bde4bc9e9ef6bb933d51fb338a520a`
  - `modular-space-kit/Models/OBJ format/room-large.mtl` — upstream SHA-256 `45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060`
  - `modular-space-kit/Models/OBJ format/room-large.obj` — upstream SHA-256 `3ef1dc4b366e76b2bdd1ad44e5ad7a3e78c55e7d0fb067625dbaa6c38390b31e`
- Repository outputs:
  - `assets/world/barrier-crate.png` — SHA-256 `33b44384aae4c7cb6ea7d3f468fddf41f7918bf04b26ced88ef7e5561faf386d`
  - `assets/world/structure-tower.png` — SHA-256 `360a2fbae947d891c4b2ee9b50d141ad12186dfd894630036e9f4d953a360b3d`

The two Kenney kits were normalized, assembled only as declared in `tools/world-assets.json`, styled with the Orbital Defense warm-white/graphite/cool-steel/cyan palette plus small generated orange status lights, and rendered to seven-view transparent atlases. Renderer SHA-256: `6b01b02b36c4285a1eb1934e64ea2985c358a49aa5648b9eb791411b2c880948`. See `docs/assets/world-art.md`.

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

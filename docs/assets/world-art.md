# Orbital Defense world atlas provenance

The nine runtime atlases are deterministic offline renders of CC0 Kenney models downloaded on **2026-08-03**. Source archives, extracted OBJ/MTL files, and textures are render inputs only and are not committed. Each atlas contains seven transparent `512 × 512` frames in yaw order `[-30, -20, -10, 0, 10, 20, 30]`, producing a `3584 × 512` PNG.

## Official sources and licenses

| Source | Official page | Archive | Archive SHA-256 | License copy | License SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Kenney Space Kit | https://kenney.nl/assets/space-kit | `kenney_space-kit.zip` | `d5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9` | `licenses/Kenney-Space-Kit-CC0.txt` | `bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7` |
| Kenney Modular Space Kit | https://kenney.nl/assets/modular-space-kit | `kenney_modular-space-kit_1.0.zip` | `f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc` | `licenses/Kenney-Modular-Space-Kit-CC0.txt` | `38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb` |

Both license files are exact byte-for-byte copies of the upstream **Creative Commons CC0 1.0 Universal** text. The archive links were obtained from each official Kenney page; no source-edition or third-party mirror was used.

## Audited render inputs

`tools/world-assets.json` maps every recipe to these exact source-relative paths and hashes. The renderer rejects absolute paths, network URLs, traversal, source-edition paths, unused inputs, and hash mismatches before SceneKit imports a model.

| Upstream relative path | SHA-256 |
| --- | --- |
| `modular-space-kit/Models/OBJ format/Textures/colormap.png` | `5aa7d186416e85310d99308c8e5510ededda181f3354ba9f4887cd56273f2b1e` |
| `modular-space-kit/Models/OBJ format/gate-lasers.mtl` | `45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060` |
| `modular-space-kit/Models/OBJ format/gate-lasers.obj` | `1611d2d1d1d8429b8fffadb337dd570600bde4bc9e9ef6bb933d51fb338a520a` |
| `modular-space-kit/Models/OBJ format/room-large.mtl` | `45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060` |
| `modular-space-kit/Models/OBJ format/room-large.obj` | `3ef1dc4b366e76b2bdd1ad44e5ad7a3e78c55e7d0fb067625dbaa6c38390b31e` |
| `space-kit/Models/OBJ format/barrels_rail.mtl` | `a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927` |
| `space-kit/Models/OBJ format/barrels_rail.obj` | `51f6f46f6878242f0e5a11d0295a006099ebbec43777ef7def4efddd1f490181` |
| `space-kit/Models/OBJ format/craft_speederA.mtl` | `91d172e7a3359183581919a7b5d2e6327f63388942e23dbd1a26ef714415c0e3` |
| `space-kit/Models/OBJ format/craft_speederA.obj` | `534e1b1198be654d2925d6a785531974213ac8b43ae05c02aecfeb905c0166fc` |
| `space-kit/Models/OBJ format/craft_speederD.mtl` | `ec579d3e3095fc6cb1e7aaf54be2392459383382334ede6b3f27b4cb4f3b127a` |
| `space-kit/Models/OBJ format/craft_speederD.obj` | `090e01b12b0d1a0619929d507d8008893e0e13a69235564f677888202c8caea2` |
| `space-kit/Models/OBJ format/rocket_baseA.mtl` | `a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927` |
| `space-kit/Models/OBJ format/rocket_baseA.obj` | `3a6c4115e5994079abe83a7b97f14f2bcce0e97b76bd229dcb60fd0112060ccd` |
| `space-kit/Models/OBJ format/rocket_fuelA.mtl` | `583541d566dd5edba66cc8e2353e379bdc3de155cd21e173fab33fe9a9248a52` |
| `space-kit/Models/OBJ format/rocket_fuelA.obj` | `53f83c675728d51a12014724d413a7a264ae893512189313553581e1135bfa87` |
| `space-kit/Models/OBJ format/rocket_sidesA.mtl` | `f1131066d3cdc671b79f7799d5ddf194b25b0027381aea415d8c91d24e0190ba` |
| `space-kit/Models/OBJ format/rocket_sidesA.obj` | `3a69d1927e1ac09203c3b514a9714876cfeb4fb8688d003fff09a1e3b8237a8a` |
| `space-kit/Models/OBJ format/rocket_topA.mtl` | `7e4036c7a7ec9d8081082f4778338a8bff9a01bebb40c51cae08c8a96bc61785` |
| `space-kit/Models/OBJ format/rocket_topA.obj` | `d910a3dd8cccebb8f1eb259af29d436da6839e81ae362fc5e9fd8f4038146bb4` |
| `space-kit/Models/OBJ format/terrain_sideCliff.mtl` | `3f5b98315cc38f85580e92d4ac82f2693534ac142098fd1dbe76cc07b962c02d` |
| `space-kit/Models/OBJ format/terrain_sideCliff.obj` | `a321d44e8603bd3cdf59866464612d13d4720634bf46e0badb80ced32ba7379b` |
| `space-kit/Models/OBJ format/turret_double.mtl` | `762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b` |
| `space-kit/Models/OBJ format/turret_double.obj` | `f511dfa73a94274e1a13ab7d136f1087a99149853fa6659132ece1bbc28311e6` |
| `space-kit/Models/OBJ format/turret_single.mtl` | `762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b` |
| `space-kit/Models/OBJ format/turret_single.obj` | `2b3492cde9c9496d73963669d8d59e9f5ebccb9dcbf15dbf5336e7ca630c6a89` |

## Recipes and rendering contract

| Atlas | Source components |
| --- | --- |
| `drone-scout` | Space Kit `craft_speederA` |
| `drone-striker` | Space Kit `craft_speederD` |
| `turret-sentry` | Space Kit `turret_single`, with exact OBJ group `turret` faces removed |
| `turret-heavy` | Space Kit `turret_double`, with exact OBJ group `turret` faces removed |
| `barrier-rail` | Two Space Kit `barrels_rail` components, scale `0.72`, X `-0.44/+0.44` |
| `barrier-crate` | Three Modular Space Kit `gate-lasers` components, scale `0.72`, X `-0.85/0/+0.85` |
| `structure-reactor` | Two rocket assemblies at X `-0.74/+0.74`; base/sides/fuel/top scales `0.85/0.80/0.72/0.72`, Y `0/0.72/1.40/2.02` |
| `structure-tower` | Six Modular Space Kit `room-large` components, scale `0.72`, Y `0/0.60/1.20/1.80/2.40/3.00` |
| `gap-edge` | Two Space Kit `terrain_sideCliff` components, scale `0.78`, X `-0.42/+0.42` |

`tools/render-world-assets.swift` SHA-256: `5fde628296a1369259c437e380c5b32e731ddd4b9d4c0c10735af786cce409d3`.

Space Kit solid materials map by material name rather than source hue: `metal`, `_defaultMat`, and unknown defaults use warm white `#e9eff6`; `dark` uses graphite `#253044`; `rockDark` uses graphite `#303a46`; `metalDark`, `metalRed`, and `rock` use cool-steel levels `#8b9bab`, `#64788e`, and `#536678`. The Modular Space Kit colormap is preserved. PBR materials use metalness `0.24` and roughness `0.38`. Added details use cyan `#68e8ff`/`#58e7ff`; `#ff8a42` is reserved for the renderer's small generated hazard/status light. No warning red or magenta is baked into the base atlases.

The turret collision and procedural fallback remain at `1900` world units. Atlas-backed turrets use the independent visual `weaponMountHeight` of `1120`; with the runtime 960×600 projection fixture at zNear/zFar `300/350`, every committed turret view overlaps the barrel mount by `5.072–6.615` screen pixels.

Raw frames render at 2×. Alpha ≥ 16 defines one seven-view union bound; one shared uniform scale, horizontal center, and bottom anchor frames every yaw. Target width/height/bottom-padding contracts are drone `0.72/0.64/48`, turret `0.76/0.86/36`, wallLow `0.86/0.58/36`, wallHigh `0.78/0.88/28`, and gap `0.88/0.56/32`. If the shared placement leaves any yaw outside Y 440–488, the renderer shifts all seven frames together by the smallest legal integer offset; it never moves frames independently. Downsampling is bilinear in premultiplied RGBA; zero-alpha RGB is cleared. SceneKit prepares the complete scene before snapshots, repeated source components clone one prepared template, and color channels round to the nearest 4-bit bucket before the narrow isolated-noise canonicalizer.

Reproduce after extracting the two audited archives as `space-kit` and `modular-space-kit` under `$WORLD_WORK_DIR/extracted`:

```sh
swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-a"
swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-b"
for atlas in drone-scout drone-striker turret-sentry turret-heavy barrier-rail barrier-crate structure-reactor structure-tower gap-edge; do cmp "$WORLD_WORK_DIR/render-a/$atlas.png" "$WORLD_WORK_DIR/render-b/$atlas.png"; done
```

Fresh independent sequential processes produced byte-identical JSON reports and byte-identical A/B PNGs for all nine atlases. Every frame preserves at least 12 transparent pixels on left, right, and top; bottom opaque pixels remain from Y 440 through 488. Gap frames additionally keep at least 24 transparent pixels on every edge. Orange coverage is `0.099–1.838%` and red/purple coverage is `0–1.749%` of alpha≥16 pixels across the nine atlases. Every output stays below 2 MiB and the combined size is `2,085,162` bytes.

## Derived outputs

| Repository path | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/world/drone-scout.png` | 145852 | `9ab7c75a5eb1afe52950b064e8d453798be0df8c9bc600fdc9952e3d1106ed5d` |
| `assets/world/drone-striker.png` | 135056 | `8065eadf564c7b17aa301bc3738afd7591ba8c8cae695de98c96532b86c99736` |
| `assets/world/turret-sentry.png` | 143178 | `78ae048ac6fa37c8c46efa584de197caa09daa9d2fb99ea26d6a34e61225dc2a` |
| `assets/world/turret-heavy.png` | 145895 | `ebd1950a29d6424db4fc19f3f9643c3ff133b1d630460e8848f08862028194b7` |
| `assets/world/barrier-rail.png` | 237310 | `f0a8f85fdb02e5c07400e7ff06567cfd9d066051f5406ca37c591daf8285d914` |
| `assets/world/barrier-crate.png` | 345582 | `33b44384aae4c7cb6ea7d3f468fddf41f7918bf04b26ced88ef7e5561faf386d` |
| `assets/world/structure-reactor.png` | 284323 | `317a3b6dcb3fe72d4a065f4fd52d541494150681c9a068c4c6aff36b7d6db690` |
| `assets/world/structure-tower.png` | 505598 | `360a2fbae947d891c4b2ee9b50d141ad12186dfd894630036e9f4d953a360b3d` |
| `assets/world/gap-edge.png` | 142368 | `c3a0962aee773cfa9ac129dba9b49764d297491307836472b1743fead4ebba49` |

The original-resolution nine-row contact sheet was inspected before these hashes were frozen. All 63 views have complete silhouettes, stable shared framing, transparent padding, readable lane barriers and high structures, barrel-free turret bodies, tileable gap modules, and distinct warm-white/graphite/cool-steel/cyan materials with only tiny orange status accents.

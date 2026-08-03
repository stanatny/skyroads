# Hostile world atlas provenance

The nine runtime atlases are deterministic offline renders of CC0 models downloaded on **2026-08-03**. Source archives, extracted OBJ/MTL files, and textures are render inputs only and are not committed. Each atlas contains seven transparent `512 × 512` frames in yaw order `[-30, -20, -10, 0, 10, 20, 30]`, producing a `3584 × 512` PNG.

## Official free sources and licenses

| Source | Official page | Free upload | Archive | Archive SHA-256 | License copy | License SHA-256 |
| --- | --- | ---: | --- | --- | --- | --- |
| Quaternius Sci-Fi Essentials Kit Standard | https://quaternius.com/packs/scifiessentialskit.html | `12009762` | `Sci-Fi Essentials Kit[Standard].zip` | `a08346d538aa39fbea9fa492e03620d1860fc6214eedd62a4f5db373ac6fca01` | `licenses/Quaternius-Sci-Fi-Essentials-CC0.txt` | `2687fba65dca7bbd2f9ab2fb7a8c51dd0c7c8e9acd7579415612bec43f68b3f5` |
| KayKit Space Base Bits Free | https://kaylousberg.itch.io/space-base-bits | `8609688` | `KayKit_Space_Base_Bits_1.0_FREE.zip` | `4f8d3e2e90a74d9a0d5262e9e09daccac320f1bcfbe4fa2837559a8ad7b98c17` | `licenses/KayKit-Space-Base-Bits-CC0.txt` | `ab3bfedd06f2149bd9a3b78294c2797e039cdcf254979a8a4c83973a9900ea91` |

Both license files are exact byte-for-byte copies of the upstream **CC0 1.0 Universal** text. The free itch.io upload IDs above were resolved through short-lived download URLs; paid and source-edition archives were neither downloaded nor used.

## Audited render inputs

`tools/world-assets.json` maps every recipe to these exact source-relative paths and hashes. The renderer rejects absolute paths, network URLs, path traversal, source-edition paths, unlisted inputs, and hash mismatches before SceneKit loads a model.

| Upstream relative path | SHA-256 |
| --- | --- |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/containers_B.mtl` | `bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/containers_B.obj` | `2768e85d33c3253e658c7a1a14a9144c2ccc861a44aaaf1845f034f1c0e7f2fd` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/drill_structure.mtl` | `bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/drill_structure.obj` | `e8181916c9b8f0b08948e12c8b7a39a2d3a7b82f0d83498b988c08a9515e2a4b` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/spacebits_texture.png` | `f19fe5ced42f72104a3c2e9f15d591622723695dd461a380691a8a21ebb01ae9` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/structure_tall.mtl` | `bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/structure_tall.obj` | `99811112971149909c38bfb286d38484e06678228e6476db797b75b94009e24c` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/terrain_low.mtl` | `bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14` |
| `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/terrain_low.obj` | `10e1d8fe49028038bba3def7ea20e771efa7d57988592c7cdbc88d565a324f5e` |
| `quaternius/OBJ/Enemy_EyeDrone.mtl` | `b14e181d95f4c2ff09b03f15afeee1c7989fde2638ec862f2eabd93138a90b2a` |
| `quaternius/OBJ/Enemy_EyeDrone.obj` | `c0c0e9c7b0347dcbc22c862e43e67106f7032c081fabf62db1c328fa2eb28d87` |
| `quaternius/OBJ/Enemy_QuadShell.mtl` | `6a3da0a19d0c3443af158c84c7713d476cbc6cbe3d49f2cd9085a62ed52c19d1` |
| `quaternius/OBJ/Enemy_QuadShell.obj` | `bf8650079aac176f2924d122932ee206345e4bb3b69ef7a2eccce3f08209cc3b` |
| `quaternius/OBJ/Prop_Barrel2_Closed.mtl` | `f60be363e5a207e294084b9883a3697d0ee5f4a1546faab339a47e060f2e1d48` |
| `quaternius/OBJ/Prop_Barrel2_Closed.obj` | `e9e205c2f7edd3436258056973f1139ee6ee75fe438ef199b79f924650aa8bd3` |
| `quaternius/OBJ/Prop_Crate_Large.mtl` | `fa13718900aaaa8d22dcbb1fa5dd140321c14a23646513885c729aeff6a441c1` |
| `quaternius/OBJ/Prop_Crate_Large.obj` | `7ecccb65d1c328c05d10803b0c78c92ebf2ab20fd5b7b85c2aeced76bccec255` |
| `quaternius/OBJ/Prop_Crate_Tarp_Large.mtl` | `fa13718900aaaa8d22dcbb1fa5dd140321c14a23646513885c729aeff6a441c1` |
| `quaternius/OBJ/Prop_Crate_Tarp_Large.obj` | `2cd1a32679df2c608562c9afbd7f40794bd18a4f534af4c71bd57a66b7f2e2a1` |
| `quaternius/OBJ/Prop_Mine.mtl` | `6130165535beb5ac72a8620fdac603b89ed702bb239135a5466bbd26d5071147` |
| `quaternius/OBJ/Prop_Mine.obj` | `c24bef15e2ba615c2533e264bf135175eab19f9044c1430a5283460d91d377c4` |
| `quaternius/OBJ/Prop_SatelliteDish.mtl` | `fd12fb0d4d7f74ccb49c457226a97fc86b60927585cda02888e9d837e70e3074` |
| `quaternius/OBJ/Prop_SatelliteDish.obj` | `ae50567124bcca21882cc67fb36df2b4cfbc0f4d6c7772462233cfa9c638bdd7` |
| `quaternius/Textures/T_Enemies_BaseColor.png` | `65ab96c4ed89e64d84ed453fd67dfd37027860d81b93fb2a5d5bb2e9e0e35df8` |
| `quaternius/Textures/T_Enemies_Emissive.png` | `da6ebc7bb22dc15a39a127bcf4ebdf27047274f0f1fb26ca31bb7fc93a46ed0c` |
| `quaternius/Textures/T_Enemies_Normal.png` | `3e1f78e93b93df32828ee9a9389665e9ccbe330065a36f365267bd9e094d2187` |
| `quaternius/Textures/T_Enemies_ORM.png` | `c9b85f821df22954ca63cbeb09bc392bba4e12a3776c413886ea86b8457fd08d` |
| `quaternius/Textures/T_Props_Batch1_BaseColor.png` | `c0ea20e93b451f65a22a11bbfbc3542e2408f9d5c3f2ac3fd12304f1308106e9` |
| `quaternius/Textures/T_Props_Batch1_Normal.png` | `3a0d462366e5d03ef13fb35efc97c38c2463c118a89e303d356bac54d941d4ee` |
| `quaternius/Textures/T_Props_Batch1_ORM.png` | `021629ac29f3761db317303a862c731502cd3a1a207291011adac241f9f48fa0` |
| `quaternius/Textures/T_Props_Batch2_BaseColor.png` | `8977c1d6ada0ce151552caaf44be0b533827627f0172e6c1912175ab314260cd` |
| `quaternius/Textures/T_Props_Batch2_Emissive.png` | `e9ebf8ddd7e4d6c156e084b4d6f00d0a8090f40f0e6e188385980cf1e8a95aa0` |
| `quaternius/Textures/T_Props_Batch2_Normal.png` | `5dc16d40e5e92c956f0fdbeea346d2b6792f9f25b13addee5f33d984d75072aa` |
| `quaternius/Textures/T_Props_Batch2_ORM.png` | `3b66c58f973d119f8501a38a3bf7743818a1559366ddc4bb5c54b23667d233f3` |
| `quaternius/Textures/T_Props_Crates_BaseColor.png` | `79d604644b8ef63731735cfb29a4a9ded81598d20ecffe75e2af3fd9e18d255c` |
| `quaternius/Textures/T_Props_Crates_Normal.png` | `9fe8aa4951198c0dd3e06a41cd7aca1e50e308c2629f620f4d5be53dfc835b21` |
| `quaternius/Textures/T_Props_Crates_ORM.png` | `a36b59d07082dde265f13689f0acaacfa0cfb22b4769a2dad1bad282a39bf795` |
| `quaternius/Textures/T_Trim_01_BaseColor.png` | `a8f3271be2aa9c450ef5ef85c15bf8bcaeeaa48f5fc616df12d1334a96e78605` |
| `quaternius/Textures/T_Trim_01_Normal.png` | `1aec7ad47a642fc68216b5a3119341b7dca038c1fc9493df8a15ad4aa27ddbcf` |
| `quaternius/Textures/T_Trim_01_ORM.png` | `6ab7ad231df22867652048ebfd602684a9072d45c483ca57df0fcd4cb2cb4feb` |
| `quaternius/Textures/T_Trim_02_BaseColor.png` | `7b13c6a7d82b434314237c4b1930b8e12ddc69a70ffef28d73cbd178d3ff6293` |
| `quaternius/Textures/T_Trim_02_Normal.png` | `7faaa7059192f43aded9cc2f93917dd54fd14545509c37318d4e6bf0a8104960` |
| `quaternius/Textures/T_Trim_02_ORM.png` | `2a433e6a7fbcec375b5c5e5c7aa57dbe1fd23ca6592f48c52d09dde2d622aab8` |
| `quaternius/Textures/T_Trim_03_Dark.png` | `758a95beccdc9f0621d8b8a283ee2593e04b56f1cd32776165ec85e1568e8eb8` |
| `quaternius/Textures/T_Trim_03_Normal.png` | `b2c3238cbe2586e44df0b00179adf85e5b7ac7fed1713ec0b807482245a30738` |
| `quaternius/Textures/T_Trim_03_ORM.png` | `c57134b5d496b39b955a87765ea32b93567b1ab494fe6b890de24c75dcfd6fe4` |

## Recipes and rendering contract

| Atlas | Source components |
| --- | --- |
| `drone-scout` | Quaternius `Enemy_EyeDrone` |
| `drone-striker` | Quaternius `Enemy_QuadShell` |
| `turret-sentry` | Quaternius `Prop_Crate_Large` plus `Prop_SatelliteDish` at scale `0.62`, rotation `[-12, 0, 0]`, translation `[0, 0.72, 0]` |
| `turret-heavy` | Quaternius `Prop_Barrel2_Closed` plus `Prop_Mine` at scale `0.74`, rotation `[0, 0, 0]`, translation `[0, 0.68, 0]` |
| `barrier-rail` | Quaternius `Prop_Crate_Tarp_Large` |
| `barrier-crate` | KayKit `containers_B` |
| `structure-reactor` | KayKit `drill_structure` |
| `structure-tower` | KayKit `structure_tall` |
| `gap-edge` | KayKit `terrain_low`, rendered as one short repeatable deck-edge module |

`tools/render-world-assets.swift` SHA-256: `e15cb4e2f0b1ddf18a001e09042c3875af5f74f29a2349935695602b8ef6a712`.

SceneKit normalizes each visible component by height, applies the manifest transforms, normalizes the combined assembly by visible bounds, and anchors it to a common ground plane. A fixed orthographic camera, fixed pitch, deep-navy structural treatment, cyan key/rim light, magenta seams, and red hostile markers are used for all views. The runtime turret barrel remains a separate projected aiming layer; the atlases contain only the armored base/body and neutral mount detail.

Frames are rendered at 2× size, downsampled with exact integer averaging, clamped to legal premultiplied RGBA, and masked to the existing 16-level RGB grid. A final non-aesthetic canonicalizer removes only isolated fully opaque one-channel GPU bucket noise: all eight neighbors must also be opaque, the center RGB must be absent from the neighborhood, at least three neighbors must exactly support the neighborhood upper-median RGB, and only one center channel may differ by exactly one 16-level bucket. It never changes alpha or silhouette pixels and uses an immutable source snapshot so normalization cannot cascade.

Reproduce after extracting the two audited free archives under `$WORLD_WORK_DIR/extracted`:

```sh
swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-a"
swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-b"
for atlas in drone-scout drone-striker turret-sentry turret-heavy barrier-rail barrier-crate structure-reactor structure-tower gap-edge; do cmp "$WORLD_WORK_DIR/render-a/$atlas.png" "$WORLD_WORK_DIR/render-b/$atlas.png"; done
```

Fresh independent processes produced byte-identical JSON reports and byte-identical A/B PNGs for all nine atlases. Every output has transparent borders, no RGB beneath zero alpha, legal premultiplied RGB, and stays below 2 MiB; total output size is `1,035,685` bytes.

## Derived outputs

| Repository path | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/world/drone-scout.png` | 138451 | `069bb170fb605de78c924ab8983c09e1eddd2899a20ea794fa6c0ebc9b0e3bc1` |
| `assets/world/drone-striker.png` | 135218 | `a4f775132ad64e15ac472f4939e3b818c46fcee0757e6a32174131c5ee13a872` |
| `assets/world/turret-sentry.png` | 125212 | `5642f2a677179923fac523bdc63b1c41430799d6e79e4b9c2a444d62a6b09ba2` |
| `assets/world/turret-heavy.png` | 99445 | `63912cd7406faee52cb27a0dd96e8f6f0c12341695f4d04f470b9a28674d134f` |
| `assets/world/barrier-rail.png` | 101349 | `ec28a7233c5c1e17e6c2307491397ce1e022b857e9dac640bab18d33e16b65fc` |
| `assets/world/barrier-crate.png` | 85775 | `00948d25ba1d9eebbc9bd43e3112c0cbd8ea52a2c0f15df2e45363700f11b54f` |
| `assets/world/structure-reactor.png` | 150673 | `1495fffeb812f561d23be5c89fc603de3598c2990df9a04c1013e547673762cd` |
| `assets/world/structure-tower.png` | 144882 | `44dd46fddc6a04a220550cc9c9a699eae501e758bdf8d7cdc727f6eb2c50e25c` |
| `assets/world/gap-edge.png` | 54680 | `72d469cdac888c4dbde50f3a45823dc8cc0367a722ae92ee8ceced0a89ed5900` |

The original-resolution nine-atlas contact sheet was inspected before these hashes were frozen. All 63 views have clear silhouettes, stable ground/floating anchors, consistent lighting, restrained glow, transparent padding, and visual extents compatible with the fixed runtime collision geometry.

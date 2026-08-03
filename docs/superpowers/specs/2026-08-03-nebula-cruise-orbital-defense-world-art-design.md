# Nebula Cruise Orbital Defense World Art Design

## Context

The first V1.1 hostile-world art pass is technically complete, but playtest feedback identified two visual failures: the rendered low obstacles occupy too little of their projected draw boxes, and the Quaternius/KayKit mix does not look polished enough beside the player ship. The approved replacement direction is **B — Orbital Defense**: clean white armor, graphite joints, cyan energy, and restrained orange safety accents.

This pass replaces the actual runtime atlases. The previously shown Orbital Defense image is a direction mockup, not a source asset or a substitute for a real gameplay screenshot.

## Goals

- Replace every hostile world-art family in one coherent pass: drones, turrets, low barriers, high structures, and gap-edge modules.
- Make a near low barrier read as a real lane obstruction rather than a crate or dot.
- Keep large buildings visibly substantial while preserving the road vanishing point and lane readability.
- Keep drone direction readable through banking, the existing target-lane marker, and the existing direction chevron.
- Reuse the deterministic seven-view offline atlas pipeline and independent per-atlas runtime fallback.
- Deliver a real 1280×800 gameplay screenshot and a local playable link for visual approval before updating PR #1.

## Non-goals

- No runtime WebGL, 3D model loading, remote runtime asset, or database.
- No change to obstacle generation, lane count, safe-lane rules, collision width or height, score, difficulty, enemy state timing, leaderboard, or storage.
- No redesign of the player ship, HUD, pickups, music, or control behavior in this pass.
- No use of the generated direction mockup as a shipped game asset.

## Approved Visual Language

- Primary armor: warm white ceramic panels.
- Structure and joints: dark graphite.
- Environmental energy and edge lights: cyan.
- Safety accents: restrained orange, used for hazard bands and small status lamps.
- Hostile movement warning remains red/magenta because it is a gameplay cue, not part of the base model palette.
- Lighting remains crisp and readable; bloom must not enlarge the apparent collision core.
- Silhouettes remain broad and simple enough to recognize at maximum speed.

## Source Assets

Use only Kenney assets from the official CC0 packages:

- [Space Kit](https://kenney.nl/assets/space-kit), official archive `kenney_space-kit.zip`.
- [Modular Space Kit](https://kenney.nl/assets/modular-space-kit), official archive `kenney_modular-space-kit_1.0.zip`.

The selected source models are:

| Runtime atlas | Source model |
|---|---|
| `drone-scout` | Space Kit `craft_speederA` |
| `drone-striker` | Space Kit `craft_speederD` |
| `turret-sentry` | Space Kit `turret_single` |
| `turret-heavy` | Space Kit `turret_double` |
| `barrier-rail` | Space Kit `barrels_rail` assembled into one wide lane barrier |
| `barrier-crate` | Modular Space Kit `gate-lasers` |
| `structure-reactor` | Space Kit `machine_generatorLarge` |
| `structure-tower` | Modular Space Kit `room-large` assembled as a vertical defense structure |
| `gap-edge` | Space Kit `terrain_sideCliff` used as a repeatable engineered rim module |

Space Kit OBJ materials are solid-color `Kd` materials with no texture dependency. Modular Space Kit `gate-lasers` and `room-large` use `Models/OBJ format/Textures/colormap.png`.

Source archives and extracted models remain outside Git. Commit only the derived runtime atlases, exact license copies, deterministic renderer/manifest, and provenance.

## Atlas and Framing Contract

- Preserve the nine existing runtime paths and manifest keys.
- Preserve seven horizontal yaw frames at `-30, -20, -10, 0, 10, 20, 30` degrees.
- Preserve `512×512` per frame and `3584×512` per atlas.
- Preserve transparent outer padding, premultiplied color, and zero RGB under alpha zero.
- Canonical framing uses one shared scale and bottom-center anchor across all seven views of an asset; frames must not resize or jump independently.
- Low barriers target 86% of frame width and end 36 pixels above the frame bottom.
- High structures target 88% of frame height and end 28 pixels above the frame bottom.
- Drones target 72% of frame width and retain clear space for banking.
- Turrets target 76% of frame width or 86% of frame height, whichever is reached first.
- Gap modules target 88% of frame width and retain at least 24 transparent pixels on every outer edge.

Runtime visual width for `wallLow` and `wallHigh` becomes `648` world units, exactly 90% of the `720`-unit lane. Their gameplay footprint remains the complete lane and their collision heights remain `600` and `2000` world units.

## Runtime Behavior

The browser continues to select and cross-fade adjacent atlas yaw views using the current world position. The same continuous value from `enemyLane()` continues to drive drone rendering, projectiles, and collision.

The atlas contains only the turret body/base. The existing projected barrel and muzzle remain a separate runtime layer so aiming direction stays truthful. The drone keeps its existing bottom-center banking rotation, target-lane marker, and direction chevron. Reduced-motion behavior remains unchanged.

The gap opening and collision geometry remain procedural and perspective-correct. The source-derived `gap-edge` atlas is only a repeatable edge module placed along the projected opening; it does not replace or distort the opening itself.

## Failure Handling and Performance

- Every atlas remains optional independently; one failed image falls back only its own variant/category.
- The complete game remains playable without preferred world art.
- Each atlas remains at most 2 MiB and all nine remain at most 18 MiB.
- Exact-yaw placement uses one draw call; adjacent-yaw blending may use two.
- Sub-one-pixel and offscreen destinations remain culled.
- No new runtime request may reference Kenney or another remote host.

## Verification and Approval

Automated verification covers source/license provenance, deterministic double rendering, atlas geometry, alpha correctness, canonical opaque bounds, runtime world dimensions, fallback behavior, yaw selection, and drone direction cues.

Manual verification uses a real 1280×800 browser gameplay capture containing at least one low barrier, one high structure, one turret or drone, and one visible gap edge across the review set. Acceptance requires:

- a near barrier is immediately recognizable and visually occupies most of its lane;
- buildings feel substantial without covering adjacent safe lanes;
- drones visibly bank toward their destination and retain the directional cue;
- gap edges follow the road perspective without obscuring the opening;
- the white/graphite/cyan/orange palette reads as one coherent Orbital Defense family;
- the user approves the playable local build before the branch is pushed to PR #1.

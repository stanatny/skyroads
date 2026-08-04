# Nebula Cruise Semantic Spectrum Gameplay Art Design

## 1. Context

The current branch already contains the approved perception-first camera and HUD work:

- grounded structures use lane-based yaw and radial pitch;
- near grounded structures use one opaque middle-pitch frame;
- structure scale changes continuously with depth;
- the road uses a deeper navy treatment and projected contact footprints;
- active play uses a reduced HUD and removes utility controls from the Tab order.

Playtest feedback identified a separate art-direction problem. The player ship, structures, drones, road, HUD, and environmental energy all compete for the same navy/cyan/white palette. The result is internally coherent but visually flat: important gameplay classes do not own distinct signals.

The gap is the clearest failure. Its existing base `#05050d` has approximately `1.03:1` luminance contrast against the bottom background `#000005`. The interior gradients also sit close to the road value. The gap therefore reads as more background darkness instead of a lethal opening.

Pixel analysis of the committed assets confirms the palette collision:

- the player ship places approximately 29% of visible pixels in the cyan hue range;
- world structures and drones commonly place approximately 12% to 22% of visible pixels in the same range;
- the shared cyan light is simultaneously trying to mean player identity, architecture, energy, lane guidance, and enemy machinery.

The approved concept is **A — Semantic Spectrum**, with the corrected V2 projection rules. The HUD uses Wenrexa's light hologram language with Anton Revin's harder industrial meter treatment. The menu information architecture remains unchanged.

This specification supersedes the color assignments in the Orbital Defense world-art design and the “cyan as the main active accent” language in the perceptual camera design where they conflict. Camera, collision, generation, input, audio, persistence, and release constraints remain unchanged.

## 2. Player Outcome

At gameplay speed, the scene must communicate four classes before the player reads text:

1. **Player-controlled ship** — preserved cool material depth with localized gold identity accents;
2. **grounded obstacle or installation** — preserved cold-steel material with localized orange industrial signals;
3. **hostile mobile enemy** — magenta/red-violet with red warning cues;
4. **lethal missing road** — red-orange fracture edge over a purple-black depth field.

The background and ordinary road surrender saturation so these four classes own the scene's color budget.

Color is not the sole signal:

- the ship keeps its unique silhouette and fixed screen region;
- obstacle tiers keep distinct heights, band counts, and gold high-tier beacon;
- drones keep banking, a white direction chevron, and a target-lane ring;
- gaps keep missing deck geometry, a fractured edge, diagonal warning stripes, and depth lines.

## 3. Goals

- Make the player ship immediately separable from every hostile or environmental object.
- Give structures an industrial material family that does not reuse the player's identity color.
- Give drones and turrets a hostile color family distinct from static structures.
- Make every visible gap readable as lethal missing road at a glance.
- Preserve the approved V2 grounded camera, crisp foreground frame, and continuous perspective scale.
- Preserve one authoritative lane/depth projection path for rendering, grounding, and collision.
- Prevent building bases from drifting off their projected lane or being freely positioned in screen coordinates.
- Integrate a small, auditable A+B HUD asset subset without redesigning the main menu.
- Keep all runtime assets local and usable through HTTP, `file://`, WKWebView, and the macOS resource bundle.
- Make semantic recoloring reproducible on Linux without requiring SceneKit.
- Deliver a real-browser gameplay URL and screenshots before any commit or push.

## 4. Non-goals

- No WebGL, Three.js, runtime shader pipeline, remote runtime assets, or new package dependency.
- No new 3D model family.
- No change to track generation, lane count, difficulty, speed, scoring, collision, jumping, gliding, shooting, enemy timing, or power-up behavior.
- No change to the title, pause, leaderboard, rename, or game-over information architecture.
- No broad menu reskin; A+B assets are used for gameplay instrumentation first.
- No change to music content, localization scope, storage, product version, or macOS wrapper architecture.
- No dynamic biome state in this pass. A later pass may borrow low-saturation background variation from the rejected Sector Biomes direction without changing gameplay semantic colors.
- No commit, push, PR update, merge, tag, release, or production Pages claim before the user accepts the deployed preview.

## 5. Semantic Palette Contract

### 5.1 Background and road

| Role | Token | Purpose |
| --- | --- | --- |
| upper space | `#080b16` | desaturated blue-black sky |
| horizon space | `#1b1323` | restrained violet atmosphere |
| lower space | `#04060a` | neutral near-black, not a hazard color |
| deck A | `#222a34` | readable cold-steel road |
| deck B | `#28323d` | alternating segment value |
| lane seam | `rgba(151, 166, 176, depthAlpha)` | neutral navigation grid |
| road edge | `rgba(194, 207, 214, depthAlpha)` | physical boundary, not cyan energy |

Stars, the planet, distant silhouettes, and nebulae remain decorative and desaturated. Decorative background elements must not use the ship gold, hostile magenta, or gap red-orange at gameplay intensity.

### 5.2 Player

The player ship preserves the source render's material gradients, panel separation, canopy depth, and cool-blue identity. A light sepia/desaturation/brightness matrix warms the surface without repainting it. Identity gold `#ffd36a` is restricted to the brightest eligible energy samples and existing small accents. Existing red/green navigation lights remain conventional details.

Normal flight must retain at least 75% of the source color entropy, 45% of its quantized color count, and 65% of its edge energy. Gold may cover 1% to 12% of visible pixels; it must never replace the complete hull. Temporary BOOST and super-form layers may keep their existing semantic effects because their animation and duration distinguish them from the base ship.

### 5.3 Static structures

Walls, corridors, and buildings preserve their source steel/blue material gradients and receive:

- cold-steel shadows `#1c2730`;
- mid steel `#53616b`;
- pale steel highlights `#aebbc2`;
- industrial orange `#ff9b45`;
- danger orange-red `#ff713d` for low barriers and destructible blocking faces;
- high-tier gold beacon `#ffd66b`.

Only eligible bright energy bands become orange. The existing band hierarchy becomes:

- low wall: one orange signal band;
- medium wall: two orange signal bands;
- high wall: two orange signal bands plus one gold beacon;
- connected corridors retain the same band-count and height semantics.

### 5.4 Hostile mobile objects

Drones and turrets preserve source shading and panel detail through a hue-rotation matrix rather than a flat repaint. Their material family shifts toward magenta/red-violet, while warning red `#ff4f63` and the white direction chevron `#fff4f7` remain separate runtime cues.

The target-lane ring and warning flash remain shape-backed cues. Reduced motion freezes decorative pulse but does not remove the ring, chevron, bank direction, or hostile color.

### 5.5 Gap

> Superseded for gap rendering by
> `2026-08-04-nebula-cruise-dangerous-event-horizon-gap-design.md`.
> The player, structure, hostile, road, HUD, and asset-recoloring sections remain active.

The gap uses:

- near interior `#120307`;
- middle interior `#3d102c`;
- far anomaly `#321046`;
- fracture edge `#ff6b4d`;
- secondary hazard orange `#ff9f3b`;
- purple depth line `#d44eff`.

Required non-color cues:

- exact missing-deck quadrilateral;
- 4–6 px near fracture edge at 1280×800, perspective-scaled elsewhere;
- clipped diagonal warning stripes;
- five depth cross-lines;
- inward-moving ember points in normal motion;
- static stripes and depth lines in reduced motion.

The fracture edge must reach at least `4.5:1` contrast against the road deck. The complete gap must remain readable when saturation is removed: missing geometry, edge value, stripes, and depth lines must still distinguish it.

## 6. Projection and Lane-Occupancy Contract

### 6.1 One authoritative projection

Grounded objects may not be positioned with free screen coordinates. Runtime placement is derived only from:

```text
worldX = laneCenterX(lane)
zRel = zRelOf(segmentDepth)
projectedOrigin = project(worldX, baseY, zRel)
```

`uprightAtlasPlacement` receives this origin. Ground contacts, corridor geometry, atlas sprites, procedural fallbacks, collision, and warning cues consume the same lane/depth state.

### 6.2 Ground footprint

The lane width is `720` world units. Grounded structures retain a collision and contact width of `648` world units, exactly 90% of one lane:

```text
laneSafeWidth = laneWidth * 0.90 = 648
```

At every tested viewport and readable depth:

- the projected footprint center differs from the projected lane center by at most `0.5 px`;
- the projected ground-contact quadrilateral remains inside the lane boundaries;
- the atlas world origin lands on the same projected center and base;
- adjacent safe-lane centers are never covered by a grounded structure.

### 6.3 Visible silhouette

Upper 3D mass may reveal side depth beyond the 90% ground footprint. At readable depths `zRel >= 250`:

- each side may overhang the projected 648-unit footprint by at most 15% of the projected lane width;
- the sprite center differs from the projected lane center by at most `1 px` at 1280×800 and scales proportionally at other viewports;
- no sprite may cross an adjacent lane center;
- glow is excluded from the opaque silhouette measurement.

At `zRel < 250`, objects are already crossing or leaving the viewport. They still require continuous anchors and perspective scale, but are not shrunk solely to satisfy an offscreen silhouette box.

If an atlas violates these limits, fix the semantic atlas transform, frame origin, or source framing. Do not add ad hoc per-lane screen translations.

### 6.4 Aspect and scale

- Semantic asset generation preserves PNG dimensions, alpha support, frame order, and every frame origin.
- RGB recoloring does not alter alpha, alpha crops, or hidden RGB.
- The player frames preserve 512×384 dimensions and their existing draw rectangle.
- World atlases preserve 2240×960 dimensions and 21-frame order.
- `gap-edge` preserves 3584×512 dimensions and seven-yaw order.
- No Canvas call applies an arbitrary x/y scale to compensate for a bad asset.

## 7. Reproducible Semantic Assets

### 7.1 Source and output layout

The existing committed ship and world PNGs remain the immutable geometric source set. A Node.js tool creates separate semantic outputs:

```text
assets/ship/semantic/player-neutral.png
assets/ship/semantic/player-thrust.png
assets/world/semantic/*.png
```

The tool:

1. verifies every source SHA-256 before decoding;
2. accepts only non-interlaced 8-bit RGBA PNGs;
3. decodes all PNG filters;
4. applies a category-specific light color matrix only where alpha is non-zero;
5. replaces only eligible high-luminance energy samples with the semantic accent;
6. preserves alpha byte-for-byte;
7. writes zero RGB under zero alpha;
8. encodes deterministic PNG chunks and compression settings;
9. prints output hashes;
10. produces byte-identical output on repeated runs.

The runtime manifest points to semantic outputs. If a semantic asset fails to load, the existing procedural fallback remains category-local; it does not silently substitute a differently colored sibling atlas.

### 7.2 UI subset

Only these unmodified CC0 files are added:

| Repository output | Upstream file | SHA-256 | Use |
| --- | --- | --- | --- |
| `assets/ui/hologram-panel.png` | Wenrexa `Card X1/Panel Empty.png` | `1c15f13cf8e52cd26022dc1e6be7b1b92c36e39e6b220c8ecba9e028b0ff2c6e` | translucent HUD backplate |
| `assets/ui/industrial-meter-overlay.png` | Anton Revin `progress bars/progress_overlay.png` | `0d2277fa1de504d1efed6a3cde4ff7419062e6e66bc337da1f451e3a93e57e6d` | meter frame/detail |

Source archives:

- Wenrexa: `1._free_hologram_interface_wenrexa.zip`, SHA-256 `23e2a76ab0e4fcd2bafe64435c57019653ffedd04e6ba02fed284bb0784879b7`;
- Anton Revin: `SCIFI UI.zip`, SHA-256 `8bfda504e0330773321e9a1dbd33aca7e20a33d3fe7742662897d6493805c769`.

Both OpenGameArt pages declare CC0. The repository stores the official CC0 1.0 legal code and records source page, archive URL, archive hash, upstream path, selected-file hash, repository path, and modification status.

No PSD, complete archive, unused button, icon set, or decorative card is committed.

## 8. A+B HUD Contract

The information architecture from the perceptual HUD pass remains:

- left: fuel and jump pips;
- right: score, distance, speed;
- contextual stack: charge, BOOST, super form, magnet only while relevant.

Visual composition:

- Wenrexa hologram panel supplies the light outer silhouette;
- the Canvas still draws a dark translucent backplate for contrast;
- Anton's industrial overlay supplies the meter edge and tick language;
- player gold is reserved for focus, fully charged state, and special-form status;
- ordinary active meters use neutral ice-white or their existing semantic status color;
- persistent HUD no longer uses broad cyan panels.

If either new UI image fails, the Canvas draws the existing procedural chamfered panel and meter. HUD information never disappears because an ornamental asset failed.

The main menu and dialog surfaces keep their existing structure and current Kenney frame during this pass.

## 9. Runtime Component Boundaries

- `src/presentation.js`
  - owns UI asset paths, preload state, fallback resolution, HUD layout, and visibility;
  - exposes the selected hologram panel and meter overlay without drawing gameplay.
- `src/world-art.js`
  - owns semantic world asset paths, view selection, frame metadata, draw-plan bounds, and projection-envelope helpers;
  - does not own gameplay state or Canvas drawing.
- `src/game.js`
  - owns semantic scene tokens, background/road/gap drawing, sprite orchestration, warning cues, and Canvas HUD composition;
  - uses `laneCenterX`, `zRelOf`, and `project` as the only grounded placement path.
- `tools/recolor-semantic-assets.js`
  - owns deterministic PNG decoding, palette mapping, encoding, source hash verification, and output reporting.
- `tests/assets.test.js`
  - owns source/output hashes, alpha invariance, deterministic generation, palette distributions, dimensions, and license provenance.
- `tests/world-art.test.js`
  - owns lane-envelope math and draw-plan center/overhang contracts.
- `tests/world-render.test.js`
  - owns runtime color roles, gap cues, grounded placement, and fallback behavior.
- `tests/game-audio-ui.test.js`
  - owns HUD asset/fallback composition without changing audio behavior.
- `tests/static-app.test.js`
  - owns local resource graph and active-play/menu CSS boundaries.

## 10. Failure Handling

- Missing semantic ship frames use the existing procedural ship.
- Missing semantic world atlas uses that category's procedural world renderer.
- Missing hologram panel or meter overlay uses procedural Canvas HUD geometry.
- Invalid or unexpected source PNG hashes stop generation before any output is replaced.
- Partial generation writes into a temporary directory and atomically replaces outputs only after every file passes validation.
- Reduced motion keeps all semantic colors and static hazard shapes while suppressing decorative travel and pulse.
- Existing keyboard, pause, audio, storage, and localization failure behavior remains independent.

## 11. Automated Acceptance

### 11.1 Assets and provenance

- both selected UI files match the exact upstream SHA-256 values;
- official source pages, archive URLs, archive hashes, CC0, selected paths, and modification status are documented;
- the CC0 legal text is committed and hash-pinned;
- semantic generation rejects a source hash mismatch;
- two fresh semantic generations are byte-identical;
- every output retains source width and height;
- every output alpha plane is byte-identical to its source;
- every output has zero RGB under zero alpha;
- every output retains at least 75% of source color entropy, 45% of quantized colors, and 65% of edge energy;
- output mean luminance remains between 65% and 145% of the source;
- semantic accent coverage stays below its role-specific maximum;
- every semantic asset path is local;
- app resource tests include the semantic ship, semantic world set, and selected UI files.

### 11.2 Palette

- player normal frames preserve source material detail and contain 1% to 12% localized gold;
- static structures preserve source material detail and contain 1.5% to 25% localized orange;
- drones and turrets preserve source detail while shifting toward hostile magenta/red-violet;
- low/medium/high obstacle signal counts remain one/two/two plus high-tier gold;
- ordinary background and road tokens do not use player gold, hostile magenta, or gap fracture red;
- gap fracture red reaches at least `4.5:1` contrast against both deck values.

### 11.3 Geometry

- ground footprint width remains 648 world units;
- footprint center matches projected lane center within `0.5 px`;
- atlas origin matches projected ground center within `0.5 px`;
- at `zRel >= 250`, opaque silhouette overhang is at most 15% of projected lane width per side;
- opaque silhouette never crosses an adjacent lane center;
- source and semantic draw-plan bounds are identical because alpha and metadata are unchanged;
- all seven lanes pass at near, middle, and far readable depths;
- player semantic frames use the same draw rectangle as current frames;
- foreground grounded pitch row and continuous inverse-depth scale contracts remain green.

### 11.4 Runtime and HUD

- road uses neutral steel instead of cyan-dominant panels;
- a gap emits fracture edge, diagonal stripe, depth-line, and missing-deck events;
- reduced motion keeps static gap cues;
- drones keep magenta hostile identity plus chevron and landing ring;
- structures keep orange industrial hierarchy;
- HUD resolves both A+B assets when loaded;
- missing A+B assets retain complete procedural HUD information;
- active play still hides utility controls;
- menu, pause, results, leaderboard, and rename behavior remains unchanged.

## 12. Browser Acceptance

Test at 960×600, 1280×800, 1920×1080, and the user's current wide browser:

- normal and reduced motion;
- center, inner, and outer lanes;
- `zRel` around 250, 505, 800, 1190, 1800, and far horizon;
- low, medium, high, corridor, turret, and drone rest/warn/move;
- single-lane gap, full gap, and narrow bridge;
- normal ship, thrust, charge, BOOST, and super form;
- English and Chinese;
- menu, play, pause, and game over.

Acceptance requires:

- the ship is the most immediately identifiable controlled object;
- structures, drones, and gaps never rely on the same dominant hue;
- every visible gap reads as missing road before its edge reaches the player;
- grounded bases visibly sit inside their lane;
- no building appears freely placed outside the road projection;
- no middle-lane obstacle appears offset from its grid cell;
- no semantic recolor changes collision, anchor, frame choice, or scale;
- HUD decoration never obscures the forward hazard-reading area;
- browser console errors and failed local resource loads equal zero.

## 13. Delivery Boundary

The development preview URL remains unchanged. The user reviews the deployed semantic-art pass before any commit or push. After approval, prepare one coherent local commit with the repository's required authorship trailer, show the exact diff and test evidence, and request explicit authorization before pushing the branch that updates PR #1.

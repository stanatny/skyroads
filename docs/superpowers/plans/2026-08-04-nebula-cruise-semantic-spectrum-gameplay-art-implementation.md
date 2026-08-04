# Nebula Cruise Semantic Spectrum Gameplay Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the player, static structures, hostile mobile enemies, and gaps distinct gameplay-readable visual identities while preserving the approved camera, lane projection, collision, and build-free runtime.

**Architecture:** Keep the current Canvas 2D and local-atlas architecture. Add a pure semantic scene-style module, generate color-only semantic derivatives from the existing geometry-correct PNGs with a deterministic Node tool, point runtime manifests at those derivatives, and use the existing projection path for every grounded object. Integrate exactly two CC0 A+B HUD images with procedural fallbacks.

**Tech Stack:** Classic browser JavaScript, Canvas 2D, Node.js built-in modules and test runner, deterministic PNG decode/encode, semantic DOM/CSS, static Python HTTP preview, Chromium DevTools Protocol.

> Superseded for gap rendering by
> `2026-08-04-nebula-cruise-dangerous-event-horizon-gap-design.md` and
> `2026-08-04-nebula-cruise-dangerous-event-horizon-gap-implementation.md`.
> The player, structure, hostile, road, HUD, and asset-recoloring tasks remain active.

## Global Constraints

- Work only on `feat/stellar-command-polish`.
- Do not commit or run `git push` before the user accepts the deployed preview.
- Do not merge PR #1.
- Do not create a release tag or claim production Pages is updated.
- Preserve the static, dependency-free, classic-script runtime.
- Preserve gameplay generation, seven lanes, speed, collision, jump, glide, shooting, scoring, persistence, audio content, localization scope, product version, and macOS wrapper architecture.
- Preserve the approved grounded camera: lane yaw `0/±10/±20/±30`, radial pitch, one opaque middle-pitch foreground frame below `zRel = 1,200`, and continuous inverse-depth scale.
- Preserve original PNG dimensions, alpha, frame order, world origins, and collision geometry.
- Keep runtime assets local and usable through HTTP, `file://`, WKWebView, and the copied macOS resource tree.
- Use red-green-refactor for every behavior change.
- Linux verification cannot replace macOS `sips`, SceneKit, `afinfo`, WKWebView, universal-binary, or signature evidence.
- The user-approved development preview URL remains unchanged.

---

### Task 1: Add the Pure Semantic Scene Contract

**Files:**
- Create: `src/scene-style.js`
- Create: `tests/scene-style.test.js`
- Modify: `index.html`
- Modify: `tests/static-app.test.js`

**Interfaces:**
- Consumes: no DOM, Canvas, gameplay state, or assets.
- Produces:
  - `Skyroads.sceneStyle.SCENE_STYLE`;
  - `relativeLuminance(hex)`;
  - `contrastRatio(foreground, background)`;
  - `semanticRoleFor(category)`.

- [ ] **Step 1: Add failing tests for palette roles and contrast**

Create `tests/scene-style.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCENE_STYLE,
  contrastRatio,
  semanticRoleFor,
} = require('../src/scene-style.js');

test('semantic roles reserve independent player structure hostile and gap colors', () => {
  assert.equal(semanticRoleFor('player'), 'player');
  assert.equal(semanticRoleFor('wallHigh'), 'structure');
  assert.equal(semanticRoleFor('corridorMedium'), 'structure');
  assert.equal(semanticRoleFor('drone'), 'hostile');
  assert.equal(semanticRoleFor('turret'), 'hostile');
  assert.equal(semanticRoleFor('gap'), 'gap');
  assert.notEqual(SCENE_STYLE.player.identity, SCENE_STYLE.structure.signal);
  assert.notEqual(SCENE_STYLE.structure.signal, SCENE_STYLE.hostile.signal);
  assert.notEqual(SCENE_STYLE.hostile.signal, SCENE_STYLE.gap.fracture);
});

test('gap fracture keeps gameplay contrast against both road deck values', () => {
  assert.ok(contrastRatio(SCENE_STYLE.gap.fracture, SCENE_STYLE.road.deckA) >= 4.5);
  assert.ok(contrastRatio(SCENE_STYLE.gap.fracture, SCENE_STYLE.road.deckB) >= 4.5);
});

test('scene contract is recursively frozen', () => {
  assert.equal(Object.isFrozen(SCENE_STYLE), true);
  assert.equal(Object.isFrozen(SCENE_STYLE.gap), true);
  assert.equal(Object.isFrozen(SCENE_STYLE.hostile), true);
});
```

Extend `tests/static-app.test.js` so `scene-style.js` must load after `presentation.js` and before `game.js`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/scene-style.test.js tests/static-app.test.js
```

Expected: FAIL because `src/scene-style.js` and its script tag do not exist.

- [ ] **Step 3: Implement the pure module and static script order**

Create `src/scene-style.js` as a classic-script/CommonJS-compatible IIFE. Define the exact tokens from the specification:

```js
const SCENE_STYLE = deepFreeze({
  background: { upper: '#080b16', horizon: '#1b1323', lower: '#04060a' },
  road: {
    deckA: '#222a34',
    deckB: '#28323d',
    laneRgb: '151,166,176',
    edgeRgb: '194,207,214',
  },
  player: {
    shadow: '#202833',
    mid: '#4a5158',
    highlight: '#fff2d4',
    identity: '#ffd36a',
  },
  structure: {
    shadow: '#1c2730',
    mid: '#53616b',
    highlight: '#aebbc2',
    signal: '#ff9b45',
    danger: '#ff713d',
    beacon: '#ffd66b',
  },
  hostile: {
    shadow: '#23142f',
    mid: '#7b285f',
    signal: '#ff4fa3',
    warning: '#ff4f63',
    cue: '#fff4f7',
  },
  gap: {
    near: '#120307',
    middle: '#3d102c',
    far: '#321046',
    fracture: '#ff6b4d',
    stripe: '#ff9f3b',
    depth: '#d44eff',
  },
});
```

Insert:

```html
<script defer src="./src/scene-style.js"></script>
```

after `world-art.js` and before `game.js`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/scene-style.test.js tests/static-app.test.js
npm run check
```

Expected: all focused tests and syntax checks pass.

---

### Task 2: Build Deterministic PNG Infrastructure

**Files:**
- Create: `tools/png-rgba.js`
- Create: `tests/png-rgba.test.js`

**Interfaces:**
- Consumes: a Buffer containing one non-interlaced 8-bit RGBA PNG.
- Produces:
  - `decodePngRgba(bytes) -> { width, height, rgba }`;
  - `encodePngRgba({ width, height, rgba }) -> Buffer`;
  - `sha256(bytes) -> lowercase hex`;
  - `alphaPlane(rgba) -> Buffer`.

- [ ] **Step 1: Add failing codec and determinism tests**

Use `assets/ui/panel-frame-cyan.png` as a real fixture:

```js
test('PNG codec round-trips exact RGBA and writes deterministic bytes', () => {
  const source = fs.readFileSync(path.join(root, 'assets/ui/panel-frame-cyan.png'));
  const decoded = decodePngRgba(source);
  const first = encodePngRgba(decoded);
  const second = encodePngRgba(decoded);
  assert.equal(first.equals(second), true);
  assert.deepEqual(decodePngRgba(first), decoded);
});

test('PNG decoder rejects interlaced or non-RGBA input', () => {
  assert.throws(() => decodePngRgba(Buffer.from('not png')), /PNG signature/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/png-rgba.test.js
```

Expected: FAIL because `tools/png-rgba.js` is absent.

- [ ] **Step 3: Implement strict decode and deterministic encode**

Implement PNG signature and chunk parsing with Node built-ins:

- `node:zlib` for `inflateSync` and `deflateSync`;
- all PNG filters 0–4;
- only bit depth 8, color type 6, compression 0, filter 0, interlace 0;
- deterministic filter 0 output;
- chunks `IHDR`, `IDAT`, `IEND`;
- CRC32 generated by a fixed local table;
- `deflateSync(raw, { level: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY })`.

Do not add an npm dependency.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
node --test tests/png-rgba.test.js
```

Expected: all codec tests pass.

---

### Task 3: Define and Generate Semantic Ship and World Assets

**Files:**
- Create: `tools/semantic-assets.json`
- Create: `tools/recolor-semantic-assets.js`
- Create: `tests/semantic-assets.test.js`
- Create: `assets/ship/semantic/player-neutral.png`
- Create: `assets/ship/semantic/player-thrust.png`
- Create: `assets/world/semantic/drone-scout.png`
- Create: `assets/world/semantic/drone-striker.png`
- Create: `assets/world/semantic/turret-sentry.png`
- Create: `assets/world/semantic/turret-heavy.png`
- Create: `assets/world/semantic/barrier-rail.png`
- Create: `assets/world/semantic/barrier-crate.png`
- Create: `assets/world/semantic/structure-pylon.png`
- Create: `assets/world/semantic/structure-bastion.png`
- Create: `assets/world/semantic/structure-reactor.png`
- Create: `assets/world/semantic/structure-tower.png`
- Create: `assets/world/semantic/corridor-low.png`
- Create: `assets/world/semantic/corridor-medium.png`
- Create: `assets/world/semantic/gap-edge.png`
- Modify: `src/presentation.js`
- Modify: `src/world-art.js`
- Modify: `tests/world-art.test.js`
- Modify: `tests/presentation.test.js`

**Interfaces:**
- Consumes: exact source paths and SHA-256 values from `tools/semantic-assets.json`, plus `SCENE_STYLE`.
- Produces: deterministic semantic PNGs with unchanged dimensions and alpha, and runtime manifests pointing to those outputs.

- [ ] **Step 1: Add failing source-integrity and palette tests**

`tests/semantic-assets.test.js` must:

- verify each declared source hash before generation;
- run the generator twice into two temporary directories;
- compare every output byte-for-byte;
- compare output dimensions with source dimensions;
- compare alpha planes byte-for-byte;
- assert zero RGB where alpha is zero;
- assert player normal frames retain source material detail with 1% to 12% localized gold;
- assert static structures retain source material detail with 1.5% to 25% localized orange;
- assert drone/turret outputs retain source edge and color complexity while shifting toward hostile magenta;
- assert every output retains at least 75% of source color entropy, 45% of quantized colors, and 65% of edge energy;
- assert mean luminance remains between 65% and 145% of the source;
- assert output paths equal the runtime manifest paths.

Use the source hashes already frozen in `docs/assets/ship-render.md` and `docs/assets/world-art.md`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/png-rgba.test.js tests/semantic-assets.test.js
```

Expected: FAIL because the manifest, generator, and semantic outputs are absent.

- [ ] **Step 3: Implement category-specific RGB mapping**

For every visible straight-alpha pixel:

```js
const luminance = relativeLuminanceFromBytes(red, green, blue);
const { hue, saturation } = rgbToHsv(red, green, blue);
```

Apply the same light color-matrix families approved in the visual comparison:

- `player`: mild sepia, reduced saturation, and bounded brightness; only eligible bright energy samples become identity gold;
- `structure`: reduced saturation, mild sepia, and small hue rotation; only eligible bright energy samples become orange;
- `barrier/corridor`: a slightly stronger industrial matrix with localized orange-red energy;
- `hostile`: hue rotation toward magenta while retaining original luminance and panel variation;
- `gap`: restrained desaturation/sepia darkening; only eligible bright energy samples become fracture red.

Preserve alpha exactly. For alpha zero, write RGB zero. Generate into a temporary directory and rename only after all outputs validate.

- [ ] **Step 4: Generate the committed outputs**

Run:

```bash
node tools/recolor-semantic-assets.js
```

Expected: report JSON lists fifteen output paths and SHA-256 values.

- [ ] **Step 5: Switch runtime manifests without changing metadata**

In `src/presentation.js`:

```js
ship: Object.freeze({
  neutral: './assets/ship/semantic/player-neutral.png',
  thrust: './assets/ship/semantic/player-thrust.png',
}),
```

In `src/world-art.js`, keep all generated frame metadata but replace each path with `./assets/world/semantic/<name>.png`.

Update exact path expectations in `tests/world-art.test.js` and preload expectations in `tests/presentation.test.js`.

- [ ] **Step 6: Run semantic and manifest tests**

Run:

```bash
node --test tests/png-rgba.test.js tests/semantic-assets.test.js tests/world-art.test.js tests/presentation.test.js
```

Expected: all focused tests pass.

---

### Task 4: Add Projection and Lane-Envelope Guardrails

**Files:**
- Modify: `src/world-art.js`
- Modify: `tests/world-art.test.js`
- Modify: `tests/world-render.test.js`

**Interfaces:**
- Consumes: existing `projectPoint`, lane center, `zRel`, `WORLD_GEOMETRY`, and draw-plan bounds.
- Produces:
  - `projectedLaneEnvelope({ projectPoint, worldX, zRel, laneWidth, footprintWidth, baseY })`;
  - tests that prevent screen-space placement drift.

- [ ] **Step 1: Add failing lane-envelope tests**

Define a test matrix:

```js
const viewports = [[960, 600], [1280, 800], [1920, 1080]];
const depths = [250, 505, 800, 1190, 1800, 3600, 6000];
const lanes = [0, 1, 2, 3, 4, 5, 6];
```

For every grounded semantic atlas:

- footprint center equals projected lane center within 0.5 px;
- footprint width equals projection of 648 world units;
- draw-plan center is within 1 px at 1280×800, scaled by viewport width elsewhere;
- each-side opaque overhang is no more than 15% of projected 720-unit lane width;
- plan bounds never cross adjacent lane centers;
- source and semantic alpha-derived plan bounds are identical.

Add runtime tests that wall, corridor, and turret placements call `laneCenterX(lane)` and the same `zRel` used by their ground contacts.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/world-art.test.js tests/world-render.test.js
```

Expected: FAIL because `projectedLaneEnvelope` does not exist.

- [ ] **Step 3: Implement the pure envelope helper**

Return a frozen object:

```js
{
  laneCenter,
  laneLeft,
  laneRight,
  footprintLeft,
  footprintRight,
  footprintWidth,
}
```

Do not add runtime translations or per-lane correction tables.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/world-art.test.js tests/world-render.test.js
```

Expected: every geometry and existing camera test passes.

---

### Task 5: Apply Semantic Scene Composition and Gap Cues

**Files:**
- Modify: `src/game.js`
- Modify: `tests/world-render.test.js`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- Consumes: `Skyroads.sceneStyle.SCENE_STYLE`, existing projection, existing motion policy, semantic atlas images.
- Produces: desaturated background, neutral road, semantic procedural fallbacks, and shape-backed lethal gaps.

- [ ] **Step 1: Add failing runtime color and gap tests**

Extend recording gradients so tests capture `addColorStop(offset, color)`.

Assert:

- `renderBackground` uses the three approved background colors;
- road deck alternates `#222a34` and `#28323d`;
- road lane seams use neutral `151,166,176`, not cyan;
- every rendered gap uses fracture `#ff6b4d`;
- gap drawing creates one clip, diagonal stripe strokes, five depth cross-lines, and missing-deck fill;
- reduced motion keeps fracture, stripes, and depth lines;
- procedural structures use orange signal;
- procedural drones/turrets use hostile magenta/red-violet;
- drone warning keeps white chevron and red landing ring.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/world-render.test.js tests/game-audio-ui.test.js
```

Expected: FAIL on old navy/cyan road, old gap colors, and old fallback palettes.

- [ ] **Step 3: Route Canvas colors through `SCENE_STYLE`**

Add:

```js
function sceneStyle() {
  return globalThis.Skyroads.sceneStyle.SCENE_STYLE;
}
```

Use it in:

- `renderBackground`;
- `renderTrack`;
- `drawProceduralGapVoid`;
- a new always-drawn `drawGapFractureEdge`;
- procedural drone, turret, low/medium/high wall, and corridor detail fallbacks;
- death-flash semantic mapping.

The loaded `gapEdge` atlas remains a physical rim. The red-orange fracture line is drawn regardless of atlas availability.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/scene-style.test.js tests/world-render.test.js tests/game-audio-ui.test.js
```

Expected: all semantic scene tests and prior rendering tests pass.

---

### Task 6: Integrate the Minimal A+B HUD Asset Subset

**Files:**
- Create: `assets/ui/hologram-panel.png`
- Create: `assets/ui/industrial-meter-overlay.png`
- Create: `licenses/OpenGameArt-CC0-1.0.txt`
- Modify: `src/presentation.js`
- Modify: `src/game.js`
- Modify: `tests/presentation.test.js`
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/assets.test.js`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: Wenrexa `Panel Empty.png`, Anton Revin `progress_overlay.png`, and existing HUD layout/visibility state.
- Produces:
  - `resolveUiAsset(visualAssets, key)`;
  - hologram-backed HUD panels;
  - industrial meter overlays;
  - complete procedural fallback.

- [ ] **Step 1: Add failing UI asset and fallback tests**

Assert:

```js
assert.equal(resolveUiAsset(visualAssets, 'hologramPanel'), panel);
assert.equal(resolveUiAsset(visualAssets, 'industrialMeter'), meter);
assert.equal(resolveUiAsset(visualAssets, 'unknown'), null);
```

In the game harness:

- loaded HUD assets produce `drawImage` calls for both IDs;
- missing UI assets still produce fuel, jumps, score, distance, speed, and contextual status text;
- no HUD asset changes layout coordinates or the 5% safe inset.

In `tests/assets.test.js`, require exact selected-file hashes and the CC0 legal code.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/presentation.test.js tests/game-audio-ui.test.js tests/assets.test.js
```

Expected: FAIL because the assets, resolver, license record, and manifest entries do not exist. On Linux, later `assets.test.js` cases may still report macOS-tool failures; the new focused assertions must fail for the intended missing-file reason before implementation.

- [ ] **Step 3: Add the exact unmodified files and provenance**

Copy only:

```text
Wenrexa Card X1/Panel Empty.png
Anton Revin progress bars/progress_overlay.png
```

to the declared repository paths. Verify:

```bash
sha256sum assets/ui/hologram-panel.png assets/ui/industrial-meter-overlay.png
```

Expected:

```text
1c15f13cf8e52cd26022dc1e6be7b1b92c36e39e6b220c8ecba9e028b0ff2c6e
0d2277fa1de504d1efed6a3cde4ff7419062e6e66bc337da1f451e3a93e57e6d
```

Add the official CC0 1.0 legal code and document both OpenGameArt source pages, direct archive URLs, archive hashes, selected paths, selected hashes, repository paths, and that pixels are unmodified.

- [ ] **Step 4: Preload and resolve UI assets**

Extend `VISUAL_ASSET_MANIFEST.ui`:

```js
hologramPanel: './assets/ui/hologram-panel.png',
industrialMeter: './assets/ui/industrial-meter-overlay.png',
```

Implement `resolveUiAsset` with the same null-safe behavior as `resolveWorldAtlas`.

- [ ] **Step 5: Compose HUD assets with procedural contrast**

`drawHudPanel` keeps its dark translucent polygon, then draws the hologram image inside the same rectangle at restrained alpha.

`drawContextStatus` and the fuel meter draw Anton's meter overlay after the fill and before labels. The overlay is ornament only; Canvas strokes remain as fallback and contrast support.

- [ ] **Step 6: Run focused UI and asset tests**

Run:

```bash
node --test tests/presentation.test.js tests/game-audio-ui.test.js
node --test --test-name-pattern='selected semantic UI|third-party notices|committed license' tests/assets.test.js
```

Expected: all selected tests pass.

---

### Task 7: Freeze Provenance, Resource Packaging, and Browser Contracts

**Files:**
- Modify: `tests/assets.test.js`
- Modify: `tests/app-resources-smoke.sh`
- Modify: `docs/assets/ship-render.md`
- Modify: `docs/assets/world-art.md`
- Create: `docs/assets/semantic-spectrum.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

**Interfaces:**
- Consumes: final semantic asset hashes and generator report.
- Produces: auditable source/output records and package-resource requirements.

- [ ] **Step 1: Add failing documentation and resource tests**

Require:

- every semantic output path and SHA-256;
- generator and manifest SHA-256;
- exact reproduction command `node tools/recolor-semantic-assets.js`;
- source asset hashes;
- alpha invariance statement;
- A+B source/license records;
- all semantic outputs and new UI assets in `tests/app-resources-smoke.sh`;
- bilingual README statements that gameplay uses self-hosted semantic visual assets.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern='semantic|third-party|documented offline|resource' tests/assets.test.js tests/static-app.test.js
```

Expected: FAIL on missing final hashes and documentation.

- [ ] **Step 3: Write exact provenance and package inventory**

Record:

- original source path/hash;
- semantic output path/hash;
- transformation role;
- output dimensions;
- generator hash;
- palette manifest hash;
- reproduction command;
- CC0 UI source records.

Update app resource smoke required paths.

- [ ] **Step 4: Run focused documentation checks**

Run:

```bash
node --test --test-name-pattern='semantic|third-party|documented offline|resource' tests/assets.test.js tests/static-app.test.js
git diff --check
```

Expected: selected tests and whitespace checks pass.

---

### Task 8: Real-Browser Matrix, Regression, and Preview Delivery

**Files:**
- Modify only if verification exposes a defect in files owned by Tasks 1–7.

**Interfaces:**
- Consumes: the complete semantic implementation.
- Produces: fresh test evidence, screenshots, and the unchanged development URL.

- [ ] **Step 1: Run syntax and platform-independent regression**

Run:

```bash
npm run check
node --test $(find tests -maxdepth 1 -name '*.test.js' ! -name 'assets.test.js' -print | sort)
node --test tests/png-rgba.test.js tests/semantic-assets.test.js tests/scene-style.test.js
```

Expected: all platform-independent tests pass.

- [ ] **Step 2: Run Linux-compatible asset assertions**

Run focused `assets.test.js` patterns covering:

- semantic UI files;
- source/output hashes;
- alpha invariance;
- deterministic generation;
- provenance;
- runtime preload graph.

Expected: selected assertions pass. Do not claim macOS-only tests pass on Linux.

- [ ] **Step 3: Verify the served files match the workspace**

For `src/scene-style.js`, `src/world-art.js`, `src/game.js`, `styles/game.css`, representative semantic assets, and both UI assets:

```bash
curl -fsS <preview-url>/<path> | sha256sum
sha256sum <path>
```

Expected: every pair matches and the page returns HTTP 200.

- [ ] **Step 4: Capture deterministic real-browser scenes**

Use Chromium DevTools Protocol to force representative fixtures:

- low/medium/high structures on center and edge lanes;
- one drone in rest/warn/move;
- one turret;
- one single-lane gap, one full gap, one narrow bridge;
- normal and reduced motion;
- normal/thrust/charge/BOOST/super ship;
- viewports 960×600, 1280×800, 1920×1080, and the user's wide viewport.

Capture screenshots and diagnostics:

- no browser exception;
- no failed resource load;
- fifteen semantic assets and both UI assets loaded;
- no category fallback in the primary review scene;
- grounded centers and envelopes satisfy Task 4.

- [ ] **Step 5: Compare color and grayscale readability**

For the review fixture:

- inspect normal screenshot;
- create a grayscale copy outside the repository;
- confirm gap geometry, fracture edge value, stripes, and depth lines remain visible;
- confirm ship, static structure, and hostile mobile silhouette remain separable.

- [ ] **Step 6: Reconfirm Git boundary**

Run:

```bash
git status --short --branch
git rev-parse HEAD origin/feat/stellar-command-polish
git rev-list --left-right --count HEAD...origin/feat/stellar-command-polish
```

Expected: no local commit or push; HEAD and origin remain `c92e4ff` with `0 0` commit difference.

- [ ] **Step 7: Send preview evidence for user acceptance**

Send the unchanged playable URL, representative screenshots, exact test counts, known Linux/macOS boundary, and explicit confirmation that there is no commit or push.

Do not prepare a commit or push until the user accepts this deployed visual pass.

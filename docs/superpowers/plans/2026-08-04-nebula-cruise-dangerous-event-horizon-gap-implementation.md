# Nebula Cruise Dangerous Event Horizon Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tiled purple gap graphics with one deterministic dangerous event horizon per connected missing-road region while preserving exact projection, collision, bridges, and track generation.

**Architecture:** Add a small pure `gap-regions` module that groups visible four-neighbor `GAP` cells and classifies exposed edges. Keep topology out of the large game renderer; `src/game.js` consumes immutable region descriptors, projects the original cell quadrilaterals, clips one Canvas event horizon to their exact union, and draws hazard cues only on exposed boundaries.

**Tech Stack:** Classic browser JavaScript, CommonJS-compatible pure modules, Canvas 2D, Node.js built-in test runner, static Python HTTP preview, Chromium DevTools Protocol.

## Global Constraints

- Use only the public target GitHub repository and public open-source references; do not use internal repositories, documents, packages, services, or data.
- Preserve `LANE_TYPE.GAP`, `GAP_SAFE_HEIGHT`, track generation, bridge generation, physics, collision, jumping, gliding, speed, scoring, and difficulty.
- Keep the existing `project()` output and exact projected cell quadrilaterals authoritative.
- Use four-neighbor topology only; diagonal contact does not connect regions.
- Draw one black core per connected visible region, not one per cell.
- Keep red-orange warning dashes on player-facing exposed edges and cold fracture light on exposed side edges.
- Remove the old interior grid, five purple depth lines, per-cell embers, and runtime `gapEdge` atlas drawing.
- Keep the committed `gap-edge` asset and manifest entry in this pass for compatibility and provenance.
- Use deterministic animation derived from `visualAnimationTime()` and region ID; render-time `Math.random()` is forbidden.
- Reduced motion freezes decoration but preserves the exact missing-road mask, black core, incomplete rings, fracture edges, and warning dashes.
- Add no runtime dependency and no external visual asset.
- Keep the current development preview URL unchanged.
- Do not create a git commit or run `git push`; local checkpoints replace the normal commit steps until the user explicitly authorizes final integration.

---

## File Map

- Create `src/gap-regions.js`
  - Pure four-neighbor region collection.
  - Deterministic IDs and ordering.
  - Immutable cells and exposed-edge descriptors.
  - Browser namespace plus CommonJS export.
- Create `tests/gap-regions.test.js`
  - Direct tests for isolated, horizontal, longitudinal, full-width, bridge, L-shaped, diagonal, invalid, and deterministic topology.
- Modify `index.html`
  - Load `gap-regions.js` after `obstacles.js` and before `game.js`.
- Modify `src/scene-style.js`
  - Replace old gap grid tokens with event-horizon tokens.
- Modify `tools/recolor-semantic-assets.js`
  - Read the existing gap accent from `warningPrimary`; the literal color remains `#ff6b4d`, so committed semantic PNG bytes and hashes remain unchanged.
- Modify `tests/scene-style.test.js`
  - Lock semantic roles and measured warning contrast.
- Modify `src/game.js`
  - Collect visible regions once per frame.
  - Project exact cells.
  - Draw union-clipped well, one core, incomplete rings, filaments, and exposed hazard edges.
  - Stop drawing `gapEdge` atlas modules at runtime.
- Modify `tests/world-render.test.js`
  - Load the new module in the VM harness.
  - Record quadratic curves and line caps.
  - Lock exact masks, one-core grouping, exposed boundaries, deterministic motion, reduced motion, and atlas independence.
- Modify `tests/static-app.test.js`
  - Lock classic script ordering and diagnostics.
- Modify `tests/input.test.js`
  - Load the new module before `game.js` in the VM harness.
- Modify `tests/player-render.test.js`
  - Load the new module before `game.js` in the VM harness.
- Modify `tests/game-audio-ui.test.js`
  - Load the new module in every real-game harness and lock `scripts.gapRegions`.
- Modify `tests/app-wkwebview-smoke.sh`
  - Require the new diagnostic script flag.
- Modify `tests/app-resources-smoke.sh`
  - Require `src/gap-regions.js` in the app bundle.
- Modify `docs/superpowers/specs/2026-08-04-nebula-cruise-semantic-spectrum-gameplay-art-design.md`
  - Mark its old gap subsection as superseded by the event-horizon spec.
- Modify `docs/superpowers/plans/2026-08-04-nebula-cruise-semantic-spectrum-gameplay-art-implementation.md`
  - Mark old grid-oriented gap steps as superseded.
- Keep `assets/world/gap-edge.png`, `assets/world/semantic/gap-edge.png`, `tools/semantic-assets.json`, and `THIRD_PARTY_NOTICES.md` unchanged.

---

### Task 1: Pure Connected-Gap Topology

**Files:**
- Create: `src/gap-regions.js`
- Create: `tests/gap-regions.test.js`

**Interfaces:**
- Consumes:
  - `track`: array of segment records with `segment.lanes`.
  - `startIndex`: inclusive far visible segment.
  - `endIndex`: inclusive near visible segment.
  - `laneCount`: positive integer.
  - `gapType`: exact lane value, default `'GAP'`.
- Produces:
  - `collectGapRegions({ track, startIndex, endIndex, laneCount, gapType = 'GAP' })`.
  - Frozen array of frozen region records:

```js
{
  id: '10:0',
  cells: [{ segmentIndex: 10, laneIndex: 0 }],
  exposedEdges: [
    { segmentIndex: 10, laneIndex: 0, side: 'near' },
    { segmentIndex: 10, laneIndex: 0, side: 'far' },
    { segmentIndex: 10, laneIndex: 0, side: 'left' },
    { segmentIndex: 10, laneIndex: 0, side: 'right' },
  ],
  nearestSegment: 10,
  farthestSegment: 10,
  minimumLane: 0,
  maximumLane: 0,
}
```

- Region order: ascending `nearestSegment`, then ascending `minimumLane`.
- Cell order: ascending `segmentIndex`, then ascending `laneIndex`.
- Edge order within each cell: `near`, `far`, `left`, `right`.

- [ ] **Step 1: Write failing isolated and horizontal-region tests**

Add literal fixtures:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectGapRegions } = require('../src/gap-regions.js');

function trackFromRows(rows) {
  return rows.map((lanes, index) => ({ index, lanes }));
}

test('one isolated gap exposes all four cell edges', () => {
  const track = trackFromRows([
    ['ROAD', 'ROAD', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'ROAD', 'ROAD'],
  ]);
  const regions = collectGapRegions({
    track, startIndex: 2, endIndex: 0, laneCount: 3,
  });
  assert.deepEqual(regions, [{
    id: '1:1',
    cells: [{ segmentIndex: 1, laneIndex: 1 }],
    exposedEdges: [
      { segmentIndex: 1, laneIndex: 1, side: 'near' },
      { segmentIndex: 1, laneIndex: 1, side: 'far' },
      { segmentIndex: 1, laneIndex: 1, side: 'left' },
      { segmentIndex: 1, laneIndex: 1, side: 'right' },
    ],
    nearestSegment: 1,
    farthestSegment: 1,
    minimumLane: 1,
    maximumLane: 1,
  }]);
});

test('adjacent horizontal gaps form one region without their internal edge', () => {
  const track = trackFromRows([
    ['ROAD', 'ROAD', 'ROAD', 'ROAD'],
    ['ROAD', 'GAP', 'GAP', 'ROAD'],
  ]);
  const [region] = collectGapRegions({
    track, startIndex: 1, endIndex: 0, laneCount: 4,
  });
  assert.deepEqual(region.cells, [
    { segmentIndex: 1, laneIndex: 1 },
    { segmentIndex: 1, laneIndex: 2 },
  ]);
  assert.equal(region.exposedEdges.some((edge) => (
    edge.segmentIndex === 1 && edge.laneIndex === 1 && edge.side === 'right'
  )), false);
  assert.equal(region.exposedEdges.some((edge) => (
    edge.segmentIndex === 1 && edge.laneIndex === 2 && edge.side === 'left'
  )), false);
});
```

- [ ] **Step 2: Run topology tests and verify RED**

Run:

```bash
node --test tests/gap-regions.test.js
```

Expected: fail with `Cannot find module '../src/gap-regions.js'`.

- [ ] **Step 3: Implement the minimal module shell and flood fill**

Create a classic-script/CommonJS wrapper:

```js
'use strict';

(function attachGapRegions(root) {
  const SIDE_ORDER = Object.freeze(['near', 'far', 'left', 'right']);
  const DELTAS = Object.freeze({
    near: Object.freeze([-1, 0]),
    far: Object.freeze([1, 0]),
    left: Object.freeze([0, -1]),
    right: Object.freeze([0, 1]),
  });

  function collectGapRegions({
    track,
    startIndex,
    endIndex,
    laneCount,
    gapType = 'GAP',
  } = {}) {
    // Validate, collect visible GAP keys, flood-fill four-neighbor cells,
    // classify exposed edges against the complete track, sort, and freeze.
  }

  const api = Object.freeze({ collectGapRegions });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.gapRegions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
```

Implementation requirements:

- normalize the segment range with `near = Math.max(0, Math.min(startIndex, endIndex))` and `far = Math.min(track.length - 1, Math.max(startIndex, endIndex))`;
- return a frozen empty array for malformed track/range/laneCount inputs;
- accept only lane indices `0 <= laneIndex < laneCount`;
- use `Set` keys in the form `${segmentIndex}:${laneIndex}`;
- flood fill only keys inside the visible normalized range;
- classify an edge as internal when the complete `track` has a same-type neighbor, even if that neighbor is just outside the visible range;
- derive `id` from the first sorted cell;
- recursively freeze regions, cells, edges, and the outer array.

- [ ] **Step 4: Run isolated and horizontal tests and verify GREEN**

Run:

```bash
node --test tests/gap-regions.test.js
```

Expected: both tests pass.

- [ ] **Step 5: Add failing longitudinal, full-width, bridge, L-shape, diagonal, and invalid-input tests**

Add literal assertions:

```js
test('three longitudinal cells form one region with only end caps exposed', () => {
  const track = trackFromRows([
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
  ]);
  const [region] = collectGapRegions({
    track, startIndex: 2, endIndex: 0, laneCount: 3,
  });
  assert.equal(region.cells.length, 3);
  assert.equal(region.exposedEdges.filter((edge) => edge.side === 'near').length, 1);
  assert.equal(region.exposedEdges.filter((edge) => edge.side === 'far').length, 1);
});

test('a seven-lane three-segment full gap is one region', () => {
  const track = trackFromRows(Array.from(
    { length: 3 },
    () => Array(7).fill('GAP'),
  ));
  const regions = collectGapRegions({
    track, startIndex: 2, endIndex: 0, laneCount: 7,
  });
  assert.equal(regions.length, 1);
  assert.equal(regions[0].cells.length, 21);
});

test('a surviving bridge lane separates left and right gap regions', () => {
  const track = trackFromRows([
    ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
    ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
  ]);
  const regions = collectGapRegions({
    track, startIndex: 1, endIndex: 0, laneCount: 7,
  });
  assert.deepEqual(regions.map((region) => (
    [region.minimumLane, region.maximumLane, region.cells.length]
  )), [[0, 2, 6], [4, 6, 6]]);
});

test('an L shape connects while diagonal-only contact does not', () => {
  const lShape = collectGapRegions({
    track: trackFromRows([
      ['GAP', 'ROAD', 'ROAD'],
      ['GAP', 'GAP', 'ROAD'],
    ]),
    startIndex: 1, endIndex: 0, laneCount: 3,
  });
  assert.equal(lShape.length, 1);
  assert.equal(lShape[0].cells.length, 3);

  const diagonal = collectGapRegions({
    track: trackFromRows([
      ['GAP', 'ROAD'],
      ['ROAD', 'GAP'],
    ]),
    startIndex: 1, endIndex: 0, laneCount: 2,
  });
  assert.deepEqual(diagonal.map((region) => region.id), ['0:0', '1:1']);
});

test('output is deeply frozen deterministic and safe for malformed input', () => {
  assert.deepEqual(collectGapRegions(), []);
  assert.deepEqual(collectGapRegions({
    track: [], startIndex: 0, endIndex: 0, laneCount: 7,
  }), []);
  const regions = collectGapRegions({
    track: trackFromRows([['GAP', 'ROAD', 'GAP']]),
    startIndex: 0, endIndex: 0, laneCount: 3,
  });
  assert.deepEqual(regions.map((region) => region.id), ['0:0', '0:2']);
  assert.equal(Object.isFrozen(regions), true);
  assert.equal(Object.isFrozen(regions[0]), true);
  assert.equal(Object.isFrozen(regions[0].cells[0]), true);
  assert.equal(Object.isFrozen(regions[0].exposedEdges[0]), true);
});
```

- [ ] **Step 6: Run topology tests and verify RED**

Run:

```bash
node --test tests/gap-regions.test.js
```

Expected: fail on at least the bridge, diagonal, or deep-freeze behavior until the complete contract is implemented.

- [ ] **Step 7: Complete sorting, boundary, and deep-freeze behavior**

Implement only the behavior required by the new tests. Keep traversal iterative with an array queue so large full-gap runs cannot overflow the call stack.

- [ ] **Step 8: Run topology tests and verify GREEN**

Run:

```bash
node --test tests/gap-regions.test.js
```

Expected: all topology tests pass with zero warnings.

- [ ] **Step 9: Record local checkpoint without committing**

Run:

```bash
git diff --check -- src/gap-regions.js tests/gap-regions.test.js
git status --short -- src/gap-regions.js tests/gap-regions.test.js
```

Expected: clean whitespace; both files remain uncommitted local changes.

---

### Task 2: Event-Horizon Scene Tokens and Static Resource Graph

**Files:**
- Modify: `src/scene-style.js`
- Modify: `tools/recolor-semantic-assets.js`
- Modify: `tests/scene-style.test.js`
- Modify: `index.html`
- Modify: `tests/static-app.test.js`
- Modify: `tests/input.test.js`
- Modify: `tests/player-render.test.js`
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/app-wkwebview-smoke.sh`
- Modify: `tests/app-resources-smoke.sh`

**Interfaces:**
- Consumes: Task 1 `Skyroads.gapRegions`.
- Produces:
  - `SCENE_STYLE.gap`:

```js
{
  well: '#03040a',
  core: '#000005',
  innerRing: '#5de8ff',
  middleRing: '#6091ff',
  fringe: '#a05dff',
  sideFracture: '93,232,255',
  warningPrimary: '#ff6b4d',
  warningSecondary: '#ffb24c',
}
```

  - Script order: `obstacles.js` → `gap-regions.js` → `audio.js` → `game.js`.
  - Diagnostics: `Skyroads.diagnostics.snapshot().scripts.gapRegions === true`.

- [ ] **Step 1: Write failing scene-token and script-order tests**

In `tests/scene-style.test.js`, replace the old gap assertions with:

```js
test('event horizon tokens keep warning contrast and separate decorative rings', () => {
  assert.deepEqual(SCENE_STYLE.gap, {
    well: '#03040a',
    core: '#000005',
    innerRing: '#5de8ff',
    middleRing: '#6091ff',
    fringe: '#a05dff',
    sideFracture: '93,232,255',
    warningPrimary: '#ff6b4d',
    warningSecondary: '#ffb24c',
  });
  for (const warning of [
    SCENE_STYLE.gap.warningPrimary,
    SCENE_STYLE.gap.warningSecondary,
  ]) {
    assert.ok(contrastRatio(warning, SCENE_STYLE.road.deckA) >= 4.5);
    assert.ok(contrastRatio(warning, SCENE_STYLE.road.deckB) >= 4.5);
  }
  assert.notEqual(SCENE_STYLE.gap.innerRing, SCENE_STYLE.player.identity);
  assert.notEqual(SCENE_STYLE.gap.fringe, SCENE_STYLE.hostile.signal);
});
```

In `tests/static-app.test.js`, add:

```js
test('gap topology loads after obstacle vocabulary and before the game', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)]
    .map((match) => match[1]);
  const obstaclesIndex = scripts.indexOf('./src/obstacles.js');
  const gapRegionsIndex = scripts.indexOf('./src/gap-regions.js');
  const gameIndex = scripts.indexOf('./src/game.js');
  assert.ok(gapRegionsIndex > obstaclesIndex);
  assert.ok(gapRegionsIndex < gameIndex);
});
```

Extend real-game diagnostics expectations in `tests/game-audio-ui.test.js`:

```js
assert.equal(diagnostics.scripts.gapRegions, true);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test \
  tests/scene-style.test.js \
  tests/static-app.test.js \
  tests/game-audio-ui.test.js
```

Expected: fail because the new tokens, script tag, harness loading, and diagnostic flag do not exist.

- [ ] **Step 3: Add the production script and tokens**

Update `index.html`:

```html
<script defer src="./src/obstacles.js"></script>
<script defer src="./src/gap-regions.js"></script>
<script defer src="./src/audio.js"></script>
<script defer src="./src/game.js"></script>
```

Replace `SCENE_STYLE.gap` with the exact object above.

Update the `sceneStyle()` fallback in `src/game.js` with the same exact tokens so a missing style module cannot restore the retired grid palette.

In `tools/recolor-semantic-assets.js`, preserve the same output color while migrating the token name:

```js
if (profile === 'gap') return rgb(SCENE_STYLE.gap.warningPrimary);
```

Do not regenerate or replace any PNG in this task. The literal accent remains `#ff6b4d`, and the existing semantic asset tests must prove every output hash remains unchanged.

Add to `installDiagnostics()`:

```js
gapRegions: Boolean(globalThis.Skyroads.gapRegions),
```

- [ ] **Step 4: Load the module in every VM harness**

Insert `src/gap-regions.js` after `src/obstacles.js` and before evaluation of `src/game.js` in:

- `tests/world-render.test.js`;
- `tests/input.test.js`;
- `tests/player-render.test.js`;
- all `tests/game-audio-ui.test.js` source lists that execute `game.js`;
- `tests/static-app.test.js` startup harness lists.

Do not add a fake topology object. Execute the real module.

- [ ] **Step 5: Extend packaging smoke contracts**

Add `src/gap-regions.js` to `required` in `tests/app-resources-smoke.sh`.

Add `gapRegions` to the required diagnostic script list in `tests/app-wkwebview-smoke.sh`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test \
  tests/gap-regions.test.js \
  tests/scene-style.test.js \
  tests/static-app.test.js \
  tests/input.test.js \
  tests/player-render.test.js \
  tests/game-audio-ui.test.js
```

Expected: all focused tests pass.

- [ ] **Step 7: Record local checkpoint without committing**

Run:

```bash
npm run check
git diff --check -- \
  src/gap-regions.js \
  src/scene-style.js \
  src/game.js \
  tools/recolor-semantic-assets.js \
  index.html \
  tests/gap-regions.test.js \
  tests/scene-style.test.js \
  tests/static-app.test.js \
  tests/input.test.js \
  tests/player-render.test.js \
  tests/game-audio-ui.test.js \
  tests/app-wkwebview-smoke.sh \
  tests/app-resources-smoke.sh
```

Expected: syntax and whitespace checks pass; no commit is created.

---

### Task 3: Real Canvas Event-Horizon Rendering

**Files:**
- Modify: `tests/world-render.test.js`
- Modify: `src/game.js`

**Interfaces:**
- Consumes:
  - `Skyroads.gapRegions.collectGapRegions(...)`.
  - Task 2 event-horizon tokens.
  - Existing `project()`, `zRelOf()`, `quad()`, `visualAnimationTime()`, and `STATE.reducedMotion`.
- Produces:
  - `projectGapCell(segmentIndex, laneIndex)`.
  - `projectGapRegion(region)`.
  - `drawEventHorizonRegion(ctx, projectedRegion)`.
  - `drawEventHorizonBoundaries(ctx, projectedRegion)`.
  - Region draw result:

```js
{
  id,
  visibleCells,
  bounds: { minX, minY, maxX, maxY, width, height },
  center: { x, y },
  phase,
}
```

- [ ] **Step 1: Upgrade the recording Canvas harness**

In `makeRecordingContext()`:

- save and restore `lineCap`;
- add `quadraticCurveTo(...args)` to `currentPath`;
- make gradient objects record color stops and gradient kind:

```js
function gradient(kind, args) {
  const stops = [];
  return {
    kind,
    args,
    stops,
    addColorStop(offset, color) { stops.push([offset, color]); },
  };
}
```

When recording `fill` and `stroke`, retain a serializable style summary:

```js
function recordedStyle(style) {
  if (!style || typeof style !== 'object') return style;
  return {
    kind: style.kind,
    args: [...style.args],
    stops: style.stops.map((stop) => [...stop]),
  };
}
```

This records real renderer behavior rather than grepping implementation text.

- [ ] **Step 2: Replace old gap tests with failing connected-region behavior tests**

Keep collision/generation tests unchanged. Replace tests that require `gapEdge` draw calls, diagonal stripes, purple depth lines, and module overlap.

Add a fixture that accepts explicit rows:

```js
function renderGapRows(harness, rows, {
  position = 0,
  time = 1,
  reduced = false,
} = {}) {
  harness.context.events.length = 0;
  harness.sandbox.__gapRows = rows;
  return JSON.parse(vm.runInContext(`JSON.stringify((() => {
    STATE.position = ${position};
    STATE.time = ${time};
    STATE.reducedMotion = ${reduced};
    STATE.track = __gapRows.map((lanes, index) => ({ index, lanes }));
    renderTrack(__ctx);
    return globalThis.__lastGapRenderDiagnostics || [];
  })())`, harness.sandbox));
}
```

Production may expose `__lastGapRenderDiagnostics` only as a lexical variable read through a pure diagnostic helper already used by tests; do not attach a test-only API to `Skyroads`. Prefer returning descriptors from `renderGapRegions()` and calling that real function in the VM.

Add tests:

```js
test('one connected gap region emits one exact union clip and one black core', () => {
  const harness = createHarness();
  renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'GAP', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
    ['ROAD', 'GAP', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ], { reduced: true });
  const clips = harness.context.events.filter((event) => event.type === 'clip');
  const cores = harness.context.events.filter((event) => (
    event.type === 'fill'
      && event.style === '#000005'
      && event.path.some((part) => part[0] === 'ellipse')
  ));
  assert.equal(clips.length, 1);
  assert.equal(cores.length, 1);
  assert.equal(imageCalls(harness.context.events)
    .filter((event) => event.image === 'gapEdge').length, 0);
});

test('event horizon removes retired grid depth lines embers and atlas modules', () => {
  const harness = createHarness();
  renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'ROAD', 'ROAD', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ]);
  assert.equal(harness.context.events.some((event) => (
    event.type === 'stroke'
      && event.style === 'rgba(255,159,59,0.480)'
  )), false);
  assert.equal(harness.context.events.some((event) => (
    event.type === 'stroke'
      && event.style === 'rgba(212,78,255,0.720)'
  )), false);
  assert.equal(imageCalls(harness.context.events)
    .filter((event) => event.image === 'gapEdge').length, 0);
});
```

- [ ] **Step 3: Add failing boundary-hierarchy tests**

For a two-cell horizontal gap:

- assert no line exactly follows their shared internal boundary;
- assert near boundary strokes use both `#ff6b4d` and `#ffb24c`;
- assert exposed side edges use `rgba(93,232,255,0.600)`;
- assert far edge alpha is below side-edge alpha;
- assert `lineCap === 'round'` for warning dashes.

For a two-segment bridge fixture:

```js
[
  ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
  ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
]
```

assert:

- exactly two clip events;
- exactly two black-core ellipse fills;
- no recorded path crosses the projected bridge quadrilateral;
- no internal edge is stroked.

- [ ] **Step 4: Add failing motion and asset-independence tests**

Render the same region at:

- `time = 1`, normal motion;
- `time = 2`, normal motion;
- `time = 1`, reduced motion;
- `time = 2`, reduced motion.

Extract ellipse start/end angles and quadratic filament paths.

Assert:

- normal-motion decorative paths differ;
- reduced-motion decorative paths are deeply equal;
- warning paths are deeply equal in every case;
- render-time `Math.random()` call count is zero.

Create loaded and `missing: ['gapEdge']` harnesses and assert equivalent clips, black cores, warning strokes, and fracture strokes.

- [ ] **Step 5: Run world-render tests and verify RED**

Run:

```bash
node --test tests/world-render.test.js
```

Expected: fail because rendering remains per-cell, still draws grid/depth/embers/atlas modules, and does not group regions.

- [ ] **Step 6: Implement exact projected-region descriptors**

Add pure projection helpers in `src/game.js`:

```js
function projectGapCell(segmentIndex, laneIndex) {
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const xLeft = -halfRoad + laneIndex * laneWidth;
  const xRight = xLeft + laneWidth;
  const zNear = zRelOf(segmentIndex);
  const zFar = zRelOf(segmentIndex + 1);
  return Object.freeze({
    segmentIndex,
    laneIndex,
    nearLeft: project(xLeft, 0, zNear),
    nearRight: project(xRight, 0, zNear),
    farLeft: project(xLeft, 0, zFar),
    farRight: project(xRight, 0, zFar),
  });
}
```

`projectGapRegion(region)`:

- projects every region cell;
- retains only cells with a visible far edge and a usable near edge;
- computes union bounds from all visible corner points;
- maps `region.exposedEdges` to projected endpoint pairs;
- returns `null` when no projected cell is visible;
- uses the region ID for deterministic phase.

- [ ] **Step 7: Restructure the first render pass**

At the start of `renderTrack`:

```js
const gapApi = globalThis.Skyroads && globalThis.Skyroads.gapRegions;
const gapRegions = gapApi && typeof gapApi.collectGapRegions === 'function'
  ? gapApi.collectGapRegions({
      track,
      startIndex: startIdx,
      endIndex: endIdx,
      laneCount: CONFIG.LANES,
      gapType: LANE_TYPE.GAP,
    })
  : Object.freeze([]);
```

During the road loop:

- `continue` for `GAP` cells without drawing them;
- keep ordinary deck fills and lane seams for non-gap cells;
- retain existing cross-road line behavior.

After the road loop and before the obstacle pass:

```js
for (const region of gapRegions) {
  const projected = projectGapRegion(region);
  if (projected) drawEventHorizonRegion(ctx, projected);
}
```

Because regions draw after road lines, the exact union well covers any full-width cross-road line that would otherwise cross missing road.

- [ ] **Step 8: Implement one exact union clip and near-black well**

Build one Canvas path containing one quadrilateral subpath per visible cell, then call `clip()` once.

Inside the clip:

- fill each exact cell quadrilateral with `style.well`;
- compute projected region center from bounds;
- draw one black core ellipse with `style.core`;
- keep every effect clipped to the union.

Do not call `drawTessellatedGapEdges`.

- [ ] **Step 9: Implement incomplete rings and deterministic filaments**

Compute a stable numeric phase from `region.id`:

```js
function stableGapPhase(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
```

Use:

```js
const motionTime = STATE.reducedMotion ? 0 : visualAnimationTime();
const phase = stableGapPhase(projected.id);
```

Draw:

- inner cyan incomplete ellipse arc;
- middle blue incomplete ellipse arc;
- outer violet incomplete ellipse arc;
- at most five quadratic filaments from deterministic boundary fractions toward the core.

No arc uses `0` to `2 * Math.PI`. Start/end angles differ by less than `1.75 * Math.PI`.

- [ ] **Step 10: Implement exposed-edge hierarchy**

For every projected exposed edge:

- `near`: draw alternating `warningPrimary` and `warningSecondary` rounded dashes covering at most 55% of edge length;
- `left` or `right`: draw `rgba(${style.sideFracture},0.600)`;
- `far`: draw `rgba(${style.sideFracture},0.260)`;
- internal edges never appear in the descriptor and therefore never draw.

Derive dash count from edge CSS length with a bounded target spacing; do not consume randomness.

- [ ] **Step 11: Run world-render tests and verify GREEN**

Run:

```bash
node --test tests/world-render.test.js
```

Expected: all world-render tests pass.

- [ ] **Step 12: Run focused gameplay regressions**

Run:

```bash
node --test \
  tests/gap-regions.test.js \
  tests/scene-style.test.js \
  tests/world-render.test.js \
  tests/obstacles.test.js \
  tests/input.test.js \
  tests/player-render.test.js \
  tests/game-audio-ui.test.js
```

Expected: all tests pass; gap generation, bridge support, collision, and unrelated rendering remain green.

- [ ] **Step 13: Record local checkpoint without committing**

Run:

```bash
npm run check
git diff --check
git status --short
git rev-list --left-right --count HEAD...origin/feat/stellar-command-polish
```

Expected: checks pass, working tree remains intentionally modified, commit delta remains `0 0`.

---

### Task 4: Supersession Documentation and Full Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-nebula-cruise-semantic-spectrum-gameplay-art-design.md`
- Modify: `docs/superpowers/plans/2026-08-04-nebula-cruise-semantic-spectrum-gameplay-art-implementation.md`
- Create outside Git: `/tmp/skyroads-event-horizon-960x600.png`
- Create outside Git: `/tmp/skyroads-event-horizon-1280x800.png`
- Create outside Git: `/tmp/skyroads-event-horizon-1920x1080.png`
- Create outside Git: `/tmp/skyroads-event-horizon-1982x768.png`
- Create outside Git: `/tmp/skyroads-event-horizon-gray.png`
- Create outside Git: `/tmp/skyroads-event-horizon-verification.json`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: fresh automated evidence, real-browser screenshots, and the unchanged playable URL.

- [ ] **Step 1: Mark retired gap sections as superseded**

At the start of the old gap subsection in both semantic-spectrum documents, add:

```markdown
> Superseded for gap rendering by
> `2026-08-04-nebula-cruise-dangerous-event-horizon-gap-design.md`.
> The player, structure, hostile, road, HUD, and asset-recoloring sections remain active.
```

Do not delete the historical design record.

- [ ] **Step 2: Run the complete Linux platform-independent suite**

Run:

```bash
npm run check
node --test \
  tests/audio.test.js \
  tests/game-audio-ui.test.js \
  tests/gap-regions.test.js \
  tests/i18n.test.js \
  tests/input.test.js \
  tests/leaderboard.test.js \
  tests/music-generator.test.js \
  tests/obstacles.test.js \
  tests/player-render.test.js \
  tests/png-rgba.test.js \
  tests/presentation.test.js \
  tests/release-contracts.test.js \
  tests/scene-style.test.js \
  tests/semantic-assets.test.js \
  tests/static-app.test.js \
  tests/world-art.test.js \
  tests/world-render.test.js
git diff --check
```

Expected: zero failures. Do not claim macOS-only SceneKit, `sips`, `afinfo`, WKWebView, universal-binary, or signature checks passed on Linux.

- [ ] **Step 3: Verify the served workspace**

For:

- `index.html`;
- `src/gap-regions.js`;
- `src/scene-style.js`;
- `src/game.js`;

run:

```bash
test "$(sha256sum "$file" | awk '{print $1}')" = \
  "$(curl -fsS "<preview-url>/$file" | sha256sum | awk '{print $1}')"
```

Expected: every file is byte-identical between the workspace and preview service.

- [ ] **Step 4: Capture deterministic real-browser fixtures**

Use Chromium DevTools Protocol and real game functions to capture:

- isolated center gap;
- adjacent multi-lane gap;
- L-shaped gap;
- two-sided narrow bridge;
- full seven-lane gap;
- three-segment longitudinal run;
- normal motion;
- reduced motion.

At each fixture:

- set explicit `STATE.track`, `STATE.position`, `STATE.time`, and `STATE.reducedMotion`;
- render with `renderBackground`, `renderTrack`, `renderSideDecor`, `renderPlayer`, and `renderHUD`;
- do not hand-place the gap in screen coordinates;
- record the exact region/cell counts and projected corners;
- record diagnostics and browser errors.

- [ ] **Step 5: Capture target viewports**

Capture:

```text
/tmp/skyroads-event-horizon-960x600.png
/tmp/skyroads-event-horizon-1280x800.png
/tmp/skyroads-event-horizon-1920x1080.png
/tmp/skyroads-event-horizon-1982x768.png
```

Expected:

- one connected region shows one core;
- bridge road remains intact;
- warning dashes remain visible;
- no grid or repeated atlas modules appear;
- HUD and player remain unobscured.

- [ ] **Step 6: Verify grayscale readability**

Create `/tmp/skyroads-event-horizon-gray.png` from the 1280×800 capture with the repository PNG codec or another already-installed public tool.

Inspect:

- missing-road silhouette;
- black core;
- near warning dash value;
- side fracture value;
- bridge separation.

Expected: all remain readable without saturation.

- [ ] **Step 7: Verify browser and topology evidence**

Write `/tmp/skyroads-event-horizon-verification.json` containing:

```json
{
  "loadedWorld": 13,
  "fallback": [],
  "browserErrors": [],
  "fixtures": {
    "isolated": { "regions": 1, "cores": 1 },
    "adjacent": { "regions": 1, "cores": 1 },
    "bridge": { "regions": 2, "cores": 2 },
    "fullGap": { "regions": 1, "cores": 1 },
    "longitudinal": { "regions": 1, "cores": 1 }
  },
  "renderRandomCalls": 0
}
```

Use values observed from the real page; do not hard-code a passing report independently of execution.

- [ ] **Step 8: Reconfirm Git and public-source boundaries**

Run:

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/feat/stellar-command-polish
git rev-list --left-right --count HEAD...origin/feat/stellar-command-polish
git diff -- . ':!assets/**/*.png' | \
  rg -n -i -f /tmp/private-source-markers.txt || true
```

Expected:

- HEAD and origin remain `c92e4ff03ea9dd3fe290caf6e0a40c492870a4b3`;
- commit delta remains `0 0`;
- no internal source marker appears;
- no commit or push has occurred.

- [ ] **Step 9: Send the deployed result for user acceptance**

Send:

- the current development preview URL;
- the 1280×800 and wide screenshots;
- the grayscale screenshot if useful;
- exact test counts;
- browser diagnostics;
- the known Linux/macOS verification boundary;
- explicit confirmation of no commit and no push.

Wait for user visual approval before preparing the final commit or updating PR #1.

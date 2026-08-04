# Nebula Cruise Heavy Swarm Drone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primary drone presentation with the approved C Heavy Swarm family while preserving every current drone gameplay and warning contract.

**Architecture:** Add one pure classic/CommonJS visual-descriptor module and keep Canvas rendering in `src/game.js`. The descriptor owns normalized Scout/Striker geometry and material roles; the renderer maps that geometry into the existing projected `432 × 360` world envelope and falls back to the existing semantic atlases, then to the existing procedural drone, if the new module is absent or invalid.

**Tech Stack:** Plain classic JavaScript, CommonJS test exports, HTML5 Canvas 2D, Node `node:test`, Chromium DevTools Protocol, existing zero-dependency PNG tooling.

## Global Constraints

- Work in the existing feature checkout because its uncommitted visual-polish state is the preview baseline approved by the user.
- Remain on `feat/stellar-command-polish`.
- Do not commit, push, update PR #1, merge, tag, or release before user acceptance.
- Use only the public target repository and public open-source assets already documented by it.
- Add no external runtime asset, package, service, image, model, texture, or audio.
- Keep `DRONE_HEIGHT = 500`.
- Keep `HITBOX.droneHalfWidth = 0.22`.
- Keep `DRONE_WARN_TIME = 0.6`.
- Keep `DRONE_MOVE_TIME = 0.4`.
- Keep the existing white direction chevron, red projected target-lane ring, bank direction, bob, shadow, deterministic variant selection, collision, spawning, scoring, and destruction logic.
- Keep existing semantic drone atlases packaged and preloaded as the first visual fallback.
- Keep the existing procedural drone as the final visual fallback.
- Do not change turret colors or renderer behavior.
- Do not claim macOS SceneKit, `sips`, `afinfo`, WKWebView, universal-binary, or signature verification from Linux.

---

## File Structure

- Create `src/drone-visual.js` — pure normalized Heavy Swarm descriptors, validation, deep-freeze, and CommonJS/browser export.
- Create `tests/drone-visual.test.js` — pure descriptor and invariant tests.
- Modify `src/scene-style.js` — nested `SCENE_STYLE.hostile.drone` tokens only.
- Modify `tests/scene-style.test.js` — exact drone-token and contrast/value-separation contracts.
- Modify `src/game.js` — Heavy Swarm Canvas helper, primary/fallback selection, diagnostic flag.
- Modify `tests/world-render.test.js` — primary renderer, fallback chain, cue, bounds, and gameplay-invariant assertions.
- Modify `index.html` — load `src/drone-visual.js` before `src/game.js`.
- Modify `tests/static-app.test.js` — script graph and ordering.
- Modify `tests/game-audio-ui.test.js` — diagnostic script flag.
- Modify `tests/app-resources-smoke.sh` — packaged resource list.
- Modify `tests/app-wkwebview-smoke.sh` — packaged classic-script diagnostic.
- Create `/tmp/skyroads-heavy-swarm-*.png` — real-browser acceptance images outside Git.
- Create `/tmp/skyroads-heavy-swarm-verification.json` — observed browser evidence outside Git.

---

### Task 1: Pure Heavy Swarm Descriptor

**Files:**
- Create: `src/drone-visual.js`
- Create: `tests/drone-visual.test.js`

**Interfaces:**
- Consumes: `variant`, `state`, `direction`, `warningPulse`, and `reducedMotion`.
- Produces:

```text
heavySwarmDroneDescriptor(options) -> deeply frozen descriptor
isHeavySwarmDroneDescriptor(value) -> boolean
```

Descriptor shape:

```text
{
  family: "heavy-swarm",
  variant: "scout" | "striker",
  state: "rest" | "warn" | "move",
  direction: -1 | 0 | 1,
  warningPulse: 0...1,
  reducedMotion: boolean,
  bounds: { minX, minY, maxX, maxY },
  layers: [
    {
      kind: "polygon" | "path" | "circle",
      role: "armorShadow" | "armorMid" | "armorHighlight" |
            "podRecess" | "energy" | "core" | "warningLight",
      ...
    }
  ]
}
```

- [ ] **Step 1: Write failing descriptor tests**

Create `tests/drone-visual.test.js` with assertions that:

```js
const {
  heavySwarmDroneDescriptor,
  isHeavySwarmDroneDescriptor,
} = require('../src/drone-visual.js');

const scout = heavySwarmDroneDescriptor({ variant: 'droneScout' });
const striker = heavySwarmDroneDescriptor({ variant: 'droneStriker' });

assert.equal(scout.family, 'heavy-swarm');
assert.equal(scout.variant, 'scout');
assert.equal(striker.variant, 'striker');
assert.notDeepEqual(scout.layers, striker.layers);
assert.deepEqual(scout.bounds, { minX: -1, minY: -1, maxX: 1, maxY: 1 });
assert.equal(isHeavySwarmDroneDescriptor(scout), true);
```

Also assert:

- recursive freezing;
- every point and circle stays within `[-1, 1]`;
- both variants contain all required material roles;
- no role or literal color contains a light-pink body material;
- malformed input returns a safe Scout/rest/zero-direction descriptor;
- warning direction clamps to `-1`, `0`, or `1`;
- warning pulse clamps to `0...1`;
- reduced-motion warning uses a frozen static pulse.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/drone-visual.test.js
```

Expected: fail because `src/drone-visual.js` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Implement `src/drone-visual.js` as a classic-script IIFE matching the repository pattern:

```js
'use strict';

(function attachDroneVisual(root) {
  // normalize input
  // create fresh Scout or Striker layers
  // deep-freeze result
  // validate normalized bounds
  const api = Object.freeze({
    heavySwarmDroneDescriptor,
    isHeavySwarmDroneDescriptor,
  });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.droneVisual = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
```

Normalized geometry must encode the approved C family:

- central faceted body;
- two suspended pods;
- two attack prongs;
- central core;
- two warning lights;
- Scout with smaller pods/core and more negative space;
- Striker with thicker armor, wider pods, longer prongs, and apertures.

Use role names only; do not embed runtime colors.

- [ ] **Step 4: Run descriptor tests and verify GREEN**

Run:

```bash
node --test tests/drone-visual.test.js
node --check src/drone-visual.js
```

Expected: all descriptor tests pass and syntax check exits zero.

---

### Task 2: Drone Palette and Primary Canvas Renderer

**Files:**
- Modify: `src/scene-style.js`
- Modify: `tests/scene-style.test.js`
- Modify: `src/game.js`
- Modify: `tests/world-render.test.js`

**Interfaces:**
- Consumes: `Skyroads.droneVisual.heavySwarmDroneDescriptor(...)`.
- Produces:

```text
drawHeavySwarmDrone(ctx, enemy, placement) -> null | {
  bounds: { x, y, width, height },
  source: "heavy-swarm",
  variant: "scout" | "striker"
}
```

The caller uses the returned bounds for `drawDroneDirectionCues`.

- [ ] **Step 1: Write failing scene-style tests**

Extend `tests/scene-style.test.js` to require:

```js
assert.deepEqual(SCENE_STYLE.hostile.drone, {
  armorShadow: '#070a10',
  armorMid: '#171d26',
  armorHighlight: '#8f9baa',
  podRecess: '#0b0f16',
  energy: '#c70f48',
  core: '#ff315f',
  warningLight: '#ff3b4f',
});
```

Assert existing flat hostile tokens remain exact and unchanged. Assert drone
core/energy differ from player identity, structure signal, gap warnings, upper
background, and horizon background. Assert the nested object is frozen.

- [ ] **Step 2: Run scene-style test and verify RED**

Run:

```bash
node --test tests/scene-style.test.js
```

Expected: fail because `SCENE_STYLE.hostile.drone` is missing.

- [ ] **Step 3: Add the nested drone palette**

Add only the exact nested `hostile.drone` object to `src/scene-style.js`.
Do not change existing turret/procedural hostile tokens.

- [ ] **Step 4: Run scene-style test and verify GREEN**

Run:

```bash
node --test tests/scene-style.test.js
```

Expected: all scene-style tests pass.

- [ ] **Step 5: Write failing renderer tests**

Extend `tests/world-render.test.js` with a harness that exposes
`Skyroads.droneVisual`. Add assertions for:

1. loaded drone art no longer receives `drawImage` when a valid Heavy Swarm
   descriptor exists;
2. Scout and Striker produce different polygon/path events;
3. all Heavy Swarm draw events stay inside the existing projected
   `432 × 360` rectangle;
4. the returned cue bounds equal that conservative projected rectangle;
5. warning right/left retains the sign of the existing bank rotation;
6. white chevron `#fff4f7` and target ring `#ff4f63` still appear;
7. movement still reports lane `2.5`, height `500`, hitbox `0.22`, warn `0.6`,
   and move `0.4`;
8. reduced-motion renders are deterministic;
9. missing `Skyroads.droneVisual` calls the current atlas;
10. missing module plus missing atlas calls the existing procedural fallback.

- [ ] **Step 6: Run renderer patterns and verify RED**

Run:

```bash
node --test --test-name-pattern='Heavy Swarm|warn drones|moving drone|missing drone|reduced motion' tests/world-render.test.js
```

Expected: new Heavy Swarm assertions fail because the renderer does not use the
new module.

- [ ] **Step 7: Implement the Heavy Swarm Canvas helper**

In `src/game.js`:

- add a path helper mapping normalized points to the existing projected drone
  rectangle;
- add role-to-color resolution through `sceneStyle().hostile.drone`;
- draw armor polygons first, then pod recesses, energy seams, core, and warning
  lights;
- use deterministic core/warning opacity from existing animation time and
  reduced-motion policy;
- rotate around the existing bobbed projected origin;
- return the unchanged conservative world rectangle as cue bounds;
- never mutate the descriptor;
- never call `Math.random()`.

Change the drone branch of `drawEnemy()` to:

```text
draw shadow
try Heavy Swarm module
if unavailable/invalid: try existing atlas
if atlas unavailable: draw existing procedural fallback
draw independent direction cues from returned or fallback bounds
```

Map stable variants:

```text
droneScout  -> scout
droneStriker -> striker
```

- [ ] **Step 8: Run renderer tests and verify GREEN**

Run:

```bash
node --test tests/drone-visual.test.js tests/scene-style.test.js tests/world-render.test.js
node --check src/game.js
```

Expected: all tests pass.

---

### Task 3: Browser Script, Diagnostics, and Packaging Contracts

**Files:**
- Modify: `index.html`
- Modify: `tests/static-app.test.js`
- Modify: `src/game.js`
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/app-resources-smoke.sh`
- Modify: `tests/app-wkwebview-smoke.sh`

**Interfaces:**
- Produces: `Skyroads.droneVisual` before `src/game.js`.
- Produces: `Skyroads.diagnostics.snapshot().scripts.droneVisual`.

- [ ] **Step 1: Write failing static and diagnostic tests**

Require:

- `./src/drone-visual.js` appears after `./src/scene-style.js` and before
  `./src/game.js`;
- browser test harness loads `src/drone-visual.js`;
- diagnostics report `scripts.droneVisual === true`;
- packaged resource smoke includes `src/drone-visual.js`;
- WKWebView required script list includes `droneVisual`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test --test-name-pattern='drone|script|diagnostic' \
  tests/static-app.test.js tests/game-audio-ui.test.js
```

Expected: fail because the new script is not wired.

- [ ] **Step 3: Wire the classic script and diagnostic**

Add:

```html
<script defer src="./src/drone-visual.js"></script>
```

after `scene-style.js` and before `game.js`.

Add:

```js
droneVisual: Boolean(globalThis.Skyroads.droneVisual)
```

to diagnostic scripts.

Update both macOS smoke resource/script lists without changing their build or
runtime logic.

- [ ] **Step 4: Run static and diagnostic tests and verify GREEN**

Run:

```bash
node --test tests/static-app.test.js tests/game-audio-ui.test.js
bash -n tests/app-resources-smoke.sh
bash -n tests/app-wkwebview-smoke.sh
```

Expected: all Node tests and shell syntax checks pass.

---

### Task 4: Regression, Preview, and Real-Browser Acceptance

**Files:**
- Modify only if verification exposes a Heavy Swarm defect.
- Create outside Git:
  - `/tmp/skyroads-heavy-swarm-scout-rest.png`
  - `/tmp/skyroads-heavy-swarm-scout-warn-left.png`
  - `/tmp/skyroads-heavy-swarm-scout-warn-right.png`
  - `/tmp/skyroads-heavy-swarm-scout-move.png`
  - `/tmp/skyroads-heavy-swarm-striker-rest.png`
  - `/tmp/skyroads-heavy-swarm-striker-warn.png`
  - `/tmp/skyroads-heavy-swarm-outer-lane.png`
  - `/tmp/skyroads-heavy-swarm-reduced.png`
  - `/tmp/skyroads-heavy-swarm-atlas-fallback.png`
  - `/tmp/skyroads-heavy-swarm-comparison.png`
  - `/tmp/skyroads-heavy-swarm-gray.png`
  - `/tmp/skyroads-heavy-swarm-verification.json`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: deployed visual evidence and user-acceptance report.

- [ ] **Step 1: Run focused regression**

Run:

```bash
npm run check
node --test \
  tests/drone-visual.test.js \
  tests/scene-style.test.js \
  tests/world-render.test.js \
  tests/input.test.js \
  tests/static-app.test.js \
  tests/game-audio-ui.test.js
git diff --check
```

Expected: zero failures.

- [ ] **Step 2: Prove fallback semantic assets are unchanged**

Compare current hashes against the already documented values in
`docs/assets/semantic-spectrum.md`:

```text
assets/world/semantic/drone-scout.png
assets/world/semantic/drone-striker.png
```

Expected: exact hash match.

- [ ] **Step 3: Run the complete Linux platform-independent suite**

Run:

```bash
node --test \
  tests/audio.test.js \
  tests/drone-visual.test.js \
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
```

Expected: zero failures. Do not include macOS-only asset tests in the Linux
passing count.

- [ ] **Step 4: Verify the served workspace**

For:

```text
index.html
src/drone-visual.js
src/scene-style.js
src/game.js
```

compare local SHA-256 with `<preview-url>/<path>`.

Expected: every file is byte-identical and the page returns HTTP 200.

- [ ] **Step 5: Capture the real-browser matrix**

Use Chromium DevTools Protocol and real production render functions. For each
fixture, set explicit track, enemy state, lane, target lane, time, and
reduced-motion state. Do not hand-place the drone or cues in screen
coordinates.

Record:

- selected variant;
- enemy state;
- current and target lane;
- returned Heavy Swarm bounds;
- projected world envelope;
- bank sign;
- chevron and marker presence;
- diagnostic script readiness;
- world atlas loaded/fallback state;
- browser exceptions and network failures.

- [ ] **Step 6: Verify grayscale and visual weight**

Use `tools/png-rgba.js` to create the grayscale screenshot. Verify:

- silhouette survives without saturation;
- core is distinct by value;
- pod separation remains visible;
- chevron and target ring remain readable;
- Striker stays within the same projected world envelope;
- drone does not obscure the player or nearby road hazards.

- [ ] **Step 7: Reconfirm Git and public-source boundaries**

Run:

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/feat/stellar-command-polish
git rev-list --left-right --count HEAD...origin/feat/stellar-command-polish
git diff --check
```

Scan the textual diff for private/internal source markers.

Expected:

- HEAD and origin remain
  `c92e4ff03ea9dd3fe290caf6e0a40c492870a4b3`;
- commit delta remains `0 0`;
- no commit or push occurred;
- no internal source marker appears.

- [ ] **Step 8: Send deployed result for user acceptance**

Send:

- the current development preview URL;
- Scout/Striker comparison;
- warning and movement screenshots;
- grayscale evidence;
- exact focused and full Linux test counts;
- browser diagnostics;
- known macOS-only verification boundary;
- explicit no-commit/no-push confirmation.

Wait for user visual approval before preparing the final commit or updating
PR #1.

# Nebula Cruise Perceptual Camera and HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grounded world objects read as upright road structures, strengthen the 2.5D scene hierarchy, and replace the debug-like active HUD with a restrained Clean Sci-Fi Holo instrument layout.

**Architecture:** Keep the existing build-free Canvas renderer and local atlas pipeline. Correct view selection in the pure `world-art` module, expose pure scene/HUD layout decisions from `presentation`, and let `game` orchestrate drawing without changing gameplay state or collision. Preserve DOM ownership of menus and utilities.

**Tech Stack:** Classic browser JavaScript, Canvas 2D, semantic DOM/CSS, Node.js built-in test runner, static Python HTTP preview, Chromium DevTools Protocol.

## Global Constraints

- Work only on `feat/stellar-command-polish`.
- Do not run `git push`; PR #1 remains at `c92e4ff` until the user explicitly authorizes a push.
- Do not merge PR #1.
- Do not create a release tag or claim production Pages is updated.
- Keep the static, dependency-free, classic-script runtime.
- Keep all thirteen existing world atlases and per-category procedural fallbacks.
- Do not change gameplay generation, lane count, speed, collision, jump, glide, shooting, scoring, persistence, localization scope, audio content, product version, or macOS wrapper structure.
- Use red-green-refactor for every behavior change.
- Linux verification cannot substitute for macOS SceneKit, `sips`, `afinfo`, WKWebView, universal, or signature evidence.

---

### Task 1: Correct Perceptual Camera View Selection

**Files:**
- Modify: `tests/world-art.test.js`
- Modify: `src/world-art.js`

**Interfaces:**
- Consumes: existing `selectAxisBlend`, `YAW_DEGREES`, `PITCH_DEGREES`, atlas metadata, projected origins.
- Produces: `selectViewBlend({ worldX, zRel, cameraY, objectY, worldBounds, viewProfile })` and draw plans that use radial pitch plus profile-specific yaw.

- [ ] **Step 1: Add failing radial-pitch and grounded-yaw tests**

Extend `view blending uses wide symmetric yaw and visual-center pitch` with these contracts:

```js
const outerHigh = selectViewBlend({
  worldX: 2160,
  zRel: 505,
  cameraY: 2340,
  objectY: 0,
  worldBounds: { minY: 0, maxY: 2000 },
  viewProfile: 'grounded',
  laneOffset: 3,
});
assert.ok(Math.abs(outerHigh.pitch.angle - 31.14) < 0.1);
assert.equal(outerHigh.yaw.angle, 18);

const airborne = selectViewBlend({
  worldX: 2160,
  zRel: 505,
  cameraY: 2340,
  objectY: 0,
  worldBounds: { minY: 0, maxY: 500 },
  viewProfile: 'airborne',
});
assert.ok(airborne.yaw.angle > 75);
```

Also assert that center-lane high structure pitch remains approximately `69.35`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/world-art.test.js
```

Expected: the grounded profile still returns `76.8` degrees of yaw and outer pitch still returns `69.35`, so the new assertions fail for the intended reason.

- [ ] **Step 3: Implement radial pitch and view profiles**

In `src/world-art.js`:

```js
const VIEW_PROFILES = Object.freeze({
  airborne: Object.freeze({ minYaw: -80, maxYaw: 80 }),
  grounded: Object.freeze({ minYaw: -18, maxYaw: 18 }),
});
```

Resolve an unknown or missing profile to `airborne`. Compute:

```js
const horizontalDistance = Math.max(1, Math.hypot(Number(worldX) || 0, depth));
const requestedYaw = Math.atan2(Number(worldX) || 0, depth) * 180 / Math.PI;
const groundedYaw = Number(laneOffset) * 6 * Math.min(1, 1200 / depth);
const yawAngle = Math.max(profile.minYaw, Math.min(profile.maxYaw,
  viewProfile === 'grounded' ? groundedYaw : requestedYaw));
const pitchAngle = Math.atan2((Number(cameraY) || 0) - centerY, horizontalDistance) * 180 / Math.PI;
```

Pass `viewProfile` through `buildUprightDrawPlan`. For `grounded`, select only the frontal yaw column and middle pitch row at every depth. The existing atlas has no exact 6, 12, or 18 degree samples; blending 0 and 30 degree silhouettes would reintroduce foreground softness, while selecting 30 degrees would preserve the excessive rotation. Retain the requested yaw in the returned diagnostic blend so exact small-angle frames can be enabled later without changing gameplay orchestration.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/world-art.test.js
```

Expected: all world-art tests pass.

---

### Task 2: Route Grounded and Airborne Objects Through the Correct Profile

**Files:**
- Modify: `tests/world-render.test.js`
- Modify: `src/game.js`

**Interfaces:**
- Consumes: Task 1 `viewProfile` draw-plan option.
- Produces: grounded walls, corridors, and turrets; airborne drones.

- [ ] **Step 1: Add failing renderer profile tests**

Add assertions that:

- drone draw plans can select the outer `±80` yaw columns;
- grounded walls request lane offsets 0/±1/±2/±3 as 0/±6/±12/±18 degrees near the player;
- every grounded depth and lane draws the frontal yaw column, middle pitch row, and alpha 1;
- low, medium, and high grounded structures grow monotonically across the former `zRel = 1,200` boundary;
- adjacent 25-unit depth samples around the former boundary change height by no more than four percent;
- airborne drones retain continuous view blending at every depth;
- turrets use the grounded profile;
- wall and turret projected anchors remain unchanged.

Use the existing harness and source-frame tuple helpers so the test observes actual atlas draw calls rather than implementation strings.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/world-render.test.js
```

Expected: grounded objects still select outer `±80` columns.

- [ ] **Step 3: Pass explicit profiles from game orchestration**

Extend:

```js
function uprightAtlasPlacement(worldX, zRel, objectY, {
  alpha = 1,
  rotation = 0,
  viewProfile = 'airborne',
} = {})
```

Return `viewProfile`. Use:

- `viewProfile: 'airborne'` for drones;
- `viewProfile: 'grounded'` plus continuous `laneOffset` for turrets;
- `viewProfile: 'grounded'` plus integer `laneOffset` in `drawDefenseAtlas`.

- [ ] **Step 4: Run focused world tests and verify GREEN**

Run:

```bash
node --test tests/world-art.test.js tests/world-render.test.js
```

Expected: all tests pass.

---

### Task 3: Define Pure Scene and HUD Presentation Contracts

**Files:**
- Modify: `tests/presentation.test.js`
- Modify: `src/presentation.js`

**Interfaces:**
- Consumes: viewport dimensions and live HUD state flags.
- Produces:
  - `computeHudLayout(width, height)`;
  - `hudVisibilityPlan({ charging, chargeReady, boostActive, superActive, magnetActive })`;
  - `worldDepthTreatment(zRel, maxZRel)`.

- [ ] **Step 1: Add failing HUD layout tests**

Test:

```js
assert.deepEqual(computeHudLayout(1280, 800), {
  safeInset: 40,
  leftX: 40,
  leftY: 40,
  leftWidth: 224,
  rightX: 1240,
  rightY: 40,
  rightWidth: 224,
  lineHeight: 20,
});
```

At `960 x 600`, `safeInset` is `30`. At very small or very large dimensions it clamps to `20` and `64`.

Add visibility tests:

```js
assert.deepEqual(hudVisibilityPlan({}), {
  charge: false,
  boost: false,
  super: false,
  magnet: false,
});
assert.equal(hudVisibilityPlan({ charging: true }).charge, true);
assert.equal(hudVisibilityPlan({ chargeReady: true }).charge, true);
```

Add depth tests proving near alpha is `1`, far alpha is lower but nonzero, and values clamp.

- [ ] **Step 2: Run presentation tests and verify RED**

Run:

```bash
node --test tests/presentation.test.js
```

Expected: new helpers are missing and the old layout uses fixed 16/80 px offsets.

- [ ] **Step 3: Implement pure presentation helpers**

Implement:

```js
function computeHudLayout(viewportWidth, viewportHeight) {
  const width = finiteDimension(viewportWidth);
  const height = finiteDimension(viewportHeight);
  const safeInset = Math.max(20, Math.min(64, Math.min(width, height) * 0.05));
  const clusterWidth = Math.max(180, Math.min(224, width * 0.22));
  return {
    safeInset,
    leftX: safeInset,
    leftY: safeInset,
    leftWidth: clusterWidth,
    rightX: width - safeInset,
    rightY: safeInset,
    rightWidth: clusterWidth,
    lineHeight: Math.max(18, Math.min(22, height * 0.025)),
  };
}
```

Implement immutable visibility and depth result objects. Keep helpers pure.

- [ ] **Step 4: Run presentation tests and verify GREEN**

Run:

```bash
node --test tests/presentation.test.js
```

Expected: all presentation tests pass.

---

### Task 4: Recompose the Road and Ground Contact

**Files:**
- Modify: `tests/world-render.test.js`
- Modify: `src/game.js`

**Interfaces:**
- Consumes: Task 3 `worldDepthTreatment`.
- Produces: navy deck panels, depth-faded lane seams, projected contact footprints, and restrained environmental contact light.

- [ ] **Step 1: Add failing scene-composition tests**

Using the Canvas harness, assert that:

- `renderTrack` uses the approved navy deck palette and not the old neutral-gray fill;
- near lane seams have higher alpha than far lane seams;
- grounded wall rendering emits a projected footprint/contact treatment before atlas draws;
- the contact treatment is absent for drones;
- no contact treatment changes atlas anchors or wall collision height.

- [ ] **Step 2: Run focused renderer tests and verify RED**

Run:

```bash
node --test tests/world-render.test.js
```

Expected: the old gray deck and missing wall contact treatment fail.

- [ ] **Step 3: Implement road and contact composition**

In `renderTrack`:

- use alternating `#10192b` and `#131e32` deck panels;
- use cyan seams with depth treatment alpha;
- keep hazard openings authoritative and unchanged.

Add `drawGroundContact(ctx, lane, zNear, zFar, category)` using projected lane geometry. Draw a dark footprint and low-alpha cyan contact line. Call it for wall/corridor/turret grounded categories before atlas art.

- [ ] **Step 4: Run focused renderer tests and verify GREEN**

Run:

```bash
node --test tests/world-render.test.js
```

Expected: all renderer tests pass.

---

### Task 5: Replace the Active HUD With Instrument Clusters

**Files:**
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/presentation.test.js`
- Modify: `src/game.js`
- Modify: `src/presentation.js`
- Modify: `styles/game.css`

**Interfaces:**
- Consumes: Task 3 HUD layout and visibility plan.
- Produces: persistent left/right instrument clusters, contextual charge/power-up rows, and mode-scoped utility controls.

- [ ] **Step 1: Add failing HUD orchestration tests**

Assert that active play:

- draws fuel and jump pips;
- draws score, distance, and speed;
- does not draw elapsed time, local best, static fire hint, or audio state;
- does not draw an idle charge row;
- draws charge while charging or ready;
- draws only active power-up rows.

Assert that `#utility-controls` receives a mode marker and CSS hides it only in `PLAYING`, not in `MENU` or `PAUSED`.

- [ ] **Step 2: Run focused HUD tests and verify RED**

Run:

```bash
node --test tests/presentation.test.js tests/game-audio-ui.test.js
```

Expected: old permanent HUD content and utilities fail the new contracts.

- [ ] **Step 3: Implement HUD clusters**

Refactor `renderHUD` into focused draw helpers inside `src/game.js`:

- `drawHudPanel`;
- `drawFuelInstrument`;
- `drawJumpPips`;
- `drawScoreInstrument`;
- `drawContextStatus`.

Use layout coordinates from `computeHudLayout`. Use Clean Sci-Fi Holo colors, text shadows, tabular monospace numerals, and no full-screen frame during play.

Set `document.documentElement.dataset.gameMode` or `#app-ui.dataset.mode` during presentation refresh. CSS hides utility controls in `PLAYING`, retains them in menu/pause/game over, and disables the full `#command-frame` border during active play.

- [ ] **Step 4: Run focused HUD tests and verify GREEN**

Run:

```bash
node --test tests/presentation.test.js tests/game-audio-ui.test.js
```

Expected: all focused tests pass.

---

### Task 6: Run Full Linux Verification and Browser Review

**Files:**
- Modify only source or tests required by defects found during verification.
- Create outside Git: `/tmp/skyroads-after-1280x800.png`
- Create outside Git: `/tmp/skyroads-after-960x600.png`
- Create outside Git: `/tmp/skyroads-after-1920x1080.png`

**Interfaces:**
- Consumes: Tasks 1 through 5.
- Produces: fresh automated evidence, real-browser screenshots, and a playable local review URL.

- [ ] **Step 1: Run platform-independent automated checks**

Run:

```bash
npm run check
node --test \
  tests/audio.test.js \
  tests/game-audio-ui.test.js \
  tests/i18n.test.js \
  tests/input.test.js \
  tests/leaderboard.test.js \
  tests/music-generator.test.js \
  tests/obstacles.test.js \
  tests/player-render.test.js \
  tests/presentation.test.js \
  tests/release-contracts.test.js \
  tests/static-app.test.js \
  tests/world-art.test.js \
  tests/world-render.test.js
git diff --check
```

Expected: zero failures.

- [ ] **Step 2: Verify the preview server**

Confirm:

```bash
curl -fsSI <preview-url>
```

Expected: HTTP 200 from the repository root. Restart the detached Python server only if required.

- [ ] **Step 3: Run real Chromium scenarios**

At 960 x 600, 1280 x 800, and 1920 x 1080:

- load the menu;
- start the mission;
- verify diagnostics report thirteen loaded world atlases and no fallback;
- verify no console or network errors;
- inspect menu and active-play utility visibility;
- inspect center and outer grounded structures;
- exercise pause/resume and reduced-motion mode.

- [ ] **Step 4: Capture before/after evidence**

Retain the earlier `/tmp/skyroads-preview-1280x800.png` as before evidence. Capture the three after screenshots outside Git and confirm image dimensions.

- [ ] **Step 5: Report without pushing**

Send the user:

- the current development preview URL;
- 1280 x 800 before/after images;
- exact test results;
- known macOS-only verification gap;
- confirmation that PR #1 remains at `c92e4ff`.

Do not commit or push before user visual approval unless the user explicitly changes that instruction.

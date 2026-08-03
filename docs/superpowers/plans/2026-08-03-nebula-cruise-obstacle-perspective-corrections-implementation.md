# Nebula Cruise Obstacle and Perspective Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver the approved 600/1,250/2,000 obstacle tiers, speed-banded low and medium defense corridors, correct edge-lane yaw/pitch perspective, a 432-unit drone silhouette, and reliable Space/Enter mission restart in the existing V1.1 pull request.

**Architecture:** Add a dependency-free pure obstacle module for physics envelopes, run lengths, wall lookup, and corridor connectivity; keep generation, collision, input, and Canvas orchestration in 'src/game.js'. Replace the upright sprite contract with deterministic 7-by-3 yaw/pitch atlases whose per-frame alpha crop and projected world-origin anchor drive a maximum-four-draw Canvas plan, while gaps retain their projected road-plane path. Reuse the two already audited Kenney CC0 packages, validate every atlas independently, and preserve procedural per-category fallback.

**Tech Stack:** HTML5 Canvas 2D, classic JavaScript with CommonJS test exports, Node 22 node:test, Swift 6 with SceneKit/AppKit, transparent PNG atlases, GitHub Pages, macOS WKWebView.

## Global Constraints

- Work only in '/Users/stan/Developer/GitHub/skyroads/.worktrees/stellar-command-polish' on 'feat/stellar-command-polish'; update pull request #1 but never merge it.
- Do not push any new commit until the user has received a real gameplay screenshot, a working loopback URL, and has explicitly approved the result.
- Use strict red-green-refactor for each behavior: observe the named failure before changing production code, then run the focused GREEN suite before committing.
- Preserve seven lanes, 720 world units per lane, jump velocity 7,500, gravity 32,000, ordinary two-jump and super three-jump limits, 3-fuel second/third jump cost, glide factors 0.08/0.045, speed curve, BOOST/SLOW behavior, score, local Top 15, music, player art, and storage.
- A low obstacle is 648 by 600 world units, a medium obstacle is 648 by 1,250, and a high obstacle is 648 by 2,000; equality with a collision height fails and only a strictly greater height clears.
- A low corridor's signposted route is one jump plus hold-to-glide, but a well-timed ordinary second jump remains legal. A medium corridor requires two jumps followed by hold-to-glide at nominal speed.
- Every newly added building or corridor challenge preserves at least one ordinary ROAD/FUEL/non-hazard-pickup bypass lane; the existing intentional seven-lane full-gap challenge remains unchanged.
- Continuous runs unlock at segment 100, use nominal speed min(24, sqrt(64 + 0.8 × index)), and keep ten clear same-lane approach segments plus ten clear same-lane landing segments.
- Use run chance 0.08 + 0.08 × difficulty and medium-run ratio 0.35 + 0.30 × difficulty; these fixed values resolve the only design probability left unspecified.
- Use only the already approved official Kenney Space Kit and Modular Space Kit CC0 archives. Archives, extracted sources, contact sheets, and renderer reports stay outside Git.
- Upright/airborne atlases use yaw [-80,-55,-30,0,30,55,80], pitch [20,55,80], 320-by-320 cells, and a 2,240-by-960 PNG. Twelve such atlases stay at or below 3 MiB each, 30 MiB combined on disk, and 112 MiB decoded RGBA combined.
- Keep the existing gap opening as projected road-plane geometry. Its edge atlas remains a separate road-edge layout and never enters upright yaw/pitch selection.
- Missing, undecodable, wrong-size, or malformed metadata for one atlas falls back only that atlas/category instance; art failure cannot affect lane contents, collision, weapon rules, or safe-lane generation.
- Drone collision height 500, half-width 0.22 lane, rest/warn/move timing, lane interpolation, direction chevron, landing marker, banking direction, and reduced-motion behavior do not change.
- English and Simplified Chinese remain the only locales; physical labels Space, Enter, and Esc remain untranslated.

---

## File and Interface Map

- Create 'src/obstacles.js': immutable obstacle heights and pure jump-envelope, speed, run-length, wall, and corridor-connectivity helpers. It has no DOM, Canvas, audio, storage, or random-number dependency.
- Create 'tests/obstacles.test.js': closed-form physics and corridor phase unit tests, including independent trajectory simulation used only as evidence.
- Modify 'src/game.js': consume 'Skyroads.obstacles'; own generator state, lane metadata, collision, weapons, restart command ordering, and Canvas orchestration.
- Modify 'src/world-art.js': own immutable runtime atlas metadata validation, yaw/pitch blending, per-frame source/origin mapping, and draw-plan construction.
- Modify 'tools/world-assets.json': manifest schema version 3, two layout contracts, geometry envelopes, audited recipes, and exact source hashes.
- Modify 'tools/render-world-assets.swift': deterministic normalization, 21-view upright rendering, road-edge compatibility rendering, per-frame crop/origin reporting, and budget enforcement.
- Replace eight upright PNGs in 'assets/world'; add 'structure-pylon.png', 'structure-bastion.png', 'corridor-low.png', and 'corridor-medium.png'; preserve 'gap-edge.png' byte-for-byte.
- Modify 'src/presentation.js': validate decoded image dimensions and frozen frame metadata before marking each atlas loaded.
- Modify 'src/i18n.js', 'src/presentation.js', and 'styles/game.css': bilingual glide and route-language guidance without putting translated text in the Canvas.
- Modify 'README.md', 'README.zh-CN.md', 'docs/assets/world-art.md', and 'THIRD_PARTY_NOTICES.md': player rules, provenance, renderer hash, source inventory, and output hashes.
- Modify 'index.html', game VM harnesses, 'app/main.swift', and smoke tests: load and verify the obstacle module plus the final thirteen atlas keys.

---

### Task 1: Make Space and Enter Reliably Start or Restart the Mission

**Files:**
- Modify: 'tests/game-audio-ui.test.js'
- Modify: 'src/game.js:304-412'

**Interfaces:**
- Consumes: existing 'STATE.mode', 'STATE.ui.startButton', 'STATE.ui.restartButton', 'editingTarget()', 'modalOpen()', and 'startGame()'.
- Produces: 'primaryMissionActionTarget(mode)' returning the current primary button or null, and 'acceptsMissionShortcutTarget(target, mode)' returning a boolean.
- Preserves: 'shouldHandleGameInput()' as the PLAYING movement/fire focus gate and native keyboard activation for every non-primary UI button.

- [ ] **Step 1: Add focused-button RED tests**

Add a helper that makes the real primary button report that it is inside '#app-ui', then add this table-driven test:

~~~js
function markInsideAppUi(element) {
  element.closest = (selector) => selector === '#app-ui' ? { id: 'app-ui' } : null;
  return element;
}

for (const [mode, buttonName] of [['MENU', 'startButton'], ['GAMEOVER', 'restartButton']]) {
  for (const code of ['Enter', 'Space']) {
    test(mode + ' accepts ' + code + ' from its focused primary button', () => {
      const sandbox = makeGameUiSandbox();
      sandbox.STATE.mode = mode;
      const button = markInsideAppUi(sandbox.STATE.ui[buttonName]);
      let prevented = false;
      sandbox.window.dispatchEvent({
        type: 'keydown',
        code,
        key: code === 'Space' ? ' ' : 'Enter',
        target: button,
        repeat: false,
        defaultPrevented: false,
        preventDefault() { prevented = true; },
      });
      assert.equal(sandbox.STATE.mode, 'PLAYING');
      assert.equal(prevented, true);
    });
  }
}
~~~

Add regression cases asserting that repeat keydown, an input/contenteditable target, an open leaderboard or rename dialog, and a non-primary app UI button do not start; the non-primary button case must also assert 'preventDefault()' was not called. Add one case proving a Canvas/outside-app target still starts.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/game-audio-ui.test.js
~~~

Expected: the focused primary-button Space/Enter cases fail because the current handler prevents native activation and then rejects the event as app-UI input.

- [ ] **Step 3: Implement the mode command before the PLAYING focus gate**

Add:

~~~js
function primaryMissionActionTarget(mode = STATE.mode) {
  if (!STATE.ui) return null;
  if (mode === 'MENU') return STATE.ui.startButton || null;
  if (mode === 'GAMEOVER') return STATE.ui.restartButton || null;
  return null;
}

function acceptsMissionShortcutTarget(target, mode = STATE.mode) {
  if (!targetInsideAppUi(target)) return true;
  return target === primaryMissionActionTarget(mode);
}
~~~

In the global keydown handler, after default/repeat/latched-key and editing/dialog rejection but before 'shouldHandleGameInput()', handle:

~~~js
const modeCommand = (code === 'Enter' || code === 'Space')
  && (STATE.mode === 'MENU' || STATE.mode === 'GAMEOVER')
  && acceptsMissionShortcutTarget(e.target, STATE.mode);
if (modeCommand) {
  e.preventDefault();
  startGame();
  return;
}
~~~

Only call 'preventDefault()' after accepting this mode command. Keep M, Escape, movement, fire, keyup, ARIA keycaps, and focus transfer behavior unchanged.

- [ ] **Step 4: Run GREEN**

Run:

~~~bash
node --test tests/game-audio-ui.test.js tests/input.test.js tests/presentation.test.js
npm run check
~~~

Expected: PASS; Space and Enter restart from the focused restart button, while editing/dialog/unrelated-button cases remain inert.

- [ ] **Step 5: Commit**

~~~bash
git add src/game.js tests/game-audio-ui.test.js
git commit -m "fix: make mission restart shortcuts reliable"
~~~

---

### Task 2: Add the Pure Obstacle Physics and Corridor Contract

**Files:**
- Create: 'src/obstacles.js'
- Create: 'tests/obstacles.test.js'
- Modify: 'index.html'
- Modify: 'tests/static-app.test.js'
- Modify VM script arrays in: 'tests/input.test.js', 'tests/world-render.test.js', 'tests/player-render.test.js', 'tests/game-audio-ui.test.js'

**Interfaces:**
- Produces:
  - 'OBSTACLE_HEIGHTS: { WALL_LOW:600, WALL_MEDIUM:1250, WALL_HIGH:2000 }'
  - 'RUN_CLEARANCE' for low and medium signposted routes.
  - 'jumpApex(jumpCount, options?) -> number'
  - 'clearanceWindow(options) -> number'
  - 'nominalSpeed(segmentIndex, options?) -> number'
  - 'runLengthBounds(wallType, speed) -> frozen { minimumLength, maximumSafeLength }'
  - 'selectRunLength(wallType, speed, randomValue) -> integer'
  - 'wallHeight(wallType) -> number|null'
  - 'isWallType(wallType) -> boolean'
  - 'corridorModulePhase(track, segmentIndex, lane) -> null|single|start|middle|end'
- Corridor metadata consumed by the phase helper is '{ id:number, lane:number, type:string, index:number, length:number }'; collision remains in 'segment.lanes[lane]'.

- [ ] **Step 1: Write RED unit tests for the complete public contract**

Create 'tests/obstacles.test.js' with exact assertions:

~~~js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OBSTACLE_HEIGHTS,
  jumpApex,
  clearanceWindow,
  nominalSpeed,
  runLengthBounds,
  selectRunLength,
  wallHeight,
  isWallType,
  corridorModulePhase,
} = require('../src/obstacles.js');

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' != ' + expected);
}

test('jump envelopes preserve all three approved apex values', () => {
  close(jumpApex(1), 878.90625);
  close(jumpApex(2), 1757.8125);
  close(jumpApex(3), 2636.71875);
});

test('signposted clearance windows use the unchanged glide factor', () => {
  close(clearanceWindow({ thresholdHeight: 600 }), 0.2640579, 1e-6);
  close(clearanceWindow({ thresholdHeight: 600, descentGravityFactor: 0.08 }), 0.5988217, 1e-6);
  close(clearanceWindow({ thresholdHeight: 1250, launchHeight: 878.90625 }), 0.3563048, 1e-6);
  close(clearanceWindow({
    thresholdHeight: 1250,
    launchHeight: 878.90625,
    descentGravityFactor: 0.08,
  }), 0.8080, 2e-4);
});

test('nominal speeds and run bounds match the approved table', () => {
  const rows = [
    [100, 12, [5, 6], [6, 8]],
    [240, 16, [6, 8], [7, 11]],
    [420, 20, [7, 10], [9, 15]],
    [640, 24, [8, 13], [10, 18]],
  ];
  for (const [index, speed, low, medium] of rows) {
    close(nominalSpeed(index), speed);
    assert.deepEqual(Object.values(runLengthBounds('WALL_LOW', speed)), low);
    assert.deepEqual(Object.values(runLengthBounds('WALL_MEDIUM', speed)), medium);
    assert.equal(selectRunLength('WALL_LOW', speed, 0), low[0]);
    assert.equal(selectRunLength('WALL_LOW', speed, 0.999), Math.min(low[0] + 1, low[1]));
  }
});

test('wall lookup has an exact three-tier vocabulary', () => {
  assert.deepEqual(OBSTACLE_HEIGHTS, {
    WALL_LOW: 600,
    WALL_MEDIUM: 1250,
    WALL_HIGH: 2000,
  });
  for (const type of Object.keys(OBSTACLE_HEIGHTS)) {
    assert.equal(isWallType(type), true);
    assert.equal(wallHeight(type), OBSTACLE_HEIGHTS[type]);
  }
  assert.equal(isWallType('GAP'), false);
  assert.equal(wallHeight('ROAD'), null);
});
~~~

Add a five-tile corridor fixture. Assert start/middle/end, then turn the center lane tile to ROAD and assert its neighbors immediately become end/start. Turn two adjacent tiles to ROAD and assert the surviving endpoint becomes single. Assert a different run id, lane, or wall type never connects.

Use this independent 1/20,000-second trajectory simulator inside the test file:

~~~js
function simulateClearance({
  thresholdHeight,
  jumpTimes,
  glideAfter = Infinity,
  duration = 2,
}) {
  const dt = 1 / 20000;
  let y = 0;
  let velocity = 0;
  let jumpIndex = 0;
  let current = 0;
  let longest = 0;
  for (let time = 0; time < duration; time += dt) {
    if (jumpIndex < jumpTimes.length && time >= jumpTimes[jumpIndex]) {
      velocity = 7500;
      jumpIndex++;
    }
    const gliding = time >= glideAfter && velocity < 0 && y > 0;
    velocity -= 32000 * (gliding ? 0.08 : 1) * dt;
    y = Math.max(0, y + velocity * dt);
    if (y > thresholdHeight) {
      current += dt;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

const firstApexTime = 7500 / 32000;
const lowDownCrossing = firstApexTime
  + Math.sqrt(2 * (jumpApex(1) - 600) / 32000);
~~~

Assert each selected low length at speeds 12/16/20/24 exceeds
'simulateClearance({thresholdHeight:600,jumpTimes:[0]}) × speed', fits the
one-jump glide distance when 'glideAfter' is 'firstApexTime', and fits the
advanced second-jump distance using 'jumpTimes:[0,lowDownCrossing]'. Require
the latter window to be at least 0.72 seconds. For medium, enumerate second
jump times from 0.05 through 0.45 seconds in 0.0025-second increments and
assert every no-glide window is shorter than the selected run; then assert
'jumpTimes:[0,firstApexTime]' plus glide beginning at the second apex clears.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/obstacles.test.js
~~~

Expected: FAIL with MODULE_NOT_FOUND for 'src/obstacles.js'.

- [ ] **Step 3: Implement the dependency-free module**

Create 'src/obstacles.js' in the repository's existing UMD/CommonJS style. Its mathematical core is:

~~~js
'use strict';

(function attachObstacles(root) {
  const OBSTACLE_HEIGHTS = Object.freeze({
    WALL_LOW: 600,
    WALL_MEDIUM: 1250,
    WALL_HIGH: 2000,
  });

  function jumpApex(jumpCount, {
    jumpVelocity = 7500,
    gravity = 32000,
  } = {}) {
    const count = Math.max(0, Math.trunc(Number(jumpCount) || 0));
    return count * jumpVelocity * jumpVelocity / (2 * gravity);
  }

  function clearanceWindow({
    thresholdHeight,
    launchHeight = 0,
    jumpVelocity = 7500,
    gravity = 32000,
    descentGravityFactor = 1,
  }) {
    const peak = launchHeight + jumpVelocity * jumpVelocity / (2 * gravity);
    const delta = peak - thresholdHeight;
    if (!(delta > 0) || !(descentGravityFactor > 0)) return 0;
    const ascent = Math.sqrt(2 * delta / gravity);
    const descent = Math.sqrt(2 * delta / (gravity * descentGravityFactor));
    return ascent + descent;
  }

  const RUN_CLEARANCE = Object.freeze({
    WALL_LOW: Object.freeze({
      noGlideSeconds: clearanceWindow({ thresholdHeight: 600 }),
      glideSeconds: clearanceWindow({ thresholdHeight: 600, descentGravityFactor: 0.08 }),
    }),
    WALL_MEDIUM: Object.freeze({
      noGlideSeconds: clearanceWindow({ thresholdHeight: 1250, launchHeight: jumpApex(1) }),
      glideSeconds: clearanceWindow({
        thresholdHeight: 1250,
        launchHeight: jumpApex(1),
        descentGravityFactor: 0.08,
      }),
    }),
  });

  function nominalSpeed(segmentIndex, {
    initialSpeed = 8,
    acceleration = 0.4,
    maxSpeed = 24,
  } = {}) {
    const index = Math.max(0, Number(segmentIndex) || 0);
    return Math.min(maxSpeed, Math.sqrt(initialSpeed * initialSpeed + 2 * acceleration * index));
  }

  function runLengthBounds(wallType, speed) {
    const clearance = RUN_CLEARANCE[wallType];
    if (!clearance) throw new RangeError('Unsupported corridor wall type: ' + wallType);
    const velocity = Math.max(0, Number(speed) || 0);
    return Object.freeze({
      minimumLength: Math.ceil(velocity * clearance.noGlideSeconds) + 1,
      maximumSafeLength: Math.floor(velocity * clearance.glideSeconds) - 1,
    });
  }

  function selectRunLength(wallType, speed, randomValue) {
    const bounds = runLengthBounds(wallType, speed);
    const variation = Number(randomValue) >= 0.5 ? 1 : 0;
    return Math.min(bounds.maximumSafeLength, bounds.minimumLength + variation);
  }

  function wallHeight(wallType) {
    return Object.prototype.hasOwnProperty.call(OBSTACLE_HEIGHTS, wallType)
      ? OBSTACLE_HEIGHTS[wallType]
      : null;
  }

  function isWallType(wallType) {
    return wallHeight(wallType) !== null;
  }
~~~

Implement corridor connectivity with:

~~~js
  function corridorModulePhase(track, segmentIndex, lane) {
    const segment = track[segmentIndex];
    const corridor = segment && segment.corridor;
    if (!corridor || corridor.lane !== lane || segment.lanes[lane] !== corridor.type) return null;

    function connected(offset) {
      const neighbor = track[segmentIndex + offset];
      const other = neighbor && neighbor.corridor;
      return Boolean(
        other
        && other.id === corridor.id
        && other.lane === corridor.lane
        && other.type === corridor.type
        && neighbor.lanes[lane] === corridor.type
      );
    }

    const before = connected(-1);
    const after = connected(1);
    if (before && after) return 'middle';
    if (before) return 'end';
    if (after) return 'start';
    return 'single';
  }

  const api = Object.freeze({
    OBSTACLE_HEIGHTS,
    RUN_CLEARANCE,
    jumpApex,
    clearanceWindow,
    nominalSpeed,
    runLengthBounds,
    selectRunLength,
    wallHeight,
    isWallType,
    corridorModulePhase,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.obstacles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
~~~

- [ ] **Step 4: Wire the classic script in every environment**

Insert:

~~~html
<script src="./src/obstacles.js"></script>
~~~

after 'src/input.js' and before 'src/game.js' in 'index.html'. Add 'src/obstacles.js' before 'src/game.js' in every VM harness named in this task. Update the static-app script-order assertion to require:

~~~js
assert.ok(html.indexOf('./src/obstacles.js') < html.indexOf('./src/game.js'));
~~~

- [ ] **Step 5: Run GREEN**

Run:

~~~bash
node --test tests/obstacles.test.js tests/static-app.test.js tests/input.test.js tests/world-render.test.js tests/player-render.test.js tests/game-audio-ui.test.js
npm run check
~~~

Expected: PASS, including the approved 5–13 low and 6–18 medium bounds.

- [ ] **Step 6: Commit**

~~~bash
git add src/obstacles.js tests/obstacles.test.js index.html tests/static-app.test.js \
  tests/input.test.js tests/world-render.test.js tests/player-render.test.js tests/game-audio-ui.test.js
git commit -m "feat: define obstacle clearance envelopes"
~~~

---

### Task 3: Integrate the Medium Tier, Collision Boundaries, Jumps, Glide, and Weapons

**Files:**
- Modify: 'src/game.js:1-184, 482-515, 588-600, 2969-3034, 3090-3114, 3190-3230'
- Modify: 'tests/input.test.js'

**Interfaces:**
- Consumes: 'Skyroads.obstacles.OBSTACLE_HEIGHTS', 'wallHeight()', and 'isWallType()'.
- Produces: 'LANE_TYPE.WALL_MEDIUM' and 'CONFIG.WALL_MEDIUM_HEIGHT === 1250'.
- Preserves: ordinary two jumps, super three jumps, 3 fuel for each extra jump, 0.08/0.045 glide factors, and swept collision widths.

- [ ] **Step 1: Write RED collision, jump, glide, and projectile cases**

Extend the existing game-logic harness to load 'src/obstacles.js'. Add a table that sets one wall under the player and calls 'checkCollisions()':

~~~js
for (const [type, height] of [
  ['WALL_LOW', 600],
  ['WALL_MEDIUM', 1250],
  ['WALL_HIGH', 2000],
]) {
  test(type + ' collision is strict at its approved height', () => {
    const sandbox = createGameLogicHarness();
    sandbox.STATE.track = [{ lanes: new Array(7).fill('ROAD') }];
    sandbox.STATE.track[0].lanes[3] = type;
    sandbox.STATE.position = 0;
    sandbox.STATE.movement.lanePosition = 3;
    sandbox.STATE.playerY = height;
    sandbox.checkCollisions(3, 3);
    assert.deepEqual(sandbox.__deaths, ['wall']);
    sandbox.__deaths.length = 0;
    sandbox.STATE.playerY = height + Number.EPSILON * height;
    sandbox.checkCollisions(3, 3);
    assert.deepEqual(sandbox.__deaths, []);
  });
}
~~~

Add tests proving: ordinary third jump is rejected; super third jump is accepted; second and third jumps each reduce fuel by exactly 3; glide gravity is selected only for airborne + descending + held jump + positive fuel; ordinary and super glide values remain 0.08 and 0.045.

Add projectile rows:

~~~js
[
  ['WALL_LOW', 600, 600, true],
  ['WALL_LOW', 600, 600.01, false],
  ['WALL_MEDIUM', 1250, 1250, true],
  ['WALL_MEDIUM', 1250, 1250.01, false],
  ['WALL_HIGH', 2000, 2500, true],
]
~~~

For each row, assert whether an ordinary bullet is consumed. Separately assert an ordinary missile, super bullet, and super area missile convert WALL_MEDIUM to ROAD. Update the harness's super-missile test double to use 'Skyroads.obstacles.isWallType()'.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/input.test.js
~~~

Expected: medium collision/projectile tests fail because WALL_MEDIUM is not part of the game vocabulary.

- [ ] **Step 3: Replace duplicated wall branching with the pure lookup**

At the top of 'src/game.js', destructure:

~~~js
const {
  OBSTACLE_HEIGHTS,
  wallHeight,
  isWallType,
} = globalThis.Skyroads.obstacles;
~~~

Set the three CONFIG heights from 'OBSTACLE_HEIGHTS', add 'WALL_MEDIUM' to 'LANE_TYPE', and use:

~~~js
const obstacleHeight = wallHeight(type);
if (obstacleHeight !== null && !invincible && STATE.playerY <= obstacleHeight) {
  die('wall');
  return;
}
~~~

inside 'checkCollisions()'.

In 'advanceShots()', replace the low/high condition with 'isWallType(t)'. Use:

~~~js
const height = wallHeight(t);
const bulletBlocked = sh.kind === 'missile'
  || t === LANE_TYPE.WALL_HIGH
  || sh.y <= height;
~~~

Keep super bullet and super missile behavior ahead of this ordinary rule. In 'superMissileBlast()', use 'isWallType(s.lanes[l])'. Choose particle heights from the actual tier height rather than a low/high ternary.

Correct the stale GLIDE_GRAVITY_FACTOR comment from 0.13 to 0.08 without changing the value.

- [ ] **Step 4: Prove high-speed swept collision still checks every segment**

Add a test that advances from segment 0.1 through an eighteen-tile medium
corridor (the maximum approved medium bound at speed 24) in substeps no
larger than 0.5 segment, calls 'checkCollisions()' at each substep, and
asserts the first intersected wall records exactly one 'wall' death. Repeat
with playerY 1250.01 and assert no death across all eighteen tiles. This
locks every continuous-run segment boundary without changing the existing
update-loop subdivision.

- [ ] **Step 5: Run GREEN**

Run:

~~~bash
node --test tests/input.test.js tests/obstacles.test.js
npm run check
~~~

Expected: PASS for equality/epsilon, extra-jump fuel, glide gating, and all ordinary/super weapon cases.

- [ ] **Step 6: Commit**

~~~bash
git add src/game.js tests/input.test.js
git commit -m "feat: add the two-jump defense tier"
~~~

---

### Task 4: Generate Speed-banded Connected Corridors with Fair Approaches and Landings

**Files:**
- Modify: 'src/game.js:556-859'
- Modify: 'tests/input.test.js'
- Modify: 'tests/obstacles.test.js'

**Interfaces:**
- Consumes: 'nominalSpeed()', 'selectRunLength()', 'corridorModulePhase()', and the three wall types.
- Produces generator state:

~~~js
{
  runLane: -1,
  runType: null,
  runLeft: 0,
  runLength: 0,
  runIndex: 0,
  runId: null,
  landingLane: -1,
  landingLeft: 0,
  clearStreak: [0, 0, 0, 0, 0, 0, 0],
}
~~~

- Produces per-run segment metadata '{ id, lane, type, index, length }'.
- Preserves the existing full-gap, bridge, pickup cycle, forced fuel, enemy safe-lane exclusion, and cluster reachability behavior.

- [ ] **Step 1: Add generator RED tests with deterministic random samples**

Expose 'newGenState()', 'generateSegment()', and 'LANE_TYPE' through the existing VM harness. Seed a state with 'safeLane = 3', every 'clearStreak = 15', index 100, and a queued deterministic random sequence. Assert:

- low and medium runs occupy one unchanged non-safe lane;
- every run tile has the same id/type/length and indices 0 through length - 1;
- length is minimum or minimum + 1 from 'selectRunLength()';
- the safe lane is ROAD/FUEL/non-hazard pickup on every run tile;
- run tiles contain no GAP, pickup on the run lane, or enemy;
- the next ten segments keep 'landingLane' clear and enemy-free;
- medium short structures are emitted only after ten clear same-lane segments;
- high structures are emitted only after fifteen clear same-lane segments;
- a high structure always leaves 'safeLane' ordinary-traversable;
- a state with no eligible non-safe lane falls back to the existing cluster path instead of forcing a run.

Add a seeded 20,000-segment invariant test. For every corridor, scan backward ten and forward ten same-lane segments. Explicitly skip the ordinary-safe-lane assertion only when all seven tiles are the pre-existing GAP challenge. Assert full gaps still contain exactly seven GAP values, never exceed three consecutive segments, and retain their existing ±2 reachable landing rule.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/input.test.js tests/obstacles.test.js
~~~

Expected: generator tests fail because the run state and corridor metadata do not exist.

- [ ] **Step 3: Add fixed run tuning and per-lane clearance accounting**

Add:

~~~js
const RUN_TUNING = Object.freeze({
  minIndex: 100,
  chanceBase: 0.08,
  chanceDifficulty: 0.08,
  mediumRatioBase: 0.35,
  mediumRatioDifficulty: 0.30,
  approachSegments: 10,
  landingSegments: 10,
  mediumApproachSegments: 10,
  highApproachSegments: 15,
});
~~~

Add the produced fields to 'newGenState()'. Route every return from 'generateSegment()' through:

~~~js
function finalizeGeneratedSegment(gen, segment) {
  const enemyLanes = new Set((segment.enemies || []).map((enemy) => Math.round(enemy.lane)));
  for (let lane = 0; lane < CONFIG.LANES; lane++) {
    const type = segment.lanes[lane];
    const clear = type !== LANE_TYPE.GAP
      && !isWallType(type)
      && !enemyLanes.has(lane);
    gen.clearStreak[lane] = clear ? gen.clearStreak[lane] + 1 : 0;
  }
  return segment;
}
~~~

FUEL, BOOST, SLOW, TRIPLE, and MAGNET count as clear because they are non-hazard road pickups.

- [ ] **Step 4: Emit and land one run without contaminating its lane**

Implement:

~~~js
function emitRunSegment(index, gen) {
  const lanes = new Array(CONFIG.LANES).fill(LANE_TYPE.ROAD);
  const runIndex = gen.runIndex;
  lanes[gen.runLane] = gen.runType;
  const segment = {
    index,
    lanes,
    corridor: {
      id: gen.runId,
      lane: gen.runLane,
      type: gen.runType,
      index: runIndex,
      length: gen.runLength,
    },
  };
  gen.runIndex++;
  gen.runLeft--;
  if (gen.runLeft === 0) {
    gen.landingLane = gen.runLane;
    gen.landingLeft = RUN_TUNING.landingSegments;
    gen.runLane = -1;
    gen.runType = null;
    gen.runLength = 0;
    gen.runIndex = 0;
    gen.runId = null;
  }
  return finalizeGeneratedSegment(gen, segment);
}
~~~

Place ongoing full gap and bridge branches before ongoing run. Place ongoing run before clusters. While 'landingLeft > 0', emit an all-road segment, allow forced fuel only on 'safeLane', do not call 'maybePlaceEnemy()', decrement landingLeft, and keep landingLane ROAD.

- [ ] **Step 5: Select a new run only after a real ten-segment approach**

After existing new full-gap and bridge selection and before new cluster selection, use:

~~~js
const runCandidates = laneIndices().filter((lane) =>
  lane !== gen.safeLane
  && gen.clearStreak[lane] >= RUN_TUNING.approachSegments
);
const runChance = RUN_TUNING.chanceBase + RUN_TUNING.chanceDifficulty * d;
if (index >= RUN_TUNING.minIndex && runCandidates.length > 0 && Math.random() < runChance) {
  gen.runLane = runCandidates[Math.floor(Math.random() * runCandidates.length)];
  const mediumRatio = RUN_TUNING.mediumRatioBase + RUN_TUNING.mediumRatioDifficulty * d;
  gen.runType = Math.random() < mediumRatio
    ? LANE_TYPE.WALL_MEDIUM
    : LANE_TYPE.WALL_LOW;
  gen.runLength = selectRunLength(gen.runType, nominalSpeed(index), Math.random());
  gen.runLeft = gen.runLength;
  gen.runIndex = 0;
  gen.runId = index;
  return emitRunSegment(index, gen);
}
~~~

Do not change 'safeLane' when starting or ending a run.

- [ ] **Step 6: Gate short medium/high structures by their approach streak**

Add one helper and use it both in 'fillClusterLanes()' and the cooldown branch,
so neither path can create a medium/high building without its required
approach:

~~~js
function wallTypeForApproach(gen, lane, d, tierRoll = Math.random()) {
const highRatio = 0.15 + 0.45 * d;
const mediumRatio = 0.25 + 0.25 * d;
if (gen.clearStreak[lane] >= RUN_TUNING.highApproachSegments && tierRoll < highRatio) {
  return LANE_TYPE.WALL_HIGH;
}
if (
  gen.clearStreak[lane] >= RUN_TUNING.mediumApproachSegments
  && tierRoll < highRatio + mediumRatio
) {
  return LANE_TYPE.WALL_MEDIUM;
}
return LANE_TYPE.WALL_LOW;
}
~~~

Pass 'gen' into 'fillClusterLanes()', assign
'lanes[lane] = wallTypeForApproach(gen,lane,d)', and use the same call instead
of the cooldown branch's low/high ternary. Continue excluding 'clusterLane'
and 'safeLane', so every high building remains avoidable without super form.

- [ ] **Step 7: Run GREEN**

Run:

~~~bash
node --test tests/obstacles.test.js tests/input.test.js
npm run check
~~~

Expected: PASS for the approved length bands, ten-segment clear zones, continuity, no overlaps, high-route bypass, and unchanged full gaps.

- [ ] **Step 8: Commit**

~~~bash
git add src/game.js tests/input.test.js tests/obstacles.test.js
git commit -m "feat: generate connected defense corridors"
~~~

---

### Task 5: Replace Fixed-yaw Billboard Math with a Yaw-by-pitch Origin-anchor Draw Plan

**Files:**
- Modify: 'tests/world-art.test.js'
- Modify: 'src/world-art.js'

**Interfaces:**
- Produces:
  - 'YAW_DEGREES = [-80,-55,-30,0,30,55,80]'
  - 'PITCH_DEGREES = [20,55,80]'
  - 'selectAxisBlend(angle, samples)'
  - 'selectViewBlend({worldX,zRel,cameraY,objectY,worldBounds})'
  - 'atlasFrame(metadata,yawIndex,pitchIndex)'
  - 'validateAtlasMetadata(metadata)'
  - 'buildSpriteDrawPlan(options) -> {yaw,pitch,bounds,draws}'
- Each item in 'draws' is '{ source:{sx,sy,sw,sh}, destination:{x,y,width,height}, weight, alpha }'.
- Preserves 'variantKey()' and adds wallMedium, corridorLow, and corridorMedium categories.

- [ ] **Step 1: Replace seven-view tests with synthetic 21-frame RED tests**

Build a synthetic upright metadata object with 320-by-320 cells, seven yaw samples, three pitch samples, a 648-by-2,000 world bound, pixelsPerWorldUnit 0.1, and 21 distinct source/origin pairs. Assert:

~~~js
assert.deepEqual(selectAxisBlend(67.5, YAW_DEGREES), {
  angle: 67.5,
  lowerIndex: 5,
  upperIndex: 6,
  mix: 0.5,
});

assert.deepEqual(selectAxisBlend(200, YAW_DEGREES), {
  angle: 80,
  lowerIndex: 6,
  upperIndex: 6,
  mix: 0,
});

const edge = selectViewBlend({
  worldX: 2160,
  zRel: 155,
  cameraY: 2340,
  objectY: 0,
  worldBounds: { minY: 0, maxY: 2000 },
});
assert.equal(edge.yaw.angle, 80);

const high = selectViewBlend({
  worldX: 0,
  zRel: 505,
  cameraY: 2340,
  objectY: 0,
  worldBounds: { minY: 0, maxY: 2000 },
});
assert.ok(Math.abs(high.pitch.angle - 69.35) < 0.1);
assert.equal(high.pitch.lowerIndex, 1);
assert.equal(high.pitch.upperIndex, 2);
~~~

Assert exact yaw + exact pitch produces one draw, interpolation on one axis produces two, and interpolation on both produces four whose weights sum to one. Mirror worldX and assert symmetric indices/mixes.

Create two metadata fixtures with identical origin-to-source offsets but different transparent cell padding. Build plans with the same projected origin and runtime X/Y pixels-per-world-unit; assert identical destinations. For every draw, reconstruct the destination world origin and assert it lands within one device pixel of 'projectedOrigin'.

Add invalid metadata cases for wrong dimensions, out-of-bounds source, non-finite origin, non-positive pixelsPerWorldUnit, and a missing frame; assert validation returns false rather than throwing during gameplay.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/world-art.test.js
~~~

Expected: failures on ±30 clamping, missing pitch rows, two-frame plan, and padding-dependent destinations.

- [ ] **Step 3: Implement non-uniform axis and view selection**

Use:

~~~js
function selectAxisBlend(angle, samples) {
  const value = Math.max(samples[0], Math.min(samples[samples.length - 1], Number(angle) || 0));
  let upperIndex = samples.findIndex((sample) => sample >= value);
  if (upperIndex < 0) upperIndex = samples.length - 1;
  const lowerIndex = Math.max(0, upperIndex - (samples[upperIndex] === value ? 0 : 1));
  if (lowerIndex === upperIndex) {
    return Object.freeze({ angle: value, lowerIndex, upperIndex, mix: 0 });
  }
  const span = samples[upperIndex] - samples[lowerIndex];
  return Object.freeze({
    angle: value,
    lowerIndex,
    upperIndex,
    mix: (value - samples[lowerIndex]) / span,
  });
}

function selectViewBlend({ worldX, zRel, cameraY, objectY = 0, worldBounds }) {
  const yawAngle = Math.atan2(Number(worldX) || 0, Math.max(1, Number(zRel) || 1)) * 180 / Math.PI;
  const centerY = objectY + (worldBounds.minY + worldBounds.maxY) / 2;
  const pitchAngle = Math.atan2(cameraY - centerY, Math.max(1, Number(zRel) || 1)) * 180 / Math.PI;
  return Object.freeze({
    yaw: selectAxisBlend(yawAngle, YAW_DEGREES),
    pitch: selectAxisBlend(pitchAngle, PITCH_DEGREES),
  });
}
~~~

Use pitch-major frame index 'pitchIndex * 7 + yawIndex'. Merge duplicate indices and omit zero weights.

- [ ] **Step 4: Implement origin-anchored per-frame destinations**

For every weighted view frame use:

~~~js
const destination = Object.freeze({
  x: projectedOrigin.x
    - (frame.origin.x - frame.source.sx) / metadata.pixelsPerWorldUnit * pixelsPerWorldUnitX,
  y: projectedOrigin.y
    - (frame.origin.y - frame.source.sy) / metadata.pixelsPerWorldUnit * pixelsPerWorldUnitY,
  width: frame.source.sw / metadata.pixelsPerWorldUnit * pixelsPerWorldUnitX,
  height: frame.source.sh / metadata.pixelsPerWorldUnit * pixelsPerWorldUnitY,
});
~~~

Compute one union 'bounds' over all destinations for culling. Clamp alpha once and multiply it by each normalized weight. Freeze nested public values.

- [ ] **Step 5: Extend geometry and variants**

Set:

~~~js
const WORLD_GEOMETRY = Object.freeze({
  drone: Object.freeze({ worldWidth: 432, worldHeight: 360, baseY: 140 }),
  turret: Object.freeze({ worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 }),
  wallLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
  wallMedium: Object.freeze({ worldWidth: 648, worldHeight: 1250, baseY: 0 }),
  wallHigh: Object.freeze({ worldWidth: 648, worldHeight: 2000, baseY: 0 }),
  corridorLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
  corridorMedium: Object.freeze({ worldWidth: 648, worldHeight: 1250, baseY: 0 }),
});
~~~

Add deterministic variant lists for 'wallMedium', 'corridorLow', and 'corridorMedium'. Keep gap metadata marked 'layout: roadEdge' and expose a direct 'roadEdgeFrame(metadata)' that returns its center source frame; do not pass it through 'buildSpriteDrawPlan()'.

- [ ] **Step 6: Run GREEN**

Run:

~~~bash
node --test tests/world-art.test.js
npm run check
~~~

Expected: PASS for ±80 yaw, approximately 69-degree high-building pitch, 1/2/4 draws, padding independence, and origin alignment.

- [ ] **Step 7: Commit**

~~~bash
git add src/world-art.js tests/world-art.test.js
git commit -m "feat: add perspective-correct atlas blending"
~~~

---

### Task 6: Upgrade the Deterministic Renderer and Manifest to the 7-by-3 Contract

**Files:**
- Modify: 'tools/world-assets.json'
- Modify: 'tools/render-world-assets.swift'
- Modify: 'tests/assets.test.js'

**Interfaces:**
- Consumes the geometry and angle contract from Task 5.
- Produces manifest schema version 3 with 'upright' and 'roadEdge' layouts.
- Produces a deterministic JSON report and a ready-to-insert JavaScript metadata block containing world bounds, pixelsPerWorldUnit, and 21 source/origin frame records for each upright atlas.
- Preserves exact upstream archive identity, licenseSource validation, and source-hash exhaustiveness.

- [ ] **Step 1: Add RED schema, geometry, view, metadata, and budget assertions**

Change the manifest contract test to require:

~~~js
assert.equal(manifest.version, 3);
assert.deepEqual(manifest.frames.upright, {
  width: 320,
  height: 320,
  yawDegrees: [-80, -55, -30, 0, 30, 55, 80],
  pitchDegrees: [20, 55, 80],
});
assert.deepEqual(manifest.frames.roadEdge, {
  width: 512,
  height: 512,
  yawDegrees: [-30, -20, -10, 0, 10, 20, 30],
});
assert.equal(manifest.budgets.upright.maxFileBytes, 3 * 1024 * 1024);
assert.equal(manifest.budgets.upright.maxCombinedBytes, 30 * 1024 * 1024);
assert.equal(manifest.budgets.upright.maxDecodedBytes, 112 * 1024 * 1024);
~~~

Require exactly twelve upright ids and one road-edge id:

~~~js
[
  'drone-scout', 'drone-striker',
  'turret-sentry', 'turret-heavy',
  'barrier-rail', 'barrier-crate',
  'structure-pylon', 'structure-bastion',
  'structure-reactor', 'structure-tower',
  'corridor-low', 'corridor-medium',
  'gap-edge',
]
~~~

Require the seven geometry envelopes from Task 5. Add renderer-report tests asserting every upright asset has 21 frames; every non-zero-alpha pixel is inside its source rect; each origin is finite; each source rect is inside its 320-by-320 cell; world origin projection round-trips; and the output PNG is 2,240 by 960. Assert decoded upright bytes equal 103,219,200 and remain below 112 MiB. Keep gap at 3,584 by 512 and test its budget separately.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/assets.test.js
swiftc -warnings-as-errors -typecheck tools/render-world-assets.swift
~~~

Expected: test failures on version 2, one-row framing, nine IDs, and old budgets; Swift still typechecks before edits.

- [ ] **Step 3: Implement the exact version-3 manifest contract**

Use:

~~~json
{
  "version": 3,
  "frames": {
    "upright": {
      "width": 320,
      "height": 320,
      "yawDegrees": [-80, -55, -30, 0, 30, 55, 80],
      "pitchDegrees": [20, 55, 80]
    },
    "roadEdge": {
      "width": 512,
      "height": 512,
      "yawDegrees": [-30, -20, -10, 0, 10, 20, 30]
    }
  },
  "budgets": {
    "upright": {
      "maxFileBytes": 3145728,
      "maxCombinedBytes": 31457280,
      "maxDecodedBytes": 117440512
    }
  }
}
~~~

Merge these keys into the existing audited upstream/sourceHashes/assets document; do not delete licenseSource, archive SHA-256, committed-license SHA-256, or selected source hashes.

- [ ] **Step 4: Render pitch-major upright frames and retain a road-edge branch**

Replace the fixed camera loop with pitch outer/yaw inner order. For upright assets:

1. Normalize opaque armor X to the declared width and Y to the declared height before adding cyan bands, orange lamps, or the high-only gold beacon.
2. Scale Z with X and center it; corridor bodies use a declared depth of 50 world units.
3. Aim the camera at the visual center for each pitch and rotate the model for each yaw.
4. Render 320-by-320 cells at one shared pixelsPerWorldUnit per asset.
5. Scan alpha greater than zero for the crop; keep alpha-at-least-16 only for visible-envelope quality assertions.
6. Record 'renderer.projectPoint(SCNVector3Zero)' as the world-origin anchor in atlas coordinates.
7. Round metadata floats to six decimal places before JSON encoding.

Keep gap-edge in a roadEdge branch that uses the existing seven 512 frames and canonical output, so its PNG can remain byte-identical.

Encode the report with these concrete Swift types:

~~~swift
struct PixelRect: Codable, Equatable {
    let sx: Int
    let sy: Int
    let sw: Int
    let sh: Int
}

struct PixelPoint: Codable, Equatable {
    let x: Double
    let y: Double
}

struct UprightFrameMetadata: Codable, Equatable {
    let source: PixelRect
    let origin: PixelPoint
}

struct WorldBoundsMetadata: Codable, Equatable {
    let minX: Double
    let maxX: Double
    let minY: Double
    let maxY: Double
    let minZ: Double
    let maxZ: Double
}

struct UprightAtlasMetadata: Codable, Equatable {
    let layout: String
    let atlasWidth: Int
    let atlasHeight: Int
    let frameWidth: Int
    let frameHeight: Int
    let yawDegrees: [Int]
    let pitchDegrees: [Int]
    let worldBounds: WorldBoundsMetadata
    let pixelsPerWorldUnit: Double
    let frames: [UprightFrameMetadata]
}
~~~

Before encoding, require 'layout == "upright"', atlas 2,240 by 960, cells
320 by 320, the exact angle arrays, positive pixelsPerWorldUnit, and exactly
21 measured frame records. The low-wall world bounds are
'(-324,324,0,600,-25,25)'; medium is
'(-324,324,0,1250,-25,25)'; high is
'(-324,324,0,2000,-25,25)'; drone is
'(-216,216,140,500,-25,25)'. Turret uses its declared 489.6-by-1,900
envelope. Corridor bounds match their low/medium height and 50-unit depth.

- [ ] **Step 5: Make renderer output deterministic runtime metadata**

Add '--metadata-js <path>' to the renderer. It writes a complete frozen
JavaScript declaration named 'GENERATED_UPRIGHT_ATLAS_DATA', ordered by the
twelve canonical ids and containing every measured frame record. Run the same
render twice and compare both JSON reports, both metadata JS files, and every
PNG. This generated block is inserted into 'src/world-art.js' in Task 7;
runtime never fetches a JSON file.

- [ ] **Step 6: Run GREEN on synthetic renderer fixtures**

Run:

~~~bash
node --test tests/assets.test.js
swiftc -warnings-as-errors -typecheck tools/render-world-assets.swift
npm run check
~~~

Expected: schema, per-frame crop/origin, view order, alpha, and budget tests pass before final PNG hashes are frozen.

- [ ] **Step 7: Commit**

~~~bash
git add tools/world-assets.json tools/render-world-assets.swift tests/assets.test.js
git commit -m "feat: render yaw and pitch atlas matrices"
~~~

---

### Task 7: Author, Render, Audit, and Freeze the Twelve Upright Assets

**Files:**
- Modify: 'tools/world-assets.json'
- Replace: 'assets/world/drone-scout.png'
- Replace: 'assets/world/drone-striker.png'
- Replace: 'assets/world/turret-sentry.png'
- Replace: 'assets/world/turret-heavy.png'
- Replace: 'assets/world/barrier-rail.png'
- Replace: 'assets/world/barrier-crate.png'
- Create: 'assets/world/structure-pylon.png'
- Create: 'assets/world/structure-bastion.png'
- Replace: 'assets/world/structure-reactor.png'
- Replace: 'assets/world/structure-tower.png'
- Create: 'assets/world/corridor-low.png'
- Create: 'assets/world/corridor-medium.png'
- Preserve unchanged: 'assets/world/gap-edge.png'
- Modify: 'src/world-art.js'
- Modify: 'tests/assets.test.js'
- Modify: 'docs/assets/world-art.md'
- Modify: 'THIRD_PARTY_NOTICES.md'

**Interfaces:**
- Produces final manifest keys:
  'droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail', 'barrierCrate', 'structurePylon', 'structureBastion', 'structureReactor', 'structureTower', 'corridorLow', 'corridorMedium', 'gapEdge'.
- Produces categories:
  'drone', 'turret', 'wallLow', 'wallMedium', 'wallHigh', 'corridorLow', 'corridorMedium', 'gap'.
- Reuses the two existing Kenney CC0 licenses; no new license file is created.

- [ ] **Step 1: Add RED exact inventory, recipe, visual-envelope, and provenance tests**

Require every upright file to be 2,240 by 960, contain 21 non-empty frames, have zero RGB under alpha zero, and satisfy its declared visible armor envelope within two world units after pixelsPerWorldUnit conversion. Require drone opaque width 432 and visible Y 140 through 500. Require low/medium/high armor bounds 648 by 600/1,250/2,000. Require the gold beacon only in wallHigh variants and cyan band counts of one/two/two-plus-gold for low/medium/high.

Require corridor-low and corridor-medium to have matching front/back conduit endpoints, continuous cyan light strips, floor plinths reaching the segment boundary, and no locale text. Require the exact thirteen-file inventory and final sourceHashes set. Continue requiring renderer SHA-256 in tests and both provenance documents.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/assets.test.js
~~~

Expected: missing four new files, old dimensions/hashes, and missing 21-frame metadata.

- [ ] **Step 3: Acquire and verify the two already approved archives outside Git**

Use a fresh temporary directory:

~~~bash
PERSPECTIVE_WORK_DIR="$(mktemp -d "/var/tmp/nebula-perspective.XXXXXX")"
mkdir -p "$PERSPECTIVE_WORK_DIR/downloads" "$PERSPECTIVE_WORK_DIR/extracted" \
  "$PERSPECTIVE_WORK_DIR/render-a" "$PERSPECTIVE_WORK_DIR/render-b"
~~~

Download only through the official Kenney asset pages recorded in 'tools/world-assets.json'. Require:

~~~text
kenney_space-kit.zip
d5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9

kenney_modular-space-kit_1.0.zip
f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc
~~~

Abort before extraction if either hash differs. Verify each extracted license against its existing 'licenseSha256' and verify every selected OBJ/MTL/texture against 'sourceHashes'.

- [ ] **Step 4: Define all distinct model recipes**

Keep the two drones and two turrets based on their current audited Kenney craft/turret sources, but normalize the drone body to 432 world units. Keep two broad low variants, two reactor/tower high variants, and add:

- 'structure-pylon': Modular Space Kit 'room-large.obj' lower armor plus
  'gate-lasers.obj' upper pylon, normalized to 648 by 1,250.
- 'structure-bastion': paired Space Kit rocket-base/rocket-sides assemblies
  around one Modular gate core, normalized to 648 by 1,250.
- 'corridor-low': repeated Space Kit 'barrels_rail.obj' armor with generated
  plinth, conduit, one cyan band, and front/back join points at Z -25/+25,
  normalized to 648 by 600.
- 'corridor-medium': Modular 'room-large.obj' body plus 'gate-lasers.obj'
  crown with generated plinth, conduit, two cyan bands, and front/back join
  points at Z -25/+25, normalized to 648 by 1,250.

Use these exact new recipe transforms; all four set 'layout' to 'upright' and
'hideNodes' to an empty array:

~~~json
[
  {
    "id": "structure-pylon",
    "sourceFamily": "kenney-modular-space-kit",
    "category": "wallMedium",
    "layout": "upright",
    "components": [
      {
        "model": "modular-space-kit/Models/OBJ format/room-large.obj",
        "material": "modular-space-kit/Models/OBJ format/room-large.mtl",
        "textures": ["modular-space-kit/Models/OBJ format/Textures/colormap.png"],
        "scale": 0.8,
        "rotationDegrees": [0, 0, 0],
        "translation": [0, 0, 0]
      },
      {
        "model": "modular-space-kit/Models/OBJ format/gate-lasers.obj",
        "material": "modular-space-kit/Models/OBJ format/gate-lasers.mtl",
        "textures": ["modular-space-kit/Models/OBJ format/Textures/colormap.png"],
        "scale": 0.74,
        "rotationDegrees": [0, 0, 0],
        "translation": [0, 0.78, 0]
      }
    ],
    "hideNodes": []
  },
  {
    "id": "structure-bastion",
    "sourceFamily": "kenney-space-kit",
    "category": "wallMedium",
    "layout": "upright",
    "components": [
      {
        "model": "space-kit/Models/OBJ format/rocket_baseA.obj",
        "material": "space-kit/Models/OBJ format/rocket_baseA.mtl",
        "textures": [],
        "scale": 0.78,
        "rotationDegrees": [0, 0, 0],
        "translation": [-0.68, 0, 0]
      },
      {
        "model": "space-kit/Models/OBJ format/rocket_sidesA.obj",
        "material": "space-kit/Models/OBJ format/rocket_sidesA.mtl",
        "textures": [],
        "scale": 0.7,
        "rotationDegrees": [0, 0, 0],
        "translation": [-0.68, 0.62, 0]
      },
      {
        "model": "space-kit/Models/OBJ format/rocket_baseA.obj",
        "material": "space-kit/Models/OBJ format/rocket_baseA.mtl",
        "textures": [],
        "scale": 0.78,
        "rotationDegrees": [0, 0, 0],
        "translation": [0.68, 0, 0]
      },
      {
        "model": "space-kit/Models/OBJ format/rocket_sidesA.obj",
        "material": "space-kit/Models/OBJ format/rocket_sidesA.mtl",
        "textures": [],
        "scale": 0.7,
        "rotationDegrees": [0, 0, 0],
        "translation": [0.68, 0.62, 0]
      },
      {
        "model": "modular-space-kit/Models/OBJ format/gate-lasers.obj",
        "material": "modular-space-kit/Models/OBJ format/gate-lasers.mtl",
        "textures": ["modular-space-kit/Models/OBJ format/Textures/colormap.png"],
        "scale": 0.68,
        "rotationDegrees": [0, 0, 0],
        "translation": [0, 0.48, 0]
      }
    ],
    "hideNodes": []
  },
  {
    "id": "corridor-low",
    "sourceFamily": "kenney-space-kit",
    "category": "corridorLow",
    "layout": "upright",
    "components": [
      {
        "model": "space-kit/Models/OBJ format/barrels_rail.obj",
        "material": "space-kit/Models/OBJ format/barrels_rail.mtl",
        "textures": [],
        "scale": 0.72,
        "rotationDegrees": [0, 0, 0],
        "translation": [-0.44, 0, 0]
      },
      {
        "model": "space-kit/Models/OBJ format/barrels_rail.obj",
        "material": "space-kit/Models/OBJ format/barrels_rail.mtl",
        "textures": [],
        "scale": 0.72,
        "rotationDegrees": [0, 0, 0],
        "translation": [0.44, 0, 0]
      }
    ],
    "generatedDetails": {
      "plinthSize": [648, 36, 50],
      "conduitSize": [36, 36, 50],
      "conduitY": 540,
      "cyanBandY": [390]
    },
    "hideNodes": []
  },
  {
    "id": "corridor-medium",
    "sourceFamily": "kenney-modular-space-kit",
    "category": "corridorMedium",
    "layout": "upright",
    "components": [
      {
        "model": "modular-space-kit/Models/OBJ format/room-large.obj",
        "material": "modular-space-kit/Models/OBJ format/room-large.mtl",
        "textures": ["modular-space-kit/Models/OBJ format/Textures/colormap.png"],
        "scale": 0.78,
        "rotationDegrees": [0, 0, 0],
        "translation": [0, 0, 0]
      },
      {
        "model": "modular-space-kit/Models/OBJ format/gate-lasers.obj",
        "material": "modular-space-kit/Models/OBJ format/gate-lasers.mtl",
        "textures": ["modular-space-kit/Models/OBJ format/Textures/colormap.png"],
        "scale": 0.7,
        "rotationDegrees": [0, 0, 0],
        "translation": [0, 0.72, 0]
      }
    ],
    "generatedDetails": {
      "plinthSize": [648, 36, 50],
      "conduitSize": [36, 36, 50],
      "conduitY": 1120,
      "cyanBandY": [460, 910]
    },
    "hideNodes": []
  }
]
~~~

Teach the renderer to accept 'generatedDetails' only for corridor categories.
Create the plinth and conduit after armor normalization at the listed world
sizes and Y positions. The runtime supplies entry/exit caps and chevrons, so
the atlas recipes do not duplicate them.

All component paths, MTL files, and textures must be present in 'sourceHashes'; remove any selected path no longer referenced because the renderer enforces exact referenced-set equality.

- [ ] **Step 5: Render twice and prove byte determinism**

Run:

~~~bash
swift tools/render-world-assets.swift \
  --manifest tools/world-assets.json \
  --source-root "$PERSPECTIVE_WORK_DIR/extracted" \
  --output "$PERSPECTIVE_WORK_DIR/render-a" \
  --metadata-js "$PERSPECTIVE_WORK_DIR/world-art-a.js" \
  > "$PERSPECTIVE_WORK_DIR/report-a.json"

swift tools/render-world-assets.swift \
  --manifest tools/world-assets.json \
  --source-root "$PERSPECTIVE_WORK_DIR/extracted" \
  --output "$PERSPECTIVE_WORK_DIR/render-b" \
  --metadata-js "$PERSPECTIVE_WORK_DIR/world-art-b.js" \
  > "$PERSPECTIVE_WORK_DIR/report-b.json"

cmp "$PERSPECTIVE_WORK_DIR/report-a.json" "$PERSPECTIVE_WORK_DIR/report-b.json"
cmp "$PERSPECTIVE_WORK_DIR/world-art-a.js" "$PERSPECTIVE_WORK_DIR/world-art-b.js"
for atlas in drone-scout drone-striker turret-sentry turret-heavy barrier-rail barrier-crate \
  structure-pylon structure-bastion structure-reactor structure-tower corridor-low corridor-medium gap-edge
do
  cmp "$PERSPECTIVE_WORK_DIR/render-a/$atlas.png" "$PERSPECTIVE_WORK_DIR/render-b/$atlas.png"
done
cmp assets/world/gap-edge.png "$PERSPECTIVE_WORK_DIR/render-a/gap-edge.png"
~~~

Expected: every comparison succeeds; gap-edge stays byte-identical.

- [ ] **Step 6: Freeze generated outputs and exact hashes**

Copy the twelve upright PNGs from render-a to their final 'assets/world' paths as generated artifacts. Insert the complete generated metadata block from 'world-art-a.js' into the marked manifest section of 'src/world-art.js'. Record the emitted renderer, selected-source, and output SHA-256 values in 'tests/assets.test.js', 'docs/assets/world-art.md', and 'THIRD_PARTY_NOTICES.md'. Do not record any temporary absolute path.

- [ ] **Step 7: Generate a contact sheet outside Git and inspect all 252 upright frames**

Create one contact sheet that groups each asset's three pitch rows and seven yaw columns. Inspect:

- opposite side exposure at -80/+80;
- visible top progression at pitch 20/55/80;
- no crop, ground float, or scale jump;
- low/medium/high silhouettes remain distinct;
- corridor endpoints align;
- drone body remains smaller than a 648-unit building and does not hide its chevron/landing marker.

Keep the contact sheet under '$PERSPECTIVE_WORK_DIR', not the repository.

- [ ] **Step 8: Run GREEN**

Run:

~~~bash
node --test tests/assets.test.js tests/world-art.test.js
swiftc -warnings-as-errors -typecheck tools/render-world-assets.swift
npm run check
git diff --check
~~~

Expected: deterministic hashes, source/license identity, alpha rules, geometry envelopes, and all budgets pass.

- [ ] **Step 9: Commit**

~~~bash
git add tools/world-assets.json tools/render-world-assets.swift src/world-art.js tests/assets.test.js \
  docs/assets/world-art.md THIRD_PARTY_NOTICES.md assets/world
git commit -m "assets: add perspective-correct defense modules"
~~~

---

### Task 8: Draw Four-frame Upright Art, Connected Corridors, and Independent Fallbacks

**Files:**
- Modify: 'src/presentation.js'
- Modify: 'src/game.js:1102-1192, 1368-1718'
- Modify: 'tests/presentation.test.js'
- Modify: 'tests/world-render.test.js'
- Modify: 'tests/game-audio-ui.test.js'

**Interfaces:**
- Consumes: the final thirteen-key manifest, 'buildSpriteDrawPlan()', 'roadEdgeFrame()', 'corridorModulePhase()', and corridor segment metadata.
- Produces correct Canvas drawing for wallMedium, low/medium corridor bodies/caps, and 432-unit drones.
- Keeps shadows, turret barrels, projectile origins, landing markers, and direction chevrons projected from world coordinates.

- [ ] **Step 1: Add RED loader validation and independent-fallback tests**

In 'tests/presentation.test.js', simulate image load with wrong naturalWidth/naturalHeight, malformed frame source, non-finite origin, and pixelsPerWorldUnit zero. Assert that exact key enters fallback while a sibling key remains loaded. Assert twelve upright images expect 2,240 by 960 and gapEdge expects 3,584 by 512. Assert final category readiness for all eight categories.

In 'tests/world-render.test.js', add:

- an exact center view that calls drawImage once;
- yaw-only and pitch-only interpolation that call twice;
- simultaneous yaw/pitch interpolation that calls four times and has total globalAlpha 1;
- a 2,000-unit edge-lane building at zRel 505 whose sources use the +55/+80 yaw columns and 55/80 pitch rows;
- left/right symmetric source columns;
- source crops with different padding that land at the same projected origin;
- a destination union smaller than one CSS pixel or fully offscreen that
  produces zero drawImage calls before four-frame expansion;
- wallMedium loaded and procedural paths at exactly 1,250 visible world height;
- low/medium corridor start/middle/end/single caps;
- destruction of a center corridor tile causing adjacent render phases to become end/start in the next frame;
- gapEdge draw calls that never invoke 'buildSpriteDrawPlan()';
- drone opaque projected width at least 27 CSS pixels at 1,280 by 800 and zRel 505;
- unchanged drone collision constants and visible warn/move chevron/landing-marker draw events.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/presentation.test.js tests/world-render.test.js tests/game-audio-ui.test.js
~~~

Expected: wrong-size images load, draw code understands only lower/upper yaw frames, medium/corridor paths are missing, and the drone uses the old destination/pivot.

- [ ] **Step 3: Validate each atlas once at load time**

In 'src/presentation.js', call 'worldArt.validateAtlasMetadata(metadata)' before creating a load record. On image onload, require:

~~~js
const dimensionsMatch = image.naturalWidth === metadata.atlasWidth
  && image.naturalHeight === metadata.atlasHeight;
~~~

Only then mark the exact key loaded. Keep 'resolveWorldAtlas()' exact-key based; do not borrow another variant when one fails.

- [ ] **Step 4: Draw the new plan around one shared world pivot**

Change 'drawWorldAtlasSprite()' to receive:

~~~js
{
  worldX,
  zRel,
  objectY,
  projectedOrigin,
  pixelsPerWorldUnitX,
  pixelsPerWorldUnitY,
  alpha,
  rotation,
}
~~~

Cull once using 'plan.bounds'. For rotation, translate to 'projectedOrigin' before rotating. Iterate 'plan.draws' and call drawImage with each exact source/destination and 'draw.alpha'. This keeps drone banking stable across crop/view changes.

Compute runtime pixel scales from the one project function:

~~~js
const origin = project(worldX, objectY, zRel);
const unitX = Math.abs(project(worldX + 1, objectY, zRel).x - origin.x);
const unitY = Math.abs(project(worldX, objectY + 1, zRel).y - origin.y);
~~~

Pass 'cameraY: CONFIG.CAMERA_HEIGHT' into the draw-plan builder.

- [ ] **Step 5: Add medium and connected corridor rendering**

Map wall types to categories:

~~~js
const WALL_CATEGORY = Object.freeze({
  WALL_LOW: 'wallLow',
  WALL_MEDIUM: 'wallMedium',
  WALL_HIGH: 'wallHigh',
});
~~~

If a segment has surviving corridor metadata in that lane, use 'corridorLow' or 'corridorMedium' instead of the short-wall category. Draw projected start/end armor caps from 'corridorModulePhase()'. Draw a continuous projected plinth/conduit/light strip only toward a surviving adjacent tile with the same id/lane/type. Draw a locale-free forward cyan chevron on the approach side of start/single.

Procedural fallback must use the same 648 width and actual 'wallHeight(type)'. Low fallback has one cyan band, medium two, and high two plus a gold beacon. Corridor fallback repeats the same bodies and projected connection/cap rules.

- [ ] **Step 6: Keep gap edges on the road plane**

In 'drawTessellatedGapEdges()', resolve gapEdge and use 'roadEdgeFrame(metadata)' directly for each already projected boundary interval. Retain quad clipping, boundary rotation, and overlap. Never call the upright draw-plan function for gap modules.

- [ ] **Step 7: Integrate the 432-unit drone without changing gameplay geometry**

Use 'WORLD_GEOMETRY.drone.worldWidth === 432' and objectY 'baseY + bob'. Rotate around the projected world origin. Leave 'CONFIG.DRONE_HEIGHT', 'HITBOX.droneHalfWidth', 'enemyLane()', warn/move timers, and direction-cue functions unchanged. Size chevrons/markers from the union plan bounds so the larger body cannot cover them.

- [ ] **Step 8: Run GREEN**

Run:

~~~bash
node --test tests/world-render.test.js tests/presentation.test.js tests/game-audio-ui.test.js \
  tests/world-art.test.js tests/assets.test.js
npm run check
~~~

Expected: PASS for 1/2/4 draws, edge-lane yaw/pitch, origin anchors, medium/corridor/fallback paths, direct gap edges, and drone readability.

- [ ] **Step 9: Commit**

~~~bash
git add src/presentation.js src/game.js tests/presentation.test.js tests/world-render.test.js \
  tests/game-audio-ui.test.js
git commit -m "feat: render connected perspective defenses"
~~~

---

### Task 9: Explain the Obstacle Language in English and Chinese

**Files:**
- Modify: 'src/i18n.js'
- Modify: 'src/presentation.js'
- Modify: 'styles/game.css'
- Modify: 'tests/i18n.test.js'
- Modify: 'tests/presentation.test.js'
- Modify: 'README.md'
- Modify: 'README.zh-CN.md'
- Modify: 'tests/static-app.test.js'

**Interfaces:**
- Produces catalog key 'guide.routes' in both locales and a single semantic 'routeGuide' paragraph in the command center.
- Expands 'controls.jump' to describe hold-to-glide.
- Preserves browser-language detection, locale persistence, and key labels.

- [ ] **Step 1: Add RED catalog, presentation, layout, and README parity tests**

Assert exact copy:

~~~js
assert.equal(en['controls.jump'], 'Jump / glide: K / Space / W / ↑ · hold while descending to glide');
assert.equal(zh['controls.jump'], '跳跃 / 滑翔：K / Space / W / ↑ · 下落时按住即可滑翔');
assert.equal(
  en['guide.routes'],
  '1 cyan band: one jump · 2 bands: two jumps · gold beacon: super-form third jump · lit corridor: jump, then hold while descending · every advanced route has an ordinary bypass lane'
);
assert.equal(
  zh['guide.routes'],
  '1 条青色灯带：一段跳 · 2 条灯带：二段跳 · 金色信标：超级形态三段跳 · 发光连排：起跳后在下落时按住 · 每条进阶路线都有普通绕行车道'
);
~~~

Assert 'createCommandCenter()' creates one route-guide paragraph, repeat renders do not duplicate it, and swapping translator updates its text. Add README parity assertions for headings '## Obstacle route language' and '## 障碍路线提示', heights 600/1,250/2,000, low optional second-jump route, medium required glide, ordinary bypass, Enter/Space, local Top 15, and 'THIRD_PARTY_NOTICES.md'.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/i18n.test.js tests/presentation.test.js tests/static-app.test.js
~~~

Expected: missing 'guide.routes', old jump copy, missing paragraph, and missing README sections.

- [ ] **Step 3: Add catalog copy and one compact semantic guide**

Add the exact strings from Step 1. In 'createCommandCenter()', create:

~~~js
const routeGuide = document.createElement('p');
routeGuide.className = 'route-guide';
controlsPanel.append(routeGuide);
~~~

Store it on the returned UI object and set 'routeGuide.textContent = t("guide.routes")' in 'renderCommandCenter()'.

Add CSS:

~~~css
.route-guide {
  max-width: 62rem;
  margin: 0.65rem auto 0;
  color: var(--text-muted);
  font-size: clamp(0.72rem, 1.35vw, 0.92rem);
  line-height: 1.45;
  text-align: center;
}
~~~

- [ ] **Step 4: Update both README files with equivalent rules**

Document:

- one cyan band = 600 and one jump;
- two cyan bands = 1,250 and two jumps;
- gold beacon = 2,000 and super-form third jump;
- low lit corridor primarily uses one jump + glide, while a skilled second jump is accepted;
- medium lit corridor requires two jumps + glide;
- every new advanced building/corridor challenge has an ordinary bypass lane;
- the existing all-lane gap challenge remains intentionally unchanged;
- Space/Enter starts and restarts, P pauses, and Top 15 remains local to the browser.

Keep the existing cross-language links, run instructions, macOS build section, and license notice.

- [ ] **Step 5: Run GREEN**

Run:

~~~bash
node --test tests/i18n.test.js tests/presentation.test.js tests/static-app.test.js
git diff --check
~~~

Expected: both locale catalogs remain key-identical and both README files describe the same gameplay without claiming low glide is mandatory.

- [ ] **Step 6: Commit**

~~~bash
git add src/i18n.js src/presentation.js styles/game.css tests/i18n.test.js \
  tests/presentation.test.js README.md README.zh-CN.md tests/static-app.test.js
git commit -m "docs: explain defense route language"
~~~

---

### Task 10: Lock Packaging Contracts and Produce Real Playable Evidence

**Files:**
- Modify: 'src/game.js:4174-4208'
- Modify: 'tests/game-audio-ui.test.js'
- Modify: 'tests/app-resources-smoke.sh'
- Modify: 'app/main.swift'
- Modify: 'tests/app-wkwebview-smoke.sh'
- Verify without modification: 'app/build.sh', 'tests/app-universal-smoke.sh', 'tests/app-signature-smoke.sh'
- Create outside Git: '/var/tmp/nebula-obstacle-review-1280x800.png'

**Interfaces:**
- Produces diagnostics 'scripts.obstacles === true', exact thirteen-atlas loaded/fallback lists, and readiness for eight categories.
- Produces a loopback gameplay URL kept alive for user review.
- Does not push or merge.

- [ ] **Step 1: Add RED diagnostics and bundle inventory assertions**

Update the browser and WKWebView expected keys to:

~~~js
[
  'droneScout', 'droneStriker',
  'turretSentry', 'turretHeavy',
  'barrierRail', 'barrierCrate',
  'structurePylon', 'structureBastion',
  'structureReactor', 'structureTower',
  'corridorLow', 'corridorMedium',
  'gapEdge',
]
~~~

Require categoryReady keys:

~~~js
['drone', 'turret', 'wallLow', 'wallMedium', 'wallHigh', 'corridorLow', 'corridorMedium', 'gap']
~~~

Add 'src/obstacles.js' and the four new PNGs to 'tests/app-resources-smoke.sh'. Require 'scripts.obstacles' in 'tests/game-audio-ui.test.js', 'app/main.swift', and 'tests/app-wkwebview-smoke.sh'.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/game-audio-ui.test.js
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
~~~

Expected: diagnostics and explicit package inventory still describe the earlier nine-atlas/five-category build.

- [ ] **Step 3: Update production diagnostics and the macOS smoke contract**

Add:

~~~js
obstacles: Boolean(globalThis.Skyroads && globalThis.Skyroads.obstacles),
~~~

to 'installDiagnostics().scripts'. Make the WKWebView JavaScript assert obstacles plus the exact key/category lists from Step 1, no fallback, initialized true, and audio ready. Keep 'app/build.sh' unchanged because it already recursively copies 'src', 'styles', and 'assets'.

- [ ] **Step 4: Run the complete fresh verification matrix**

Run:

~~~bash
npm test
npm run check
swiftc -warnings-as-errors -typecheck tools/render-world-assets.swift
git diff --check
bash tests/app-universal-smoke.sh
bash tests/app-signature-smoke.sh
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
"Nebula Cruise.app/Contents/MacOS/SkyRoads" --smoke-test | jq -e '
  .initialized == true
  and .scripts.obstacles == true
  and (.visualAssets.fallback | length) == 0
  and .audio.ready == true
'
plutil -lint "Nebula Cruise.app/Contents/Info.plist"
~~~

Expected: all Node tests pass, syntax/type checks pass, universal/signature/resource/WKWebView smoke checks pass, no atlas falls back, and the app plist is valid.

- [ ] **Step 5: Start and retain a loopback server**

Run from the worktree root:

~~~bash
python3 -m http.server 8000 --bind 127.0.0.1
~~~

Open 'http://127.0.0.1:8000/'. Wait for 'Skyroads.diagnostics.ready' and confirm initialized, obstacles script, thirteen loaded atlases, empty fallback, eight ready categories, and audio ready.

- [ ] **Step 6: Execute the manual acceptance matrix**

At 1,280-by-800 and 1,920-by-1,080, at ordinary and maximum speed, verify:

1. a near low barrier clears with one jump;
2. a medium structure clears with two jumps;
3. a high structure blocks ordinary play and clears with a super-form third jump;
4. a low corridor clears by one jump + glide and by the accepted well-timed second-jump alternative;
5. a medium corridor fails under two jumps alone and clears after two jumps + glide;
6. center, left edge, and right edge lanes show correct side/top at near, middle, and far depth without popping or anchor drift;
7. drone rest/warn/move states remain readable, the body is larger, and its chevron/landing marker stay visible;
8. after game over the restart button has focus and both Space and Enter restart; rename/leaderboard dialogs suppress the shortcut.

At 960-by-600, switch once to English and once to Chinese and verify command-center content has no horizontal or vertical overflow.

- [ ] **Step 7: Capture real implementation evidence outside Git**

Capture a 1,280-by-800 PLAYING scene that simultaneously shows an edge-lane perspective, at least two obstacle height families or a connected corridor, and the enlarged drone. Save it at:

~~~text
/var/tmp/nebula-obstacle-review-1280x800.png
~~~

Verify the file is a real browser screenshot, not the brainstorming mockup, and confirm 'git status --short' does not list it.

- [ ] **Step 8: Commit only packaging-contract changes**

~~~bash
git add src/game.js tests/game-audio-ui.test.js tests/app-resources-smoke.sh \
  app/main.swift tests/app-wkwebview-smoke.sh
git commit -m "test: lock perspective defense release contracts"
~~~

- [ ] **Step 9: Review the branch and hand the build to the user**

Run:

~~~bash
git status --short --branch
git log --oneline origin/feat/stellar-command-polish..HEAD
git diff --stat origin/feat/stellar-command-polish...HEAD
~~~

Expected: the worktree is clean except ignored local tooling, all new commits are local, the loopback server remains available, and no push or merge has occurred. Show the screenshot and loopback URL to the user and wait for explicit approval before pushing updates to pull request #1.

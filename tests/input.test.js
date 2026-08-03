const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  createMovementState,
  pressDirection,
  releaseDirection,
  requestDiscreteLaneChange,
  advanceMovement,
  clearHeldDirections,
  directionForCode,
  shouldHandleGameInput,
  intervalsOverlap,
  sweptPointDistance,
  sweptIntervalsOverlap,
  laneTileContaining,
  hitboxHalfWidthForEnemy,
  findIntersectedWallLane,
} = require('../src/input.js');

function createGameLogicHarness() {
  const root = path.resolve(__dirname, '..');
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 960, innerHeight: 600, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now() { return 0; } },
    requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of ['src/input.js', 'src/presentation.js', 'src/world-art.js', 'src/obstacles.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(gameSource, sandbox, { filename: 'src/game.js' });
  vm.runInContext(`
    globalThis.__deaths = [];
    die = (reason) => { __deaths.push(reason); };
    shotBurstFx = () => {};
    buildingBurstFx = () => {};
    superMissileBlast = (segment) => {
      const target = STATE.track[Math.floor(segment)];
      if (!target) return;
      for (let lane = 0; lane < CONFIG.LANES; lane++) {
        if (Skyroads.obstacles.isWallType(target.lanes[lane])) {
          target.lanes[lane] = LANE_TYPE.ROAD;
        }
      }
    };
    sfxJump = () => {};
    sfxDoubleJump = () => {};
    sfxWallDown = () => {};
    sfxEnemyDown = () => {};
  `, sandbox);
  return sandbox;
}

function runAirbornePhysics(sandbox, {
  playerY,
  playerVY,
  jumpHeld,
  fuel,
  powered = false,
}) {
  Object.assign(sandbox, { __playerY: playerY, __playerVY: playerVY, __jumpHeld: jumpHeld, __fuel: fuel, __powered: powered });
  return JSON.parse(vm.runInContext(`(() => {
    STATE.mode = 'PLAYING';
    STATE.position = 0;
    STATE.speed = 0;
    STATE.playerY = __playerY;
    STATE.playerVY = __playerVY;
    STATE.fuel = __fuel;
    STATE.tripleT = __powered ? 1 : 0;
    STATE.shots = [];
    STATE.track = [{ lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD), enemies: null }];
    if (__jumpHeld) KEYS.KeyK = true;
    else delete KEYS.KeyK;
    extendTrack = () => {};
    updateEnemies = () => {};
    advanceShots = () => {};
    checkCollisions = () => {};
    const beforeVY = STATE.playerVY;
    updatePhysics(0.01);
    return JSON.stringify({
      gliding: STATE.gliding,
      gravityDelta: beforeVY - STATE.playerVY,
    });
  })()`, sandbox));
}

test('gameplay input is disabled while UI owns keyboard focus', () => {
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:false, modalOpen:false }), true);
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:true, modalOpen:false }), false);
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:false, modalOpen:true }), false);
  assert.equal(shouldHandleGameInput({ mode:'MENU', targetInsideAppUi:false, modalOpen:false }), false);
});

test('tap completes exactly one lane in 145ms', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  releaseDirection(state, 1);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3.5);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('hold carries leftover time into an 85ms repeat segment', () => {
  const state = createMovementState(1);
  pressDirection(state, 1);
  advanceMovement(state, 187.5);
  assert.equal(state.lanePosition, 2.5);
});

test('opposite press reverses without a position jump', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 72.5);
  const before = state.lanePosition;
  const result = pressDirection(state, -1);
  assert.equal(result.reversed, true);
  assert.equal(state.lanePosition, before);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3);
});

test('zero-progress opposite press cancels the stale segment', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  const result = pressDirection(state, -1);
  assert.equal(result.reversed, true);
  assert.equal(state.lanePosition, 3);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3);
  assert.equal(state.activeDirection, -1);
});

test('first segment completes at 145ms, not 144ms', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  releaseDirection(state, 1);
  advanceMovement(state, 144);
  assert.ok(state.lanePosition < 4);
  advanceMovement(state, 1);
  assert.equal(state.lanePosition, 4);
});

test('hold shorter than 140ms does not repeat', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 139);
  releaseDirection(state, 1);
  advanceMovement(state, 6);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('holding through the delay starts repeat at the first boundary', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 145);
  assert.equal(state.lanePosition, 4);
  assert.equal(state.segmentActive, true);
  assert.equal(state.segmentTarget, 5);
  assert.equal(state.segmentDurationMs, 85);
});

test('same timeline is frame-rate independent', () => {
  const run = (frameDurationMs) => {
    const state = createMovementState(1);
    pressDirection(state, 1);
    let remainingMs = 187.5;
    while (remainingMs > 0) {
      const deltaMs = Math.min(frameDurationMs, remainingMs);
      advanceMovement(state, deltaMs);
      remainingMs -= deltaMs;
    }
    return state.lanePosition;
  };

  assert.ok(Math.abs(run(187.5) - 2.5) <= 1e-9);
  assert.ok(Math.abs(run(1000 / 30) - 2.5) <= 1e-9);
  assert.ok(Math.abs(run(1000 / 60) - 2.5) <= 1e-9);
  assert.ok(Math.abs(run(1000 / 120) - 2.5) <= 1e-9);
});

test('release during repeat finishes the current lane and discards future lanes', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 160);
  releaseDirection(state, 1);
  advanceMovement(state, 70);
  assert.equal(state.lanePosition, 5);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 5);
});

test('last pressed wins and releasing it restores the still-held direction', () => {
  const state = createMovementState(3);
  pressDirection(state, -1);
  advanceMovement(state, 72.5);
  pressDirection(state, 1);
  const before = state.lanePosition;
  const result = releaseDirection(state, 1);
  assert.equal(result.reversed, true);
  assert.equal(state.activeDirection, -1);
  assert.equal(state.lanePosition, before);
});

test('edge hold starts no segment', () => {
  const state = createMovementState(0);
  const pressed = pressDirection(state, -1);
  const advanced = advanceMovement(state, 500);
  assert.equal(pressed.started, false);
  assert.equal(state.lanePosition, 0);
  assert.equal(state.segmentActive, false);
  assert.equal(advanced.segmentsStarted, 0);
});

test('clear held directions prevents sticky movement', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 100);
  clearHeldDirections(state);
  advanceMovement(state, 45);
  assert.equal(state.lanePosition, 4);
  assert.equal(state.segmentActive, false);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('touch requests one lane and never repeat', () => {
  const state = createMovementState(3);
  assert.deepEqual(requestDiscreteLaneChange(state, 1), { started: true });
  assert.deepEqual(requestDiscreteLaneChange(state, 1), { started: false });
  advanceMovement(state, 145);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('directionForCode maps only ArrowLeft/KeyA/ArrowRight/KeyD', () => {
  assert.equal(directionForCode('ArrowLeft'), -1);
  assert.equal(directionForCode('KeyA'), -1);
  assert.equal(directionForCode('ArrowRight'), 1);
  assert.equal(directionForCode('KeyD'), 1);
  for (const code of ['a', 'd', 'ArrowUp', 'KeyW', '', null]) {
    assert.equal(directionForCode(code), 0);
  }
});

test('wall sweep catches crossing overlap but permits visible clearance', () => {
  assert.equal(sweptIntervalsOverlap(3, 3.5, 0.14, 4, 0.42), true);
  assert.equal(sweptIntervalsOverlap(3, 3.43, 0.14, 4, 0.42), false);
});

test('pickup sweep uses the 0.38-lane radius', () => {
  assert.ok(sweptPointDistance(3, 3.62, 4) <= 0.38 + Number.EPSILON);
  assert.ok(sweptPointDistance(3, 3.61, 4) > 0.38);
});

test('gap support changes at the lane midpoint', () => {
  assert.equal(laneTileContaining(3.49), 3);
  assert.equal(laneTileContaining(3.50), 4);
});

test('projectile at a floating position returns an integer wall lane', () => {
  const lanes = ['road', 'road', 'road', 'road', 'wall-high', 'road', 'road'];
  assert.equal(findIntersectedWallLane(lanes, 3.50), 4);
});

test('enemy hitboxes overlap at the exact rendered-width boundaries', () => {
  assert.equal(hitboxHalfWidthForEnemy('drone'), 0.22);
  assert.equal(intervalsOverlap(3, 0.14, 3.36, 0.22), true);
  assert.equal(intervalsOverlap(3, 0.14, 3.360001, 0.22), false);
  assert.equal(hitboxHalfWidthForEnemy('turret'), 0.26);
  assert.equal(intervalsOverlap(3, 0.14, 3.40, 0.26), true);
  assert.equal(intervalsOverlap(3, 0.14, 3.400001, 0.26), false);
});

test('hazard collision constants include all three approved wall heights and gap-safe 200', () => {
  const sandbox = createGameLogicHarness();
  const outcomes = JSON.parse(vm.runInContext(`(() => {
    const collide = (type, height) => {
      STATE.position = 0;
      STATE.fuel = 100;
      STATE.boostT = 0;
      STATE.playerY = height;
      STATE.track = [{ lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD), enemies: null }];
      STATE.track[0].lanes[3] = type;
      __deaths.length = 0;
      checkCollisions(3, 3);
      return __deaths[0] || null;
    };
    return JSON.stringify({
      constants: [CONFIG.WALL_LOW_HEIGHT, CONFIG.WALL_MEDIUM_HEIGHT, CONFIG.WALL_HIGH_HEIGHT, CONFIG.GAP_SAFE_HEIGHT, CONFIG.FUEL_COLLECT_HEIGHT],
      lowAt: collide(LANE_TYPE.WALL_LOW, 600),
      lowAbove: collide(LANE_TYPE.WALL_LOW, 600 + Number.EPSILON * 4096),
      highAt: collide(LANE_TYPE.WALL_HIGH, 2000),
      highAbove: collide(LANE_TYPE.WALL_HIGH, 2000 + Number.EPSILON * 16384),
      gapBelow: collide(LANE_TYPE.GAP, 200 - Number.EPSILON * 1024),
      gapAt: collide(LANE_TYPE.GAP, 200),
    });
  })()`, sandbox));
  assert.deepEqual(outcomes.constants, [600, 1250, 2000, 200, 600]);
  assert.equal(outcomes.lowAt, 'wall');
  assert.equal(outcomes.lowAbove, null);
  assert.equal(outcomes.highAt, 'wall');
  assert.equal(outcomes.highAbove, null);
  assert.equal(outcomes.gapBelow, 'gap');
  assert.equal(outcomes.gapAt, null);
});

for (const [type, height] of [
  ['WALL_LOW', 600],
  ['WALL_MEDIUM', 1250],
  ['WALL_HIGH', 2000],
]) {
  test(type + ' collision is strict at its approved height', () => {
    const sandbox = createGameLogicHarness();
    Object.assign(sandbox, { __wallType: type, __wallHeight: height });
    vm.runInContext(`
      STATE.track = [{ lanes: new Array(7).fill('ROAD'), enemies: null }];
      STATE.track[0].lanes[3] = __wallType;
      STATE.position = 0;
      STATE.fuel = 100;
      STATE.boostT = 0;
      STATE.movement.lanePosition = 3;
      STATE.playerY = __wallHeight;
      __deaths.length = 0;
      checkCollisions(3, 3);
    `, sandbox);
    assert.deepEqual(Array.from(sandbox.__deaths), ['wall']);
    vm.runInContext(`
      __deaths.length = 0;
      STATE.playerY = __wallHeight + Number.EPSILON * __wallHeight;
      checkCollisions(3, 3);
    `, sandbox);
    assert.deepEqual(Array.from(sandbox.__deaths), []);
  });
}

test('ordinary flight rejects a third jump', () => {
  const sandbox = createGameLogicHarness();
  const result = JSON.parse(vm.runInContext(`(() => {
    STATE.playerY = 500;
    STATE.playerVY = -100;
    STATE.jumpsUsed = 2;
    STATE.tripleT = 0;
    STATE.fuel = 10;
    tryJump();
    return JSON.stringify({ jumpsUsed: STATE.jumpsUsed, playerVY: STATE.playerVY, fuel: STATE.fuel });
  })()`, sandbox));
  assert.deepEqual(result, { jumpsUsed: 2, playerVY: -100, fuel: 10 });
});

test('super flight accepts a third jump', () => {
  const sandbox = createGameLogicHarness();
  const result = JSON.parse(vm.runInContext(`(() => {
    STATE.playerY = 500;
    STATE.playerVY = -100;
    STATE.jumpsUsed = 2;
    STATE.tripleT = 1;
    STATE.fuel = 10;
    tryJump();
    return JSON.stringify({ jumpsUsed: STATE.jumpsUsed, playerVY: STATE.playerVY });
  })()`, sandbox));
  assert.deepEqual(result, { jumpsUsed: 3, playerVY: 7500 });
});

for (const [label, jumpsUsed, powered] of [
  ['second', 1, false],
  ['third', 2, true],
]) {
  test(label + ' jump consumes exactly 3 fuel', () => {
    const sandbox = createGameLogicHarness();
    Object.assign(sandbox, { __jumpsUsed: jumpsUsed, __powered: powered });
    const fuel = vm.runInContext(`(() => {
      STATE.playerY = 500;
      STATE.playerVY = -100;
      STATE.jumpsUsed = __jumpsUsed;
      STATE.tripleT = __powered ? 1 : 0;
      STATE.fuel = 10;
      tryJump();
      return STATE.fuel;
    })()`, sandbox);
    assert.equal(fuel, 7);
  });
}

test('glide gravity requires airborne descent, a held jump, and positive fuel', () => {
  const gliding = runAirbornePhysics(createGameLogicHarness(), {
    playerY: 1000, playerVY: -100, jumpHeld: true, fuel: 50,
  });
  assert.equal(gliding.gliding, true);
  assert.ok(Math.abs(gliding.gravityDelta - 25.6) <= 1e-9);

  for (const conditions of [
    { playerY: 0, playerVY: -100, jumpHeld: true, fuel: 50 },
    { playerY: 1000, playerVY: 100, jumpHeld: true, fuel: 50 },
    { playerY: 1000, playerVY: -100, jumpHeld: false, fuel: 50 },
    { playerY: 1000, playerVY: -100, jumpHeld: true, fuel: 0 },
  ]) {
    const result = runAirbornePhysics(createGameLogicHarness(), conditions);
    assert.equal(result.gliding, false);
  }
});

test('ordinary and super glide gravity factors remain 0.08 and 0.045', () => {
  const ordinary = runAirbornePhysics(createGameLogicHarness(), {
    playerY: 1000, playerVY: -100, jumpHeld: true, fuel: 50,
  });
  const powered = runAirbornePhysics(createGameLogicHarness(), {
    playerY: 1000, playerVY: -100, jumpHeld: true, fuel: 50, powered: true,
  });
  assert.ok(Math.abs(ordinary.gravityDelta - 32000 * 0.08 * 0.01) <= 1e-9);
  assert.ok(Math.abs(powered.gravityDelta - 32000 * 0.045 * 0.01) <= 1e-9);
});

test('full gaps cap at three and bridge runs remain two to five segments on a reachable lane', () => {
  const sandbox = createGameLogicHarness();
  const result = JSON.parse(vm.runInContext(`(() => {
    const withRandom = (values, callback) => {
      const previous = Math.random;
      let index = 0;
      Math.random = () => index < values.length ? values[index++] : 1;
      try { return callback(); } finally { Math.random = previous; }
    };
    const makeBridge = (lengthRandom) => withRandom([1, 0, 1, 0.5, lengthRandom, 1], () => {
      const gen = newGenState();
      const originalSafeLane = gen.safeLane;
      const segments = [generateSegment(2024, gen)];
      while (gen.bridgeLeft > 0) segments.push(generateSegment(2024 + segments.length, gen));
      const roadLanes = segments.map((segment) => segment.lanes
        .map((type, lane) => type === LANE_TYPE.GAP ? null : lane).filter((lane) => lane !== null));
      return { originalSafeLane, bridgeLane: gen.bridgeLane, roadLanes };
    });
    const gapGen = newGenState();
    gapGen.gapRun = 2;
    const capped = withRandom([0, 0], () => [
      generateSegment(2024, gapGen),
      generateSegment(2025, gapGen),
    ]);
    const landingLane = (safeLane, random) => {
      const gen = newGenState();
      gen.gapRun = CONFIG.MAX_GAP_RUN;
      gen.safeLane = safeLane;
      const segment = withRandom([random], () => generateSegment(2024, gen));
      return segment.lanes.findIndex((type) => type === LANE_TYPE.FUEL);
    };
    return JSON.stringify({
      constants: [CONFIG.MAX_GAP_RUN, CONFIG.FULL_GAP_MIN_INDEX, CONFIG.BRIDGE_MIN_INDEX],
      shortest: makeBridge(0),
      longest: makeBridge(0.999999),
      cappedGapCounts: capped.map((segment) => segment.lanes.filter((type) => type === LANE_TYPE.GAP).length),
      leftLanding: landingLane(0, 0.999999),
      rightLanding: landingLane(6, 0),
    });
  })()`, sandbox));
  assert.deepEqual(result.constants, [3, 100, 100]);
  assert.equal(result.shortest.roadLanes.length, 2);
  assert.equal(result.longest.roadLanes.length, 5);
  for (const bridge of [result.shortest, result.longest]) {
    assert.ok(Math.abs(bridge.bridgeLane - bridge.originalSafeLane) <= 1);
    assert.ok(bridge.roadLanes.every((lanes) => lanes.length === 1 && lanes[0] === bridge.bridgeLane));
  }
  assert.deepEqual(result.cappedGapCounts, [7, 0]);
  assert.ok(result.leftLanding >= 0 && result.leftLanding <= 2);
  assert.ok(result.rightLanding >= 4 && result.rightLanding <= 6);
});

test('ordinary bullets use each wall tier strict height rule', () => {
  const sandbox = createGameLogicHarness();
  const outcomes = JSON.parse(vm.runInContext(`(() => {
    const fire = (wallType, kind, height, powered = false) => {
      STATE.position = 0;
      STATE.speed = 0;
      STATE.tripleT = powered ? 1 : 0;
      STATE.track = Array.from({ length: 20 }, (_, index) => ({
        index, lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD), enemies: null,
      }));
      STATE.track[10].lanes[3] = wallType;
      STATE.shots = [{ kind, lanePosition: 3, y: height, seg: 10.2 }];
      advanceShots(0);
      return { shots: STATE.shots.length, tile: STATE.track[10].lanes[3] };
    };
    return JSON.stringify([
      fire('WALL_LOW', 'bullet', 600),
      fire('WALL_LOW', 'bullet', 600.01),
      fire('WALL_MEDIUM', 'bullet', 1250),
      fire('WALL_MEDIUM', 'bullet', 1250.01),
      fire('WALL_HIGH', 'bullet', 2500),
    ]);
  })()`, sandbox));
  assert.deepEqual(outcomes.map((outcome) => outcome.shots === 0), [true, false, true, false, true]);
});

test('ordinary missile, super bullet, and super area missile destroy a medium wall', () => {
  const sandbox = createGameLogicHarness();
  const outcomes = JSON.parse(vm.runInContext(`(() => {
    const fire = (kind, powered) => {
      STATE.position = 0;
      STATE.speed = 0;
      STATE.tripleT = powered ? 1 : 0;
      STATE.track = Array.from({ length: 20 }, (_, index) => ({
        index, lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD), enemies: null,
      }));
      STATE.track[10].lanes[3] = 'WALL_MEDIUM';
      STATE.shots = [{ kind, lanePosition: 3, y: 0, seg: 10.2 }];
      advanceShots(0);
      return STATE.track[10].lanes[3];
    };
    return JSON.stringify({
      ordinaryMissile: fire('missile', false),
      superBullet: fire('bullet', true),
      superAreaMissile: fire('missile', true),
    });
  })()`, sandbox));
  assert.deepEqual(outcomes, {
    ordinaryMissile: 'ROAD',
    superBullet: 'ROAD',
    superAreaMissile: 'ROAD',
  });
});

test('speed-24 swept collision checks every tile in an eighteen-segment medium corridor', () => {
  const sandbox = createGameLogicHarness();
  const outcomes = JSON.parse(vm.runInContext(`(() => {
    const traverse = (height, stopOnDeath) => {
      STATE.track = Array.from({ length: 18 }, (_, index) => ({
        index,
        lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD),
        enemies: null,
      }));
      for (const segment of STATE.track) segment.lanes[3] = LANE_TYPE.WALL_MEDIUM;
      STATE.position = 0.1;
      STATE.fuel = 100;
      STATE.boostT = 0;
      STATE.playerY = height;
      STATE.movement.lanePosition = 3;
      __deaths.length = 0;
      let steps = 0;
      let largestStep = 0;
      while (STATE.position < 18) {
        const stepDistance = Math.min(24 / 48, 18 - STATE.position);
        STATE.position += stepDistance;
        largestStep = Math.max(largestStep, stepDistance);
        checkCollisions(3, 3);
        steps++;
        if (stopOnDeath && __deaths.length > 0) break;
      }
      return {
        deaths: __deaths.slice(),
        finalPosition: STATE.position,
        largestStep,
        steps,
      };
    };
    return JSON.stringify({
      blocked: traverse(1250, true),
      clear: traverse(1250.01, false),
    });
  })()`, sandbox));
  assert.deepEqual(outcomes.blocked.deaths, ['wall']);
  assert.equal(outcomes.blocked.finalPosition, 0.6);
  assert.ok(outcomes.blocked.largestStep <= 0.5);
  assert.deepEqual(outcomes.clear.deaths, []);
  assert.equal(outcomes.clear.finalPosition, 18);
  assert.equal(outcomes.clear.steps, 36);
  assert.ok(outcomes.clear.largestStep <= 0.5);
});

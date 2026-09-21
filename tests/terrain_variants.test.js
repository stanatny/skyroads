'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const terrain = require('../src/flight_terrain');
const root = path.resolve(__dirname, '..');

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

// 调用真实输入与游戏物理；只有声音、粒子和死亡 UI 被隔离。
function createHarness(position = 160, lane = 3, speed = 8) {
  const sandbox = {
    console, navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now: () => 0 }, requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of ['input.js', 'presentation.js', 'world-art.js', 'obstacles.js', 'gap-regions.js', 'flight_dimensions.js', 'flight_terrain.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox, { filename: file });
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, updatePhysics, tryJump, enableFlightTerrain,
      newGenState, generateSegment };
    syncPropulsionAudio = () => {};
    shotBurstFx = () => {};
    buildingBurstFx = () => {};
    die = reason => { STATE.mode = 'GAMEOVER'; globalThis.death = reason; };
  `, sandbox);
  const { STATE: state, CONFIG: config } = sandbox.game;
  Object.assign(state, { mode: 'PLAYING', position, speed, playerY: 0, playerVY: 0,
    jumpsUsed: 0, fuel: config.FUEL_MAX, tutorial: null,
    movement: sandbox.Skyroads.input.createMovementState(lane),
    track: Array.from({ length: 3000 }, (_, index) => ({ index, lanes: Array(7).fill('ROAD'), enemies: [] })),
  });
  sandbox.game.enableFlightTerrain();
  // 几何运动回归使用空路，断桥测试单独保留真实装饰结果。
  const decorated = state.track;
  state.track = decorated.map((segment) => ({ ...segment, lanes: Array(7).fill('ROAD'), enemies: [] }));
  return { sandbox, state, config, game: sandbox.game, decorated,
    press(direction) { return sandbox.Skyroads.input.pressDirection(state.movement, direction); },
    release(direction) { return sandbox.Skyroads.input.releaseDirection(state.movement, direction); },
    tick(frames = 1, dt = 1 / 240) {
      for (let frame = 0; frame < frames && state.mode === 'PLAYING'; frame += 1) sandbox.game.updatePhysics(dt);
    },
  };
}

function hostileSegment(index) {
  return { index, lanes: Array(7).fill('WALL_HIGH'),
    enemies: Array.from({ length: 7 }, (_, lane) => ({ type: 'turret', lane }))
      .concat({ type: 'drone', lane: 2, fromLane: 2, toLane: 3 }) };
}

test('alternating raised routes and three valley depths are deterministic across cycles', () => {
  const valleys = new Set();
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const start = terrain.TUNING.start + cycle * terrain.TUNING.period;
    const route = terrain.routeAt(start + 80);
    const branch = terrain.sample(start + 112, route.branchLanes[0]);
    const secondary = terrain.sample(start + 80, route.secondaryLanes[0]);
    assert.ok(branch.offset >= 600 && branch.offset <= 780);
    assert.ok(secondary.offset >= 360 && secondary.offset <= 480);
    assert.equal(terrain.sample(start + 112, route.secondaryLanes[0]).offset, 0);
    valleys.add(terrain.heightAt(start + 212, 3));
    for (let phase = 0; phase < terrain.TUNING.period; phase += 0.37) {
      for (const lane of [0, 1, 3, 5, 6]) {
        const sample = terrain.sample(start + phase, lane);
        assert.deepEqual(sample, terrain.sample(start + phase, lane));
        assert.ok(Number.isFinite(sample.height) && Number.isFinite(sample.slope));
        assert.ok(Math.abs(sample.slope) <= 90.001);
      }
    }
  }
  assert.deepEqual([...valleys].sort((a, b) => a - b), [-900, -750, -600]);
});

test('secondary ramps and valley seams remain continuous while intentional bridge drops stay explicit', () => {
  for (let cycle = 0; cycle < 9; cycle += 1) {
    const start = terrain.TUNING.start + cycle * terrain.TUNING.period;
    for (const phase of [0, 16, 42, 56, 72, 84, 96, 112, 132, 176, 184, 212, 240]) {
      for (let lane = 0; lane < 7; lane += 1) {
        close(terrain.heightAt(start + phase - 1e-7, lane), terrain.heightAt(start + phase + 1e-7, lane), 0.0001);
      }
    }
    const route = terrain.routeAt(start + 143);
    for (let lane = 0; lane < 7; lane += 1) {
      const tile = terrain.sampleTile(start + 143, lane);
      assert.equal(tile.dropAtEnd, route.branchLanes.includes(lane));
      if (tile.dropAtEnd) assert.ok(tile.farHeight - terrain.heightAt(start + 144, lane) >= 599.99);
    }
    close(terrain.heightAt(start + 240, 3), 0);
    close(terrain.sample(start + 240, 3).slope, 0);
  }
});

test('decorated routes preserve a center bypass, alternate two-segment bridge gaps and retain challenge obstacles', () => {
  for (let cycle = 0; cycle < 8; cycle += 1) {
    const start = terrain.TUNING.start + cycle * terrain.TUNING.period;
    const gapRuns = [];
    let run = null;
    for (let phase = terrain.TUNING.safeStart; phase < terrain.TUNING.period; phase += 1) {
      const index = start + phase;
      const route = terrain.routeAt(index);
      const source = hostileSegment(index);
      const before = JSON.stringify(source);
      const segment = terrain.decorateSegment(source);
      assert.equal(JSON.stringify(source), before);
      assert.ok(route.safeLanes.includes(3));
      assert.equal(segment.lanes[3], 'ROAD');
      assert.ok(!segment.enemies.some((enemy) => enemy.lane === 3));
      for (const enemy of segment.enemies) {
        if (enemy.type === 'drone') assert.ok(terrain.dronePatrolLanes(segment).includes(enemy.lane));
      }
      for (const lane of route.safeLanes) {
        assert.ok(!/^WALL_|^GAP$/.test(segment.lanes[lane]));
        assert.ok(!segment.enemies.some((enemy) => enemy.lane === lane));
      }
      if (route.gapLane !== null) {
        assert.equal(segment.lanes[route.gapLane], 'GAP');
        const other = route.branchLanes.find((lane) => lane !== route.gapLane);
        assert.ok(route.safeLanes.includes(other));
        if (!run || run.lane !== route.gapLane || run.last !== index - 1) {
          run = { lane: route.gapLane, length: 0, last: index };
          gapRuns.push(run);
        }
        run.length += 1; run.last = index;
      }
    }
    assert.equal(gapRuns.length, 2);
    assert.ok(gapRuns.every((gap) => gap.length === 2));
    assert.notEqual(gapRuns[0].lane, gapRuns[1].lane);
    const challenge = terrain.decorateSegment(hostileSegment(start + 120));
    assert.ok(challenge.lanes.some((type) => type === 'WALL_HIGH'));
    assert.ok(challenge.enemies.some((enemy) => enemy.type === 'turret'));
  }
});

test('each optional two-segment gap is reachable by one real jump at minimum and maximum speed', () => {
  for (const cycle of [0, 1, 5]) {
    for (const phase of [108, 126]) {
      for (const speed of [8, 24]) {
        const gapStart = terrain.TUNING.start + cycle * terrain.TUNING.period + phase;
        const lane = terrain.routeAt(gapStart).gapLane;
        const harness = createHarness(gapStart - speed * 0.07, lane, speed);
        const { state, game } = harness;
        state.track = harness.decorated.map((segment) => ({ ...segment,
          lanes: segment.lanes.map((type) => type === 'GAP' ? type : 'ROAD') }));
        game.tryJump();
        let crossed = false;
        for (let frame = 0; frame < 360 && state.mode === 'PLAYING'; frame += 1) {
          harness.tick();
          if (state.position >= gapStart && state.position < gapStart + 2) {
            crossed = true;
            assert.ok(state.playerY >= harness.config.GAP_SAFE_HEIGHT);
          }
          if (state.position > gapStart + 2 && state.playerY === 0) break;
        }
        assert.equal(state.mode, 'PLAYING', `cycle ${cycle}, gap ${phase}, speed ${speed}: ${harness.sandbox.death}`);
        assert.equal(crossed, true);
        assert.ok(state.position > gapStart + 2);
        assert.equal(state.playerY, 0);
        assert.equal(state.jumpsUsed, 0);
      }
    }
  }
});

test('grounded travel follows the entire valley and rejoins the next cycle without falling or teleporting', () => {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const start = terrain.TUNING.start + cycle * terrain.TUNING.period;
    const harness = createHarness(start + 180, 3, 24);
    let previousY = harness.state.groundHeight;
    let minimum = previousY;
    while (harness.state.position < start + terrain.TUNING.period + 2 && harness.state.mode === 'PLAYING') {
      harness.tick(1, 1 / 60);
      const { state } = harness;
      close(state.groundHeight, terrain.heightAt(state.position, 3));
      assert.equal(state.playerY, 0);
      assert.equal(state.playerVY, 0);
      assert.ok(Math.abs(state.groundHeight - previousY) < 40);
      minimum = Math.min(minimum, state.groundHeight);
      previousY = state.groundHeight;
    }
    assert.equal(harness.state.mode, 'PLAYING');
    assert.ok(minimum < -590 - cycle * 150);
    close(harness.state.groundHeight, 0);
  }
});

test('leaving either elevated side falls naturally across consecutive substeps without hitting its trailing edge', () => {
  for (const cycle of [0, 1]) {
    const start = terrain.TUNING.start + cycle * terrain.TUNING.period;
    const direction = cycle === 0 ? 1 : -1;
    const harness = createHarness(start + 112, cycle === 0 ? 1.25 : 4.75, 8);
    const { state } = harness;
    const initialGround = state.groundHeight;
    harness.press(direction);
    let fallingFrames = 0;
    let movedOutside = false;
    for (let frame = 0; frame < 90; frame += 1) {
      harness.tick();
      assert.equal(state.mode, 'PLAYING');
      if (state.groundHeight < initialGround - 500) {
        movedOutside = true;
        if (state.playerY > 0) fallingFrames += 1;
      }
    }
    assert.equal(movedOutside, true);
    assert.ok(fallingFrames > 12);
    assert.equal(state.playerY, 0);
    assert.equal(state.jumpsUsed, 0);
  }
});

test('holding into either higher side stops at the physical edge while longitudinal movement continues', () => {
  for (const cycle of [0, 1]) {
    const position = terrain.TUNING.start + cycle * terrain.TUNING.period + 112;
    const direction = cycle === 0 ? -1 : 1;
    const lane = cycle === 0 ? 2 : 4;
    const harness = createHarness(position, lane, 8);
    const { state } = harness;
    harness.press(direction);
    harness.tick(90);
    assert.equal(state.mode, 'PLAYING');
    const expected = cycle === 0 ? 1.5 + terrain.TUNING.terrainSideHalfWidth + 1e-6
      : 4.5 - terrain.TUNING.terrainSideHalfWidth - 1e-6;
    close(state.movement.lanePosition, expected);
    assert.ok(state.position > position + 2);
    assert.equal(state.playerY, 0);
    assert.equal(state.playerVY, 0);
    assert.equal(direction < 0 ? state.movement.heldLeft : state.movement.heldRight, true);
    const blockedPosition = state.movement.lanePosition;
    harness.press(-direction);
    harness.tick(35);
    assert.equal(state.mode, 'PLAYING');
    assert.ok((state.movement.lanePosition - blockedPosition) * direction < -0.2);
  }
});

test('a held direction resumes from a blocked edge once a normal jump clears the platform', () => {
  for (const cycle of [0, 1, 3]) {
    const position = terrain.TUNING.start + cycle * terrain.TUNING.period + 112;
    const direction = cycle % 2 === 0 ? -1 : 1;
    const lane = direction < 0 ? 2 : 4;
    const harness = createHarness(position, lane, 8);
    const { state, game } = harness;
    harness.press(direction);
    harness.tick(50);
    assert.equal(state.mode, 'PLAYING');
    const lowGround = state.groundHeight;
    game.tryJump();
    let reachedHigher = false;
    for (let frame = 0; frame < 130 && state.mode === 'PLAYING'; frame += 1) {
      harness.tick();
      if (state.groundHeight > lowGround + 500) reachedHigher = true;
    }
    assert.equal(state.mode, 'PLAYING');
    assert.equal(reachedHigher, true);
    assert.equal(state.playerY, 0);
    assert.equal(state.jumpsUsed, 0);
  }
});

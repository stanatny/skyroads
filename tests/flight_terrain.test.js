'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const terrain = require('../src/flight_terrain');

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

// 运行真实游戏子步、跳跃与生成器；只替换音效和死亡展示，避免依赖浏览器。
function createHarness() {
  const context = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now() { return 0; } }, requestAnimationFrame() {},
  };
  vm.createContext(context);
  const root = path.resolve(__dirname, '..');
  for (const file of ['input.js', 'presentation.js', 'world-art.js', 'obstacles.js', 'gap-regions.js', 'flight_dimensions.js', 'flight_terrain.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), context, { filename: file });
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, updatePhysics, tryJump, enableFlightTerrain,
      newGenState, buildTrack, generateSegment, resetMovement, requestDiscreteLaneChange };
    die = reason => { globalThis.death = reason; STATE.mode = 'GAMEOVER'; };
    sfxJump = () => {};
    sfxFuel = () => {};
  `, context);
  const { STATE: state, CONFIG: config } = context.game;
  Object.assign(state, {
    mode: 'PLAYING', position: 0, speed: config.MAX_SPEED, tutorial: null,
    fuel: config.FUEL_MAX,
    track: Array.from({ length: 2000 }, (_, index) => ({ index, lanes: Array(7).fill('ROAD') })),
  });
  context.game.enableFlightTerrain();
  // 运动测试中直接铺设无道具路面；生成器可玩性另行验证。
  state.track.forEach((segment) => segment.lanes.fill('ROAD'));
  return {
    ...context.game, context, state, config,
    place(position, lane, playerY = 0) {
      state.position = position;
      context.game.resetMovement(state.movement, lane);
      state.groundHeight = terrain.heightAt(position, lane);
      state.playerY = playerY;
      state.playerVY = 0;
      state.jumpsUsed = playerY > 0 ? 1 : 0;
    },
    tick(count, dt = 1 / 240) {
      for (let i = 0; i < count && state.mode === 'PLAYING'; i += 1) context.game.updatePhysics(dt);
    },
  };
}

test('terrain is deterministic, begins flat, and alternates optional raised routes', () => {
  for (let position = 0; position < 48; position += 0.125) {
    for (let lane = 0; lane < 7; lane += 1) assert.equal(terrain.heightAt(position, lane), 0);
  }
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const position = 160 + cycle * 240;
    const lane = cycle % 2 ? 6 : 0;
    const raised = terrain.sample(position, lane);
    const low = terrain.sample(position, 3);
    assert.deepEqual(raised, terrain.sample(position, lane));
    assert.equal(low.height, (1800 + Math.min(cycle, 6) * 100) * 1.3);
    assert.ok(raised.offset >= 660 && raised.offset <= 780);
    assert.equal(raised.height - low.height, raised.offset);
    assert.equal(terrain.sample(position, 6 - lane).offset, 0);
  }
});

test('ramp seams are continuous, tile ends preserve true drops, and slopes stay bounded', () => {
  let drops = 0;
  for (let index = 48; index < 2000; index += 1) {
    for (const lane of [0, 3, 6]) {
      const tile = terrain.sampleTile(index, lane);
      const next = terrain.sampleTile(index + 1, lane);
      close(tile.nearHeight, terrain.heightAt(index, lane));
      assert.ok(Number.isFinite(tile.farHeight));
      if (tile.dropAtEnd) {
        drops += 1;
        assert.ok(tile.farHeight - next.nearHeight >= 599.999);
      } else close(tile.farHeight, next.nearHeight, 0.00002);
      const center = terrain.sample(index + 0.5, lane);
      assert.ok(Math.abs(center.slope) <= 117.001);
    }
  }
  assert.equal(drops, 8);
});

test('a lateral platform edge blocks low ships but a single jump can clear every platform', () => {
  const { config } = createHarness();
  const apex = config.JUMP_VELOCITY ** 2 / (2 * config.GRAVITY);
  for (let cycle = 0; cycle < 8; cycle += 1) {
    const position = 160 + cycle * 240;
    const previousLane = cycle % 2 ? 4 : 2;
    const lane = cycle % 2 ? 4.4 : 1.6;
    const groundHeight = terrain.heightAt(position, previousLane);
    const args = { previousPosition: position, position, previousLane, lane, groundHeight, playerVY: 0 };
    assert.equal(terrain.transition({ ...args, playerY: 0 }).blocked, true);
    assert.equal(terrain.transition({ ...args, playerY: apex - 40, jumpsUsed: 1 }).blocked, false);
  }
});

test('airborne movement preserves absolute altitude and lower exits grant an air recovery jump', () => {
  const args = { previousPosition: 80, position: 80.25, previousLane: 3, lane: 3,
    groundHeight: terrain.heightAt(80, 3), playerY: 550, playerVY: 1000, jumpsUsed: 1 };
  const step = terrain.transition(args);
  close(step.groundHeight + step.playerY, args.groundHeight + args.playerY);
  const exit = terrain.transition({ previousPosition: 160, position: 160, previousLane: 1,
    lane: 2, groundHeight: terrain.heightAt(160, 1), playerY: 0, playerVY: 0 });
  assert.equal(exit.blocked, false);
  assert.equal(exit.falling, true);
  assert.equal(exit.playerY, 660);
  assert.equal(exit.jumpsUsed, 1);
});

test('real physics follows the full steep ramp without spending a jump or leaving the ground', () => {
  const h = createHarness();
  h.place(63, 3);
  h.tick(430);
  assert.equal(h.state.mode, 'PLAYING');
  assert.ok(h.state.position > 104);
  close(h.state.groundHeight, 2340);
  assert.equal(h.state.playerY, 0);
  assert.equal(h.state.jumpsUsed, 0);
});

test('real movement stops at an unjumped platform edge and clears it with a timed single jump', () => {
  const blocked = createHarness();
  blocked.place(158, 2);
  blocked.requestDiscreteLaneChange(blocked.state.movement, -1);
  blocked.tick(40);
  assert.equal(blocked.context.death, undefined);
  assert.equal(blocked.state.mode, 'PLAYING');
  close(blocked.state.movement.lanePosition, 1.940001);

  const jumping = createHarness();
  jumping.place(158, 2);
  jumping.tryJump();
  jumping.tick(32);
  jumping.requestDiscreteLaneChange(jumping.state.movement, -1);
  jumping.tick(48);
  assert.equal(jumping.context.death, undefined);
  assert.equal(jumping.state.movement.lanePosition, 1);
  assert.ok(jumping.state.groundHeight > terrain.heightAt(jumping.state.position, 3));
  jumping.tick(100);
  assert.equal(jumping.state.playerY, 0);
  assert.equal(jumping.state.jumpsUsed, 0);
});

test('real ledge departure falls, permits recovery, and lands on the reserved lower runway', () => {
  const falling = createHarness();
  falling.place(191.95, 0);
  const oldAbsolute = falling.state.groundHeight;
  falling.tick(1);
  assert.ok(falling.state.playerY > 590);
  close(falling.state.groundHeight + falling.state.playerY, oldAbsolute);
  assert.equal(falling.state.jumpsUsed, 1);
  falling.tick(100);
  assert.equal(falling.state.mode, 'PLAYING');
  assert.equal(falling.state.playerY, 0);
  assert.equal(falling.state.jumpsUsed, 0);

  const recovery = createHarness();
  recovery.place(191.95, 0);
  recovery.tick(1);
  recovery.tryJump();
  assert.equal(recovery.state.jumpsUsed, 2);
  assert.ok(recovery.state.playerVY > 0);
});

test('real generator keeps a connected bypass and paired bridge routes across long runs', () => {
  const h = createHarness();
  const gen = h.newGenState();
  let rewards = 0;
  let gaps = 0;
  let islandTiles = 0;
  let islandRewards = 0;
  for (let index = 0; index < 6000; index += 1) {
    const segment = h.generateSegment(index, gen);
    const route = terrain.routeAt(index);
    if (!route) continue;
    assert.ok(route.safeLanes.includes(3));
    for (const lane of route.safeLanes) {
      assert.ok(segment.lanes[lane] !== 'GAP' && !segment.lanes[lane].startsWith('WALL_'));
      assert.ok(!(segment.enemies || []).some((enemy) => Math.round(enemy.lane) === lane));
    }
    for (const enemy of segment.enemies || []) {
      if (enemy.type === 'drone') assert.ok(terrain.dronePatrolLanes(segment).includes(enemy.lane));
    }
    if (route.gapLane !== null) {
      assert.equal(segment.lanes[route.gapLane], 'GAP');
      gaps += 1;
    }
    for (const lane of route.gapLanes) {
      assert.equal(segment.lanes[lane], 'GAP');
      assert.ok(!(segment.enemies || []).some((enemy) => Math.round(enemy.lane) === lane));
      assert.ok(!route.safeLanes.includes(lane));
    }
    if (route.islandStage === 'island') {
      islandTiles += 1;
      assert.equal(terrain.sampleTile(index, route.islandLane).kind, 'floating_island');
      assert.equal(segment.lanes[route.islandSideLane], 'GAP');
      if (route.phase === 121) {
        assert.equal(segment.lanes[route.islandLane], 'FUEL');
        islandRewards += 1;
      } else if (route.phase === 127) {
        // 固定候选只在浮岛轮出现；生成器还会按全部来源的间距上限将候选留空。
        if (route.cycle % 2 === 0) assert.equal(segment.lanes[route.islandLane], 'ROAD');
        else assert.ok(['ROAD', 'TRIPLE'].includes(segment.lanes[route.islandLane]));
      }
    }
    if (route.phase >= 96 && route.phase < 144 && route.phase % 24 === 0) {
      const rewardLane = route.gapLane === route.branchLanes[0] ? route.branchLanes[1] : route.branchLanes[0];
      assert.equal(segment.lanes[rewardLane], 'FUEL');
      rewards += 1;
    }
  }
  assert.equal(rewards, 50);
  assert.equal(gaps, 100);
  assert.equal(islandTiles, 500);
  assert.equal(islandRewards, 25);
});


test('a new jump lifts from an uphill ramp and airborne descent cannot stick to the old floor', () => {
  const h = createHarness();
  h.place(82, 3);
  const ground = h.state.groundHeight;
  h.tryJump();
  h.tick(1);
  assert.ok(h.state.playerY > 20);
  assert.ok(h.state.groundHeight + h.state.playerY > ground);
  assert.equal(h.state.jumpsUsed, 1);
  h.tick(120);
  assert.equal(h.state.playerY, 0);
  assert.equal(h.state.jumpsUsed, 0);

  const descending = terrain.transition({ previousPosition: 200, position: 200.3,
    previousLane: 3, lane: 3, groundHeight: terrain.heightAt(200, 3),
    playerY: -1, playerVY: -100, jumpsUsed: 1, wasGrounded: false });
  assert.ok(descending.playerY > 0);
  assert.equal(descending.playerVY, -100);
  assert.equal(descending.jumpsUsed, 1);
});


test('the maximum raised route is reachable with one real jump and exit time spans the full track', () => {
  const h = createHarness();
  h.place(878, 4);
  h.tryJump();
  h.tick(40);
  h.requestDiscreteLaneChange(h.state.movement, 1);
  h.tick(50);
  assert.equal(h.state.mode, 'PLAYING');
  assert.equal(h.state.movement.lanePosition, 5);
  close(h.state.groundHeight - terrain.heightAt(h.state.position, 3), 780);
  h.tick(80);
  assert.equal(h.state.playerY, 0);
  assert.equal(h.state.jumpsUsed, 0);
  const clearDistance = terrain.TUNING.landingEnd - terrain.TUNING.branchDrop;
  assert.ok(clearDistance / h.config.BOOST_SPEED >= 6 * h.config.LANE_SWITCH_TIME);
});

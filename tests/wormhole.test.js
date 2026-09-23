'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const terrain = require('../src/flight_terrain');
const wormhole = require('../src/wormhole');

function at(gate, position, lane = gate.lane, height = gate.height) {
  return { position, lane, height };
}

test('rare gates begin after 10 km and leave 8.4–10.8 km of real flight after each reward', () => {
  let previous = -1;
  const cycles = [];
  for (let index = 0; index < 30; index += 1) {
    const gate = wormhole.nextGate(previous, terrain);
    assert.deepEqual(gate, wormhole.nextGate(previous, terrain));
    assert.ok(gate.segment > previous);
    const route = terrain.routeAt(gate.segment);
    assert.equal(route.phase, 128);
    assert.equal(gate.lane, route.branchLanes[0]);
    assert.equal(gate.groundHeight, terrain.heightAt(gate.segment, gate.lane));
    assert.equal(gate.height, gate.groundHeight + 1550);
    assert.equal(gate.halfHeight, 240);
    assert.equal(gate.halfWidth, 0.34);
    assert.equal(gate.id, `wormhole:${route.cycle}`);
    if (index === 0) {
      assert.equal(gate.segment, 1136);
      assert.ok(gate.segment * 10 >= 10000);
    } else {
      assert.ok([1440, 1680].includes(gate.segment - previous));
      assert.ok([8400, 10800].includes((gate.segment - previous) * 10 - wormhole.TUNING.distanceMeters));
    }
    for (let segment = gate.segment - 16; segment <= gate.segment; segment += 1) {
      const safe = terrain.decorateSegment({ index: segment, lanes: Array(7).fill('WALL_HIGH'), enemies: [] });
      assert.ok(!['GAP', 'WALL_LOW', 'WALL_MEDIUM', 'WALL_HIGH'].includes(safe.lanes[gate.lane]));
    }
    cycles.push(route.cycle);
    previous = gate.segment;
  }
  assert.deepEqual(cycles.slice(0, 5), [4, 10, 17, 23, 30]);
  assert.ok(new Set(cycles.map((cycle) => cycle % 2)).size === 2);
});

test('gate scheduling skips stale opportunities and rejects unusable coordinates', () => {
  assert.equal(wormhole.nextGate(1135.999, terrain).segment, 1136);
  assert.equal(wormhole.nextGate(1136, terrain).segment, 2576);
  assert.equal(wormhole.nextGate(1136 + 600, terrain).segment, 2576);
  const remote = wormhole.nextGate(1e9, terrain);
  assert.ok(remote.segment > 1e9 && remote.segment - 1e9 <= 1680);
  for (const value of [NaN, Infinity, -Infinity, undefined, '415']) {
    assert.equal(wormhole.nextGate(value, terrain), null);
  }
  assert.equal(wormhole.nextGate(0, null), null);
  assert.equal(wormhole.nextGate(0, { TUNING: terrain.TUNING, routeAt: () => null, heightAt: () => 0 }), null);
});

test('entry requires a forward plane crossing and interpolates all coordinates', () => {
  const gate = wormhole.nextGate(0, terrain);
  const plane = gate.segment;
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane - 1), at(gate, plane + 1)), true);
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane - 1), at(gate, plane)), true);
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane), at(gate, plane + 1)), true);
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane), at(gate, plane)), false);
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane + 1), at(gate, plane - 1)), false);
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane + 0.01), at(gate, plane + 1)), false);
  assert.equal(wormhole.intersectsGate(gate, at(gate, plane - 2), at(gate, plane - 0.01)), false);
  // 端点都偏离洞口，但纵向穿面时三维轨迹正好经过中心。
  assert.equal(wormhole.intersectsGate(gate,
    at(gate, plane - 2, gate.lane - 1, gate.height - 800),
    at(gate, plane + 2, gate.lane + 1, gate.height + 800)), true);
  // 终点对准洞口不能补救已经从外侧穿过入口平面。
  assert.equal(wormhole.intersectsGate(gate,
    at(gate, plane - 1, gate.lane + 1), at(gate, plane + 3)), false);
});

test('compact elliptical entry rejects edge corners, neighboring lanes and invalid values', () => {
  const gate = wormhole.nextGate(0, terrain);
  const plane = gate.segment;
  const cross = (lane, height) => wormhole.intersectsGate(gate,
    at(gate, plane - 1, lane, height), at(gate, plane + 1, lane, height));
  assert.equal(cross(gate.lane, gate.height + gate.halfHeight), true);
  assert.equal(cross(gate.lane, gate.height - gate.halfHeight), true);
  assert.equal(cross(gate.lane, gate.height + gate.halfHeight + 0.001), false);
  assert.equal(cross(gate.lane + gate.halfWidth, gate.height), true);
  assert.equal(cross(gate.lane + gate.halfWidth + 0.001, gate.height), false);
  assert.equal(cross(gate.lane + gate.halfWidth * 0.8, gate.height + gate.halfHeight * 0.8), false);
  assert.equal(cross(gate.lane + 1, gate.height), false);
  assert.equal(cross(gate.lane, gate.groundHeight), false);
  for (const field of ['position', 'lane', 'height']) {
    for (const value of [NaN, Infinity, undefined, '416']) {
      assert.equal(wormhole.intersectsGate(gate, { ...at(gate, plane - 1), [field]: value }, at(gate, plane + 1)), false);
      assert.equal(wormhole.intersectsGate(gate, at(gate, plane - 1), { ...at(gate, plane + 1), [field]: value }), false);
    }
  }
  assert.equal(wormhole.intersectsGate(null, at(gate, plane - 1), at(gate, plane + 1)), false);
  assert.equal(wormhole.intersectsGate({ ...gate, halfHeight: 0 }, at(gate, plane - 1), at(gate, plane + 1)), false);
});

test('warp stages have bounded progress and an explicit completion boundary', () => {
  assert.equal(wormhole.TUNING.distanceMeters, 6000);
  assert.equal(wormhole.TUNING.duration, 2.4);
  assert.equal(wormhole.TUNING.graceDuration, 2);
  assert.equal(wormhole.TUNING.announceMeters, 1000);
  const samples = [[0, 'capture'], [0.25, 'tear'], [0.45, 'tunnel'], [2.05, 'exit'], [2.4, 'complete']];
  for (const [elapsed, phase] of samples) {
    const state = wormhole.stage(elapsed);
    assert.equal(state.phase, phase);
    assert.ok(state.progress >= 0 && state.progress <= 1);
    assert.ok(state.phaseProgress >= 0 && state.phaseProgress <= 1);
    assert.ok(state.strength >= 0 && state.strength <= 1);
    assert.equal(state.done, elapsed >= 2.4);
  }
  assert.equal(wormhole.stage(-1).progress, 0);
  assert.equal(wormhole.stage(100).progress, 1);
  assert.equal(wormhole.stage(NaN).progress, 0);
});

// 使用真实游戏物理与二跳消耗验证入口可达性；不加载控制器以避免自动进入演出。
function createFlightHarness(speed, gate, approachSeconds) {
  const root = path.resolve(__dirname, '..');
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
    globalThis.game = { STATE, CONFIG, updatePhysics, tryJump, enableFlightTerrain };
    sfxJump = () => {}; sfxDoubleJump = () => {}; sfxTripleJump = () => {};
    die = reason => { STATE.mode = 'GAMEOVER'; globalThis.death = reason; };
    CONFIG.ACCEL = 0;
  `, sandbox);
  const { STATE: state, CONFIG: config } = sandbox.game;
  Object.assign(state, {
    mode: 'PLAYING', position: gate.segment - speed * approachSeconds,
    speed, playerY: 0, playerVY: 0, jumpsUsed: 0, fuel: config.FUEL_MAX,
    boostT: speed >= config.BOOST_SPEED ? 10 : 0,
    boostPrevSpeed: speed >= config.BOOST_SPEED ? speed - config.BOOST_SPEED_BONUS : 0, tutorial: null,
    movement: sandbox.Skyroads.input.createMovementState(gate.lane),
    track: Array.from({ length: gate.segment + 300 }, (_, index) => ({ index, lanes: Array(7).fill('ROAD'), enemies: [] })),
  });
  sandbox.game.enableFlightTerrain();
  state.track.forEach((segment) => segment.lanes.fill('ROAD'));
  return { state, game: sandbox.game };
}

test('real 20/60/120 Hz physics rewards near-apex double jumps and rejects single jumps or immediate repeats', () => {
  const gate = wormhole.nextGate(0, terrain);
  for (const speed of [8, 24, 36]) {
    for (const fps of [20, 60, 120]) {
      for (const secondAt of [null, 14 / 60, 0.05]) {
        const { state, game } = createFlightHarness(speed, gate, 0.45);
        const dt = 1 / fps;
        let hit = false;
        let jumpedAgain = false;
        game.tryJump();
        for (let frame = 0; frame < fps && state.position <= gate.segment; frame += 1) {
          if (secondAt !== null && !jumpedAgain && frame * dt >= secondAt - 1e-9) {
            game.tryJump();
            jumpedAgain = true;
          }
          const before = at(gate, state.position, state.movement.lanePosition, state.groundHeight + state.playerY);
          game.updatePhysics(dt);
          const after = at(gate, state.position, state.movement.lanePosition, state.groundHeight + state.playerY);
          hit ||= wormhole.intersectsGate(gate, before, after);
        }
        assert.equal(hit, secondAt === 14 / 60, `speed=${speed}, fps=${fps}, secondAt=${secondAt}`);
        assert.equal(state.mode, 'PLAYING');
      }
    }
  }
  const maxTripleFromFlat = 3 * 7500 ** 2 / (2 * 32000);
  assert.ok(maxTripleFromFlat < gate.height - gate.halfHeight);
});

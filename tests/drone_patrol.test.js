'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const terrain = require('../src/flight_terrain');
const root = path.resolve(__dirname, '..');

// 固定种子调用真实生成器与无人机状态机，统计结果可重复。
function createHarness(seed = 20260921, terrainEnabled = true) {
  const random = Object.create(Math);
  random.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sandbox = {
    Math: random, console, navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now: () => 0 }, requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of ['input', 'presentation', 'world-art', 'obstacles', 'gap-regions', 'flight_dimensions', 'flight_terrain']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', `${file}.js`), 'utf8'), sandbox);
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, newGenState, generateSegment, updateEnemies, enemyLane };
  `, sandbox);
  sandbox.game.STATE.terrainEnabled = terrainEnabled;
  return { ...sandbox.game, random };
}

function drone(lane) {
  return { type: 'drone', lane, spawnLane: lane, fromLane: lane, toLane: lane,
    state: 'rest', restT: 0, warnT: 0, moveT: 1 };
}

function place(harness, index, lanes, enemies) {
  harness.STATE.position = index;
  harness.STATE.track = Array.from({ length: index + 1 }, (_, i) => ({ index: i,
    lanes: Array(7).fill('ROAD'), enemies: [] }));
  const segment = { index, lanes, enemies };
  harness.STATE.track[index] = segment;
  return segment;
}

test('terrain keeps legal challenge drones while protecting all safe lanes, walls, pickups and bridge gaps', () => {
  let retained = 0;
  for (let cycle = 0; cycle < 4; cycle += 1) {
    for (let phase = terrain.TUNING.safeStart; phase < terrain.TUNING.period; phase += 1) {
      const index = terrain.TUNING.start + cycle * terrain.TUNING.period + phase;
      const source = { index, lanes: Array(7).fill('ROAD'), enemies: Array.from({ length: 7 }, (_, lane) => drone(lane)) };
      const before = JSON.stringify(source);
      const decorated = terrain.decorateSegment(source);
      const route = terrain.routeAt(index);
      const expected = decorated.lanes.flatMap((type, lane) => type === 'ROAD' && !route.safeLanes.includes(lane) ? [lane] : []);
      assert.deepEqual(decorated.enemies.map((enemy) => enemy.lane), expected);
      assert.equal(JSON.stringify(source), before);
      retained += decorated.enemies.length;
      if (route.safeLanes.length === 7) assert.equal(decorated.enemies.length, 0);
    }
  }
  assert.ok(retained > 0);
  const warning = { ...drone(2), toLane: 3, state: 'warn' };
  assert.equal(terrain.decorateSegment({ index: 128, lanes: Array(7).fill('ROAD'), enemies: [warning] }).enemies.length, 0);
});

test('drones patrol open valley lanes with the existing warning and move timing, without entering safe lanes', () => {
  const h = createHarness();
  const e = drone(1);
  place(h, 250, Array(7).fill('ROAD'), [e]);
  h.random.random = () => 0.9;
  h.updateEnemies(0.01);
  assert.equal(e.toLane, 2);
  assert.equal(e.state, 'warn');
  h.updateEnemies(h.CONFIG.DRONE_WARN_TIME - 0.01);
  assert.equal(e.state, 'warn');
  assert.equal(h.enemyLane(e), 1);
  h.updateEnemies(0.011);
  assert.equal(e.state, 'move');
  h.updateEnemies(h.CONFIG.DRONE_MOVE_TIME / 2);
  assert.ok(Math.abs(h.enemyLane(e) - 1.5) < 1e-6);
  h.updateEnemies(h.CONFIG.DRONE_MOVE_TIME / 2);
  assert.equal(e.fromLane, 2);
  e.restT = 0;
  h.updateEnemies(0.01);
  assert.equal(e.toLane, 1);
  const visited = new Set();
  for (let step = 0; step < 2400; step += 1) {
    h.updateEnemies(1 / 60);
    const actual = h.enemyLane(e);
    assert.ok(actual >= 0 && actual <= 2);
    visited.add(Math.round(actual));
  }
  assert.ok(visited.size > 1);
});

test('isolated challenge drones hover and reverse away from walls or gaps instead of crossing them', () => {
  for (const obstacle of ['WALL_LOW', 'GAP']) {
    const h = createHarness();
    const e = drone(1);
    const lanes = Array(7).fill('ROAD');
    lanes[2] = obstacle;
    const seg = place(h, 250, lanes, [e]);
    h.random.random = () => 0.9;
    h.updateEnemies(0.01);
    assert.equal(e.toLane, 0);
    seg.enemies = [drone(1)];
    lanes[0] = obstacle;
    for (let step = 0; step < 600; step += 1) h.updateEnemies(1 / 60);
    assert.equal(h.enemyLane(seg.enemies[0]), 1);
    assert.equal(seg.enemies[0].state, 'rest');
  }
  const h = createHarness();
  const e = drone(2);
  place(h, 128, Array(7).fill('ROAD'), [e]);
  for (let step = 0; step < 600; step += 1) h.updateEnemies(1 / 60);
  assert.equal(h.enemyLane(e), 2);
  assert.equal(e.state, 'rest');
});

test('terrain-disabled drones retain unrestricted original lane changes', () => {
  const h = createHarness(1, false);
  const e = drone(2);
  place(h, 128, Array(7).fill('WALL_HIGH'), [e]);
  h.random.random = () => 0.9;
  h.updateEnemies(0.01);
  assert.equal(e.toLane, 3);
  assert.equal(e.state, 'warn');
});

test('patrol candidates cannot snap across the sides of either raised route', () => {
  for (const [index, lane] of [[160, 1], [400, 5]]) {
    const segment = { index, lanes: Array(7).fill('ROAD') };
    assert.ok(terrain.dronePatrolLanes(segment).length > 0);
    assert.deepEqual(terrain.dronePatrolLanes(segment, lane), []);
  }
});

test('seeded long runs restore challenge encounters without adding enemies to protected routes', () => {
  for (const seed of [1, 42, 20260921, 0xc0ffee]) {
    const h = createHarness(seed);
    const gen = h.newGenState();
    const flat = createHarness(seed, false);
    const flatGen = flat.newGenState();
    let count = 0;
    let originalCount = 0;
    let empty = 0;
    let longestEmpty = 0;
    const sections = new Set();
    for (let index = 0; index < 6000; index += 1) {
      const segment = h.generateSegment(index, gen);
      const route = terrain.routeAt(index);
      const drones = (segment.enemies || []).filter((enemy) => enemy.type === 'drone');
      count += drones.length;
      originalCount += (flat.generateSegment(index, flatGen).enemies || []).filter((enemy) => enemy.type === 'drone').length;
      empty = drones.length ? 0 : empty + 1;
      longestEmpty = Math.max(longestEmpty, empty);
      for (const e of drones) {
        assert.equal(segment.lanes[e.lane], 'ROAD');
        if (route) {
          assert.ok(!route.safeLanes.includes(e.lane));
          sections.add(route.section);
        }
      }
    }
    assert.ok(count >= originalCount * 0.2, `seed ${seed}: ${count}/${originalCount}`);
    assert.ok(count < originalCount);
    assert.ok(longestEmpty < terrain.TUNING.period * 2, `seed ${seed}: empty ${longestEmpty}`);
    assert.deepEqual([...sections].sort(), ['broken_bridge', 'valley']);
  }
});

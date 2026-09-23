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
    globalThis.game = { STATE, CONFIG, newGenState, generateSegment, updateEnemies, enemyLane, enemyAltitude, checkCollisions };
    die = (reason) => { globalThis.death = reason; };
    collectPickup = () => false;
  `, sandbox);
  sandbox.game.STATE.terrainEnabled = terrainEnabled;
  return { ...sandbox.game, random, sandbox };
}

function drone(lane, altitude = 0) {
  return { type: 'drone', lane, spawnLane: lane, fromLane: lane, toLane: lane,
    state: 'rest', restT: 0, warnT: 0, moveT: 1, altitude };
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
  h.updateEnemies(h.CONFIG.DRONE_WARN_TIME - 0.02);
  assert.equal(e.state, 'warn');
  assert.equal(h.enemyLane(e), 1);
  h.updateEnemies(0.01);
  assert.equal(e.state, 'move');
  h.updateEnemies(h.CONFIG.DRONE_MOVE_TIME / 2);
  assert.ok(Math.abs(h.enemyLane(e) - 1.5) < 1e-6);
  h.updateEnemies(h.CONFIG.DRONE_MOVE_TIME / 2);
  assert.equal(e.fromLane, 2);
  e.restT = 0;
  h.updateEnemies(0.01);
  assert.equal(e.toLane, 1);
  assert.equal(h.enemyAltitude(e), 0);
  const visited = new Set();
  for (let step = 0; step < 2400; step += 1) {
    h.updateEnemies(1 / 60);
    const actual = h.enemyLane(e);
    assert.ok(actual >= 0 && actual <= 2);
    visited.add(Math.round(actual));
  }
  assert.ok(visited.size > 1);
});

test('isolated drones hover at fixed altitude and reverse away from walls or gaps without crossing them', () => {
  for (const obstacle of ['WALL_LOW', 'GAP']) {
    const h = createHarness();
    const e = drone(1);
    const lanes = Array(7).fill('ROAD');
    lanes[2] = obstacle;
    const seg = place(h, 250, lanes, [e]);
    h.random.random = () => 0.9;
    h.updateEnemies(0.01);
    assert.equal(e.toLane, 0);
    lanes[0] = obstacle;
    for (const altitude of [0, 720]) {
      seg.enemies = [drone(1, altitude)];
      let randomCalls = 0;
      h.random.random = () => { randomCalls += 1; return 0.9; };
      for (let step = 0; step < 600; step += 1) {
        h.updateEnemies(1 / 60);
        assert.equal(h.enemyLane(seg.enemies[0]), 1);
        assert.equal(h.enemyAltitude(seg.enemies[0]), altitude);
        assert.equal(seg.enemies[0].state, 'rest');
      }
      assert.equal(seg.enemies[0].patrolLaneB, 1);
      assert.equal(randomCalls, 1, 'Blocked patrol retries reuse their initial direction');
    }
  }
  const h = createHarness();
  const e = drone(2);
  place(h, 128, Array(7).fill('ROAD'), [e]);
  for (let step = 0; step < 600; step += 1) h.updateEnemies(1 / 60);
  assert.equal(h.enemyLane(e), 2);
  assert.equal(e.patrolLaneA, e.patrolLaneB);
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

// 横移期间高度必须保持不变，不能在玩家靠近时自动升空让出地面。
test('both drone bands repeatedly reverse horizontally without climbing or descending', () => {
  for (const altitude of [0, 720]) {
    const h = createHarness();
    const e = drone(1, altitude);
    place(h, 250, Array(7).fill('ROAD'), [e]);
    h.random.random = () => 0.9;
    const endpoints = [];
    let last = e.state;
    for (let frame = 0; frame < 600 && endpoints.length < 4; frame += 1) {
      h.updateEnemies(1 / 120);
      assert.equal(h.enemyAltitude(e), altitude);
      if (last === 'move' && e.state === 'rest') endpoints.push([h.enemyLane(e), h.enemyAltitude(e)]);
      last = e.state;
    }
    assert.deepEqual(endpoints, [[2, altitude], [1, altitude], [2, altitude], [1, altitude]]);
  }
});

test('horizontal patrol is smooth and consistent at 20, 60 and 120 Hz while altitude stays fixed', () => {
  for (const altitude of [0, 720]) {
    const samples = [];
    for (const hz of [20, 60, 120]) {
      const h = createHarness();
      const e = drone(1, altitude);
      place(h, 250, Array(7).fill('ROAD'), [e]);
      h.random.random = () => 0.9;
      let previous = 1;
      for (let frame = 0; frame < hz * 10; frame += 1) {
        h.updateEnemies(1 / hz);
        const lane = h.enemyLane(e);
        assert.ok(Math.abs(lane - previous) <= 1.6 / h.CONFIG.DRONE_MOVE_TIME / hz);
        assert.ok(lane >= 1 && lane <= 2);
        assert.equal(h.enemyAltitude(e), altitude);
        previous = lane;
      }
      samples.push([h.enemyLane(e), e.state, e.warnT, e.restT]);
    }
    for (const sample of samples.slice(1)) {
      assert.ok(Math.abs(sample[0] - samples[0][0]) < 1e-8);
      assert.equal(sample[1], samples[0][1]);
      assert.ok(Math.abs(sample[2] - samples[0][2]) < 1e-8);
      assert.ok(Math.abs(sample[3] - samples[0][3]) < 1e-8);
    }
  }
});

test('generated drones mostly block low flight with a minority at fixed single-jump altitude', () => {
  let low = 0;
  let airborne = 0;
  for (const seed of [1, 42, 20260923]) {
    const h = createHarness(seed);
    const gen = h.newGenState();
    for (let index = 0; index < 4000; index += 1) {
      const segment = h.generateSegment(index, gen);
      for (const e of segment.enemies || []) {
        if (e.type !== 'drone') continue;
        if (e.altitude === 0) low += 1;
        else {
          assert.equal(e.altitude, 720);
          airborne += 1;
        }
      }
    }
    const apex = h.CONFIG.JUMP_VELOCITY ** 2 / (2 * h.CONFIG.GRAVITY);
    assert.ok(720 <= apex && apex <= 720 + h.CONFIG.DRONE_HEIGHT);
  }
  const ratio = airborne / (low + airborne);
  assert.ok(ratio > 0.12 && ratio < 0.28, `Airborne fraction: ${ratio}`);
});

test('a blocked horizontal route can resume when cleared without changing altitude or crossing safety lanes', () => {
  const h = createHarness();
  const e = drone(1, 720);
  const lanes = Array(7).fill('ROAD');
  lanes[0] = lanes[2] = 'WALL_HIGH';
  place(h, 250, lanes, [e]);
  h.random.random = () => 0.9;
  h.updateEnemies(3);
  assert.equal(e.state, 'rest');
  lanes[2] = 'ROAD';
  h.updateEnemies(0.3);
  assert.equal(e.state, 'warn');
  assert.equal(e.toLane, 2);
  h.updateEnemies(1);
  assert.equal(h.enemyAltitude(e), 720);
  assert.equal(h.enemyLane(e), 2);
});

test('raised drones allow underflight, hit single jumps, and retain boost protection', () => {
  const h = createHarness();
  const e = { ...drone(1), altitude: 720 };
  place(h, 250, Array(7).fill('ROAD'), [e]);
  Object.assign(h.STATE, { mode: 'PLAYING', tutorial: null, groundHeight: terrain.heightAt(250, 1) });
  const collide = (height) => {
    h.sandbox.death = null;
    h.STATE.playerY = height;
    h.checkCollisions(1, 1);
    return h.sandbox.death;
  };
  assert.equal(collide(0), null);
  assert.equal(collide(719.99), null);
  assert.equal(collide(720), 'enemy');
  assert.equal(collide(879), 'enemy');
  assert.equal(collide(1220), 'enemy');
  assert.equal(collide(1220.01), null);
  h.STATE.boostGraceT = 1;
  assert.equal(collide(879), null);
  h.STATE.boostGraceT = 0;
  e.altitude = 0;
  assert.equal(collide(0), 'enemy');
  assert.equal(collide(879), null);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

// 保留真实开局、生成、拾取与折跃调度，只隔离界面和声音。
function harness() {
  let randomSeed = 17;
  let runSeed = 100;
  const math = Object.create(Math);
  math.random = () => {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  };
  const sandbox = {
    Math: math, console, crypto: { getRandomValues(array) { array[0] = ++runSeed; return array; } },
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now: () => 0 }, requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const name of ['input', 'presentation', 'world-art', 'obstacles', 'gap-regions',
    'flight_dimensions', 'flight_terrain', 'wormhole']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', `${name}.js`), 'utf8'), sandbox);
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, startGame, resetGame, newGenState, generateSegment,
      maybePlacePickup, togglePause, enableFlightTerrain, disableFlightTerrain, collectPickup, extendTrack };
    audioInit = syncPropulsionAudio = syncAdaptiveAudio = refreshPresentation = focusPrimarySurface
      = sfxFuel = sfxTriple = sfxBoost = sfxSlow = sfxMagnet = () => {};
  `, sandbox);
  sandbox.game.STATE.terrainEnabled = true;
  sandbox.game.STATE.tutorial = null;
  return { ...sandbox.game, sandbox, math, get terrain() { return sandbox.Skyroads.flightTerrain; } };
}

function fingerprint(track) {
  return JSON.stringify(track.map(({ lanes, enemies, corridor }) => ({ lanes, enemies, corridor })));
}

test('actual new runs change route layout and track while pause and GPU restoration retain this run', () => {
  const h = harness();
  const seeds = new Set();
  const tracks = new Set();
  const layouts = new Set();
  for (let run = 0; run < 6; run += 1) {
    h.startGame();
    assert.ok(Number.isInteger(h.STATE.routeSeed) && h.STATE.routeSeed > 0);
    seeds.add(h.STATE.routeSeed);
    tracks.add(fingerprint(h.STATE.track));
    const terrain = h.terrain;
    const index = terrain.TUNING.start + 120;
    layouts.add(JSON.stringify([terrain.TUNING.start, terrain.routeAt(index),
      Array.from({ length: 7 }, (_, lane) => terrain.heightAt(index, lane))]));
    const gate = h.STATE.wormhole.gate;
    assert.equal(gate.lane, terrain.routeAt(gate.segment).branchLanes[0]);
    assert.equal(gate.groundHeight, terrain.heightAt(gate.segment, gate.lane));
    const seed = h.STATE.routeSeed;
    const before = fingerprint(h.STATE.track);
    h.togglePause();
    h.togglePause();
    h.disableFlightTerrain();
    h.enableFlightTerrain();
    assert.equal(h.terrain, terrain);
    assert.equal(h.STATE.routeSeed, seed);
    assert.equal(fingerprint(h.STATE.track), before);
  }
  assert.equal(seeds.size, 6);
  assert.equal(tracks.size, 6);
  assert.ok(layouts.size >= 5, 'New games must vary authored terrain, not just ordinary hazards');
});

test('a run seed reproduces generation independently of cosmetic random calls and generation batches', () => {
  const h = harness();
  const seed = 20260924;
  const generate = (noise) => {
    h.sandbox.Skyroads.flightTerrain = h.terrain.createForRun(seed);
    const gen = h.newGenState(seed);
    const track = [];
    for (let index = 0; index < 1800; index += 1) {
      for (let i = 0; i < noise; i += 1) h.math.random();
      track.push(h.generateSegment(index, gen));
    }
    return fingerprint(track);
  };
  assert.equal(generate(0), generate(7));
});

test('each four ordinary pickup opportunities use all kinds once in varying orders', () => {
  const h = harness();
  const expected = ['BOOST', 'MAGNET', 'SLOW', 'TRIPLE'];
  const orders = new Set();
  for (let seed = 1; seed <= 12; seed += 1) {
    const gen = h.newGenState(seed);
    const rewards = [];
    for (let index = 100; index < 10000 && rewards.length < 12; index += 1) {
      gen.sincePickup = h.CONFIG.PICKUP_MIN_GAP;
      const lanes = Array(7).fill('ROAD');
      h.maybePlacePickup(lanes, gen, index);
      const reward = lanes.find((kind) => kind !== 'ROAD');
      if (reward) rewards.push(reward);
    }
    assert.equal(rewards.length, 12);
    for (let i = 0; i < 12; i += 4) assert.deepEqual(rewards.slice(i, i + 4).sort(), expected);
    orders.add(rewards.slice(0, 4).join(','));
  }
  assert.ok(orders.size >= 6, `Only ${orders.size} pickup orders`);
});

test('seed fallback works without crypto and avoids repeating an identical restart seed', () => {
  const h = harness();
  delete h.sandbox.crypto;
  h.math.random = () => 0;
  h.resetGame();
  const first = h.STATE.routeSeed;
  h.resetGame();
  assert.ok(first > 0 && h.STATE.routeSeed > 0);
  assert.notEqual(h.STATE.routeSeed, first);
});

test('randomized long tracks retain transformation spacing and collected terrain rewards stay collected', () => {
  const h = harness();
  h.startGame();
  h.STATE.position = 3800;
  h.extendTrack();
  let previous = -Infinity;
  let count = 0;
  for (const segment of h.STATE.track) {
    for (const kind of segment.lanes) {
      if (kind !== 'TRIPLE') continue;
      assert.ok(segment.index - previous >= h.CONFIG.TRIPLE_MIN_GAP);
      previous = segment.index;
      count += 1;
    }
  }
  // 全来源按 20 秒预计飞行时间拉开间距，40 公里不再每 2.4 公里都出现变身。
  assert.ok(count >= 3 && count <= 6);
  const segment = h.STATE.track.find((tile) => tile.lanes.includes('FUEL'));
  const lane = segment.lanes.indexOf('FUEL');
  h.STATE.position = segment.index;
  h.STATE.groundHeight = h.terrain.heightAt(segment.index, lane);
  h.STATE.playerY = 0;
  assert.equal(h.collectPickup(segment, lane, 'FUEL'), true);
  const before = fingerprint(h.STATE.track);
  h.disableFlightTerrain();
  h.enableFlightTerrain();
  assert.equal(h.STATE.track[segment.index].lanes[lane], 'ROAD');
  assert.equal(fingerprint(h.STATE.track), before);
});

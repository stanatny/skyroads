'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const baseline = [
  { seed: 42, fuel: 369, triple: 51, ordinary: 55 },
  { seed: 1337, fuel: 384, triple: 51, ordinary: 56 },
  { seed: 20260922, fuel: 377, triple: 48, ordinary: 55 },
];

// 使用真实生成器、地形装饰和拾取函数；固定随机种子，隔离 DOM、音效和帧循环。
function createHarness(seed = 42, terrainEnabled = true) {
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
  for (const file of ['input', 'presentation', 'world-art', 'obstacles', 'gap-regions',
    'flight_dimensions', 'flight_terrain']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', `${file}.js`), 'utf8'), sandbox,
      { filename: `${file}.js` });
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8')
    .replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, newGenState, generateSegment, buildTrack, extendTrack,
      enableFlightTerrain, disableFlightTerrain, collectPickup };
    sfxFuel = sfxTriple = sfxBoost = sfxSlow = sfxMagnet = syncPropulsionAudio = () => {};
  `, sandbox, { filename: 'game.js' });
  const { STATE: state, CONFIG: config } = sandbox.game;
  Object.assign(state, { terrainEnabled, mode: 'PLAYING', position: 0, playerY: 0,
    width: 1440, height: 900, fuel: config.FUEL_MAX, tutorial: null });
  return { ...sandbox.game, state, config, random, terrain: sandbox.Skyroads.flightTerrain };
}

function allRewards(track, type) {
  return track.flatMap((segment) => Array.from(segment.lanes, (kind, lane) => (
    kind === type ? { index: segment.index, lane } : null
  )).filter(Boolean));
}

function assertTransformationSpacing(track, minimum) {
  const rewards = allRewards(track, 'TRIPLE');
  assert.ok(rewards.length > 1);
  for (let i = 1; i < rewards.length; i += 1) {
    assert.ok(rewards[i].index - rewards[i - 1].index >= minimum,
      `TRIPLE at ${rewards[i - 1].index} and ${rewards[i].index} violates ${minimum}-segment gap`);
  }
  return rewards;
}

for (const previous of baseline) {
  test(`seed ${previous.seed}: a real 40 km track reduces supply and spaces every transformation source`, (t) => {
    const h = createHarness(previous.seed);
    const gen = h.newGenState();
    const track = Array.from({ length: 4000 }, (_, index) => h.generateSegment(index, gen));
    const fuel = allRewards(track, 'FUEL').length;
    const triple = assertTransformationSpacing(track, h.config.TRIPLE_MIN_GAP).length;
    const ordinary = ['BOOST', 'SLOW', 'MAGNET']
      .reduce((sum, kind) => sum + allRewards(track, kind).length, 0);
    const fuelRatio = fuel / previous.fuel;
    // 固定种子的统计区间允许生成器分支改变，但防止调参退回奖励泛滥或突然断供。
    assert.ok(fuelRatio >= 0.60 && fuelRatio <= 0.85, `fuel ratio ${fuelRatio}`);
    assert.ok(ordinary >= previous.ordinary * 0.55 && ordinary <= previous.ordinary * 0.85,
      `ordinary rewards ${ordinary}`);
    assert.ok(triple >= 7 && triple <= 16, `TRIPLE count ${triple}`);
    const thirtyKm = track.slice(0, 3000);
    t.diagnostic(JSON.stringify({ seed: previous.seed,
      before40km: previous,
      after30km: { fuel: allRewards(thirtyKm, 'FUEL').length, triple: allRewards(thirtyKm, 'TRIPLE').length },
      after40km: { fuel, triple, ordinary }, fuelReduction: 1 - fuelRatio }));
  });
}

test('fuel safety supplies survive no-random-reward runs, gap landings and bridge or runway branches', () => {
  const h = createHarness(42, false);
  h.random.random = () => 0.99;
  const gen = h.newGenState();
  const track = Array.from({ length: 800 }, (_, index) => h.generateSegment(index, gen));
  const fuels = allRewards(track, 'FUEL');
  assert.ok(fuels.length >= 9);
  for (let i = 1; i < fuels.length; i += 1) {
    assert.ok(fuels[i].index - fuels[i - 1].index <= h.config.FUEL_FORCE_EVERY);
  }
  for (const branch of ['cooldown', 'bridgeLeft', 'landingLeft']) {
    const branchGen = h.newGenState();
    branchGen.sinceFuel = h.config.FUEL_FORCE_EVERY - 1;
    branchGen[branch] = 1;
    const segment = h.generateSegment(500, branchGen);
    assert.equal(segment.lanes[branchGen.safeLane], 'FUEL', branch);
  }
  const gapGen = h.newGenState();
  gapGen.gapRun = 1;
  const landing = h.generateSegment(500, gapGen);
  assert.equal(landing.lanes[gapGen.safeLane], 'FUEL');
  h.random.random = () => 0;
  const warmup = h.generateSegment(6, h.newGenState());
  assert.equal(allRewards([warmup], 'FUEL').length, 1);
  assert.equal(h.config.FUEL_PICKUP, 18);
  assert.equal(h.config.FUEL_FORCE_EVERY, 75);
});

test('initial 400-segment terrain enable and later pre-generation share transformation spacing', () => {
  for (const previous of baseline) {
    const h = createHarness(previous.seed, false);
    h.state.track = h.buildTrack();
    assert.equal(h.state.track.length, 400);
    assert.equal(h.enableFlightTerrain(), true);
    const initial = allRewards(h.state.track, 'TRIPLE');
    assert.ok(initial.length >= 1);
    assert.ok(h.state.gen.lastTripleIndex >= initial.at(-1).index);
    for (let position = 200; position <= 3800; position += 100) {
      h.state.position = position;
      h.extendTrack();
    }
    assert.equal(h.state.track.length, 4000);
    assertTransformationSpacing(h.state.track, h.config.TRIPLE_MIN_GAP);
    assert.ok(h.state.track.every((segment) => segment.terrainDecorated));
  }
});

test('repeated terrain disable and enable never respawn collected or previously filtered rewards', () => {
  const h = createHarness(42, false);
  h.state.track = h.buildTrack();
  h.enableFlightTerrain();
  const collected = [...allRewards(h.state.track, 'FUEL'), ...allRewards(h.state.track, 'TRIPLE')];
  assert.ok(collected.length > 5);
  for (const { index, lane } of collected) {
    h.state.position = index;
    h.state.groundHeight = h.terrain.heightAt(index, lane);
    h.state.playerY = 0;
    h.state.tripleT = 0;
    const segment = h.state.track[index];
    assert.equal(h.collectPickup(segment, lane, segment.lanes[lane]), true);
    assert.equal(segment.lanes[lane], 'ROAD');
  }
  const before = JSON.stringify(h.state.track.map((segment) => segment.lanes));
  for (let restart = 0; restart < 3; restart += 1) {
    h.disableFlightTerrain();
    assert.equal(h.enableFlightTerrain(), true);
    assert.equal(JSON.stringify(h.state.track.map((segment) => segment.lanes)), before);
  }
  for (const { index, lane } of collected) assert.equal(h.state.track[index].lanes[lane], 'ROAD');
});

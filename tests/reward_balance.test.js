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
      enableFlightTerrain, disableFlightTerrain, collectPickup, spaceSuperPickups };
    sfxFuel = sfxTriple = sfxBoost = sfxSlow = sfxMagnet = syncPropulsionAudio = () => {};
  `, sandbox, { filename: 'game.js' });
  const { STATE: state, CONFIG: config } = sandbox.game;
  Object.assign(state, { terrainEnabled, mode: 'PLAYING', position: 0, playerY: 0,
    width: 1440, height: 900, fuel: config.FUEL_MAX, tutorial: null });
  return { ...sandbox.game, state, config, random, sandbox, terrain: sandbox.Skyroads.flightTerrain };
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
    // 变身按完整 20 秒航程隔开，高速后不能沿用原先 240 段的密度区间。
    assert.ok(triple >= 3 && triple <= 6, `TRIPLE count ${triple}`);
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
    assertTimedSpacing(h, h.state.track, 'BOOST');
    assertTimedSpacing(h, h.state.track, 'TRIPLE');
    assert.ok(h.state.track.every((segment) => segment.terrainDecorated));
  }
});

test('repeated terrain disable and enable never respawn collected or previously filtered rewards', () => {
  const h = createHarness(42, false);
  h.state.track = h.buildTrack();
  h.enableFlightTerrain();
  const collected = [...allRewards(h.state.track, 'FUEL'), ...allRewards(h.state.track, 'TRIPLE'),
    ...allRewards(h.state.track, 'BOOST')];
  assert.ok(collected.length > 5);
  for (const { index, lane } of collected) {
    h.state.position = index;
    h.state.groundHeight = h.terrain.heightAt(index, lane);
    h.state.playerY = 0;
    h.state.tripleT = 0; h.state.boostT = 0; h.state.boostGraceT = 0;
    const segment = h.state.track[index];
    assert.equal(h.collectPickup(segment, lane, segment.lanes[lane]), true);
    assert.equal(segment.lanes[lane], 'ROAD');
  }
  const before = JSON.stringify(h.state.track.map((segment) => segment.lanes));
  const lastBoost = h.state.gen.lastBoostIndex;
  const lastTriple = h.state.gen.lastTripleIndex;
  for (let restart = 0; restart < 3; restart += 1) {
    h.disableFlightTerrain();
    assert.equal(h.enableFlightTerrain(), true);
    assert.equal(JSON.stringify(h.state.track.map((segment) => segment.lanes)), before);
    assert.equal(h.state.gen.lastBoostIndex, lastBoost);
    assert.equal(h.state.gen.lastTripleIndex, lastTriple);
  }
  for (const { index, lane } of collected) assert.equal(h.state.track[index].lanes[lane], 'ROAD');
});

function useRunSeed(h, seed) {
  h.state.routeSeed = seed;
  h.terrain = h.terrain.createForRun(seed);
  h.sandbox.Skyroads.flightTerrain = h.terrain;
}

function conservativeSpeed(h, index) {
  const config = h.config;
  return Math.max(config.BOOST_SPEED, config.FUEL_BURST_SPEED,
    h.sandbox.Skyroads.obstacles.nominalSpeed(index, {
      initialSpeed: config.INITIAL_SPEED, acceleration: config.ACCEL,
      cruiseSoftCap: config.CRUISE_SOFT_CAP, cruiseTailAcceleration: config.CRUISE_TAIL_ACCEL,
    }) + config.BOOST_SPEED_BONUS);
}

function protectedSeconds(h, kind) {
  return kind === 'BOOST' ? Math.max(h.config.BOOST_PICKUP_MIN_SECONDS,
    h.config.BOOST_DURATION + h.config.BOOST_GRACE) : h.config.TRIPLE_DURATION;
}

function assertTimedSpacing(h, track, kind) {
  const rewards = allRewards(track, kind);
  assert.ok(rewards.length >= 2, `${kind} must still appear more than once`);
  for (let i = 1; i < rewards.length; i += 1) {
    const gap = rewards[i].index - rewards[i - 1].index;
    const speed = conservativeSpeed(h, rewards[i].index);
    // 前一枚可能在段尾拾取，下一枚可能在段首拾取，按最短实际路程验证。
    assert.ok((gap - 1) / speed + 1e-9 >= protectedSeconds(h, kind),
      `${kind} at ${rewards[i - 1].index}/${rewards[i].index} is only ${(gap - 1) / speed}s apart`);
    if (kind === 'TRIPLE') assert.ok(gap >= h.config.TRIPLE_MIN_GAP);
  }
  return rewards;
}

test('seeded flat and elevated routes space BOOST and TRIPLE through their full protection or form durations', (t) => {
  for (const seed of [1, 42, 1337, 20260922, 20260923, 20260924]) {
    for (const enabled of [false, true]) {
      const h = createHarness(seed, enabled);
      useRunSeed(h, seed);
      const gen = h.newGenState(seed);
      const track = Array.from({ length: 4000 }, (_, index) => h.generateSegment(index, gen));
      const boost = assertTimedSpacing(h, track, 'BOOST');
      const triple = assertTimedSpacing(h, track, 'TRIPLE');
      assert.equal(gen.lastBoostIndex, boost.at(-1).index);
      assert.equal(gen.lastTripleIndex, triple.at(-1).index);
      t.diagnostic(JSON.stringify({ seed, terrainEnabled: enabled, fuel: allRewards(track, 'FUEL').length,
        boost: boost.length, triple: triple.length }));
    }
  }
});

test('the shared post-decoration filter removes same-row duplicates and grows spacing with late-run speed', () => {
  const h = createHarness(42);
  for (const index of [100, 2000, 6000, 20000, 100000]) {
    const gen = h.newGenState(42);
    const segment = { index, lanes: ['BOOST', 'BOOST', 'TRIPLE', 'TRIPLE', 'ROAD', 'ROAD', 'ROAD'] };
    h.spaceSuperPickups(gen, segment);
    assert.equal(segment.lanes.filter((kind) => kind === 'BOOST').length, 1);
    assert.equal(segment.lanes.filter((kind) => kind === 'TRIPLE').length, 1);
    assert.equal(gen.lastBoostIndex, index);
    assert.equal(gen.lastTripleIndex, index);
    for (const kind of ['BOOST', 'TRIPLE']) {
      const minimum = Math.max(kind === 'TRIPLE' ? h.config.TRIPLE_MIN_GAP : 0,
        Math.ceil(conservativeSpeed(h, index) * protectedSeconds(h, kind)) + 1);
      const field = kind === 'BOOST' ? 'lastBoostIndex' : 'lastTripleIndex';
      for (const shortfall of [0, 1]) {
        const boundaryGen = h.newGenState(42);
        boundaryGen[field] = index - minimum + shortfall;
        const candidate = { index, lanes: [kind, 'ROAD', 'ROAD', 'ROAD', 'ROAD', 'ROAD', 'ROAD'] };
        h.spaceSuperPickups(boundaryGen, candidate);
        assert.equal(candidate.lanes[0], shortfall ? 'ROAD' : kind,
          `${kind} at ${index}, minimum ${minimum}, shortfall ${shortfall}`);
        assert.equal(boundaryGen[field], shortfall ? index - minimum + 1 : index);
      }
    }
  }
  assert.ok(conservativeSpeed(h, 100000) > conservativeSpeed(h, 4000));
});

test('enabling randomized terrain replays both spacing histories before extending the first 400 segments', () => {
  for (const seed of [1, 42, 20260924]) {
    const h = createHarness(seed, false);
    useRunSeed(h, seed);
    h.state.track = h.buildTrack();
    assert.equal(h.state.track.length, 400);
    h.enableFlightTerrain();
    for (const kind of ['BOOST', 'TRIPLE']) {
      const rewards = allRewards(h.state.track, kind);
      const field = kind === 'BOOST' ? 'lastBoostIndex' : 'lastTripleIndex';
      assert.ok(rewards.length >= 1);
      assert.ok(h.state.gen[field] >= rewards.at(-1).index);
    }
    for (let position = 300; position <= 3800; position += 100) {
      h.state.position = position;
      h.extendTrack();
    }
    assert.equal(h.state.track.length, 4000);
    assertTimedSpacing(h, h.state.track, 'BOOST');
    assertTimedSpacing(h, h.state.track, 'TRIPLE');
    const before = JSON.stringify(h.state.track.map((segment) => segment.lanes));
    h.disableFlightTerrain();
    h.enableFlightTerrain();
    assert.equal(JSON.stringify(h.state.track.map((segment) => segment.lanes)), before);
  }
});

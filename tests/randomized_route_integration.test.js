'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const seeds = [1, 42, 1337, 20260924];
const profiles = ['canyon', 'double_peak', 'long_plateau', 'ridge'];
const geometrySpeeds = [8, 24, 45, 53];

// 通过真实开局选择指定随机路线；只隔离声音、DOM 和死亡展示，不替换跳跃、碰撞或折跃函数。
function createHarness(seed) {
  const sandbox = {
    console, crypto: { getRandomValues(values) { values[0] = seed; return values; } },
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now: () => 0 }, requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const name of ['input', 'presentation', 'world-art', 'obstacles', 'gap-regions',
    'tutorial', 'flight_dimensions', 'flight_terrain', 'wormhole']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', `${name}.js`), 'utf8'), sandbox,
      { filename: `${name}.js` });
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, startGame, resetGame, extendTrack, updatePhysics,
      tryJump, checkCollisions, collectPickup, enableFlightTerrain, disableFlightTerrain };
    audioInit = syncPropulsionAudio = syncAdaptiveAudio = refreshPresentation = focusPrimarySurface
      = sfxJump = sfxDoubleJump = sfxTripleJump = sfxFuel = sfxTriple = sfxBoost = sfxSlow
      = sfxMagnet = shotBurstFx = buildingBurstFx = () => {};
    die = reason => { STATE.mode = 'GAMEOVER'; globalThis.deathReason = reason; };
    // 几何测试固定航速，避免混入提速导致的输入时刻变化；其他物理参数保持真实值。
    CONFIG.ACCEL = 0; CONFIG.CRUISE_TAIL_ACCEL = 0;
  `, sandbox);
  const game = sandbox.game;
  const state = game.STATE;
  Object.assign(state, { terrainEnabled: true, tutorial: null, width: 1440, height: 900 });
  game.startGame();
  assert.equal(state.routeSeed, seed);
  return {
    sandbox, game, state, config: game.CONFIG,
    get terrain() { return sandbox.Skyroads.flightTerrain; },
    get wormhole() { return sandbox.Skyroads.wormhole; },
    extendThrough(lastIndex) {
      const position = state.position;
      state.position = lastIndex + 1 - game.CONFIG.TRACK_KEEP_AHEAD;
      game.extendTrack();
      state.position = position;
    },
    place(position, lane, speed = 24) {
      state.position = position;
      state.distanceMeters = position * game.CONFIG.DISTANCE_PER_SEGMENT;
      sandbox.Skyroads.input.resetMovement(state.movement, lane);
      state.groundHeight = sandbox.Skyroads.flightTerrain.heightAt(position, lane);
      state.playerY = state.playerVY = state.jumpsUsed = 0;
      state.speed = speed;
    },
    isolateGeometry() {
      // 保留真实缺口和高程，只去掉无关随机敌人、建筑与奖励对几何可达性的干扰。
      for (const segment of state.track) {
        segment.lanes = segment.lanes.map((kind) => kind === 'GAP' ? kind : 'ROAD');
        segment.enemies = [];
      }
    },
  };
}

function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function finishWarp(h) {
  for (let frame = 0; frame < 160 && h.state.wormhole.active; frame += 1) h.game.updatePhysics(1 / 60);
  assert.equal(h.state.wormhole.active, false);
  assert.equal(h.state.mode, 'PLAYING', h.sandbox.deathReason);
}

// 每种轮廓和左右镜像都必须有真实测试样本；不能因可选模块缺席而静默跳过覆盖。
function terrainCases(module) {
  const cases = new Map();
  for (const seed of [...seeds, 20260922, 20260923]) {
    const h = createHarness(seed);
    for (let cycle = 0; cycle < 16; cycle += 1) {
      const start = h.terrain.TUNING.start + cycle * h.terrain.TUNING.period;
      const route = h.terrain.routeAt(start + 128);
      const layout = route.layout;
      if (module === 'island' && !layout.islandEnabled) continue;
      if (module === 'bridge' && !layout.bridgeGapPhases.length) continue;
      const key = `${layout.profile}:${layout.primaryLeft}`;
      if (!cases.has(key)) cases.set(key, { seed, cycle, profile: layout.profile, primaryLeft: layout.primaryLeft });
    }
  }
  const result = [...cases.values()];
  assert.deepEqual([...new Set(result.map(({ profile }) => profile))].sort(), profiles);
  assert.deepEqual([...new Set(result.map(({ primaryLeft }) => primaryLeft))].sort(), [false, true]);
  assert.equal(result.length, profiles.length * 2, `${module}: each profile must cover both mirrors`);
  return result;
}

function wormholeCases() {
  const cases = new Map();
  for (const seed of seeds) {
    const h = createHarness(seed);
    let after = 0;
    for (let count = 0; count < 16; count += 1) {
      const gate = h.wormhole.nextGate(after, h.terrain);
      const { layout } = h.terrain.routeAt(gate.segment);
      const key = `${layout.profile}:${layout.primaryLeft}`;
      if (!cases.has(key)) cases.set(key, { seed, gate, profile: layout.profile });
      after = gate.segment;
    }
  }
  const result = [...cases.values()];
  assert.deepEqual([...new Set(result.map(({ profile }) => profile))].sort(), profiles);
  assert.equal(result.length, profiles.length * 2);
  return result;
}

test('every randomized profile requires a real double jump from either high wormhole runway', () => {
  const gateLanes = new Set();
  for (const { seed, gate, profile } of wormholeCases()) {
    for (const speed of geometrySpeeds) {
      for (const jumpCount of [1, 2]) {
        const h = createHarness(seed);
        h.state.wormhole.gate = gate;
        gateLanes.add(gate.lane);
        const context = `seed ${seed}, ${profile}, cycle ${gate.cycle}, speed ${speed}, jumps ${jumpCount}`;
        assert.equal(gate.lane, h.terrain.routeAt(gate.segment).branchLanes[0]);
        close(gate.groundHeight, h.terrain.heightAt(gate.segment, gate.lane));
        close(gate.height, gate.groundHeight + h.wormhole.TUNING.entryHeight);
        assert.ok(gate.groundHeight > h.terrain.heightAt(gate.segment, 3));
        h.extendThrough(gate.segment + 220);
        h.place(gate.segment - speed * 0.50, gate.lane, speed);
        h.isolateGeometry();
        h.game.tryJump();
        let apex = 0;
        let usedSecondJump = false;
        for (let frame = 0; frame < 180 && h.state.position <= gate.segment && !h.state.wormhole.active; frame += 1) {
          if (jumpCount === 2 && frame === 56) {
            h.game.tryJump();
            assert.equal(h.state.jumpsUsed, 2, context);
            usedSecondJump = true;
          }
          h.game.updatePhysics(1 / 240);
          apex = Math.max(apex, h.state.playerY);
          assert.equal(h.state.mode, 'PLAYING', `${context}: ${h.sandbox.deathReason}`);
        }
        assert.equal(h.state.wormhole.active, jumpCount === 2, context);
        assert.equal(usedSecondJump, jumpCount === 2, context);
        if (jumpCount === 1) {
          assert.ok(apex <= h.config.JUMP_VELOCITY ** 2 / (2 * h.config.GRAVITY), context);
          assert.ok(h.state.position > gate.segment, context);
          assert.equal(h.state.wormhole.completedCount, 0);
        } else {
          assert.equal(h.state.position, gate.segment);
          assert.ok(h.state.playerY > 1250, context);
        }
      }
    }
  }
  assert.deepEqual([...gateLanes].sort(), [0, 5]);
});

test('a randomized warp preserves its seed, freezes benefits and resumes the same generated route with two protected seconds', () => {
  for (const seed of [1, 1337, 20260924]) {
    const h = createHarness(seed);
    const { state, game } = h;
    const terrain = h.terrain;
    const gate = state.wormhole.gate;
    h.extendThrough(gate.segment + 40);
    h.place(gate.segment - 0.01, gate.lane, 36);
    state.playerY = gate.height - state.groundHeight;
    state.jumpsUsed = 2;
    Object.assign(state, { fuel: 0.02, boostT: 3, boostPrevSpeed: 24, fuelBurstT: 1.2,
      fuelBurstPrevSpeed: 24, tripleT: 7, magnetT: 4, boostGraceT: 0.3, fuelBurstGraceT: 0.7 });
    game.updatePhysics(0.01);
    assert.equal(state.wormhole.active, true);
    const frozen = Object.fromEntries(['fuel', 'boostT', 'boostPrevSpeed', 'fuelBurstT', 'fuelBurstPrevSpeed',
      'tripleT', 'magnetT', 'boostGraceT', 'fuelBurstGraceT', 'speed'].map((key) => [key, state[key]]));
    const entryDistance = state.distanceMeters;
    finishWarp(h);
    for (const [key, value] of Object.entries(frozen)) assert.equal(state[key], value, key);
    assert.equal(h.terrain, terrain);
    assert.equal(state.routeSeed, seed);
    close(state.position, gate.segment + 600);
    close(state.distanceMeters - entryDistance, 6000);
    close(state.groundHeight, terrain.heightAt(state.position, 3));
    assert.equal(state.wormhole.graceT, 2);
    assert.equal(state.wormhole.completedCount, 1);
    const next = state.wormhole.gate;
    assert.equal(next.lane, terrain.routeAt(next.segment).branchLanes[0]);
    close(next.groundHeight, terrain.heightAt(next.segment, next.lane));
    for (let index = 0; index < state.track.length; index += 1) assert.equal(state.track[index].index, index);
    // 同种子完整生成的出口后方应逐格相同；仅安全出口允许清障、补给造成差异。
    const reference = createHarness(seed);
    reference.extendThrough(state.track.length - 1);
    for (let index = Math.floor(state.position) + 61; index < state.track.length; index += 1) {
      assert.equal(JSON.stringify(state.track[index]), JSON.stringify(reference.state.track[index]),
        `seed ${seed}, segment ${index}: generation changed after warp`);
    }
    for (let index = Math.floor(state.position); index <= state.position + 60; index += 1) {
      assert.ok(['ROAD', 'FUEL'].includes(state.track[index].lanes[3]));
      assert.equal(state.track[index].enemies.length, 0);
    }
    const pullsBeforeResume = state.magnetPulls.length;
    game.updatePhysics(0.01);
    close(state.tripleT, frozen.tripleT - 0.01);
    close(state.magnetT, frozen.magnetT - 0.01);
    // 恢复中的磁铁可吸到安全出口晶体；增长须来自实际收集，不能误当成折跃偷偷补油。
    close(state.fuel, Math.min(h.config.FUEL_MAX,
      frozen.fuel + (state.magnetPulls.length - pullsBeforeResume) * h.config.FUEL_PICKUP));
    // 清除其他保护来源并铺设敌对建筑，单独验证虫洞出口而非偶然空路带来的两秒保护。
    Object.assign(state, { boostT: 0, fuelBurstT: 0, boostGraceT: 0, fuelBurstGraceT: 0, fuel: 100 });
    for (let index = Math.floor(state.position); index < state.position + 100; index += 1) {
      state.track[index].lanes[3] = 'WALL_HIGH';
    }
    for (let frame = 0; frame < 199 && state.wormhole.graceT > 0.005 + 1e-8; frame += 1) {
      game.updatePhysics(Math.min(0.01, state.wormhole.graceT - 0.005));
    }
    assert.equal(state.mode, 'PLAYING');
    game.updatePhysics(0.006);
    game.checkCollisions(3, 3);
    assert.equal(state.wormhole.graceT, 0);
    assert.equal(state.mode, 'GAMEOVER');
    assert.equal(h.sandbox.deathReason, 'wall');
  }
});

test('optional bridge gaps in every profile remain jumpable at slow, cruise and late boosted speeds', () => {
  const phases = new Set();
  for (const { seed, cycle, profile } of terrainCases('bridge')) {
    const reference = createHarness(seed);
    const start = reference.terrain.TUNING.start + cycle * reference.terrain.TUNING.period;
    const layout = reference.terrain.routeAt(start + 128).layout;
    for (const phase of layout.bridgeGapPhases) {
      phases.add(phase);
      for (const speed of geometrySpeeds) {
        const h = createHarness(seed);
        const gap = start + phase;
        const lane = h.terrain.routeAt(gap).gapLane;
        const context = `seed ${seed}, ${profile}, cycle ${cycle}, gap ${phase}, speed ${speed}`;
        assert.ok(Number.isFinite(lane), context);
        h.extendThrough(gap + 150);
        h.place(gap - speed * 0.07, lane, speed);
        h.isolateGeometry();
        h.game.tryJump();
        let crossed = false;
        for (let frame = 0; frame < 360 && h.state.mode === 'PLAYING'; frame += 1) {
          h.game.updatePhysics(1 / 240);
          if (h.state.position >= gap && h.state.position < gap + 2) {
            crossed = true;
            assert.equal(h.state.track[Math.floor(h.state.position)].lanes[lane], 'GAP', context);
            assert.ok(h.state.playerY >= h.config.GAP_SAFE_HEIGHT, context);
          }
          if (h.state.position > gap + 2 && h.state.playerY === 0) break;
        }
        assert.equal(h.state.mode, 'PLAYING', `${context}: ${h.sandbox.deathReason}`);
        assert.equal(crossed, true, context);
        assert.ok(h.state.position > gap + 2, context);
        assert.equal(h.state.playerY, 0, context);
        assert.equal(h.state.jumpsUsed, 0, context);
        assert.equal(h.state.track[Math.floor(h.state.position)].lanes[lane], 'ROAD', context);
      }
    }
  }
  assert.deepEqual([...phases].sort((a, b) => a - b), [108, 126]);
});

test('optional floating islands across every profile support separate entry and exit jumps', () => {
  for (const { seed, cycle, profile } of terrainCases('island')) {
    for (const speed of geometrySpeeds) {
      const h = createHarness(seed);
      const tuning = h.terrain.TUNING;
      const start = tuning.start + cycle * tuning.period;
      const lane = h.terrain.routeAt(start + 120).islandLane;
      const context = `seed ${seed}, ${profile}, cycle ${cycle}, speed ${speed}`;
      h.extendThrough(start + 240);
      // 高速时提前起跳，为岛面上落地再起跳留下空间；8 速也须真正在入岛缺口上保持安全高度。
      h.place(start + tuning.islandGapStart - speed * 0.13, lane, speed);
      h.isolateGeometry();
      h.game.tryJump();
      let landed = false;
      let jumpedExit = false;
      const crossed = new Set();
      for (let frame = 0; frame < 1600 && h.state.mode === 'PLAYING'; frame += 1) {
        h.game.updatePhysics(1 / 240);
        const phase = h.state.position - start;
        if (phase >= tuning.islandGapStart && phase < tuning.islandStart
          || phase >= tuning.islandEnd && phase < tuning.islandLanding) {
          crossed.add(phase < tuning.islandStart ? 'entry' : 'exit');
          assert.equal(h.state.track[Math.floor(h.state.position)].lanes[lane], 'GAP', context);
          assert.ok(h.state.playerY >= h.config.GAP_SAFE_HEIGHT, context);
        }
        if (phase >= tuning.islandStart && phase < tuning.islandEnd && h.state.playerY === 0) landed = true;
        if (!jumpedExit && phase >= tuning.islandEnd - speed * 0.07) {
          assert.equal(landed, true, context);
          assert.equal(h.state.playerY, 0, context);
          h.game.tryJump();
          assert.equal(h.state.jumpsUsed, 1, context);
          jumpedExit = true;
        }
        if (phase > tuning.islandLanding && h.state.playerY === 0) break;
      }
      assert.equal(h.state.mode, 'PLAYING', `${context}: ${h.sandbox.deathReason}`);
      assert.equal(jumpedExit, true, context);
      assert.deepEqual([...crossed], ['entry', 'exit'], context);
      assert.ok(h.state.position > start + tuning.islandLanding
        && h.state.position < start + tuning.landingEnd, context);
      assert.ok(h.terrain.routeAt(h.state.position).safeLanes.includes(lane), context);
      assert.equal(h.state.track[Math.floor(h.state.position)].lanes[lane], 'ROAD', context);
      assert.equal(h.state.playerY, 0, context);
      assert.equal(h.state.jumpsUsed, 0, context);
    }
  }
});

test('every structural profile supports a grounded center crossing and continuous cycle seams', () => {
  for (const { seed, cycle, profile } of terrainCases('center')) {
    for (const speed of geometrySpeeds) {
      const h = createHarness(seed);
      const start = h.terrain.TUNING.start + cycle * h.terrain.TUNING.period;
      const end = start + h.terrain.TUNING.period;
      const context = `seed ${seed}, ${profile}, cycle ${cycle}, speed ${speed}`;
      h.extendThrough(end + 220);
      // 纯地形夹具使用真实装饰器建图，保留全部可选缺口；普通随机挑战不属于中心高程连续性验证。
      h.state.track = h.state.track.map(({ index }) => h.terrain.decorateSegment({
        index, lanes: Array(h.config.LANES).fill('ROAD'), enemies: [],
      }));
      h.isolateGeometry();
      h.place(start, 3, speed);
      let minimumHeight = Infinity;
      let maximumHeight = -Infinity;
      for (let frame = 0; h.state.position < end + 1 && frame < 5000; frame += 1) {
        h.state.fuel = h.config.FUEL_MAX;
        h.game.updatePhysics(1 / 120);
        assert.equal(h.state.mode, 'PLAYING', `${context}: ${h.sandbox.deathReason}`);
        close(h.state.groundHeight, h.terrain.heightAt(h.state.position, 3));
        assert.equal(h.state.playerY, 0, context);
        assert.equal(h.state.playerVY, 0, context);
        assert.equal(h.state.jumpsUsed, 0, context);
        minimumHeight = Math.min(minimumHeight, h.state.groundHeight);
        maximumHeight = Math.max(maximumHeight, h.state.groundHeight);
      }
      assert.ok(h.state.position >= end + 1, context);
      assert.ok(maximumHeight > 2000, context);
      assert.ok(minimumHeight <= 0, context);
      close(h.terrain.heightAt(end, 3), 0);
      close(h.terrain.sample(end, 3).slope, 0);
    }
  }
});

test('GPU fallback and restoration keep the randomized layout and do not respawn collected rewards', () => {
  for (const seed of seeds) {
    const h = createHarness(seed);
    h.extendThrough(1200);
    const terrain = h.terrain;
    const collected = [];
    for (const segment of h.state.track) {
      for (let lane = 0; lane < 7; lane += 1) {
        const type = segment.lanes[lane];
        if (type !== 'FUEL' && type !== 'TRIPLE') continue;
        h.place(segment.index, lane);
        h.state.tripleT = 0;
        assert.equal(h.game.collectPickup(segment, lane, type), true);
        collected.push([segment.index, lane]);
      }
    }
    assert.ok(collected.length > 40);
    const before = JSON.stringify(h.state.track.map((segment) => segment.lanes));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      h.game.disableFlightTerrain();
      h.game.enableFlightTerrain();
      assert.equal(h.terrain, terrain);
      assert.equal(h.state.routeSeed, seed);
      assert.equal(JSON.stringify(h.state.track.map((segment) => segment.lanes)), before);
    }
    for (const [index, lane] of collected) assert.equal(h.state.track[index].lanes[lane], 'ROAD');
  }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 直接调用真实游戏函数；仅隔离声音、粒子和 DOM，不复制高程或碰撞算法。
function createHarness(position = 160, lane = 3) {
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: {
      innerWidth: 1440, innerHeight: 900, listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
    },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now: () => 0 },
    requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of [
    'src/input.js', 'src/presentation.js', 'src/world-art.js', 'src/obstacles.js',
    'src/gap-regions.js', 'src/tutorial.js', 'src/flight_dimensions.js', 'src/flight_terrain.js', 'src/wormhole.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8')
    .replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${gameSource}
    globalThis.__game = {
      STATE, CONFIG, enableFlightTerrain, disableFlightTerrain, heightAboveLane,
      tryJump, canFuelBurst, fireBullet, fireMissile, advanceShots, updatePhysics,
      checkCollisions, enemyLane, resetGame, project, updateEffects, togglePause, KEYS,
    };
    syncPropulsionAudio = () => {};
    shotBurstFx = () => {};
    buildingBurstFx = () => {};
    sfxJump = () => {}; sfxDoubleJump = () => {}; sfxTripleJump = () => {};
    CONFIG.ACCEL = 0;
  `, sandbox, { filename: 'src/game.js' });
  const game = sandbox.__game;
  const state = game.STATE;
  const terrain = sandbox.Skyroads.flightTerrain;
  Object.assign(state, {
    mode: 'PLAYING', position, speed: 8, width: 1440, height: 900,
    playerY: 0, playerVY: 0, jumpsUsed: 0, fuel: 100, tutorial: null,
    movement: sandbox.Skyroads.input.createMovementState(lane),
    track: Array.from({ length: 1400 }, (_, index) => ({
      index, lanes: Array(7).fill('ROAD'), enemies: [],
    })),
  });
  assert.equal(game.enableFlightTerrain(), true);
  return {
    sandbox, state, terrain, game,
    key(type, code) {
      sandbox.window.listeners[type]({ code, target: null, repeat: false, preventDefault() {} });
    },
    collide(from = state.movement.lanePosition, to = from) {
      sandbox.__death = null;
      state.mode = 'PLAYING';
      game.checkCollisions(from, to);
      return sandbox.__death;
    },
  };
}

test('warp freezes fuel, gameplay motion and all active powerup clocks even near empty', () => {
  const { state, game } = createHarness(416, 5);
  state.wormhole = { active: true, elapsed: 0.1, entryPosition: 416, entryDistance: 4160,
    entryHeight: 4520, entryLane: 5, eventId: 1, completedT: 0, graceT: 0 };
  Object.assign(state, { fuel: 0.02, boostT: 3, fuelBurstT: 2, tripleT: 5, magnetT: 8,
    fuelBurstGraceT: 0.5, boostGraceT: 0.7, playerY: 1350, playerVY: -100, gliding: true, distanceMeters: 4160 });
  const before = { fuel: state.fuel, boostT: state.boostT, fuelBurstT: state.fuelBurstT,
    tripleT: state.tripleT, magnetT: state.magnetT, fuelBurstGraceT: state.fuelBurstGraceT, boostGraceT: state.boostGraceT,
    position: state.position, distanceMeters: state.distanceMeters, playerY: state.playerY };
  game.KEYS.KeyK = true;
  game.updatePhysics(0.05);
  for (const [key, value] of Object.entries(before)) assert.equal(state[key], value, key);
  assert.equal(state.mode, 'PLAYING');
  assert.equal(state.elapsedMs, 50);
  assert.ok(Math.abs(state.wormhole.elapsed - 0.15) < 1e-9);
});

function approach(harness, { speed = 24, laneOffset = 0, heightOffset = 0 } = {}) {
  const { state, game, terrain } = harness;
  const gate = harness.sandbox.Skyroads.wormhole.nextGate(0, terrain);
  state.position = gate.segment - 0.01;
  state.distanceMeters = state.position * game.CONFIG.DISTANCE_PER_SEGMENT;
  state.movement = harness.sandbox.Skyroads.input.createMovementState(gate.lane + laneOffset);
  state.groundHeight = terrain.heightAt(state.position, gate.lane + laneOffset);
  state.playerY = gate.height + heightOffset - state.groundHeight;
  state.playerVY = 0;
  state.jumpsUsed = 2;
  state.speed = speed;
  state.wormhole.gate = gate;
  game.updatePhysics(0.01);
  return gate;
}

function finish(harness) {
  let frames = 0;
  while (harness.state.wormhole.active && frames++ < 160) harness.game.updatePhysics(1 / 60);
  assert.equal(harness.state.wormhole.active, false);
  assert.ok(frames < 160);
}

test('a swept entry credits exactly 6000m once, preserves buffs and prepares a safe fueled exit', () => {
  const h = createHarness();
  const { state, game, terrain } = h;
  state.boostT = 0.025;
  state.boostPrevSpeed = 19;
  state.tripleT = 7.12;
  state.magnetT = 4.1;
  state.fuelBurstGraceT = 0.72;
  const gate = approach(h, { speed: 36 });
  assert.equal(state.wormhole.active, true);
  assert.equal(state.position, gate.segment);
  assert.equal(state.distanceMeters, gate.segment * 10);
  const before = { fuel: state.fuel, boostT: state.boostT, boostPrevSpeed: state.boostPrevSpeed,
    tripleT: state.tripleT, magnetT: state.magnetT, fuelBurstGraceT: state.fuelBurstGraceT, speed: state.speed };
  state.track[gate.segment + 10].lanes[gate.lane] = 'FUEL';
  state.track[gate.segment + 20].enemies.push({ type: 'turret', lane: gate.lane });
  const kills = state.enemyKills;
  finish(h);
  for (const [key, value] of Object.entries(before)) assert.equal(state[key], value, key);
  assert.equal(state.position, gate.segment + 600);
  assert.equal(state.distanceMeters, gate.segment * 10 + 6000);
  assert.equal(state.wormhole.completedCount, 1);
  assert.equal(state.wormhole.lastRewardMeters, 6000);
  assert.equal(state.enemyKills, kills);
  assert.equal(state.track[gate.segment + 10].lanes[gate.lane], 'FUEL');
  assert.equal(state.track[gate.segment + 20].enemies.length, 1);
  assert.equal(state.movement.lanePosition, 3);
  assert.equal(state.playerY, 0);
  assert.equal(state.groundHeight, terrain.heightAt(state.position, 3));
  for (let index = Math.floor(state.position); index <= state.position + 60; index++) {
    assert.ok(['ROAD', 'FUEL'].includes(state.track[index].lanes[3]));
    assert.equal(state.track[index].enemies.length, 0);
  }
  game.updatePhysics(0.01);
  assert.equal(state.speed, 36);
  assert.ok(Math.abs(state.boostT - (before.boostT - 0.01)) < 1e-8);
  assert.ok(Math.abs(state.tripleT - (before.tripleT - 0.01)) < 1e-8);
  assert.ok(Math.abs(state.magnetT - (before.magnetT - 0.01)) < 1e-8);
  game.updatePhysics(0.03);
  game.updatePhysics(0.01);
  assert.equal(state.speed, 19);
  assert.equal(state.wormhole.completedCount, 1);
  assert.ok(state.distanceMeters < gate.segment * 10 + 6020);
});

test('entry plane is optional and compact: a neighboring lane, single-jump height or high corner misses', () => {
  for (const options of [{ laneOffset: 1 }, { heightOffset: -550 }, { laneOffset: 0.3, heightOffset: 270 }]) {
    const h = createHarness();
    const gate = approach(h, options);
    assert.equal(h.state.wormhole.active, false);
    assert.equal(h.state.wormhole.completedCount, 0);
    assert.equal(h.state.mode, 'PLAYING');
    assert.ok(h.state.position > gate.segment);
    assert.ok(h.state.wormhole.gate.segment > gate.segment + 1000);
  }
});

test('near-edge swept entries activate once and retain the full safe warp reward', () => {
  for (const options of [{ laneOffset: 0.39 }, { laneOffset: -0.39 }, { heightOffset: 275 }, { heightOffset: -275 }]) {
    const h = createHarness();
    const gate = approach(h, options);
    assert.equal(h.state.wormhole.active, true, JSON.stringify(options));
    const fuel = h.state.fuel;
    finish(h);
    assert.equal(h.state.position, gate.segment + 600);
    assert.equal(h.state.distanceMeters, gate.segment * 10 + 6000);
    assert.equal(h.state.wormhole.completedCount, 1);
    assert.equal(h.state.wormhole.graceT, 2);
    assert.equal(h.state.fuel, fuel);
  }
});

test('all gameplay input is inert in warp, while pause and blur freeze the warp clock', () => {
  const h = createHarness();
  approach(h);
  const { state, game } = h;
  const before = { fuel: state.fuel, playerY: state.playerY, lane: state.movement.lanePosition };
  for (const code of ['Space', 'KeyK', 'KeyW', 'ArrowUp', 'KeyJ', 'KeyA', 'KeyD']) {
    h.key('keydown', code); h.key('keyup', code);
  }
  game.tryJump(); game.fireBullet(); game.fireMissile();
  assert.equal(game.canFuelBurst(), false);
  assert.equal(state.fuel, before.fuel);
  assert.equal(state.playerY, before.playerY);
  assert.equal(state.movement.lanePosition, before.lane);
  assert.equal(state.shots.length, 0);
  assert.equal(state.chargeT, 0);
  assert.equal(state.fuelBurstChargeT, 0);
  const elapsed = state.wormhole.elapsed;
  game.togglePause();
  game.updatePhysics(0.05);
  assert.equal(state.wormhole.elapsed, elapsed);
  game.togglePause();
  game.updatePhysics(0.05);
  assert.ok(state.wormhole.elapsed > elapsed);
  h.sandbox.window.listeners.blur();
  assert.equal(state.mode, 'PAUSED');
  const blurredElapsed = state.wormhole.elapsed;
  game.updatePhysics(0.05);
  assert.equal(state.wormhole.elapsed, blurredElapsed);
});

test('near-empty fuel survives the whole warp and its protected exit without a hidden refill', () => {
  const h = createHarness();
  h.state.fuel = 0.02;
  approach(h);
  assert.equal(h.state.wormhole.active, true);
  const fuel = h.state.fuel;
  assert.ok(fuel > 0 && fuel <= 0.02);
  finish(h);
  assert.equal(h.state.mode, 'PLAYING');
  assert.equal(h.state.fuel, fuel);
  h.game.updatePhysics(0.005);
  assert.equal(h.state.mode, 'PLAYING');
  assert.equal(h.state.fuel, fuel);
});

test('a GPU fallback during warp still completes once in flat compatibility physics', () => {
  const h = createHarness();
  approach(h);
  const fuel = h.state.fuel;
  const distance = h.state.wormhole.entryDistance;
  h.game.disableFlightTerrain();
  finish(h);
  assert.equal(h.state.terrainEnabled, false);
  assert.equal(h.state.groundHeight, 0);
  assert.equal(h.state.playerY, 0);
  assert.equal(h.state.mode, 'PLAYING');
  assert.equal(h.state.fuel, fuel);
  assert.equal(h.state.distanceMeters, distance + 6000);
  assert.equal(h.state.wormhole.gate, null);
});

test('restarting an unfinished warp clears reward, input and every transient without late credit', () => {
  const h = createHarness();
  approach(h);
  h.game.updatePhysics(1);
  h.game.resetGame();
  assert.equal(h.state.wormhole.active, false);
  assert.equal(h.state.wormhole.eventId, 0);
  assert.equal(h.state.wormhole.completedCount, 0);
  assert.equal(h.state.position, 0);
  assert.equal(h.state.distanceMeters, 0);
  const terrain = h.sandbox.Skyroads.flightTerrain;
  const nextGate = h.sandbox.Skyroads.wormhole.nextGate(0, terrain);
  assert.equal(h.state.wormhole.gate.segment, nextGate.segment);
  assert.equal(h.state.wormhole.gate.lane, terrain.routeAt(nextGate.segment).branchLanes[0]);
  assert.equal(h.state.wormhole.gate.groundHeight, terrain.heightAt(nextGate.segment, nextGate.lane));
  h.game.updatePhysics(0.01);
  assert.ok(h.state.distanceMeters < 1);
});


test('exit protection lasts two full gameplay seconds against buildings, then ordinary collision resumes', () => {
  const h = createHarness();
  approach(h);
  finish(h);
  assert.equal(h.state.wormhole.graceT, 2);
  h.state.boostT = 0; h.state.fuelBurstT = 0; h.state.fuelBurstGraceT = 0;
  // 故意把安全出口换成建筑，证明存活来自无敌判定，而非恰好没有障碍。
  for (let index = Math.floor(h.state.position); index <= h.state.position + 80; index += 1) {
    h.state.track[index].lanes[3] = 'WALL_HIGH';
  }
  vm.runInContext("die = reason => { STATE.mode = 'GAMEOVER'; globalThis.deathReason = reason; };", h.sandbox);
  for (let frame = 0; frame < 99; frame += 1) h.game.updatePhysics(0.02);
  h.game.updatePhysics(0.019);
  assert.equal(h.state.mode, 'PLAYING');
  assert.ok(h.state.wormhole.graceT > 0 && h.state.wormhole.graceT < 0.002);
  h.game.togglePause();
  const remaining = h.state.wormhole.graceT;
  h.game.updatePhysics(10);
  assert.equal(h.state.wormhole.graceT, remaining);
  h.game.togglePause();
  h.game.updatePhysics(0.002);
  assert.equal(h.state.wormhole.graceT, 0);
  h.game.checkCollisions(3, 3);
  assert.equal(h.state.mode, 'GAMEOVER');
  assert.equal(h.sandbox.deathReason, 'wall');
});


test('boost and fuel burst preserve their respective 1.5 and 2 second exit shields through expiry substeps', () => {
  for (const [active, grace, duration] of [['boostT', 'boostGraceT', 1.5], ['fuelBurstT', 'fuelBurstGraceT', 2]]) {
    const h = createHarness();
    h.state[active] = 0.003;
    h.state[grace] = 0;
    h.state[active === 'boostT' ? 'boostPrevSpeed' : 'fuelBurstPrevSpeed'] = 8;
    for (let index = 160; index < 280; index += 1) h.state.track[index].lanes[3] = 'WALL_HIGH';
    vm.runInContext("die = reason => { STATE.mode = 'GAMEOVER'; globalThis.deathReason = reason; };", h.sandbox);
    h.game.updatePhysics(0.01);
    assert.equal(h.state[active], 0);
    assert.ok(Math.abs(h.state[grace] - (duration - 0.007)) < 1e-8, `${active} must account only for time after expiry`);
    assert.equal(h.state.mode, 'PLAYING');
    h.game.updatePhysics(0.001);
    assert.equal(h.state.speed, 8);
    const frames = Math.floor((duration - 0.008) / 0.02);
    for (let frame = 0; frame < frames; frame += 1) h.game.updatePhysics(0.02);
    h.game.updatePhysics(duration - 0.009 - frames * 0.02);
    assert.ok(Math.abs(h.state[grace] - 0.001) < 1e-8);
    assert.equal(h.state.mode, 'PLAYING', `${active} protects after speed restoration`);
    h.game.togglePause();
    const remaining = h.state[grace];
    h.game.updatePhysics(5);
    assert.equal(h.state[grace], remaining);
    h.game.togglePause();
    h.game.updatePhysics(0.002);
    h.game.checkCollisions(3, 3);
    assert.equal(h.state[grace], 0);
    assert.equal(h.sandbox.deathReason, 'wall');
    h.game.resetGame();
    assert.equal(h.state.boostGraceT, 0);
    assert.equal(h.state.fuelBurstGraceT, 0);
  }
});

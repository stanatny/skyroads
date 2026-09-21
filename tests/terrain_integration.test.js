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
    'src/gap-regions.js', 'src/tutorial.js', 'src/flight_dimensions.js', 'src/flight_terrain.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8')
    .replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${gameSource}
    globalThis.__game = {
      STATE, CONFIG, enableFlightTerrain, disableFlightTerrain, heightAboveLane,
      tryJump, canFuelBurst, fireBullet, fireMissile, advanceShots, updatePhysics,
      checkCollisions, enemyLane, resetGame, project,
    };
    syncPropulsionAudio = () => {};
    shotBurstFx = () => {};
    buildingBurstFx = () => {};
    die = (reason) => { STATE.mode = 'GAMEOVER'; globalThis.__death = reason; };
  `, sandbox, { filename: 'src/game.js' });
  const game = sandbox.__game;
  const state = game.STATE;
  const terrain = sandbox.Skyroads.flightTerrain;
  Object.assign(state, {
    mode: 'PLAYING', position, speed: 8, width: 1440, height: 900,
    playerY: 0, playerVY: 0, jumpsUsed: 0, fuel: 100, tutorial: null,
    movement: sandbox.Skyroads.input.createMovementState(lane),
    track: Array.from({ length: 640 }, (_, index) => ({
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

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function advanceTo(harness, shot, target) {
  for (let step = 0; step < 1000 && harness.state.shots.includes(shot) && shot.seg < target; step += 1) {
    harness.game.advanceShots(0.005);
  }
}

test('a grounded pilot on an elevated platform can charge a burst and take a free first jump', () => {
  const { game, state, terrain } = createHarness(160, 0);
  assert.equal(state.terrainEnabled, true);
  assert.ok(state.groundHeight > 0);
  close(state.groundHeight, terrain.heightAt(state.position, 0));
  assert.equal(game.canFuelBurst(), true);
  const beforeFuel = state.fuel;
  game.tryJump();
  assert.equal(state.jumpsUsed, 1);
  assert.equal(state.playerVY, game.CONFIG.JUMP_VELOCITY);
  assert.ok(state.playerY > 0 && state.playerY < 1);
  assert.equal(state.fuel, beforeFuel);
  assert.equal(game.canFuelBurst(), false);
});

test('bullets and missiles retain the firing platform elevation after the pilot moves', () => {
  const { game, state } = createHarness(160, 0);
  state.playerY = 450;
  game.fireBullet();
  game.fireMissile();
  assert.equal(state.shots.length, 2);
  const before = state.shots.map((shot) => ({
    shot, y: shot.y, groundY: shot.groundY, absolute: shot.y + shot.groundY,
  }));
  for (const value of before) {
    close(value.groundY, state.groundHeight);
    assert.ok(value.y > state.playerY);
  }
  state.groundHeight = 0;
  state.playerY = 0;
  game.advanceShots(0.005);
  for (const value of before) {
    close(value.shot.y, value.y);
    close(value.shot.groundY, value.groundY);
    close(value.shot.y + value.shot.groundY, value.absolute);
  }
});

test('an uphill low wall blocks a fixed-height shot while a lower downhill wall can be overflown', () => {
  const uphill = createHarness(126, 0);
  const uphillTarget = 146;
  uphill.state.track[uphillTarget].lanes[0] = 'WALL_LOW';
  const rise = uphill.terrain.heightAt(uphillTarget, 0) - uphill.state.groundHeight;
  // 弹道比单个矮墙高，但低于前方高台上的矮墙顶部，且不会先撞进坡面。
  uphill.state.playerY = uphill.game.CONFIG.WALL_LOW_HEIGHT + rise / 2 - uphill.terrain.TUNING.gunHeight;
  uphill.game.fireBullet();
  const risingShot = uphill.state.shots[0];
  assert.ok(risingShot.y > uphill.game.CONFIG.WALL_LOW_HEIGHT);
  assert.ok(risingShot.y + risingShot.groundY > uphill.terrain.heightAt(uphillTarget, 0));
  advanceTo(uphill, risingShot, uphillTarget + 1);
  assert.equal(uphill.state.shots.includes(risingShot), false);
  assert.equal(Math.floor(risingShot.seg), uphillTarget);
  assert.equal(uphill.state.track[uphillTarget].lanes[0], 'WALL_LOW');

  const downhill = createHarness(160, 0);
  const downhillTarget = 196;
  downhill.state.track[downhillTarget].lanes[0] = 'WALL_LOW';
  downhill.game.fireBullet();
  const fallingShot = downhill.state.shots[0];
  assert.ok(fallingShot.y < downhill.game.CONFIG.WALL_LOW_HEIGHT);
  assert.ok(fallingShot.y + fallingShot.groundY
    > downhill.terrain.heightAt(downhillTarget, 0) + downhill.game.CONFIG.WALL_LOW_HEIGHT);
  advanceTo(downhill, fallingShot, downhillTarget + 1);
  assert.equal(downhill.state.shots.includes(fallingShot), true);
  assert.equal(downhill.state.track[downhillTarget].lanes[0], 'WALL_LOW');
});

test('terrain occludes a low shot before it can destroy an enemy behind the rising road', () => {
  const harness = createHarness(64, 3);
  const enemy = { type: 'turret', lane: 3 };
  harness.state.track[100].enemies.push(enemy);
  harness.game.fireBullet();
  const shot = harness.state.shots[0];
  advanceTo(harness, shot, 101);
  assert.equal(harness.state.shots.includes(shot), false);
  assert.ok(shot.seg < 100);
  assert.equal(harness.state.track[100].enemies.includes(enemy), true);
  assert.equal(harness.state.enemyKills, 0);
});

test('a projectile touching a higher terrace cannot shoot through its side into an enemy', () => {
  const harness = createHarness(160, 1.51);
  const enemy = { type: 'drone', lane: 6, fromLane: 1.4, toLane: 1.4, state: 'rest' };
  harness.state.track[161].enemies.push(enemy);
  harness.game.fireBullet();
  const shot = harness.state.shots[0];
  assert.ok(shot.y + shot.groundY < harness.terrain.heightAt(161, 1));
  advanceTo(harness, shot, 162);
  assert.equal(harness.state.shots.includes(shot), false);
  assert.equal(harness.state.track[161].enemies.includes(enemy), true);
  assert.equal(harness.state.enemyKills, 0);
});

test('wall collision compares the player world altitude against the contacted lane elevation', () => {
  const harness = createHarness(160, 1.51);
  const { state, terrain, game } = harness;
  state.track[160].lanes[1] = 'WALL_LOW';
  const threshold = terrain.heightAt(160, 1) + game.CONFIG.WALL_LOW_HEIGHT - state.groundHeight;
  assert.ok(threshold > game.CONFIG.WALL_LOW_HEIGHT);
  state.playerY = threshold;
  assert.equal(harness.collide(), 'wall');
  state.playerY = threshold + 0.001;
  assert.equal(harness.collide(), null);

  state.track[160].lanes[1] = 'ROAD';
  state.track[160].lanes[2] = 'WALL_LOW';
  state.movement = harness.sandbox.Skyroads.input.createMovementState(1.49);
  state.groundHeight = terrain.heightAt(160, 1.49);
  state.playerY = Math.max(0, terrain.heightAt(160, 2) + game.CONFIG.WALL_LOW_HEIGHT - state.groundHeight) + 0.001;
  assert.equal(harness.collide(), null);
});

test('a moving drone uses its actual support lane instead of its stale lane field for collision height', () => {
  const harness = createHarness(160, 1.55);
  const { state, terrain, game } = harness;
  const enemy = { type: 'drone', lane: 6, fromLane: 1, toLane: 2, state: 'move', moveT: 0.49 };
  state.track[160].enemies.push(enemy);
  const actualLane = game.enemyLane(enemy);
  assert.ok(terrain.heightAt(160, actualLane) > terrain.heightAt(160, enemy.lane));
  const threshold = terrain.heightAt(160, actualLane) + game.CONFIG.DRONE_HEIGHT - state.groundHeight;
  state.playerY = threshold;
  assert.equal(harness.collide(), 'enemy');
  state.playerY = threshold + 0.001;
  assert.equal(harness.collide(), null);
});

test('landing on an uphill surface restores first-jump and fuel-burst eligibility', () => {
  const { game, state } = createHarness(82, 3);
  state.playerY = 0.5;
  state.playerVY = -10;
  state.jumpsUsed = 1;
  game.updatePhysics(0.01);
  assert.equal(state.mode, 'PLAYING');
  assert.equal(state.playerY, 0);
  assert.equal(state.playerVY, 0);
  assert.equal(state.jumpsUsed, 0);
  assert.equal(game.canFuelBurst(), true);
  game.tryJump();
  assert.equal(state.jumpsUsed, 1);
  assert.equal(state.playerVY, game.CONFIG.JUMP_VELOCITY);
});

test('compatibility fallback preserves relative motion and progress while flattening all terrain bases', () => {
  const { game, state } = createHarness(160, 0);
  state.playerY = 350;
  state.playerVY = -1000;
  state.jumpsUsed = 1;
  state.distanceMeters = 1600;
  game.fireBullet();
  const shot = state.shots[0];
  const before = {
    position: state.position, distanceMeters: state.distanceMeters,
    playerY: state.playerY, playerVY: state.playerVY, jumpsUsed: state.jumpsUsed,
    shotY: shot.y, shotSeg: shot.seg,
  };
  game.disableFlightTerrain();
  assert.equal(state.terrainEnabled, false);
  assert.equal(state.groundHeight, 0);
  for (const key of ['position', 'distanceMeters', 'playerY', 'playerVY', 'jumpsUsed']) {
    assert.equal(state[key], before[key]);
  }
  assert.equal(shot.groundY, 0);
  assert.equal(shot.y, before.shotY);
  assert.equal(shot.seg, before.shotSeg);
  close(game.heightAboveLane(state.position, 1), state.playerY);
  close(game.heightAboveLane(state.position, 2), state.playerY);
});

test('restarting clears elevation and projectiles without reenabling a failed 3D renderer', () => {
  const { game, state, terrain } = createHarness(160, 0);
  state.playerY = 450;
  state.playerVY = 120;
  state.jumpsUsed = 2;
  game.fireMissile();
  game.resetGame();
  assert.equal(state.terrainEnabled, true);
  assert.equal(state.position, 0);
  assert.equal(state.playerY, 0);
  assert.equal(state.playerVY, 0);
  assert.equal(state.jumpsUsed, 0);
  assert.equal(state.shots.length, 0);
  close(state.groundHeight, terrain.heightAt(0, state.movement.lanePosition));
  game.disableFlightTerrain();
  game.resetGame();
  assert.equal(state.terrainEnabled, false);
  assert.equal(state.groundHeight, 0);
});

test('the real tutorial keeps terrain synchronized when practice flight crosses a raised terrace edge', () => {
  const harness = createHarness(191.8, 0);
  const { sandbox, state, game, terrain } = harness;
  const tutorialApi = sandbox.Skyroads.tutorial;
  state.tutorial = tutorialApi.createTutorialState();
  assert.equal(tutorialApi.startTutorial(state.tutorial, null, { force: true }), true);
  const initialPosition = state.position;
  const initialGround = state.groundHeight;
  game.updatePhysics(0.05);
  assert.equal(state.mode, 'PLAYING');
  assert.equal(state.tutorial.active, true);
  assert.ok(state.position > initialPosition);
  assert.ok(state.position >= 192);
  close(state.groundHeight, terrain.heightAt(state.position, state.movement.lanePosition));
  assert.ok(state.groundHeight < initialGround);
  assert.ok(state.playerY > 0);
  assert.equal(state.fuel, game.CONFIG.FUEL_MAX);
});

test('a real 1.5 second J hold releases one visible uphill missile and a short hold releases a bullet', () => {
  for (const releasePosition of [44, 90]) {
    const harness = createHarness(0, 3);
    const { state, game, terrain } = harness;
    const steps = 60;
    const dt = game.CONFIG.CHARGE_TIME / steps;
    // 半隐式积分精确定位松手位置，既执行真实蓄力也覆盖低坡与主坡发射。
    const travel = state.speed * dt * steps + game.CONFIG.ACCEL * dt * dt * steps * (steps + 1) / 2;
    state.position = releasePosition - travel;
    state.groundHeight = terrain.heightAt(state.position, 3);
    harness.key('keydown', 'KeyJ');
    for (let i = 0; i < steps; i += 1) game.updatePhysics(dt);
    close(state.position, releasePosition);
    assert.equal(state.chargeT, game.CONFIG.CHARGE_TIME);
    harness.key('keyup', 'KeyJ');
    assert.equal(state.shots.length, 1);
    assert.equal(state.shots[0].kind, 'missile');
    assert.equal(state.chargeT, 0);
    const missile = state.shots[0];
    assert.equal(state.weaponEvents.at(-1).kind, 'launch');
    for (let i = 0; i < 50; i += 1) game.advanceShots(0.01);
    assert.equal(state.shots.includes(missile), true, `missile disappears at position ${releasePosition}`);
  }
  const short = createHarness(0, 3);
  short.key('keydown', 'KeyJ');
  short.game.updatePhysics(0.1);
  short.key('keyup', 'KeyJ');
  assert.equal(short.state.shots.length, 1);
  assert.equal(short.state.shots[0].kind, 'bullet');
  assert.equal(short.state.weaponEvents.length, 0);
});

test('a grounded missile follows an uphill road to clear its first wall while normal bullets remain level', () => {
  const harness = createHarness(90, 3);
  const { game, state } = harness;
  const target = 103;
  state.track[target].lanes[3] = 'WALL_HIGH';
  game.fireBullet();
  game.fireMissile();
  const [bullet, missile] = state.shots;
  const bulletY = bullet.y;
  const missileY = missile.y;
  advanceTo(harness, missile, target + 1);
  assert.equal(state.shots.includes(missile), false);
  assert.equal(Math.floor(missile.seg), target);
  assert.ok(missile.y > missileY);
  assert.equal(state.track[target].lanes[3], 'ROAD');
  assert.equal(bullet.y, bulletY);
  assert.ok(bullet.seg < target);
  assert.equal(state.weaponEvents.length, 2);
  assert.equal(state.weaponEvents[0].kind, 'launch');
  assert.equal(state.weaponEvents[1].kind, 'impact');
  assert.ok(state.weaponEvents[1].id > state.weaponEvents[0].id);
  close(state.weaponEvents[1].y, missile.y + missile.groundY);
});

test('missile slope guidance cannot pass through the side of a higher terrace', () => {
  const harness = createHarness(160, 1.51);
  const { state, game, terrain } = harness;
  state.track[162].lanes[1] = 'WALL_HIGH';
  game.fireMissile();
  const missile = state.shots[0];
  assert.ok(missile.y + missile.groundY < terrain.heightAt(missile.seg, 1));
  game.advanceShots(0.005);
  assert.equal(state.shots.includes(missile), false);
  assert.equal(state.track[162].lanes[1], 'WALL_HIGH');
  assert.equal(state.weaponEvents.at(-1).kind, 'impact');
});

test('projectiles pass an empty elevated bridge gap and stop at the next real bridge edge', () => {
  const harness = createHarness(174, 1.51);
  const { state, game, terrain } = harness;
  state.track[174].lanes[1] = 'GAP';
  state.track[175].lanes[1] = 'GAP';
  game.fireBullet();
  game.fireMissile();
  const [bullet, missile] = state.shots;
  assert.ok(missile.y + missile.groundY < terrain.heightAt(missile.seg, 1));
  game.advanceShots(0.005);
  assert.equal(state.shots.includes(bullet), true);
  assert.equal(state.shots.includes(missile), true);
  assert.equal(state.weaponEvents.length, 1);
  advanceTo(harness, missile, 177);
  for (const shot of [bullet, missile]) {
    assert.equal(state.shots.includes(shot), false);
    assert.equal(Math.floor(shot.seg), 176);
  }
  assert.equal(state.weaponEvents.at(-1).kind, 'impact');
  assert.equal(Math.floor(state.weaponEvents.at(-1).seg), 176);
});

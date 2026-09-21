'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 直接调用现有物理函数作为判定依据，不在测试中复制敌机插值或碰撞算法。
function createHarness() {
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now() { return 0; } },
    requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of [
    'src/input.js',
    'src/presentation.js',
    'src/world-art.js',
    'src/obstacles.js',
    'src/gap-regions.js',
    'src/flight_renderer.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8')
    .replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${gameSource}
    globalThis.__game = { CONFIG, STATE, enemyLane, updateEnemies, checkCollisions };
    die = (reason) => { globalThis.__death = reason; };
    collectPickup = () => false;
    Math.random = () => 0.25;
  `, sandbox, { filename: 'src/game.js' });
  const { CONFIG: config, STATE: state } = sandbox.__game;
  Object.assign(state, {
    mode: 'PLAYING',
    position: 10,
    fuel: config.FUEL_MAX,
    tutorial: null,
    track: Array.from({ length: 30 }, (_, index) => ({
      index, lanes: Array(config.LANES).fill('ROAD'),
    })),
  });
  return {
    sandbox,
    config,
    state,
    game: sandbox.__game,
    input: sandbox.Skyroads.input,
    obstacles: sandbox.Skyroads.obstacles,
    ...sandbox.Skyroads.flightRenderer,
    collide(from = 3, to = from) {
      sandbox.__death = null;
      sandbox.__game.checkCollisions(from, to);
      return sandbox.__death;
    },
  };
}

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('flight coordinates can load without Three.js, a canvas, or a WebGL context', () => {
  const { sandbox, WORLD, coordinates } = createHarness();
  assert.equal(sandbox.THREE, undefined);
  assert.equal(sandbox.__game.STATE.canvas, null);
  assert.ok(Object.isFrozen(WORLD));
  assert.ok(Object.isFrozen(coordinates));
  close(coordinates.laneX(3), 0);
  close(coordinates.heightY(0), 0);
  assert.ok(WORLD.eyeHeight > 0);
});

test('camera lane coordinates preserve continuous movement and both road edges', () => {
  const { input, config, WORLD, coordinates } = createHarness();
  const { laneX } = coordinates;
  const movement = input.createMovementState(3);
  input.requestDiscreteLaneChange(movement, 1);
  const positions = [laneX(movement.lanePosition, config.LANES)];
  for (const milliseconds of [20, 20, 32.5, 32.5, 40]) {
    input.advanceMovement(movement, milliseconds);
    positions.push(laneX(movement.lanePosition, config.LANES));
  }
  assert.equal(movement.lanePosition, 4);
  close(positions[3], WORLD.laneWidth / 2);
  close(positions.at(-1), WORLD.laneWidth);
  assert.ok(positions.every((value, index) => index === 0 || value > positions[index - 1]));
  close(laneX(0, config.LANES), -laneX(config.LANES - 1, config.LANES));
  close(laneX(0.5, config.LANES) - laneX(0, config.LANES), WORLD.laneWidth / 2);
  close(laneX(2, 5), 0);
});

test('segment front and back edges cross the ship exactly when collision enters and leaves the tile', () => {
  const { state, WORLD, coordinates, collide } = createHarness();
  state.track[11].lanes[3] = 'WALL_LOW';
  state.position = 11 - 1e-6;
  assert.ok(coordinates.segmentZ(11, state.position, 0) < 0);
  assert.equal(collide(), null);

  state.position = 11;
  close(coordinates.segmentZ(11, state.position, 0), 0);
  close(coordinates.segmentZ(11, state.position), -WORLD.segmentDepth / 2);
  close(coordinates.segmentZ(11, state.position, 1), -WORLD.segmentDepth);
  assert.equal(collide(), 'wall');

  state.position = 12 - 1e-6;
  assert.ok(coordinates.segmentZ(11, state.position, 1) < 0);
  assert.equal(collide(), 'wall');
  state.position = 12;
  close(coordinates.segmentZ(11, state.position, 1), 0);
  assert.equal(collide(), null);
  close(coordinates.segmentZ(12, state.position, 0), 0);
});

test('projectile positions retain fractional segments without the tile-center offset', () => {
  const { coordinates, WORLD } = createHarness();
  const shipPosition = 87.73;
  close(coordinates.segmentZ(shipPosition, shipPosition, 0), 0);
  close(coordinates.segmentZ(shipPosition + 0.8, shipPosition, 0), -0.8 * WORLD.segmentDepth);
  const before = coordinates.segmentZ(100, 99.999, 0);
  const after = coordinates.segmentZ(100, 100.001, 0);
  assert.ok(before < 0 && after > 0);
  close(after - before, 0.002 * WORLD.segmentDepth);
});

test('enemy coordinates follow the real rest, warning, movement, and arrival states', () => {
  const { game, state, coordinates } = createHarness();
  const enemy = {
    type: 'drone', lane: 6, fromLane: 6, toLane: 6,
    state: 'rest', restT: 0.01, moveT: 0,
  };
  state.track[10].enemies = [enemy];
  const states = new Set();
  const samples = [];
  for (const step of [0, 0.02, 0.3, 0.31, 0.1, 0.1, 0.2]) {
    game.updateEnemies(step);
    states.add(enemy.state);
    const physicsLane = game.enemyLane(enemy);
    close(coordinates.enemyLane(enemy), physicsLane);
    samples.push(physicsLane);
  }
  assert.deepEqual([...states].sort(), ['move', 'rest', 'warn']);
  assert.ok(samples.some((lane) => lane > 5 && lane < 6));
  assert.equal(enemy.fromLane, 5);
  assert.equal(enemy.lane, 6);
  close(coordinates.enemyLane(enemy), 5);

  for (const fixture of [
    { type: 'turret', lane: 1 },
    { type: 'drone', lane: 2 },
    { type: 'drone', lane: 0, fromLane: 3, toLane: 4, state: 'move', moveT: 1.2 },
  ]) {
    close(coordinates.enemyLane(fixture), game.enemyLane(fixture));
  }
});

test('height scaling preserves real wall collision thresholds and jump clearance tiers', () => {
  const { config, state, obstacles, coordinates, collide } = createHarness();
  const { heightY } = coordinates;
  for (const type of ['WALL_LOW', 'WALL_MEDIUM', 'WALL_HIGH']) {
    const height = obstacles.wallHeight(type);
    state.track[10].lanes[3] = type;
    state.playerY = height;
    close(heightY(state.playerY), heightY(config[`${type}_HEIGHT`]));
    assert.equal(collide(), 'wall');
    state.playerY = height + 0.001;
    assert.ok(heightY(state.playerY) > heightY(height));
    assert.equal(collide(), null);
  }

  const single = heightY(obstacles.jumpApex(1));
  const double = heightY(obstacles.jumpApex(2));
  const triple = heightY(obstacles.jumpApex(3));
  assert.ok(single > heightY(config.WALL_LOW_HEIGHT));
  assert.ok(single < heightY(config.WALL_MEDIUM_HEIGHT));
  assert.ok(double > heightY(config.WALL_MEDIUM_HEIGHT));
  assert.ok(double < heightY(config.WALL_HIGH_HEIGHT));
  assert.ok(triple > heightY(config.WALL_HIGH_HEIGHT));
});

test('gap support uses lane boundaries and the same safe jump altitude in 3D', () => {
  const { state, config, coordinates, collide } = createHarness();
  state.track[10].lanes[4] = 'GAP';
  state.playerY = 0;
  const left = 3.5 - 1e-6;
  const right = 3.5;
  const edgeX = (coordinates.laneX(3) + coordinates.laneX(4)) / 2;
  assert.ok(coordinates.laneX(left) < edgeX);
  close(coordinates.laneX(right), edgeX);
  assert.equal(collide(left), null);
  assert.equal(collide(right), 'gap');
  state.playerY = config.GAP_SAFE_HEIGHT;
  assert.equal(collide(right), null);
  state.playerY -= 0.001;
  assert.ok(coordinates.heightY(state.playerY) < coordinates.heightY(config.GAP_SAFE_HEIGHT));
  assert.equal(collide(right), 'gap');
});

test('world widths preserve wall and enemy hitbox semantics during a swept lane change', () => {
  const { state, input, coordinates, WORLD, collide } = createHarness();
  const { laneX } = coordinates;
  state.track[10].lanes[3] = 'WALL_LOW';
  const touchingLane = 3 + input.HITBOX.wallHalfWidth + input.HITBOX.playerHalfWidth;
  close(laneX(touchingLane) - laneX(3),
    WORLD.laneWidth * (input.HITBOX.wallHalfWidth + input.HITBOX.playerHalfWidth));
  assert.equal(collide(touchingLane - 1e-6), 'wall');
  assert.equal(collide(touchingLane + 1e-6), null);
  assert.equal(collide(2, 4), 'wall');

  state.track[10].lanes[3] = 'ROAD';
  for (const type of ['drone', 'turret']) {
    state.track[10].enemies = [{ type, lane: 3 }];
    const safeLane = 3 + input.hitboxHalfWidthForEnemy(type) + input.HITBOX.playerHalfWidth;
    close(laneX(safeLane) - laneX(3),
      WORLD.laneWidth * (input.hitboxHalfWidthForEnemy(type) + input.HITBOX.playerHalfWidth));
    assert.equal(collide(safeLane - 1e-6), 'enemy');
    assert.equal(collide(safeLane + 1e-6), null);
  }
});

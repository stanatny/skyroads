'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 净空测试使用发布中的真实几何和真实游戏判定，不复制模型或碰撞算法。
function harness() {
  const sandbox = {
    console, performance: { now: () => 0 },
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of [
    'assets/vendor/three_r170.js', 'src/input.js', 'src/presentation.js', 'src/world-art.js',
    'src/obstacles.js', 'src/gap-regions.js', 'src/tutorial.js', 'src/flight_dimensions.js',
    'src/flight_terrain.js', 'src/flight_ship.js', 'src/flight_weapons.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.__game = { STATE, CONFIG, enableFlightTerrain, disableFlightTerrain,
      checkCollisions, fireMissile };
    die = (reason) => { STATE.mode = 'GAMEOVER'; globalThis.__death = reason; };
    syncPropulsionAudio = () => {};
    shotBurstFx = () => {};
    buildingBurstFx = () => {};
  `, sandbox, { filename: 'src/game.js' });
  const { THREE, Skyroads } = sandbox;
  const dimensions = Skyroads.flightDimensions;
  const game = sandbox.__game;
  const state = game.STATE;
  Object.assign(state, {
    mode: 'PLAYING', runId: 'clearance', position: 120, speed: 18, fuel: 100,
    width: 1440, height: 900, playerY: 0, playerVY: 0, reducedMotion: false, tutorial: null,
    movement: Skyroads.input.createMovementState(3),
    track: Array.from({ length: 320 }, (_, index) => ({ index, lanes: Array(7).fill('ROAD'), enemies: [] })),
  });
  game.enableFlightTerrain();
  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const ship = Skyroads.flightShip.create({ THREE, own,
    visualScale: dimensions.modelScale, hoverOffset: dimensions.hoverOffset });
  return { sandbox, THREE, Skyroads, dimensions, game, state, resources, own, ship,
    collide(from, to = from) {
      state.mode = 'PLAYING'; sandbox.__death = null;
      state.movement.lanePosition = to;
      game.checkCollisions(from, to);
      return sandbox.__death;
    },
  };
}

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function solidVertices(h, callback) {
  const point = new h.THREE.Vector3();
  h.ship.group.updateMatrixWorld(true);
  h.ship.group.traverseVisible((object) => {
    if (!object.isMesh || object.material.transparent) return;
    const attribute = object.geometry.getAttribute('position');
    for (let index = 0; index < attribute.count; index += 1) {
      point.fromBufferAttribute(attribute, index).applyMatrix4(object.matrixWorld);
      callback(point, object);
    }
  });
}

test('both forms and the entire transformation stay within the shared lateral hull and one lane', () => {
  const h = harness();
  const { dimensions, ship, state, game } = h;
  const hullHalf = dimensions.playerHalfWidth * dimensions.laneWidth;
  let time = 0;
  let maximumHalf = 0;
  let sampled = 0;
  let intermediateFrames = 0;
  // 根节点仍然拥有真实位置，模型缩放只作用于内部可视节点。
  ship.group.position.set(7, 4, -11);
  for (const superMode of [false, true, false]) {
    state.tripleT = superMode ? 12 : 0;
    for (let frame = 0; frame < 86; frame += 1) {
      time += 1 / 60;
      ship.update(state, game.CONFIG, { time, bank: 0 });
      const blend = ship.getDiagnostics().superBlend;
      if (blend > 0 && blend < 1) intermediateFrames += 1;
      for (const bank of [-0.26, 0, 0.26]) {
        ship.group.rotation.z = bank;
        // 包括跃升俯仰及额外坡面俯仰，避免只检查停在平地的定格模型。
        ship.group.rotation.x = frame % 2 ? 0.23 : -0.21;
        solidVertices(h, (point) => {
          const relativeX = point.x - ship.group.position.x;
          maximumHalf = Math.max(maximumHalf, Math.abs(relativeX));
          sampled += 1;
        });
      }
    }
  }
  assert.ok(intermediateFrames > 40, 'both deployment and retraction must be sampled');
  assert.ok(sampled > 1e6, 'the check must cover actual solid vertices');
  assert.ok(maximumHalf <= hullHalf + 1e-5,
    `solid half width ${maximumHalf} exceeds shared collision half width ${hullHalf}`);
  assert.ok(maximumHalf * 2 < dimensions.laneWidth);
  assert.deepEqual(Array.from(ship.group.scale.toArray()), [1, 1, 1]);
  assert.deepEqual(Array.from(ship.group.position.toArray()), [7, 4, -11]);
});

test('grounded transformation and steering keep solid geometry above its support plane', () => {
  const h = harness();
  const { state, ship, game } = h;
  let time = 0;
  let minimum = Infinity;
  for (const superMode of [false, true, false]) {
    state.tripleT = superMode ? 12 : 0;
    for (let frame = 0; frame < 82; frame += 1) {
      time += 1 / 60;
      ship.update(state, game.CONFIG, { time, bank: frame % 2 ? 0.21 : -0.21 });
      solidVertices(h, (point) => { minimum = Math.min(minimum, point.y); });
    }
  }
  assert.ok(minimum >= -1e-5, `transformation dips ${-minimum} below the road`);
});

test('the 3D wall sweep contacts before the visible wing can enter a neighboring building', () => {
  const h = harness();
  const { state, dimensions, Skyroads } = h;
  const wallLane = 4;
  state.track[120].lanes[wallLane] = 'WALL_HIGH';
  const contact = wallLane - Skyroads.input.HITBOX.wallHalfWidth - dimensions.playerHalfWidth;
  assert.equal(h.collide(contact - 0.0001), null);
  assert.equal(h.collide(contact - 0.01, contact + 0.0001), 'wall');
  state.tripleT = 12;
  assert.equal(h.collide(contact - 0.01, contact + 0.0001), 'wall', 'super form uses the same maximum hull');
});

test('the 3D enemy sweep uses the shared player hull with the actual moving drone core', () => {
  const h = harness();
  for (const type of ['drone', 'turret']) {
    const enemy = type === 'drone'
      ? { type, lane: 6, fromLane: 4, toLane: 4, moveT: 0, state: 'rest' }
      : { type, lane: 4 };
    h.state.track[120].enemies = [enemy];
    const contact = 4 - h.Skyroads.input.hitboxHalfWidthForEnemy(type) - h.dimensions.playerHalfWidth;
    assert.equal(h.collide(contact - 0.0001), null);
    assert.equal(h.collide(contact - 0.01, contact + 0.0001), 'enemy');
  }
});

test('one unobstructed lane between full wall bodies remains traversable in either form', () => {
  const h = harness();
  h.state.track[120].lanes[2] = 'WALL_HIGH';
  h.state.track[120].lanes[4] = 'WALL_HIGH';
  for (const superMode of [false, true]) {
    h.state.tripleT = superMode ? 12 : 0;
    assert.equal(h.collide(3), null);
  }
  assert.ok(h.dimensions.playerHalfWidth + h.Skyroads.input.HITBOX.wallHalfWidth < 1);
});

test('compatibility collision and existing invincible passage keep their original semantics', () => {
  const h = harness();
  h.state.track[120].lanes[4] = 'WALL_HIGH';
  h.game.disableFlightTerrain();
  assert.equal(h.collide(3.4), null, '2D keeps the original narrow collision hull');
  assert.equal(h.collide(3.45), 'wall');
  h.game.enableFlightTerrain();
  h.state.boostT = 2;
  assert.equal(h.collide(3.5), null);
  assert.equal(h.state.track[120].lanes[4], 'WALL_HIGH');
});

test('physical missile birth and visible charge attachments use the same scaled muzzle contract', () => {
  const h = harness();
  const { state, dimensions, game, THREE, ship } = h;
  state.position = 20;
  state.groundHeight = 0;
  state.movement = h.Skyroads.input.createMovementState(3);
  game.fireMissile();
  const shot = state.shots[0];
  near((shot.seg - state.position) * dimensions.segmentDepth, -dimensions.attachments.muzzle[2]);
  near(shot.y * dimensions.heightScale, dimensions.attachments.muzzle[1]);
  const parent = new THREE.Scene();
  parent.add(ship.group);
  ship.update(state, game.CONFIG, { time: 0 });
  const weapons = h.Skyroads.flightWeapons.create({ THREE, parent, own: h.own,
    world: dimensions, config: game.CONFIG });
  state.chargeT = game.CONFIG.CHARGE_TIME;
  weapons.update(state, { dt: 0, time: 0, shipGroup: ship.group });
  for (const [name, attachment] of [
    ['missile_charge_muzzle', dimensions.attachments.muzzle],
    ['missile_charge_capacitor', dimensions.attachments.chargeReactor],
  ]) {
    const expected = ship.group.localToWorld(new THREE.Vector3(...attachment));
    const effect = weapons.group.getObjectByName(name);
    assert.ok(effect.visible);
    near(effect.position.distanceTo(expected), 0);
  }
  weapons.dispose();
});

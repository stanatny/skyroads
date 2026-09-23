'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 测试使用真实 Three.js 几何和变换，不需要 GPU。
function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_objects.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  const resources = new Set();
  const batches = [];
  const models = sandbox.Skyroads.flightObjects.create({
    THREE: sandbox.THREE,
    own(resource) { resources.add(resource); return resource; },
    makeBatch(name, geometry, material, capacity) {
      const batch = { name, geometry, material, capacity, calls: [], add(...args) { this.calls.push(args); } };
      batches.push(batch);
      return batch;
    },
    world: { laneWidth: 3.4, segmentDepth: 4, heightScale: 1 / 300 },
    config: { LANES: 7, RENDER_DISTANCE: 120, DRONE_HEIGHT: 500, TURRET_HEIGHT: 1900, FUEL_BLOCK_HEIGHT: 450 },
  });
  return { ...sandbox, resources, batches, models };
}

function placedBounds(h, role) {
  const bounds = new h.THREE.Box3();
  const transform = new h.THREE.Object3D();
  const point = new h.THREE.Vector3();
  for (const batch of h.batches) {
    if (role && h.models.getDiagnostics().models[batch.name].role !== role) continue;
    const positions = batch.geometry.getAttribute('position');
    for (const [x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] of batch.calls) {
      transform.position.set(x, y, z);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(rx, ry, rz);
      transform.updateMatrix();
      for (let index = 0; index < positions.count; index += 1) {
        point.fromBufferAttribute(positions, index).applyMatrix4(transform.matrix);
        bounds.expandByPoint(point);
      }
    }
  }
  return bounds;
}

function clear(h) {
  for (const batch of h.batches) batch.calls.length = 0;
}

test('moving and warning drones keep one-lane visual clearance and exact jump height', () => {
  const h = harness();
  for (const state of ['idle', 'warn', 'move']) {
    for (const direction of [-1, 1]) {
      clear(h);
      h.models.addEnemy({ type: 'drone', state, fromLane: 3, toLane: 3 + direction }, 0, 0, 2.1);
      const bounds = placedBounds(h);
      assert.ok(bounds.min.x >= -1.428 && bounds.max.x <= 1.428, `${state}: ${bounds.min.x}, ${bounds.max.x}`);
      assert.ok(bounds.min.z >= -2 && bounds.max.z <= 2);
      assert.ok(bounds.min.y > 0 && bounds.max.y <= 500 / 300 + 1e-6);
      assert.ok(Math.abs(bounds.max.y - 500 / 300) < 1e-6, 'Rigid drone top matches jumping clearance');
    }
  }
});

test('drone geometry and all attached lights follow authoritative physical altitude', () => {
  const h = harness();
  const enemy = { type: 'drone', state: 'warn', fromLane: 3, toLane: 4, altitude: 0 };
  h.models.addEnemy(enemy, 0, 0, 0);
  const grounded = h.batches.map((batch) => batch.calls.map((call) => [...call]));
  for (const altitude of [180, 360, 720]) {
    clear(h);
    h.models.addEnemy({ ...enemy, altitude }, 0, 0, 0);
    const bounds = placedBounds(h);
    assert.ok(Math.abs(bounds.max.y - (500 + altitude) / 300) < 1e-6);
    assert.ok(bounds.min.x >= -1.428 && bounds.max.x <= 1.428);
    for (const [index, batch] of h.batches.entries()) {
      assert.equal(batch.calls.length, grounded[index].length);
      for (const [slot, call] of batch.calls.entries()) {
        const expected = [...grounded[index][slot]];
        expected[1] += altitude / 300;
        assert.ok(Math.abs(call[1] - expected[1]) < 1e-10,
          `${batch.name} attachment must rise with the hull`);
        expected[1] = call[1];
        assert.deepEqual(call, expected);
      }
    }
  }
});

test('low and high patrols keep horizontal arrowheads readable at a fixed altitude', () => {
  const h = harness();
  for (const altitude of [0, 720]) {
    for (const state of ['warn', 'move']) {
      for (const direction of [-1, 1]) {
        clear(h);
        const enemy = Object.freeze({ type: 'drone', state, fromLane: 3,
          toLane: 3 + direction, altitude });
        h.models.addEnemy(enemy, 0, 0, 0);
        const emitters = h.batches.find((batch) => batch.name === 'object_hostile_emitters');
        const arrows = emitters.calls.filter((call) => call[9] === 0xf7a73d);
        assert.equal(arrows.length, 2, `${state}: both strokes remain visible without animation`);
        const ends = arrows.map((call) => {
          const transform = new h.THREE.Object3D();
          transform.position.set(...call.slice(0, 3));
          transform.scale.set(...call.slice(3, 6));
          transform.rotation.set(...call.slice(6, 9));
          transform.updateMatrix();
          const tip = new h.THREE.Vector3(direction * 0.5, 0, 0).applyMatrix4(transform.matrix);
          const tail = new h.THREE.Vector3(-direction * 0.5, 0, 0).applyMatrix4(transform.matrix);
          assert.ok(direction * (tip.x - tail.x) > 0.1);
          assert.ok(direction * tip.x > 1, 'The cue stays on the wing facing the target lane');
          return { tip, tail };
        });
        assert.ok(Math.abs(ends[0].tip.y - ends[1].tip.y) < Math.abs(ends[0].tail.y - ends[1].tail.y),
          'Both strokes converge toward the next horizontal lane');
        const bounds = placedBounds(h);
        assert.ok(Math.abs(bounds.max.y - (500 + altitude) / 300) < 1e-6);
        assert.ok(bounds.min.x >= -1.428 && bounds.max.x <= 1.428);
      }
    }
    clear(h);
    h.models.addEnemy({ type: 'drone', state: 'warn', fromLane: 3, toLane: 3, altitude }, 0, 0, 0);
    const emitters = h.batches.find((batch) => batch.name === 'object_hostile_emitters');
    assert.equal(emitters.calls.filter((call) => call[9] === 0xf7a73d).length, 0,
      'A stationary patrol does not show a misleading direction cue');
  }
});

test('swiveling turret keeps one-lane visual clearance and exact jump height', () => {
  const h = harness();
  for (const time of [0, 3.7, 10.9, 21]) {
    clear(h);
    h.models.addEnemy({ type: 'turret', lane: 3 }, 0, 0, time);
    const bounds = placedBounds(h);
    assert.ok(bounds.min.x >= -1.428 && bounds.max.x <= 1.428);
    assert.ok(bounds.min.z >= -2 && bounds.max.z <= 2);
    assert.ok(Math.abs(bounds.min.y) < 1e-6);
    assert.ok(Math.abs(bounds.max.y - 1900 / 300) < 1e-6);
  }
});

test('turret foundation and guns ignore drone-only altitude', () => {
  const h = harness();
  h.models.addEnemy({ type: 'turret', lane: 3 }, 0, 0, 2);
  const grounded = JSON.stringify(h.batches.map((batch) => batch.calls));
  clear(h);
  h.models.addEnemy({ type: 'turret', lane: 3, altitude: 720 }, 0, 0, 2);
  assert.equal(JSON.stringify(h.batches.map((batch) => batch.calls)), grounded);
});

test('turret forward sensor stays in front of its armor face while the head swivels', () => {
  const h = harness();
  for (const time of [0, 3.7, 10.9, 21]) {
    clear(h);
    h.models.addEnemy({ type: 'turret', lane: 3 }, 0, 0, time);
    const head = h.batches.find((batch) => batch.name === 'object_turret_azimuth_head');
    const emitters = h.batches.find((batch) => batch.name === 'object_hostile_emitters');
    const sensor = emitters.calls.reduce((highest, call) => call[1] > highest[1] ? call : highest);
    const mesh = new h.THREE.Mesh(head.geometry, head.material);
    const [x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] = head.calls[0];
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rx, ry, rz);
    mesh.updateMatrixWorld(true);
    const ray = new h.THREE.Raycaster(new h.THREE.Vector3(sensor[0], sensor[1], 10),
      new h.THREE.Vector3(0, 0, -1));
    const intersections = ray.intersectObject(mesh);
    assert.ok(intersections.length, 'The sensor must be mounted on the armored face');
    assert.ok(sensor[2] > intersections[0].point.z, 'Armor must not occlude the forward sensor');
  }
});

test('all pickup poses stay centered in a lane and ground indicators remain grounded', () => {
  const h = harness();
  for (const type of ['FUEL', 'BOOST', 'SLOW', 'TRIPLE', 'MAGNET']) {
    for (const time of [0, 2, 9, 20]) {
      clear(h);
      h.models.addPickup(type, 0, 0, time, 22);
      const bounds = placedBounds(h, 'solid');
      assert.ok(bounds.min.x > -1 && bounds.max.x < 1, `${type} must not suggest neighboring lane contact`);
      assert.ok(bounds.min.z > -1 && bounds.max.z < 1);
      assert.ok(bounds.min.y >= 0 && bounds.max.y < 2.6);
      const ground = h.batches.find((batch) => batch.name === 'object_pickup_floor_marks');
      assert.equal(ground.calls.length, 1);
      assert.equal(ground.calls[0][1], 0.055);
    }
  }
});

test('merged model vertices and surface normals remain finite and normalized', () => {
  const h = harness();
  for (const batch of h.batches) {
    for (const [name, attribute] of Object.entries(batch.geometry.attributes)) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${batch.name}.${name}`);
    }
    const normals = batch.geometry.getAttribute('normal');
    for (let index = 0; index < normals.count; index += 1) {
      const length = Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index));
      assert.ok(Math.abs(length - 1) < 1e-4, `${batch.name} has degenerate normal at ${index}`);
    }
  }
});

test('reduced-motion time produces static instances and does not mutate enemy state', () => {
  const h = harness();
  const enemy = Object.freeze({ type: 'drone', state: 'warn', fromLane: 3, toLane: 4 });
  h.models.addEnemy(enemy, 0, 0, 0);
  h.models.addPickup('FUEL', 0, -4, 0, 31);
  const first = JSON.stringify(h.batches.map((batch) => batch.calls));
  clear(h);
  h.models.addEnemy(enemy, 0, 0, 0);
  h.models.addPickup('FUEL', 0, -4, 0, 31);
  assert.equal(JSON.stringify(h.batches.map((batch) => batch.calls)), first);
});

test('all resources are owned and the fixed batch budget survives repeated placement', () => {
  const h = harness();
  assert.equal(h.models.getDiagnostics().batchCount, 18);
  const initialResources = [...h.resources];
  const initialGeometries = h.batches.map((batch) => batch.geometry);
  for (let index = 0; index < 400; index += 1) {
    h.models.addPickup(['FUEL', 'BOOST', 'SLOW', 'TRIPLE', 'MAGNET'][index % 5], 0, -index * 4, index, index);
    h.models.addEnemy({ type: index % 2 ? 'drone' : 'turret', lane: 3 }, 0, -index * 4, index);
  }
  assert.deepEqual([...h.resources], initialResources);
  assert.deepEqual(h.batches.map((batch) => batch.geometry), initialGeometries);
  for (const batch of h.batches) {
    assert.ok(h.resources.has(batch.geometry), `${batch.name} geometry`);
    assert.ok(h.resources.has(batch.material), `${batch.name} material`);
    assert.ok(batch.calls.length < batch.capacity, `${batch.name} capacity`);
  }
});

test('a full visible fuel window and in-flight magnet pool fit the shared crystal batches', () => {
  const h = harness();
  for (let index = 0; index < 840; index += 1) h.models.addPickup('FUEL', 0, -index * 4, 0, index);
  for (let index = 0; index < 96; index += 1) h.models.addFuel(0, 2, -4, 0, index, 0.8);
  for (const batch of h.batches) assert.ok(batch.calls.length <= batch.capacity, `${batch.name} overflow`);
});


test('reward light columns use soft transparent gradients and stay separate from physical silhouettes', () => {
  const h = harness();
  const colors = new Set();
  for (const type of ['FUEL', 'BOOST', 'SLOW', 'TRIPLE', 'MAGNET']) {
    clear(h);
    h.models.addPickup(type, 0, 0, 4, 12);
    const solidBounds = placedBounds(h, 'solid');
    const lightBounds = placedBounds(h, 'effect');
    assert.ok(solidBounds.max.y < 2.6, 'Physical pickup stays near its original collection height');
    assert.ok(lightBounds.max.y > 10, 'Beacon extends above the reward, independently of its body');
    assert.ok(lightBounds.min.x >= -1 && lightBounds.max.x <= 1);
    const columns = h.batches.find((batch) => batch.name === 'object_pickup_light_columns');
    const ring = h.batches.find((batch) => batch.name === 'object_pickup_floor_marks');
    const sparks = h.batches.find((batch) => batch.name === 'object_pickup_energy_sparks');
    assert.equal(columns.calls.length, 3);
    assert.equal(sparks.calls.length, 7);
    const tint = columns.calls[0][9];
    colors.add(tint);
    assert.equal(ring.calls[0][9], tint);
    assert.ok(sparks.calls.every((call) => call[9] === tint));
    for (const batch of [columns, ring, sparks]) {
      assert.equal(batch.material.transparent, true);
      assert.equal(batch.material.depthWrite, false);
      assert.equal(batch.material.depthTest, true, 'Walls must still occlude beacons');
      assert.equal(batch.material.blending, h.THREE.AdditiveBlending);
      assert.ok(h.resources.has(batch.material.map));
      const pixels = batch.material.map.image.data;
      const alpha = Array.from({ length: pixels.length / 4 }, (_, index) => pixels[index * 4 + 3]);
      assert.ok(alpha.some((value) => value === 0), 'The effect must fade to transparent');
      assert.ok(alpha.some((value) => value > 20 && value < 220), 'The effect requires a continuous soft gradient');
    }
  }
  assert.equal(colors.size, 5, 'Each reward must retain its semantic color');
});

test('magnetic flight reuses only fuel geometry and preserves caller-provided center and scale', () => {
  const h = harness();
  const initialResources = [...h.resources];
  h.models.addFuel(4, 8, -9, 2, 11, 0.40);
  const active = h.batches.filter((batch) => batch.calls.length);
  assert.equal(active.length, 3);
  for (const batch of active) {
    assert.ok(batch.name.startsWith('object_fuel_'));
    assert.equal(h.models.getDiagnostics().models[batch.name].role, 'solid');
    assert.deepEqual(batch.calls[0].slice(0, 6), [4, 8, -9, 0.40, 0.40, 0.40]);
  }
  assert.deepEqual([...h.resources], initialResources);
});

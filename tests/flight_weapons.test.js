'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 使用随游戏发布的真实 Three.js，独立检查几何、池化、世界坐标和生命周期。
function createHarness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_dimensions.js', 'src/flight_weapons.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const { THREE } = sandbox;
  const parent = new THREE.Scene();
  const resources = new Set();
  const weapons = sandbox.Skyroads.flightWeapons.create({
    THREE, parent, own(resource) { resources.add(resource); return resource; },
    world: { laneWidth: 3.4, segmentDepth: 4, heightScale: 1 / 300 },
    config: { LANES: 7, MAX_MISSILE_SHOTS: 4, CHARGE_TIME: 1.5 },
  });
  const shipGroup = new THREE.Group();
  shipGroup.position.set(3.4, 2, 0);
  parent.add(shipGroup);
  const state = { mode: 'PLAYING', runId: 1, position: 20, chargeT: 0,
    reducedMotion: false, shots: [], weaponEvents: [] };
  return { THREE, parent, resources, weapons, shipGroup, state,
    update(dt = 0, time = 0) { weapons.update(state, { dt, time, shipGroup }); } };
}

function missile(seg = 24, lanePosition = 4) {
  return { kind: 'missile', seg, lanePosition, groundY: 600, y: 150, age: 0.2, pitch: 0.06 };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function visualSnapshot(harness) {
  const objects = [];
  harness.weapons.group.traverse((object) => {
    objects.push([object.type, object.visible, ...object.position.toArray(), ...object.quaternion.toArray(),
      ...object.scale.toArray(), object.material?.opacity]);
  });
  const points = harness.weapons.group.getObjectByName('missile_smoke_and_impact_particles');
  return JSON.stringify({ objects, drawRange: points.geometry.drawRange,
    attributes: Object.fromEntries(Object.entries(points.geometry.attributes)
      .map(([key, attribute]) => [key, Array.from(attribute.array)])),
    diagnostics: harness.weapons.getDiagnostics() });
}

test('real missile geometry has a forward nose, deployed rear fins and finite outward normals', () => {
  const harness = createHarness();
  harness.state.shots.push(missile());
  harness.update();
  const craft = harness.weapons.group.children.find((object) => object.name === 'guided_missile' && object.visible);
  assert.ok(craft);
  const solids = craft.children.filter((mesh) => mesh.material.isMeshStandardMaterial);
  assert.ok(solids.length >= 4);
  const { THREE } = harness;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const mesh of solids) {
    mesh.updateMatrix();
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    assert.equal(positions.count, normals.count);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrix);
      assert.ok(point.toArray().every(Number.isFinite));
      bounds.expandByPoint(point);
      point.fromBufferAttribute(normals, index);
      assert.ok(point.toArray().every(Number.isFinite));
      close(point.length(), 1, 1e-5);
    }
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const vertices = geometry.attributes.position;
    const surfaceNormals = geometry.attributes.normal;
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    const normal = new THREE.Vector3(); const average = new THREE.Vector3();
    for (let index = 0; index < vertices.count; index += 3) {
      a.fromBufferAttribute(vertices, index); b.fromBufferAttribute(vertices, index + 1); c.fromBufferAttribute(vertices, index + 2);
      normal.copy(b).sub(a).cross(c.sub(a));
      if (normal.lengthSq() < 1e-12) continue;
      average.fromBufferAttribute(surfaceNormals, index)
        .add(point.fromBufferAttribute(surfaceNormals, index + 1))
        .add(point.fromBufferAttribute(surfaceNormals, index + 2));
      assert.ok(normal.dot(average) > 0, 'triangle winding disagrees with its outward normals');
    }
    if (geometry !== mesh.geometry) geometry.dispose();
  }
  close(bounds.min.z, 0);
  assert.ok(bounds.max.z > 1.7 && bounds.max.z < 1.8);
  close(bounds.min.x, -0.5); close(bounds.max.x, 0.5);
  close(bounds.min.y, -0.5); close(bounds.max.y, 0.5);
});

test('charge and missile models read frozen physical state without modifying it', () => {
  const harness = createHarness();
  harness.state.chargeT = 0.75;
  harness.state.shots.push(missile());
  const before = JSON.stringify(harness.state);
  freeze(harness.state);
  harness.update(1 / 60, 2);
  assert.equal(JSON.stringify(harness.state), before);
  close(harness.weapons.getDiagnostics().chargeRatio, 0.5);
  const craft = harness.weapons.group.children.find((object) => object.name === 'guided_missile' && object.visible);
  close(craft.position.x, 3.4); close(craft.position.y, 2.5); close(craft.position.z, -16);
  close(craft.rotation.x, 0.06);
  const muzzle = harness.weapons.group.getObjectByName('missile_charge_muzzle');
  assert.equal(muzzle.visible, true);
  close(muzzle.position.x, 3.4); close(muzzle.position.y, 2 + 1 / 3); close(muzzle.position.z, -2.69 * 0.43);
});

test('muzzle and reactor charge effects stay hidden during taps and reveal after half a second', () => {
  const h = createHarness();
  const muzzle = h.weapons.group.getObjectByName('missile_charge_muzzle');
  const reactor = h.weapons.group.getObjectByName('missile_charge_capacitor');
  for (const reducedMotion of [false, true]) {
    h.state.reducedMotion = reducedMotion;
    for (const elapsed of [0.001, 0.06, 0.15, 0.499, 0.5, 0.75, 1.5, 0]) {
      h.state.chargeT = elapsed;
      h.update();
      assert.equal(muzzle.visible, elapsed >= 0.5);
      assert.equal(reactor.visible, elapsed >= 0.5);
      close(h.weapons.getDiagnostics().chargeRatio, elapsed / 1.5);
    }
  }
});

test('paused updates preserve missile smoke, charge, particles and bursts without duplicate events', () => {
  const harness = createHarness();
  harness.state.chargeT = 1.5;
  harness.state.shots.push(missile());
  harness.state.weaponEvents.push({ id: 1, kind: 'impact', seg: 28, lanePosition: 3, y: 900, super: true });
  harness.update(0.01, 3);
  assert.ok(harness.weapons.getDiagnostics().particles > 0);
  harness.state.mode = 'PAUSED';
  harness.update(0, 3);
  const before = visualSnapshot(harness);
  for (let frame = 0; frame < 90; frame += 1) harness.update(0.05, 3);
  assert.equal(visualSnapshot(harness), before);
  assert.equal(harness.weapons.getDiagnostics().lastEvent, 1);
});

test('world impact anchors move with the road and a new run clears old particles', () => {
  const harness = createHarness();
  harness.state.weaponEvents.push({ id: 1, kind: 'impact', seg: 28, lanePosition: 5, y: 900 });
  harness.update();
  const bursts = harness.weapons.group.children.filter((object) => object.isMesh && object.visible);
  assert.equal(bursts.length, 2);
  for (const burst of bursts) {
    close(burst.position.x, 6.8); close(burst.position.y, 3); close(burst.position.z, -32);
  }
  harness.state.position += 1;
  harness.update();
  for (const burst of bursts) close(burst.position.z, -28);
  harness.state.runId += 1;
  harness.state.position = 0;
  harness.state.weaponEvents = [];
  harness.update();
  assert.equal(harness.weapons.getDiagnostics().particles, 0);
  assert.equal(harness.weapons.getDiagnostics().bursts, 0);
  assert.equal(harness.weapons.getDiagnostics().lastEvent, 0);
});

test('reduced motion suppresses missile smoke and uses a small nonspreading impact', () => {
  const harness = createHarness();
  harness.state.reducedMotion = true;
  harness.state.chargeT = 1.5;
  harness.state.shots.push(missile());
  harness.update(0.05, 1);
  assert.equal(harness.weapons.getDiagnostics().particles, 0);
  const muzzle = harness.weapons.group.getObjectByName('missile_charge_muzzle');
  const rotation = muzzle.children.map((child) => child.rotation.z);
  harness.state.weaponEvents.push({ id: 1, kind: 'impact', seg: 28, lanePosition: 3, y: 900, super: true });
  harness.update(0.01, 15);
  assert.equal(harness.weapons.getDiagnostics().particles, 6);
  assert.deepEqual(muzzle.children.map((child) => child.rotation.z), rotation);
  const points = harness.weapons.group.getObjectByName('missile_smoke_and_impact_particles');
  const position = Array.from(points.geometry.attributes.position.array.slice(0, 18));
  harness.update(0.05, 20);
  assert.deepEqual(Array.from(points.geometry.attributes.position.array.slice(0, 18)), position);
  for (let frame = 0; frame < 6; frame += 1) harness.update(0.05, 20);
  assert.equal(harness.weapons.getDiagnostics().particles, 0);
  assert.equal(harness.weapons.getDiagnostics().bursts, 0);
});

test('missiles and repeated explosions stay within fixed pools without new owned resources', () => {
  const harness = createHarness();
  const resources = [...harness.resources];
  const childCount = harness.weapons.group.children.length;
  for (let frame = 0; frame < 800; frame += 1) {
    harness.state.position += 0.3;
    harness.state.shots = Array.from({ length: 6 }, (_, index) => missile(harness.state.position + 10 + index, index));
    harness.state.weaponEvents = [{ id: frame + 1, kind: 'impact', seg: harness.state.position + 25,
      lanePosition: frame % 7, y: 600, super: true }];
    harness.update(1 / 60, frame / 60);
    const diagnostics = harness.weapons.getDiagnostics();
    assert.equal(diagnostics.missileCapacity, 4);
    assert.equal(diagnostics.missiles, 4);
    assert.ok(diagnostics.particles <= diagnostics.particleCapacity);
    assert.ok(diagnostics.bursts <= 6);
  }
  assert.deepEqual([...harness.resources], resources);
  assert.equal(harness.weapons.group.children.length, childCount);
  assert.equal(harness.weapons.getDiagnostics().resources, resources.length);
});

test('dispose detaches pooled objects and leaves owned resources for one centralized release', () => {
  const harness = createHarness();
  harness.state.shots.push(missile());
  harness.update(0.01);
  const counts = new Map();
  for (const resource of harness.resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  harness.weapons.dispose();
  harness.weapons.dispose();
  harness.update(0.05);
  assert.equal(harness.weapons.getDiagnostics().disposed, true);
  assert.equal(harness.weapons.group.parent, null);
  assert.equal(harness.weapons.group.children.length, 0);
  assert.ok([...counts.values()].every((count) => count === 0));
  for (const resource of harness.resources) resource.dispose();
  assert.ok([...counts.values()].every((count) => count === 1));
});

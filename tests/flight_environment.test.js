'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_dimensions.js', 'src/flight_terrain.js', 'src/flight_environment.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  }
  const { THREE } = sandbox;
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  scene.add(parent);
  const resources = new Set();
  const environment = sandbox.Skyroads.flightEnvironment.create({ THREE, parent,
    own(resource) { resources.add(resource); return resource; } });
  return { THREE, parent, scene, resources, environment, terrain: sandbox.Skyroads.flightTerrain };
}

function stations(environment) {
  return environment.object.children.filter((object) => object.name.startsWith('orbital_station_'));
}

function visibleSnapshot(environment) {
  return JSON.stringify(environment.getDiagnostics().visibleStations);
}

test('four distinct station meshes follow actual route distance and meet perspective approach speed', () => {
  const h = harness();
  const diag = h.environment.getDiagnostics();
  assert.deepEqual(Array.from(diag.stationVariants, (variant) => variant.name),
    ['transfer_ring', 'shipyard', 'habitat', 'research_dock']);
  assert.equal(new Set(diag.stationVariants.map((variant) => variant.triangles)).size, 4);
  const camera = new h.THREE.PerspectiveCamera(64, 16 / 9, 0.035, 1400);
  camera.position.set(0, 6.4, 10.8);
  camera.lookAt(0, 0.8, -13);
  camera.updateMatrixWorld(true);
  const point = new h.THREE.Vector3(65, 14, 0);
  function projectionAt(position) {
    h.environment.update(position, false, { mode: 'PLAYING', time: position * 90 });
    const active = h.environment.getDiagnostics().visibleStations.find((station) => station.index === 0);
    point.set(65, 14, active.z).project(camera);
    return point.x;
  }
  const farDelta = projectionAt(5) - projectionAt(0);
  const nearDelta = projectionAt(250) - projectionAt(245);
  assert.ok(nearDelta > farDelta * 30, 'Perspective supplies faster screen motion at close range');
  for (let index = 0; index < 9; index += 1) {
    h.environment.update(index * 330 + 170, false);
    const station = h.environment.getDiagnostics().visibleStations[0];
    assert.equal(station.variant, diag.stationVariants[index % 4].name);
    assert.equal(station.index, index);
    assert.equal(station.z, -420);
    assert.equal(station.opacity, 1);
  }
});

test('stations fade in at long range, stay opaque through passage, and wrap only behind the actual camera', () => {
  const h = harness();
  let maximumVisible = 0;
  for (let position = 0; position < 1330; position += 2.5) {
    h.environment.update(position, false);
    const diag = h.environment.getDiagnostics();
    maximumVisible = Math.max(maximumVisible, diag.visibleStations.length);
    for (const station of diag.visibleStations) {
      assert.ok(station.z > -1400 && station.z < 220);
      if (station.z >= -1120) assert.equal(station.opacity, 1);
    }
  }
  assert.equal(maximumVisible, 2);
  h.environment.update(329.999, false);
  const old = stations(h.environment).find((station) => station.name.endsWith('transfer_ring'));
  h.scene.updateMatrixWorld(true);
  const behind = new h.THREE.Box3().setFromObject(old);
  assert.ok(behind.min.z > 10.8 + 100, 'Every outgoing vertex has passed behind the camera');
  const before = h.environment.getDiagnostics().visibleStations.find((station) => station.index === 1);
  h.environment.update(330, false);
  const after = h.environment.getDiagnostics().visibleStations.find((station) => station.index === 1);
  assert.ok(Math.abs(after.z - before.z) < 0.005, 'The next station keeps its world path across the cycle boundary');
  assert.equal(after.opacity, before.opacity);
});

test('every station triangle stays outside the entire elevated flight corridor during passage', () => {
  const h = harness();
  const corridor = new h.THREE.Box3(new h.THREE.Vector3(-24, -25, -150), new h.THREE.Vector3(24, 52, 150));
  const triangle = new h.THREE.Triangle();
  let triangleCount = 0;
  for (const station of stations(h.environment)) for (const mesh of station.children) {
    const vertices = mesh.geometry.getAttribute('position');
    for (let index = 0; index < vertices.count; index += 3) {
      triangle.a.fromBufferAttribute(vertices, index);
      triangle.b.fromBufferAttribute(vertices, index + 1);
      triangle.c.fromBufferAttribute(vertices, index + 2);
      assert.equal(corridor.intersectsTriangle(triangle), false,
        `${mesh.name} triangle ${index / 3} crosses the flight corridor`);
      triangleCount += 1;
    }
    assert.equal(mesh.material.depthTest, true);
    assert.equal(mesh.castShadow, false);
  }
  assert.ok(triangleCount > 20000);
  // 实际追尾相机在各车道、高架及跃升高度都位于已验证的站体净空内。
  const camera = new h.THREE.PerspectiveCamera(64, 16 / 9, 0.035, 1400);
  for (const laneX of [-10.2, 0, 10.2]) for (const height of [6.4, 22, 43]) {
    camera.position.set(laneX, height, 10.8); camera.lookAt(laneX, height - 5.6, -13);
    h.parent.position.copy(camera.position).multiplyScalar(0.06);
    for (let type = 0; type < 4; type += 1) {
      h.environment.update(type * 330 + 277.5, true);
      h.scene.updateMatrixWorld(true);
      const station = stations(h.environment)[type];
      const world = station.getWorldPosition(new h.THREE.Vector3());
      assert.ok(Math.abs(world.x) < 1e-12);
      assert.ok(Math.abs(world.y) < 1e-12);
      assert.ok(Math.abs(world.z - 10) < 1e-12);
      assert.ok(corridor.containsPoint(camera.position), 'The actual camera remains inside the proven open corridor');
    }
  }
});

test('pause, reduced motion, new runs and large route jumps stay deterministic without resource growth', () => {
  const h = harness();
  const count = h.resources.size;
  const options = { mode: 'PLAYING', reducedMotion: false, runId: 1 };
  h.environment.update(150, true, options);
  const before = visibleSnapshot(h.environment);
  options.mode = 'PAUSED'; h.environment.update(180, true, options);
  assert.equal(visibleSnapshot(h.environment), before);
  options.mode = 'PLAYING'; options.reducedMotion = true;
  h.environment.update(210, true, options);
  assert.equal(visibleSnapshot(h.environment), before);
  options.runId = 2; h.environment.update(0, true, options);
  assert.equal(h.environment.getDiagnostics().journeyDistance, 0);
  options.reducedMotion = false;
  for (let frame = 0; frame < 2000; frame += 1) h.environment.update(frame * 91.7, true, options);
  h.environment.update(900, true, options);
  const nineHundred = visibleSnapshot(h.environment);
  h.environment.update(2000, true, options); h.environment.update(900, true, options);
  assert.equal(visibleSnapshot(h.environment), nineHundred);
  assert.equal(h.resources.size, count);
  assert.ok(h.environment.getDiagnostics().drawCalls <= 9);
  assert.equal(stations(h.environment).length, 4);
  assert.deepEqual(options, { mode: 'PLAYING', reducedMotion: false, runId: 2 });
});

test('existing eight service platforms follow the lowest terrain surface over their full span', () => {
  const h = harness();
  const platform = h.environment.object.children.find((object) => object.name === 'orbital_service_platforms_solid');
  assert.equal(platform.count, 8);
  const matrix = new h.THREE.Matrix4();
  const origin = new h.THREE.Vector3();
  const bounds = platform.geometry.boundingBox;
  const halfDepth = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  for (const position of [90, 130, 188, 312, 610]) {
    h.parent.position.set(0.612, 2.4, 0.9);
    h.environment.update(position, true);
    for (let instance = 0; instance < 8; instance += 1) {
      platform.getMatrixAt(instance, matrix);
      origin.setFromMatrixPosition(matrix).add(h.parent.position);
      const lane = origin.x < 0 ? 0 : 6;
      const middle = position - origin.z / 4;
      const low = middle - halfDepth / 4;
      const high = middle + halfDepth / 4;
      let minimum = Math.min(h.terrain.heightAt(low, lane), h.terrain.heightAt(high, lane));
      for (let boundary = Math.ceil(low); boundary < high; boundary += 1) {
        minimum = Math.min(minimum, h.terrain.heightAt(boundary, lane));
      }
      assert.ok(Math.abs(origin.y - (minimum / 300 - 1.5)) < 1e-4);
      assert.ok(Math.abs(Math.abs(origin.x) - 27) < 1e-4);
    }
  }
});

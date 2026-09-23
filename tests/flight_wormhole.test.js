'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 真实 Three.js 校验物理门心、有限资源与暂停语义；浏览器负责着色器和演出验收。
function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_dimensions.js', 'src/flight_ship.js', 'src/wormhole.js', 'src/flight_wormhole.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  const resources = new Set();
  const parent = new sandbox.THREE.Group();
  const fx = sandbox.Skyroads.flightWormhole.create({ THREE: sandbox.THREE, parent,
    own(resource) { resources.add(resource); return resource; },
    world: { laneWidth: 3.4, segmentDepth: 4, heightScale: 1 / 300 }, config: { LANES: 7, DISTANCE_PER_SEGMENT: 10 } });
  const state = { mode: 'PLAYING', position: 400, reducedMotion: false, wormhole: {
    gate: { id: 1, segment: 416, lane: 5, height: 4500, halfWidth: 0.34, halfHeight: 300 },
    active: false, elapsed: 0, eventId: 0, completedT: 0, graceT: 0 } };
  return { sandbox, THREE: sandbox.THREE, resources, parent, fx, state,
    update(time = 3) { return fx.update(state, { time, playerX: 6.8, playerHeight: 15 }); } };
}

function snapshot(h) {
  h.parent.updateMatrixWorld(true);
  const nodes = [];
  h.parent.traverse(node => nodes.push({ name: node.name, visible: node.visible, matrix: [...node.matrixWorld.elements],
    positions: node.geometry?.attributes?.position ? [...node.geometry.attributes.position.array] : null,
    opacity: node.material?.opacity }));
  return JSON.stringify({ nodes, diagnostics: h.fx.getDiagnostics() });
}

test('gate uses gameplay coordinates and a compact aperture with explicit hull allowance', () => {
  const h = harness(); h.update();
  const gate = h.parent.getObjectByName('wormhole_gate');
  assert.equal(gate.visible, true);
  assert.ok(Math.abs(gate.position.x - 6.8) < 1e-9);
  assert.ok(Math.abs(gate.position.y - 15.76) < 1e-9);
  assert.equal(gate.position.z, -64);
  assert.equal(h.fx.getDiagnostics().aperture.rx, 2.65);
  assert.equal(h.fx.getDiagnostics().aperture.ry, 1.65);
  h.state.position = 315; h.update(); assert.equal(gate.visible, false);
  h.state.position = 316; h.update(); assert.equal(gate.visible, true);
  h.state.position = 419; h.update(); assert.equal(gate.visible, false);
  h.state.position = 400; h.state.mode = 'MENU'; h.update(); assert.equal(gate.visible, false);
});

test('warp creates a layered tunnel, preserves state and reveals the new road only after transfer', () => {
  const h = harness();
  h.state.wormhole.active = true;
  h.state.wormhole.eventId = 1;
  h.state.wormhole.elapsed = 1.2;
  const saved = JSON.stringify(h.state);
  const result = h.update();
  assert.equal(JSON.stringify(h.state), saved);
  assert.equal(result.active, true); assert.equal(result.hideScenery, true);
  assert.equal(result.fovOffset, 17);
  assert.equal(h.fx.getDiagnostics().streaks, 420);
  assert.ok(h.parent.getObjectByName('wormhole_tunnel').visible);
  h.state.wormhole.elapsed = 2.399;
  assert.ok(h.update().strength > 0.9, 'The old world stays concealed until the actual teleport');
  h.state.wormhole.active = false; h.state.wormhole.completedT = 2.8;
  assert.equal(h.update().hideScenery, true);
  h.state.wormhole.completedT = 2.4;
  assert.equal(h.update().strength, 0);
  assert.equal(h.update().fovOffset, 0);
});

test('reduced motion keeps a calm transition and disables all moving tunnel layers and FOV stretch', () => {
  const h = harness(); h.state.reducedMotion = true; h.state.wormhole.active = true; h.state.wormhole.elapsed = 1;
  const result = h.update();
  assert.equal(result.fovOffset, 0); assert.equal(result.hideScenery, true);
  assert.equal(h.fx.getDiagnostics().streaks, 0);
  assert.equal(h.parent.getObjectByName('wormhole_speed_streaks').visible, false);
  assert.equal(h.parent.getObjectByName('wormhole_helical_ribbons').visible, false);
  const rings = h.parent.getObjectByName('wormhole_tunnel_rings');
  assert.equal(rings.visible, true);
  assert.equal(rings.children.filter(ring => ring.visible).length, 5);
  assert.ok(rings.children.every(ring => ring.material.opacity <= 0.18));
  const pose = () => rings.children.map(ring => ({ visible: ring.visible,
    position: [...ring.position.toArray()], rotation: [...ring.quaternion.toArray()],
    scale: [...ring.scale.toArray()], opacity: ring.material.opacity }));
  const frozen = pose();
  h.state.wormhole.elapsed = 1.8;
  h.update(6);
  assert.deepEqual(pose(), frozen, 'Reduced motion retains static depth cues throughout transit');
  h.state.reducedMotion = false;
  h.update(7);
  assert.equal(rings.children.filter(ring => ring.visible).length, 30);
  assert.notDeepEqual(pose(), frozen);
});

test('paused time is deterministic; leaving a run clears the entire effect', () => {
  const h = harness(); h.state.wormhole.active = true; h.state.wormhole.elapsed = 1.3;
  h.state.mode = 'PAUSED'; h.update(); const first = snapshot(h);
  h.update(40); assert.equal(snapshot(h), first);
  h.state.mode = 'MENU'; h.update();
  assert.equal(h.fx.getDiagnostics().strength, 0);
  assert.equal(h.parent.getObjectByName('flight_wormhole').visible, false);
  h.state.mode = 'PLAYING'; delete h.state.wormhole; h.update();
  assert.equal(h.fx.getDiagnostics().strength, 0);
});

test('hundreds of entry and exit cycles reuse the same geometry and buffers; dispose releases the group', () => {
  const h = harness(); const original = [...h.resources];
  const lines = h.parent.getObjectByName('wormhole_speed_streaks');
  const positions = lines.geometry.attributes.position.array;
  for (let frame = 0; frame < 700; frame += 1) {
    h.state.wormhole.active = frame % 100 < 85;
    h.state.wormhole.elapsed = (frame % 85) / 85 * 2.4;
    h.state.wormhole.completedT = h.state.wormhole.active ? 0 : 2.8 - (frame % 15) / 30;
    h.update(frame / 60);
  }
  assert.deepEqual([...h.resources], original);
  assert.equal(lines.geometry.attributes.position.array, positions);
  h.parent.traverse(node => {
    if (!node.geometry) return;
    assert.ok(h.resources.has(node.geometry)); assert.ok(h.resources.has(node.material));
    assert.equal(node.material.fog, false);
    for (const attribute of Object.values(node.geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
  });
  h.fx.dispose(); h.fx.dispose(); assert.equal(h.parent.children.length, 0);
  assert.equal(h.update().strength, 0);
});


test('both real airframes fit the unchanged visible aperture at every original entry edge, including bank and jump pitch', () => {
  const h = harness();
  const dimensions = h.sandbox.Skyroads.flightDimensions;
  const ship = h.sandbox.Skyroads.flightShip.create({ THREE: h.THREE,
    own: resource => resource, visualScale: dimensions.modelScale, hoverOffset: dimensions.hoverOffset });
  const aperture = h.fx.getDiagnostics().aperture;
  const point = new h.THREE.Vector3();
  let maximum = 0;
  // 原入口椭圆完整容纳刚性机身；额外捕获容错允许翼尖擦过光环，不因此放大门体。
  for (const superForm of [0, 1]) {
    for (const bank of [-0.21, 0, 0.21]) {
      for (const playerVY of [-5000, 0, 7500]) {
        ship.update({ runId: `${superForm}:${bank}:${playerVY}`, mode: 'PLAYING', tripleT: superForm,
          speed: 18, boostT: 0, fuelBurstT: 0, playerVY, reducedMotion: false }, { MAX_SPEED: 24 }, { time: 1, bank });
        ship.group.updateMatrixWorld(true);
        ship.group.traverseVisible(node => {
          if (!node.isMesh || node.material.transparent) return;
          const vertices = node.geometry.attributes.position;
          for (let vertex = 0; vertex < vertices.count; vertex += 1) {
            point.fromBufferAttribute(vertices, vertex).applyMatrix4(node.matrixWorld);
            for (let step = 0; step < 90; step += 1) {
              const angle = step * Math.PI * 2 / 90;
              const x = point.x + Math.cos(angle) * h.sandbox.Skyroads.wormhole.TUNING.halfWidth * dimensions.laneWidth;
              const y = point.y - aperture.centerOffsetY + Math.sin(angle) * h.sandbox.Skyroads.wormhole.TUNING.halfHeight * dimensions.heightScale;
              maximum = Math.max(maximum, (x / aperture.rx) ** 2 + (y / aperture.ry) ** 2);
            }
          }
        });
      }
    }
  }
  assert.ok(maximum < (1 - 0.018) ** 2, `Rigid hull crosses the luminous mouth inner edge: ${maximum}`);
});

test('the gate has a deep lens and pooled orbit fragments while keeping the same physical-sized aperture', () => {
  const h = harness(); h.update(4);
  const core = h.parent.getObjectByName('wormhole_dark_core');
  const mouth = h.parent.getObjectByName('wormhole_lens_mouth');
  const well = h.parent.getObjectByName('wormhole_gravity_well');
  const fragments = h.parent.getObjectByName('wormhole_orbit_fragments');
  assert.ok(core.position.z < -1);
  assert.ok(well.position.z < mouth.position.z);
  assert.equal(fragments.count, 12);
  assert.ok([...fragments.instanceMatrix.array].every(Number.isFinite));
  const buffer = fragments.instanceMatrix;
  h.update(5); assert.equal(fragments.instanceMatrix, buffer);
  h.state.reducedMotion = true; h.update(6);
  const pose = [...fragments.instanceMatrix.array]; h.update(7);
  assert.deepEqual([...fragments.instanceMatrix.array], pose);
});

test('capture envelopes the craft and pulls forward before pooled near light bands ignite; reduced motion stays quiet', () => {
  const h = harness(); h.state.wormhole.active = true; h.state.wormhole.elapsed = 0.14;
  const capture = h.update();
  assert.ok(capture.shipOffsetZ < 0);
  assert.equal(h.parent.getObjectByName('wormhole_capture_envelope').visible, true);
  assert.equal(h.parent.getObjectByName('wormhole_capture_tethers').visible, true);
  h.state.wormhole.elapsed = 1.2; h.update();
  const bands = h.parent.getObjectByName('wormhole_near_light_bands');
  assert.equal(bands.count, 36); assert.equal(bands.visible, true);
  assert.ok([...bands.instanceMatrix.array].every(Number.isFinite));
  h.state.reducedMotion = true;
  assert.equal(h.update().shipOffsetZ, 0);
  assert.equal(bands.visible, false);
  assert.equal(h.parent.getObjectByName('wormhole_capture_envelope').visible, false);
  assert.equal(h.parent.getObjectByName('wormhole_capture_tethers').visible, false);
  h.state.wormhole.active = false; h.state.wormhole.completedT = 0;
  assert.equal(h.update().shipOffsetZ, 0);
});

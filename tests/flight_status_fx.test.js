'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 使用随包发布的真实 Three.js，校验特效坐标、状态生命周期及 GPU 资源复用。
function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_dimensions.js', 'src/flight_ship.js', 'src/flight_status_fx.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const { THREE } = sandbox;
  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const effect = sandbox.Skyroads.flightStatusFx.create({ THREE, own });
  const scene = new THREE.Scene();
  scene.add(effect.group);
  const shipGroup = new THREE.Group();
  shipGroup.position.set(3.4, 2.5, -0.8);
  scene.add(shipGroup);
  const state = { mode: 'PLAYING', runId: 1, boostT: 0, fuelBurstT: 0, fuelBurstGraceT: 0, reducedMotion: false };
  const config = { BOOST_DURATION: 5, FUEL_BURST_DURATION: 3, FUEL_BURST_GRACE: 1 };
  return { sandbox, THREE, own, resources, effect, scene, shipGroup, state, config,
    update(dt = 1 / 60) { effect.update(state, config, { dt, shipGroup }); },
    protection() { return sandbox.Skyroads.flightStatusFx.protection(state, config); },
    diagnostics() { return effect.getDiagnostics(); } };
}

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function snapshot(effect) {
  const objects = [];
  effect.group.traverse((object) => objects.push({ name: object.name, visible: object.visible,
    position: object.position.toArray(), rotation: object.quaternion.toArray(), scale: object.scale.toArray(),
    opacity: object.material?.opacity, uniforms: object.material?.uniforms,
    count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array) : null }));
  return JSON.stringify({ objects, diagnostics: effect.getDiagnostics() });
}

test('crash triggers once, survives a hidden ship, stays at the world impact position and expires', () => {
  const h = harness();
  const parent = new h.THREE.Group();
  parent.position.set(10, 0.5, 2);
  parent.rotation.y = 0.2;
  h.scene.add(parent);
  parent.add(h.shipGroup);
  h.update();
  h.shipGroup.updateWorldMatrix(true, false);
  const expected = h.shipGroup.localToWorld(new h.THREE.Vector3(0, 0.60, 0.08));
  h.state.mode = 'GAMEOVER';
  h.shipGroup.visible = false;
  h.update();
  assert.equal(h.diagnostics().explosion.active, true);
  assert.equal(h.diagnostics().explosion.triggerCount, 1);
  assert.equal(h.diagnostics().explosion.age, 0);
  h.diagnostics().explosion.position.forEach((coordinate, index) => close(coordinate, expected.toArray()[index]));
  assert.equal(h.effect.group.getObjectByName('ship_destruction').visible, true);
  assert.equal(h.effect.group.getObjectByName('ship_destruction_glow').material.depthTest, false);
  h.shipGroup.position.x += 50;
  h.update(0.05);
  assert.ok(h.diagnostics().explosion.particles > 0);
  h.diagnostics().explosion.position.forEach((coordinate, index) => close(coordinate, expected.toArray()[index]));
  for (let frame = 0; frame < 100; frame += 1) h.update(0.05);
  assert.equal(h.diagnostics().explosion.active, false);
  assert.equal(h.diagnostics().explosion.particles, 0);
  assert.equal(h.diagnostics().explosion.triggerCount, 1);
});

test('first-frame game over works; a new run and menu remove debris without a phantom explosion', () => {
  const h = harness();
  h.state.mode = 'GAMEOVER';
  h.update();
  assert.equal(h.diagnostics().explosion.triggerCount, 1);
  h.state.runId += 1;
  h.state.mode = 'PLAYING';
  h.update();
  assert.equal(h.diagnostics().explosion.active, false);
  assert.equal(h.diagnostics().explosion.particles, 0);
  h.state.mode = 'GAMEOVER';
  h.update();
  assert.equal(h.diagnostics().explosion.triggerCount, 2);
  h.state.mode = 'MENU';
  h.state.fuelBurstGraceT = 0.8;
  h.update();
  assert.equal(h.diagnostics().explosion.active, false);
  assert.equal(h.diagnostics().shield.active, false);
  for (let frame = 0; frame < 20; frame += 1) h.update(0.05);
  assert.equal(h.diagnostics().explosion.triggerCount, 2);
});

test('BOOST shield starts immediately and remains legible until its exact expiry', () => {
  const h = harness();
  for (const remaining of [5, 3, 1, 0.0001]) {
    h.state.boostT = remaining;
    h.update();
    assert.equal(h.protection().active, true);
    assert.equal(h.protection().duration, 5);
    close(h.diagnostics().shield.remaining, remaining);
    assert.equal(h.diagnostics().shield.active, true);
    assert.ok(h.diagnostics().shield.opacity >= 0.38);
  }
  h.state.boostT = 0;
  h.update();
  assert.equal(h.diagnostics().shield.active, false);
  assert.equal(h.diagnostics().shield.opacity, 0);
  assert.equal(h.protection().duration, 0);
});

test('fuel burst and its grace period have one uninterrupted shield and countdown', () => {
  const h = harness();
  h.state.fuelBurstT = 3;
  h.update();
  assert.equal(h.diagnostics().shield.active, true);
  close(h.diagnostics().shield.remaining, 4);
  assert.equal(h.protection().duration, 4);
  const fullOpacity = h.diagnostics().shield.opacity;
  h.state.fuelBurstT = 0.0001;
  h.update();
  close(h.diagnostics().shield.remaining, 1.0001);
  assert.equal(h.diagnostics().shield.opacity, fullOpacity);
  h.state.fuelBurstT = 0;
  h.state.fuelBurstGraceT = 1;
  h.update();
  assert.equal(h.diagnostics().shield.active, true);
  close(h.diagnostics().shield.remaining, 1);
  assert.equal(h.protection().duration, 4);
  assert.equal(h.diagnostics().shield.opacity, fullOpacity);
  h.state.fuelBurstGraceT = 0.0001;
  h.update();
  assert.equal(h.diagnostics().shield.active, true);
  assert.ok(h.diagnostics().shield.opacity >= 0.38);
  assert.ok(h.diagnostics().shield.opacity < fullOpacity);
  h.state.fuelBurstGraceT = 0;
  h.update();
  assert.equal(h.diagnostics().shield.active, false);
  assert.equal(h.diagnostics().shield.opacity, 0);
  h.state.fuelBurstGraceT = 0.8;
  h.state.mode = 'GAMEOVER';
  h.update();
  assert.equal(h.diagnostics().shield.active, false);
});

test('overlapping protection sources keep the shield until the last source expires', () => {
  const h = harness();
  // 先让 BOOST 覆盖燃料爆发，再让更长的爆发保护接管；倒计时只呈现仍然有效的保护。
  for (const [boostT, fuelBurstT, fuelBurstGraceT, remaining, duration] of [
    [5, 3, 0, 5, 5],
    [0.7, 1, 0, 2, 4],
    [0, 0, 1, 1, 4],
    [0.8, 0, 0.2, 0.8, 5],
    [0.1, 0, 0, 0.1, 5],
  ]) {
    Object.assign(h.state, { boostT, fuelBurstT, fuelBurstGraceT });
    h.update();
    assert.equal(h.protection().active, true);
    assert.equal(h.protection().duration, duration);
    assert.equal(h.diagnostics().shield.active, true);
    close(h.diagnostics().shield.remaining, remaining);
  }
  h.state.boostT = 0;
  h.update();
  assert.equal(h.protection().active, false);
  assert.equal(h.diagnostics().shield.active, false);
});

test('transformation and charging alone never claim invulnerability; inactive modes suppress stale clocks', () => {
  const h = harness();
  Object.assign(h.state, { tripleT: 10, charging: true, chargeT: 1.5, fuelBurstChargeT: 1 });
  h.update();
  assert.equal(h.protection().active, false);
  assert.equal(h.protection().remaining, 0);
  assert.equal(h.protection().duration, 0);
  assert.equal(h.diagnostics().shield.active, false);
  Object.assign(h.state, { boostT: 5, fuelBurstT: 3, fuelBurstGraceT: 1 });
  for (const mode of ['MENU', 'GAMEOVER']) {
    h.state.mode = mode;
    h.update();
    assert.equal(h.protection().active, false);
    assert.equal(h.protection().remaining, 0);
    assert.equal(h.diagnostics().shield.active, false);
  }
});

test('paused shield and explosion freeze; updates leave frozen physical state untouched', () => {
  const h = harness();
  h.state.boostT = 4;
  h.state.fuelBurstT = 2;
  h.update();
  h.state.mode = 'PAUSED';
  h.update();
  const paused = snapshot(h.effect);
  for (let frame = 0; frame < 120; frame += 1) h.update(0.05);
  assert.equal(snapshot(h.effect), paused);
  h.state.mode = 'GAMEOVER';
  h.update();
  h.update(0.05);
  h.state.mode = 'PAUSED';
  h.update();
  const pausedExplosion = snapshot(h.effect);
  for (let frame = 0; frame < 120; frame += 1) h.update(0.05);
  assert.equal(snapshot(h.effect), pausedExplosion);
  const before = JSON.stringify(h.state);
  Object.freeze(h.state);
  h.update(0.05);
  assert.equal(JSON.stringify(h.state), before);
});

test('reduced motion keeps a static readable shield and a fading glow without spreading debris', () => {
  const h = harness();
  h.state.reducedMotion = true;
  h.state.boostT = 5;
  h.update();
  const shield = h.effect.group.getObjectByName('ship_grace_shield');
  const before = shield.children.map((object) => [...object.quaternion.toArray(), ...object.scale.toArray()]);
  for (let frame = 0; frame < 20; frame += 1) h.update(0.05);
  assert.deepEqual(shield.children.map((object) => [...object.quaternion.toArray(), ...object.scale.toArray()]), before);
  // 减少动态只影响动画，不能让加速或缓冲保护期间的壳体消失。
  for (const [boostT, fuelBurstT, fuelBurstGraceT] of [[0, 3, 0], [0, 0, 0.8]]) {
    Object.assign(h.state, { boostT, fuelBurstT, fuelBurstGraceT });
    h.update(0.05);
    assert.equal(h.diagnostics().shield.active, true);
    assert.deepEqual(shield.children.map((object) => [...object.quaternion.toArray(), ...object.scale.toArray()]), before);
  }
  h.state.mode = 'GAMEOVER';
  h.update();
  const glow = h.effect.group.getObjectByName('ship_destruction_glow');
  const glowScale = glow.scale.toArray();
  const glowPosition = glow.position.toArray();
  const glowOpacity = glow.material.opacity;
  assert.equal(h.diagnostics().explosion.active, true);
  h.update(0.05);
  assert.equal(h.diagnostics().explosion.particles, 0);
  assert.equal(h.effect.group.getObjectByName('ship_destruction_armor').count, 0);
  assert.equal(h.effect.group.getObjectByName('ship_destruction_shock').visible, false);
  assert.deepEqual(glow.scale.toArray(), glowScale);
  assert.deepEqual(glow.position.toArray(), glowPosition);
  assert.ok(glow.material.opacity < glowOpacity);
  for (let frame = 0; frame < 20; frame += 1) h.update(0.05);
  assert.equal(h.diagnostics().explosion.active, false);
});

test('repeated crashes and shields reuse fixed resources and register every owned mesh resource', () => {
  const h = harness();
  const resources = [...h.resources];
  let objectCount = 0;
  h.effect.group.traverse((object) => {
    objectCount += 1;
    if (!object.isSprite && object.geometry) assert.ok(h.resources.has(object.geometry));
    if (object.material) assert.ok(h.resources.has(object.material));
    if (object.material?.map) assert.ok(h.resources.has(object.material.map));
    if (object.isInstancedMesh) assert.ok(h.resources.has(object));
  });
  for (let run = 0; run < 100; run += 1) {
    h.state.runId += 1;
    h.state.mode = 'PLAYING';
    h.state.fuelBurstGraceT = 1;
    h.update();
    h.state.mode = 'GAMEOVER';
    for (let frame = 0; frame < 35; frame += 1) h.update(0.05);
  }
  assert.deepEqual([...h.resources], resources);
  let afterCount = 0;
  h.effect.group.traverse(() => { afterCount += 1; });
  assert.equal(afterCount, objectCount);
  assert.equal(h.diagnostics().resources, resources.length);
  assert.equal(h.diagnostics().explosion.triggerCount, 100);
  const disposals = new Map(resources.map((resource) => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  for (const resource of resources) resource.dispose();
  assert.ok([...disposals.values()].every((count) => count === 1));
});

test('shield follows the banked ship and contains the normal and expanded solid airframe', () => {
  const h = harness();
  const dimensions = h.sandbox.Skyroads.flightDimensions;
  const ship = h.sandbox.Skyroads.flightShip.create({ THREE: h.THREE, own: h.own,
    visualScale: dimensions.modelScale, hoverOffset: dimensions.hoverOffset });
  h.shipGroup.add(ship.group);
  h.shipGroup.rotation.set(0.1, 0.12, -0.2);
  h.state.fuelBurstGraceT = 1;
  const point = new h.THREE.Vector3();
  const inverse = new h.THREE.Matrix4();
  for (const isSuper of [false, true]) {
    ship.update({ mode: 'PLAYING', runId: isSuper ? 2 : 1, reducedMotion: true,
      tripleT: isSuper ? 10 : 0, fuel: 100, fuelBurstT: 0, playerVY: 0 }, {}, { time: 0, bank: 0 });
    h.update();
    h.scene.updateMatrixWorld(true);
    const shell = h.effect.group.getObjectByName('ship_grace_shield_shell');
    inverse.copy(shell.matrixWorld).invert();
    let outside = 0;
    ship.group.traverse((object) => {
      if (!object.isMesh || !object.material.isMeshStandardMaterial) return;
      let ancestor = object;
      while (ancestor) { if (!ancestor.visible) return; ancestor = ancestor.parent; }
      const positions = object.geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        outside = Math.max(outside, point.length());
      }
    });
    assert.ok(outside <= 1.02, `airframe extends outside shield: ${outside}`);
  }
});

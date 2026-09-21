'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_sky_hero_fx.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  const resources = new Set();
  const parent = new sandbox.THREE.Group();
  const fx = sandbox.Skyroads.flightSkyHeroFx.create({ THREE: sandbox.THREE, parent,
    own(resource) { resources.add(resource); return resource; } });
  const group = parent.getObjectByName('sky_hero_acceleration_fx');
  const pose = { phase: 0.4, time: 21.4, position: new sandbox.THREE.Vector3(0, 0, 0),
    quaternion: new sandbox.THREE.Quaternion(), scale: 1 };
  return { THREE: sandbox.THREE, resources, parent, group, fx, pose };
}

function snapshot(h) {
  const values = [];
  h.group.updateMatrixWorld(true);
  h.group.traverse((node) => {
    values.push({ name: node.name, matrix: [...node.matrixWorld.elements], visible: node.visible,
      instances: node.instanceMatrix ? [...node.instanceMatrix.array] : null,
      opacity: node.material ? node.material.opacity : null,
      strength: node.material?.uniforms?.strength?.value,
      time: node.material?.uniforms?.flightTime?.value });
  });
  return values;
}

test('sky hero acceleration owns all resources and uses transparent unlit effects', () => {
  const h = harness();
  assert.equal(h.group.visible, false);
  let meshes = 0;
  h.group.traverse((node) => {
    assert.ok(!node.isLight, 'Background effects must not relight gameplay');
    if (!node.isMesh) return;
    meshes += 1;
    assert.ok(h.resources.has(node.geometry));
    assert.ok(h.resources.has(node.material));
    assert.equal(node.castShadow, false);
    assert.equal(node.material.transparent, true);
    assert.equal(node.material.depthWrite, false);
    assert.equal(node.material.depthTest, true);
    assert.equal(node.material.fog, false);
    assert.equal(node.material.blending, h.THREE.AdditiveBlending);
    for (const attribute of Object.values(node.geometry.attributes)) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite));
    }
  });
  assert.equal(meshes, 8);
});

test('streams and sonic rings stay behind the figure inside the documented local envelope', () => {
  const h = harness();
  const bounds = new h.THREE.Box3();
  const point = new h.THREE.Vector3();
  const instance = new h.THREE.Matrix4();
  for (const phase of [0.02, 0.13, 0.35, 0.58, 0.80, 0.96]) {
    h.fx.update({ ...h.pose, phase, time: 18 + phase * 8.5 });
    h.group.updateMatrixWorld(true);
    bounds.makeEmpty();
    h.group.traverse((node) => {
      if (!node.isMesh) return;
      const positions = node.geometry.getAttribute('position');
      for (let repetition = 0; repetition < (node.isInstancedMesh ? node.count : 1); repetition += 1) {
        if (node.isInstancedMesh) node.getMatrixAt(repetition, instance);
        else instance.identity();
        for (let index = 0; index < positions.count; index += 1) {
          point.fromBufferAttribute(positions, index).applyMatrix4(instance).applyMatrix4(node.matrixWorld);
          bounds.expandByPoint(point);
        }
      }
    });
    assert.ok(bounds.max.x < -1.6, `The leading body is unobstructed: ${bounds.max.x}`);
    assert.ok(bounds.min.x > -17);
    assert.ok(bounds.min.y >= -2 && bounds.max.y <= 2);
    assert.ok(bounds.min.z >= -2 && bounds.max.z <= 2);
  }
});

test('provided direction rotates all FX with the hero without mutating its pose', () => {
  const h = harness();
  const forward = new h.THREE.Vector3(-0.2, 0.1, -1).normalize();
  h.pose.position.set(13, 45, -170);
  h.pose.quaternion.setFromUnitVectors(new h.THREE.Vector3(1, 0, 0), forward);
  h.pose.scale = 3.5;
  const originalPosition = h.pose.position.toArray();
  const originalRotation = h.pose.quaternion.toArray();
  h.fx.update(h.pose);
  assert.deepEqual(h.group.position.toArray(), originalPosition);
  assert.deepEqual(h.group.quaternion.toArray(), originalRotation);
  assert.deepEqual([...h.group.scale.toArray()], [3.5, 3.5, 3.5]);
  assert.deepEqual(h.pose.position.toArray(), originalPosition);
  assert.deepEqual(h.pose.quaternion.toArray(), originalRotation);
  const tailDirection = new h.THREE.Vector3(-1, 0, 0).applyQuaternion(h.group.quaternion);
  assert.ok(tailDirection.dot(forward) < -0.999999);
});

test('absolute clocks make pause and replay deterministic and hide clears every visible layer', () => {
  const h = harness();
  h.fx.update(h.pose);
  const first = snapshot(h);
  h.fx.update(h.pose);
  assert.deepEqual(snapshot(h), first);
  h.fx.update({ ...h.pose, phase: 0.6, time: 23.1 });
  assert.notDeepEqual(snapshot(h), first);
  h.fx.update(h.pose);
  assert.deepEqual(snapshot(h), first);
  h.fx.hide();
  assert.equal(h.group.visible, false);
  assert.equal(h.fx.getDiagnostics().strength, 0);
  assert.equal(h.fx.getDiagnostics().sparks, 0);
  h.fx.update(h.pose);
  assert.deepEqual(snapshot(h), first);
  for (const phase of [0, 1, -0.1, 1.1, NaN]) {
    h.fx.update({ ...h.pose, phase });
    assert.equal(h.group.visible, false);
    assert.equal(h.fx.getDiagnostics().sparks, 0);
  }
});

test('repeated passes keep meshes, geometry, material, and instance storage stable', () => {
  const h = harness();
  const owned = [...h.resources];
  const nodes = [...h.group.children];
  const sparks = h.group.getObjectByName('sky_hero_backwash_sparks');
  const matrix = sparks.instanceMatrix;
  const color = sparks.instanceColor;
  for (let frame = 0; frame < 900; frame += 1) {
    h.fx.update({ ...h.pose, phase: frame % 255 / 255, time: frame / 30 });
  }
  assert.deepEqual([...h.resources], owned);
  assert.deepEqual([...h.group.children], nodes);
  assert.equal(sparks.instanceMatrix, matrix);
  assert.equal(sparks.instanceColor, color);
  assert.ok(Array.from(matrix.array).every(Number.isFinite));
});

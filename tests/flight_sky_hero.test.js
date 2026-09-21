'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHero() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_sky_hero.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  const resources = new Set();
  const hero = sandbox.Skyroads.flightSkyHero.create({ THREE: sandbox.THREE,
    own(resource) { resources.add(resource); return resource; } });
  return { ...sandbox, hero, resources };
}

test('sky hero is a horizontal local model with finite geometry and owned render resources', () => {
  const { hero, THREE, resources } = createHero();
  const bounds = new THREE.Box3();
  hero.group.updateMatrixWorld(true);
  hero.group.traverse((object) => {
    if (!object.isMesh) return;
    assert.ok(resources.has(object.geometry));
    assert.ok(resources.has(object.material));
    assert.equal(object.material.fog, false, 'sky characters must stay readable beyond the track fog');
    for (const attribute of Object.values(object.geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite), `${object.name} contains a nonfinite attribute`);
    }
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 3.9 && size.x < 4.5, `unexpected flight length ${size.x}`);
  assert.ok(size.y > 0.8 && size.y < 1.3, `unexpected flight height ${size.y}`);
  assert.ok(size.x / size.y > 3, 'the hero must fly horizontally instead of standing upright');
  const diagnostic = hero.getDiagnostics();
  assert.equal(diagnostic.direction, '+X');
  assert.equal(diagnostic.emblemFacing, '+Z');
  assert.ok(diagnostic.meshes <= 10, 'static anatomy must be batched by material');
});

test('cape animation is deterministic, leaves its shoulder anchors fixed and never changes the root pose', () => {
  const { hero } = createHero();
  hero.group.position.set(12, 23, -180);
  hero.group.rotation.set(0.05, 0.35, 0.1);
  hero.group.scale.setScalar(3);
  hero.group.visible = false;
  const root = () => ({ position: [...hero.group.position.toArray()], rotation: [...hero.group.rotation.toArray()],
    scale: [...hero.group.scale.toArray()], visible: hero.group.visible });
  const pose = root();
  const cape = hero.group.getObjectByName('sky_hero_flowing_cape');
  hero.update(0);
  const atZero = [...cape.geometry.attributes.position.array];
  const anchor = atZero.slice(0, 11 * 3);
  hero.update(2);
  const atTwo = [...cape.geometry.attributes.position.array];
  assert.notDeepEqual(atTwo, atZero, 'the trailing cloth should visibly move with time');
  assert.deepEqual(atTwo.slice(0, 11 * 3), anchor, 'cape anchors must stay attached to the shoulders');
  hero.update(2);
  assert.deepEqual([...cape.geometry.attributes.position.array], atTwo, 'a frozen clock freezes the cape');
  hero.update(0);
  assert.deepEqual([...cape.geometry.attributes.position.array], atZero, 'rewinding the clock must reproduce the same cloth');
  assert.deepEqual(root(), pose, 'the sky controller exclusively owns position, orientation, scale and visibility');
});

test('repeated sky passes reuse the original geometry, attributes and materials', () => {
  const { hero, resources } = createHero();
  const owned = [...resources];
  const cape = hero.group.getObjectByName('sky_hero_flowing_cape');
  const positions = cape.geometry.attributes.position;
  const normals = cape.geometry.attributes.normal;
  for (let frame = 0; frame < 600; frame += 1) hero.update(frame / 30);
  assert.deepEqual([...resources], owned);
  assert.equal(cape.geometry.attributes.position, positions);
  assert.equal(cape.geometry.attributes.normal, normals);
  assert.ok([...positions.array, ...normals.array].every(Number.isFinite));
  hero.update(NaN);
  assert.ok([...positions.array].every(Number.isFinite));
  assert.equal(hero.getDiagnostics().time, 0);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_sky_hero.js', 'src/flight_sky_hero_fx.js', 'src/flight_sky_show.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  }
  const resources = new Set();
  const { THREE } = sandbox;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.035, 1400);
  camera.position.set(0, 6.4, 10.8); camera.lookAt(0, 0.8, -13);
  const show = sandbox.Skyroads.flightSkyShow.create({ THREE, parent: scene,
    own(resource) { resources.add(resource); return resource; } });
  const state = { mode: 'MENU', runId: 1, reducedMotion: false, distanceMeters: 0 };
  function update(dt = 0.05, minimumWorldY = 17) { show.update(state, { dt, camera, minimumWorldY }); }
  function advance(seconds) { for (let frame = 0; frame < Math.ceil(seconds / 0.05); frame += 1) update(); }
  update(0);
  function triggerHero(distance = 5000) { state.distanceMeters = distance; update(0); }
  return { THREE, show, state, camera, scene, resources, update, advance, triggerHero };
}

function pose(show) {
  const objects = [];
  show.group.traverse((object) => objects.push({ name: object.name, visible: object.visible,
    position: object.position.toArray(), rotation: object.quaternion.toArray(), scale: object.scale.toArray(),
    points: object.geometry?.attributes?.position ? Array.from(object.geometry.attributes.position.array) : null }));
  return JSON.stringify(objects);
}

test('sky events do not run in the menu, appear during a run and reset with the run id', () => {
  const h = harness();
  h.advance(120);
  assert.equal(h.show.getDiagnostics().elapsed, 0);
  assert.equal(h.show.group.visible, false);
  h.state.mode = 'PLAYING'; h.advance(5);
  assert.ok(h.show.getDiagnostics().visibleMeteors > 0);
  h.triggerHero(); h.advance(4);
  assert.equal(h.show.getDiagnostics().heroVisible, true);
  h.state.mode = 'GAMEOVER'; h.update();
  assert.equal(h.show.group.visible, false);
  h.state.runId = 2; h.state.distanceMeters = 0; h.state.mode = 'PLAYING'; h.update();
  assert.equal(h.show.getDiagnostics().elapsed, 0);
  assert.equal(h.show.getDiagnostics().heroVisible, false);
});

test('paused redraw freezes visible characters and cape; reduced motion hides and freezes the show', () => {
  const h = harness(); h.state.mode = 'PLAYING'; h.triggerHero(); h.advance(4);
  h.state.mode = 'PAUSED'; h.update();
  const before = pose(h.show);
  const elapsed = h.show.getDiagnostics().elapsed;
  h.advance(4);
  assert.equal(pose(h.show), before);
  assert.equal(h.show.getDiagnostics().elapsed, elapsed);
  assert.equal(h.show.getDiagnostics().heroVisible, true);
  h.camera.aspect = 390 / 844; h.camera.updateProjectionMatrix(); h.update();
  assert.equal(h.show.getDiagnostics().heroVisible, true, 'A paused viewport resize preserves the event');
  h.state.mode = 'PLAYING'; h.state.reducedMotion = true; h.advance(5);
  assert.equal(h.show.getDiagnostics().elapsed, elapsed);
  assert.equal(h.show.group.visible, false);
  h.state.reducedMotion = false; h.update(0);
  assert.equal(h.show.getDiagnostics().heroVisible, true);
});

test('the hero stays in the sky on elevated and jumping cameras and respects terrain clearance', () => {
  const h = harness(); h.state.mode = 'PLAYING'; h.triggerHero(); h.advance(4);
  const hero = h.show.group.getObjectByName('sky_flying_hero');
  for (const height of [0, 8, 19]) {
    h.camera.position.set(6.8, 6.4 + height, 10.8); h.camera.lookAt(6.8, height + 0.8, -13);
    h.update(0, height + 12);
    assert.equal(h.show.getDiagnostics().heroVisible, true);
    const bounds = new h.THREE.Box3().setFromObject(hero);
    assert.ok(bounds.min.y > height + 12);
    const screen = hero.getWorldPosition(new h.THREE.Vector3()).project(h.camera);
    assert.ok(screen.y > 0.38 && screen.y < 0.85);
    hero.traverse((object) => { if (object.isMesh) {
      assert.equal(object.castShadow, false);
      for (const material of [object.material].flat()) assert.equal(material.depthTest, true);
    } });
  }
  h.update(0, 10000);
  assert.equal(h.show.getDiagnostics().heroVisible, false);
});

test('long-running sky animation is state-read-only and reuses fixed resources', () => {
  const h = harness(); h.state.mode = 'PLAYING'; h.triggerHero();
  const state = JSON.stringify(h.state);
  const count = h.resources.size;
  const geometry = [];
  h.show.group.traverse((object) => { if (object.geometry) geometry.push(object.geometry); });
  h.advance(360);
  assert.equal(JSON.stringify(h.state), state);
  assert.equal(h.resources.size, count);
  const after = [];
  h.show.group.traverse((object) => { if (object.geometry) after.push(object.geometry); });
  assert.deepEqual(after, geometry);
});

test('overtaking moves forward in depth with fixed scale and a genuinely shrinking perspective silhouette', () => {
  const h = harness(); h.state.mode = 'PLAYING'; h.triggerHero();
  const hero = h.show.group.getObjectByName('sky_flying_hero');
  const previous = hero.position.clone();
  const heading = new h.THREE.Vector3();
  const velocity = new h.THREE.Vector3();
  const point = new h.THREE.Vector3();
  let nearSize = null;
  let farSize = null;
  let observedFx = false;
  for (let frame = 0; frame < 160; frame += 1) {
    h.update();
    assert.ok(hero.position.z < previous.z, 'Hero must keep flying ahead, not cross the screen at fixed depth');
    assert.equal(hero.scale.x, 3.4);
    assert.equal(hero.scale.y, hero.scale.x);
    assert.equal(hero.scale.z, hero.scale.x);
    velocity.copy(hero.position).sub(previous).normalize();
    heading.set(1, 0, 0).applyQuaternion(hero.quaternion);
    assert.ok(heading.dot(velocity) > 0.999, 'The fist points along the flight path');
    previous.copy(hero.position);
    observedFx ||= h.show.getDiagnostics().heroFx.visible;
    if (frame !== 71 && frame !== 137) continue;
    h.scene.updateMatrixWorld(true);
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    hero.traverse((object) => {
      if (!object.geometry) return;
      const positions = object.geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld).project(h.camera);
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
    });
    const size = Math.max(maxX - minX, maxY - minY);
    if (frame === 71) nearSize = size; else farSize = size;
  }
  assert.ok(observedFx, 'Acceleration effects must actually appear during the pass');
  assert.ok(nearSize > farSize * 1.8, `Perspective shrinking was too weak: ${nearSize} / ${farSize}`);
});

test('visible hero and acceleration effects never cross the near plane or obscure the road', () => {
  const h = harness(); h.state.mode = 'PLAYING'; h.triggerHero();
  const hero = h.show.group.getObjectByName('sky_flying_hero');
  const fx = h.show.group.getObjectByName('sky_hero_acceleration_fx');
  const point = new h.THREE.Vector3();
  const transform = new h.THREE.Matrix4();
  const instance = new h.THREE.Matrix4();
  const tangent = Math.tan(h.camera.fov * Math.PI / 360);
  let checked = 0;
  function check(object) {
    if (!object.visible) return;
    if (object.geometry) {
      const positions = object.geometry.attributes.position;
      const count = object.isInstancedMesh ? object.count : 1;
      for (let slot = 0; slot < count; slot += 1) {
        transform.copy(object.matrixWorld);
        if (object.isInstancedMesh) { object.getMatrixAt(slot, instance); transform.multiply(instance); }
        for (let vertex = 0; vertex < positions.count; vertex += 1) {
          point.fromBufferAttribute(positions, vertex).applyMatrix4(transform);
          assert.ok(point.y >= 17, 'Visible decoration intersects terrain clearance');
          point.applyMatrix4(h.camera.matrixWorldInverse);
          assert.ok(point.z < -12, 'A decoration crosses the camera near plane');
          assert.ok(point.y / (-point.z * tangent) > 0.38, 'A decoration covers the road region');
          checked += 1;
        }
      }
    }
    object.children.forEach(check);
  }
  for (let frame = 0; frame < 170; frame += 1) {
    h.update();
    if (frame % 5 !== 0) continue;
    h.scene.updateMatrixWorld(true);
    check(hero); check(fx);
  }
  assert.ok(checked > 10000);
  h.state.reducedMotion = true; h.update();
  assert.equal(fx.visible, false);
  h.state.reducedMotion = false; h.state.mode = 'MENU'; h.update();
  assert.equal(fx.visible, false);
});

test('audio cue follows the visible hero phase and is silent without an active presentation', () => {
  const h = harness();
  assert.equal(h.show.getAudioCue().active, false);
  h.state.mode = 'PLAYING'; h.triggerHero(); h.advance(3);
  const cue = h.show.getAudioCue();
  assert.equal(cue.active, true);
  assert.equal(cue.runId, h.state.runId);
  assert.ok(cue.phase > 0.3 && cue.phase < 0.4);
  assert.equal(cue.side, -1);
  h.update(0);
  assert.equal(h.show.getAudioCue().eventId, cue.eventId);
  h.state.mode = 'PAUSED'; h.update();
  assert.equal(h.show.getAudioCue().active, false);
  h.state.mode = 'PLAYING'; h.state.reducedMotion = true; h.update();
  assert.equal(h.show.getAudioCue().active, false);
  h.state.reducedMotion = false; h.update(0, 10000);
  assert.equal(h.show.getAudioCue().active, false);
  h.state.runId += 1; h.state.distanceMeters = 0; h.update();
  assert.equal(h.show.getAudioCue().active, false);
  h.triggerHero(10000); h.advance(3);
  assert.equal(h.show.getAudioCue().side, 1);
  assert.notEqual(h.show.getAudioCue().eventId, cue.eventId);
});


test('hero crosses each 5 km milestone once and never reappears just because time passes', () => {
  const h = harness(); h.state.mode = 'PLAYING';
  h.state.distanceMeters = 4999.99; h.advance(100);
  assert.equal(h.show.getDiagnostics().heroMilestone, 0);
  assert.equal(h.show.getDiagnostics().heroStartElapsed, null);
  assert.equal(h.show.getAudioCue().active, false);
  h.triggerHero(5000.5); h.advance(3);
  const first = h.show.getAudioCue();
  assert.equal(first.active, true);
  assert.equal(h.show.getDiagnostics().heroMilestone, 1);
  const started = h.show.getDiagnostics().heroStartElapsed;
  h.advance(100);
  assert.equal(h.show.getDiagnostics().heroVisible, false);
  assert.equal(h.show.getDiagnostics().heroStartElapsed, started);
  h.triggerHero(9999.9); h.advance(3);
  assert.equal(h.show.getAudioCue().active, false);
  h.triggerHero(10000); h.advance(3);
  const second = h.show.getAudioCue();
  assert.equal(second.active, true);
  assert.equal(second.side, 1);
  assert.notEqual(second.eventId, first.eventId);
  h.triggerHero(9998); h.triggerHero(10001);
  assert.equal(h.show.getAudioCue().eventId, second.eventId, 'Distance jitter must not replay a milestone');
  h.advance(10); h.triggerHero(15000); h.advance(3);
  assert.equal(h.show.getDiagnostics().heroMilestone, 3);
  assert.equal(h.show.getAudioCue().side, -1);
});

test('reduced motion consumes milestones without queuing a delayed flyby; pause cannot trigger one', () => {
  const h = harness(); h.state.mode = 'PLAYING'; h.state.reducedMotion = true;
  h.triggerHero(5000); h.advance(30);
  assert.equal(h.show.getDiagnostics().heroMilestone, 1);
  assert.equal(h.show.getDiagnostics().heroStartElapsed, null);
  h.state.reducedMotion = false; h.advance(30);
  assert.equal(h.show.getAudioCue().active, false);
  h.state.mode = 'PAUSED'; h.triggerHero(10000);
  assert.equal(h.show.getDiagnostics().heroMilestone, 1);
  h.state.mode = 'PLAYING'; h.update(); h.advance(3);
  assert.equal(h.show.getAudioCue().active, true);
  h.state.mode = 'GAMEOVER'; h.triggerHero(15000);
  assert.equal(h.show.getDiagnostics().heroMilestone, 2);
  h.state.runId += 1; h.state.distanceMeters = 0; h.state.mode = 'PLAYING'; h.update();
  assert.equal(h.show.getDiagnostics().heroMilestone, 0);
  assert.equal(h.show.getDiagnostics().heroStartElapsed, null);
  h.triggerHero(); h.advance(3);
  assert.equal(h.show.getAudioCue().active, true);
});

test('meteor frequency more than doubles over a minute without increasing the three-meteor pool', () => {
  const h = harness(); h.state.mode = 'PLAYING';
  const meteors = [0, 1, 2].map(index => h.show.group.getObjectByName(`distant_meteor_${index}`));
  const previous = [false, false, false];
  let starts = 0;
  for (let frame = 0; frame < 1200; frame += 1) {
    h.update();
    meteors.forEach((meteor, index) => {
      if (meteor.visible && !previous[index]) starts += 1;
      previous[index] = meteor.visible;
    });
  }
  assert.ok(starts >= 21, `Expected at least 21 meteors in 60 seconds, got ${starts}`);
  assert.ok(h.show.getDiagnostics().visibleMeteors <= 3);
  assert.equal(h.show.getDiagnostics().heroVisible, false);
});

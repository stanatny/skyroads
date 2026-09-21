'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_magnet.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  }
  const world = { laneWidth: 3.4, segmentDepth: 4, heightScale: 1 / 300 };
  const resources = new Set();
  const batches = [];
  const fuel = [];
  const effect = sandbox.Skyroads.flightMagnet.create({ THREE: sandbox.THREE, world, config: { LANES: 7 },
    own(value) { resources.add(value); return value; },
    makeBatch(name, geometry, material, capacity) {
      const batch = { name, geometry, material, capacity, calls: [], add(...args) { this.calls.push(args); } };
      batches.push(batch); return batch;
    }, addFuel(...args) { fuel.push(args); } });
  const ship = new sandbox.THREE.Group();
  ship.position.set(3.4, 2, 0);
  const state = { mode: 'PLAYING', magnetT: 6, position: 20, reducedMotion: false,
    magnetPulls: [{ lane: 1, segment: 22.5, capturePosition: 20, height: 900, t: 0, dur: 0.68 }] };
  function update(time = 2) {
    batches.forEach((batch) => { batch.calls.length = 0; }); fuel.length = 0;
    effect.update(state, time, ship);
  }
  return { ...sandbox, world, resources, batches, fuel, effect, state, ship, update };
}

test('magnet crystals start on the source terrace and converge on a moving ship', () => {
  const h = harness();
  h.update();
  assert.deepEqual(h.fuel[0].slice(0, 3), [-6.8, 3, -10]);
  h.state.magnetPulls[0].t = 0.6;
  h.update();
  const middle = h.fuel[0].slice(0, 3);
  assert.ok(middle[0] > -6.8 && middle[0] < 3.4);
  assert.ok(middle[1] > 3, 'Crystal lifts clear of the platform');
  assert.ok(middle[2] > -10 && middle[2] < 0.12);
  assert.ok(h.batches.find((batch) => batch.name === 'magnet_crystal_filaments').calls.length > 0);
  h.ship.position.set(-1, 4, 0);
  h.state.position += 1;
  h.state.magnetPulls[0].t = 0.999;
  h.update();
  assert.ok(Math.abs(h.fuel[0][0] + 1) < 0.001);
  assert.ok(Math.abs(h.fuel[0][1] - 4.64) < 0.005);
});

test('magnet display is read-only, pause-stable, bounded, and static under reduced motion', () => {
  const h = harness();
  const resources = h.resources.size;
  h.state.magnetPulls[0].t = 0.5;
  h.state.mode = 'PAUSED';
  const stateBefore = JSON.stringify(h.state);
  h.update();
  const first = JSON.stringify(h.batches.map((batch) => batch.calls));
  h.update();
  assert.equal(JSON.stringify(h.batches.map((batch) => batch.calls)), first);
  assert.equal(JSON.stringify(h.state), stateBefore);
  h.state.reducedMotion = true;
  h.update(20);
  const reduced = JSON.stringify(h.batches.map((batch) => batch.calls));
  h.update(50);
  assert.equal(JSON.stringify(h.batches.map((batch) => batch.calls)), reduced);
  assert.equal(h.fuel.length, 0);
  assert.equal(h.effect.getDiagnostics().active, true);
  h.state.reducedMotion = false;
  h.state.mode = 'PLAYING';
  h.state.magnetPulls = Array.from({ length: 120 }, () => ({ lane: 2, segment: 22, height: 500, t: 0.5 }));
  h.update();
  assert.equal(h.effect.getDiagnostics().visiblePulls, 96);
  assert.ok(h.batches.every((batch) => batch.calls.length <= batch.capacity));
  assert.equal(h.resources.size, resources);
  h.state.mode = 'MENU';
  h.update();
  assert.equal(h.fuel.length, 0);
  assert.ok(h.batches.every((batch) => batch.calls.length === 0));
  h.state.mode = 'PLAYING'; h.state.magnetPulls = []; h.state.magnetT = 0;
  h.update();
  assert.equal(h.effect.getDiagnostics().active, false);
  assert.equal(h.effect.getDiagnostics().visiblePulls, 0);
});

test('burst-speed attraction stays ahead of the chase camera and converges without reversing', () => {
  const h = harness();
  let previousZ = -Infinity;
  for (let frame = 0; frame < 40; frame += 1) {
    const age = frame / 60;
    h.state.position = 20 + 36 * age;
    h.state.magnetPulls[0].t = age / 0.68;
    h.update();
    const z = h.fuel[0][2];
    assert.ok(z >= previousZ && z <= 0.12, `Captured crystal reversed or passed the ship: ${z}`);
    previousZ = z;
  }
});

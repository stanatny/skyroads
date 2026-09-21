'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createShip(options = {}) {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', 'src/flight_ship.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  }
  const resources = new Set();
  const ship = sandbox.Skyroads.flightShip.create({ ...options, THREE: sandbox.THREE,
    own(resource) { resources.add(resource); return resource; } });
  const state = { runId: 'test-flight', mode: 'PLAYING', tripleT: 0, speed: 18,
    boostT: 0, fuelBurstT: 0, playerVY: 0, reducedMotion: false };
  const config = { MAX_SPEED: 24 };
  const update = (time, bank = 0) => ship.update(state, config, { time, bank });
  const bounds = () => {
    ship.group.updateMatrixWorld(true);
    const box = new sandbox.THREE.Box3();
    ship.group.traverseVisible((object) => {
      if (!object.isMesh || object.material.transparent) return;
      object.geometry.computeBoundingBox();
      box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    return box;
  };
  return { ...sandbox, resources, ship, state, update, bounds };
}

test('ship surfaces use finite coordinates, outward closed hulls and registered resources', () => {
  const { ship, resources } = createShip();
  ship.group.traverse((object) => {
    if (!object.isMesh) return;
    assert.ok(resources.has(object.geometry));
    assert.ok(resources.has(object.material));
    for (const attribute of Object.values(object.geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite));
    }
    const normals = object.geometry.getAttribute('normal');
    for (let index = 0; index < normals.count; index += 1) {
      assert.ok(Math.abs(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index)) - 1) < 1e-5);
    }
    if (!object.name.startsWith('player_airframe_')) return;
    const vertices = object.geometry.getAttribute('position');
    let volume = 0;
    // 有向体积可发现截面机身被整体翻面的错误，避免只检查“有法线”却看不到表面。
    for (let index = 0; index < vertices.count; index += 3) {
      const a = [vertices.getX(index), vertices.getY(index), vertices.getZ(index)];
      const b = [vertices.getX(index + 1), vertices.getY(index + 1), vertices.getZ(index + 1)];
      const c = [vertices.getX(index + 2), vertices.getY(index + 2), vertices.getZ(index + 2)];
      volume += a[0] * (b[1] * c[2] - b[2] * c[1])
        + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    assert.ok(volume > 0, `${object.name} must face outward`);
  });
});

test('super mode mechanically expands the silhouette without allocating new resources', () => {
  const { ship, state, update, resources, bounds } = createShip();
  update(0);
  const normal = bounds();
  const resourceCount = resources.size;
  state.tripleT = 12;
  update(0.05);
  assert.ok(ship.getDiagnostics().superBlend > 0 && ship.getDiagnostics().superBlend < 1);
  for (let frame = 2; frame < 120; frame += 1) update(frame * 0.05);
  const expanded = bounds();
  assert.ok(expanded.max.x - expanded.min.x > (normal.max.x - normal.min.x) * 1.3);
  assert.equal(ship.getDiagnostics().superBlend, 1);
  assert.equal(resources.size, resourceCount);
  state.tripleT = 0;
  for (let frame = 120; frame < 240; frame += 1) update(frame * 0.05);
  assert.equal(ship.getDiagnostics().superBlend, 0);
  assert.equal(resources.size, resourceCount);
});

test('visual animation preserves physics state and the position assigned by the chase camera', () => {
  const { ship, state, update } = createShip();
  ship.group.position.set(5.1, 2.93, 0);
  state.tripleT = 9;
  state.playerVY = 700;
  const before = JSON.stringify(state);
  for (let frame = 0; frame < 120; frame += 1) update(frame / 60, 0.18);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual([...ship.group.position.toArray()], [5.1, 2.93, 0]);
  assert.ok(Math.abs(ship.group.rotation.z) <= 0.26);
});

test('reduced motion changes form immediately and freezes decorative movement', () => {
  const { ship, state, update } = createShip();
  state.reducedMotion = true;
  update(0);
  state.tripleT = 5;
  update(0);
  assert.equal(ship.getDiagnostics().superBlend, 1);
  const matrices = () => {
    ship.group.updateMatrixWorld(true);
    const result = [];
    ship.group.traverse((object) => result.push(...object.matrix.elements));
    return result;
  };
  const initial = matrices();
  update(5, 0.2);
  assert.deepEqual(matrices(), initial);
  assert.equal(ship.group.rotation.z, 0);
});

test('death hides the craft and restarting clears a previous super transformation', () => {
  const { ship, state, update } = createShip();
  state.tripleT = 8;
  update(0);
  assert.equal(ship.getDiagnostics().superBlend, 1);
  state.mode = 'GAMEOVER';
  update(0.1);
  assert.equal(ship.group.visible, false);
  Object.assign(state, { mode: 'PLAYING', runId: 'next-flight', tripleT: 0 });
  update(0.2);
  assert.equal(ship.group.visible, true);
  assert.equal(ship.getDiagnostics().superBlend, 0);
});

test('gliding continuously fires stronger vectored exhaust and ends when flight support stops', () => {
  const { ship, state, update, resources } = createShip();
  Object.assign(state, { fuel: 70, playerY: 300, playerVY: -180, gliding: false });
  update(0);
  const cruise = ship.getDiagnostics().propulsion;
  assert.ok(cruise && cruise.mode === 'cruise');
  const owned = resources.size;
  state.gliding = true;
  for (let frame = 1; frame < 90; frame += 1) {
    update(frame / 60);
    const jet = ship.getDiagnostics().propulsion;
    assert.equal(jet.mode, 'glide');
    assert.ok(jet.plumeLength > cruise.plumeLength * 1.5);
    const plume = ship.group.getObjectByName('port_engine_plume');
    assert.ok(plume.rotation.x > 0);
  }
  assert.equal(resources.size, owned);
  state.gliding = false;
  update(1.6);
  assert.equal(ship.getDiagnostics().propulsion.mode, 'cruise');
  assert.equal(ship.group.getObjectByName('port_engine_plume').rotation.x, 0);
  state.gliding = true;
  state.fuel = 0;
  update(1.7);
  assert.equal(ship.getDiagnostics().propulsion.mode, 'cruise');
  state.fuel = 70;
  state.reducedMotion = true;
  update(1.8);
  const before = ship.group.getObjectByName('port_engine_plume').scale.toArray();
  update(5);
  assert.equal(ship.getDiagnostics().propulsion.mode, 'glide');
  assert.deepEqual(ship.group.getObjectByName('port_engine_plume').scale.toArray(), before);
  state.boostT = 1;
  update(5.1);
  assert.equal(ship.getDiagnostics().propulsion.mode, 'boost');
});

test('blended shoulders remain solid and turbine fairings rise above the surrounding wing surface', () => {
  const { THREE, ship, update } = createShip();
  update(0);
  ship.group.updateMatrixWorld(true);
  const surfaces = [];
  ship.group.traverseVisible((object) => {
    if (object.isMesh && !object.material.transparent) surfaces.push(object);
  });
  const topAt = (x, z) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObjects(surfaces, false)[0]?.point.y;
  };
  // 真正翼根区域需要可见实体，不能用外围支架的总包围盒冒充完整翼面。
  for (const x of [-1.2, -0.8, 0, 0.8, 1.2]) {
    for (const z of [0.3, 0.7, 1.1]) {
      const y = topAt(x, z);
      assert.ok(Number.isFinite(y) && y > 0.7 && y < 1.6, `Missing shoulder surface at ${x}, ${z}`);
    }
  }
  for (const side of [-1, 1]) {
    assert.ok(topAt(side * 0.67, 0.45) > topAt(side * 1.2, 0.45) + 0.1);
  }
});

test('physical gun and charge attachments remain aligned with the rebuilt body', () => {
  const { THREE, ship, update } = createShip();
  update(0);
  ship.group.updateMatrixWorld(true);
  const surfaces = [];
  ship.group.traverseVisible((object) => {
    if (object.isMesh && !object.material.transparent) surfaces.push(object);
  });
  const { attachments } = ship.getDiagnostics();
  assert.deepEqual([...attachments.muzzle], [0, 1 / 3, -2.69]);
  assert.deepEqual([...attachments.chargeReactor], [0, 1.38, 0.60]);
  // 从炮口前方检查两根实际炮管端面，确保模型附件没有只改诊断常量。
  for (const side of [-1, 1]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(side * 0.052, 1 / 3, -3), new THREE.Vector3(0, 0, 1));
    const hit = ray.intersectObjects(surfaces, false)[0];
    assert.ok(hit && Math.abs(hit.point.z + 2.72) < 1e-5);
  }
  const reactor = new THREE.Raycaster(new THREE.Vector3(0, 2, 0.60), new THREE.Vector3(0, -1, 0))
    .intersectObjects(surfaces, false)[0];
  assert.ok(reactor && reactor.point.y < attachments.chargeReactor[1]);
  assert.ok(attachments.chargeReactor[1] - reactor.point.y < 0.08);
});


test('fixed airframe scale transforms attachments while leaving root pose and all animations intact', () => {
  const visualScale = 0.43;
  const hoverOffset = (1 / 3) * (1 - visualScale);
  const { ship, state, update } = createShip({ visualScale, hoverOffset });
  const model = ship.group.getObjectByName('player_airframe');
  assert.ok(model);
  ship.group.position.set(5, 7, 0);
  for (let frame = 0; frame < 180; frame += 1) {
    state.tripleT = frame > 60 ? 10 : 0;
    update(frame / 60, 0.26);
  }
  assert.deepEqual([...ship.group.scale.toArray()], [1, 1, 1]);
  assert.deepEqual([...ship.group.position.toArray()], [5, 7, 0]);
  assert.deepEqual([...model.scale.toArray()], [visualScale, visualScale, visualScale]);
  assert.equal(model.position.y, hoverOffset);
  const diagnostics = ship.getDiagnostics();
  assert.equal(diagnostics.visualScale, visualScale);
  assert.ok(Math.abs(diagnostics.attachments.muzzle[1] - 1 / 3) < 1e-12);
  assert.ok(Math.abs(diagnostics.attachments.muzzle[2] - -2.69 * visualScale) < 1e-12);
  assert.ok(Math.abs(diagnostics.attachments.chargeReactor[1] - (1.38 * visualScale + hoverOffset)) < 1e-12);
  assert.equal(ship.group.children.length, 1, 'Every body part and effect must inherit the same fixed scale');
});

test('racing silhouette retains the previous maximum local width in both mechanical forms', () => {
  const { state, update, bounds } = createShip();
  update(0);
  let box = bounds();
  assert.ok(box.max.x - box.min.x <= 3.9135);
  state.tripleT = 10;
  state.reducedMotion = true;
  update(1);
  box = bounds();
  assert.ok(box.max.x - box.min.x <= 5.7035);
});

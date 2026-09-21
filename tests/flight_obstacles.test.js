'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const wallTypes = ['WALL_LOW', 'WALL_MEDIUM', 'WALL_HIGH'];

// 保留真实 Three.js 几何运算；测试不创建浏览器或 WebGL 上下文。
function createHarness() {
  const sandbox = {
    console,
    performance: { now: () => 0 },
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of [
    'assets/vendor/three_r170.js',
    'src/input.js',
    'src/presentation.js',
    'src/world-art.js',
    'src/obstacles.js',
    'src/gap-regions.js',
    'src/flight_obstacles.js',
    'src/flight_renderer.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8')
    .replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${gameSource}
    globalThis.__game = { CONFIG, STATE, newGenState, generateSegment };
  `, sandbox, { filename: 'src/game.js' });
  const { THREE, Skyroads } = sandbox;
  const resources = new Set();
  const batches = [];
  const models = Skyroads.flightObstacles.create({
    THREE,
    own(resource) { resources.add(resource); return resource; },
    makeBatch(name, geometry, material, capacity) {
      const batch = { name, geometry, material, capacity, calls: [],
        add(...args) { this.calls.push(args); } };
      batches.push(batch);
      return batch;
    },
    world: Skyroads.flightRenderer.WORLD,
    config: sandbox.__game.CONFIG,
    hitbox: Skyroads.input.HITBOX,
  });
  return { sandbox, THREE, Skyroads, resources, batches, models, game: sandbox.__game };
}

function addModel(harness, type, z) {
  for (const batch of harness.batches) batch.calls.length = 0;
  harness.models.add(type, 0, z, 20);
  return harness.batches.filter((batch) => batch.calls.length > 0);
}

function boundsAtOrigin(harness, batches, z) {
  const { THREE } = harness;
  const bounds = new THREE.Box3();
  const transform = new THREE.Object3D();
  const point = new THREE.Vector3();
  for (const batch of batches) {
    const positions = batch.geometry.getAttribute('position');
    for (const [x, y, depth, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] of batch.calls) {
      transform.position.set(x, y, depth);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(rx, ry, rz);
      transform.updateMatrix();
      for (let index = 0; index < positions.count; index += 1) {
        point.fromBufferAttribute(positions, index).applyMatrix4(transform.matrix);
        point.z -= z;
        bounds.expandByPoint(point);
      }
    }
  }
  return bounds;
}

function triangles(batches) {
  return batches.reduce((total, batch) => total
    + (batch.geometry.index ? batch.geometry.index.count : batch.geometry.getAttribute('position').count) / 3, 0);
}

function close(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('all obstacle silhouettes stay inside the real collision envelope at both LOD distances', () => {
  const h = createHarness();
  const halfWidth = h.Skyroads.input.HITBOX.wallHalfWidth * h.Skyroads.flightRenderer.WORLD.laneWidth;
  const halfDepth = h.Skyroads.flightRenderer.WORLD.segmentDepth / 2;
  for (const type of wallTypes) {
    const height = h.Skyroads.obstacles.wallHeight(type) * h.Skyroads.flightRenderer.WORLD.heightScale;
    for (const z of [-12, -400]) {
      const batches = addModel(h, type, z);
      assert.ok(batches.length > 0, `${type} must remain visible at ${z}`);
      const bounds = boundsAtOrigin(h, batches, z);
      close(bounds.min.x, -halfWidth);
      close(bounds.max.x, halfWidth);
      close(bounds.min.y, 0);
      close(bounds.max.y, height);
      close(bounds.min.z, -halfDepth);
      close(bounds.max.z, halfDepth);
    }
  }
});

test('model attributes are finite and every surface normal is normalized', () => {
  const { batches } = createHarness();
  for (const batch of batches) {
    for (const [name, attribute] of Object.entries(batch.geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite), `${batch.name}.${name} contains non-finite data`);
    }
    const normals = batch.geometry.getAttribute('normal');
    assert.ok(normals && normals.count > 0, `${batch.name} requires normals`);
    for (let index = 0; index < normals.count; index += 1) {
      close(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index)), 1, 1e-4);
    }
  }
});

test('distant models keep collision silhouettes while reducing triangle work', () => {
  const h = createHarness();
  for (const type of wallTypes) {
    const near = triangles(addModel(h, type, -12));
    const far = triangles(addModel(h, type, -400));
    assert.ok(far > 0 && far < near, `${type}: near ${near}, far ${far}`);
  }
});

test('repeated placement reuses owned geometries and materials', () => {
  const h = createHarness();
  const originalResources = [...h.resources];
  const originalGeometry = h.batches.map((batch) => batch.geometry);
  const originalMaterials = h.batches.map((batch) => batch.material);
  for (let index = 0; index < 600; index += 1) {
    h.models.add(wallTypes[index % 3], (index % 7 - 3) * 3.4, -4 * (index % 120), index);
  }
  assert.deepEqual([...h.resources], originalResources);
  assert.deepEqual(h.batches.map((batch) => batch.geometry), originalGeometry);
  assert.deepEqual(h.batches.map((batch) => batch.material), originalMaterials);
  for (const batch of h.batches) {
    assert.ok(h.resources.has(batch.geometry), `${batch.name} geometry must be owned`);
    assert.ok(h.resources.has(batch.material), `${batch.name} material must be owned`);
  }
});

test('dense real track renders every obstacle without clipping, state changes, or resource growth', () => {
  const h = createHarness();
  // 此窗口来自真实生成器 100000 段扫描，包含 126 面墙，保留全部生成规则。
  vm.runInContext(`{
    let seed = 42;
    Math.random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  }`, h.sandbox);
  const generator = h.game.newGenState();
  const track = Array.from({ length: 28230 }, (_, index) => h.game.generateSegment(index, generator));
  const position = 28104;
  const state = {
    mode: 'PLAYING', position, time: 10, elapsedMs: 10000, runId: 'dense-model-test',
    movement: { lanePosition: 3 }, playerY: 0, fuel: 100, reducedMotion: false,
    shots: [], track,
  };
  let obstacles = 0;
  for (let index = position - 2; index < position + 118; index += 1) {
    for (let lane = 0; lane < h.game.CONFIG.LANES; lane += 1) {
      const type = track[index].lanes[lane];
      if (!wallTypes.includes(type)) continue;
      obstacles += 1;
      const coordinates = h.Skyroads.flightRenderer.coordinates;
      h.models.add(type, coordinates.laneX(lane), coordinates.segmentZ(index, position), index);
    }
  }
  assert.ok(obstacles >= 120, `Dense fixture contains only ${obstacles} obstacles`);

  let scene;
  const listeners = new Set();
  // 仅替换 GPU 提交器；实例矩阵、模型构建、LOD 与资源释放仍走真实实现。
  h.THREE.WebGLRenderer = class {
    constructor() {
      this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
    }
    setClearColor() {}
    setPixelRatio(value) { this.pixelRatio = value; }
    getPixelRatio() { return this.pixelRatio; }
    setSize() {}
    render(value) { scene = value; }
    dispose() { this.disposed = true; }
  };
  const renderer = h.Skyroads.flightRenderer.create({
    canvas: {
      addEventListener(name, listener) { listeners.add(listener); },
      removeEventListener(name, listener) { listeners.delete(listener); },
    },
    config: h.game.CONFIG,
  });
  renderer.resize(1440, 900, 1);
  const original = JSON.stringify(state);
  renderer.render(state);
  assert.equal(renderer.getDiagnostics().clippedInstances, 0);
  const meshesByName = new Map();
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((object) => {
    if (object.isInstancedMesh) meshesByName.set(object.name, object);
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  for (const batch of h.batches) {
    const mesh = meshesByName.get(batch.name);
    assert.ok(mesh, `${batch.name} is missing from the real renderer`);
    assert.equal(mesh.count, batch.calls.length, `${batch.name} lost obstacle instances`);
    assert.ok(mesh.count < mesh.instanceMatrix.count, `${batch.name} reached its capacity`);
  }
  for (let frame = 0; frame < 15; frame += 1) renderer.render(state);
  assert.equal(JSON.stringify(state), original, 'Rendering must not mutate gameplay state');
  const currentGeometries = new Set();
  scene.traverse((object) => { if (object.geometry) currentGeometries.add(object.geometry); });
  assert.deepEqual(currentGeometries, geometries);

  const released = new Set();
  for (const resource of [...geometries, ...materials]) {
    resource.addEventListener('dispose', () => released.add(resource));
  }
  assert.equal(listeners.size, 1);
  renderer.dispose();
  assert.equal(listeners.size, 0);
  assert.equal(released.size, geometries.size + materials.size);
  assert.equal(renderer.getDiagnostics().disposed, true);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cockpitUi = require('../src/cockpit_ui.js');

// 只替换 GPU 提交，仍通过真实 Three.js 场景检查实体、光柱和地面标记。
function rendererHarness(detailed) {
  const sandbox = { console, performance: { now: () => 0 } };
  vm.createContext(sandbox);
  for (const file of ['assets/vendor/three_r170.js', ...(detailed ? ['src/flight_objects.js'] : []), 'src/flight_renderer.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  let scene;
  sandbox.THREE.WebGLRenderer = class {
    constructor() { this.info = { render: {}, memory: {} }; }
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    render(value) { scene = value; }
    dispose() {}
  };
  const config = { LANES: 7, RENDER_DISTANCE: 20 };
  const renderer = sandbox.Skyroads.flightRenderer.create({
    canvas: { addEventListener() {}, removeEventListener() {} }, config,
  });
  const state = { mode: 'PLAYING', position: 0, time: 0, tripleT: 0,
    movement: { lanePosition: 3 }, playerY: 0, shots: [],
    track: Array.from({ length: 20 }, (_, index) => ({ index, lanes: Array(7).fill('ROAD') })),
  };
  state.track[5].lanes = ['ROAD', 'FUEL', 'BOOST', 'SLOW', 'TRIPLE', 'MAGNET', 'ROAD'];
  return { renderer, state, count: name => scene.getObjectByName(name).count };
}

test('both 3D reward paths hide super tokens and all their effects only while super form is active', () => {
  for (const detailed of [false, true]) {
    const h = rendererHarness(detailed);
    const token = detailed ? 'object_triple_body' : 'triple_sigil';
    const beam = detailed ? 'object_pickup_light_columns' : 'pickup_beacons';
    const otherToken = detailed ? 'object_boost_body' : 'boost_sigil';
    h.renderer.render(h.state);
    const beamCount = h.count(beam);
    assert.equal(h.count(token), 1);
    assert.equal(h.count(otherToken), 1);
    const trackBefore = JSON.stringify(h.state.track);
    for (const remaining of [20, 1, 0.0001]) {
      h.state.tripleT = remaining;
      h.renderer.render(h.state);
      assert.equal(h.count(token), 0, `${detailed ? 'detailed' : 'fallback'} super token remains visible`);
      assert.equal(h.count(otherToken), 1, 'other rewards remain visible');
      assert.equal(h.count(beam), beamCount * 4 / 5, 'the hidden token must leave no light column');
      if (detailed) assert.equal(h.count('object_pickup_floor_marks'), 4);
      else assert.equal(h.count('pickup_halo_glow'), 4);
    }
    h.state.tripleT = 0;
    h.renderer.render(h.state);
    assert.equal(h.count(token), 1);
    assert.equal(h.count(beam), beamCount);
    assert.equal(JSON.stringify(h.state.track), trackBefore, 'rendering never changes generated rewards');
    h.renderer.dispose();
  }
});

test('boost visibility follows its own active timer, independently of super form, grace and fuel burst', () => {
  for (const detailed of [false, true]) {
    const h = rendererHarness(detailed);
    const boost = detailed ? 'object_boost_body' : 'boost_sigil';
    const triple = detailed ? 'object_triple_body' : 'triple_sigil';
    const beam = detailed ? 'object_pickup_light_columns' : 'pickup_beacons';
    h.renderer.render(h.state);
    const beamCount = h.count(beam);
    for (const remaining of [5, 1, 0.0001]) {
      h.state.boostT = remaining;
      h.renderer.render(h.state);
      assert.equal(h.count(boost), 0, 'active boost hides only its duplicate pickup');
      assert.equal(h.count(triple), 1);
      assert.equal(h.count(beam), beamCount * 4 / 5);
    }
    h.state.tripleT = 20;
    h.state.mode = 'PAUSED';
    h.renderer.render(h.state);
    assert.equal(h.count(boost), 0);
    assert.equal(h.count(triple), 0);
    assert.equal(h.count(beam), beamCount * 3 / 5);
    h.state.boostT = 0;
    h.state.boostGraceT = 2;
    h.state.fuelBurstT = 3;
    h.renderer.render(h.state);
    assert.equal(h.count(boost), 1, 'grace and fuel burst do not hide boost pickups');
    assert.equal(h.count(triple), 0, 'unrelated boost expiry cannot reveal active super pickups');
    h.state.tripleT = 0;
    h.renderer.render(h.state);
    assert.equal(h.count(triple), 1);
    assert.equal(h.count(beam), beamCount);
    h.renderer.dispose();
  }
});

// 仅模拟 HUD 用到的 DOM 接口，验证实际前方地形格而不是辅助函数的副本。
class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.attributes = {}; this.className = ''; this.textContent = '';
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  append(...nodes) { this.children.push(...nodes); }
  insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
}

test('terrain preview immediately follows both independent reward timers and preserves fuel and hazard priorities', () => {
  const document = { body: new Element(), createElement: () => new Element() };
  const ui = cockpitUi.create({ document });
  ui.setAvailable(true);
  const state = { mode: 'PLAYING', time: 0, position: 0, tripleT: 0, fuel: 100,
    movement: { lanePosition: 3 }, track: [
      { lanes: ['TRIPLE', 'TRIPLE', 'TRIPLE', 'TRIPLE', 'BOOST', 'SLOW', 'MAGNET'] },
      { lanes: ['ROAD', 'WALL_LOW', 'FUEL', 'MAGNET', 'ROAD', 'ROAD', 'ROAD'] },
    ],
  };
  const all = node => [node, ...node.children.flatMap(all)];
  const cells = all(document.body).filter(node => node.className === 'cockpit-route-cell').slice(-7);
  const kinds = () => cells.map(node => node.className.match(/is-(\w+)/)[1]);
  ui.update(state);
  assert.deepEqual(kinds(), ['pickup', 'wall', 'fuel', 'pickup', 'pickup', 'pickup', 'pickup']);
  state.tripleT = 20;
  ui.update(state);
  assert.deepEqual(kinds(), ['road', 'wall', 'fuel', 'pickup', 'pickup', 'pickup', 'pickup']);
  state.boostT = 5;
  ui.update(state);
  assert.deepEqual(kinds(), ['road', 'wall', 'fuel', 'pickup', 'road', 'pickup', 'pickup']);
  state.tripleT = 0;
  ui.update(state);
  assert.equal(kinds()[0], 'pickup', 'expiry restores the reward without waiting for the HUD throttle');
  assert.equal(kinds()[4], 'road');
  state.boostT = 0;
  state.boostGraceT = 2;
  state.fuelBurstT = 3;
  ui.update(state);
  assert.equal(kinds()[4], 'pickup', 'boost expiry updates immediately even while other protection remains');
});

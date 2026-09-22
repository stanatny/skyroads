'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 用真实按键处理和物理计时驱动模型；只替换音频、DOM 与外层绘制提交。
function harness() {
  const sandbox = {
    console, performance: { now: () => 0 },
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; } },
    document: { hidden: false, listeners: {}, querySelector() { return null; },
      addEventListener(type, listener) { this.listeners[type] = listener; } },
    requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const file of [
    'assets/vendor/three_r170.js', 'src/input.js', 'src/presentation.js', 'src/world-art.js',
    'src/obstacles.js', 'src/gap-regions.js', 'src/tutorial.js', 'src/flight_dimensions.js',
    'src/flight_terrain.js', 'src/flight_ship.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${gameSource}
    globalThis.__game = { STATE, CONFIG, updatePhysics, tryJump, togglePause,
      clearAllInputState, resetGame, enableFlightTerrain, loop };
    syncPropulsionAudio = () => {};
    syncAdaptiveAudio = () => {};
    setLegacyAudioPaused = () => {};
    refreshPresentation = () => {};
    focusPrimarySurface = () => {};
    render = () => { globalThis.__renders += 1; globalThis.__paint(STATE.time); };
    globalThis.__renders = 0;
  `, sandbox, { filename: 'src/game.js' });
  const game = sandbox.__game;
  const state = game.STATE;
  Object.assign(state, {
    mode: 'PLAYING', runId: 'charge-test', time: 0, position: 0, speed: 8,
    width: 1440, height: 900, playerY: 0, playerVY: 0, jumpsUsed: 0,
    reducedMotion: false, fuel: 100, tutorial: null,
    movement: sandbox.Skyroads.input.createMovementState(3),
    track: Array.from({ length: 400 }, (_, index) => ({ index, lanes: Array(7).fill('ROAD'), enemies: [] })),
  });
  game.enableFlightTerrain();
  const resources = new Set();
  const ship = sandbox.Skyroads.flightShip.create({ THREE: sandbox.THREE,
    own(resource) { resources.add(resource); return resource; } });
  const paint = () => ship.update(state, game.CONFIG,
    { time: state.reducedMotion ? 0 : state.time, bank: 0 });
  sandbox.__paint = paint;
  paint();
  return { sandbox, game, state, ship, resources, paint,
    charge() { return ship.getDiagnostics().charge; },
    key(type, code) {
      sandbox.window.listeners[type]({ code, repeat: false, target: null, preventDefault() {} });
    },
    advance(seconds) {
      const count = Math.ceil(seconds / 0.025);
      const dt = seconds / count;
      for (let index = 0; index < count; index += 1) {
        state.time += dt;
        game.updatePhysics(dt);
        paint();
      }
    },
  };
}

function visualSnapshot(ship) {
  ship.group.updateMatrixWorld(true);
  const rows = [];
  ship.group.traverse((object) => {
    const material = object.material;
    rows.push([object.name, object.visible, ...object.matrix.elements,
      material?.opacity, material?.color?.getHex()]);
  });
  return JSON.stringify(rows);
}

function near(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('fuel charge remains eligible below the starting fuel threshold and auto-fires without a full-charge frame', () => {
  const h = harness();
  h.state.fuel = h.game.CONFIG.FUEL_BURST_MIN;
  h.key('keydown', 'KeyW');
  h.advance(0.60);
  assert.ok(h.state.fuel < h.game.CONFIG.FUEL_BURST_MIN);
  assert.ok(h.state.fuelBurstChargeT > 0.60);
  near(h.charge().fuelRatio, h.state.fuelBurstChargeT / h.game.CONFIG.FUEL_BURST_CHARGE_TIME);
  h.advance(0.425);
  assert.equal(h.state.fuelBurstChargeT, 0);
  assert.ok(h.state.fuelBurstT > 0);
  assert.equal(h.charge().fuelRatio, 0);
  assert.ok(h.charge().burstPulse > 0, 'the automatic trigger must remain visible after charge resets');
});

test('J fully charges once while held and clears weapon charging when released', () => {
  const h = harness();
  h.key('keydown', 'KeyJ');
  h.advance(h.game.CONFIG.CHARGE_TIME);
  assert.equal(h.state.chargeT, h.game.CONFIG.CHARGE_TIME);
  assert.equal(h.state.shots.length, 0);
  assert.equal(h.charge().weaponRatio, 1);
  assert.ok(h.charge().readyPulse > 0);
  h.advance(1.2);
  assert.equal(h.charge().weaponRatio, 1);
  assert.equal(h.charge().readyPulse, 0, 'holding a ready weapon must not restart its pulse');
  h.key('keyup', 'KeyJ');
  h.paint();
  assert.equal(h.state.shots[0].kind, 'missile');
  assert.equal(h.charge().weaponRatio, 0);
});

test('short J taps never reveal ship charge effects and sustained holds reveal at the HUD delay', () => {
  const h = harness();
  for (const duration of [0.05, 0.15, 0.45, 0.15]) {
    h.state.shots = [];
    h.key('keydown', 'KeyJ');
    h.paint();
    assert.equal(h.charge().visible, false);
    h.advance(duration);
    assert.ok(h.state.chargeT > 0);
    assert.equal(h.charge().visible, false);
    assert.equal(h.charge().particles, 0);
    h.key('keyup', 'KeyJ');
    h.paint();
    assert.equal(h.state.shots.length, 1);
    assert.equal(h.state.shots[0].kind, 'bullet');
    assert.equal(h.charge().visible, false);
    h.advance(0.3);
  }
  for (const reducedMotion of [false, true]) {
    h.state.reducedMotion = reducedMotion;
    h.state.chargeT = h.game.CONFIG.CHARGE_HUD_DELAY - 0.001;
    h.paint();
    assert.equal(h.charge().visible, false);
    h.state.chargeT = h.game.CONFIG.CHARGE_HUD_DELAY;
    h.paint();
    assert.equal(h.charge().visible, true);
    assert.equal(h.charge().kind, 'weapon');
    near(h.charge().weaponRatio, h.state.chargeT / h.game.CONFIG.CHARGE_TIME);
  }
  h.key('keydown', 'KeyJ');
  h.advance(h.game.CONFIG.CHARGE_TIME);
  assert.ok(h.charge().readyPulse > 0);
  // 松手和下一次点射可能发生在同一渲染帧，不能继承上一发的就绪脉冲。
  h.key('keyup', 'KeyJ');
  h.key('keydown', 'KeyJ');
  h.paint();
  assert.equal(h.charge().visible, false);
  assert.equal(h.charge().readyPulse, 0);
});

test('fuel aliases, release, jump and loss of focus cancel charging without false burst feedback', () => {
  const h = harness();
  h.key('keydown', 'KeyW');
  h.key('keydown', 'ArrowUp');
  h.advance(0.20);
  h.key('keyup', 'KeyW');
  assert.ok(h.state.fuelBurstChargeT > 0);
  h.key('keyup', 'ArrowUp');
  h.paint();
  assert.equal(h.charge().fuelRatio, 0);
  assert.equal(h.charge().burstPulse, 0);
  h.key('keydown', 'KeyW');
  h.advance(0.20);
  h.game.tryJump();
  h.advance(0.025);
  assert.equal(h.charge().fuelRatio, 0);
  assert.equal(h.charge().burstPulse, 0);
  h.key('keydown', 'KeyJ');
  h.advance(0.20);
  h.sandbox.window.listeners.blur();
  h.paint();
  assert.equal(h.state.chargeT, 0);
  assert.equal(h.charge().weaponRatio, 0);
  assert.equal(h.state.shots.length, 0);
});

test('real pause clears input and freezes the last rendered charging frame until resume', () => {
  const h = harness();
  h.key('keydown', 'KeyJ');
  h.key('keydown', 'KeyW');
  h.advance(0.30);
  const before = visualSnapshot(h.ship);
  const renders = h.sandbox.__renders;
  h.key('keydown', 'KeyP');
  assert.equal(h.state.mode, 'PAUSED');
  assert.equal(h.state.chargeT, 0);
  assert.equal(h.state.fuelBurstChargeT, 0);
  for (let index = 0; index < 30; index += 1) h.game.loop(1000 + index * 16);
  assert.equal(h.sandbox.__renders, renders);
  assert.equal(visualSnapshot(h.ship), before);
  h.key('keyup', 'KeyP');
  h.key('keydown', 'KeyP');
  h.game.loop(2000);
  assert.equal(h.state.mode, 'PLAYING');
  assert.equal(h.charge().weaponRatio, 0);
  assert.equal(h.charge().fuelRatio, 0);
  assert.equal(h.charge().burstPulse, 0);
  assert.equal(h.state.shots.length, 0);
});

test('restart clears charging pulses and repeated charge effects reuse every owned resource', () => {
  const h = harness();
  const originals = [...h.resources];
  h.key('keydown', 'KeyJ');
  h.advance(h.game.CONFIG.CHARGE_TIME);
  assert.ok(h.charge().readyPulse > 0);
  h.game.resetGame();
  h.paint();
  assert.equal(h.charge().readyPulse, 0);
  assert.equal(h.charge().burstPulse, 0);
  assert.equal(h.charge().weaponRatio, 0);
  assert.equal(h.charge().fuelRatio, 0);
  for (let index = 0; index < 500; index += 1) {
    h.state.chargeT = index % 61 / 60 * h.game.CONFIG.CHARGE_TIME;
    h.state.fuelBurstChargeT = index % 41 / 40 * h.game.CONFIG.FUEL_BURST_CHARGE_TIME;
    h.state.time += 1 / 60;
    const before = JSON.stringify(h.state);
    h.paint();
    assert.equal(JSON.stringify(h.state), before);
  }
  assert.deepEqual([...h.resources], originals);
});

test('reduced motion keeps charging readable without orbiting or pulse expansion', () => {
  const h = harness();
  h.state.reducedMotion = true;
  h.state.chargeT = h.game.CONFIG.CHARGE_TIME * 0.7;
  h.state.fuelBurstChargeT = h.game.CONFIG.FUEL_BURST_CHARGE_TIME * 0.6;
  h.paint();
  near(h.charge().weaponRatio, 0.7);
  near(h.charge().fuelRatio, 0.6);
  const before = visualSnapshot(h.ship);
  h.state.time += 12;
  h.paint();
  assert.equal(visualSnapshot(h.ship), before);
});

test('reduced-motion pulses expire on the gameplay clock while decorative time stays zero', () => {
  const h = harness();
  h.state.reducedMotion = true;
  h.key('keydown', 'KeyW');
  h.advance(1.025);
  assert.ok(h.charge().burstPulse > 0);
  assert.equal(h.charge().phase, 0);
  assert.equal(h.charge().particles, 0);
  const field = h.ship.group.getObjectByName('ship_charge_field');
  const pulseRing = field.children.find((object) => object.isMesh && !object.isInstancedMesh && object.visible);
  assert.ok(pulseRing);
  const scale = Array.from(pulseRing.scale.toArray());
  const initialPulse = h.charge().burstPulse;
  h.advance(0.1);
  assert.ok(h.charge().burstPulse > 0 && h.charge().burstPulse < initialPulse);
  assert.deepEqual(Array.from(pulseRing.scale.toArray()), scale);
  h.advance(0.4);
  assert.equal(h.charge().burstPulse, 0);
  assert.equal(h.charge().visible, false);
  assert.equal(h.charge().phase, 0);
  h.key('keydown', 'KeyJ');
  h.advance(h.game.CONFIG.CHARGE_TIME);
  assert.ok(h.charge().readyPulse > 0);
  h.advance(0.4);
  assert.equal(h.charge().readyPulse, 0);
  assert.equal(h.charge().weaponRatio, 1);
  assert.equal(h.charge().particles, 0);
});

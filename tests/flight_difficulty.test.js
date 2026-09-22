'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

// 使用真实加速、道具、跳跃和碰撞；空赛道与持续补给仅隔离无关的随机危险及燃料耗尽。
function createHarness({ position = 0, lane = 3, speed = 8 } = {}) {
  const sandbox = {
    console, navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 1440, innerHeight: 900, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now: () => 0 }, requestAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const name of ['input', 'presentation', 'world-art', 'obstacles', 'gap-regions',
    'flight_dimensions', 'flight_terrain']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', `${name}.js`), 'utf8'), sandbox);
  }
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(`${source}
    globalThis.game = { STATE, CONFIG, KEYS, updatePhysics, tryJump, tryFuelBurst,
      collectPickup, enableFlightTerrain };
    syncPropulsionAudio = () => {};
    die = reason => { STATE.mode = 'GAMEOVER'; globalThis.death = reason; };
  `, sandbox);
  const game = sandbox.game;
  const state = game.STATE;
  Object.assign(state, { mode: 'PLAYING', position, speed, playerY: 0, playerVY: 0,
    jumpsUsed: 0, fuel: 100, tutorial: null,
    movement: sandbox.Skyroads.input.createMovementState(lane),
    track: Array.from({ length: 4000 }, (_, index) => ({
      index, lanes: Array(7).fill('ROAD'), enemies: [],
    })),
  });
  return { sandbox, state, game, terrain: sandbox.Skyroads.flightTerrain,
    step(dt = 1 / 120) {
      state.fuel = 100;
      game.updatePhysics(dt);
      assert.equal(state.mode, 'PLAYING', `${sandbox.death}: position=${state.position}, height=${state.playerY}`);
    },
    advance(seconds, hz = 60) {
      for (let frame = 0; frame < Math.round(seconds * hz); frame += 1) this.step(1 / hz);
    },
  };
}

test('normal acceleration reaches 13 after ten seconds and caps at 25 after 34 seconds', () => {
  for (const hz of [20, 60, 120]) {
    const h = createHarness();
    h.advance(10, hz);
    close(h.state.speed, 13);
    h.advance(24, hz);
    close(h.state.speed, 25);
    h.advance(5, hz);
    close(h.state.speed, 25);
  }
});

test('a slow pickup at cruising speed recovers in twenty seconds without changing its strength', () => {
  const h = createHarness({ speed: 25 });
  h.game.collectPickup(h.state.track[0], 3, 'SLOW');
  close(h.state.speed, 15);
  h.advance(10);
  close(h.state.speed, 20);
  h.advance(10);
  close(h.state.speed, 25);
});

test('the practice speed cap remains sixteen under the quicker acceleration', () => {
  const h = createHarness();
  h.state.tutorial = { active: true };
  h.advance(20);
  close(h.state.speed, 16);
  h.advance(20);
  close(h.state.speed, 16);
});

test('boost and fuel burst retain speed 36, prior cruising speed and their exit protection', () => {
  for (const kind of ['boost', 'fuelBurst']) {
    for (const priorSpeed of [22, 25]) {
      const h = createHarness({ speed: priorSpeed });
      if (kind === 'boost') h.game.collectPickup(h.state.track[0], 3, 'BOOST');
      else h.game.tryFuelBurst();
      const timer = `${kind}T`;
      assert.ok(h.state[timer] > 0);
      let frames = 0;
      while (h.state[timer] > 0 && frames++ < 600) {
        h.step(0.01);
        close(h.state.speed, 36);
      }
      assert.equal(h.state[timer], 0);
      h.step(0.02);
      close(h.state.speed, Math.min(25, priorSpeed + 0.01));
      assert.ok(h.state[`${kind}GraceT`] > 1.9);
    }
  }
});

test('new maximum speed preserves real low-wall glide and medium-wall double-jump corridors', () => {
  for (const hz of [20, 60, 120]) {
    for (const type of ['WALL_LOW', 'WALL_MEDIUM']) {
      // 20 Hz 下低墙上升越线约需 0.12 秒；避免过早起跳把滑翔余量浪费在墙前。
      const lead = type === 'WALL_LOW' ? 0.12 : 0.35;
      const start = 30;
      const h = createHarness({ position: start - 25 * lead, speed: 25 });
      const length = h.sandbox.Skyroads.obstacles.selectRunLength(type, 25, 0.999);
      for (let index = start; index < start + length; index += 1) {
        h.state.track[index].lanes[3] = type;
      }
      h.game.KEYS.KeyK = true;
      h.game.tryJump();
      let secondJump = false;
      for (let frame = 0; frame < hz * 2 && h.state.position <= start + length; frame += 1) {
        if (type === 'WALL_MEDIUM' && !secondJump && frame / hz >= 0.23) {
          h.game.tryJump();
          secondJump = true;
        }
        h.step(1 / hz);
      }
      assert.ok(h.state.position > start + length, `${type} at ${hz} Hz`);
      close(h.state.speed, 25);
      assert.equal(secondJump, type === 'WALL_MEDIUM');
    }
  }
});

test('speed 25 leaves enough time to land on floating islands and jump their exit gaps', () => {
  for (const hz of [20, 60, 120]) {
    for (const cycle of [0, 1, 6]) {
      const start = 48 + cycle * 240;
      const lane = cycle % 2 === 0 ? 6 : 0;
      const h = createHarness({ position: start + 114 - 25 * 0.07, lane, speed: 25 });
      h.game.enableFlightTerrain();
      // 保留真实浮岛和缺口，只移除奖励，避免三段跳或加速拾取改变本次几何验证。
      h.state.track = h.state.track.map((segment) => ({ ...segment,
        lanes: segment.lanes.map((type) => type === 'GAP' ? type : 'ROAD'), enemies: [],
      }));
      h.game.tryJump();
      let landed = false;
      let exitJump = false;
      const crossed = new Set();
      for (let frame = 0; frame < hz * 4; frame += 1) {
        h.step(1 / hz);
        const phase = h.state.position - start;
        if (phase >= 114 && phase < 116 || phase >= 136 && phase < 138) {
          crossed.add(phase < 116 ? 'entry' : 'exit');
          assert.ok(h.state.playerY >= h.game.CONFIG.GAP_SAFE_HEIGHT);
        }
        if (phase >= 116 && phase < 136 && h.state.playerY === 0) landed = true;
        if (!exitJump && phase >= 136 - h.state.speed * 0.09) {
          assert.equal(landed, true);
          assert.equal(h.state.playerY, 0);
          h.game.tryJump();
          exitJump = true;
        }
        if (phase > 138 && h.state.playerY === 0) break;
      }
      assert.equal(exitJump, true);
      assert.deepEqual([...crossed], ['entry', 'exit']);
      assert.ok(h.state.position > start + 138 && h.state.position < start + 160);
      assert.equal(h.state.playerY, 0);
      assert.equal(h.state.jumpsUsed, 0);
    }
  }
});

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
      collectPickup, enableFlightTerrain,
      currentCruiseSpeed: typeof currentCruiseSpeed === 'function' ? currentCruiseSpeed : () => STATE.speed,
      reactionSegmentsAt: typeof reactionSegmentsAt === 'function' ? reactionSegmentsAt : () => CONFIG.REACTION_SEGS };
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

test('cruise accelerates faster initially and keeps growing past the former limits', () => {
  for (const hz of [20, 60, 120]) {
    const h = createHarness();
    h.advance(10, hz);
    close(h.state.speed, 14.5);
    h.advance(40, hz);
    close(h.state.speed, 36 + (50 - 28 / 0.65) * 0.1);
    const previous = h.state.speed;
    h.advance(20, hz);
    close(h.state.speed, previous + 2);
  }
});

test('slow pickups lower the cruise baseline and acceleration resumes without a hard cap', () => {
  const h = createHarness({ speed: 45 });
  h.game.collectPickup(h.state.track[0], 3, 'SLOW');
  close(h.state.speed, 27);
  h.advance(10);
  close(h.state.speed, 33.5);
});

test('the practice speed cap remains sixteen under the quicker acceleration', () => {
  const h = createHarness();
  h.state.tutorial = { active: true };
  h.advance(20);
  close(h.state.speed, 16);
  h.advance(20);
  close(h.state.speed, 16);
});

test('boosts stay faster than cruise and preserve its growing baseline and exit protection', () => {
  for (const kind of ['boost', 'fuelBurst']) {
    for (const priorSpeed of [22, 45]) {
      const h = createHarness({ speed: priorSpeed });
      if (kind === 'boost') h.game.collectPickup(h.state.track[0], 3, 'BOOST');
      else h.game.tryFuelBurst();
      const timer = `${kind}T`;
      let elapsed = 0;
      while (h.state[timer] > 0 && elapsed < 6) {
        h.step(0.01);
        elapsed += 0.01;
        const base = priorSpeed + elapsed * (priorSpeed < 36 ? 0.65 : 0.1);
        close(h.state.speed, Math.max(36, base + 8));
      }
      assert.equal(h.state[timer], 0);
      h.step(0.02);
      close(h.state.speed, priorSpeed + (elapsed + 0.02) * (priorSpeed < 36 ? 0.65 : 0.1));
      const duration = kind === 'boost' ? 1.5 : 2;
      assert.ok(h.state[`${kind}GraceT`] > duration - 0.1);
      assert.ok(h.state[`${kind}GraceT`] <= duration);
    }
  }
});

test('slow during overlapping boosts changes the underlying cruise instead of being undone', () => {
  const h = createHarness({ speed: 45 });
  h.game.tryFuelBurst();
  h.step(0.1);
  h.game.collectPickup(h.state.track[0], 3, 'BOOST');
  h.game.collectPickup(h.state.track[1], 3, 'SLOW');
  const slowed = 45.01 * 0.6;
  close(h.game.currentCruiseSpeed(), slowed);
  h.advance(6);
  close(h.state.speed, slowed + 6 * 0.65);
  assert.equal(h.state.boostPrevSpeed, 0);
  assert.equal(h.state.fuelBurstPrevSpeed, 0);
});

test('super pickups cannot extend an active transformation and become collectible after expiry', () => {
  const h = createHarness();
  const first = h.state.track[5];
  first.lanes[3] = 'TRIPLE';
  assert.equal(h.game.collectPickup(first, 3, 'TRIPLE'), true);
  close(h.state.tripleT, 20);
  h.advance(1);
  const second = h.state.track[100];
  second.lanes[3] = 'TRIPLE';
  h.state.superFx = 0;
  assert.equal(h.game.collectPickup(second, 3, 'TRIPLE'), false);
  close(h.state.tripleT, 19);
  assert.equal(h.state.superFx, 0);
  assert.equal(second.lanes[3], 'ROAD');
  h.advance(19.1);
  assert.equal(h.state.tripleT, 0);
  const later = h.state.track[1000];
  later.lanes[3] = 'TRIPLE';
  assert.equal(h.game.collectPickup(later, 3, 'TRIPLE'), true);
  close(h.state.tripleT, 20);
});

test('repeated boost pickups cannot refresh timers, replay effects or alter the cruise baseline', () => {
  for (const remaining of [5, 2.5, 0.0001]) {
    const h = createHarness({ speed: 45 });
    vm.runInContext('globalThis.boostSounds = 0; sfxBoost = () => { boostSounds++; };', h.sandbox);
    Object.assign(h.state, { boostT: remaining, boostPrevSpeed: 37, boostWarnStage: 2 });
    const segment = h.state.track[0];
    segment.lanes[3] = 'BOOST';
    assert.equal(h.game.collectPickup(segment, 3, 'BOOST'), false);
    close(h.state.boostT, remaining);
    close(h.state.boostPrevSpeed, 37);
    assert.equal(h.state.boostWarnStage, 2);
    assert.equal(h.sandbox.boostSounds, 0);
    assert.equal(segment.lanes[3], 'ROAD');
  }
});

test('a passed hidden boost stays consumed across expiry and a new boost can be collected during exit grace', () => {
  const h = createHarness({ position: 20.2 });
  Object.assign(h.state, { boostT: 0.0001, boostPrevSpeed: 8 });
  h.state.track[20].lanes[3] = 'BOOST';
  h.step(0.00005);
  assert.equal(h.state.track[20].lanes[3], 'ROAD');
  close(h.state.boostT, 0.00005);
  h.step(0.0001);
  assert.equal(h.state.boostT, 0);
  assert.ok(h.state.boostGraceT > 1.49 && h.state.boostGraceT <= 1.5);
  h.step(0.001);
  assert.equal(h.state.boostT, 0);
  h.state.track[20].lanes[3] = 'BOOST';
  h.step(0.001);
  close(h.state.boostT, h.game.CONFIG.BOOST_DURATION);
  assert.equal(h.state.boostGraceT, 0);
});

test('boost and transformation locks do not block different rewards or overlap with fuel burst', () => {
  const h = createHarness({ speed: 24 });
  h.game.tryFuelBurst();
  h.state.tripleT = 15;
  assert.equal(h.game.collectPickup(h.state.track[0], 3, 'BOOST'), true);
  close(h.state.boostT, h.game.CONFIG.BOOST_DURATION);
  close(h.state.tripleT, 15);
  close(h.state.fuelBurstT, h.game.CONFIG.FUEL_BURST_DURATION);
  assert.equal(h.game.collectPickup(h.state.track[1], 3, 'MAGNET'), true);
  close(h.state.magnetT, h.game.CONFIG.MAGNET_DURATION);
  assert.equal(h.game.collectPickup(h.state.track[2], 3, 'SLOW'), true);
  close(h.game.currentCruiseSpeed(), 24 * h.game.CONFIG.SLOW_FACTOR);
  h.state.tripleT = 0;
  assert.equal(h.game.collectPickup(h.state.track[3], 3, 'TRIPLE'), true);
  close(h.state.tripleT, h.game.CONFIG.TRIPLE_DURATION);
});

test('late-game generation reserves real lane-change time as cruising speed rises', () => {
  const h = createHarness();
  for (const index of [0, 3000, 4000, 15000]) {
    const speed = h.sandbox.Skyroads.obstacles.nominalSpeed(index, {
      initialSpeed: 8, acceleration: 0.65, cruiseSoftCap: 36, cruiseTailAcceleration: 0.1,
    });
    assert.ok(h.game.reactionSegmentsAt(index) >= 8);
    assert.ok(h.game.reactionSegmentsAt(index) / speed >= 0.26);
  }
});

test('faster cruise preserves real low-wall glide and medium-wall double-jump corridors', () => {
  for (const speed of [25, 45]) {
    for (const hz of [20, 60, 120]) {
      for (const type of ['WALL_LOW', 'WALL_MEDIUM']) {
        // 20 Hz 下低墙上升越线约需 0.12 秒；避免过早起跳把滑翔余量浪费在墙前。
        const lead = type === 'WALL_LOW' ? 0.12 : 0.35;
        const start = 30;
        const h = createHarness({ position: start - speed * lead, speed });
        h.game.CONFIG.ACCEL = 0;
        const length = h.sandbox.Skyroads.obstacles.selectRunLength(type, speed, 0.999);
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
        assert.ok(h.state.position > start + length, `${type} at ${hz} Hz, speed ${speed}`);
        close(h.state.speed, speed);
        assert.equal(secondJump, type === 'WALL_MEDIUM');
      }
    }
  }
});

test('normal and late-game cruising leave enough time to land on floating islands and jump exit gaps', () => {
  for (const speed of [25, 45]) {
    for (const hz of [20, 60, 120]) {
      for (const cycle of [0, 1, 6]) {
        const start = 48 + cycle * 240;
        const lane = cycle % 2 === 0 ? 6 : 0;
        const h = createHarness({ position: start + 114 - speed * 0.07, lane, speed });
        h.game.CONFIG.ACCEL = 0;
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
            assert.equal(landed, true, `island ${cycle} at ${hz} Hz, speed ${speed}`);
            assert.equal(h.state.playerY, 0);
            h.game.tryJump();
            exitJump = true;
          }
          if (phase > 138 && h.state.playerY === 0) break;
        }
        assert.equal(exitJump, true);
        assert.deepEqual([...crossed], ['entry', 'exit']);
        // 高速跨出口后沿下坡继续飞行，真正保留的安全着陆区延伸至 landingEnd。
        assert.ok(h.state.position > start + 138 && h.state.position < start + h.terrain.TUNING.landingEnd,
          `landing phase ${h.state.position - start}, island ${cycle} at ${hz} Hz, speed ${speed}`);
        assert.ok(h.terrain.routeAt(h.state.position).safeLanes.includes(lane));
        assert.equal(h.state.track[Math.floor(h.state.position)].lanes[lane], 'ROAD');
        assert.equal(h.state.playerY, 0);
        assert.equal(h.state.jumpsUsed, 0);
        close(h.state.speed, speed);
      }
    }
  }
});

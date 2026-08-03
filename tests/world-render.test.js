'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function makeRecordingContext() {
  const gradient = { addColorStop() {} };
  const stateStack = [];
  let currentPath = [];
  const target = {
    events: [],
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    save() {
      stateStack.push({
        globalAlpha: this.globalAlpha,
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
      });
      this.events.push({ type: 'save' });
    },
    restore() {
      Object.assign(this, stateStack.pop() || {});
      this.events.push({ type: 'restore' });
    },
    beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push(['moveTo', x, y]); },
    lineTo(x, y) { currentPath.push(['lineTo', x, y]); },
    closePath() { currentPath.push(['closePath']); },
    arc(...args) { currentPath.push(['arc', ...args]); },
    ellipse(...args) { currentPath.push(['ellipse', ...args]); },
    fill() { this.events.push({ type: 'fill', style: this.fillStyle, path: currentPath.map((part) => [...part]) }); },
    stroke() { this.events.push({ type: 'stroke', style: this.strokeStyle, path: currentPath.map((part) => [...part]) }); },
    translate(x, y) { this.events.push({ type: 'translate', x, y }); },
    rotate(angle) { this.events.push({ type: 'rotate', angle }); },
    drawImage(image, ...args) {
      this.events.push({ type: 'drawImage', image: image && image.id, args, alpha: this.globalAlpha });
    },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
  };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      const noOp = () => {};
      object[property] = noOp;
      return noOp;
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  });
}

function createHarness({ loaded = true } = {}) {
  const context = makeRecordingContext();
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 960, innerHeight: 600, addEventListener() {} },
    document: { querySelector() { return null; }, addEventListener() {} },
    performance: { now() { return 0; } },
    requestAnimationFrame() {},
    __ctx: context,
  };
  vm.createContext(sandbox);
  for (const file of ['src/input.js', 'src/presentation.js', 'src/world-art.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(gameSource, sandbox, { filename: 'src/game.js' });
  const worldAssets = Object.keys(require('../src/world-art.js').WORLD_ATLAS_MANIFEST)
    .map((key) => `${JSON.stringify(key)}: { loaded: ${loaded}, element: { id: ${JSON.stringify(key)} } }`)
    .join(',');
  vm.runInContext(`
    STATE.width = 960;
    STATE.height = 600;
    STATE.position = 0;
    STATE.time = 1;
    STATE.reducedMotion = false;
    STATE.visualAssets = { assets: { world: { ${worldAssets} } } };
  `, sandbox);
  return { context, sandbox };
}

function drawEnemy(harness, enemy, { segIndex = 20, zNear = 500, zFar = 550, time = 1, reduced = false } = {}) {
  harness.context.events.length = 0;
  harness.sandbox.__enemy = enemy;
  vm.runInContext(`
    STATE.time = ${time};
    STATE.reducedMotion = ${reduced};
    drawEnemy(__ctx, __enemy, ${segIndex}, ${zNear}, ${zFar});
  `, harness.sandbox);
  return harness.context.events.map((event) => ({ ...event, path: event.path && event.path.map((part) => [...part]) }));
}

function imageCalls(events) {
  return events.filter((event) => event.type === 'drawImage');
}

function bottomCenter(call) {
  const [, , , , dx, dy, width, height] = call.args;
  return { x: dx + width / 2, y: dy + height };
}

test('loaded enemy atlases select yaw frames and preserve projected bottom-center geometry', () => {
  const harness = createHarness();
  const cases = [
    { lane: 2, expectedSourceX: 0 },
    { lane: 3, expectedSourceX: 3 * 512 },
    { lane: 4, expectedSourceX: 6 * 512 },
  ];
  for (const { lane, expectedSourceX } of cases) {
    const enemy = { type: 'drone', lane, fromLane: lane, toLane: lane, state: 'rest', phase: 0, visualVariant: 'droneScout' };
    const calls = imageCalls(drawEnemy(harness, enemy));
    assert.equal(calls.length, 1, `lane ${lane} should use one exact yaw frame`);
    assert.equal(calls[0].image, 'droneScout');
    assert.equal(calls[0].args[0], expectedSourceX);
    assert.deepEqual(calls[0].args.slice(1, 4), [0, 512, 512]);
    assert.ok(calls[0].args[6] >= 1);
    assert.ok(calls[0].args[7] >= 1);
  }

  const near = imageCalls(drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  }, { zNear: 300, zFar: 350 }))[0];
  const far = imageCalls(drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  }, { zNear: 900, zFar: 950 }))[0];
  assert.ok(near.args[6] > far.args[6]);
  assert.ok(near.args[7] > far.args[7]);
  assert.ok(bottomCenter(near).y > bottomCenter(far).y);
});

test('missing atlases call the named procedural fallbacks without drawing images', () => {
  const harness = createHarness({ loaded: false });
  const drone = drawEnemy(harness, {
    type: 'drone', lane: 3, fromLane: 3, toLane: 3, state: 'rest', phase: 0, visualVariant: 'droneScout',
  });
  const turret = drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  });
  assert.equal(imageCalls(drone).length, 0);
  assert.equal(imageCalls(turret).length, 0);
  assert.ok(drone.some((event) => event.type === 'fill'));
  assert.ok(turret.some((event) => event.type === 'fill'));
  assert.equal(vm.runInContext("typeof drawProceduralDrone + ':' + typeof drawProceduralTurret", harness.sandbox), 'function:function');
});

test('procedural enemies remain visible when the world-art module itself is unavailable', () => {
  const harness = createHarness();
  const events = JSON.parse(vm.runInContext(`(() => {
    const previous = Skyroads.worldArt;
    Skyroads.worldArt = null;
    __ctx.events.length = 0;
    try {
      drawEnemy(__ctx, {
        type: 'drone', lane: 3, fromLane: 3, toLane: 3, state: 'rest', phase: 0, visualVariant: 'droneScout',
      }, 20, 500, 550);
      return JSON.stringify(__ctx.events);
    } finally {
      Skyroads.worldArt = previous;
    }
  })()`, harness.sandbox));
  assert.equal(imageCalls(events).length, 0);
  assert.ok(events.some((event) => event.type === 'fill'));
});

test('warn drones bank toward movement and independently draw a target chevron and landing marker', () => {
  for (const [fromLane, toLane, sign] of [[2, 3, 1], [4, 3, -1]]) {
    const harness = createHarness();
    const enemy = {
      type: 'drone', lane: fromLane, fromLane, toLane, state: 'warn', phase: 0, visualVariant: 'droneScout',
    };
    const events = drawEnemy(harness, enemy);
    assert.equal(vm.runInContext('enemyLane(__enemy)', harness.sandbox), fromLane);
    const bank = events.find((event) => event.type === 'rotate');
    assert.equal(Math.sign(bank.angle), sign);

    const target = vm.runInContext(`project(laneCenterX(${toLane}), 0, 525)`, harness.sandbox);
    const marker = events.find((event) => event.type === 'stroke' && event.style === '#ff6b83'
      && event.path.some((part) => part[0] === 'ellipse' && Math.abs(part[1] - target.x) < 1e-6));
    assert.ok(marker, 'landing marker must be centered on the projected target lane');

    const chevron = events.find((event) => event.type === 'fill' && event.style === '#fff4f7');
    assert.ok(chevron, 'direction chevron must remain independent of atlas artwork');
    const xs = chevron.path.filter((part) => part.length >= 3).map((part) => part[1]);
    assert.equal(Math.sign(xs[0] - xs.slice(1).reduce((sum, value) => sum + value, 0) / (xs.length - 1)), sign);
  }
});

test('moving drone sprite follows enemyLane smoothstep while immutable visualVariant survives every state', () => {
  const harness = createHarness();
  const enemy = {
    type: 'drone', lane: 2, spawnLane: 2, fromLane: 2, toLane: 3,
    state: 'rest', phase: 0, moveT: 0, visualVariant: 'droneStriker',
  };
  const variant = enemy.visualVariant;
  for (const state of ['rest', 'warn', 'move', 'rest']) {
    enemy.state = state;
    if (state === 'move') enemy.moveT = 0.5;
    drawEnemy(harness, enemy);
    assert.equal(enemy.visualVariant, variant);
  }
  enemy.state = 'move';
  enemy.moveT = 0.5;
  const events = drawEnemy(harness, enemy);
  const call = imageCalls(events)[0];
  const anchor = events.find((event) => event.type === 'translate');
  const expected = vm.runInContext(`project(laneCenterX(enemyLane(__enemy)), 140 + Math.sin(1 * 2.2) * 40, 525)`, harness.sandbox);
  assert.ok(Math.abs(anchor.x - expected.x) < 1e-6);
  assert.equal(call.image, 'droneStriker');
});

test('reduced motion freezes atlas bob and warning pulse while retaining bank, chevron, and marker', () => {
  const harness = createHarness();
  const enemy = {
    type: 'drone', lane: 2, fromLane: 2, toLane: 3, state: 'warn', phase: 0.4, visualVariant: 'droneScout',
  };
  const first = drawEnemy(harness, enemy, { time: 1, reduced: true });
  const second = drawEnemy(harness, enemy, { time: 8, reduced: true });
  assert.deepEqual(first, second);
  for (const events of [first, second]) {
    assert.ok(events.some((event) => event.type === 'rotate' && event.angle > 0));
    assert.ok(events.some((event) => event.type === 'fill' && event.style === '#fff4f7'));
    assert.ok(events.some((event) => event.type === 'stroke' && event.style === '#ff6b83'));
  }
});

test('enemy creation assigns a deterministic variant once from segment and spawn lane', () => {
  const harness = createHarness();
  const created = vm.runInContext(`(() => {
    const previousRandom = Math.random;
    Math.random = () => 0;
    try {
      const lanes = Array(CONFIG.LANES).fill(LANE_TYPE.ROAD);
      return maybePlaceEnemy(lanes, {}, 91, 0, 0);
    } finally {
      Math.random = previousRandom;
    }
  })()`, harness.sandbox);
  assert.equal(created.spawnLane, created.lane);
  assert.equal(created.visualVariant, require('../src/world-art.js').variantKey('drone', 91, created.spawnLane));
  const stable = created.visualVariant;
  vm.runInContext(`
    __enemy = ${JSON.stringify(created)};
    __enemy.state = 'warn'; __enemy.toLane = __enemy.fromLane + 1;
    __enemy.state = 'move'; __enemy.moveT = 1;
    __enemy.fromLane = __enemy.toLane; __enemy.state = 'rest';
  `, harness.sandbox);
  assert.equal(vm.runInContext('__enemy.visualVariant', harness.sandbox), stable);
});

test('far-to-near enemy traversal preserves atlas depth order', () => {
  const harness = createHarness();
  harness.context.events.length = 0;
  vm.runInContext(`
    STATE.position = 0;
    STATE.track = Array.from({ length: CONFIG.RENDER_DISTANCE + 2 }, (_, index) => ({
      index,
      lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD),
    }));
    STATE.track[10].enemies = [{ type: 'drone', lane: 3, fromLane: 3, toLane: 3, state: 'rest', phase: 0, visualVariant: 'droneScout' }];
    STATE.track[20].enemies = [{ type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry' }];
    renderTrack(__ctx);
  `, harness.sandbox);
  assert.deepEqual(imageCalls(harness.context.events).map((call) => call.image), ['turretSentry', 'droneScout']);
});

test('atlas renderer clamps alpha, skips exact-yaw blends, restores state, and culls tiny/offscreen sprites', () => {
  const harness = createHarness();
  const result = vm.runInContext(`(() => {
    const exact = drawWorldAtlasSprite(__ctx, 'droneScout', {
      worldX: 0, zRel: 500, destination: { x: 100, y: 100, width: 20, height: 30 }, alpha: 4,
    });
    const blended = drawWorldAtlasSprite(__ctx, 'droneScout', {
      worldX: 100, zRel: 500, destination: { x: 140, y: 100, width: 20, height: 30 }, alpha: 0.8,
    });
    const tiny = drawWorldAtlasSprite(__ctx, 'droneScout', {
      worldX: 0, zRel: 500, destination: { x: 100, y: 100, width: 0.5, height: 30 }, alpha: 1,
    });
    const outside = drawWorldAtlasSprite(__ctx, 'droneScout', {
      worldX: 0, zRel: 500, destination: { x: 1000, y: 100, width: 20, height: 30 }, alpha: 1,
    });
    return { exact, blended, tiny, outside };
  })()`, harness.sandbox);
  assert.deepEqual({ ...result }, { exact: true, blended: true, tiny: true, outside: true });
  const calls = imageCalls(harness.context.events);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].alpha, 1);
  assert.equal(calls[2].args[0] - calls[1].args[0], 512);
  assert.ok(Math.abs(calls[1].alpha + calls[2].alpha - 0.8) < 1e-12);
  assert.equal(harness.context.globalAlpha, 1);
});

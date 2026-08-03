'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const worldArt = require('../src/world-art.js');

function makeRecordingContext() {
  const gradient = { addColorStop() {} };
  const stateStack = [];
  let currentPath = [];
  let currentTransform = [1, 0, 0, 1, 0, 0];
  let currentClip = null;
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
        transform: [...currentTransform],
        clip: currentClip && currentClip.map((part) => [...part]),
      });
      this.events.push({ type: 'save' });
    },
    restore() {
      const restored = stateStack.pop() || {};
      currentTransform = restored.transform || [1, 0, 0, 1, 0, 0];
      currentClip = restored.clip || null;
      delete restored.transform;
      delete restored.clip;
      Object.assign(this, restored);
      this.events.push({ type: 'restore' });
    },
    beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push(['moveTo', x, y]); },
    lineTo(x, y) { currentPath.push(['lineTo', x, y]); },
    closePath() { currentPath.push(['closePath']); },
    arc(...args) { currentPath.push(['arc', ...args]); },
    ellipse(...args) { currentPath.push(['ellipse', ...args]); },
    rect(...args) { currentPath.push(['rect', ...args]); },
    fill() { this.events.push({ type: 'fill', style: this.fillStyle, path: currentPath.map((part) => [...part]) }); },
    stroke() { this.events.push({ type: 'stroke', style: this.strokeStyle, path: currentPath.map((part) => [...part]) }); },
    clip() {
      currentClip = currentPath.map((part) => [...part]);
      this.events.push({ type: 'clip', path: currentClip.map((part) => [...part]) });
    },
    translate(x, y) {
      const [a, b, c, d, e, f] = currentTransform;
      currentTransform = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
      this.events.push({ type: 'translate', x, y });
    },
    rotate(angle) {
      const [a, b, c, d, e, f] = currentTransform;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      currentTransform = [
        a * cosine + c * sine,
        b * cosine + d * sine,
        -a * sine + c * cosine,
        -b * sine + d * cosine,
        e,
        f,
      ];
      this.events.push({ type: 'rotate', angle });
    },
    scale(x, y) {
      const [a, b, c, d, e, f] = currentTransform;
      currentTransform = [a * x, b * x, c * y, d * y, e, f];
      this.events.push({ type: 'scale', x, y });
    },
    drawImage(image, ...args) {
      this.events.push({
        type: 'drawImage',
        image: image && image.id,
        args,
        alpha: this.globalAlpha,
        transform: [...currentTransform],
        clip: currentClip && currentClip.map((part) => [...part]),
      });
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

function createHarness({ loaded = true, missing = [] } = {}) {
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
  for (const file of ['src/input.js', 'src/presentation.js', 'src/world-art.js', 'src/obstacles.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(gameSource, sandbox, { filename: 'src/game.js' });
  const worldAssets = Object.keys(require('../src/world-art.js').WORLD_ATLAS_MANIFEST)
    .map((key) => `${JSON.stringify(key)}: { loaded: ${loaded && !missing.includes(key)}, element: { id: ${JSON.stringify(key)} } }`)
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
  return harness.context.events.map((event) => ({
    ...event,
    path: event.path && event.path.map((part) => [...part]),
    transform: event.transform && [...event.transform],
    clip: event.clip && event.clip.map((part) => [...part]),
  }));
}

function drawWall(harness, category, {
  lane = 3, segIndex = 10, zNear = 500, zFar = 550,
} = {}) {
  harness.context.events.length = 0;
  const randomCalls = vm.runInContext(`(() => {
    const previousRandom = Math.random;
    let calls = 0;
    Math.random = () => { calls += 1; return 0.5; };
    try {
      ${category === 'wallLow' ? 'renderWallLow' : 'renderWallHigh'}(
        __ctx, ${lane}, ${segIndex}, ${zNear}, ${zFar}
      );
      return calls;
    } finally {
      Math.random = previousRandom;
    }
  })()`, harness.sandbox);
  return { events: harness.context.events.map((event) => ({ ...event })), randomCalls };
}

function renderGapFixture(harness, gapLanes, { segIndex = 10 } = {}) {
  harness.context.events.length = 0;
  harness.sandbox.__gapLanes = gapLanes;
  const expectedPaths = JSON.parse(vm.runInContext(`JSON.stringify(__gapLanes.map((lane) => {
    const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
    const halfRoad = CONFIG.ROAD_WIDTH / 2;
    const x0 = -halfRoad + lane * laneWidth;
    const x1 = x0 + laneWidth;
    const zNear = zRelOf(${segIndex});
    const zFar = zRelOf(${segIndex} + 1);
    const nearLeft = project(x0, 0, zNear);
    const nearRight = project(x1, 0, zNear);
    const farLeft = project(x0, 0, zFar);
    const farRight = project(x1, 0, zFar);
    return [
      ['moveTo', nearLeft.x, nearLeft.y],
      ['lineTo', nearRight.x, nearRight.y],
      ['lineTo', farRight.x, farRight.y],
      ['lineTo', farLeft.x, farLeft.y],
      ['closePath'],
    ];
  }))`, harness.sandbox));
  const randomCalls = vm.runInContext(`(() => {
    STATE.position = 0;
    STATE.track = Array.from({ length: CONFIG.RENDER_DISTANCE + 2 }, (_, index) => ({
      index,
      lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD),
    }));
    for (const lane of __gapLanes) STATE.track[${segIndex}].lanes[lane] = LANE_TYPE.GAP;
    const previousRandom = Math.random;
    let calls = 0;
    Math.random = () => { calls += 1; return 0.5; };
    try {
      renderTrack(__ctx);
      return calls;
    } finally {
      Math.random = previousRandom;
    }
  })()`, harness.sandbox);
  return {
    expectedPaths,
    events: harness.context.events.map((event) => ({
      ...event,
      path: event.path && event.path.map((part) => [...part]),
      transform: event.transform && [...event.transform],
      clip: event.clip && event.clip.map((part) => [...part]),
    })),
    randomCalls,
  };
}

function imageCalls(events) {
  return events.filter((event) => event.type === 'drawImage');
}

function bottomCenter(call) {
  const [, , , , dx, dy, width, height] = call.args;
  return { x: dx + width / 2, y: dy + height };
}

function sourceTuple(metadata, frameIndex) {
  const { sx, sy, sw, sh } = metadata.frames[frameIndex].source;
  return [sx, sy, sw, sh];
}

test('loaded enemy atlases use real center-pitch crops and preserve projected bottom-center geometry', () => {
  const harness = createHarness();
  const cases = [
    { lane: 2, frameIndices: [8, 9] },
    { lane: 3, frameIndices: [10] },
    { lane: 4, frameIndices: [11, 12] },
  ];
  const metadata = worldArt.WORLD_ATLAS_MANIFEST.droneScout;
  for (const { lane, frameIndices } of cases) {
    const enemy = { type: 'drone', lane, fromLane: lane, toLane: lane, state: 'rest', phase: 0, visualVariant: 'droneScout' };
    const calls = imageCalls(drawEnemy(harness, enemy));
    assert.equal(calls.length, frameIndices.length, `lane ${lane} bridge draw count`);
    assert.deepEqual(calls.map((call) => call.image), frameIndices.map(() => 'droneScout'));
    assert.deepEqual(calls.map((call) => call.args.slice(0, 4)),
      frameIndices.map((index) => sourceTuple(metadata, index)));
    assert.ok(Math.abs(calls.reduce((sum, call) => sum + call.alpha, 0) - 1) < 1e-12);
    for (const call of calls) {
      assert.ok(call.args[6] >= 1);
      assert.ok(call.args[7] >= 1);
      assert.deepEqual(bottomCenter(call), bottomCenter(calls[0]));
    }
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

test('turret barrels use the atlas visual mount while procedural fallback keeps collision height', () => {
  const enemy = { type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry' };
  const zNear = 300;
  for (const [loaded, expectedHeight] of [[true, 1120], [false, 1900]]) {
    const harness = createHarness({ loaded });
    const events = drawEnemy(harness, enemy, { zNear, zFar: 350 });
    const barrel = events.find((event) => event.type === 'stroke' && event.style === '#120a20');
    assert.ok(barrel, `${loaded ? 'atlas' : 'procedural'} turret must draw its barrel`);
    const expected = vm.runInContext(`project(0, ${expectedHeight}, ${zNear})`, harness.sandbox);
    const move = barrel.path.find((part) => part[0] === 'moveTo');
    assert.ok(Math.abs(move[1] - expected.x) < 1e-10);
    assert.ok(Math.abs(move[2] - expected.y) < 1e-10);
  }
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
  const metadata = worldArt.WORLD_ATLAS_MANIFEST.droneScout;
  assert.deepEqual(calls.map((call) => call.args.slice(0, 4)), [
    sourceTuple(metadata, 10),
    sourceTuple(metadata, 10),
    sourceTuple(metadata, 11),
  ]);
  assert.ok(Math.abs(calls[1].alpha + calls[2].alpha - 0.8) < 1e-12);
  assert.equal(harness.context.globalAlpha, 1);
});

test('loaded low and high wall variants use exact perspective geometry and real bridge crops', () => {
  const harness = createHarness();
  const cases = [
    ['wallLow', 2, 10, 'barrierCrate', [8, 9], 600],
    ['wallLow', 3, 10, 'barrierRail', [10], 600],
    ['wallLow', 4, 10, 'barrierCrate', [11, 12], 600],
    ['wallHigh', 2, 10, 'structureReactor', [8, 9], 2000],
    ['wallHigh', 3, 10, 'structureTower', [10], 2000],
    ['wallHigh', 4, 10, 'structureReactor', [11, 12], 2000],
  ];
  const zMid = 525;
  const scale = 0.05 / zMid;
  for (const [category, lane, segIndex, expectedImage, frameIndices, worldHeight] of cases) {
    const { events, randomCalls } = drawWall(harness, category, { lane, segIndex });
    const calls = imageCalls(events);
    const metadata = worldArt.WORLD_ATLAS_MANIFEST[expectedImage];
    assert.equal(calls.length, frameIndices.length, `${category} lane ${lane} bridge draw count`);
    assert.deepEqual(calls.map((call) => call.image), frameIndices.map(() => expectedImage));
    assert.deepEqual(calls.map((call) => call.args.slice(0, 4)),
      frameIndices.map((index) => sourceTuple(metadata, index)));
    assert.ok(Math.abs(calls.reduce((sum, call) => sum + call.alpha, 0) - 1) < 1e-12);
    for (const call of calls) {
      assert.ok(Math.abs(call.args[6] - scale * 648 * 960 / 2) < 1e-10);
      assert.ok(Math.abs(call.args[7] - scale * worldHeight * 600 / 2) < 1e-10);
    }
    const laneWorldX = (lane - 3) * 720;
    assert.ok(Math.abs(bottomCenter(calls[0]).x - (480 + scale * laneWorldX * 480)) < 1e-10);
    assert.ok(Math.abs(bottomCenter(calls[0]).y - (210 + scale * 2340 * 300)) < 1e-10);
    assert.equal(randomCalls, 0, 'render-time variant choice must not consume gameplay randomness');
  }

  const nearYaw = imageCalls(drawWall(harness, 'wallLow', {
    lane: 2, segIndex: 10, zNear: 500, zFar: 550,
  }).events).map((call) => call.args[0]);
  const farYaw = imageCalls(drawWall(harness, 'wallLow', {
    lane: 2, segIndex: 10, zNear: 4000, zFar: 4050,
  }).events).map((call) => call.args[0]);
  assert.notDeepEqual(farYaw, nearYaw, 'the same lane must select a shallower yaw as depth increases');
});

test('each unavailable wall variant falls back procedurally without substituting its sibling atlas', () => {
  const cases = [
    ['wallLow', 2, 10, 'barrierCrate'],
    ['wallLow', 3, 10, 'barrierRail'],
    ['wallHigh', 2, 10, 'structureReactor'],
    ['wallHigh', 3, 10, 'structureTower'],
  ];
  for (const [category, lane, segIndex, missing] of cases) {
    const harness = createHarness({ missing: [missing] });
    const { events } = drawWall(harness, category, { lane, segIndex });
    assert.equal(imageCalls(events).length, 0, `${missing} must not be replaced by its loaded sibling`);
    assert.ok(events.some((event) => event.type === 'fill'), `${missing} must retain a procedural fallback`);
  }
});

test('far-to-near wall traversal preserves atlas depth order', () => {
  const harness = createHarness();
  harness.context.events.length = 0;
  vm.runInContext(`
    STATE.position = 0;
    STATE.track = Array.from({ length: CONFIG.RENDER_DISTANCE + 2 }, (_, index) => ({
      index,
      lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD),
    }));
    STATE.track[10].lanes[3] = LANE_TYPE.WALL_LOW;
    STATE.track[20].lanes[3] = LANE_TYPE.WALL_HIGH;
    renderTrack(__ctx);
  `, harness.sandbox);
  assert.deepEqual(imageCalls(harness.context.events).map((call) => call.image), [
    require('../src/world-art.js').variantKey('wallHigh', 20, 3),
    require('../src/world-art.js').variantKey('wallLow', 10, 3),
  ]);
});

test('tessellated gap modules preserve authoritative one-lane, bridge, and full-width quadrilaterals', () => {
  for (const gapLanes of [[3], [0, 1, 2, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]]) {
    const harness = createHarness();
    const { expectedPaths, events, randomCalls } = renderGapFixture(harness, gapLanes);
    const voidPaths = events
      .filter((event) => event.type === 'fill' && event.style === '#05050d')
      .map((event) => event.path);
    assert.deepEqual(voidPaths, expectedPaths, 'decoration must not alter any projected opening corner');
    assert.ok(events.some((event) => event.type === 'stroke'
      && typeof event.style === 'string' && event.style.startsWith('rgba(100,220,255,')),
    'the abyss must expose a cyan perspective grid instead of the retired flat void');
    assert.ok(events.some((event) => event.type === 'stroke'
      && typeof event.style === 'string' && event.style.startsWith('rgba(204,92,255,')),
    'the abyss must retain a violet energy-depth accent');

    const calls = imageCalls(events).filter((call) => call.image === 'gapEdge');
    assert.ok(calls.length > 0, 'loaded gap atlas must decorate the projected boundaries');
    const allowedClips = new Set(expectedPaths.map((pathValue) => JSON.stringify(pathValue)));
    for (const call of calls) {
      assert.ok(allowedClips.has(JSON.stringify(call.clip)), 'each module must be clipped to its exact gap quadrilateral');
      assert.ok(call.args[6] <= 48 + 1e-9, 'no screen-space edge unit may exceed 48 CSS pixels');
      const [a, b, c, d, e, f] = call.transform;
      const dx = call.args[4];
      const bottomY = call.args[5] + call.args[7];
      for (const localX of [dx, dx + call.args[6]]) {
        const x = a * localX + c * bottomY + e;
        const y = b * localX + d * bottomY + f;
        assert.ok(x >= -1e-9 && x <= 960 + 1e-9);
        assert.ok(y >= -1e-9 && y <= 600 + 1e-9);
      }
    }
    assert.equal(randomCalls, 0, 'gap decoration must not consume gameplay randomness');
    assert.equal(harness.context.globalAlpha, 1);
  }
});

test('adjoining gap modules overlap by no more than one pixel and leave no boundary seams', () => {
  const harness = createHarness();
  const { events } = renderGapFixture(harness, [0, 1, 2, 3, 4, 5, 6], { segIndex: 0 });
  const unique = new Map();
  for (const call of imageCalls(events).filter((event) => event.image === 'gapEdge')) {
    const key = JSON.stringify([call.transform, call.args.slice(4)]);
    unique.set(key, call);
  }
  const groups = new Map();
  for (const call of unique.values()) {
    const [a, b, c, d, e, f] = call.transform;
    const leftX = a * call.args[4] + c * (call.args[5] + call.args[7]) + e;
    const leftY = b * call.args[4] + d * (call.args[5] + call.args[7]) + f;
    const rightX = a * (call.args[4] + call.args[6]) + c * (call.args[5] + call.args[7]) + e;
    const rightY = b * (call.args[4] + call.args[6]) + d * (call.args[5] + call.args[7]) + f;
    const width = Math.hypot(rightX - leftX, rightY - leftY);
    const tangent = [(rightX - leftX) / width, (rightY - leftY) / width];
    const midpoint = [(leftX + rightX) / 2, (leftY + rightY) / 2];
    const center = midpoint[0] * tangent[0] + midpoint[1] * tangent[1];
    const halfWidth = width / 2;
    const normalOffset = midpoint[0] * -tangent[1] + midpoint[1] * tangent[0];
    const groupKey = JSON.stringify([
      call.clip,
      Math.round(Math.atan2(b, a) * 1e8),
      Math.round(normalOffset * 1e8),
    ]);
    const intervals = groups.get(groupKey) || [];
    intervals.push([center - halfWidth, center + halfWidth]);
    groups.set(groupKey, intervals);
  }
  assert.ok(groups.size > 0);
  for (const [groupKey, intervals] of groups.entries()) {
    intervals.sort((left, right) => left[0] - right[0]);
    for (let index = 1; index < intervals.length; index++) {
      const overlap = intervals[index - 1][1] - intervals[index][0];
      assert.ok(overlap >= -1e-7, `gap edge seam of ${-overlap}px`);
      assert.ok(overlap <= 1 + 1e-7, `gap edge overlap of ${overlap}px in ${groupKey}: ${JSON.stringify(intervals)}`);
    }
  }
});

test('missing gap atlas retains the procedural warning edge without atlas substitution', () => {
  const harness = createHarness({ missing: ['gapEdge'] });
  const { events } = renderGapFixture(harness, [3]);
  assert.equal(imageCalls(events).filter((call) => call.image === 'gapEdge').length, 0);
  assert.ok(events.some((event) => event.type === 'stroke'
    && typeof event.style === 'string' && event.style.startsWith('rgba(255,60,70,')));
});

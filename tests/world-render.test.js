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
      ${{ wallLow: 'renderWallLow', wallMedium: 'renderWallMedium', wallHigh: 'renderWallHigh' }[category]}(
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

function setupCorridorFixture(harness, type, { lane = 3, start = 10, length = 5 } = {}) {
  vm.runInContext(`
    STATE.position = 0;
    STATE.track = Array.from({ length: CONFIG.RENDER_DISTANCE + 2 }, (_, index) => ({
      index,
      lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD),
    }));
    for (let index = ${start}; index < ${start + length}; index += 1) {
      STATE.track[index].lanes[${lane}] = LANE_TYPE.${type};
      STATE.track[index].corridor = {
        id: 'fixture-corridor', lane: ${lane}, type: LANE_TYPE.${type},
        index: 99 - index, length: 1,
      };
    }
  `, harness.sandbox);
}

function renderCorridorSnapshot(harness, { lane = 3, start = 10, length = 5 } = {}) {
  harness.context.events.length = 0;
  const descriptors = JSON.parse(vm.runInContext(`JSON.stringify(
    Array.from({ length: ${length} }, (_, offset) => liveCorridorDescriptor(
      STATE.track, ${start} + offset, ${lane}
    ))
  )`, harness.sandbox));
  const bodyDepths = JSON.parse(vm.runInContext(`(() => {
    const previous = Skyroads.worldArt;
    const depths = [];
    Skyroads.worldArt = {
      ...previous,
      buildSpriteDrawPlan(options) {
        if (options.metadata && String(options.metadata.category).startsWith('corridor')) {
          depths.push(options.zRel);
        }
        return previous.buildSpriteDrawPlan(options);
      },
    };
    try {
      renderTrack(__ctx);
      return JSON.stringify(depths);
    } finally {
      Skyroads.worldArt = previous;
    }
  })()`, harness.sandbox));
  return { descriptors, bodyDepths, events: harness.context.events.map((event) => ({ ...event })) };
}

function renderCorridorModuleFixture(harness, {
  type = 'WALL_LOW', lane = 3, start = 10, length = 2, index = start, mutation = '',
} = {}) {
  setupCorridorFixture(harness, type, { lane, start, length });
  if (mutation) vm.runInContext(mutation, harness.sandbox);
  harness.context.events.length = 0;
  const descriptor = JSON.parse(vm.runInContext(
    `JSON.stringify(liveCorridorDescriptor(STATE.track, ${index}, ${lane}))`,
    harness.sandbox,
  ));
  vm.runInContext(`renderWallModule(
    __ctx,
    STATE.track[${index}].lanes[${lane}],
    ${lane},
    ${index},
    zRelOf(${index}),
    zRelOf(${index} + 1)
  )`, harness.sandbox);
  return {
    descriptor,
    events: harness.context.events.map((event) => ({
      ...event,
      path: event.path && event.path.map((part) => [...part]),
      transform: event.transform && [...event.transform],
      clip: event.clip && event.clip.map((part) => [...part]),
    })),
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

test('loaded enemy atlases use final yaw-pitch crops anchored to their projected world origins', () => {
  const harness = createHarness();
  const cases = [
    { lane: 2, frameIndices: [8, 9, 15, 16] },
    { lane: 3, frameIndices: [10, 17] },
    { lane: 4, frameIndices: [11, 12, 18, 19] },
  ];
  const metadata = worldArt.WORLD_ATLAS_MANIFEST.droneScout;
  for (const { lane, frameIndices } of cases) {
    const enemy = { type: 'drone', lane, fromLane: lane, toLane: lane, state: 'rest', phase: 0, visualVariant: 'droneScout' };
    const calls = imageCalls(drawEnemy(harness, enemy));
    assert.equal(calls.length, frameIndices.length, `lane ${lane} final draw count`);
    assert.deepEqual(calls.map((call) => call.image), frameIndices.map(() => 'droneScout'));
    assert.deepEqual(calls.map((call) => call.args.slice(0, 4)),
      frameIndices.map((index) => sourceTuple(metadata, index)));
    assert.ok(Math.abs(calls.reduce((sum, call) => sum + call.alpha, 0) - 1) < 1e-12);
    const expectedOrigin = vm.runInContext(
      `project(laneCenterX(${lane}), Math.sin(1 * 2.2) * 40, 525)`,
      harness.sandbox,
    );
    for (const call of calls) {
      const frame = metadata.frames.find(({ source }) => (
        source.sx === call.args[0] && source.sy === call.args[1]
      ));
      const runtimeScaleX = vm.runInContext(
        `Math.abs(project(laneCenterX(${lane}) + 1, Math.sin(1 * 2.2) * 40, 525).x
          - project(laneCenterX(${lane}), Math.sin(1 * 2.2) * 40, 525).x)`,
        harness.sandbox,
      );
      const runtimeScaleY = vm.runInContext(
        `Math.abs(project(laneCenterX(${lane}), Math.sin(1 * 2.2) * 40 + 1, 525).y
          - project(laneCenterX(${lane}), Math.sin(1 * 2.2) * 40, 525).y)`,
        harness.sandbox,
      );
      const anchoredX = call.args[4]
        + (frame.origin.x - frame.source.sx) / metadata.pixelsPerWorldUnit * runtimeScaleX;
      const anchoredY = call.args[5]
        + (frame.origin.y - frame.source.sy) / metadata.pixelsPerWorldUnit * runtimeScaleY;
      assert.ok(Math.abs(anchoredX - expectedOrigin.x) < 1e-8);
      assert.ok(Math.abs(anchoredY - expectedOrigin.y) < 1e-8);
    }
  }

  const nearCalls = imageCalls(drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  }, { zNear: 300, zFar: 350 }));
  const farCalls = imageCalls(drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  }, { zNear: 900, zFar: 950 }));
  assert.deepEqual(nearCalls.map((call) => call.args.slice(0, 4)), [
    sourceTuple(worldArt.WORLD_ATLAS_MANIFEST.turretSentry, 10),
    sourceTuple(worldArt.WORLD_ATLAS_MANIFEST.turretSentry, 17),
  ]);
  assert.deepEqual(farCalls.map((call) => call.args.slice(0, 4)), [
    sourceTuple(worldArt.WORLD_ATLAS_MANIFEST.turretSentry, 10),
    sourceTuple(worldArt.WORLD_ATLAS_MANIFEST.turretSentry, 17),
  ]);
  const unionWidth = (calls) => Math.max(...calls.map((call) => call.args[4] + call.args[6]))
    - Math.min(...calls.map((call) => call.args[4]));
  const unionHeight = (calls) => Math.max(...calls.map((call) => call.args[5] + call.args[7]))
    - Math.min(...calls.map((call) => call.args[5]));
  assert.ok(unionWidth(nearCalls) > unionWidth(farCalls));
  assert.ok(unionHeight(nearCalls) > unionHeight(farCalls));
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

test('procedural enemies retain the 432-unit cue bounds when the world-art module itself is unavailable', () => {
  const harness = createHarness();
  const result = JSON.parse(vm.runInContext(`(() => {
    const previous = Skyroads.worldArt;
    const previousCues = drawDroneDirectionCues;
    let cueBounds = null;
    Skyroads.worldArt = null;
    drawDroneDirectionCues = (...args) => {
      cueBounds = args[4];
      return previousCues(...args);
    };
    __ctx.events.length = 0;
    try {
      drawEnemy(__ctx, {
        type: 'drone', lane: 2, fromLane: 2, toLane: 3, state: 'warn', phase: 0, visualVariant: 'droneScout',
      }, 20, 500, 550);
      return JSON.stringify({ events: __ctx.events, cueBounds });
    } finally {
      Skyroads.worldArt = previous;
      drawDroneDirectionCues = previousCues;
    }
  })()`, harness.sandbox));
  assert.equal(imageCalls(result.events).length, 0);
  assert.ok(result.events.some((event) => event.type === 'fill'));
  const expectedWidth = vm.runInContext(`(() => {
    const left = project(laneCenterX(2) - 216, 140, 525);
    const right = project(laneCenterX(2) + 216, 140, 525);
    return Math.abs(right.x - left.x);
  })()`, harness.sandbox);
  assert.ok(Math.abs(result.cueBounds.width - expectedWidth) < 1e-10);
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

test('moving drone atlas uses bob-only origin while keeping readable art and gameplay geometry', () => {
  const harness = createHarness();
  const enemy = {
    type: 'drone', lane: 2, spawnLane: 2, fromLane: 2, toLane: 3,
    state: 'move', phase: 0, moveT: 0.5, visualVariant: 'droneStriker',
  };
  harness.sandbox.__enemy = enemy;
  harness.context.events.length = 0;
  const captured = vm.runInContext(`(() => {
    STATE.width = 1280;
    STATE.height = 800;
    STATE.time = 1;
    const previous = Skyroads.worldArt;
    let options = null;
    let bounds = null;
    Skyroads.worldArt = {
      ...previous,
      buildSpriteDrawPlan(nextOptions) {
        const plan = previous.buildSpriteDrawPlan(nextOptions);
        options = nextOptions;
        bounds = plan && plan.bounds;
        return plan;
      },
    };
    try {
      drawEnemy(__ctx, __enemy, 20, 480, 530);
      return {
        objectY: options && options.objectY,
        projectedOrigin: options && options.projectedOrigin,
        bounds,
        lane: enemyLane(__enemy),
        droneHeight: CONFIG.DRONE_HEIGHT,
        hitboxHalfWidth: HITBOX.droneHalfWidth,
        warnTime: CONFIG.DRONE_WARN_TIME,
        moveTime: CONFIG.DRONE_MOVE_TIME,
      };
    } finally {
      Skyroads.worldArt = previous;
    }
  })()`, harness.sandbox);
  const events = harness.context.events;
  const call = imageCalls(events)[0];
  const anchor = events.find((event) => event.type === 'translate');
  const bob = Math.sin(2.2) * 40;
  const expected = vm.runInContext(`project(laneCenterX(enemyLane(__enemy)), ${bob}, 505)`, harness.sandbox);
  assert.ok(Math.abs(anchor.x - expected.x) < 1e-6);
  assert.ok(Math.abs(anchor.y - expected.y) < 1e-6);
  assert.ok(Math.abs(captured.objectY - bob) < 1e-10);
  assert.ok(Math.abs(captured.projectedOrigin.x - expected.x) < 1e-6);
  assert.ok(Math.abs(captured.projectedOrigin.y - expected.y) < 1e-6);
  assert.ok(captured.bounds.width >= 27, `near drone width ${captured.bounds.width}`);
  assert.equal(call.image, 'droneStriker');
  assert.equal(enemy.visualVariant, 'droneStriker');
  assert.deepEqual({
    lane: captured.lane,
    droneHeight: captured.droneHeight,
    hitboxHalfWidth: captured.hitboxHalfWidth,
    warnTime: captured.warnTime,
    moveTime: captured.moveTime,
  }, {
    lane: 2.5,
    droneHeight: 500,
    hitboxHalfWidth: 0.22,
    warnTime: 0.6,
    moveTime: 0.4,
  });
});

test('missing drone art keeps the 432-unit silhouette, bank, warning chevron, and landing marker', () => {
  const harness = createHarness({ missing: ['droneScout'] });
  vm.runInContext('STATE.width = 1280; STATE.height = 800', harness.sandbox);
  const base = {
    type: 'drone', lane: 2, fromLane: 2, toLane: 3, phase: 0,
    moveT: 0.5, visualVariant: 'droneScout',
  };
  const rest = drawEnemy(harness, { ...base, state: 'rest', toLane: 2 }, {
    zNear: 480, zFar: 530,
  });
  const silhouette = rest
    .filter((event) => event.type === 'fill' && event.path)
    .flatMap((event) => event.path)
    .filter((part) => part[0] === 'ellipse')
    .reduce((maximum, part) => Math.max(maximum, part[3] * 2), 0);
  assert.ok(silhouette >= 27, `procedural drone width ${silhouette}`);

  for (const state of ['warn', 'move']) {
    const events = drawEnemy(harness, { ...base, state }, { zNear: 480, zFar: 530 });
    assert.ok(events.some((event) => event.type === 'rotate' && event.angle > 0), `${state} bank`);
    if (state === 'warn') {
      assert.ok(events.some((event) => event.type === 'fill' && event.style === '#fff4f7'));
      assert.ok(events.some((event) => event.type === 'stroke' && event.style === '#ff6b83'));
    }
  }
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
  const orderedImages = imageCalls(harness.context.events).map((call) => call.image)
    .filter((image, index, images) => index === 0 || image !== images[index - 1]);
  assert.deepEqual(orderedImages, ['turretSentry', 'droneScout']);
});

test('upright atlas renderer expands exact, one-axis, and two-axis plans around one origin', () => {
  const harness = createHarness();
  const result = vm.runInContext(`(() => {
    const metadata = Skyroads.worldArt.WORLD_ATLAS_MANIFEST.droneScout;
    const centerY = (metadata.worldBounds.minY + metadata.worldBounds.maxY) / 2;
    const placement = (yaw, pitch) => ({
      worldX: Math.tan(yaw * Math.PI / 180) * 100,
      zRel: 100,
      objectY: CONFIG.CAMERA_HEIGHT - Math.tan(pitch * Math.PI / 180) * 100 - centerY,
      projectedOrigin: { x: 480, y: 300 },
      pixelsPerWorldUnitX: 0.2,
      pixelsPerWorldUnitY: 0.15,
      alpha: 0.8,
      rotation: 0,
    });
    __ctx.globalAlpha = 0.5;
    const plans = [
      drawWorldAtlasSprite(__ctx, 'droneScout', placement(0, 0)),
      drawWorldAtlasSprite(__ctx, 'droneScout', placement(42.5, 0)),
      drawWorldAtlasSprite(__ctx, 'droneScout', placement(0, 67.5)),
      drawWorldAtlasSprite(__ctx, 'droneScout', placement(42.5, 67.5)),
    ];
    return {
      lengths: plans.map((plan) => plan && plan.draws && plan.draws.length),
      draws: JSON.stringify(plans.map((plan) => plan && plan.draws)),
      alpha: __ctx.globalAlpha,
    };
  })()`, harness.sandbox);
  assert.deepEqual(Array.from(result.lengths), [1, 2, 2, 4]);
  assert.equal(result.alpha, 0.5);
  const calls = imageCalls(harness.context.events);
  assert.equal(calls.length, 9);
  const metadata = worldArt.WORLD_ATLAS_MANIFEST.droneScout;
  assert.deepEqual(calls.map((call) => call.args.slice(0, 4)), [
    sourceTuple(metadata, 3),
    sourceTuple(metadata, 4),
    sourceTuple(metadata, 5),
    sourceTuple(metadata, 10),
    sourceTuple(metadata, 17),
    sourceTuple(metadata, 11),
    sourceTuple(metadata, 12),
    sourceTuple(metadata, 18),
    sourceTuple(metadata, 19),
  ]);
  for (const [start, end] of [[0, 1], [1, 3], [3, 5], [5, 9]]) {
    assert.ok(Math.abs(calls.slice(start, end).reduce((sum, call) => sum + call.alpha, 0) - 0.4) < 1e-12);
  }
  const plannedDraws = JSON.parse(result.draws).flat();
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const draw = plannedDraws[index];
    assert.deepEqual(call.args.slice(0, 4), [draw.source.sx, draw.source.sy, draw.source.sw, draw.source.sh]);
    assert.deepEqual(call.args.slice(4), [
      draw.destination.x, draw.destination.y, draw.destination.width, draw.destination.height,
    ]);
    assert.ok(Math.abs(call.alpha - 0.5 * draw.alpha) < 1e-12);
    assert.ok(Math.abs(draw.alpha - 0.8 * draw.weight) < 1e-12);
  }
  for (const call of calls) {
    const frame = metadata.frames.find(({ source }) => (
      source.sx === call.args[0] && source.sy === call.args[1]
    ));
    const anchoredX = call.args[4]
      + (frame.origin.x - frame.source.sx) / metadata.pixelsPerWorldUnit * 0.2;
    const anchoredY = call.args[5]
      + (frame.origin.y - frame.source.sy) / metadata.pixelsPerWorldUnit * 0.15;
    assert.ok(Math.abs(anchoredX - 480) < 1e-9);
    assert.ok(Math.abs(anchoredY - 300) < 1e-9);
  }
});

test('atlas renderer returns culled plans and rotates conservative bounds with origin-relative draws', () => {
  const harness = createHarness();
  const result = vm.runInContext(`(() => {
    const previousWorldArt = Skyroads.worldArt;
    const source = Object.freeze({ sx: 0, sy: 0, sw: 20, sh: 200 });
    const makePlan = (bounds) => Object.freeze({
      bounds: Object.freeze(bounds),
      draws: Object.freeze([Object.freeze({
        source,
        destination: Object.freeze({ ...bounds }),
        alpha: 1,
        weight: 1,
      })]),
    });
    const plans = {
      tiny: makePlan({ x: 100, y: 100, width: 0.5, height: 20 }),
      outside: makePlan({ x: 1000, y: 100, width: 20, height: 20 }),
      rotated: makePlan({ x: 970, y: 290, width: 20, height: 200 }),
    };
    Skyroads.worldArt = {
      WORLD_ATLAS_MANIFEST: {
        tiny: { id: 'tiny' }, outside: { id: 'outside' }, rotated: { id: 'rotated' },
      },
      buildSpriteDrawPlan({ metadata }) { return plans[metadata.id]; },
    };
    for (const key of Object.keys(plans)) {
      STATE.visualAssets.assets.world[key] = { loaded: true, element: { id: key } };
    }
    try {
      const base = { projectedOrigin: { x: 960, y: 300 }, alpha: 1 };
      const tiny = drawWorldAtlasSprite(__ctx, 'tiny', base);
      const outside = drawWorldAtlasSprite(__ctx, 'outside', base);
      const rotated = drawWorldAtlasSprite(__ctx, 'rotated', { ...base, rotation: Math.PI / 2 });
      return {
        tiny: tiny === plans.tiny,
        outside: outside === plans.outside,
        rotated: rotated === plans.rotated,
      };
    } finally {
      Skyroads.worldArt = previousWorldArt;
    }
  })()`, harness.sandbox);
  assert.deepEqual({ ...result }, { tiny: true, outside: true, rotated: true });
  const calls = imageCalls(harness.context.events);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].image, 'rotated');
  assert.deepEqual(calls[0].args.slice(4), [10, -10, 20, 200]);
  assert.deepEqual(calls[0].transform.slice(4), [960, 300]);
  const translations = harness.context.events.filter((event) => event.type === 'translate');
  const rotations = harness.context.events.filter((event) => event.type === 'rotate');
  assert.deepEqual(translations, [{ type: 'translate', x: 960, y: 300 }]);
  assert.deepEqual(rotations, [{ type: 'rotate', angle: Math.PI / 2 }]);
});

test('loaded low, medium, and high wall variants use exact final plans and shared heights', () => {
  const harness = createHarness();
  const cases = [
    ['wallLow', 2, [8, 9, 15, 16], 600],
    ['wallLow', 3, [10, 17], 600],
    ['wallLow', 4, [11, 12, 18, 19], 600],
    ['wallMedium', 2, [8, 9, 15, 16], 1250],
    ['wallMedium', 3, [10, 17], 1250],
    ['wallMedium', 4, [11, 12, 18, 19], 1250],
    ['wallHigh', 2, [8, 9, 15, 16], 2000],
    ['wallHigh', 3, [10, 17], 2000],
    ['wallHigh', 4, [11, 12, 18, 19], 2000],
  ];
  const zMid = 525;
  const segIndex = 10;
  for (const [category, lane, frameIndices, worldHeight] of cases) {
    const { events, randomCalls } = drawWall(harness, category, { lane, segIndex });
    const calls = imageCalls(events);
    const expectedImage = worldArt.variantKey(category, segIndex, lane);
    const metadata = worldArt.WORLD_ATLAS_MANIFEST[expectedImage];
    assert.equal(calls.length, frameIndices.length, `${category} lane ${lane} final draw count`);
    assert.deepEqual(calls.map((call) => call.image), frameIndices.map(() => expectedImage));
    assert.deepEqual(calls.map((call) => call.args.slice(0, 4)),
      frameIndices.map((index) => sourceTuple(metadata, index)));
    assert.ok(Math.abs(calls.reduce((sum, call) => sum + call.alpha, 0) - 1) < 1e-12);
    assert.equal(metadata.worldBounds.maxY - metadata.worldBounds.minY, worldHeight);
    const worldX = (lane - 3) * 720;
    const origin = vm.runInContext(`project(${worldX}, 0, ${zMid})`, harness.sandbox);
    const runtimeScaleX = vm.runInContext(
      `Math.abs(project(${worldX + 1}, 0, ${zMid}).x - project(${worldX}, 0, ${zMid}).x)`,
      harness.sandbox,
    );
    const runtimeScaleY = vm.runInContext(
      `Math.abs(project(${worldX}, 1, ${zMid}).y - project(${worldX}, 0, ${zMid}).y)`,
      harness.sandbox,
    );
    for (const call of calls) {
      const frame = metadata.frames.find(({ source }) => (
        source.sx === call.args[0] && source.sy === call.args[1]
      ));
      const anchoredX = call.args[4]
        + (frame.origin.x - frame.source.sx) / metadata.pixelsPerWorldUnit * runtimeScaleX;
      const anchoredY = call.args[5]
        + (frame.origin.y - frame.source.sy) / metadata.pixelsPerWorldUnit * runtimeScaleY;
      assert.ok(Math.abs(anchoredX - origin.x) < 1e-8);
      assert.ok(Math.abs(anchoredY - origin.y) < 1e-8);
    }
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

test('outer-lane high structures use symmetric wide yaw columns across both pitch rows', () => {
  const harness = createHarness();
  const leftCalls = imageCalls(drawWall(harness, 'wallHigh', {
    lane: 0, segIndex: 10, zNear: 480, zFar: 530,
  }).events);
  const rightCalls = imageCalls(drawWall(harness, 'wallHigh', {
    lane: 6, segIndex: 10, zNear: 480, zFar: 530,
  }).events);
  const leftMetadata = worldArt.WORLD_ATLAS_MANIFEST[leftCalls[0].image];
  const rightMetadata = worldArt.WORLD_ATLAS_MANIFEST[rightCalls[0].image];
  assert.deepEqual(leftCalls.map((call) => call.args.slice(0, 4)), [7, 8, 14, 15]
    .map((index) => sourceTuple(leftMetadata, index)));
  assert.deepEqual(rightCalls.map((call) => call.args.slice(0, 4)), [12, 13, 19, 20]
    .map((index) => sourceTuple(rightMetadata, index)));
  for (let row = 0; row < 2; row += 1) {
    const leftWeights = leftCalls.slice(row * 2, row * 2 + 2).map((call) => call.alpha);
    const rightWeights = rightCalls.slice(row * 2, row * 2 + 2).map((call) => call.alpha);
    assert.ok(Math.abs(leftWeights[0] - rightWeights[1]) < 1e-12);
    assert.ok(Math.abs(leftWeights[1] - rightWeights[0]) < 1e-12);
  }
});

test('each unavailable wall variant falls back procedurally without substituting its sibling atlas', () => {
  const cases = [
    ['wallLow', 2, 10, 'barrierCrate'],
    ['wallLow', 3, 10, 'barrierRail'],
    ['wallMedium', 2, 10, 'structurePylon'],
    ['wallMedium', 3, 10, 'structureBastion'],
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

test('procedural wall tiers match the 648-unit atlas base envelope', () => {
  const cases = [
    ['wallLow', 'barrierRail'],
    ['wallMedium', 'structureBastion'],
    ['wallHigh', 'structureTower'],
  ];
  for (const [category, missing] of cases) {
    const harness = createHarness({ missing: [missing] });
    const { events } = drawWall(harness, category, { lane: 3, segIndex: 10, zNear: 500, zFar: 550 });
    const expected = JSON.parse(vm.runInContext(`JSON.stringify({
      left: project(laneCenterX(3) - 324, 0, 500),
      right: project(laneCenterX(3) + 324, 0, 500),
    })`, harness.sandbox));
    const baseXs = events
      .filter((event) => event.type === 'fill' && event.path)
      .flatMap((event) => event.path)
      .filter((part) => (part[0] === 'moveTo' || part[0] === 'lineTo')
        && Math.abs(part[2] - expected.left.y) < 1e-8)
      .map((part) => part[1]);
    assert.ok(baseXs.length > 0, `${category} near base points`);
    assert.ok(Math.abs(Math.min(...baseXs) - expected.left.x) < 1e-8, `${category} left envelope`);
    assert.ok(Math.abs(Math.max(...baseXs) - expected.right.x) < 1e-8, `${category} right envelope`);
  }
});

test('procedural wall tiers use shared heights and the one-two-two signal hierarchy', () => {
  const cases = [
    ['wallLow', 'barrierRail', 600, 1, false],
    ['wallMedium', 'structureBastion', 1250, 2, false],
    ['wallHigh', 'structureTower', 2000, 2, true],
  ];
  for (const [category, missing, height, signalCount, goldBeacon] of cases) {
    const harness = createHarness({ missing: [missing] });
    const { events } = drawWall(harness, category, { lane: 3, segIndex: 10, zNear: 500, zFar: 550 });
    const expectedTopY = vm.runInContext(`project(laneCenterX(3), ${height}, 500).y`, harness.sandbox);
    const projectedYs = events
      .filter((event) => event.type === 'fill' && event.path)
      .flatMap((event) => event.path.filter((part) => part.length >= 3).map((part) => part[2]));
    assert.ok(projectedYs.some((value) => Math.abs(value - expectedTopY) < 1e-8), `${category} height`);
    const signals = events
      .filter((event) => event.type === 'stroke' && event.style === '#64dcff')
      .flatMap((event) => event.path)
      .filter((part) => part[0] === 'moveTo');
    assert.equal(signals.length, signalCount, `${category} cyan signal count`);
    assert.equal(events.some((event) => event.type === 'fill' && event.style === '#f4c95d'), goldBeacon);
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
  const orderedImages = imageCalls(harness.context.events).map((call) => call.image)
    .filter((image, index, images) => index === 0 || image !== images[index - 1]);
  assert.deepEqual(orderedImages, [
    require('../src/world-art.js').variantKey('wallHigh', 20, 3),
    require('../src/world-art.js').variantKey('wallLow', 10, 3),
  ]);
});

test('loaded start corridor clips its atlas before drawing and restores the clip scope', () => {
  const harness = createHarness();
  const fixture = renderCorridorModuleFixture(harness);
  assert.equal(fixture.descriptor.phase, 'start');
  const calls = imageCalls(fixture.events).filter((event) => event.image === 'corridorLow');
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.clip), 'every atlas layer must use the live corridor clip');
  const clipIndex = fixture.events.findIndex((event) => event.type === 'clip');
  const firstDrawIndex = fixture.events.findIndex((event) => event.type === 'drawImage');
  assert.ok(clipIndex >= 0 && clipIndex < firstDrawIndex, 'clip must precede atlas drawing');

  vm.runInContext("__ctx.drawImage({ id: 'clipProbe' }, 0, 0, 1, 1, 0, 0, 1, 1)", harness.sandbox);
  const probe = harness.context.events.at(-1);
  assert.equal(probe.image, 'clipProbe');
  assert.equal(probe.clip, null, 'atlas clip must not leak past restore');

  const fallbackHarness = createHarness({ missing: ['corridorMedium'] });
  const fallback = renderCorridorModuleFixture(fallbackHarness, {
    type: 'WALL_MEDIUM', length: 1,
  });
  assert.equal(imageCalls(fallback.events).length, 0);
  assert.ok(fallback.events.some((event) => event.type === 'fill'));
  assert.equal(fallback.events.filter((event) => event.type === 'clip').length, 0,
    'procedural fallback must not depend on an atlas clip');
});

test('loaded corridor atlases clip start middle end single and mismatched modules to live prism depths', () => {
  const epsilon = 1e-8;
  const verticesOf = (path) => path
    .filter((part) => part[0] === 'moveTo' || part[0] === 'lineTo')
    .map((part) => ({ x: part[1], y: part[2] }));
  const includesPoint = (vertices, expected) => vertices.some((point) => (
    Math.abs(point.x - expected.x) < epsilon && Math.abs(point.y - expected.y) < epsilon
  ));
  const projectedFace = (harness, height, zExpression) => JSON.parse(vm.runInContext(
    `JSON.stringify({
      bottomLeft: project(laneCenterX(3) - 324, 0, ${zExpression}),
      bottomRight: project(laneCenterX(3) + 324, 0, ${zExpression}),
      topLeft: project(laneCenterX(3) - 324, ${height}, ${zExpression}),
      topRight: project(laneCenterX(3) + 324, ${height}, ${zExpression})
    })`,
    harness.sandbox,
  ));
  const assertConvex = (vertices, label) => {
    assert.ok(vertices.length >= 3, `${label} polygon vertex count`);
    const turns = vertices.map((point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      const after = vertices[(index + 2) % vertices.length];
      return (next.x - point.x) * (after.y - next.y)
        - (next.y - point.y) * (after.x - next.x);
    }).filter((turn) => Math.abs(turn) > 1e-10);
    assert.ok(turns.length > 0, `${label} polygon must have area`);
    assert.ok(turns.every((turn) => Math.sign(turn) === Math.sign(turns[0])),
      `${label} polygon must be convex`);
  };
  const cases = [
    {
      label: 'start', length: 3, index: 10, phase: 'start',
      near: 'zRelOf(10) + 6', far: 'zRelOf(11)', excludedNear: 'zRelOf(10)',
    },
    {
      label: 'middle', length: 3, index: 11, phase: 'middle',
      near: 'zRelOf(11)', far: 'zRelOf(12)',
    },
    {
      label: 'end', length: 3, index: 12, phase: 'end',
      near: 'zRelOf(12)', far: 'zRelOf(13) - 6', excludedFar: 'zRelOf(13)',
    },
    {
      label: 'single', length: 1, index: 10, phase: 'single',
      near: 'zRelOf(10) + 6', far: 'zRelOf(11) - 6',
      excludedNear: 'zRelOf(10)', excludedFar: 'zRelOf(11)',
    },
    {
      label: 'id mismatch', length: 2, index: 10, phase: 'single',
      mutation: "STATE.track[11].corridor.id = 'different'",
      near: 'zRelOf(10) + 6', far: 'zRelOf(11) - 6',
      excludedNear: 'zRelOf(10)', excludedFar: 'zRelOf(11)',
    },
  ];

  for (const [type, category, height] of [
    ['WALL_LOW', 'corridorLow', 600],
    ['WALL_MEDIUM', 'corridorMedium', 1250],
  ]) {
    for (const fixtureCase of cases) {
      const harness = createHarness();
      const fixture = renderCorridorModuleFixture(harness, {
        type,
        length: fixtureCase.length,
        index: fixtureCase.index,
        mutation: fixtureCase.mutation,
      });
      const label = `${category} ${fixtureCase.label}`;
      assert.equal(fixture.descriptor.phase, fixtureCase.phase, `${label} phase`);
      const calls = imageCalls(fixture.events).filter((event) => event.image === category);
      assert.ok(calls.length > 0, `${label} atlas draw count`);
      assert.ok(calls.every((call) => call.clip), `${label} atlas layers must all be clipped`);
      for (const call of calls.slice(1)) assert.deepEqual(call.clip, calls[0].clip, `${label} clip stability`);

      const vertices = verticesOf(calls[0].clip);
      assertConvex(vertices, label);
      const nearFace = projectedFace(harness, height, fixtureCase.near);
      for (const [name, point] of Object.entries(nearFace)) {
        assert.ok(includesPoint(vertices, point), `${label} expected near ${name}`);
      }
      const farFace = projectedFace(harness, height, fixtureCase.far);
      for (const name of ['topLeft', 'topRight']) {
        assert.ok(includesPoint(vertices, farFace[name]), `${label} expected far ${name}`);
      }

      if (fixtureCase.excludedNear) {
        const excluded = projectedFace(harness, height, fixtureCase.excludedNear);
        assert.ok(Object.values(excluded).every((point) => !includesPoint(vertices, point)),
          `${label} must stop after its open near boundary`);
      }
      if (fixtureCase.excludedFar) {
        const excluded = projectedFace(harness, height, fixtureCase.excludedFar);
        assert.ok(!includesPoint(vertices, excluded.topLeft)
          && !includesPoint(vertices, excluded.topRight),
        `${label} must stop before its open far boundary`);
      }
    }
  }
});

test('live low and medium corridors split immediately after destruction in atlas and fallback paths', () => {
  const expectedInitial = (category, height) => [
    { phase: 'start', category, height, connectBefore: false, connectAfter: true },
    { phase: 'middle', category, height, connectBefore: true, connectAfter: true },
    { phase: 'middle', category, height, connectBefore: true, connectAfter: true },
    { phase: 'middle', category, height, connectBefore: true, connectAfter: true },
    { phase: 'end', category, height, connectBefore: true, connectAfter: false },
  ];
  const eventCount = (events, type, style) => events
    .filter((event) => event.type === type && event.style === style)
    .reduce((count, event) => count + (
      type === 'stroke' ? event.path.filter((part) => part[0] === 'moveTo').length : 1
    ), 0);

  for (const [type, category, height] of [
    ['WALL_LOW', 'corridorLow', 600],
    ['WALL_MEDIUM', 'corridorMedium', 1250],
  ]) {
    for (const loaded of [true, false]) {
      const harness = createHarness({ missing: loaded ? [] : [category] });
      setupCorridorFixture(harness, type);
      const initial = renderCorridorSnapshot(harness);
      assert.deepEqual(initial.descriptors, expectedInitial(category, height));
      assert.equal(eventCount(initial.events, 'stroke', '#3de6ff'), 8);
      assert.equal(eventCount(initial.events, 'stroke', '#b8f7ff'), 2);
      assert.equal(eventCount(initial.events, 'fill', '#54e7ff'), 1);
      const initialImages = imageCalls(initial.events);
      if (loaded) {
        assert.ok(initialImages.length > 0);
        assert.deepEqual(new Set(initialImages.map((call) => call.image)), new Set([category]));
        assert.equal(initial.bodyDepths.length, 5);
      } else {
        assert.equal(initialImages.length, 0, 'missing corridor art must not borrow a wall atlas');
      }

      vm.runInContext('STATE.track[12].lanes[3] = LANE_TYPE.ROAD', harness.sandbox);
      const split = renderCorridorSnapshot(harness);
      assert.deepEqual(split.descriptors, [
        { phase: 'start', category, height, connectBefore: false, connectAfter: true },
        { phase: 'end', category, height, connectBefore: true, connectAfter: false },
        null,
        { phase: 'start', category, height, connectBefore: false, connectAfter: true },
        { phase: 'end', category, height, connectBefore: true, connectAfter: false },
      ]);
      assert.equal(eventCount(split.events, 'stroke', '#3de6ff'), 4);
      assert.equal(eventCount(split.events, 'stroke', '#b8f7ff'), 4);
      assert.equal(eventCount(split.events, 'fill', '#54e7ff'), 2);
      const destroyedDepth = vm.runInContext('(zRelOf(12) + zRelOf(13)) / 2', harness.sandbox);
      if (loaded) {
        assert.equal(split.bodyDepths.length, 4, 'destroyed center must have no atlas body');
        assert.equal(split.bodyDepths.some((depth) => Math.abs(depth - destroyedDepth) < 1e-10), false);
      } else {
        const bodySignals = eventCount(split.events, 'stroke', '#64dcff');
        assert.equal(bodySignals, (height === 600 ? 1 : 2) * 4,
          'destroyed center must have no procedural body');
      }
      const connectorTargets = split.events
        .filter((event) => event.type === 'stroke' && event.style === '#3de6ff')
        .flatMap((event) => event.path)
        .filter((part) => part[0] === 'lineTo')
        .map((part) => [part[1], part[2]]);
      const beforeHole = vm.runInContext(
        `project(laneCenterX(3), ${height * 0.16}, zRelOf(11))`,
        harness.sandbox,
      );
      const afterHole = vm.runInContext(
        `project(laneCenterX(3), ${height * 0.16}, zRelOf(14))`,
        harness.sandbox,
      );
      const roundedTargets = connectorTargets.map(([x, y]) => [x.toFixed(8), y.toFixed(8)]).sort();
      assert.deepEqual(roundedTargets, [
        [beforeHole.x.toFixed(8), beforeHole.y.toFixed(8)],
        [beforeHole.x.toFixed(8), beforeHole.y.toFixed(8)],
        [afterHole.x.toFixed(8), afterHole.y.toFixed(8)],
        [afterHole.x.toFixed(8), afterHole.y.toFixed(8)],
      ].sort(), 'connectors must turn away from both destroyed-tile boundaries');

      vm.runInContext('STATE.track[11].lanes[3] = LANE_TYPE.ROAD', harness.sandbox);
      const isolated = renderCorridorSnapshot(harness);
      assert.deepEqual(isolated.descriptors[0], {
        phase: 'single', category, height, connectBefore: false, connectAfter: false,
      });
      assert.equal(eventCount(isolated.events, 'stroke', '#3de6ff'), 2);
      assert.equal(eventCount(isolated.events, 'stroke', '#b8f7ff'), 4);
      assert.equal(eventCount(isolated.events, 'fill', '#54e7ff'), 2);
    }
  }
});

test('corridor connectivity rejects different ids, lane records, and wall types', () => {
  const harness = createHarness();
  setupCorridorFixture(harness, 'WALL_LOW', { length: 2 });
  const phases = vm.runInContext(`(() => {
    const current = STATE.track[10].corridor;
    const neighbor = STATE.track[11];
    neighbor.corridor.id = 'different';
    const differentId = liveCorridorDescriptor(STATE.track, 10, 3).phase;
    neighbor.corridor.id = current.id;
    neighbor.corridor.lane = 4;
    const differentLane = liveCorridorDescriptor(STATE.track, 10, 3).phase;
    neighbor.corridor.lane = 3;
    neighbor.corridor.type = LANE_TYPE.WALL_MEDIUM;
    neighbor.lanes[3] = LANE_TYPE.WALL_MEDIUM;
    const differentType = liveCorridorDescriptor(STATE.track, 10, 3).phase;
    return { differentId, differentLane, differentType };
  })()`, harness.sandbox);
  assert.deepEqual({ ...phases }, {
    differentId: 'single', differentLane: 'single', differentType: 'single',
  });
});

test('corridor plinths stop before split holes and id lane or type mismatches', () => {
  function plinthPoints(events) {
    return events
      .filter((event) => event.type === 'fill' && event.style === '#101b2a')
      .flatMap((event) => event.path)
      .filter((part) => part[0] === 'moveTo' || part[0] === 'lineTo')
      .map((part) => ({ x: part[1], y: part[2] }));
  }

  function projectedEdge(harness, zExpression) {
    return JSON.parse(vm.runInContext(`JSON.stringify([
      project(laneCenterX(3) - 324, 20, ${zExpression}),
      project(laneCenterX(3) + 324, 20, ${zExpression}),
    ])`, harness.sandbox));
  }

  function pointCountAt(points, edge) {
    return points.filter((point) => edge.some((expected) => (
      Math.abs(point.x - expected.x) < 1e-8 && Math.abs(point.y - expected.y) < 1e-8
    ))).length;
  }

  const splitHarness = createHarness();
  setupCorridorFixture(splitHarness, 'WALL_LOW');
  vm.runInContext('STATE.track[12].lanes[3] = LANE_TYPE.ROAD', splitHarness.sandbox);
  const splitPoints = plinthPoints(renderCorridorSnapshot(splitHarness).events);
  for (const holeBoundary of ['zRelOf(12)', 'zRelOf(13)']) {
    assert.equal(pointCountAt(splitPoints, projectedEdge(splitHarness, holeBoundary)), 0,
      `split plinth must not reach ${holeBoundary}`);
  }
  assert.equal(pointCountAt(splitPoints, projectedEdge(splitHarness, 'zRelOf(12) - 6')), 2);
  assert.equal(pointCountAt(splitPoints, projectedEdge(splitHarness, 'zRelOf(13) + 6')), 2);
  for (const connectedBoundary of ['zRelOf(11)', 'zRelOf(14)']) {
    assert.equal(pointCountAt(splitPoints, projectedEdge(splitHarness, connectedBoundary)), 4,
      `connected plinths must meet exactly at ${connectedBoundary}`);
  }

  for (const [label, mutation] of [
    ['id', "STATE.track[11].corridor.id = 'different'"],
    ['lane', 'STATE.track[11].corridor.lane = 4'],
    ['type', `
      STATE.track[11].corridor.type = LANE_TYPE.WALL_MEDIUM;
      STATE.track[11].lanes[3] = LANE_TYPE.WALL_MEDIUM;
    `],
  ]) {
    const harness = createHarness();
    setupCorridorFixture(harness, 'WALL_LOW', { length: 2 });
    vm.runInContext(mutation, harness.sandbox);
    const points = plinthPoints(renderCorridorSnapshot(harness, { length: 2 }).events);
    assert.equal(pointCountAt(points, projectedEdge(harness, 'zRelOf(11)')), 0,
      `${label} mismatch must not share a plinth boundary`);
    assert.equal(pointCountAt(points, projectedEdge(harness, 'zRelOf(11) - 6')), 2,
      `${label} mismatch must terminate the nearer plinth six world units early`);
  }
});

test('gap edge rendering uses only the validated center road frame and never builds an upright plan', () => {
  const harness = createHarness();
  vm.runInContext(`
    globalThis.__previousGapWorldArt = Skyroads.worldArt;
    globalThis.__roadEdgeFrameCalls = 0;
    Skyroads.worldArt = {
      ...globalThis.__previousGapWorldArt,
      buildSpriteDrawPlan() { throw new Error('gap entered upright plan builder'); },
      roadEdgeFrame(metadata) {
        globalThis.__roadEdgeFrameCalls += 1;
        return globalThis.__previousGapWorldArt.roadEdgeFrame(metadata);
      },
    };
  `, harness.sandbox);
  let fixture;
  try {
    fixture = renderGapFixture(harness, [3]);
  } finally {
    vm.runInContext('Skyroads.worldArt = globalThis.__previousGapWorldArt', harness.sandbox);
  }
  assert.equal(vm.runInContext('globalThis.__roadEdgeFrameCalls', harness.sandbox), 1);
  const calls = imageCalls(fixture.events).filter((call) => call.image === 'gapEdge');
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 4), [1536, 0, 512, 512]);
    assert.ok(call.args[6] <= 48 + 1e-9);
    assert.ok(call.clip);
  }

  vm.runInContext(`
    globalThis.__previousGapWorldArt = Skyroads.worldArt;
    Skyroads.worldArt = {
      ...globalThis.__previousGapWorldArt,
      buildSpriteDrawPlan() { throw new Error('invalid gap entered upright plan builder'); },
      roadEdgeFrame() { return null; },
    };
  `, harness.sandbox);
  let invalid;
  try {
    invalid = renderGapFixture(harness, [3]);
  } finally {
    vm.runInContext('Skyroads.worldArt = globalThis.__previousGapWorldArt', harness.sandbox);
  }
  assert.equal(imageCalls(invalid.events).filter((call) => call.image === 'gapEdge').length, 0);
  assert.ok(invalid.events.some((event) => event.type === 'stroke'
    && typeof event.style === 'string' && event.style.startsWith('rgba(255,60,70,')));
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

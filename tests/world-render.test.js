'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const worldArt = require('../src/world-art.js');

function makeRecordingContext() {
  const stateStack = [];
  let currentPath = [];
  let currentTransform = [1, 0, 0, 1, 0, 0];
  let currentClip = null;
  function gradient(kind, args) {
    const stops = [];
    return {
      kind,
      args,
      stops,
      addColorStop(offset, color) { stops.push([offset, color]); },
    };
  }
  function recordedStyle(style) {
    if (!style || typeof style !== 'object') return style;
    return {
      kind: style.kind,
      args: [...style.args],
      stops: style.stops.map((stop) => [...stop]),
    };
  }
  const target = {
    events: [],
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    save() {
      stateStack.push({
        globalAlpha: this.globalAlpha,
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
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
    quadraticCurveTo(...args) { currentPath.push(['quadraticCurveTo', ...args]); },
    rect(...args) { currentPath.push(['rect', ...args]); },
    fill() {
      this.events.push({
        type: 'fill',
        style: recordedStyle(this.fillStyle),
        path: currentPath.map((part) => [...part]),
        clip: currentClip && currentClip.map((part) => [...part]),
      });
    },
    stroke() {
      this.events.push({
        type: 'stroke',
        style: recordedStyle(this.strokeStyle),
        path: currentPath.map((part) => [...part]),
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
        clip: currentClip && currentClip.map((part) => [...part]),
      });
    },
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
    createLinearGradient(...args) { return gradient('linear', args); },
    createRadialGradient(...args) { return gradient('radial', args); },
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

function createHarness({ loaded = true, missing = [], droneVisual = true } = {}) {
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
  for (const file of [
    'src/input.js',
    'src/presentation.js',
    'src/world-art.js',
    'src/scene-style.js',
    ...(droneVisual ? ['src/drone-visual.js'] : []),
    'src/obstacles.js',
    'src/gap-regions.js',
  ]) {
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

function renderGapRows(harness, rows, {
  position = 0,
  time = 1,
  reduced = false,
} = {}) {
  harness.context.events.length = 0;
  harness.sandbox.__gapRows = rows;
  const randomCalls = vm.runInContext(`(() => {
    STATE.position = ${position};
    STATE.time = ${time};
    STATE.reducedMotion = ${reduced};
    STATE.track = __gapRows.map((lanes, index) => ({ index, lanes }));
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
    events: harness.context.events.map((event) => ({
      ...event,
      path: event.path && event.path.map((part) => [...part]),
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

test('road deck uses vector rust gradient layers and grounded structures draw semantic contact footprints', () => {
  const harness = createHarness();
  vm.runInContext(`
    STATE.position = 0;
    STATE.track = Array.from({ length: CONFIG.RENDER_DISTANCE + 2 }, (_, index) => ({
      index,
      lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD),
    }));
    renderTrack(__ctx);
  `, harness.sandbox);
  const deckGradStops = harness.context.events
    .filter((event) => event.type === 'fill' && event.style && typeof event.style === 'object')
    .flatMap((event) => event.style.stops.map((stop) => stop[1]));
  assert.ok(deckGradStops.includes('#4d2f22'));
  assert.ok(deckGradStops.includes('#5a3929'));
  const deckFills = harness.context.events
    .filter((event) => event.type === 'fill')
    .map((event) => event.style);
  assert.equal(deckFills.includes('#222a34'), false);
  assert.equal(deckFills.includes('#28323d'), false);
  assert.equal(deckFills.includes('#3a3a55'), false);
  assert.equal(deckFills.includes('#34344e'), false);
  const seamAlphas = harness.context.events
    .filter((event) => event.type === 'stroke'
      && typeof event.style === 'string'
      && event.style.startsWith('rgba(151,166,176,'))
    .map((event) => Number(event.style.slice('rgba(151,166,176,'.length, -1)));
  assert.ok(seamAlphas.length > 1);
  assert.ok(Math.max(...seamAlphas) > Math.min(...seamAlphas));

  const wall = drawWall(harness, 'wallHigh', {
    lane: 0, segIndex: 10, zNear: 480, zFar: 530,
  }).events;
  const imageIndex = wall.findIndex((event) => event.type === 'drawImage');
  const contactFillIndex = wall.findIndex((event) => event.type === 'fill'
    && typeof event.style === 'string'
    && event.style.startsWith('rgba(2,8,18,'));
  const contactStrokeIndex = wall.findIndex((event) => event.type === 'stroke'
    && typeof event.style === 'string'
    && event.style.startsWith('rgba(255,155,69,'));
  assert.ok(contactFillIndex >= 0 && contactFillIndex < imageIndex);
  assert.ok(contactStrokeIndex >= 0 && contactStrokeIndex < imageIndex);

  const turret = drawEnemy(harness, {
    type: 'turret',
    lane: 0,
    phase: 0,
    visualVariant: 'turretSentry',
  }, { zNear: 480, zFar: 530 });
  const turretImageIndex = turret.findIndex((event) => event.type === 'drawImage');
  const turretContactIndex = turret.findIndex((event) => event.type === 'stroke'
    && typeof event.style === 'string'
    && event.style.startsWith('rgba(255,155,69,'));
  assert.ok(turretContactIndex >= 0 && turretContactIndex < turretImageIndex);

  const drone = drawEnemy(harness, {
    type: 'drone',
    lane: 6,
    fromLane: 6,
    toLane: 6,
    state: 'rest',
    phase: 0,
    visualVariant: 'droneScout',
  });
  assert.equal(drone.some((event) => event.type === 'fill'
    && typeof event.style === 'string'
    && event.style.startsWith('rgba(2,8,18,')), false);
});

test('loaded turret atlases use final grounded crops anchored to projected world origins', () => {
  const harness = createHarness();
  const nearCalls = imageCalls(drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  }, { zNear: 300, zFar: 350 }));
  const farCalls = imageCalls(drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  }, { zNear: 900, zFar: 950 }));
  assert.deepEqual(nearCalls.map((call) => call.args.slice(0, 4)), [
    sourceTuple(worldArt.WORLD_ATLAS_MANIFEST.turretSentry, 10),
  ]);
  assert.deepEqual(farCalls.map((call) => call.args.slice(0, 4)), [
    sourceTuple(worldArt.WORLD_ATLAS_MANIFEST.turretSentry, 10),
  ]);
  assert.equal(nearCalls[0].alpha, 1);
  assert.equal(farCalls[0].alpha, 1);
  const unionWidth = (calls) => Math.max(...calls.map((call) => call.args[4] + call.args[6]))
    - Math.min(...calls.map((call) => call.args[4]));
  const unionHeight = (calls) => Math.max(...calls.map((call) => call.args[5] + call.args[7]))
    - Math.min(...calls.map((call) => call.args[5]));
  assert.ok(unionWidth(nearCalls) > unionWidth(farCalls));
  assert.ok(unionHeight(nearCalls) > unionHeight(farCalls));
});

test('missing atlases call the named procedural turret fallback without drawing images', () => {
  const harness = createHarness({ loaded: false });
  const turret = drawEnemy(harness, {
    type: 'turret', lane: 3, phase: 0, visualVariant: 'turretSentry',
  });
  assert.equal(imageCalls(turret).length, 0);
  assert.ok(turret.some((event) => event.type === 'fill'));
  assert.equal(vm.runInContext("typeof drawProceduralDrone + ':' + typeof drawProceduralTurret", harness.sandbox), 'function:function');
});

test('Heavy Swarm is the primary drone path and keeps Scout and Striker silhouettes distinct', () => {
  const harness = createHarness();
  const scout = drawEnemy(harness, {
    type: 'drone', lane: 3, fromLane: 3, toLane: 3,
    state: 'rest', phase: 0, visualVariant: 'droneScout',
  });
  const striker = drawEnemy(harness, {
    type: 'drone', lane: 3, fromLane: 3, toLane: 3,
    state: 'rest', phase: 0, visualVariant: 'droneStriker',
  });

  assert.equal(imageCalls(scout).length, 0);
  assert.equal(imageCalls(striker).length, 0);
  assert.ok(scout.some((event) => event.type === 'fill' && event.style === '#171d26'));
  assert.ok(striker.some((event) => event.type === 'fill' && event.style === '#171d26'));
  const scoutPaths = scout
    .filter((event) => (event.type === 'fill' || event.type === 'stroke') && event.path)
    .map((event) => event.path);
  const strikerPaths = striker
    .filter((event) => (event.type === 'fill' || event.type === 'stroke') && event.path)
    .map((event) => event.path);
  assert.notDeepEqual(strikerPaths, scoutPaths);
});

test('Heavy Swarm uses one projected 432 by 360 envelope for hull and warning cues', () => {
  const harness = createHarness();
  const captured = JSON.parse(vm.runInContext(`(() => {
    const previousCues = drawDroneDirectionCues;
    let cueBounds = null;
    drawDroneDirectionCues = (...args) => {
      cueBounds = args[4];
      return previousCues(...args);
    };
    __ctx.events.length = 0;
    try {
      drawEnemy(__ctx, {
        type: 'drone', lane: 2, fromLane: 2, toLane: 3,
        state: 'warn', phase: 0, visualVariant: 'droneStriker',
      }, 20, 500, 550);
      const geometry = Skyroads.worldArt.WORLD_GEOMETRY.drone;
      const bob = Math.sin(STATE.time * 2.2) * 40;
      const expected = worldSpriteDrawRect(Skyroads.worldArt, {
        worldX: laneCenterX(2),
        zRel: 525,
        worldWidth: geometry.worldWidth,
        worldHeight: geometry.worldHeight,
        baseY: geometry.baseY + bob,
      });
      return JSON.stringify({ cueBounds, expected });
    } finally {
      drawDroneDirectionCues = previousCues;
    }
  })()`, harness.sandbox));
  assert.deepEqual(captured.cueBounds, captured.expected);
});

test('missing Heavy Swarm module falls back to atlas and then procedural drone', () => {
  const atlasHarness = createHarness({ droneVisual: false });
  const atlasEvents = drawEnemy(atlasHarness, {
    type: 'drone', lane: 3, fromLane: 3, toLane: 3,
    state: 'rest', phase: 0, visualVariant: 'droneScout',
  });
  assert.ok(imageCalls(atlasEvents).length > 0);
  assert.ok(imageCalls(atlasEvents).every((event) => event.image === 'droneScout'));

  const proceduralHarness = createHarness({ droneVisual: false, loaded: false });
  const proceduralEvents = drawEnemy(proceduralHarness, {
    type: 'drone', lane: 3, fromLane: 3, toLane: 3,
    state: 'rest', phase: 0, visualVariant: 'droneScout',
  });
  assert.equal(imageCalls(proceduralEvents).length, 0);
  assert.ok(proceduralEvents.some((event) => event.type === 'fill'
    && event.style && event.style.kind === 'linear'));
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
    const marker = events.find((event) => event.type === 'stroke' && event.style === '#ff4f63'
      && event.path.some((part) => part[0] === 'ellipse' && Math.abs(part[1] - target.x) < 1e-6));
    assert.ok(marker, 'landing marker must be centered on the projected target lane');

    const chevron = events.find((event) => event.type === 'fill' && event.style === '#fff4f7');
    assert.ok(chevron, 'direction chevron must remain independent of atlas artwork');
    const xs = chevron.path.filter((part) => part.length >= 3).map((part) => part[1]);
    assert.equal(Math.sign(xs[0] - xs.slice(1).reduce((sum, value) => sum + value, 0) / (xs.length - 1)), sign);
  }
});

test('moving Heavy Swarm drone uses bob-only origin while keeping gameplay geometry', () => {
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
    const lane = enemyLane(__enemy);
    const bob = Math.sin(STATE.time * 2.2 + __enemy.phase) * 40;
    const geometry = Skyroads.worldArt.WORLD_GEOMETRY.drone;
    const bounds = worldSpriteDrawRect(Skyroads.worldArt, {
      worldX: laneCenterX(lane),
      zRel: 505,
      worldWidth: geometry.worldWidth,
      worldHeight: geometry.worldHeight,
      baseY: geometry.baseY + bob,
    });
    drawEnemy(__ctx, __enemy, 20, 480, 530);
    return {
      bob,
      projectedOrigin: project(laneCenterX(lane), bob, 505),
      bounds,
      lane,
      droneHeight: CONFIG.DRONE_HEIGHT,
      hitboxHalfWidth: HITBOX.droneHalfWidth,
      warnTime: CONFIG.DRONE_WARN_TIME,
      moveTime: CONFIG.DRONE_MOVE_TIME,
    };
  })()`, harness.sandbox);
  const events = harness.context.events;
  const anchor = events.find((event) => event.type === 'translate');
  const bob = Math.sin(2.2) * 40;
  const expected = vm.runInContext(`project(laneCenterX(enemyLane(__enemy)), ${bob}, 505)`, harness.sandbox);
  assert.ok(Math.abs(anchor.x - expected.x) < 1e-6);
  assert.ok(Math.abs(anchor.y - expected.y) < 1e-6);
  assert.ok(Math.abs(captured.bob - bob) < 1e-10);
  assert.ok(Math.abs(captured.projectedOrigin.x - expected.x) < 1e-6);
  assert.ok(Math.abs(captured.projectedOrigin.y - expected.y) < 1e-6);
  assert.ok(captured.bounds.width >= 27, `near drone width ${captured.bounds.width}`);
  assert.equal(imageCalls(events).length, 0);
  assert.ok(events.some((event) => event.type === 'fill' && event.style === '#171d26'));
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

test('missing Heavy Swarm module and drone art keep procedural silhouette bank and cues', () => {
  const harness = createHarness({ droneVisual: false, missing: ['droneScout'] });
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
      assert.ok(events.some((event) => event.type === 'stroke' && event.style === '#ff4f63'));
    }
  }
});

test('reduced motion freezes Heavy Swarm bob and warning pulse while retaining bank and cues', () => {
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
    assert.ok(events.some((event) => event.type === 'stroke' && event.style === '#ff4f63'));
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

test('far-to-near enemy traversal preserves depth order across atlas and Heavy Swarm paths', () => {
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
  const turretIndex = harness.context.events.findIndex((event) => (
    event.type === 'drawImage' && event.image === 'turretSentry'
  ));
  const droneIndex = harness.context.events.findIndex((event) => (
    event.type === 'fill' && event.style === '#171d26'
  ));
  assert.ok(turretIndex >= 0);
  assert.ok(droneIndex > turretIndex, `drone event ${droneIndex} must follow turret ${turretIndex}`);
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
    ['wallLow', 2, [10], 600],
    ['wallLow', 3, [10], 600],
    ['wallLow', 4, [10], 600],
    ['wallMedium', 2, [10], 1250],
    ['wallMedium', 3, [10], 1250],
    ['wallMedium', 4, [10], 1250],
    ['wallHigh', 2, [10], 2000],
    ['wallHigh', 3, [10], 2000],
    ['wallHigh', 4, [10], 2000],
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
  }).events);
  const farYaw = imageCalls(drawWall(harness, 'wallLow', {
    lane: 2, segIndex: 10, zNear: 4000, zFar: 4050,
  }).events);
  const metadata = worldArt.WORLD_ATLAS_MANIFEST[nearYaw[0].image];
  const yawColumns = (calls) => calls.map((call) => Math.floor(call.args[0] / metadata.frameWidth));
  const nearColumns = [...new Set(yawColumns(nearYaw))];
  const farColumns = [...new Set(yawColumns(farYaw))];
  assert.deepEqual(nearColumns, [3], 'near grounded views use one crisp frontal yaw column');
  assert.deepEqual(farColumns, [3], 'far grounded views keep the same crisp frontal yaw column');
  const frontWeight = (calls) => calls
    .filter((call) => Math.floor(call.args[0] / metadata.frameWidth) === 3)
    .reduce((sum, call) => sum + call.alpha, 0);
  assert.equal(frontWeight(nearYaw), 1, 'near grounded view keeps one fully opaque frame');
  assert.equal(frontWeight(farYaw), 1, 'distant grounded view keeps the same fully opaque frame');
});

test('grounded outer-lane structures stay frontal while Heavy Swarm follows outer-lane projection', () => {
  const harness = createHarness();
  const leftCalls = imageCalls(drawWall(harness, 'wallHigh', {
    lane: 0, segIndex: 10, zNear: 480, zFar: 530,
  }).events);
  const rightCalls = imageCalls(drawWall(harness, 'wallHigh', {
    lane: 6, segIndex: 10, zNear: 480, zFar: 530,
  }).events);
  const leftMetadata = worldArt.WORLD_ATLAS_MANIFEST[leftCalls[0].image];
  const rightMetadata = worldArt.WORLD_ATLAS_MANIFEST[rightCalls[0].image];
  assert.deepEqual(leftCalls.map((call) => call.args.slice(0, 4)), [10]
    .map((index) => sourceTuple(leftMetadata, index)));
  assert.deepEqual(rightCalls.map((call) => call.args.slice(0, 4)), [10]
    .map((index) => sourceTuple(rightMetadata, index)));
  assert.equal(leftCalls[0].alpha, 1);
  assert.equal(rightCalls[0].alpha, 1);

  const droneEvents = drawEnemy(harness, {
    type: 'drone',
    lane: 6,
    fromLane: 6,
    toLane: 6,
    state: 'rest',
    phase: 0,
    visualVariant: 'droneScout',
  }, { zNear: 480, zFar: 530 });
  const droneOrigin = droneEvents.find((event) => event.type === 'translate');
  const expectedOrigin = vm.runInContext(
    'project(laneCenterX(6), Math.sin(STATE.time * 2.2) * 40, 505)',
    harness.sandbox,
  );
  assert.equal(imageCalls(droneEvents).length, 0);
  assert.ok(droneEvents.some((event) => event.type === 'fill' && event.style === '#171d26'));
  assert.ok(Math.abs(droneOrigin.x - expectedOrigin.x) < 1e-6);
  assert.ok(Math.abs(droneOrigin.y - expectedOrigin.y) < 1e-6);
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
      .filter((event) => event.type === 'stroke' && event.style === '#ff9b45')
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

test('loaded and fallback corridors leave unclipped atlas topology to live dual conduits', () => {
  const harness = createHarness();
  const fixture = renderCorridorModuleFixture(harness);
  assert.equal(fixture.descriptor.phase, 'start');
  const calls = imageCalls(fixture.events).filter((event) => event.image === 'corridorLow');
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.clip === null),
    'body-only corridor atlas layers must not use a topology clip');
  const lowConduitPath = fixture.events
    .filter((event) => event.type === 'stroke' && event.style === '#ff713d')
    .flatMap((event) => event.path)
    .filter((part) => part[0] === 'moveTo' || part[0] === 'lineTo');
  const expectedLowConduits = JSON.parse(vm.runInContext(`JSON.stringify(
    [-18, 18].flatMap((offset) => [
      project(laneCenterX(3) + offset, 540, zRelOf(10) + 6),
      project(laneCenterX(3) + offset, 540, zRelOf(11)),
    ])
  )`, harness.sandbox));
  assert.deepEqual(lowConduitPath.map((part) => [part[1], part[2]]),
    expectedLowConduits.map((point) => [point.x, point.y]));

  const fallbackHarness = createHarness({ missing: ['corridorMedium'] });
  const fallback = renderCorridorModuleFixture(fallbackHarness, {
    type: 'WALL_MEDIUM', length: 1,
  });
  assert.equal(imageCalls(fallback.events).length, 0);
  assert.ok(fallback.events.some((event) => event.type === 'fill'));
  assert.equal(fallback.events.filter((event) => event.type === 'clip').length, 0,
    'procedural fallback must not depend on an atlas clip');
  const mediumConduitPath = fallback.events
    .filter((event) => event.type === 'stroke' && event.style === '#ff713d')
    .flatMap((event) => event.path)
    .filter((part) => part[0] === 'moveTo' || part[0] === 'lineTo');
  const expectedMediumConduits = JSON.parse(vm.runInContext(`JSON.stringify(
    [-18, 18].flatMap((offset) => [
      project(laneCenterX(3) + offset, 1120, zRelOf(10) + 6),
      project(laneCenterX(3) + offset, 1120, zRelOf(11) - 6),
    ])
  )`, fallbackHarness.sandbox));
  assert.deepEqual(mediumConduitPath.map((part) => [part[1], part[2]]),
    expectedMediumConduits.map((point) => [point.x, point.y]));
});

test('live plinths and dual conduits obey every corridor phase and mismatch boundary', () => {
  const pathPoints = (events, type, style) => events
    .filter((event) => event.type === type && event.style === style)
    .flatMap((event) => event.path)
    .filter((part) => part[0] === 'moveTo' || part[0] === 'lineTo')
    .map((part) => [part[1], part[2]]);
  const cases = [
    { label: 'start', length: 3, index: 10, phase: 'start' },
    { label: 'middle', length: 3, index: 11, phase: 'middle' },
    { label: 'end', length: 3, index: 12, phase: 'end' },
    { label: 'single', length: 1, index: 10, phase: 'single' },
    {
      label: 'id mismatch', length: 2, index: 10, phase: 'single',
      mutation: "STATE.track[11].corridor.id = 'different'",
    },
    { label: 'lane mismatch', length: 2, index: 10, phase: 'single', mutation: 'STATE.track[11].corridor.lane = 4' },
    { label: 'hole', length: 2, index: 10, phase: 'single', mutation: 'STATE.track[11].lanes[3] = LANE_TYPE.ROAD' },
  ];

  for (const [type, otherType, category, conduitY] of [
    ['WALL_LOW', 'WALL_MEDIUM', 'corridorLow', 540],
    ['WALL_MEDIUM', 'WALL_LOW', 'corridorMedium', 1120],
  ]) {
    const typeMismatch = {
      label: 'type mismatch', length: 2, index: 10, phase: 'single',
      mutation: `
        STATE.track[11].corridor.type = LANE_TYPE.${otherType};
        STATE.track[11].lanes[3] = LANE_TYPE.${otherType};
      `,
    };
    for (const loaded of [true, false]) {
      for (const fixtureCase of [...cases, typeMismatch]) {
        const harness = createHarness({ missing: loaded ? [] : [category] });
        const fixture = renderCorridorModuleFixture(harness, {
          type,
          length: fixtureCase.length,
          index: fixtureCase.index,
          mutation: fixtureCase.mutation,
        });
        const label = `${loaded ? 'loaded' : 'fallback'} ${category} ${fixtureCase.label}`;
        assert.equal(fixture.descriptor.phase, fixtureCase.phase, `${label} phase`);
        const calls = imageCalls(fixture.events).filter((event) => event.image === category);
        assert.equal(calls.length > 0, loaded, `${label} atlas availability`);
        assert.ok(calls.every((call) => call.clip === null), `${label} body-only atlas clip`);

        const zNear = vm.runInContext(`zRelOf(${fixtureCase.index})`, harness.sandbox);
        const zFar = vm.runInContext(`zRelOf(${fixtureCase.index} + 1)`, harness.sandbox);
        const connectBefore = fixture.descriptor.phase === 'middle' || fixture.descriptor.phase === 'end';
        const connectAfter = fixture.descriptor.phase === 'middle' || fixture.descriptor.phase === 'start';
        const interiorNear = zNear + (connectBefore ? 0 : 6);
        const interiorFar = zFar - (connectAfter ? 0 : 6);
        const expected = JSON.parse(vm.runInContext(`JSON.stringify({
          plinth: [
            project(laneCenterX(3) - 324, 20, ${interiorNear}),
            project(laneCenterX(3) + 324, 20, ${interiorNear}),
            project(laneCenterX(3) + 324, 20, ${interiorFar}),
            project(laneCenterX(3) - 324, 20, ${interiorFar})
          ],
          conduits: [-18, 18].flatMap((offset) => [
            project(laneCenterX(3) + offset, ${conduitY}, ${interiorNear}),
            project(laneCenterX(3) + offset, ${conduitY}, ${interiorFar})
          ])
        })`, harness.sandbox));
        assert.deepEqual(pathPoints(fixture.events, 'fill', '#1c2730'),
          expected.plinth.map((point) => [point.x, point.y]), `${label} plinth`);
        assert.deepEqual(pathPoints(fixture.events, 'stroke', '#ff713d'),
          expected.conduits.map((point) => [point.x, point.y]), `${label} conduits`);
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
      assert.equal(eventCount(initial.events, 'stroke', '#ff713d'), 10);
      assert.equal(eventCount(initial.events, 'stroke', '#aebbc2'), 2);
      assert.equal(eventCount(initial.events, 'fill', '#ff713d'), 1);
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
      assert.equal(eventCount(split.events, 'stroke', '#ff713d'), 8);
      assert.equal(eventCount(split.events, 'stroke', '#aebbc2'), 4);
      assert.equal(eventCount(split.events, 'fill', '#ff713d'), 2);
      const destroyedDepth = vm.runInContext('(zRelOf(12) + zRelOf(13)) / 2', harness.sandbox);
      if (loaded) {
        assert.equal(split.bodyDepths.length, 4, 'destroyed center must have no atlas body');
        assert.equal(split.bodyDepths.some((depth) => Math.abs(depth - destroyedDepth) < 1e-10), false);
      } else {
        const bodySignals = eventCount(split.events, 'stroke', '#ff9b45');
        assert.equal(bodySignals, (height === 600 ? 1 : 2) * 4,
          'destroyed center must have no procedural body');
      }
      const conduitPoints = split.events
        .filter((event) => event.type === 'stroke' && event.style === '#ff713d')
        .flatMap((event) => event.path)
        .filter((part) => part[0] === 'moveTo' || part[0] === 'lineTo')
        .map((part) => [part[1], part[2]]);
      const conduitY = height === 600 ? 540 : 1120;
      const projectedConduits = (zExpression) => JSON.parse(vm.runInContext(
        `JSON.stringify([-18, 18].map((offset) => (
          project(laneCenterX(3) + offset, ${conduitY}, ${zExpression})
        )))`,
        harness.sandbox,
      ));
      const pointCountAt = (expected) => conduitPoints.filter(([x, y]) => expected.some((point) => (
        Math.abs(x - point.x) < 1e-8 && Math.abs(y - point.y) < 1e-8
      ))).length;
      for (const holeBoundary of ['zRelOf(12)', 'zRelOf(13)']) {
        assert.equal(pointCountAt(projectedConduits(holeBoundary)), 0,
          `dual conduits must not reach ${holeBoundary}`);
      }
      assert.equal(pointCountAt(projectedConduits('zRelOf(12) - 6')), 2);
      assert.equal(pointCountAt(projectedConduits('zRelOf(13) + 6')), 2);
      for (const connectedBoundary of ['zRelOf(11)', 'zRelOf(14)']) {
        assert.equal(pointCountAt(projectedConduits(connectedBoundary)), 4,
          `both adjacent dual conduits must meet at ${connectedBoundary}`);
      }

      vm.runInContext('STATE.track[11].lanes[3] = LANE_TYPE.ROAD', harness.sandbox);
      const isolated = renderCorridorSnapshot(harness);
      assert.deepEqual(isolated.descriptors[0], {
        phase: 'single', category, height, connectBefore: false, connectAfter: false,
      });
      assert.equal(eventCount(isolated.events, 'stroke', '#ff713d'), 6);
      assert.equal(eventCount(isolated.events, 'stroke', '#aebbc2'), 4);
      assert.equal(eventCount(isolated.events, 'fill', '#ff713d'), 2);
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
      .filter((event) => event.type === 'fill' && event.style === '#1c2730')
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

test('one connected gap region emits one exact union clip and one black core', () => {
  const harness = createHarness();
  const { events, randomCalls } = renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'GAP', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
    ['ROAD', 'GAP', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ], { reduced: true });
  const clips = events.filter((event) => event.type === 'clip');
  const cores = events.filter((event) => (
    event.type === 'fill'
      && event.style === '#000005'
      && event.path.some((part) => part[0] === 'ellipse')
  ));
  assert.equal(clips.length, 1);
  assert.equal(clips[0].path.filter((part) => part[0] === 'closePath').length, 6);
  assert.equal(cores.length, 1);
  assert.equal(imageCalls(events).filter((event) => event.image === 'gapEdge').length, 0);
  assert.equal(randomCalls, 0);
});

test('event horizon removes the retired grid depth lines embers and atlas modules', () => {
  const harness = createHarness();
  const { events } = renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'ROAD', 'ROAD', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ]);
  assert.equal(events.some((event) => (
    event.type === 'stroke'
      && event.style === 'rgba(255,159,59,0.480)'
  )), false);
  assert.equal(events.some((event) => (
    event.type === 'stroke'
      && event.style === 'rgba(212,78,255,0.720)'
  )), false);
  assert.equal(imageCalls(events).filter((event) => event.image === 'gapEdge').length, 0);
  assert.equal(events.some((event) => (
    event.type === 'fill'
      && event.style === '#000005'
      && event.path.some((part) => part[0] === 'ellipse')
  )), true);
});

test('event horizon draws warning dashes only on exposed near edges', () => {
  const harness = createHarness();
  const { events } = renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'ROAD', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ], { reduced: true });
  const warnings = events.filter((event) => (
    event.type === 'stroke'
      && (event.style === '#ff6b4d' || event.style === '#ffb24c')
  ));
  assert.ok(warnings.length >= 2);
  assert.ok(warnings.every((event) => event.lineCap === 'round'));
  assert.ok(events.some((event) => (
    event.type === 'stroke'
      && event.style === 'rgba(93,232,255,0.600)'
  )));
  assert.ok(events.some((event) => (
    event.type === 'stroke'
      && event.style === 'rgba(93,232,255,0.260)'
  )));
});

test('a narrow bridge keeps two separately clipped event horizons', () => {
  const harness = createHarness();
  const { events } = renderGapRows(harness, [
    ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
    ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
  ], { reduced: true });
  const clips = events.filter((event) => event.type === 'clip');
  const cores = events.filter((event) => (
    event.type === 'fill'
      && event.style === '#000005'
      && event.path.some((part) => part[0] === 'ellipse')
  ));
  assert.equal(clips.length, 2);
  assert.equal(cores.length, 2);
  assert.equal(clips.reduce((sum, event) => (
    sum + event.path.filter((part) => part[0] === 'closePath').length
  ), 0), 12);
});

test('normal event-horizon decoration moves deterministically while reduced motion freezes it', () => {
  const rows = [
    Array(7).fill('ROAD'),
    ['ROAD', 'GAP', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ];
  const decorativePaths = (events) => events
    .filter((event) => (
      (event.type === 'stroke' && event.path.some((part) => (
        part[0] === 'ellipse' || part[0] === 'quadraticCurveTo'
      )))
    ))
    .map((event) => event.path);
  const normalA = decorativePaths(renderGapRows(createHarness(), rows, { time: 1 }).events);
  const normalB = decorativePaths(renderGapRows(createHarness(), rows, { time: 2 }).events);
  const reducedA = decorativePaths(renderGapRows(createHarness(), rows, {
    time: 1, reduced: true,
  }).events);
  const reducedB = decorativePaths(renderGapRows(createHarness(), rows, {
    time: 2, reduced: true,
  }).events);
  assert.notDeepEqual(normalA, normalB);
  assert.deepEqual(reducedA, reducedB);
});

test('loaded and missing gap-edge art produce equivalent event-horizon cues', () => {
  const rows = [
    Array(7).fill('ROAD'),
    ['ROAD', 'ROAD', 'ROAD', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ];
  const summarize = (events) => events
    .filter((event) => (
      event.type === 'clip'
        || (event.type === 'fill' && event.style === '#000005')
        || (event.type === 'stroke' && [
          '#ff6b4d',
          '#ffb24c',
          'rgba(93,232,255,0.600)',
          'rgba(93,232,255,0.260)',
        ].includes(event.style))
    ))
    .map((event) => ({
      type: event.type,
      style: event.style,
      path: event.path,
      lineWidth: event.lineWidth,
      lineCap: event.lineCap,
    }));
  const loaded = renderGapRows(createHarness(), rows, { reduced: true }).events;
  const missing = renderGapRows(createHarness({ missing: ['gapEdge'] }), rows, {
    reduced: true,
  }).events;
  assert.deepEqual(summarize(loaded), summarize(missing));
  assert.equal(imageCalls(loaded).filter((event) => event.image === 'gapEdge').length, 0);
  assert.equal(imageCalls(missing).filter((event) => event.image === 'gapEdge').length, 0);
});

test('concave gap regions keep their event-horizon center inside a projected gap cell', () => {
  const harness = createHarness();
  const result = vm.runInContext(`(() => {
    const road = () => Array(CONFIG.LANES).fill(LANE_TYPE.ROAD);
    STATE.position = 0;
    STATE.track = Array.from({ length: 8 }, (_, index) => ({
      index, lanes: road(), enemies: null,
    }));
    for (const lane of [2, 3, 4]) {
      STATE.track[2].lanes[lane] = LANE_TYPE.GAP;
      STATE.track[4].lanes[lane] = LANE_TYPE.GAP;
    }
    STATE.track[3].lanes[2] = LANE_TYPE.GAP;
    STATE.track[3].lanes[4] = LANE_TYPE.GAP;
    const [region] = Skyroads.gapRegions.collectGapRegions({
      track: STATE.track,
      startIndex: 7,
      endIndex: 0,
      laneCount: CONFIG.LANES,
      gapType: LANE_TYPE.GAP,
    });
    const projected = projectGapRegion(region);
    const pointInCell = (point, cell) => {
      const vertices = [cell.nearLeft, cell.nearRight, cell.farRight, cell.farLeft];
      let sign = 0;
      for (let index = 0; index < vertices.length; index += 1) {
        const start = vertices[index];
        const end = vertices[(index + 1) % vertices.length];
        const cross = (end.x - start.x) * (point.y - start.y)
          - (end.y - start.y) * (point.x - start.x);
        if (Math.abs(cross) < 1e-9) continue;
        const nextSign = Math.sign(cross);
        if (sign && nextSign !== sign) return false;
        sign = nextSign;
      }
      return true;
    };
    return {
      center: projected.center,
      inside: projected.cells.some((cell) => pointInCell(projected.center, cell)),
    };
  })()`, harness.sandbox);
  assert.equal(result.inside, true, JSON.stringify(result));
});

test('event-horizon rendering restores the incoming Canvas line cap', () => {
  const harness = createHarness();
  harness.context.lineCap = 'square';
  renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'ROAD', 'GAP', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ], { reduced: true });
  assert.equal(harness.context.lineCap, 'square');
});

test('missing gap topology module keeps an isolated gap visibly dangerous', () => {
  const harness = createHarness();
  vm.runInContext('Skyroads.gapRegions = null', harness.sandbox);
  const { events } = renderGapRows(harness, [
    Array(7).fill('ROAD'),
    ['ROAD', 'ROAD', 'ROAD', 'GAP', 'ROAD', 'ROAD', 'ROAD'],
  ], { reduced: true });
  assert.ok(events.some((event) => (
    event.type === 'fill'
      && event.style === '#000005'
      && event.path.some((part) => part[0] === 'ellipse')
  )));
  assert.ok(events.some((event) => (
    event.type === 'stroke'
      && (event.style === '#ff6b4d' || event.style === '#ffb24c')
  )));
});

test('renderEffects paints expiry warning vignettes without throwing (boost / fuel burst / super form)', () => {
  const harness = createHarness();
  const scenarios = [
    { name: 'boost', boostT: 'CONFIG.BOOST_WARN_TIME * 0.5', fuelBurstT: '0', tripleT: '0', color: '120,230,255' },
    { name: 'fuel burst', boostT: '0', fuelBurstT: 'CONFIG.FUEL_BURST_WARN_TIME * 0.5', tripleT: '0', color: '255,200,80' },
    { name: 'super form', boostT: '0', fuelBurstT: '0', tripleT: 'CONFIG.TRIPLE_WARN_TIME * 0.5', color: '255,170,60' },
  ];
  for (const scenario of scenarios) {
    harness.context.events.length = 0;
    // 回归：v1.2.0 开发期此处曾因重复 if 块残留未定义变量 hE，
    // BOOST 进入到期预警窗口时 renderEffects 抛 ReferenceError → rAF 链中断 → 画面永久冻结
    const created = [];
    const originalCreateLinear = harness.context.createLinearGradient;
    harness.context.createLinearGradient = (...args) => {
      const g = originalCreateLinear(...args);
      created.push(g);
      return g;
    };
    try {
      vm.runInContext(`
        STATE.mode = 'PLAYING';
        STATE.boostT = ${scenario.boostT};
        STATE.fuelBurstT = ${scenario.fuelBurstT};
        STATE.tripleT = ${scenario.tripleT};
        renderEffects(__ctx);
      `, harness.sandbox);
    } finally {
      harness.context.createLinearGradient = originalCreateLinear;
    }
    assert.ok(
      created.length >= 4,
      `${scenario.name} warning should paint 4 edge gradients, got ${created.length}`,
    );
    assert.ok(
      created.some((g) => g.stops.some((stop) => String(stop[1]).includes(scenario.color))),
      `${scenario.name} warning gradient should use rgba(${scenario.color},...)`,
    );
  }
});

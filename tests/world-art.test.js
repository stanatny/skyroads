'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  YAW_DEGREES,
  PITCH_DEGREES,
  WORLD_ATLAS_MANIFEST,
  WORLD_GEOMETRY,
  selectAxisBlend,
  selectViewBlend,
  selectYawBlend,
  atlasFrame,
  atlasFrameRect,
  validateAtlasMetadata,
  buildSpriteDrawPlan,
  roadEdgeFrame,
  worldSpriteDrawRect,
  projectedLaneEnvelope,
  variantKey,
} = require('../src/world-art.js');

function approximately(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

function projectionFor(width, height) {
  return (worldX, worldY, zRel) => {
    const scale = 0.05 / zRel;
    return {
      x: width / 2 + scale * worldX * (width / 2),
      y: height * 0.42 + scale * (2200 - worldY) * (height / 2),
    };
  };
}

function syntheticUpright({ sourceShift = 0, sourceSize = 320 } = {}) {
  const frames = [];
  for (let pitchIndex = 0; pitchIndex < 3; pitchIndex += 1) {
    for (let yawIndex = 0; yawIndex < 7; yawIndex += 1) {
      const sx = yawIndex * 320 + sourceShift;
      const sy = pitchIndex * 320 + sourceShift;
      frames.push({
        source: { sx, sy, sw: sourceSize, sh: sourceSize },
        origin: {
          x: sx + 140 + yawIndex * 5,
          y: sy + 280 - pitchIndex * 10,
        },
      });
    }
  }
  return {
    layout: 'upright',
    atlasWidth: 2240,
    atlasHeight: 960,
    frameWidth: 320,
    frameHeight: 320,
    yawDegrees: [...YAW_DEGREES],
    pitchDegrees: [...PITCH_DEGREES],
    detailFrontZ: 120,
    worldBounds: { minX: -324, maxX: 324, minY: 0, maxY: 2000, minZ: -25, maxZ: 25 },
    pixelsPerWorldUnit: 0.1,
    frames,
  };
}

function cloneMetadata(metadata) {
  return structuredClone(metadata);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

const FINAL_MANIFEST_CONTRACT = Object.freeze({
  droneScout: ['./assets/world/semantic/drone-scout.png', 'drone', 0],
  droneStriker: ['./assets/world/semantic/drone-striker.png', 'drone', 1],
  turretSentry: ['./assets/world/semantic/turret-sentry.png', 'turret', 0],
  turretHeavy: ['./assets/world/semantic/turret-heavy.png', 'turret', 1],
  barrierRail: ['./assets/world/semantic/barrier-rail.png', 'wallLow', 0],
  barrierCrate: ['./assets/world/semantic/barrier-crate.png', 'wallLow', 1],
  structurePylon: ['./assets/world/semantic/structure-pylon.png', 'wallMedium', 0],
  structureBastion: ['./assets/world/semantic/structure-bastion.png', 'wallMedium', 1],
  structureReactor: ['./assets/world/semantic/structure-reactor.png', 'wallHigh', 0],
  structureTower: ['./assets/world/semantic/structure-tower.png', 'wallHigh', 1],
  corridorLow: ['./assets/world/semantic/corridor-low.png', 'corridorLow', 0],
  corridorMedium: ['./assets/world/semantic/corridor-medium.png', 'corridorMedium', 0],
  gapEdge: ['./assets/world/semantic/gap-edge.png', 'gap', 0],
});

const CATEGORY_WORLD_BOUNDS = Object.freeze({
  drone: { minX: -216, maxX: 216, minY: 140, maxY: 500, minZ: -25, maxZ: 25 },
  turret: { minX: -244.8, maxX: 244.8, minY: 0, maxY: 1900, minZ: -25, maxZ: 25 },
  wallLow: { minX: -324, maxX: 324, minY: 0, maxY: 600, minZ: -25, maxZ: 25 },
  wallMedium: { minX: -324, maxX: 324, minY: 0, maxY: 1250, minZ: -25, maxZ: 25 },
  wallHigh: { minX: -324, maxX: 324, minY: 0, maxY: 2000, minZ: -25, maxZ: 25 },
  corridorLow: { minX: -324, maxX: 324, minY: 0, maxY: 600, minZ: -25, maxZ: 25 },
  corridorMedium: { minX: -324, maxX: 324, minY: 0, maxY: 1250, minZ: -25, maxZ: 25 },
});

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function planOptions(metadata, {
  yaw = 0,
  pitch = 20,
  zRel = 100,
  projectedOrigin = { x: 480, y: 300 },
  pixelsPerWorldUnitX = 0.2,
  pixelsPerWorldUnitY = 0.15,
  alpha = 1,
  viewProfile = 'airborne',
  laneOffset = null,
} = {}) {
  return {
    metadata,
    worldX: Math.tan(yaw * Math.PI / 180) * zRel,
    zRel,
    cameraY: 1000 + Math.tan(pitch * Math.PI / 180) * zRel,
    objectY: 0,
    projectedOrigin,
    pixelsPerWorldUnitX,
    pixelsPerWorldUnitY,
    alpha,
    viewProfile,
    laneOffset,
  };
}

test('final manifest exposes thirteen real deeply frozen atlas records', () => {
  assert.deepEqual(YAW_DEGREES, [-80, -55, -30, 0, 30, 55, 80]);
  assert.deepEqual(PITCH_DEGREES, [20, 55, 80]);
  assert.deepEqual(Object.keys(WORLD_ATLAS_MANIFEST), Object.keys(FINAL_MANIFEST_CONTRACT));
  for (const [key, [path, category, variant]] of Object.entries(FINAL_MANIFEST_CONTRACT)) {
    const metadata = WORLD_ATLAS_MANIFEST[key];
    assert.equal(metadata.path, path, key);
    assert.equal(metadata.category, category, key);
    assert.equal(metadata.variant, variant, key);
    if (key === 'gapEdge') {
      assert.deepEqual(metadata, {
        path, category, variant,
        layout: 'roadEdge',
        atlasWidth: 3584,
        atlasHeight: 512,
        frameWidth: 512,
        frameHeight: 512,
        yawDegrees: [-30, -20, -10, 0, 10, 20, 30],
        frames: 7,
      });
      assert.equal(validateAtlasMetadata(metadata), true, key);
    } else {
      assert.equal(validateAtlasMetadata(metadata), true, key);
      assert.deepEqual(metadata.worldBounds, CATEGORY_WORLD_BOUNDS[category], key);
      assert.equal(metadata.frames.length, 21, key);
      assert.ok(Number.isFinite(metadata.detailFrontZ) && metadata.detailFrontZ > 0, key);
      assert.ok(Number.isFinite(metadata.pixelsPerWorldUnit) && metadata.pixelsPerWorldUnit > 0, key);
    }
    assertDeepFrozen(metadata);
  }
  assert.deepEqual(WORLD_GEOMETRY, {
    drone: { worldWidth: 432, worldHeight: 360, baseY: 140 },
    turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 },
    wallLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    wallMedium: { worldWidth: 648, worldHeight: 1250, baseY: 0 },
    wallHigh: { worldWidth: 648, worldHeight: 2000, baseY: 0 },
    corridorLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    corridorMedium: { worldWidth: 648, worldHeight: 1250, baseY: 0 },
  });
  for (const value of [YAW_DEGREES, PITCH_DEGREES, WORLD_ATLAS_MANIFEST, WORLD_GEOMETRY]) {
    assertDeepFrozen(value);
  }
});

test('non-uniform axis blending interpolates and clamps at the supplied samples', () => {
  assert.deepEqual(selectAxisBlend(67.5, YAW_DEGREES), {
    angle: 67.5, lowerIndex: 5, upperIndex: 6, mix: 0.5,
  });
  assert.deepEqual(selectAxisBlend(200, YAW_DEGREES), {
    angle: 80, lowerIndex: 6, upperIndex: 6, mix: 0,
  });
  assert.deepEqual(selectAxisBlend(-500, PITCH_DEGREES), {
    angle: 20, lowerIndex: 0, upperIndex: 0, mix: 0,
  });
  assert.equal(Object.isFrozen(selectAxisBlend(67.5, YAW_DEGREES)), true);
});

test('view blending uses wide symmetric yaw and visual-center pitch', () => {
  const edge = selectViewBlend({
    worldX: 2160,
    zRel: 155,
    cameraY: 2340,
    objectY: 0,
    worldBounds: { minY: 0, maxY: 2000 },
  });
  assert.equal(edge.yaw.angle, 80);

  const high = selectViewBlend({
    worldX: 0,
    zRel: 505,
    cameraY: 2340,
    objectY: 0,
    worldBounds: { minY: 0, maxY: 2000 },
  });
  assert.ok(Math.abs(high.pitch.angle - 69.35) < 0.1);
  assert.equal(high.pitch.lowerIndex, 1);
  assert.equal(high.pitch.upperIndex, 2);

  const outerHigh = selectViewBlend({
    worldX: 2160,
    zRel: 505,
    cameraY: 2340,
    objectY: 0,
    worldBounds: { minY: 0, maxY: 2000 },
    viewProfile: 'grounded',
    laneOffset: 3,
  });
  assert.ok(Math.abs(outerHigh.pitch.angle - 31.14) < 0.1);
  assert.equal(outerHigh.yaw.angle, 18);

  const innerHigh = selectViewBlend({
    worldX: 720,
    zRel: 505,
    cameraY: 2340,
    objectY: 0,
    worldBounds: { minY: 0, maxY: 2000 },
    viewProfile: 'grounded',
    laneOffset: 1,
  });
  assert.equal(innerHigh.yaw.angle, 6);

  const distantOuterHigh = selectViewBlend({
    worldX: 2160,
    zRel: 2400,
    cameraY: 2340,
    objectY: 0,
    worldBounds: { minY: 0, maxY: 2000 },
    viewProfile: 'grounded',
    laneOffset: 3,
  });
  assert.equal(distantOuterHigh.yaw.angle, 9);

  const groundedLaneYaw = Array.from({ length: 7 }, (_, lane) => (
    selectViewBlend({
      worldX: (lane - 3) * 720,
      zRel: 505,
      cameraY: 2340,
      objectY: 0,
      worldBounds: { minY: 0, maxY: 2000 },
      viewProfile: 'grounded',
      laneOffset: lane - 3,
    }).yaw.angle
  ));
  assert.deepEqual(groundedLaneYaw, [-18, -12, -6, 0, 6, 12, 18]);

  const airborne = selectViewBlend({
    worldX: 2160,
    zRel: 505,
    cameraY: 2340,
    objectY: 0,
    worldBounds: { minY: 0, maxY: 500 },
    viewProfile: 'airborne',
  });
  assert.ok(airborne.yaw.angle > 75);

  const left = selectViewBlend({
    worldX: -100, zRel: 100, cameraY: 1000, objectY: 0, worldBounds: { minY: 0, maxY: 2000 },
  });
  const right = selectViewBlend({
    worldX: 100, zRel: 100, cameraY: 1000, objectY: 0, worldBounds: { minY: 0, maxY: 2000 },
  });
  assert.equal(left.yaw.lowerIndex, YAW_DEGREES.length - 1 - right.yaw.upperIndex);
  assert.equal(left.yaw.upperIndex, YAW_DEGREES.length - 1 - right.yaw.lowerIndex);
  approximately(left.yaw.mix, 1 - right.yaw.mix);
  assert.equal(Object.isFrozen(edge), true);
  assert.equal(Object.isFrozen(edge.yaw), true);
  assert.equal(Object.isFrozen(edge.pitch), true);
});

test('upright metadata validates all 21 pitch-major frames and exposes immutable frame records', () => {
  const metadata = syntheticUpright();
  assert.equal(validateAtlasMetadata(metadata), true);
  assert.deepEqual(atlasFrame(metadata, 4, 2), {
    source: { sx: 1280, sy: 640, sw: 320, sh: 320 },
    origin: { x: 1440, y: 900 },
  });
  const frame = atlasFrame(metadata, 4, 2);
  assert.equal(Object.isFrozen(frame), true);
  assert.equal(Object.isFrozen(frame.source), true);
  assert.equal(Object.isFrozen(frame.origin), true);
});

test('upright draw plans emit one, two, or four normalized weighted draws', () => {
  const metadata = syntheticUpright();
  const exact = buildSpriteDrawPlan(planOptions(metadata, { yaw: 0, pitch: 0 }));
  assert.equal(exact.draws.length, 1);
  assert.deepEqual(exact.draws[0].source, { sx: 960, sy: 0, sw: 320, sh: 320 });
  assert.equal(exact.draws[0].weight, 1);

  const oneAxis = buildSpriteDrawPlan(planOptions(metadata, { yaw: 42.5, pitch: 0 }));
  assert.equal(oneAxis.draws.length, 2);
  approximately(oneAxis.draws[0].weight, 0.5);
  approximately(oneAxis.draws[1].weight, 0.5);

  const bothAxes = buildSpriteDrawPlan(planOptions(metadata, { yaw: 42.5, pitch: 67.5, alpha: 0.8 }));
  assert.equal(bothAxes.draws.length, 4);
  approximately(bothAxes.draws.reduce((sum, draw) => sum + draw.weight, 0), 1);
  for (const draw of bothAxes.draws) approximately(draw.alpha, draw.weight * 0.8);

  const clampedAlpha = buildSpriteDrawPlan(planOptions(metadata, { yaw: 42.5, pitch: 67.5, alpha: 7 }));
  for (const draw of clampedAlpha.draws) approximately(draw.alpha, draw.weight);
});

test('grounded view selection keeps one crisp frontal frame at every depth', () => {
  const metadata = syntheticUpright();
  for (const zRel of [205, 650, 1175, 1200, 1225, 1800]) {
    const grounded = buildSpriteDrawPlan(planOptions(metadata, {
      yaw: 20,
      pitch: 49,
      zRel,
      alpha: 1,
      viewProfile: 'grounded',
      laneOffset: 2,
    }));
    assert.equal(grounded.draws.length, 1, `depth ${zRel} should use one coherent silhouette`);
    assert.equal(
      Math.floor(grounded.draws[0].source.sx / metadata.frameWidth),
      3,
      `depth ${zRel} should use the frontal yaw column`,
    );
    assert.equal(
      Math.floor(grounded.draws[0].source.sy / metadata.frameHeight),
      1,
      `depth ${zRel} should keep the middle pitch row`,
    );
    assert.equal(grounded.draws[0].alpha, 1);
  }

  const airborne = buildSpriteDrawPlan(planOptions(metadata, {
    yaw: 20,
    pitch: 49,
    zRel: 205,
    alpha: 1,
    viewProfile: 'airborne',
  }));
  assert.equal(airborne.draws.length, 4);
});

test('grounded plans keep one stable pitch row while perspective scale changes', () => {
  const metadata = WORLD_ATLAS_MANIFEST.barrierRail;
  const planAt = (zRel) => buildSpriteDrawPlan({
    metadata,
    worldX: 720,
    zRel,
    cameraY: 2340,
    objectY: 0,
    projectedOrigin: { x: 480, y: 300 },
    pixelsPerWorldUnitX: 120 / zRel,
    pixelsPerWorldUnitY: 90 / zRel,
    alpha: 1,
    viewProfile: 'grounded',
    laneOffset: 1,
  });
  const depths = [130, 450, 800, 1190, 1200, 1800];
  const plans = depths.map(planAt);
  for (const plan of plans) {
    assert.equal(plan.draws.length, 1);
    assert.equal(Math.floor(plan.draws[0].source.sx / metadata.frameWidth), 3);
    assert.equal(Math.floor(plan.draws[0].source.sy / metadata.frameHeight), 1);
    assert.equal(plan.draws[0].alpha, 1);
  }
  const normalizedWidths = plans.map((plan, index) => plan.bounds.width * depths[index]);
  const normalizedHeights = plans.map((plan, index) => plan.bounds.height * depths[index]);
  for (const value of normalizedWidths.slice(1)) approximately(value, normalizedWidths[0]);
  for (const value of normalizedHeights.slice(1)) approximately(value, normalizedHeights[0]);
});

test('grounded structure height grows continuously while crossing the former near-frame boundary', () => {
  const keys = ['barrierRail', 'structurePylon', 'structureTower'];
  const depths = [1300, 1275, 1250, 1225, 1200, 1175, 1150, 1125, 1100];
  for (const key of keys) {
    const metadata = WORLD_ATLAS_MANIFEST[key];
    for (let lane = 0; lane < 7; lane += 1) {
      const laneOffset = lane - 3;
      const heights = depths.map((zRel) => buildSpriteDrawPlan({
        metadata,
        worldX: laneOffset * 720,
        zRel,
        cameraY: 2340,
        objectY: 0,
        projectedOrigin: { x: 640, y: 420 },
        pixelsPerWorldUnitX: 120 / zRel,
        pixelsPerWorldUnitY: 90 / zRel,
        alpha: 1,
        viewProfile: 'grounded',
        laneOffset,
      }).bounds.height);
      for (let index = 1; index < heights.length; index += 1) {
        assert.ok(
          heights[index] >= heights[index - 1],
          `${key} lane ${lane} shrank from depth ${depths[index - 1]} to ${depths[index]}`,
        );
        assert.ok(
          heights[index] / heights[index - 1] <= 1.04,
          `${key} lane ${lane} jumped from depth ${depths[index - 1]} to ${depths[index]}`,
        );
      }
    }
  }
});

test('origin anchors ignore atlas placement padding and bounds union every frozen destination', () => {
  const first = syntheticUpright({ sourceShift: 0, sourceSize: 312 });
  const padded = syntheticUpright({ sourceShift: 8, sourceSize: 312 });
  const options = { yaw: 42.5, pitch: 67.5, alpha: 0.8 };
  const plan = buildSpriteDrawPlan(planOptions(first, options));
  const paddedPlan = buildSpriteDrawPlan(planOptions(padded, options));
  assert.deepEqual(
    paddedPlan.draws.map((draw) => draw.destination),
    plan.draws.map((draw) => draw.destination),
  );

  for (const draw of plan.draws) {
    const frame = first.frames.find(({ source }) => (
      source.sx === draw.source.sx && source.sy === draw.source.sy
    ));
    const reconstructedX = draw.destination.x
      + (frame.origin.x - frame.source.sx) / first.pixelsPerWorldUnit * 0.2;
    const reconstructedY = draw.destination.y
      + (frame.origin.y - frame.source.sy) / first.pixelsPerWorldUnit * 0.15;
    assert.ok(Math.abs(reconstructedX - 480) <= 1);
    assert.ok(Math.abs(reconstructedY - 300) <= 1);
  }

  assert.deepEqual(plan.bounds, { x: 150, y: -105, width: 634, height: 483 });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.yaw), true);
  assert.equal(Object.isFrozen(plan.pitch), true);
  assert.equal(Object.isFrozen(plan.bounds), true);
  assert.equal(Object.isFrozen(plan.draws), true);
  for (const draw of plan.draws) {
    assert.equal(Object.isFrozen(draw), true);
    assert.equal(Object.isFrozen(draw.source), true);
    assert.equal(Object.isFrozen(draw.destination), true);
  }
});

test('sparse frame and angle arrays fail validation and planning without throwing', () => {
  const valid = syntheticUpright();
  const sparseSelectedFrame = cloneMetadata(valid);
  delete sparseSelectedFrame.frames[3];
  const sparseUnselectedFrame = cloneMetadata(valid);
  delete sparseUnselectedFrame.frames[20];
  const sparseYaw = cloneMetadata(valid);
  delete sparseYaw.yawDegrees[0];
  const sparsePitch = cloneMetadata(valid);
  delete sparsePitch.pitchDegrees[0];

  for (const [label, metadata] of [
    ['selected frame', sparseSelectedFrame],
    ['unselected frame', sparseUnselectedFrame],
    ['yaw sample', sparseYaw],
    ['pitch sample', sparsePitch],
  ]) {
    assert.equal(validateAtlasMetadata(metadata), false, `${label} hole must invalidate metadata`);
    assert.doesNotThrow(() => buildSpriteDrawPlan(planOptions(metadata)), label);
    assert.equal(buildSpriteDrawPlan(planOptions(metadata)), null, label);
  }
});

test('coercible and non-integral metadata numbers fail validation and planning without throwing', () => {
  const invalidCases = [];
  function invalid(label, mutate) {
    const metadata = cloneMetadata(syntheticUpright());
    mutate(metadata);
    invalidCases.push([label, metadata]);
  }

  invalid('string atlas width', (metadata) => { metadata.atlasWidth = '2240'; });
  invalid('string atlas height', (metadata) => { metadata.atlasHeight = '960'; });
  invalid('wrong cell width', (metadata) => { metadata.frameWidth = 319; });
  invalid('wrong cell height', (metadata) => { metadata.frameHeight = 319; });
  invalid('string yaw sample', (metadata) => { metadata.yawDegrees[0] = '-80'; });
  invalid('string pitch sample', (metadata) => { metadata.pitchDegrees[0] = '20'; });
  invalid('string world bound', (metadata) => { metadata.worldBounds.minX = '-324'; });
  invalid('null world bound', (metadata) => { metadata.worldBounds.minY = null; });
  invalid('string detail front', (metadata) => { metadata.detailFrontZ = '120'; });
  invalid('infinite detail front', (metadata) => { metadata.detailFrontZ = Infinity; });
  invalid('string source scale', (metadata) => { metadata.pixelsPerWorldUnit = '0.1'; });
  invalid('string source coordinate', (metadata) => { metadata.frames[0].source.sx = '0'; });
  invalid('null source coordinate', (metadata) => { metadata.frames[0].source.sy = null; });
  invalid('fractional source dimension', (metadata) => { metadata.frames[0].source.sw = 319.5; });
  invalid('string source dimension', (metadata) => { metadata.frames[0].source.sh = '320'; });
  invalid('string origin coordinate', (metadata) => { metadata.frames[0].origin.x = '140'; });
  invalid('null origin coordinate', (metadata) => { metadata.frames[0].origin.y = null; });
  invalid('NaN atlas dimension', (metadata) => { metadata.atlasWidth = NaN; });
  invalid('infinite world bound', (metadata) => { metadata.worldBounds.maxY = Infinity; });
  invalid('non-finite depth bound', (metadata) => { metadata.worldBounds.minZ = NaN; });
  invalid('symbol source coordinate', (metadata) => { metadata.frames[0].source.sx = Symbol('bad'); });

  for (const [label, metadata] of invalidCases) {
    assert.doesNotThrow(() => validateAtlasMetadata(metadata), label);
    assert.equal(validateAtlasMetadata(metadata), false, label);
    assert.doesNotThrow(() => buildSpriteDrawPlan(planOptions(metadata)), label);
    assert.equal(buildSpriteDrawPlan(planOptions(metadata)), null, label);
  }
});

test('malformed upright metadata fails validation and planning without throwing', () => {
  const valid = syntheticUpright();
  const malformed = [];

  const wrongDimensions = cloneMetadata(valid);
  wrongDimensions.atlasWidth = 2239;
  malformed.push(wrongDimensions);

  const missingFrame = cloneMetadata(valid);
  missingFrame.frames.pop();
  malformed.push(missingFrame);

  const outOfBounds = cloneMetadata(valid);
  outOfBounds.frames[20].source.sx = 2200;
  malformed.push(outOfBounds);

  const outsideOwnCell = cloneMetadata(valid);
  outsideOwnCell.frames[0].source = { sx: 319, sy: 10, sw: 2, sh: 20 };
  malformed.push(outsideOwnCell);

  const nonFiniteOrigin = cloneMetadata(valid);
  nonFiniteOrigin.frames[0].origin.x = Infinity;
  malformed.push(nonFiniteOrigin);

  const nonPositiveScale = cloneMetadata(valid);
  nonPositiveScale.pixelsPerWorldUnit = 0;
  malformed.push(nonPositiveScale);

  const missingDetailFront = cloneMetadata(valid);
  delete missingDetailFront.detailFrontZ;
  malformed.push(missingDetailFront);

  const nonPositiveDetailFront = cloneMetadata(valid);
  nonPositiveDetailFront.detailFrontZ = 0;
  malformed.push(nonPositiveDetailFront);

  const wrongYaw = cloneMetadata(valid);
  wrongYaw.yawDegrees[0] = -75;
  malformed.push(wrongYaw);

  const wrongPitch = cloneMetadata(valid);
  wrongPitch.pitchDegrees = [20, 80];
  malformed.push(wrongPitch);

  const wrongLayout = cloneMetadata(valid);
  wrongLayout.layout = 'billboard';

  const unconvertibleSource = cloneMetadata(valid);
  unconvertibleSource.frames[0].source.sx = Symbol('bad-coordinate');

  malformed.push(wrongLayout, unconvertibleSource, null, undefined, [], {}, 'upright');

  for (const metadata of malformed) {
    assert.doesNotThrow(() => validateAtlasMetadata(metadata));
    assert.equal(validateAtlasMetadata(metadata), false);
    assert.doesNotThrow(() => buildSpriteDrawPlan(planOptions(metadata)));
    assert.equal(buildSpriteDrawPlan(planOptions(metadata)), null);
  }
});

test('road-edge metadata validates only the strict seven-cell legacy contract', () => {
  const valid = cloneMetadata(WORLD_ATLAS_MANIFEST.gapEdge);
  assert.equal(validateAtlasMetadata(valid), true);

  const malformed = [];
  function invalid(label, mutate) {
    const metadata = cloneMetadata(valid);
    mutate(metadata);
    malformed.push([label, metadata]);
  }
  invalid('layout', (metadata) => { metadata.layout = 'upright'; });
  invalid('atlas width', (metadata) => { metadata.atlasWidth = 3072; });
  invalid('atlas height', (metadata) => { metadata.atlasHeight = 511; });
  invalid('frame width', (metadata) => { metadata.frameWidth = 511; });
  invalid('frame height', (metadata) => { metadata.frameHeight = 511; });
  invalid('yaw angle', (metadata) => { metadata.yawDegrees[0] = -31; });
  invalid('sparse yaw angles', (metadata) => { delete metadata.yawDegrees[3]; });
  invalid('frame count', (metadata) => { metadata.frames = 6; });
  invalid('coercible frame count', (metadata) => { metadata.frames = '7'; });

  for (const [label, metadata] of malformed) {
    assert.doesNotThrow(() => validateAtlasMetadata(metadata), label);
    assert.equal(validateAtlasMetadata(metadata), false, label);
    assert.equal(roadEdgeFrame(metadata), null, label);
  }
});

test('validation caches only recursively frozen data metadata and rechecks mutable fixtures', () => {
  let propertyReads = 0;
  const frozenData = new Proxy(deepFreeze(syntheticUpright()), {
    get(target, property, receiver) {
      propertyReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.equal(validateAtlasMetadata(frozenData), true);
  const readsAfterFirstValidation = propertyReads;
  assert.ok(readsAfterFirstValidation > 0);
  assert.equal(validateAtlasMetadata(frozenData), true);
  assert.equal(propertyReads, readsAfterFirstValidation, 'cached frozen data metadata must not be walked twice');

  const mutable = syntheticUpright();
  assert.equal(validateAtlasMetadata(mutable), true);
  mutable.frames[20].source.sx = 2200;
  assert.equal(validateAtlasMetadata(mutable), false, 'mutable metadata must never reuse a stale result');
});

test('validation never caches frozen accessors backed by mutable external state', () => {
  let externalSx = 0;
  const accessorMetadata = syntheticUpright();
  Object.defineProperty(accessorMetadata.frames[0].source, 'sx', {
    configurable: true,
    enumerable: true,
    get() { return externalSx; },
  });
  deepFreeze(accessorMetadata);
  assert.equal(validateAtlasMetadata(accessorMetadata), true);
  externalSx = 999;
  assert.equal(validateAtlasMetadata(accessorMetadata), false,
    'a frozen accessor graph must re-read external state instead of returning a cached result');
});

test('validation requires own fields at the root, bounds, frame, source, and origin levels', () => {
  const inheritedRoot = Object.freeze(Object.create(syntheticUpright()));

  const inheritedBounds = syntheticUpright();
  inheritedBounds.worldBounds = Object.create(inheritedBounds.worldBounds);

  const inheritedFrame = syntheticUpright();
  inheritedFrame.frames[0] = Object.create(inheritedFrame.frames[0]);

  const inheritedSource = syntheticUpright();
  inheritedSource.frames[0].source = Object.create(inheritedSource.frames[0].source);

  const inheritedOrigin = syntheticUpright();
  inheritedOrigin.frames[0].origin = Object.create(inheritedOrigin.frames[0].origin);

  for (const [label, metadata] of [
    ['root', inheritedRoot],
    ['bounds', inheritedBounds],
    ['frame', inheritedFrame],
    ['source', inheritedSource],
    ['origin', inheritedOrigin],
  ]) {
    assert.equal(validateAtlasMetadata(metadata), false, `${label} required fields must be own`);
  }
});

test('validation does not cache frozen wrappers around non-enumerable or symbol mutable children', () => {
  const nonEnumerableBounds = syntheticUpright();
  const mutableBounds = nonEnumerableBounds.worldBounds;
  delete nonEnumerableBounds.worldBounds;
  Object.defineProperty(nonEnumerableBounds, 'worldBounds', {
    configurable: false,
    enumerable: false,
    value: mutableBounds,
    writable: false,
  });
  deepFreeze(nonEnumerableBounds);
  assert.equal(validateAtlasMetadata(nonEnumerableBounds), true);
  mutableBounds.maxX = mutableBounds.minX;
  assert.equal(validateAtlasMetadata(nonEnumerableBounds), false,
    'a mutable non-enumerable required child must be revalidated after mutation');

  let sourceReads = 0;
  const symbolChild = syntheticUpright();
  Object.defineProperty(symbolChild.frames[0].source, 'sx', {
    configurable: true,
    enumerable: true,
    get() { sourceReads += 1; return 0; },
  });
  Object.defineProperty(symbolChild, Symbol('mutable child'), {
    configurable: false,
    enumerable: false,
    value: { mutable: true },
    writable: false,
  });
  deepFreeze(symbolChild);
  assert.equal(validateAtlasMetadata(symbolChild), true);
  const readsAfterFirstValidation = sourceReads;
  assert.equal(validateAtlasMetadata(symbolChild), true);
  assert.ok(sourceReads > readsAfterFirstValidation,
    'a mutable symbol child must prevent validation-result caching');
});

test('road edges select their validated center source without upright blending', () => {
  const source = roadEdgeFrame(WORLD_ATLAS_MANIFEST.gapEdge);
  assert.deepEqual(source, { sx: 1536, sy: 0, sw: 512, sh: 512 });
  assert.equal(Object.isFrozen(source), true);
});

test('legacy yaw selection and atlas rectangles retain the seven-frame runtime behavior', () => {
  const legacyMetadata = { frames: 7, frameWidth: 512, frameHeight: 512 };
  assert.deepEqual(selectYawBlend({ worldX: 0, zRel: 6000 }), {
    angle: 0, lowerIndex: 3, upperIndex: 3, mix: 0,
  });
  assert.deepEqual(selectYawBlend({ worldX: -1e9, zRel: 1 }), {
    angle: -30, lowerIndex: 0, upperIndex: 0, mix: 0,
  });
  assert.deepEqual(selectYawBlend({ worldX: 1e9, zRel: 1 }), {
    angle: 30, lowerIndex: 6, upperIndex: 6, mix: 0,
  });
  assert.deepEqual(atlasFrameRect(legacyMetadata, 6), {
    sx: 3072, sy: 0, sw: 512, sh: 512,
  });
  assert.deepEqual(atlasFrameRect(legacyMetadata, -8), {
    sx: 0, sy: 0, sw: 512, sh: 512,
  });
});

test('destination-only upright calls bridge the current game with non-uniform yaw and center pitch crops', () => {
  const metadata = syntheticUpright({ sourceShift: 8, sourceSize: 304 });
  const destination = { x: 100, y: 200, width: 80, height: 40 };
  const plan = buildSpriteDrawPlan({
    metadata,
    worldX: Math.tan(42.5 * Math.PI / 180),
    zRel: 1,
    destination,
    alpha: 1.5,
  });
  assert.deepEqual(plan, {
    lower: { sx: 1288, sy: 328, sw: 304, sh: 304 },
    upper: { sx: 1608, sy: 328, sw: 304, sh: 304 },
    mix: 0.5,
    destination,
    alpha: 1,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.destination), true);
});

test('the committed drone metadata supports both the temporary and final upright call shapes', () => {
  const metadata = WORLD_ATLAS_MANIFEST.droneScout;
  const destination = { x: 40, y: 60, width: 120, height: 80 };
  const legacy = buildSpriteDrawPlan({
    metadata,
    worldX: Math.tan(42.5 * Math.PI / 180),
    zRel: 1,
    destination,
    alpha: 0.75,
  });
  assert.deepEqual(legacy, {
    lower: metadata.frames[11].source,
    upper: metadata.frames[12].source,
    mix: 0.5,
    destination,
    alpha: 0.75,
  });

  const depth = 1000;
  const visualCenterY = (metadata.worldBounds.minY + metadata.worldBounds.maxY) / 2;
  const finalPlan = buildSpriteDrawPlan({
    metadata,
    worldX: 0,
    zRel: depth,
    cameraY: visualCenterY + Math.tan(55 * Math.PI / 180) * depth,
    projectedOrigin: { x: 500, y: 320 },
    pixelsPerWorldUnitX: 0.2,
    pixelsPerWorldUnitY: 0.15,
  });
  assert.equal(finalPlan.draws.length, 1);
  assert.deepEqual(finalPlan.draws[0].source, metadata.frames[10].source);
  assert.equal(finalPlan.draws[0].weight, 1);
});

test('destination-only road-edge calls preserve seven-yaw 512-frame behavior', () => {
  const metadata = WORLD_ATLAS_MANIFEST.gapEdge;
  const destination = { x: 20, y: 40, width: 120, height: 60 };
  const plan = buildSpriteDrawPlan({
    metadata,
    worldX: Math.tan(-15 * Math.PI / 180),
    zRel: 1,
    destination,
    alpha: 0.6,
  });
  assert.deepEqual(plan?.lower, { sx: 512, sy: 0, sw: 512, sh: 512 });
  assert.deepEqual(plan?.upper, { sx: 1024, sy: 0, sw: 512, sh: 512 });
  approximately(plan?.mix, 0.5);
  assert.deepEqual(plan?.destination, destination);
  assert.equal(plan?.alpha, 0.6);
  assertDeepFrozen(plan);

  const malformed = cloneMetadata(metadata);
  malformed.atlasWidth = 3072;
  assert.equal(buildSpriteDrawPlan({
    metadata: malformed,
    worldX: 0,
    zRel: 1,
    destination,
  }), null);
});

test('world draw rectangles use fixed collision geometry at each viewport, depth, and lane region', () => {
  for (const [width, height] of [[960, 600], [1280, 800]]) {
    const projectPoint = projectionFor(width, height);
    for (const zRel of [130, 6000]) {
      for (const worldX of [-2160, 0, 2160]) {
        for (const geometry of Object.values(WORLD_GEOMETRY)) {
          const rect = worldSpriteDrawRect({ projectPoint, worldX, zRel, ...geometry });
          const bottom = projectPoint(worldX, geometry.baseY, zRel);
          const top = projectPoint(worldX, geometry.baseY + geometry.worldHeight, zRel);
          assert.equal(rect.x + rect.width / 2, bottom.x);
          assert.equal(rect.y + rect.height, bottom.y);
          assert.equal(rect.height, Math.abs(bottom.y - top.y));
          assert.ok(rect.width >= 0);
          assert.ok(rect.height >= 0);
          assert.equal(Object.isFrozen(rect), true);
        }
      }
    }
  }
});

test('grounded atlas plans remain centered on projected lane envelopes without covering adjacent lanes', () => {
  const groundedKeys = Object.keys(WORLD_ATLAS_MANIFEST).filter((key) => (
    WORLD_ATLAS_MANIFEST[key].layout === 'upright'
      && WORLD_ATLAS_MANIFEST[key].category !== 'drone'
      && WORLD_ATLAS_MANIFEST[key].category !== 'turret'
  ));
  const viewports = [[960, 600], [1280, 800], [1920, 1080]];
  const depths = [250, 505, 800, 1190, 1800, 3600, 6000];
  const laneWidth = 720;
  const footprintWidth = 648;
  for (const [width, height] of viewports) {
    const projectPoint = projectionFor(width, height);
    const centerTolerance = 1.25 * width / 1280;
    for (const zRel of depths) {
      for (let lane = 0; lane < 7; lane += 1) {
        const worldX = (lane - 3) * laneWidth;
        for (const key of groundedKeys) {
          const metadata = WORLD_ATLAS_MANIFEST[key];
          const geometry = WORLD_GEOMETRY[metadata.category];
          const envelope = projectedLaneEnvelope({
            projectPoint,
            worldX,
            zRel,
            laneWidth,
            footprintWidth,
            baseY: geometry.baseY,
          });
          approximately(envelope.laneCenter.x, projectPoint(worldX, geometry.baseY, zRel).x);
          approximately(envelope.footprintCenter.x, envelope.laneCenter.x);
          approximately(
            envelope.footprintWidth,
            Math.abs(projectPoint(worldX + footprintWidth / 2, geometry.baseY, zRel).x
              - projectPoint(worldX - footprintWidth / 2, geometry.baseY, zRel).x),
          );

          const projectedOrigin = projectPoint(worldX, geometry.baseY, zRel);
          const projectedUnitX = projectPoint(worldX + 1, geometry.baseY, zRel);
          const projectedUnitY = projectPoint(worldX, geometry.baseY + 1, zRel);
          const plan = buildSpriteDrawPlan({
            metadata,
            worldX,
            zRel,
            cameraY: 2340,
            objectY: geometry.baseY,
            projectedOrigin,
            pixelsPerWorldUnitX: Math.abs(projectedUnitX.x - projectedOrigin.x),
            pixelsPerWorldUnitY: Math.abs(projectedUnitY.y - projectedOrigin.y),
            alpha: 1,
            viewProfile: 'grounded',
            laneOffset: lane - 3,
          });
          const planCenter = plan.bounds.x + plan.bounds.width / 2;
          assert.ok(
            Math.abs(planCenter - envelope.laneCenter.x) <= centerTolerance,
            `${key} lane ${lane} depth ${zRel} center ${planCenter - envelope.laneCenter.x}`,
          );
          const laneOverhang = envelope.laneWidth * 0.15;
          assert.ok(
            plan.bounds.x >= envelope.footprintLeft - laneOverhang,
            `${key} lane ${lane} depth ${zRel} left overhang`,
          );
          assert.ok(
            plan.bounds.x + plan.bounds.width <= envelope.footprintRight + laneOverhang,
            `${key} lane ${lane} depth ${zRel} right overhang`,
          );
          assert.ok(
            plan.bounds.x > envelope.adjacentLeftCenter
              && plan.bounds.x + plan.bounds.width < envelope.adjacentRightCenter,
            `${key} lane ${lane} depth ${zRel} adjacent lane center`,
          );
        }
      }
    }
  }
});

test('variant selection remains stable and covers every final category key', () => {
  assert.equal(variantKey('unknown', 2, 4), null);
  assert.equal(variantKey('gap', 17, 2), 'gapEdge');
  assert.equal(variantKey('corridorLow', 17, 2), 'corridorLow');
  assert.equal(variantKey('corridorMedium', 17, 2), 'corridorMedium');
  for (const category of Object.keys(CATEGORY_WORLD_BOUNDS)) {
    const first = variantKey(category, 17, 2);
    assert.equal(typeof first, 'string');
    assert.equal(first, variantKey(category, 17, 2));
  }
  const variants = (category) => new Set(Array.from({ length: 64 }, (_, segmentIndex) => (
    variantKey(category, segmentIndex, 0)
  )));
  assert.deepEqual(variants('drone'), new Set(['droneScout', 'droneStriker']));
  assert.deepEqual(variants('turret'), new Set(['turretSentry', 'turretHeavy']));
  assert.deepEqual(variants('wallLow'), new Set(['barrierRail', 'barrierCrate']));
  assert.deepEqual(variants('wallMedium'), new Set(['structurePylon', 'structureBastion']));
  assert.deepEqual(variants('wallHigh'), new Set(['structureReactor', 'structureTower']));
  assert.deepEqual(variants('corridorLow'), new Set(['corridorLow']));
  assert.deepEqual(variants('corridorMedium'), new Set(['corridorMedium']));
  const drone = { segmentIndex: 17, stableLaneKey: 2, state: 'rest', fromLane: 2 };
  const atRest = variantKey('drone', drone.segmentIndex, drone.stableLaneKey);
  drone.state = 'warn';
  drone.fromLane = 4;
  const atWarn = variantKey('drone', drone.segmentIndex, drone.stableLaneKey);
  drone.state = 'move';
  drone.fromLane = 5;
  assert.equal(atRest, atWarn);
  assert.equal(atWarn, variantKey('drone', drone.segmentIndex, drone.stableLaneKey));
});

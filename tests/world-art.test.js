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
    yawDegrees: [...YAW_DEGREES],
    pitchDegrees: [...PITCH_DEGREES],
    worldBounds: { minX: -324, maxX: 324, minY: 0, maxY: 2000 },
    pixelsPerWorldUnit: 0.1,
    frames,
  };
}

function cloneMetadata(metadata) {
  return structuredClone(metadata);
}

function planOptions(metadata, {
  yaw = 0,
  pitch = 20,
  zRel = 100,
  projectedOrigin = { x: 480, y: 300 },
  pixelsPerWorldUnitX = 0.2,
  pixelsPerWorldUnitY = 0.15,
  alpha = 1,
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
  };
}

test('upright view constants and legacy manifest remain deeply frozen compatibility contracts', () => {
  assert.deepEqual(YAW_DEGREES, [-80, -55, -30, 0, 30, 55, 80]);
  assert.deepEqual(PITCH_DEGREES, [20, 55, 80]);
  assert.deepEqual(WORLD_ATLAS_MANIFEST, {
    droneScout: { path: './assets/world/drone-scout.png', category: 'drone', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
    droneStriker: { path: './assets/world/drone-striker.png', category: 'drone', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
    turretSentry: { path: './assets/world/turret-sentry.png', category: 'turret', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
    turretHeavy: { path: './assets/world/turret-heavy.png', category: 'turret', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
    barrierRail: { path: './assets/world/barrier-rail.png', category: 'wallLow', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
    barrierCrate: { path: './assets/world/barrier-crate.png', category: 'wallLow', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
    structureReactor: { path: './assets/world/structure-reactor.png', category: 'wallHigh', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
    structureTower: { path: './assets/world/structure-tower.png', category: 'wallHigh', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
    gapEdge: { path: './assets/world/gap-edge.png', category: 'gap', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
  });
  assert.deepEqual(WORLD_GEOMETRY, {
    drone: { worldWidth: 432, worldHeight: 360, baseY: 140 },
    turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 },
    wallLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    wallMedium: { worldWidth: 648, worldHeight: 1250, baseY: 0 },
    wallHigh: { worldWidth: 648, worldHeight: 2000, baseY: 0 },
    corridorLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    corridorMedium: { worldWidth: 648, worldHeight: 1250, baseY: 0 },
  });
  for (const value of [
    YAW_DEGREES,
    PITCH_DEGREES,
    WORLD_ATLAS_MANIFEST,
    WORLD_GEOMETRY,
    ...Object.values(WORLD_ATLAS_MANIFEST),
    ...Object.values(WORLD_GEOMETRY),
  ]) assert.equal(Object.isFrozen(value), true);
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

  const nonFiniteOrigin = cloneMetadata(valid);
  nonFiniteOrigin.frames[0].origin.x = Infinity;
  malformed.push(nonFiniteOrigin);

  const nonPositiveScale = cloneMetadata(valid);
  nonPositiveScale.pixelsPerWorldUnit = 0;
  malformed.push(nonPositiveScale);

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

test('road edges select their center source without upright blending', () => {
  const frames = Array.from({ length: 7 }, (_, index) => ({
    source: { sx: index * 512, sy: 0, sw: 512, sh: 512 },
  }));
  const metadata = { layout: 'roadEdge', frames };
  const source = roadEdgeFrame(metadata);
  assert.deepEqual(source, { sx: 1536, sy: 0, sw: 512, sh: 512 });
  assert.equal(Object.isFrozen(source), true);
});

test('legacy yaw selection and atlas rectangles retain the seven-frame runtime behavior', () => {
  assert.deepEqual(selectYawBlend({ worldX: 0, zRel: 6000 }), {
    angle: 0, lowerIndex: 3, upperIndex: 3, mix: 0,
  });
  assert.deepEqual(selectYawBlend({ worldX: -1e9, zRel: 1 }), {
    angle: -30, lowerIndex: 0, upperIndex: 0, mix: 0,
  });
  assert.deepEqual(selectYawBlend({ worldX: 1e9, zRel: 1 }), {
    angle: 30, lowerIndex: 6, upperIndex: 6, mix: 0,
  });
  assert.deepEqual(atlasFrameRect(WORLD_ATLAS_MANIFEST.droneScout, 6), {
    sx: 3072, sy: 0, sw: 512, sh: 512,
  });
  assert.deepEqual(atlasFrameRect(WORLD_ATLAS_MANIFEST.droneScout, -8), {
    sx: 0, sy: 0, sw: 512, sh: 512,
  });
});

test('legacy destination calls return the exact frozen shape consumed by the current game', () => {
  const destination = { x: 100, y: 200, width: 80, height: 40 };
  const plan = buildSpriteDrawPlan({
    metadata: WORLD_ATLAS_MANIFEST.droneScout,
    worldX: Math.tan(5 * Math.PI / 180),
    zRel: 1,
    destination,
    alpha: 1.5,
  });
  assert.deepEqual(plan, {
    lower: { sx: 1536, sy: 0, sw: 512, sh: 512 },
    upper: { sx: 2048, sy: 0, sw: 512, sh: 512 },
    mix: 0.5,
    destination,
    alpha: 1,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.destination), true);
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

test('variant selection remains stable and covers future medium and corridor atlases', () => {
  assert.equal(variantKey('unknown', 2, 4), null);
  assert.equal(variantKey('gap', 17, 2), 'gapEdge');
  for (const category of ['drone', 'wallMedium', 'corridorLow', 'corridorMedium']) {
    const first = variantKey(category, 17, 2);
    assert.equal(typeof first, 'string');
    assert.equal(first, variantKey(category, 17, 2));
  }
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

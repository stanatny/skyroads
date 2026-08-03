'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  YAW_DEGREES,
  WORLD_ATLAS_MANIFEST,
  WORLD_GEOMETRY,
  selectYawBlend,
  atlasFrameRect,
  buildSpriteDrawPlan,
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

test('the atlas manifest and geometry are the frozen seven-view contract', () => {
  assert.deepEqual(YAW_DEGREES, [-30, -20, -10, 0, 10, 20, 30]);
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
    drone: { worldWidth: 380, worldHeight: 360, baseY: 140 },
    turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0 },
    wallLow: { worldWidth: 576, worldHeight: 600, baseY: 0 },
    wallHigh: { worldWidth: 576, worldHeight: 2000, baseY: 0 },
  });
  for (const value of [YAW_DEGREES, WORLD_ATLAS_MANIFEST, WORLD_GEOMETRY, ...Object.values(WORLD_ATLAS_MANIFEST), ...Object.values(WORLD_GEOMETRY)]) {
    assert.equal(Object.isFrozen(value), true);
  }
});

test('yaw blending chooses the center view, sides, depth, and clamped limits', () => {
  assert.deepEqual(selectYawBlend({ worldX: 0, zRel: 6000 }), {
    angle: 0, lowerIndex: 3, upperIndex: 3, mix: 0,
  });
  assert.ok(selectYawBlend({ worldX: -2160, zRel: 2000 }).angle < 0);
  assert.ok(selectYawBlend({ worldX: 2160, zRel: 2000 }).angle > 0);
  assert.equal(selectYawBlend({ worldX: 2160, zRel: 12000 }).angle < selectYawBlend({ worldX: 2160, zRel: 2000 }).angle, true);
  assert.deepEqual(selectYawBlend({ worldX: -1e9, zRel: 1 }), { angle: -30, lowerIndex: 0, upperIndex: 0, mix: 0 });
  assert.deepEqual(selectYawBlend({ worldX: 1e9, zRel: 1 }), { angle: 30, lowerIndex: 6, upperIndex: 6, mix: 0 });
});

test('yaw blending interpolates exactly between its ten-degree source frames', () => {
  for (const angle of [-25, -15, -5, 5, 15, 25]) {
    const result = selectYawBlend({ worldX: Math.tan(angle * Math.PI / 180), zRel: 1 });
    approximately(result.angle, angle);
    assert.equal(result.upperIndex - result.lowerIndex, 1);
    approximately(result.mix, 0.5);
  }
  assert.deepEqual(selectYawBlend({ worldX: 0, zRel: 1 }), {
    angle: 0, lowerIndex: 3, upperIndex: 3, mix: 0,
  });
});

test('invalid yaw input falls back to the immutable center view', () => {
  const result = selectYawBlend({ worldX: 'not-a-number', zRel: null });
  assert.deepEqual(result, { angle: 0, lowerIndex: 3, upperIndex: 3, mix: 0 });
  assert.equal(Object.isFrozen(result), true);
});

test('atlas frame rectangles clamp to seven fixed 512-pixel frames', () => {
  assert.deepEqual(atlasFrameRect(WORLD_ATLAS_MANIFEST.droneScout, 6), {
    sx: 3072, sy: 0, sw: 512, sh: 512,
  });
  assert.deepEqual(atlasFrameRect(WORLD_ATLAS_MANIFEST.droneScout, -8), {
    sx: 0, sy: 0, sw: 512, sh: 512,
  });
  assert.deepEqual(atlasFrameRect(WORLD_ATLAS_MANIFEST.droneScout, 99), {
    sx: 3072, sy: 0, sw: 512, sh: 512,
  });
});

test('a sprite blend uses one frozen bottom-center destination for both source frames', () => {
  const destination = { x: 100, y: 200, width: 80, height: 40 };
  const plan = buildSpriteDrawPlan({
    metadata: WORLD_ATLAS_MANIFEST.droneScout,
    worldX: Math.tan(5 * Math.PI / 180),
    zRel: 1,
    destination,
    alpha: 1.5,
  });
  assert.deepEqual(plan.lower, { sx: 1536, sy: 0, sw: 512, sh: 512 });
  assert.deepEqual(plan.upper, { sx: 2048, sy: 0, sw: 512, sh: 512 });
  approximately(plan.mix, 0.5);
  assert.deepEqual(plan.destination, destination);
  assert.equal(plan.destination.x + plan.destination.width / 2, 140);
  assert.equal(plan.destination.y + plan.destination.height, 240);
  assert.equal(plan.lower.sw, plan.upper.sw);
  assert.equal(plan.lower.sh, plan.upper.sh);
  assert.equal(plan.alpha, 1);
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

test('drone bob, grounded obstacles, and atlas padding leave collision anchors unchanged', () => {
  const projectPoint = projectionFor(960, 600);
  for (const bob of [-40, 0, 40]) {
    const rect = worldSpriteDrawRect({
      projectPoint, worldX: 0, zRel: 130, ...WORLD_GEOMETRY.drone, baseY: 140 + bob,
    });
    const base = projectPoint(0, 140 + bob, 130);
    const top = projectPoint(0, 500 + bob, 130);
    assert.equal(rect.y + rect.height, base.y);
    assert.equal(rect.y, top.y);
  }
  for (const category of ['turret', 'wallLow', 'wallHigh']) {
    const geometry = WORLD_GEOMETRY[category];
    const rect = worldSpriteDrawRect({ projectPoint, worldX: 2160, zRel: 130, ...geometry });
    assert.equal(rect.y + rect.height, projectPoint(2160, 0, 130).y);
  }
  const fixedFootprint = worldSpriteDrawRect({ projectPoint, worldX: 0, zRel: 6000, ...WORLD_GEOMETRY.wallLow });
  const plan = buildSpriteDrawPlan({
    metadata: Object.freeze({ frames: 7, frameWidth: 2048, frameHeight: 2048 }),
    worldX: 0,
    zRel: 6000,
    destination: fixedFootprint,
  });
  assert.deepEqual(plan.destination, fixedFootprint, 'transparent atlas padding must not alter projected collision geometry');
});

test('variant selection is deterministic and keeps a drone spawn lane stable through state changes', () => {
  assert.equal(variantKey('unknown', 2, 4), null);
  assert.equal(variantKey('drone', 17, 2), variantKey('drone', 17, 2));
  assert.equal(variantKey('gap', 17, 2), 'gapEdge');
  const drone = { segmentIndex: 17, stableLaneKey: 2, state: 'rest', fromLane: 2 };
  const atRest = variantKey('drone', drone.segmentIndex, drone.stableLaneKey);
  drone.state = 'warn';
  drone.fromLane = 4;
  const atWarn = variantKey('drone', drone.segmentIndex, drone.stableLaneKey);
  drone.state = 'move';
  drone.fromLane = 5;
  const whileMoving = variantKey('drone', drone.segmentIndex, drone.stableLaneKey);
  assert.equal(atRest, atWarn);
  assert.equal(atWarn, whileMoving);
});

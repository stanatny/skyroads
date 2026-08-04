'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  heavySwarmDroneDescriptor,
  isHeavySwarmDroneDescriptor,
} = require('../src/drone-visual.js');

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function assertCoordinate(value, label) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  assert.ok(value >= -1 && value <= 1, `${label} ${value} must stay within [-1, 1]`);
}

function assertLayerInsideBounds(layer, index) {
  if (layer.kind === 'polygon' || layer.kind === 'path') {
    assert.ok(Array.isArray(layer.points) && layer.points.length >= 2, `layer ${index} points`);
    for (const [pointIndex, point] of layer.points.entries()) {
      assertCoordinate(point.x, `layer ${index} point ${pointIndex} x`);
      assertCoordinate(point.y, `layer ${index} point ${pointIndex} y`);
    }
    return;
  }
  assert.equal(layer.kind, 'circle');
  assertCoordinate(layer.x, `layer ${index} circle x`);
  assertCoordinate(layer.y, `layer ${index} circle y`);
  assert.ok(Number.isFinite(layer.radius) && layer.radius > 0, `layer ${index} circle radius`);
  assert.ok(layer.x - layer.radius >= -1 && layer.x + layer.radius <= 1,
    `layer ${index} circle horizontal bounds`);
  assert.ok(layer.y - layer.radius >= -1 && layer.y + layer.radius <= 1,
    `layer ${index} circle vertical bounds`);
}

test('Scout and Striker expose distinct frozen Heavy Swarm geometry inside one envelope', () => {
  const scout = heavySwarmDroneDescriptor({ variant: 'droneScout' });
  const striker = heavySwarmDroneDescriptor({ variant: 'droneStriker' });

  assert.equal(scout.family, 'heavy-swarm');
  assert.equal(scout.variant, 'scout');
  assert.equal(striker.variant, 'striker');
  assert.deepEqual(scout.bounds, { minX: -1, minY: -1, maxX: 1, maxY: 1 });
  assert.deepEqual(striker.bounds, scout.bounds);
  assert.notDeepEqual(striker.layers, scout.layers);
  assert.equal(isHeavySwarmDroneDescriptor(scout), true);
  assert.equal(isHeavySwarmDroneDescriptor(striker), true);
  assertDeepFrozen(scout);
  assertDeepFrozen(striker);
  scout.layers.forEach(assertLayerInsideBounds);
  striker.layers.forEach(assertLayerInsideBounds);
});

test('both variants use every Heavy Swarm material role without literal light-pink body colors', () => {
  const requiredRoles = new Set([
    'armorShadow',
    'armorMid',
    'armorHighlight',
    'podRecess',
    'energy',
    'core',
    'warningLight',
  ]);

  for (const variant of ['droneScout', 'droneStriker']) {
    const descriptor = heavySwarmDroneDescriptor({ variant });
    const roles = new Set(descriptor.layers.map((layer) => layer.role));
    assert.deepEqual([...requiredRoles].filter((role) => !roles.has(role)), [], variant);
    for (const layer of descriptor.layers) {
      assert.equal(typeof layer.color, 'undefined', `${variant} embeds literal color`);
      assert.doesNotMatch(layer.role, /pink/i, `${variant} uses a pink material role`);
    }
  }
});

test('warning input normalizes direction and freezes reduced-motion pulse', () => {
  const movingRight = heavySwarmDroneDescriptor({
    variant: 'droneStriker',
    state: 'warn',
    direction: 7,
    warningPulse: 1.4,
    reducedMotion: false,
  });
  const movingLeftReduced = heavySwarmDroneDescriptor({
    variant: 'droneScout',
    state: 'warn',
    direction: -9,
    warningPulse: 0.12,
    reducedMotion: true,
  });

  assert.deepEqual({
    state: movingRight.state,
    direction: movingRight.direction,
    warningPulse: movingRight.warningPulse,
    reducedMotion: movingRight.reducedMotion,
  }, {
    state: 'warn',
    direction: 1,
    warningPulse: 1,
    reducedMotion: false,
  });
  assert.deepEqual({
    state: movingLeftReduced.state,
    direction: movingLeftReduced.direction,
    warningPulse: movingLeftReduced.warningPulse,
    reducedMotion: movingLeftReduced.reducedMotion,
  }, {
    state: 'warn',
    direction: -1,
    warningPulse: 0.72,
    reducedMotion: true,
  });
});

test('malformed inputs fall back to the safe Scout rest descriptor', () => {
  const fallback = heavySwarmDroneDescriptor({
    variant: 'unknown',
    state: 'broken',
    direction: Number.NaN,
    warningPulse: Number.POSITIVE_INFINITY,
    reducedMotion: 'yes',
  });

  assert.deepEqual({
    family: fallback.family,
    variant: fallback.variant,
    state: fallback.state,
    direction: fallback.direction,
    warningPulse: fallback.warningPulse,
    reducedMotion: fallback.reducedMotion,
  }, {
    family: 'heavy-swarm',
    variant: 'scout',
    state: 'rest',
    direction: 0,
    warningPulse: 0,
    reducedMotion: false,
  });
  assert.equal(isHeavySwarmDroneDescriptor(fallback), true);
  assert.equal(isHeavySwarmDroneDescriptor(null), false);
  assert.equal(isHeavySwarmDroneDescriptor({ family: 'heavy-swarm' }), false);
});

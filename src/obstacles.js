'use strict';

(function attachObstacles(root) {
  const OBSTACLE_HEIGHTS = Object.freeze({
    WALL_LOW: 600,
    WALL_MEDIUM: 1250,
    WALL_HIGH: 2000,
  });

  function jumpApex(jumpCount, {
    jumpVelocity = 7500,
    gravity = 32000,
  } = {}) {
    const count = Math.max(0, Math.trunc(Number(jumpCount) || 0));
    return count * jumpVelocity * jumpVelocity / (2 * gravity);
  }

  function clearanceWindow({
    thresholdHeight,
    launchHeight = 0,
    jumpVelocity = 7500,
    gravity = 32000,
    descentGravityFactor = 1,
  }) {
    const peak = launchHeight + jumpVelocity * jumpVelocity / (2 * gravity);
    const delta = peak - thresholdHeight;
    if (!(delta > 0) || !(descentGravityFactor > 0)) return 0;
    const ascent = Math.sqrt(2 * delta / gravity);
    const descent = Math.sqrt(2 * delta / (gravity * descentGravityFactor));
    return ascent + descent;
  }

  const RUN_CLEARANCE = Object.freeze({
    WALL_LOW: Object.freeze({
      noGlideSeconds: clearanceWindow({ thresholdHeight: 600 }),
      glideSeconds: clearanceWindow({ thresholdHeight: 600, descentGravityFactor: 0.08 }),
    }),
    WALL_MEDIUM: Object.freeze({
      noGlideSeconds: clearanceWindow({ thresholdHeight: 1250, launchHeight: jumpApex(1) }),
      glideSeconds: clearanceWindow({
        thresholdHeight: 1250,
        launchHeight: jumpApex(1),
        descentGravityFactor: 0.08,
      }),
    }),
  });

  function nominalSpeed(segmentIndex, {
    initialSpeed = 8,
    acceleration = 0.4,
    maxSpeed = 24,
  } = {}) {
    const index = Math.max(0, Number(segmentIndex) || 0);
    return Math.min(maxSpeed, Math.sqrt(initialSpeed * initialSpeed + 2 * acceleration * index));
  }

  function runLengthBounds(wallType, speed) {
    const clearance = RUN_CLEARANCE[wallType];
    if (!clearance) throw new RangeError('Unsupported corridor wall type: ' + wallType);
    const velocity = Math.max(0, Number(speed) || 0);
    return Object.freeze({
      minimumLength: Math.ceil(velocity * clearance.noGlideSeconds) + 1,
      maximumSafeLength: Math.floor(velocity * clearance.glideSeconds) - 1,
    });
  }

  function selectRunLength(wallType, speed, randomValue) {
    const bounds = runLengthBounds(wallType, speed);
    const variation = Number(randomValue) >= 0.5 ? 1 : 0;
    return Math.min(bounds.maximumSafeLength, bounds.minimumLength + variation);
  }

  function wallHeight(wallType) {
    return Object.prototype.hasOwnProperty.call(OBSTACLE_HEIGHTS, wallType)
      ? OBSTACLE_HEIGHTS[wallType]
      : null;
  }

  function isWallType(wallType) {
    return wallHeight(wallType) !== null;
  }

  function corridorModulePhase(track, segmentIndex, lane) {
    const segment = track[segmentIndex];
    const corridor = segment && segment.corridor;
    if (!corridor || corridor.lane !== lane || segment.lanes[lane] !== corridor.type) return null;

    function connected(offset) {
      const neighbor = track[segmentIndex + offset];
      const other = neighbor && neighbor.corridor;
      return Boolean(
        other
        && other.id === corridor.id
        && other.lane === corridor.lane
        && other.type === corridor.type
        && neighbor.lanes[lane] === corridor.type
      );
    }

    const before = connected(-1);
    const after = connected(1);
    if (before && after) return 'middle';
    if (before) return 'end';
    if (after) return 'start';
    return 'single';
  }

  const api = Object.freeze({
    OBSTACLE_HEIGHTS,
    RUN_CLEARANCE,
    jumpApex,
    clearanceWindow,
    nominalSpeed,
    runLengthBounds,
    selectRunLength,
    wallHeight,
    isWallType,
    corridorModulePhase,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.obstacles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

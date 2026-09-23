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

  /**
   * advanceCruiseSpeed 按秒推进巡航速度，返回新速度，不修改游戏状态。
   * options 未设 cruiseSoftCap 时沿用有上限的旧曲线；设置后跨阈值精确分段，后段持续缓慢加速。
   * acceleration 为零时冻结整条曲线，保留静止预览所需的零速度。
   */
  function advanceCruiseSpeed(speed, dt, {
    acceleration = 0.4,
    maxSpeed = 24,
    cruiseSoftCap,
    cruiseTailAcceleration = 0.1,
  } = {}) {
    const velocity = Math.max(0, Number(speed) || 0);
    const seconds = Math.max(0, Number(dt) || 0);
    if (!(acceleration > 0) || seconds === 0) return velocity;
    if (!Number.isFinite(cruiseSoftCap)) {
      return Math.min(maxSpeed, velocity + acceleration * seconds);
    }
    const timeToThreshold = Math.max(0, (cruiseSoftCap - velocity) / acceleration);
    const initialSeconds = Math.min(seconds, timeToThreshold);
    const tailAcceleration = Math.max(0, Number(cruiseTailAcceleration) || 0);
    return velocity + acceleration * initialSeconds
      + tailAcceleration * (seconds - initialSeconds);
  }

  /**
   * nominalSpeed 根据行驶段数和 options 预测不减速、无奖励时的巡航速度，供生成器预留通行空间。
   * 软阈值前后分别按各自的加速度计算距离；结果与 advanceCruiseSpeed 的时间曲线一致。
   */
  function nominalSpeed(segmentIndex, {
    initialSpeed = 8,
    acceleration = 0.4,
    maxSpeed = 24,
    cruiseSoftCap,
    cruiseTailAcceleration = 0.1,
  } = {}) {
    const index = Math.max(0, Number(segmentIndex) || 0);
    if (!Number.isFinite(cruiseSoftCap)) {
      return Math.min(maxSpeed, Math.sqrt(initialSpeed * initialSpeed + 2 * acceleration * index));
    }
    if (!(acceleration > 0)) return initialSpeed;
    const thresholdSpeed = Math.max(initialSpeed, cruiseSoftCap);
    const thresholdDistance = (thresholdSpeed * thresholdSpeed - initialSpeed * initialSpeed)
      / (2 * acceleration);
    if (index <= thresholdDistance) {
      return Math.sqrt(initialSpeed * initialSpeed + 2 * acceleration * index);
    }
    const tailAcceleration = Math.max(0, Number(cruiseTailAcceleration) || 0);
    return Math.sqrt(thresholdSpeed * thresholdSpeed
      + 2 * tailAcceleration * (index - thresholdDistance));
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
    advanceCruiseSpeed,
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

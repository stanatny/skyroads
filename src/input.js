'use strict';

(function attachInput(root) {
  const MOVEMENT_TUNING = Object.freeze({
    laneCount: 7,
    tapDurationMs: 145,
    holdDelayMs: 0,           // 长按不再等待自动重复；跨道保持连续速度
    repeatDurationMs: 110,
  });
  const HITBOX = Object.freeze({
    playerHalfWidth: 0.14,
    wallHalfWidth: 0.42,
    pickupRadius: 0.38,
    droneHalfWidth: 0.22,
    turretHalfWidth: 0.26,
    projectileHalfWidth: 0.08,
  });

  function clampLanePosition(lanePosition) {
    const numericPosition = Number(lanePosition);
    if (!Number.isFinite(numericPosition)) return Math.floor(MOVEMENT_TUNING.laneCount / 2);
    return Math.max(0, Math.min(MOVEMENT_TUNING.laneCount - 1, numericPosition));
  }

  function createMovementState(lanePosition = Math.floor(MOVEMENT_TUNING.laneCount / 2)) {
    const initialLane = clampLanePosition(lanePosition);
    return {
      lanePosition: initialLane,
      previousLanePosition: initialLane,
      laneVelocity: 0,          // 车道/毫秒，与插值曲线使用同一真值
      segmentStart: initialLane,
      segmentSource: initialLane,
      segmentTarget: initialLane,
      segmentElapsedMs: 0,
      segmentDurationMs: 0,
      segmentLaneDurationMs: MOVEMENT_TUNING.tapDurationMs,
      segmentStartVelocity: 0,
      segmentEndVelocity: 0,
      heldLeft: false,
      heldRight: false,
      heldSinceLeftMs: null,
      heldSinceRightMs: null,
      activeDirection: 0,
      pressedAt: null,
      repeatEligibleAt: Infinity,
      clockMs: 0,
      segmentActive: false,
    };
  }

  function movementSnapshot(state) {
    return Object.assign({}, state);
  }

  function resetMovement(state, lanePosition = Math.floor(MOVEMENT_TUNING.laneCount / 2)) {
    Object.assign(state, createMovementState(lanePosition));
    return movementSnapshot(state);
  }

  function isDirection(dir) {
    return dir === -1 || dir === 1;
  }

  function isHeld(state, dir) {
    return dir === -1 ? state.heldLeft : state.heldRight;
  }

  function heldSince(state, dir) {
    return dir === -1 ? state.heldSinceLeftMs : state.heldSinceRightMs;
  }

  function setHeld(state, dir, held) {
    if (dir === -1) {
      state.heldLeft = held;
      state.heldSinceLeftMs = held ? state.clockMs : null;
    } else {
      state.heldRight = held;
      state.heldSinceRightMs = held ? state.clockMs : null;
    }
  }

  function setActiveDirection(state, dir, pressedAt) {
    state.activeDirection = dir;
    state.pressedAt = dir === 0 ? null : pressedAt;
    state.repeatEligibleAt = dir === 0 ? Infinity : pressedAt + MOVEMENT_TUNING.holdDelayMs;
  }

  // Hermite 插值保留两端速度：点按两端为零，长按跨道两端为巡航速度。
  // 每段始终单调，因此游戏用子步首尾位置进行碰撞扫掠不会漏掉回折路径。
  function beginSegment(state, source, target, start, laneDurationMs,
    startVelocity = 0, endVelocity = 0, durationMs = Math.abs(target - start) * laneDurationMs) {
    if (target < 0 || target >= MOVEMENT_TUNING.laneCount || target === start || durationMs <= 0) return false;
    const direction = Math.sign(target - start);
    const maximumSlope = 3 * Math.abs(target - start) / durationMs;
    state.segmentStart = start;
    state.segmentSource = source;
    state.segmentTarget = target;
    state.segmentElapsedMs = 0;
    state.segmentLaneDurationMs = laneDurationMs;
    state.segmentDurationMs = durationMs;
    state.segmentStartVelocity = direction * Math.min(maximumSlope, Math.max(0, direction * startVelocity));
    state.segmentEndVelocity = direction * Math.min(maximumSlope, Math.max(0, direction * endVelocity));
    state.laneVelocity = state.segmentStartVelocity;
    state.segmentActive = true;
    return true;
  }

  function heldVelocityAtTarget(state, target, dir) {
    if (!isHeld(state, dir) || state.activeDirection !== dir
      || target === 0 || target === MOVEMENT_TUNING.laneCount - 1) return 0;
    return dir / MOVEMENT_TUNING.repeatDurationMs;
  }

  function beginAdjacentSegment(state, dir, laneDurationMs, allowHeld = false) {
    if (state.segmentActive || !isDirection(dir)) return false;
    const source = state.lanePosition;
    const target = dir > 0 ? Math.floor(source + 1e-9) + 1 : Math.ceil(source - 1e-9) - 1;
    return beginSegment(state, source, target, source, laneDurationMs, state.laneVelocity,
      allowHeld ? heldVelocityAtTarget(state, target, dir) : 0);
  }

  function segmentDirection(state) {
    return Math.sign(state.segmentTarget - state.segmentStart);
  }

  function retargetSegmentVelocity(state, endVelocity) {
    if (!state.segmentActive) return;
    const remainingMs = state.segmentDurationMs - state.segmentElapsedMs;
    if (remainingMs <= 0) return;
    beginSegment(state, state.segmentSource, state.segmentTarget, state.lanePosition,
      state.segmentLaneDurationMs, state.laneVelocity, endVelocity, remainingMs);
  }

  function reverseActiveSegment(state, dir) {
    if (!state.segmentActive) return false;
    const oldTarget = state.segmentTarget;
    const target = dir > 0 ? Math.ceil(state.lanePosition) : Math.floor(state.lanePosition);
    // 反向按键是主动调向：当前位置不变，取消原方向的惯性，避免一个子步来回折返。
    state.laneVelocity = 0;
    if (target === state.lanePosition) {
      state.segmentActive = false;
      beginAdjacentSegment(state, dir, MOVEMENT_TUNING.tapDurationMs, true);
    } else {
      beginSegment(state, oldTarget, target, state.lanePosition, MOVEMENT_TUNING.tapDurationMs,
        0, heldVelocityAtTarget(state, target, dir));
    }
    return true;
  }

  function pressDirection(state, dir) {
    if (!isDirection(dir) || isHeld(state, dir)) return { started: false, reversed: false };
    setHeld(state, dir, true);
    setActiveDirection(state, dir, state.clockMs);
    if (state.segmentActive && segmentDirection(state) === -dir) {
      return { started: false, reversed: reverseActiveSegment(state, dir) };
    }
    if (state.segmentActive) {
      retargetSegmentVelocity(state, heldVelocityAtTarget(state, state.segmentTarget, dir));
      return { started: false, reversed: false };
    }
    return { started: beginAdjacentSegment(state, dir, MOVEMENT_TUNING.tapDurationMs, true), reversed: false };
  }

  function releaseDirection(state, dir) {
    if (!isDirection(dir) || !isHeld(state, dir)) return { reversed: false };
    setHeld(state, dir, false);
    if (state.activeDirection !== dir) return { reversed: false };
    const restoredDirection = isHeld(state, -dir) ? -dir : 0;
    setActiveDirection(state, restoredDirection, restoredDirection === 0 ? null : heldSince(state, restoredDirection));
    if (state.segmentActive && restoredDirection !== 0 && segmentDirection(state) === -restoredDirection) {
      return { reversed: reverseActiveSegment(state, restoredDirection) };
    }
    if (restoredDirection === 0) retargetSegmentVelocity(state, 0);
    else if (!state.segmentActive) beginAdjacentSegment(state, restoredDirection, MOVEMENT_TUNING.tapDurationMs, true);
    return { reversed: false };
  }

  function requestDiscreteLaneChange(state, dir) {
    return {
      started: isDirection(dir)
        ? beginAdjacentSegment(state, dir, MOVEMENT_TUNING.tapDurationMs)
        : false,
    };
  }

  function clearHeldDirections(state) {
    state.heldLeft = false;
    state.heldRight = false;
    state.heldSinceLeftMs = null;
    state.heldSinceRightMs = null;
    setActiveDirection(state, 0, null);
    retargetSegmentVelocity(state, 0);
    return movementSnapshot(state);
  }

  // 台边或实体墙可以截断当前横移，保留按键意图以便起跳后继续或立即反向退出。
  function stopMovementAt(state, lanePosition) {
    const stoppedPosition = clampLanePosition(lanePosition);
    Object.assign(state, {
      lanePosition: stoppedPosition,
      previousLanePosition: stoppedPosition,
      laneVelocity: 0,
      segmentStart: stoppedPosition,
      segmentSource: stoppedPosition,
      segmentTarget: stoppedPosition,
      segmentElapsedMs: 0,
      segmentDurationMs: 0,
      segmentStartVelocity: 0,
      segmentEndVelocity: 0,
      segmentActive: false,
    });
    return movementSnapshot(state);
  }

  function beginEligibleRepeat(state) {
    if (state.segmentActive || state.activeDirection === 0 || !isHeld(state, state.activeDirection)) return false;
    return beginAdjacentSegment(state, state.activeDirection, MOVEMENT_TUNING.repeatDurationMs, true);
  }

  function advanceMovement(state, deltaMs) {
    const previousLanePosition = state.lanePosition;
    state.previousLanePosition = previousLanePosition;
    let remainingMs = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    let segmentsStarted = 0;
    while (remainingMs > 0) {
      if (!state.segmentActive) {
        if (beginEligibleRepeat(state)) {
          segmentsStarted += 1;
          continue;
        }
        state.laneVelocity = 0;
        state.clockMs += remainingMs;
        break;
      }
      const consumedMs = Math.min(remainingMs, state.segmentDurationMs - state.segmentElapsedMs);
      state.segmentElapsedMs += consumedMs;
      state.clockMs += consumedMs;
      remainingMs -= consumedMs;
      const t = Math.min(1, state.segmentElapsedMs / state.segmentDurationMs);
      const t2 = t * t;
      const t3 = t2 * t;
      const distance = state.segmentTarget - state.segmentStart;
      const startSlope = state.segmentStartVelocity * state.segmentDurationMs;
      const endSlope = state.segmentEndVelocity * state.segmentDurationMs;
      state.lanePosition = state.segmentStart + distance * (3 * t2 - 2 * t3)
        + startSlope * (t3 - 2 * t2 + t) + endSlope * (t3 - t2);
      state.laneVelocity = (distance * (6 * t - 6 * t2)
        + startSlope * (3 * t2 - 4 * t + 1) + endSlope * (3 * t2 - 2 * t)) / state.segmentDurationMs;
      if (state.segmentElapsedMs >= state.segmentDurationMs) {
        state.lanePosition = state.segmentTarget;
        state.laneVelocity = state.segmentEndVelocity;
        state.segmentElapsedMs = state.segmentDurationMs;
        state.segmentActive = false;
        if (beginEligibleRepeat(state)) segmentsStarted += 1;
        else state.laneVelocity = 0;
      }
    }
    return { previousLanePosition, lanePosition: state.lanePosition, segmentsStarted };
  }

  function directionForCode(code) {
    if (code === 'ArrowLeft' || code === 'KeyA') return -1;
    if (code === 'ArrowRight' || code === 'KeyD') return 1;
    return 0;
  }

  function shouldHandleGameInput(descriptor) {
    return descriptor.mode === 'PLAYING'
      && !descriptor.targetInsideAppUi
      && !descriptor.modalOpen;
  }

  function intervalsOverlap(centerA, halfA, centerB, halfB) {
    return Math.abs(centerA - centerB) <= halfA + halfB;
  }

  function sweptPointDistance(from, to, point) {
    const minimum = Math.min(from, to);
    const maximum = Math.max(from, to);
    if (point < minimum) return minimum - point;
    if (point > maximum) return point - maximum;
    return 0;
  }

  function sweptIntervalsOverlap(from, to, movingHalf, fixedCenter, fixedHalf) {
    const sweptMinimum = Math.min(from, to) - movingHalf;
    const sweptMaximum = Math.max(from, to) + movingHalf;
    return sweptMaximum >= fixedCenter - fixedHalf
      && sweptMinimum <= fixedCenter + fixedHalf;
  }

  function laneTileContaining(lanePosition, laneCount = MOVEMENT_TUNING.laneCount) {
    const count = Number.isInteger(laneCount) && laneCount > 0 ? laneCount : MOVEMENT_TUNING.laneCount;
    const position = Number.isFinite(lanePosition) ? lanePosition : 0;
    return Math.max(0, Math.min(count - 1, Math.floor(position + 0.5)));
  }

  function hitboxHalfWidthForEnemy(type) {
    if (type === 'drone') return HITBOX.droneHalfWidth;
    if (type === 'turret') return HITBOX.turretHalfWidth;
    return 0;
  }

  function isWallType(type) {
    return typeof type === 'string' && /^wall(?:[-_]|$)/i.test(type);
  }

  function findIntersectedWallLane(
    lanes,
    projectileLane,
    projectileHalf = HITBOX.projectileHalfWidth,
    wallHalf = HITBOX.wallHalfWidth,
  ) {
    if (!Array.isArray(lanes)) return null;
    let intersectedLane = null;
    let closestDistance = Infinity;
    for (let lane = 0; lane < lanes.length; lane += 1) {
      const distance = Math.abs(projectileLane - lane);
      if (isWallType(lanes[lane])
        && distance <= projectileHalf + wallHalf
        && distance < closestDistance) {
        intersectedLane = lane;
        closestDistance = distance;
      }
    }
    return intersectedLane;
  }

  const api = Object.freeze({
    MOVEMENT_TUNING,
    HITBOX,
    createMovementState,
    resetMovement,
    pressDirection,
    releaseDirection,
    requestDiscreteLaneChange,
    advanceMovement,
    clearHeldDirections,
    stopMovementAt,
    movementSnapshot,
    directionForCode,
    shouldHandleGameInput,
    intervalsOverlap,
    sweptPointDistance,
    sweptIntervalsOverlap,
    laneTileContaining,
    hitboxHalfWidthForEnemy,
    findIntersectedWallLane,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.input = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

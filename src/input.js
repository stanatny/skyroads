'use strict';

(function attachInput(root) {
  const MOVEMENT_TUNING = Object.freeze({
    laneCount: 7,
    tapDurationMs: 145,
    holdDelayMs: 140,
    repeatDurationMs: 85,
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
      segmentStart: initialLane,
      segmentSource: initialLane,
      segmentTarget: initialLane,
      segmentElapsedMs: 0,
      segmentDurationMs: 0,
      segmentLaneDurationMs: MOVEMENT_TUNING.tapDurationMs,
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

  function smoothstep01(t) {
    return t * t * (3 - 2 * t);
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

  function beginSegment(state, source, target, start, laneDurationMs) {
    if (target < 0 || target >= MOVEMENT_TUNING.laneCount || target === start) return false;
    state.segmentStart = start;
    state.segmentSource = source;
    state.segmentTarget = target;
    state.segmentElapsedMs = 0;
    state.segmentLaneDurationMs = laneDurationMs;
    state.segmentDurationMs = Math.abs(target - start) * laneDurationMs;
    state.segmentActive = state.segmentDurationMs > 0;
    return state.segmentActive;
  }

  function beginAdjacentSegment(state, dir, laneDurationMs) {
    if (state.segmentActive || !isDirection(dir)) return false;
    const source = state.lanePosition;
    const target = source + dir;
    return beginSegment(state, source, target, source, laneDurationMs);
  }

  function segmentDirection(state) {
    return Math.sign(state.segmentTarget - state.segmentStart);
  }

  function reverseActiveSegment(state) {
    if (!state.segmentActive) return false;
    const oldSource = state.segmentSource;
    const oldTarget = state.segmentTarget;
    const laneDurationMs = state.segmentLaneDurationMs;
    if (state.lanePosition === oldSource) {
      state.segmentStart = state.lanePosition;
      state.segmentSource = oldTarget;
      state.segmentTarget = oldSource;
      state.segmentElapsedMs = 0;
      state.segmentDurationMs = 0;
      state.segmentLaneDurationMs = laneDurationMs;
      state.segmentActive = false;
      return true;
    }
    return beginSegment(state, oldTarget, oldSource, state.lanePosition, laneDurationMs);
  }

  function pressDirection(state, dir) {
    if (!isDirection(dir) || isHeld(state, dir)) return { started: false, reversed: false };

    setHeld(state, dir, true);
    setActiveDirection(state, dir, state.clockMs);

    if (state.segmentActive && segmentDirection(state) === -dir) {
      return { started: false, reversed: reverseActiveSegment(state) };
    }

    return {
      started: beginAdjacentSegment(state, dir, MOVEMENT_TUNING.tapDurationMs),
      reversed: false,
    };
  }

  function releaseDirection(state, dir) {
    if (!isDirection(dir) || !isHeld(state, dir)) return { reversed: false };

    setHeld(state, dir, false);
    if (state.activeDirection !== dir) return { reversed: false };

    const restoredDirection = isHeld(state, -dir) ? -dir : 0;
    const restoredPressedAt = restoredDirection === 0 ? null : heldSince(state, restoredDirection);
    setActiveDirection(state, restoredDirection, restoredPressedAt);

    if (state.segmentActive && restoredDirection !== 0 && segmentDirection(state) === -restoredDirection) {
      return { reversed: reverseActiveSegment(state) };
    }
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
    return movementSnapshot(state);
  }

  function beginEligibleRepeat(state) {
    if (state.segmentActive || state.activeDirection === 0) return false;
    if (!isHeld(state, state.activeDirection) || state.clockMs < state.repeatEligibleAt) return false;
    return beginAdjacentSegment(state, state.activeDirection, MOVEMENT_TUNING.repeatDurationMs);
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

        const waitsForHeldRepeat = state.activeDirection !== 0
          && isHeld(state, state.activeDirection)
          && state.clockMs < state.repeatEligibleAt;
        if (waitsForHeldRepeat) {
          const waitMs = Math.min(remainingMs, state.repeatEligibleAt - state.clockMs);
          state.clockMs += waitMs;
          remainingMs -= waitMs;
          continue;
        }

        state.clockMs += remainingMs;
        remainingMs = 0;
        continue;
      }

      const segmentRemainingMs = state.segmentDurationMs - state.segmentElapsedMs;
      const consumedMs = Math.min(remainingMs, segmentRemainingMs);
      state.segmentElapsedMs += consumedMs;
      state.clockMs += consumedMs;
      remainingMs -= consumedMs;

      const progress = state.segmentElapsedMs / state.segmentDurationMs;
      const easedProgress = smoothstep01(Math.min(1, progress));
      state.lanePosition = state.segmentStart
        + (state.segmentTarget - state.segmentStart) * easedProgress;

      if (state.segmentElapsedMs >= state.segmentDurationMs) {
        state.lanePosition = state.segmentTarget;
        state.segmentElapsedMs = state.segmentDurationMs;
        state.segmentActive = false;
        if (beginEligibleRepeat(state)) segmentsStarted += 1;
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

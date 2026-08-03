const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMovementState,
  pressDirection,
  releaseDirection,
  requestDiscreteLaneChange,
  advanceMovement,
  clearHeldDirections,
  directionForCode,
  shouldHandleGameInput,
  intervalsOverlap,
  sweptPointDistance,
  sweptIntervalsOverlap,
  laneTileContaining,
  hitboxHalfWidthForEnemy,
  findIntersectedWallLane,
} = require('../src/input.js');

test('gameplay input is disabled while UI owns keyboard focus', () => {
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:false, modalOpen:false }), true);
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:true, modalOpen:false }), false);
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:false, modalOpen:true }), false);
  assert.equal(shouldHandleGameInput({ mode:'MENU', targetInsideAppUi:false, modalOpen:false }), false);
});

test('tap completes exactly one lane in 145ms', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  releaseDirection(state, 1);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3.5);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('hold carries leftover time into an 85ms repeat segment', () => {
  const state = createMovementState(1);
  pressDirection(state, 1);
  advanceMovement(state, 187.5);
  assert.equal(state.lanePosition, 2.5);
});

test('opposite press reverses without a position jump', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 72.5);
  const before = state.lanePosition;
  const result = pressDirection(state, -1);
  assert.equal(result.reversed, true);
  assert.equal(state.lanePosition, before);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3);
});

test('zero-progress opposite press cancels the stale segment', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  const result = pressDirection(state, -1);
  assert.equal(result.reversed, true);
  assert.equal(state.lanePosition, 3);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3);
  assert.equal(state.activeDirection, -1);
});

test('first segment completes at 145ms, not 144ms', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  releaseDirection(state, 1);
  advanceMovement(state, 144);
  assert.ok(state.lanePosition < 4);
  advanceMovement(state, 1);
  assert.equal(state.lanePosition, 4);
});

test('hold shorter than 140ms does not repeat', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 139);
  releaseDirection(state, 1);
  advanceMovement(state, 6);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('holding through the delay starts repeat at the first boundary', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 145);
  assert.equal(state.lanePosition, 4);
  assert.equal(state.segmentActive, true);
  assert.equal(state.segmentTarget, 5);
  assert.equal(state.segmentDurationMs, 85);
});

test('same timeline is frame-rate independent', () => {
  const run = (frameDurationMs) => {
    const state = createMovementState(1);
    pressDirection(state, 1);
    let remainingMs = 187.5;
    while (remainingMs > 0) {
      const deltaMs = Math.min(frameDurationMs, remainingMs);
      advanceMovement(state, deltaMs);
      remainingMs -= deltaMs;
    }
    return state.lanePosition;
  };

  assert.ok(Math.abs(run(187.5) - 2.5) <= 1e-9);
  assert.ok(Math.abs(run(1000 / 30) - 2.5) <= 1e-9);
  assert.ok(Math.abs(run(1000 / 60) - 2.5) <= 1e-9);
  assert.ok(Math.abs(run(1000 / 120) - 2.5) <= 1e-9);
});

test('release during repeat finishes the current lane and discards future lanes', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 160);
  releaseDirection(state, 1);
  advanceMovement(state, 70);
  assert.equal(state.lanePosition, 5);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 5);
});

test('last pressed wins and releasing it restores the still-held direction', () => {
  const state = createMovementState(3);
  pressDirection(state, -1);
  advanceMovement(state, 72.5);
  pressDirection(state, 1);
  const before = state.lanePosition;
  const result = releaseDirection(state, 1);
  assert.equal(result.reversed, true);
  assert.equal(state.activeDirection, -1);
  assert.equal(state.lanePosition, before);
});

test('edge hold starts no segment', () => {
  const state = createMovementState(0);
  const pressed = pressDirection(state, -1);
  const advanced = advanceMovement(state, 500);
  assert.equal(pressed.started, false);
  assert.equal(state.lanePosition, 0);
  assert.equal(state.segmentActive, false);
  assert.equal(advanced.segmentsStarted, 0);
});

test('clear held directions prevents sticky movement', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 100);
  clearHeldDirections(state);
  advanceMovement(state, 45);
  assert.equal(state.lanePosition, 4);
  assert.equal(state.segmentActive, false);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('touch requests one lane and never repeat', () => {
  const state = createMovementState(3);
  assert.deepEqual(requestDiscreteLaneChange(state, 1), { started: true });
  assert.deepEqual(requestDiscreteLaneChange(state, 1), { started: false });
  advanceMovement(state, 145);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('directionForCode maps only ArrowLeft/KeyA/ArrowRight/KeyD', () => {
  assert.equal(directionForCode('ArrowLeft'), -1);
  assert.equal(directionForCode('KeyA'), -1);
  assert.equal(directionForCode('ArrowRight'), 1);
  assert.equal(directionForCode('KeyD'), 1);
  for (const code of ['a', 'd', 'ArrowUp', 'KeyW', '', null]) {
    assert.equal(directionForCode(code), 0);
  }
});

test('wall sweep catches crossing overlap but permits visible clearance', () => {
  assert.equal(sweptIntervalsOverlap(3, 3.5, 0.14, 4, 0.42), true);
  assert.equal(sweptIntervalsOverlap(3, 3.43, 0.14, 4, 0.42), false);
});

test('pickup sweep uses the 0.38-lane radius', () => {
  assert.ok(sweptPointDistance(3, 3.62, 4) <= 0.38 + Number.EPSILON);
  assert.ok(sweptPointDistance(3, 3.61, 4) > 0.38);
});

test('gap support changes at the lane midpoint', () => {
  assert.equal(laneTileContaining(3.49), 3);
  assert.equal(laneTileContaining(3.50), 4);
});

test('projectile at a floating position returns an integer wall lane', () => {
  const lanes = ['road', 'road', 'road', 'road', 'wall-high', 'road', 'road'];
  assert.equal(findIntersectedWallLane(lanes, 3.50), 4);
});

test('enemy hitboxes overlap at the exact rendered-width boundaries', () => {
  assert.equal(hitboxHalfWidthForEnemy('drone'), 0.22);
  assert.equal(intervalsOverlap(3, 0.14, 3.36, 0.22), true);
  assert.equal(intervalsOverlap(3, 0.14, 3.360001, 0.22), false);
  assert.equal(hitboxHalfWidthForEnemy('turret'), 0.26);
  assert.equal(intervalsOverlap(3, 0.14, 3.40, 0.26), true);
  assert.equal(intervalsOverlap(3, 0.14, 3.400001, 0.26), false);
});

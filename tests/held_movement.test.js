'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MOVEMENT_TUNING, createMovementState, pressDirection, releaseDirection,
  advanceMovement, clearHeldDirections, requestDiscreteLaneChange,
  stopMovementAt,
} = require('../src/input');

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function advanceFrames(state, duration, frame = 1000 / 60) {
  let remaining = duration;
  while (remaining > 0) {
    const delta = Math.min(frame, remaining);
    advanceMovement(state, delta);
    remaining -= delta;
  }
}

test('held movement has constant measured frame velocity across every interior lane center', () => {
  const cruise = 1000 / MOVEMENT_TUNING.repeatDurationMs;
  for (const frame of [1000 / 30, 1000 / 60, 1000 / 120, 1000 / 240]) {
    const state = createMovementState(0);
    pressDirection(state, 1);
    advanceFrames(state, MOVEMENT_TUNING.tapDurationMs, frame);
    const measured = [];
    while (state.clockMs + frame < 580) {
      const before = state.lanePosition;
      const step = advanceMovement(state, frame);
      measured.push((state.lanePosition - before) / (frame / 1000));
      assert.equal(step.previousLanePosition, before);
      assert.equal(step.lanePosition, state.lanePosition);
    }
    assert.ok(measured.length >= 13);
    close(Math.min(...measured), cruise);
    close(Math.max(...measured), cruise);
  }
});

test('position derivatives agree on both sides of each held lane boundary', () => {
  for (const direction of [-1, 1]) {
    for (const boundary of [145, 255, 365, 475, 585]) {
      const state = createMovementState(direction > 0 ? 0 : 6);
      pressDirection(state, direction);
      const epsilon = 0.001;
      advanceMovement(state, boundary - epsilon);
      const before = state.lanePosition;
      advanceMovement(state, epsilon);
      const at = state.lanePosition;
      advanceMovement(state, epsilon);
      const after = state.lanePosition;
      close((at - before) / epsilon, (after - at) / epsilon, 3e-7);
      close(state.laneVelocity, direction / 110, 3e-7);
    }
  }
});

test('release preserves instantaneous position and velocity and settles only its selected center', () => {
  for (const releaseTime of [1, 40, 100, 144, 146, 210, 254, 320, 550]) {
    const state = createMovementState(0);
    pressDirection(state, 1);
    advanceMovement(state, releaseTime);
    const position = state.lanePosition;
    const velocity = state.laneVelocity;
    const target = state.segmentTarget;
    releaseDirection(state, 1);
    close(state.lanePosition, position);
    close(state.laneVelocity, velocity);
    let previous = position;
    for (let frame = 0; frame < 180; frame += 1) {
      advanceMovement(state, 1000 / 240);
      assert.ok(state.lanePosition >= previous - 1e-12);
      assert.ok(state.lanePosition <= target + 1e-12);
      previous = state.lanePosition;
    }
    assert.equal(state.lanePosition, target);
    assert.equal(state.laneVelocity, 0);
    assert.equal(state.segmentActive, false);
  }
});

test('reversal and last-pressed restoration never teleport or fold a swept movement step', () => {
  const state = createMovementState(1);
  pressDirection(state, 1);
  advanceMovement(state, 210);
  const beforeReverse = state.lanePosition;
  assert.equal(pressDirection(state, -1).reversed, true);
  assert.equal(state.lanePosition, beforeReverse);
  let previous = state.lanePosition;
  for (let frame = 0; frame < 8; frame += 1) {
    const step = advanceMovement(state, 4);
    assert.ok(step.lanePosition <= previous);
    previous = step.lanePosition;
  }
  assert.equal(releaseDirection(state, -1).reversed, true);
  assert.equal(state.lanePosition, previous);
  assert.equal(state.activeDirection, 1);
  for (let frame = 0; frame < 8; frame += 1) {
    const step = advanceMovement(state, 4);
    assert.ok(step.lanePosition >= previous);
    previous = step.lanePosition;
  }
});

test('one large step and mixed frame partitions agree through holds, reversals, and releases', () => {
  const run = (frame) => {
    const state = createMovementState(1);
    const checkpoints = [];
    pressDirection(state, 1);
    advanceFrames(state, 213, frame);
    checkpoints.push([state.lanePosition, state.laneVelocity]);
    pressDirection(state, -1);
    advanceFrames(state, 31, frame);
    checkpoints.push([state.lanePosition, state.laneVelocity]);
    releaseDirection(state, -1);
    advanceFrames(state, 81, frame);
    checkpoints.push([state.lanePosition, state.laneVelocity]);
    releaseDirection(state, 1);
    advanceFrames(state, 800, frame);
    checkpoints.push([state.lanePosition, state.laneVelocity]);
    return checkpoints.flat();
  };
  const reference = run(10000);
  for (const frame of [1000 / 30, 1000 / 60, 1000 / 144, 3.7]) {
    run(frame).forEach((value, index) => close(value, reference[index]));
  }
});

test('pause cleanup cancels continuing hold while preserving its in-flight center settlement', () => {
  const state = createMovementState(0);
  pressDirection(state, 1);
  advanceMovement(state, 320);
  const position = state.lanePosition;
  const target = state.segmentTarget;
  clearHeldDirections(state);
  assert.equal(state.lanePosition, position);
  assert.equal(state.segmentActive, true);
  assert.equal(state.activeDirection, 0);
  assert.equal(state.heldRight, false);
  advanceMovement(state, 1000);
  assert.equal(state.lanePosition, target);
  assert.equal(state.laneVelocity, 0);
  advanceMovement(state, 10000);
  assert.equal(state.lanePosition, target);
});

test('holding to either track edge stops cleanly and discrete changes still stop after one lane', () => {
  for (const direction of [-1, 1]) {
    const state = createMovementState(3);
    pressDirection(state, direction);
    advanceMovement(state, 100000);
    assert.equal(state.lanePosition, direction > 0 ? 6 : 0);
    assert.equal(state.laneVelocity, 0);
    assert.equal(state.segmentActive, false);
    releaseDirection(state, direction);
    const lane = state.lanePosition;
    assert.equal(requestDiscreteLaneChange(state, -direction).started, true);
    advanceMovement(state, 10000);
    assert.equal(state.lanePosition, lane - direction);
    assert.equal(state.segmentActive, false);
  }
});

test('terrain can stop at a fractional edge while keeping held intent, clock, and reverse escape', () => {
  const state = createMovementState(1);
  pressDirection(state, 1);
  advanceMovement(state, 190);
  const clock = state.clockMs;
  stopMovementAt(state, 2.36);
  assert.equal(state.lanePosition, 2.36);
  assert.equal(state.segmentActive, false);
  assert.equal(state.laneVelocity, 0);
  assert.equal(state.activeDirection, 1);
  assert.equal(state.heldRight, true);
  assert.equal(state.clockMs, clock);
  advanceMovement(state, 10);
  assert.ok(state.lanePosition > 2.36);
  stopMovementAt(state, 2.36);
  pressDirection(state, -1);
  assert.equal(state.lanePosition, 2.36);
  advanceMovement(state, 10);
  assert.ok(state.lanePosition < 2.36);
  assert.equal(state.activeDirection, -1);
  stopMovementAt(state, -2);
  assert.equal(state.lanePosition, 0);
  stopMovementAt(state, 9);
  assert.equal(state.lanePosition, 6);
});

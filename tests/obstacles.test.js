'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OBSTACLE_HEIGHTS,
  jumpApex,
  clearanceWindow,
  nominalSpeed,
  runLengthBounds,
  selectRunLength,
  wallHeight,
  isWallType,
  corridorModulePhase,
} = require('../src/obstacles.js');

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' != ' + expected);
}

test('jump envelopes preserve all three approved apex values', () => {
  close(jumpApex(1), 878.90625);
  close(jumpApex(2), 1757.8125);
  close(jumpApex(3), 2636.71875);
});

test('signposted clearance windows use the unchanged glide factor', () => {
  close(clearanceWindow({ thresholdHeight: 600 }), 0.2640579, 1e-6);
  close(clearanceWindow({ thresholdHeight: 600, descentGravityFactor: 0.08 }), 0.5988217, 1e-6);
  close(clearanceWindow({ thresholdHeight: 1250, launchHeight: 878.90625 }), 0.3563048, 1e-6);
  close(clearanceWindow({
    thresholdHeight: 1250,
    launchHeight: 878.90625,
    descentGravityFactor: 0.08,
  }), 0.8080, 2e-4);
});

test('nominal speeds and run bounds match the approved table', () => {
  const rows = [
    [100, 12, [5, 6], [6, 8]],
    [240, 16, [6, 8], [7, 11]],
    [420, 20, [7, 10], [9, 15]],
    [640, 24, [8, 13], [10, 18]],
  ];
  for (const [index, speed, low, medium] of rows) {
    close(nominalSpeed(index), speed);
    assert.deepEqual(Object.values(runLengthBounds('WALL_LOW', speed)), low);
    assert.deepEqual(Object.values(runLengthBounds('WALL_MEDIUM', speed)), medium);
    assert.equal(selectRunLength('WALL_LOW', speed, 0), low[0]);
    assert.equal(selectRunLength('WALL_LOW', speed, 0.999), Math.min(low[0] + 1, low[1]));
    assert.equal(selectRunLength('WALL_MEDIUM', speed, 0), medium[0]);
    assert.equal(selectRunLength('WALL_MEDIUM', speed, 0.999), Math.min(medium[0] + 1, medium[1]));
  }
});

test('wall lookup has an exact three-tier vocabulary', () => {
  assert.deepEqual(OBSTACLE_HEIGHTS, {
    WALL_LOW: 600,
    WALL_MEDIUM: 1250,
    WALL_HIGH: 2000,
  });
  for (const type of Object.keys(OBSTACLE_HEIGHTS)) {
    assert.equal(isWallType(type), true);
    assert.equal(wallHeight(type), OBSTACLE_HEIGHTS[type]);
  }
  assert.equal(isWallType('GAP'), false);
  assert.equal(wallHeight('ROAD'), null);
});

function corridorTrack() {
  return Array.from({ length: 5 }, (_, index) => ({
    lanes: ['ROAD', 'ROAD', 'WALL_LOW'],
    corridor: { id: 42, lane: 2, type: 'WALL_LOW', index, length: 5 },
  }));
}

test('corridor phases immediately follow surviving adjacent wall tiles', () => {
  const track = corridorTrack();
  assert.deepEqual(
    track.map((segment, index) => corridorModulePhase(track, index, 2)),
    ['start', 'middle', 'middle', 'middle', 'end'],
  );

  track[2].lanes[2] = 'ROAD';
  assert.equal(corridorModulePhase(track, 1, 2), 'end');
  assert.equal(corridorModulePhase(track, 2, 2), null);
  assert.equal(corridorModulePhase(track, 3, 2), 'start');

  track[1].lanes[2] = 'ROAD';
  assert.equal(corridorModulePhase(track, 0, 2), 'single');
});

function phaseBeside(corridor, lanes) {
  const track = [
    {
      lanes: ['ROAD', 'WALL_LOW', 'ROAD'],
      corridor: { id: 7, lane: 1, type: 'WALL_LOW', index: 0, length: 2 },
    },
    { lanes, corridor },
  ];
  return corridorModulePhase(track, 0, 1);
}

test('different corridor run ids, lanes, and wall types never connect', () => {
  assert.equal(phaseBeside(
    { id: 8, lane: 1, type: 'WALL_LOW', index: 1, length: 2 },
    ['ROAD', 'WALL_LOW', 'ROAD'],
  ), 'single');
  assert.equal(phaseBeside(
    { id: 7, lane: 2, type: 'WALL_LOW', index: 1, length: 2 },
    ['ROAD', 'WALL_LOW', 'WALL_LOW'],
  ), 'single');
  assert.equal(phaseBeside(
    { id: 7, lane: 1, type: 'WALL_MEDIUM', index: 1, length: 2 },
    ['ROAD', 'WALL_MEDIUM', 'ROAD'],
  ), 'single');
});

function simulateClearance({
  thresholdHeight,
  jumpTimes,
  glideAfter = Infinity,
  duration = 2,
}) {
  const dt = 1 / 20000;
  let y = 0;
  let velocity = 0;
  let jumpIndex = 0;
  let current = 0;
  let longest = 0;
  for (let time = 0; time < duration; time += dt) {
    if (jumpIndex < jumpTimes.length && time >= jumpTimes[jumpIndex]) {
      velocity = 7500;
      jumpIndex++;
    }
    const gliding = time >= glideAfter && velocity < 0 && y > 0;
    velocity -= 32000 * (gliding ? 0.08 : 1) * dt;
    y = Math.max(0, y + velocity * dt);
    if (y > thresholdHeight) {
      current += dt;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

const firstApexTime = 7500 / 32000;
const lowDownCrossing = firstApexTime
  + Math.sqrt(2 * (jumpApex(1) - 600) / 32000);

test('selected low corridors require glide or an advanced second jump', () => {
  const noGlideWindow = simulateClearance({ thresholdHeight: 600, jumpTimes: [0] });
  const glideWindow = simulateClearance({
    thresholdHeight: 600,
    jumpTimes: [0],
    glideAfter: firstApexTime,
  });
  // Align the analytical crossing with the simulator's discrete integration step.
  const advancedWindow = simulateClearance({
    thresholdHeight: 600,
    jumpTimes: [0, lowDownCrossing - 3 / 20000],
  });
  assert.ok(advancedWindow >= 0.72);

  for (const speed of [12, 16, 20, 24]) {
    for (const randomValue of [0, 0.999]) {
      const length = selectRunLength('WALL_LOW', speed, randomValue);
      assert.ok(length > noGlideWindow * speed);
      assert.ok(length <= glideWindow * speed);
      assert.ok(length <= advancedWindow * speed);
    }
  }
});

test('selected medium corridors defeat early double jumps but fit second-apex glide', () => {
  const noGlideWindows = [];
  for (let secondJump = 0.05; secondJump <= 0.45 + 1e-12; secondJump += 0.0025) {
    noGlideWindows.push(simulateClearance({
      thresholdHeight: 1250,
      jumpTimes: [0, secondJump],
    }));
  }
  const glideWindow = simulateClearance({
    thresholdHeight: 1250,
    jumpTimes: [0, firstApexTime],
    glideAfter: firstApexTime * 2,
  });

  for (const speed of [12, 16, 20, 24]) {
    for (const randomValue of [0, 0.999]) {
      const length = selectRunLength('WALL_MEDIUM', speed, randomValue);
      for (const noGlideWindow of noGlideWindows) {
        assert.ok(noGlideWindow * speed < length);
      }
      assert.ok(length <= glideWindow * speed);
    }
  }
});

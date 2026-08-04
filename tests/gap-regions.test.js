'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectGapRegions } = require('../src/gap-regions.js');

function trackFromRows(rows) {
  return rows.map((lanes, index) => ({ index, lanes }));
}

test('one isolated gap exposes all four cell edges', () => {
  const track = trackFromRows([
    ['ROAD', 'ROAD', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'ROAD', 'ROAD'],
  ]);
  const regions = collectGapRegions({
    track,
    startIndex: 2,
    endIndex: 0,
    laneCount: 3,
  });
  assert.deepEqual(regions, [{
    id: '1:1',
    cells: [{ segmentIndex: 1, laneIndex: 1 }],
    exposedEdges: [
      { segmentIndex: 1, laneIndex: 1, side: 'near' },
      { segmentIndex: 1, laneIndex: 1, side: 'far' },
      { segmentIndex: 1, laneIndex: 1, side: 'left' },
      { segmentIndex: 1, laneIndex: 1, side: 'right' },
    ],
    nearestSegment: 1,
    farthestSegment: 1,
    minimumLane: 1,
    maximumLane: 1,
  }]);
});

test('adjacent horizontal gaps form one region without their internal edge', () => {
  const track = trackFromRows([
    ['ROAD', 'ROAD', 'ROAD', 'ROAD'],
    ['ROAD', 'GAP', 'GAP', 'ROAD'],
  ]);
  const [region] = collectGapRegions({
    track,
    startIndex: 1,
    endIndex: 0,
    laneCount: 4,
  });
  assert.deepEqual(region.cells, [
    { segmentIndex: 1, laneIndex: 1 },
    { segmentIndex: 1, laneIndex: 2 },
  ]);
  assert.equal(region.exposedEdges.some((edge) => (
    edge.segmentIndex === 1
      && edge.laneIndex === 1
      && edge.side === 'right'
  )), false);
  assert.equal(region.exposedEdges.some((edge) => (
    edge.segmentIndex === 1
      && edge.laneIndex === 2
      && edge.side === 'left'
  )), false);
});

test('three longitudinal cells form one region with only end caps exposed', () => {
  const track = trackFromRows([
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
  ]);
  const [region] = collectGapRegions({
    track,
    startIndex: 2,
    endIndex: 0,
    laneCount: 3,
  });
  assert.equal(region.cells.length, 3);
  assert.equal(region.exposedEdges.filter((edge) => edge.side === 'near').length, 1);
  assert.equal(region.exposedEdges.filter((edge) => edge.side === 'far').length, 1);
});

test('a seven-lane three-segment full gap is one region', () => {
  const track = trackFromRows(Array.from(
    { length: 3 },
    () => Array(7).fill('GAP'),
  ));
  const regions = collectGapRegions({
    track,
    startIndex: 2,
    endIndex: 0,
    laneCount: 7,
  });
  assert.equal(regions.length, 1);
  assert.equal(regions[0].cells.length, 21);
});

test('a surviving bridge lane separates left and right gap regions', () => {
  const track = trackFromRows([
    ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
    ['GAP', 'GAP', 'GAP', 'ROAD', 'GAP', 'GAP', 'GAP'],
  ]);
  const regions = collectGapRegions({
    track,
    startIndex: 1,
    endIndex: 0,
    laneCount: 7,
  });
  assert.deepEqual(regions.map((region) => (
    [region.minimumLane, region.maximumLane, region.cells.length]
  )), [[0, 2, 6], [4, 6, 6]]);
});

test('an L shape connects while diagonal-only contact does not', () => {
  const lShape = collectGapRegions({
    track: trackFromRows([
      ['GAP', 'ROAD', 'ROAD'],
      ['GAP', 'GAP', 'ROAD'],
    ]),
    startIndex: 1,
    endIndex: 0,
    laneCount: 3,
  });
  assert.equal(lShape.length, 1);
  assert.equal(lShape[0].cells.length, 3);

  const diagonal = collectGapRegions({
    track: trackFromRows([
      ['GAP', 'ROAD'],
      ['ROAD', 'GAP'],
    ]),
    startIndex: 1,
    endIndex: 0,
    laneCount: 2,
  });
  assert.deepEqual(diagonal.map((region) => region.id), ['0:0', '1:1']);
});

test('visible clipping does not expose a boundary shared with an offscreen gap', () => {
  const track = trackFromRows([
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'GAP', 'ROAD'],
    ['ROAD', 'ROAD', 'ROAD'],
  ]);
  const [region] = collectGapRegions({
    track,
    startIndex: 1,
    endIndex: 1,
    laneCount: 3,
  });
  assert.equal(region.cells.length, 1);
  assert.equal(region.exposedEdges.some((edge) => edge.side === 'near'), false);
  assert.equal(region.exposedEdges.some((edge) => edge.side === 'far'), true);
});

test('output is deeply frozen deterministic and safe for malformed input', () => {
  assert.deepEqual(collectGapRegions(), []);
  assert.deepEqual(collectGapRegions({
    track: [],
    startIndex: 0,
    endIndex: 0,
    laneCount: 7,
  }), []);
  const regions = collectGapRegions({
    track: trackFromRows([['GAP', 'ROAD', 'GAP']]),
    startIndex: 0,
    endIndex: 0,
    laneCount: 3,
  });
  assert.deepEqual(regions.map((region) => region.id), ['0:0', '0:2']);
  assert.equal(Object.isFrozen(regions), true);
  assert.equal(Object.isFrozen(regions[0]), true);
  assert.equal(Object.isFrozen(regions[0].cells), true);
  assert.equal(Object.isFrozen(regions[0].cells[0]), true);
  assert.equal(Object.isFrozen(regions[0].exposedEdges), true);
  assert.equal(Object.isFrozen(regions[0].exposedEdges[0]), true);
});

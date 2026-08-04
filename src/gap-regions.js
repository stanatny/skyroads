'use strict';

(function attachGapRegions(root) {
  const SIDE_ORDER = Object.freeze(['near', 'far', 'left', 'right']);
  const DELTAS = Object.freeze({
    near: Object.freeze([-1, 0]),
    far: Object.freeze([1, 0]),
    left: Object.freeze([0, -1]),
    right: Object.freeze([0, 1]),
  });

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function cellKey(segmentIndex, laneIndex) {
    return `${segmentIndex}:${laneIndex}`;
  }

  function isGapCell(track, segmentIndex, laneIndex, laneCount, gapType) {
    if (!Number.isInteger(segmentIndex)
      || segmentIndex < 0
      || segmentIndex >= track.length
      || !Number.isInteger(laneIndex)
      || laneIndex < 0
      || laneIndex >= laneCount) return false;
    const segment = track[segmentIndex];
    return Boolean(
      segment
      && Array.isArray(segment.lanes)
      && segment.lanes[laneIndex] === gapType,
    );
  }

  function collectGapRegions({
    track,
    startIndex,
    endIndex,
    laneCount,
    gapType = 'GAP',
  } = {}) {
    if (!Array.isArray(track)
      || track.length === 0
      || !Number.isInteger(startIndex)
      || !Number.isInteger(endIndex)
      || !Number.isInteger(laneCount)
      || laneCount <= 0) return Object.freeze([]);

    const near = Math.max(0, Math.min(startIndex, endIndex));
    const far = Math.min(track.length - 1, Math.max(startIndex, endIndex));
    if (near > far) return Object.freeze([]);

    const visibleGapKeys = new Set();
    for (let segmentIndex = near; segmentIndex <= far; segmentIndex += 1) {
      for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
        if (isGapCell(track, segmentIndex, laneIndex, laneCount, gapType)) {
          visibleGapKeys.add(cellKey(segmentIndex, laneIndex));
        }
      }
    }

    const visited = new Set();
    const regions = [];
    for (const initialKey of visibleGapKeys) {
      if (visited.has(initialKey)) continue;
      const [initialSegment, initialLane] = initialKey.split(':').map(Number);
      const queue = [{ segmentIndex: initialSegment, laneIndex: initialLane }];
      const cells = [];
      visited.add(initialKey);

      for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
        const cell = queue[queueIndex];
        cells.push(cell);
        for (const side of SIDE_ORDER) {
          const [segmentDelta, laneDelta] = DELTAS[side];
          const neighborSegment = cell.segmentIndex + segmentDelta;
          const neighborLane = cell.laneIndex + laneDelta;
          const neighborKey = cellKey(neighborSegment, neighborLane);
          if (!visibleGapKeys.has(neighborKey) || visited.has(neighborKey)) continue;
          visited.add(neighborKey);
          queue.push({ segmentIndex: neighborSegment, laneIndex: neighborLane });
        }
      }

      cells.sort((left, right) => (
        left.segmentIndex - right.segmentIndex || left.laneIndex - right.laneIndex
      ));
      const exposedEdges = [];
      for (const cell of cells) {
        for (const side of SIDE_ORDER) {
          const [segmentDelta, laneDelta] = DELTAS[side];
          if (isGapCell(
            track,
            cell.segmentIndex + segmentDelta,
            cell.laneIndex + laneDelta,
            laneCount,
            gapType,
          )) continue;
          exposedEdges.push({
            segmentIndex: cell.segmentIndex,
            laneIndex: cell.laneIndex,
            side,
          });
        }
      }

      regions.push({
        id: cellKey(cells[0].segmentIndex, cells[0].laneIndex),
        cells,
        exposedEdges,
        nearestSegment: cells[0].segmentIndex,
        farthestSegment: cells[cells.length - 1].segmentIndex,
        minimumLane: Math.min(...cells.map((cell) => cell.laneIndex)),
        maximumLane: Math.max(...cells.map((cell) => cell.laneIndex)),
      });
    }

    regions.sort((left, right) => (
      left.nearestSegment - right.nearestSegment
        || left.minimumLane - right.minimumLane
    ));
    return deepFreeze(regions);
  }

  const api = Object.freeze({ collectGapRegions });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.gapRegions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));

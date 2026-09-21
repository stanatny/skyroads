'use strict';

// 紧凑飞船的显示比例、实体净空与武器附件共用同一尺寸，避免模型与碰撞各自缩放。
(function attachFlightDimensions(scope) {
  const modelScale = 0.43;
  const hoverOffset = (1 / 3) * (1 - modelScale);
  const dimensions = Object.freeze({
    modelScale,
    hoverOffset,
    laneWidth: 3.4,
    segmentDepth: 4,
    heightScale: 1 / 300,
    playerHalfWidth: 0.42,
    terrainSideHalfWidth: 0.44,
    attachments: Object.freeze({
      muzzle: Object.freeze([0, 1 / 3, -2.69 * modelScale]),
      chargeReactor: Object.freeze([0, 1.38 * modelScale + hoverOffset, 0.60 * modelScale]),
    }),
  });
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightDimensions = dimensions;
  if (typeof module !== 'undefined' && module.exports) module.exports = dimensions;
})(globalThis);

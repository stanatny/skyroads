'use strict';

(function attachDroneVisual(root) {
  const MATERIAL_ROLES = Object.freeze(new Set([
    'armorShadow',
    'armorMid',
    'armorHighlight',
    'podRecess',
    'energy',
    'core',
    'warningLight',
  ]));

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function point(x, y) {
    return { x, y };
  }

  function polygon(role, points, opacity = 1) {
    return { kind: 'polygon', role, points, opacity };
  }

  function path(role, points, width, opacity = 1) {
    return { kind: 'path', role, points, width, opacity };
  }

  function circle(role, x, y, radius, opacity = 1) {
    return { kind: 'circle', role, x, y, radius, opacity };
  }

  function mirroredPolygon(role, points, opacity = 1) {
    return [
      polygon(role, points, opacity),
      polygon(role, points.map(({ x, y }) => point(-x, y)), opacity),
    ];
  }

  function mirroredPath(role, points, width, opacity = 1) {
    return [
      path(role, points, width, opacity),
      path(role, points.map(({ x, y }) => point(-x, y)), width, opacity),
    ];
  }

  function scoutLayers() {
    return [
      polygon('armorShadow', [
        point(0, -0.68), point(-0.24, -0.34), point(-0.22, 0.46),
        point(0, 0.64), point(0.22, 0.46), point(0.24, -0.34),
      ]),
      polygon('armorMid', [
        point(0, -0.61), point(-0.17, -0.27), point(-0.15, 0.31),
        point(0, 0.47), point(0.15, 0.31), point(0.17, -0.27),
      ]),
      ...mirroredPolygon('armorShadow', [
        point(0.24, -0.32), point(0.66, -0.44), point(0.72, 0.18),
        point(0.50, 0.46), point(0.27, 0.24),
      ]),
      ...mirroredPolygon('armorMid', [
        point(0.29, -0.25), point(0.57, -0.34), point(0.61, 0.12),
        point(0.47, 0.31), point(0.31, 0.17),
      ]),
      ...mirroredPolygon('podRecess', [
        point(0.35, -0.12), point(0.53, -0.18), point(0.55, 0.12),
        point(0.43, 0.23), point(0.34, 0.12),
      ]),
      ...mirroredPolygon('armorShadow', [
        point(0.58, -0.42), point(0.86, -0.20), point(0.70, 0.02),
        point(0.56, -0.06),
      ]),
      path('armorHighlight', [
        point(0, -0.60), point(-0.14, -0.25), point(-0.13, 0.28),
      ], 0.020, 0.66),
      ...mirroredPath('armorHighlight', [
        point(0.30, -0.26), point(0.58, -0.35), point(0.61, 0.10),
      ], 0.018, 0.58),
      ...mirroredPath('energy', [
        point(0.10, -0.18), point(0.24, 0.02), point(0.12, 0.36),
      ], 0.034),
      circle('core', 0, -0.02, 0.18),
      circle('warningLight', -0.48, -0.16, 0.045),
      circle('warningLight', 0.48, -0.16, 0.045),
    ];
  }

  function strikerLayers() {
    return [
      polygon('armorShadow', [
        point(0, -0.73), point(-0.28, -0.38), point(-0.26, 0.48),
        point(0, 0.70), point(0.26, 0.48), point(0.28, -0.38),
      ]),
      polygon('armorMid', [
        point(0, -0.64), point(-0.20, -0.30), point(-0.19, 0.34),
        point(0, 0.53), point(0.19, 0.34), point(0.20, -0.30),
      ]),
      ...mirroredPolygon('armorShadow', [
        point(0.27, -0.38), point(0.75, -0.52), point(0.84, 0.24),
        point(0.57, 0.54), point(0.29, 0.28),
      ]),
      ...mirroredPolygon('armorMid', [
        point(0.32, -0.30), point(0.66, -0.41), point(0.72, 0.15),
        point(0.53, 0.38), point(0.34, 0.20),
      ]),
      ...mirroredPolygon('podRecess', [
        point(0.39, -0.17), point(0.63, -0.25), point(0.67, 0.15),
        point(0.51, 0.30), point(0.38, 0.15),
      ]),
      ...mirroredPolygon('armorShadow', [
        point(0.64, -0.49), point(0.96, -0.22), point(0.76, 0.08),
        point(0.61, -0.03),
      ]),
      ...mirroredPolygon('armorShadow', [
        point(0.52, 0.34), point(0.78, 0.61), point(0.57, 0.77),
        point(0.43, 0.47),
      ]),
      path('armorHighlight', [
        point(0, -0.64), point(-0.17, -0.28), point(-0.16, 0.32),
      ], 0.022, 0.70),
      ...mirroredPath('armorHighlight', [
        point(0.33, -0.31), point(0.67, -0.42), point(0.72, 0.13),
      ], 0.020, 0.62),
      ...mirroredPath('energy', [
        point(0.12, -0.24), point(0.29, 0.02), point(0.14, 0.41),
      ], 0.040),
      ...mirroredPath('energy', [
        point(0.40, -0.12), point(0.61, -0.17), point(0.56, 0.23),
      ], 0.030, 0.82),
      circle('core', 0, -0.01, 0.23),
      circle('warningLight', -0.58, -0.20, 0.052),
      circle('warningLight', 0.58, -0.20, 0.052),
    ];
  }

  function normalizeVariant(value) {
    return value === 'striker' || value === 'droneStriker' ? 'striker' : 'scout';
  }

  function normalizeState(value) {
    return value === 'warn' || value === 'move' ? value : 'rest';
  }

  function normalizeDirection(value) {
    return Number.isFinite(value) ? Math.sign(value) : 0;
  }

  function normalizeWarningPulse(state, value, reducedMotion) {
    if (state !== 'warn') return 0;
    if (reducedMotion) return 0.72;
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }

  function heavySwarmDroneDescriptor({
    variant,
    state,
    direction,
    warningPulse,
    reducedMotion,
  } = {}) {
    const normalizedVariant = normalizeVariant(variant);
    const normalizedState = normalizeState(state);
    const normalizedReducedMotion = reducedMotion === true;
    return deepFreeze({
      family: 'heavy-swarm',
      variant: normalizedVariant,
      state: normalizedState,
      direction: normalizeDirection(direction),
      warningPulse: normalizeWarningPulse(
        normalizedState,
        warningPulse,
        normalizedReducedMotion,
      ),
      reducedMotion: normalizedReducedMotion,
      bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      layers: normalizedVariant === 'striker' ? strikerLayers() : scoutLayers(),
    });
  }

  function finiteCoordinate(value) {
    return Number.isFinite(value) && value >= -1 && value <= 1;
  }

  function validLayer(layer) {
    if (!layer || typeof layer !== 'object' || !MATERIAL_ROLES.has(layer.role)) return false;
    if (layer.kind === 'polygon' || layer.kind === 'path') {
      return Array.isArray(layer.points)
        && layer.points.length >= 2
        && layer.points.every((nextPoint) => (
          nextPoint
          && finiteCoordinate(nextPoint.x)
          && finiteCoordinate(nextPoint.y)
        ));
    }
    return layer.kind === 'circle'
      && finiteCoordinate(layer.x)
      && finiteCoordinate(layer.y)
      && Number.isFinite(layer.radius)
      && layer.radius > 0
      && layer.x - layer.radius >= -1
      && layer.x + layer.radius <= 1
      && layer.y - layer.radius >= -1
      && layer.y + layer.radius <= 1;
  }

  function isHeavySwarmDroneDescriptor(value) {
    return Boolean(
      value
      && value.family === 'heavy-swarm'
      && (value.variant === 'scout' || value.variant === 'striker')
      && (value.state === 'rest' || value.state === 'warn' || value.state === 'move')
      && (value.direction === -1 || value.direction === 0 || value.direction === 1)
      && Number.isFinite(value.warningPulse)
      && value.warningPulse >= 0
      && value.warningPulse <= 1
      && typeof value.reducedMotion === 'boolean'
      && value.bounds
      && value.bounds.minX === -1
      && value.bounds.minY === -1
      && value.bounds.maxX === 1
      && value.bounds.maxY === 1
      && Array.isArray(value.layers)
      && value.layers.length > 0
      && value.layers.every(validLayer),
    );
  }

  const api = Object.freeze({
    heavySwarmDroneDescriptor,
    isHeavySwarmDroneDescriptor,
  });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.droneVisual = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));

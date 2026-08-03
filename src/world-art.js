'use strict';

(function attachWorldArt(root) {
  const YAW_DEGREES = Object.freeze([-80, -55, -30, 0, 30, 55, 80]);
  const PITCH_DEGREES = Object.freeze([20, 55, 80]);
  const LEGACY_YAW_DEGREES = Object.freeze([-30, -20, -10, 0, 10, 20, 30]);

  function atlas(path, category, variant) {
    return Object.freeze({ path, category, variant, frames: 7, frameWidth: 512, frameHeight: 512 });
  }

  const WORLD_ATLAS_MANIFEST = Object.freeze({
    droneScout: atlas('./assets/world/drone-scout.png', 'drone', 0),
    droneStriker: atlas('./assets/world/drone-striker.png', 'drone', 1),
    turretSentry: atlas('./assets/world/turret-sentry.png', 'turret', 0),
    turretHeavy: atlas('./assets/world/turret-heavy.png', 'turret', 1),
    barrierRail: atlas('./assets/world/barrier-rail.png', 'wallLow', 0),
    barrierCrate: atlas('./assets/world/barrier-crate.png', 'wallLow', 1),
    structureReactor: atlas('./assets/world/structure-reactor.png', 'wallHigh', 0),
    structureTower: atlas('./assets/world/structure-tower.png', 'wallHigh', 1),
    gapEdge: atlas('./assets/world/gap-edge.png', 'gap', 0),
  });

  const WORLD_GEOMETRY = Object.freeze({
    drone: Object.freeze({ worldWidth: 432, worldHeight: 360, baseY: 140 }),
    turret: Object.freeze({ worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 }),
    wallLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
    wallMedium: Object.freeze({ worldWidth: 648, worldHeight: 1250, baseY: 0 }),
    wallHigh: Object.freeze({ worldWidth: 648, worldHeight: 2000, baseY: 0 }),
    corridorLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
    corridorMedium: Object.freeze({ worldWidth: 648, worldHeight: 1250, baseY: 0 }),
  });

  function selectAxisBlend(angle, samples) {
    const value = Math.max(samples[0], Math.min(samples[samples.length - 1], Number(angle) || 0));
    let upperIndex = samples.findIndex((sample) => sample >= value);
    if (upperIndex < 0) upperIndex = samples.length - 1;
    const lowerIndex = Math.max(0, upperIndex - (samples[upperIndex] === value ? 0 : 1));
    if (lowerIndex === upperIndex) {
      return Object.freeze({ angle: value, lowerIndex, upperIndex, mix: 0 });
    }
    const span = samples[upperIndex] - samples[lowerIndex];
    return Object.freeze({
      angle: value,
      lowerIndex,
      upperIndex,
      mix: (value - samples[lowerIndex]) / span,
    });
  }

  function selectViewBlend({ worldX, zRel, cameraY, objectY = 0, worldBounds } = {}) {
    const bounds = worldBounds || { minY: 0, maxY: 0 };
    const depth = Math.max(1, Number(zRel) || 1);
    const yawAngle = Math.atan2(Number(worldX) || 0, depth) * 180 / Math.PI;
    const centerY = (Number(objectY) || 0) + (Number(bounds.minY) + Number(bounds.maxY)) / 2;
    const pitchAngle = Math.atan2((Number(cameraY) || 0) - centerY, depth) * 180 / Math.PI;
    return Object.freeze({
      yaw: selectAxisBlend(yawAngle, YAW_DEGREES),
      pitch: selectAxisBlend(pitchAngle, PITCH_DEGREES),
    });
  }

  function selectYawBlend({ worldX = 0, zRel = 1 } = {}) {
    const x = Number.isFinite(Number(worldX)) ? Number(worldX) : 0;
    const depth = Math.max(1, Number.isFinite(Number(zRel)) ? Number(zRel) : 1);
    const angle = Math.atan2(x, depth) * 180 / Math.PI;
    return selectAxisBlend(angle, LEGACY_YAW_DEGREES);
  }

  function atlasFrameRect(metadata, frameIndex) {
    const index = Math.max(0, Math.min(metadata.frames - 1, Math.trunc(frameIndex)));
    return Object.freeze({
      sx: index * metadata.frameWidth,
      sy: 0,
      sw: metadata.frameWidth,
      sh: metadata.frameHeight,
    });
  }

  function frozenSource(source) {
    if (!source || typeof source !== 'object') return null;
    return Object.freeze({
      sx: Number(source.sx),
      sy: Number(source.sy),
      sw: Number(source.sw),
      sh: Number(source.sh),
    });
  }

  function atlasFrame(metadata, yawIndex, pitchIndex) {
    if (!metadata || !Array.isArray(metadata.frames)) return null;
    const yaw = Math.trunc(Number(yawIndex));
    const pitch = Math.trunc(Number(pitchIndex));
    if (yaw < 0 || yaw >= YAW_DEGREES.length || pitch < 0 || pitch >= PITCH_DEGREES.length) return null;
    const frame = metadata.frames[pitch * YAW_DEGREES.length + yaw];
    if (!frame || !frame.source || !frame.origin) return null;
    return Object.freeze({
      source: frozenSource(frame.source),
      origin: Object.freeze({ x: Number(frame.origin.x), y: Number(frame.origin.y) }),
    });
  }

  function sameNumbers(actual, expected) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && actual.every((value, index) => Number(value) === expected[index]);
  }

  function finiteBounds(bounds) {
    return bounds
      && typeof bounds === 'object'
      && ['minX', 'maxX', 'minY', 'maxY'].every((key) => Number.isFinite(Number(bounds[key])))
      && Number(bounds.maxX) > Number(bounds.minX)
      && Number(bounds.maxY) > Number(bounds.minY);
  }

  function validateAtlasMetadata(metadata) {
    try {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
      if (metadata.layout !== 'upright'
        || Number(metadata.atlasWidth) !== 2240
        || Number(metadata.atlasHeight) !== 960
        || !sameNumbers(metadata.yawDegrees, YAW_DEGREES)
        || !sameNumbers(metadata.pitchDegrees, PITCH_DEGREES)
        || !finiteBounds(metadata.worldBounds)
        || !Number.isFinite(Number(metadata.pixelsPerWorldUnit))
        || Number(metadata.pixelsPerWorldUnit) <= 0
        || !Array.isArray(metadata.frames)
        || metadata.frames.length !== YAW_DEGREES.length * PITCH_DEGREES.length) return false;

      const atlasWidth = Number(metadata.atlasWidth);
      const atlasHeight = Number(metadata.atlasHeight);
      return metadata.frames.every((frame) => {
        if (!frame || typeof frame !== 'object' || !frame.source || !frame.origin) return false;
        const { sx, sy, sw, sh } = frame.source;
        const sourceValues = [sx, sy, sw, sh].map(Number);
        if (!sourceValues.every(Number.isFinite)) return false;
        if (Number(sw) <= 0 || Number(sh) <= 0 || Number(sx) < 0 || Number(sy) < 0) return false;
        if (Number(sx) + Number(sw) > atlasWidth || Number(sy) + Number(sh) > atlasHeight) return false;
        return Number.isFinite(Number(frame.origin.x)) && Number.isFinite(Number(frame.origin.y));
      });
    } catch (_error) {
      return false;
    }
  }

  function legacySpriteDrawPlan({ metadata, worldX, zRel, destination, alpha = 1 }) {
    const blend = selectYawBlend({ worldX, zRel });
    const frozenDestination = Object.freeze({
      x: Number(destination.x),
      y: Number(destination.y),
      width: Math.max(0, Number(destination.width)),
      height: Math.max(0, Number(destination.height)),
    });
    return Object.freeze({
      lower: atlasFrameRect(metadata, blend.lowerIndex),
      upper: atlasFrameRect(metadata, blend.upperIndex),
      mix: blend.mix,
      destination: frozenDestination,
      alpha: Math.max(0, Math.min(1, Number(alpha) || 0)),
    });
  }

  function buildUprightDrawPlan(options) {
    const {
      metadata,
      worldX,
      zRel,
      cameraY,
      objectY = 0,
      projectedOrigin,
      pixelsPerWorldUnitX,
      pixelsPerWorldUnitY,
      alpha = 1,
    } = options;
    if (!validateAtlasMetadata(metadata)
      || !projectedOrigin
      || !Number.isFinite(Number(projectedOrigin.x))
      || !Number.isFinite(Number(projectedOrigin.y))
      || !Number.isFinite(Number(pixelsPerWorldUnitX))
      || !Number.isFinite(Number(pixelsPerWorldUnitY))
      || Number(pixelsPerWorldUnitX) <= 0
      || Number(pixelsPerWorldUnitY) <= 0) return null;

    const view = selectViewBlend({
      worldX,
      zRel,
      cameraY,
      objectY,
      worldBounds: metadata.worldBounds,
    });
    const yawParts = view.yaw.lowerIndex === view.yaw.upperIndex
      ? [{ index: view.yaw.lowerIndex, weight: 1 }]
      : [
        { index: view.yaw.lowerIndex, weight: 1 - view.yaw.mix },
        { index: view.yaw.upperIndex, weight: view.yaw.mix },
      ];
    const pitchParts = view.pitch.lowerIndex === view.pitch.upperIndex
      ? [{ index: view.pitch.lowerIndex, weight: 1 }]
      : [
        { index: view.pitch.lowerIndex, weight: 1 - view.pitch.mix },
        { index: view.pitch.upperIndex, weight: view.pitch.mix },
      ];
    const weightedFrames = new Map();
    for (const pitch of pitchParts) {
      for (const yaw of yawParts) {
        const weight = pitch.weight * yaw.weight;
        if (weight <= 0) continue;
        const index = pitch.index * YAW_DEGREES.length + yaw.index;
        weightedFrames.set(index, (weightedFrames.get(index) || 0) + weight);
      }
    }
    const totalWeight = [...weightedFrames.values()].reduce((sum, weight) => sum + weight, 0);
    if (!(totalWeight > 0)) return null;

    const projectedX = Number(projectedOrigin.x);
    const projectedY = Number(projectedOrigin.y);
    const runtimeScaleX = Number(pixelsPerWorldUnitX);
    const runtimeScaleY = Number(pixelsPerWorldUnitY);
    const sourceScale = Number(metadata.pixelsPerWorldUnit);
    const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    const draws = [];
    for (const [index, rawWeight] of weightedFrames) {
      const yawIndex = index % YAW_DEGREES.length;
      const pitchIndex = Math.floor(index / YAW_DEGREES.length);
      const frame = atlasFrame(metadata, yawIndex, pitchIndex);
      const weight = rawWeight / totalWeight;
      const destination = Object.freeze({
        x: projectedX - (frame.origin.x - frame.source.sx) / sourceScale * runtimeScaleX,
        y: projectedY - (frame.origin.y - frame.source.sy) / sourceScale * runtimeScaleY,
        width: frame.source.sw / sourceScale * runtimeScaleX,
        height: frame.source.sh / sourceScale * runtimeScaleY,
      });
      draws.push(Object.freeze({
        source: frame.source,
        destination,
        weight,
        alpha: clampedAlpha * weight,
      }));
    }

    const minX = Math.min(...draws.map(({ destination }) => destination.x));
    const minY = Math.min(...draws.map(({ destination }) => destination.y));
    const maxX = Math.max(...draws.map(({ destination }) => destination.x + destination.width));
    const maxY = Math.max(...draws.map(({ destination }) => destination.y + destination.height));
    const bounds = Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    return Object.freeze({
      yaw: view.yaw,
      pitch: view.pitch,
      bounds,
      draws: Object.freeze(draws),
    });
  }

  function buildSpriteDrawPlan(options = {}) {
    const { metadata, destination } = options;
    if (metadata && metadata.layout === 'upright') return buildUprightDrawPlan(options);
    if (!metadata || metadata.layout != null || !destination || typeof destination !== 'object') return null;
    return legacySpriteDrawPlan(options);
  }

  function roadEdgeFrame(metadata) {
    if (!metadata || metadata.layout !== 'roadEdge') return null;
    if (Array.isArray(metadata.frames) && metadata.frames.length > 0) {
      const frame = metadata.frames[Math.floor(metadata.frames.length / 2)];
      return frozenSource(frame && (frame.source || frame));
    }
    if (Number.isInteger(metadata.frames) && metadata.frames > 0) {
      return atlasFrameRect(metadata, Math.floor(metadata.frames / 2));
    }
    return null;
  }

  function worldSpriteDrawRect({ projectPoint, worldX, zRel, worldWidth, worldHeight, baseY = 0 }) {
    const left = projectPoint(worldX - worldWidth / 2, baseY, zRel);
    const right = projectPoint(worldX + worldWidth / 2, baseY, zRel);
    const bottom = projectPoint(worldX, baseY, zRel);
    const top = projectPoint(worldX, baseY + worldHeight, zRel);
    const width = Math.abs(right.x - left.x);
    const height = Math.abs(bottom.y - top.y);
    return Object.freeze({ x: bottom.x - width / 2, y: bottom.y - height, width, height });
  }

  const VARIANT_KEYS = Object.freeze({
    drone: Object.freeze(['droneScout', 'droneStriker']),
    turret: Object.freeze(['turretSentry', 'turretHeavy']),
    wallLow: Object.freeze(['barrierRail', 'barrierCrate']),
    wallMedium: Object.freeze(['wallMediumRelay', 'wallMediumBastion']),
    wallHigh: Object.freeze(['structureReactor', 'structureTower']),
    corridorLow: Object.freeze(['corridorLowRail', 'corridorLowCrate']),
    corridorMedium: Object.freeze(['corridorMediumRelay', 'corridorMediumBastion']),
    gap: Object.freeze(['gapEdge']),
  });

  function variantKey(category, segmentIndex, stableLaneKey) {
    const keys = VARIANT_KEYS[category] || [];
    if (keys.length === 0) return null;
    const segment = Number.isInteger(segmentIndex) ? segmentIndex : 0;
    const lane = Number.isInteger(stableLaneKey) ? stableLaneKey : 0;
    return keys[Math.abs(segment * 31 + lane * 17 + category.length) % keys.length];
  }

  const api = Object.freeze({
    YAW_DEGREES,
    PITCH_DEGREES,
    WORLD_ATLAS_MANIFEST,
    WORLD_GEOMETRY,
    selectAxisBlend,
    selectViewBlend,
    selectYawBlend,
    atlasFrame,
    atlasFrameRect,
    validateAtlasMetadata,
    buildSpriteDrawPlan,
    roadEdgeFrame,
    worldSpriteDrawRect,
    variantKey,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.worldArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

'use strict';

(function attachWorldArt(root) {
  const YAW_DEGREES = Object.freeze([-30, -20, -10, 0, 10, 20, 30]);

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
    drone: Object.freeze({ worldWidth: 380, worldHeight: 360, baseY: 140 }),
    turret: Object.freeze({ worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 }),
    wallLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
    wallHigh: Object.freeze({ worldWidth: 648, worldHeight: 2000, baseY: 0 }),
  });

  function selectYawBlend({ worldX = 0, zRel = 1 } = {}) {
    const x = Number.isFinite(Number(worldX)) ? Number(worldX) : 0;
    const depth = Math.max(1, Number.isFinite(Number(zRel)) ? Number(zRel) : 1);
    const angle = Math.max(-30, Math.min(30, Math.atan2(x, depth) * 180 / Math.PI));
    const exact = (angle + 30) / 10;
    const lowerIndex = Math.max(0, Math.min(6, Math.floor(exact)));
    const upperIndex = Math.max(0, Math.min(6, Math.ceil(exact)));
    const mix = lowerIndex === upperIndex ? 0 : exact - lowerIndex;
    return Object.freeze({ angle, lowerIndex, upperIndex, mix });
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

  function buildSpriteDrawPlan({ metadata, worldX, zRel, destination, alpha = 1 }) {
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
    wallHigh: Object.freeze(['structureReactor', 'structureTower']),
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
    WORLD_ATLAS_MANIFEST,
    WORLD_GEOMETRY,
    selectYawBlend,
    atlasFrameRect,
    buildSpriteDrawPlan,
    worldSpriteDrawRect,
    variantKey,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.worldArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

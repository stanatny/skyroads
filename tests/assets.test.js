'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');
const { preloadVisualAssets, resolvePlayerShipFrame } = require('../src/presentation.js');
const {
  WORLD_ATLAS_MANIFEST,
  WORLD_GEOMETRY,
  buildSpriteDrawPlan,
  validateAtlasMetadata,
} = require('../src/world-art.js');

const root = path.resolve(__dirname, '..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UPRIGHT_ATLAS_IDS = [
  'drone-scout',
  'drone-striker',
  'turret-sentry',
  'turret-heavy',
  'barrier-rail',
  'barrier-crate',
  'structure-pylon',
  'structure-bastion',
  'structure-reactor',
  'structure-tower',
  'corridor-low',
  'corridor-medium',
];
const UPRIGHT_ATLAS_PATHS = UPRIGHT_ATLAS_IDS.map((id) => `assets/world/${id}.png`);
const UPRIGHT_RUNTIME_KEYS = Object.freeze({
  'drone-scout': 'droneScout',
  'drone-striker': 'droneStriker',
  'turret-sentry': 'turretSentry',
  'turret-heavy': 'turretHeavy',
  'barrier-rail': 'barrierRail',
  'barrier-crate': 'barrierCrate',
  'structure-pylon': 'structurePylon',
  'structure-bastion': 'structureBastion',
  'structure-reactor': 'structureReactor',
  'structure-tower': 'structureTower',
  'corridor-low': 'corridorLow',
  'corridor-medium': 'corridorMedium',
});
const MANIFEST_RECIPE_IDS = [
  ...UPRIGHT_ATLAS_IDS,
  'gap-edge',
];
const FINAL_WORLD_ATLAS_PATHS = [...UPRIGHT_ATLAS_PATHS, 'assets/world/gap-edge.png'];
const FINAL_RENDERER_SHA256 = 'b6c2a2cffa83831672d7bd2985fd25f449f725311b354b9e0dec3a42bab3ba6b';
const WORLD_OUTPUT_HASHES = {
  'assets/world/drone-scout.png': 'c700f47ecdccfe5f3400f5947cf5494331442c80a347205efa1caaca71d5ba82',
  'assets/world/drone-striker.png': '774ec0bae0db51b05d2dd5ce48e4449b576c246414a6578cefb07b301b47f376',
  'assets/world/turret-sentry.png': 'b7688afbe1767a772abf9f397fd524e5e241a6d1ffc29ff849ce948583615fb9',
  'assets/world/turret-heavy.png': 'bc915327eb3b8354e94d8f78a9a1e6a2f38208f30a15b55736a3126e414cb4a3',
  'assets/world/barrier-rail.png': '28a2f5ee63b70708e593c1f1e82ac6c5094fcc9c3464023004581c310f6f879a',
  'assets/world/barrier-crate.png': 'c0b327ffbccdc0ba3880200ac9832fd42872f1c707951188a9c1df58000394f1',
  'assets/world/structure-pylon.png': '340d52a6371b6ed19107b977f6f12c4757156599dbc383d8cdcef39e9d088da5',
  'assets/world/structure-bastion.png': '5a0e1c48be51c6841dd739bc41194ff13a9bad98411ad1d639d887eb72d756c9',
  'assets/world/structure-reactor.png': 'b7dfe1838449eb5885e1ce9a032f00c0db936552a821b9134d647c9cf8ab06aa',
  'assets/world/structure-tower.png': 'ae90065ea755297ea2a62788171cc9d1aab6e11e665f37b7bfff51466a40c436',
  'assets/world/corridor-low.png': '28b7ffa57ccf7feadce8910cbc6f18cc603d2532a6163e3367b0081c607df661',
  'assets/world/corridor-medium.png': '877199033c76c2fd5da5498e21c07d3e44d966408907ad423662fc2cc5166503',
  'assets/world/gap-edge.png': 'c3a0962aee773cfa9ac129dba9b49764d297491307836472b1743fead4ebba49',
};
const WORLD_DIMENSIONS_BY_PATH = new Map(Object.values(WORLD_ATLAS_MANIFEST).map((metadata) => [
  metadata.path,
  [metadata.atlasWidth, metadata.atlasHeight],
]));

function applyWorldImageDimensions(image, assetPath) {
  const dimensions = WORLD_DIMENSIONS_BY_PATH.get(assetPath);
  if (!dimensions) return;
  [image.naturalWidth, image.naturalHeight] = dimensions;
}
const WORLD_SOURCE_HASHES = {
  'modular-space-kit/Models/OBJ format/Textures/colormap.png': '5aa7d186416e85310d99308c8e5510ededda181f3354ba9f4887cd56273f2b1e',
  'modular-space-kit/Models/OBJ format/gate-lasers.mtl': '45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060',
  'modular-space-kit/Models/OBJ format/gate-lasers.obj': '1611d2d1d1d8429b8fffadb337dd570600bde4bc9e9ef6bb933d51fb338a520a',
  'modular-space-kit/Models/OBJ format/room-large.mtl': '45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060',
  'modular-space-kit/Models/OBJ format/room-large.obj': '3ef1dc4b366e76b2bdd1ad44e5ad7a3e78c55e7d0fb067625dbaa6c38390b31e',
  'space-kit/Models/OBJ format/barrels_rail.mtl': 'a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927',
  'space-kit/Models/OBJ format/barrels_rail.obj': '51f6f46f6878242f0e5a11d0295a006099ebbec43777ef7def4efddd1f490181',
  'space-kit/Models/OBJ format/craft_speederA.mtl': '91d172e7a3359183581919a7b5d2e6327f63388942e23dbd1a26ef714415c0e3',
  'space-kit/Models/OBJ format/craft_speederA.obj': '534e1b1198be654d2925d6a785531974213ac8b43ae05c02aecfeb905c0166fc',
  'space-kit/Models/OBJ format/craft_speederD.mtl': 'ec579d3e3095fc6cb1e7aaf54be2392459383382334ede6b3f27b4cb4f3b127a',
  'space-kit/Models/OBJ format/craft_speederD.obj': '090e01b12b0d1a0619929d507d8008893e0e13a69235564f677888202c8caea2',
  'space-kit/Models/OBJ format/rocket_baseA.mtl': 'a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927',
  'space-kit/Models/OBJ format/rocket_baseA.obj': '3a6c4115e5994079abe83a7b97f14f2bcce0e97b76bd229dcb60fd0112060ccd',
  'space-kit/Models/OBJ format/rocket_fuelA.mtl': '583541d566dd5edba66cc8e2353e379bdc3de155cd21e173fab33fe9a9248a52',
  'space-kit/Models/OBJ format/rocket_fuelA.obj': '53f83c675728d51a12014724d413a7a264ae893512189313553581e1135bfa87',
  'space-kit/Models/OBJ format/rocket_sidesA.mtl': 'f1131066d3cdc671b79f7799d5ddf194b25b0027381aea415d8c91d24e0190ba',
  'space-kit/Models/OBJ format/rocket_sidesA.obj': '3a69d1927e1ac09203c3b514a9714876cfeb4fb8688d003fff09a1e3b8237a8a',
  'space-kit/Models/OBJ format/rocket_topA.mtl': '7e4036c7a7ec9d8081082f4778338a8bff9a01bebb40c51cae08c8a96bc61785',
  'space-kit/Models/OBJ format/rocket_topA.obj': 'd910a3dd8cccebb8f1eb259af29d436da6839e81ae362fc5e9fd8f4038146bb4',
  'space-kit/Models/OBJ format/terrain_sideCliff.mtl': '3f5b98315cc38f85580e92d4ac82f2693534ac142098fd1dbe76cc07b962c02d',
  'space-kit/Models/OBJ format/terrain_sideCliff.obj': 'a321d44e8603bd3cdf59866464612d13d4720634bf46e0badb80ced32ba7379b',
  'space-kit/Models/OBJ format/turret_double.mtl': '762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b',
  'space-kit/Models/OBJ format/turret_double.obj': 'f511dfa73a94274e1a13ab7d136f1087a99149853fa6659132ece1bbc28311e6',
  'space-kit/Models/OBJ format/turret_single.mtl': '762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b',
  'space-kit/Models/OBJ format/turret_single.obj': '2b3492cde9c9496d73963669d8d59e9f5ebccb9dcbf15dbf5336e7ca630c6a89',
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(read(relativePath)).digest('hex');
}

function audioDuration(relativePath) {
  const output = execFileSync('afinfo', [path.join(root, relativePath)], { encoding: 'utf8' });
  const seconds = Number(output.match(/estimated duration:\s*([0-9.]+) sec/)?.[1]);
  assert.ok(Number.isFinite(seconds), `${relativePath} must report an estimated duration`);
  return seconds;
}

function assertPng(relativePath) {
  const bytes = read(relativePath);
  assert.equal(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true, `${relativePath} must be a PNG`);
  assert.ok(bytes.length > 100, `${relativePath} must not be empty`);
  return bytes;
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function sipsDimensions(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', absolutePath], { encoding: 'utf8' });
  return {
    width: Number(output.match(/pixelWidth: (\d+)/)?.[1]),
    height: Number(output.match(/pixelHeight: (\d+)/)?.[1]),
  };
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodePngRgba(relativePath) {
  const bytes = assertPng(relativePath);
  let offset = PNG_SIGNATURE.length;
  let header = null;
  const compressed = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  assert.ok(header, `${relativePath} must have an IHDR chunk`);
  assert.deepEqual(
    [header.bitDepth, header.colorType, header.compression, header.filter, header.interlace],
    [8, 6, 0, 0, 0],
    `${relativePath} must be non-interlaced 8-bit RGBA`,
  );
  const stride = header.width * 4;
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  assert.equal(filtered.length, (stride + 1) * header.height, relativePath);
  const rgba = Buffer.alloc(stride * header.height);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[sourceOffset + x];
      const destination = y * stride + x;
      const left = x >= 4 ? rgba[destination - 4] : 0;
      const up = y > 0 ? rgba[destination - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? rgba[destination - stride - 4] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upperLeft);
      else assert.fail(`${relativePath} uses unsupported PNG filter ${filter}`);
      rgba[destination] = value & 0xff;
    }
    sourceOffset += stride;
  }
  return { ...header, rgba };
}

function measureCenterArmorWidth(decoded, metadata) {
  const frameIndex = 3;
  const cellX = (frameIndex % 7) * metadata.frameWidth;
  const cellY = Math.floor(frameIndex / 7) * metadata.frameHeight;
  const maxAlphaByColumn = [];
  for (let x = cellX; x < cellX + metadata.frameWidth; x += 1) {
    let maximum = 0;
    for (let y = cellY; y < cellY + metadata.frameHeight; y += 1) {
      maximum = Math.max(maximum, decoded.rgba[(y * decoded.width + x) * 4 + 3]);
    }
    maxAlphaByColumn.push(maximum);
  }
  const visibleColumns = maxAlphaByColumn
    .map((alpha, index) => ({ alpha, x: cellX + index }))
    .filter(({ alpha }) => alpha >= 16);
  assert.ok(visibleColumns.length > 2, `${metadata.path} needs a measurable center silhouette`);
  const leftColumn = visibleColumns[0].x;
  const rightColumn = visibleColumns.at(-1).x;

  const modalPartialAlpha = (x) => {
    const counts = new Map();
    for (let y = cellY; y < cellY + metadata.frameHeight; y += 1) {
      const alpha = decoded.rgba[(y * decoded.width + x) * 4 + 3];
      if (alpha >= 16 && alpha < 255) counts.set(alpha, (counts.get(alpha) || 0) + 1);
    }
    assert.ok(counts.size > 0, `${metadata.path} edge column ${x} needs subpixel alpha coverage`);
    return [...counts].sort(([alphaA, countA], [alphaB, countB]) => (
      countB - countA || alphaA - alphaB
    ))[0][0];
  };

  // The modal partial-alpha sample estimates the subpixel coverage of the
  // normalized silhouette edge while ignoring rare corners/overdraw. Using
  // the conservative symmetric half-span prevents coincident faces on one
  // side from inflating the measured armor envelope.
  const leftEdge = leftColumn + 1 - modalPartialAlpha(leftColumn) / 255;
  const rightEdge = rightColumn + modalPartialAlpha(rightColumn) / 255;
  const leftHalfWorld = (metadata.frames[frameIndex].origin.x - leftEdge)
    / metadata.pixelsPerWorldUnit;
  const rightHalfWorld = (rightEdge - metadata.frames[frameIndex].origin.x)
    / metadata.pixelsPerWorldUnit;
  assert.ok(leftHalfWorld > 0 && rightHalfWorld > 0, `${metadata.path} must straddle its world origin`);
  assert.ok(Math.abs(leftHalfWorld - rightHalfWorld) <= 3,
    `${metadata.path} center silhouette must remain symmetric after raster edge recovery`);
  return 2 * Math.min(leftHalfWorld, rightHalfWorld);
}

function projectUprightPoint(metadata, frameIndex, point) {
  const yaw = metadata.yawDegrees[frameIndex % 7] * Math.PI / 180;
  const pitch = metadata.pitchDegrees[Math.floor(frameIndex / 7)] * Math.PI / 180;
  const rotatedX = point.x * Math.cos(yaw) + point.z * Math.sin(yaw);
  const rotatedZ = -point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const origin = metadata.frames[frameIndex].origin;
  return {
    x: origin.x + rotatedX * metadata.pixelsPerWorldUnit,
    y: origin.y - (point.y * Math.cos(pitch) - rotatedZ * Math.sin(pitch))
      * metadata.pixelsPerWorldUnit,
  };
}

function projectedWorldBoxBounds(metadata, frameIndex, center, size, padding = 2) {
  const points = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    points.push(projectUprightPoint(metadata, frameIndex, {
      x: center.x + x * size.x,
      y: center.y + y * size.y,
      z: center.z + z * size.z,
    }));
  }
  return {
    minX: Math.floor(Math.min(...points.map(({ x }) => x))) - padding,
    maxX: Math.ceil(Math.max(...points.map(({ x }) => x))) + padding,
    minY: Math.floor(Math.min(...points.map(({ y }) => y))) - padding,
    maxY: Math.ceil(Math.max(...points.map(({ y }) => y))) + padding,
  };
}

function isGeneratedCyanSample(rgba, offset) {
  const [red, green, blue, alpha] = rgba.subarray(offset, offset + 4);
  return alpha >= 48 && red >= 112 && green >= 224 && blue >= 224
    && Math.abs(green - blue) <= 24;
}

function countGeneratedCyanDifference(candidate, reference, bounds) {
  assert.equal(candidate.width, reference.width);
  assert.equal(candidate.height, reference.height);
  let count = 0;
  const minX = Math.max(0, bounds.minX);
  const maxX = Math.min(candidate.width - 1, bounds.maxX);
  const minY = Math.max(0, bounds.minY);
  const maxY = Math.min(candidate.height - 1, bounds.maxY);
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const offset = (y * candidate.width + x) * 4;
    if (isGeneratedCyanSample(candidate.rgba, offset)
        && !isGeneratedCyanSample(reference.rgba, offset)) count += 1;
  }
  return count;
}

function generatedCyanEvidence(decoded, bounds) {
  let count = 0;
  let maxHorizontalRun = 0;
  const minX = Math.max(0, bounds.minX);
  const maxX = Math.min(decoded.width - 1, bounds.maxX);
  const minY = Math.max(0, bounds.minY);
  const maxY = Math.min(decoded.height - 1, bounds.maxY);
  for (let y = minY; y <= maxY; y += 1) {
    let run = 0;
    for (let x = minX; x <= maxX; x += 1) {
      const offset = (y * decoded.width + x) * 4;
      if (isGeneratedCyanSample(decoded.rgba, offset)) {
        count += 1;
        run += 1;
        maxHorizontalRun = Math.max(maxHorizontalRun, run);
      } else run = 0;
    }
  }
  return { count, maxHorizontalRun };
}

function pngAlphaStats(relativePaths) {
  return relativePaths.map((relativePath) => {
    const { width, height, rgba } = decodePngRgba(relativePath);
    const borders = { top: 0, right: 0, bottom: 0, left: 0 };
    let transparentPixels = 0;
    let hiddenRgbPixels = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha] = rgba.subarray(offset, offset + 4);
      if (alpha === 0) {
        transparentPixels += 1;
        if (red !== 0 || green !== 0 || blue !== 0) hiddenRgbPixels += 1;
      }
      if (alpha > 0) {
        if (y === 0) borders.top += 1;
        if (x === width - 1) borders.right += 1;
        if (y === height - 1) borders.bottom += 1;
        if (x === 0) borders.left += 1;
      }
    }
    return { path: relativePath, width, height, borders, transparentPixels, hiddenRgbPixels };
  });
}

function compareBoundedUprightRenderSets(referenceAtlases, candidateAtlases) {
  if (referenceAtlases.length !== candidateAtlases.length) {
    return { matches: false, differingPixels: 0 };
  }
  let differingPixels = 0;
  for (let atlasIndex = 0; atlasIndex < referenceAtlases.length; atlasIndex += 1) {
    const reference = referenceAtlases[atlasIndex];
    const candidate = candidateAtlases[atlasIndex];
    if (reference.id !== candidate.id
        || reference.width !== candidate.width
        || reference.height !== candidate.height
        || reference.rgba.length !== candidate.rgba.length) {
      return { matches: false, differingPixels };
    }
    for (let offset = 0; offset < reference.rgba.length; offset += 4) {
      const changedChannels = [];
      for (let channel = 0; channel < 4; channel += 1) {
        if (reference.rgba[offset + channel] !== candidate.rgba[offset + channel]) {
          changedChannels.push(channel);
        }
      }
      if (changedChannels.length === 0) continue;
      differingPixels += 1;
      const channel = changedChannels[0];
      if (differingPixels > 1
          || changedChannels.length !== 1
          || channel >= 3
          || reference.rgba[offset + 3] !== 255
          || candidate.rgba[offset + 3] !== 255
          || Math.abs(reference.rgba[offset + channel] - candidate.rgba[offset + channel]) !== 16) {
        return { matches: false, differingPixels };
      }
    }
  }
  return { matches: true, differingPixels };
}

test('the fresh-render comparator permits only one bounded opaque color sample globally', () => {
  const atlas = (id, pixels) => ({ id, width: 2, height: 1, rgba: Buffer.from(pixels) });
  const baseline = [
    atlas('first', [16, 32, 48, 255, 64, 80, 96, 255]),
    atlas('second', [112, 128, 144, 255, 160, 176, 192, 255]),
  ];
  const candidate = baseline.map(({ id, width, height, rgba }) => ({
    id, width, height, rgba: Buffer.from(rgba),
  }));
  candidate[1].rgba[4] += 16;
  assert.deepEqual(compareBoundedUprightRenderSets(baseline, candidate), {
    matches: true, differingPixels: 1,
  });

  const secondPixel = candidate.map(({ id, width, height, rgba }) => ({
    id, width, height, rgba: Buffer.from(rgba),
  }));
  secondPixel[0].rgba[1] += 16;
  assert.equal(compareBoundedUprightRenderSets(baseline, secondPixel).matches, false);

  for (const mutation of [
    (rgba) => { rgba[4] -= 1; },
    (rgba) => { rgba[5] += 16; },
    (rgba) => { rgba[7] = 254; },
  ]) {
    const invalid = baseline.map(({ id, width, height, rgba }) => ({
      id, width, height, rgba: Buffer.from(rgba),
    }));
    invalid[1].rgba[4] += 16;
    mutation(invalid[1].rgba);
    assert.equal(compareBoundedUprightRenderSets(baseline, invalid).matches, false);
  }
});

test('both player frames are decodable 512 by 384 transparent PNGs', () => {
  for (const relativePath of ['assets/ship/player-neutral.png', 'assets/ship/player-thrust.png']) {
    assertPng(relativePath);
    assert.deepEqual(sipsDimensions(relativePath), { width: 512, height: 384 });
  }
});

test('both player frames keep transparent zero-RGB padding on all four borders', () => {
  const relativePaths = ['assets/ship/player-neutral.png', 'assets/ship/player-thrust.png'];
  for (const stats of pngAlphaStats(relativePaths)) {
    assert.deepEqual(stats.borders, { bottom: 0, left: 0, right: 0, top: 0 }, stats.path);
    assert.ok(stats.transparentPixels > 0, `${stats.path} must retain an alpha channel`);
    assert.equal(stats.hiddenRgbPixels, 0, `${stats.path} must not retain RGB under zero alpha`);
  }
});

test('the selected semantic UI assets are committed as nonempty PNGs', () => {
  for (const relativePath of [
    'assets/ui/panel-frame-cyan.png',
    'assets/ui/meter-frame-cyan.png',
  ]) assertPng(relativePath);
});

test('mission controls use accessible blue gradients without the retired gold frame', () => {
  const css = read('styles/game.css').toString('utf8');
  const notices = read('THIRD_PARTY_NOTICES.md').toString('utf8');
  assert.match(css, /\.mission-action\s*\{[\s\S]*background:\s*linear-gradient\(110deg, #203e94, #5845b7\)/);
  assert.ok(contrastRatio('#f5f8ff', '#203e94') >= 4.5);
  assert.ok(contrastRatio('#f5f8ff', '#5845b7') >= 4.5);
  assert.doesNotMatch(css, /button-frame-gold\.png/);
  assert.doesNotMatch(notices, /button-frame-gold\.png/);
});

test('the six local icons are standalone SVGs without remote runtime resources', () => {
  for (const name of [
    'translate',
    'speaker-high',
    'speaker-slash',
    'trophy',
    'pencil-simple',
    'arrow-counter-clockwise',
  ]) {
    const relativePath = `assets/icons/${name}.svg`;
    const source = read(relativePath).toString('utf8').trim().replace(/^<\?xml[^>]*>\s*/i, '');
    assert.match(source, /^<svg\b/i, `${relativePath} must begin with an SVG root`);
    assert.doesNotMatch(source, /\b(?:href|src)\s*=\s*["']https?:\/\//i, `${relativePath} must not fetch remote resources`);
    assert.doesNotMatch(source, /url\(\s*["']?https?:\/\//i, `${relativePath} must not fetch remote resources`);
  }
});

test('Orbitron Medium is a nonempty TrueType or OpenType font', () => {
  const bytes = read('assets/fonts/Orbitron-Medium.ttf');
  assert.ok(bytes.length > 1000);
  const signature = bytes.subarray(0, 4);
  const validSignatures = [Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.from('OTTO')];
  assert.equal(validSignatures.some((candidate) => candidate.equals(signature)), true);
});

test('third-party notices record every exact source, license, path, hash and download date', () => {
  const notices = read('THIRD_PARTY_NOTICES.md').toString('utf8');
  const required = [
    'Quaternius',
    'https://quaternius.com/packs/ultimatespaceships.html',
    'CC0',
    'Striker/OBJ/Striker.obj',
    'Striker.mtl',
    'Textures/Striker_Blue.png',
    'Kenney',
    'https://kenney.nl/assets/ui-pack-sci-fi',
    'PNG/Extra/Double/panel_glass_notches.png',
    'PNG/Blue/Double/bar_round_gloss_large.png',
    'Phosphor',
    'https://github.com/phosphor-icons/core',
    'MIT',
    'Orbitron',
    'https://github.com/googlefonts/orbitron-vf',
    'OFL-1.1',
    'fonts/ttf/Orbitron-Medium.ttf',
    '2026-08-02',
  ];
  for (const value of required) assert.match(notices, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('committed license copies are byte-identical to the recorded official files', () => {
  const notices = read('THIRD_PARTY_NOTICES.md').toString('utf8');
  const officialLicenses = [
    ['licenses/Quaternius-Ultimate-Spaceships-CC0.txt', '83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c'],
    ['licenses/Kenney-UI-Pack-Sci-Fi-CC0.txt', '80e091ef18f6b88becb3b7c2306c159d16217ca620bfa21b7177582c72924221'],
    ['licenses/Phosphor-Icons-MIT.txt', 'b5b1f1da112d18ea2147decfd48ddc1bf2b5aeb6c265381579340e95b15a2bb2'],
    ['licenses/Orbitron-OFL-1.1.txt', 'ab609b0e110d622435ff337cdf233288556e011bbf9bd0550be98846c0630819'],
    ['licenses/Kenney-Space-Kit-CC0.txt', 'bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7'],
    ['licenses/Kenney-Modular-Space-Kit-CC0.txt', '38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb'],
  ];
  for (const [relativePath, expectedHash] of officialLicenses) {
    assert.equal(sha256(relativePath), expectedHash, `${relativePath} must preserve the official bytes`);
    assert.equal(
      notices.includes(`License copy: \`${relativePath}\` — upstream and committed SHA-256 \`${expectedHash}\``),
      true,
      `${relativePath} must map its upstream and committed hash explicitly`,
    );
  }
});

test('byte-identical runtime assets match their exact recorded upstream hashes', () => {
  const upstreamCopies = [
    ['assets/ui/panel-frame-cyan.png', '3e8dd90c8e44f1c1729ce8d304656c64c8b467985584f9a9394f5631a204f51a'],
    ['assets/ui/meter-frame-cyan.png', 'af13ccda23a736cdf18049cbe05586178e7cde8fddb5617bcf19cd5b10fcc3b9'],
    ['assets/icons/translate.svg', '1e49dc31f3a172c9c7c67361511ee5314598b3f5b32788219325f589487f76c5'],
    ['assets/icons/speaker-high.svg', 'caca5fc1ee8489ac19232301d2c96f6d4048802491d75d761bbb89d5c98e459d'],
    ['assets/icons/speaker-slash.svg', '66b75267ea8ba8759a70e4c8312bfe06b834fc8fcf0dd1710d9819877f0c8013'],
    ['assets/icons/trophy.svg', '45b065edc939de7246e5b5c114dd26b9bd6fb25f88013d6ab09e6cbbf76da9fa'],
    ['assets/icons/pencil-simple.svg', '999530da442f44d8cf0054364373d16150f3e082c2ac294a4988a9c3a4295c28'],
    ['assets/icons/arrow-counter-clockwise.svg', '4eb160d5ae781107c674481ac081962e6bce6281a646129e6c3f960b9dd5dac6'],
    ['assets/fonts/Orbitron-Medium.ttf', 'bc96ab93d786e3417b92285b96cdfe40a3de263930ee99eebfd4e19a756df8d2'],
  ];
  for (const [relativePath, expectedHash] of upstreamCopies) {
    assert.equal(sha256(relativePath), expectedHash, relativePath);
  }
});

test('the documented offline render contract pins renderer and derived output hashes', () => {
  const recipe = read('docs/assets/ship-render.md').toString('utf8');
  const reproducibleFiles = [
    'tools/render-ship.swift',
    'assets/ship/player-neutral.png',
    'assets/ship/player-thrust.png',
    'app/AppIcon.png',
  ];
  for (const relativePath of reproducibleFiles) {
    assert.equal(
      recipe.split('\n').some((line) => line.includes(`\`${relativePath}\``) && line.includes(sha256(relativePath))),
      true,
      `${relativePath} must have its current SHA-256 in the render recipe`,
    );
  }
  assert.match(recipe, /swift tools\/render-ship\.swift \\\n\s+--model .*Striker\.obj \\\n\s+--texture .*Striker_Blue\.png/);
});

test('the world renderer prepares the complete SceneKit scene before taking snapshots', () => {
  const renderer = read('tools/render-world-assets.swift').toString('utf8');
  assert.match(
    renderer,
    /guard renderer\.prepare\(scene, shouldAbortBlock: nil\) else/,
    'multi-component scenes must finish resource preparation before the first deterministic snapshot',
  );
});

test('the world renderer reuses one prepared source template for repeated components', () => {
  const renderer = read('tools/render-world-assets.swift').toString('utf8');
  assert.match(renderer, /var sourceTemplates: \[String: SCNNode\] = \[:\]/);
  assert.match(renderer, /sourceTemplates\[sourceIdentity\]\?\.clone\(\)/);
  assert.match(renderer, /sourceTemplates\[sourceIdentity\] = component/);
});

test('the world renderer maps source material names to an orange-free neutral hierarchy', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-material-palette.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import AppKit
      import Foundation
      import SceneKit

      func rgb(_ name: String?) -> [Int] {
          let source = SCNMaterial()
          source.name = name
          source.diffuse.contents = srgb(0xff, 0x8a, 0x42)
          let result = styledMaterial(source: source, index: 0, texturePaths: [], images: [:])
          let color = (result.diffuse.contents as! NSColor).usingColorSpace(.deviceRGB)!
          return [color.redComponent, color.greenComponent, color.blueComponent].map {
              Int(($0 * 255).rounded())
          }
      }

      precondition(rgb("metal") == [0xe9, 0xef, 0xf6])
      precondition(rgb("_defaultMat") == [0xe9, 0xef, 0xf6])
      precondition(rgb(nil) == [0xe9, 0xef, 0xf6])
      precondition(rgb("dark") == [0x25, 0x30, 0x44])
      precondition(rgb("rockDark") == [0x30, 0x3a, 0x46])
      precondition(rgb("metalDark") == [0x8b, 0x9b, 0xab])
      precondition(rgb("metalRed") == [0x64, 0x78, 0x8e])
      precondition(rgb("rock") == [0x53, 0x66, 0x78])
      precondition(rgb("unexpected-orange-source") == [0xe9, 0xef, 0xf6])
    `);
    const executablePath = path.join(temporaryRoot, 'material-palette-test');
    const compile = spawnSync('swiftc', [rendererLibraryPath, harnessPath, '-o', executablePath], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer samples audited colormap texels without interpolated GPU drift', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-texture-filter.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import AppKit
      import Foundation
      import SceneKit

      let source = SCNMaterial()
      let texturePath = "fixture-colormap.png"
      let texture = NSImage(size: NSSize(width: 2, height: 2))
      let textured = styledMaterial(
          source: source, index: 0,
          texturePaths: [texturePath], images: [texturePath: texture]
      )
      precondition(textured.diffuse.magnificationFilter == .nearest)
      precondition(textured.diffuse.minificationFilter == .nearest)
      precondition(textured.diffuse.mipFilter == .nearest)
      precondition(textured.isDoubleSided == false)

      let untextured = styledMaterial(source: source, index: 0, texturePaths: [], images: [:])
      precondition(untextured.diffuse.magnificationFilter == .linear)
      precondition(untextured.diffuse.minificationFilter == .linear)
      precondition(untextured.diffuse.mipFilter == .linear)
      precondition(untextured.isDoubleSided == true)
    `);
    const executablePath = path.join(temporaryRoot, 'texture-filter-test');
    const compile = spawnSync('swiftc', [rendererLibraryPath, harnessPath, '-o', executablePath], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('upright camera metadata scale matches the measured SceneKit projection', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-camera-scale.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import AppKit
      import Foundation
      import SceneKit

      let frame = UprightFrameContract(
          width: 320, height: 320,
          yawDegrees: [-80, -55, -30, 0, 30, 55, 80],
          pitchDegrees: [20, 55, 80]
      )
      let sampleScale = 2
      let bounds = WORLD_BOUNDS["wallLow"]!
      let scene = SCNScene()
      let setup = try addUprightCamera(to: scene, worldBounds: bounds, frame: frame)
      let pitch = Double(frame.pitchDegrees[0]) * Double.pi / 180
      setup.cameraNode.position = SCNVector3(
          0,
          setup.target.position.y + setup.distance * sin(pitch),
          setup.distance * cos(pitch)
      )
      let renderer = SCNRenderer(device: nil, options: nil)
      renderer.scene = scene
      renderer.pointOfView = setup.cameraNode
      _ = renderer.snapshot(
          atTime: 0,
          with: CGSize(width: frame.width * sampleScale, height: frame.height * sampleScale),
          antialiasingMode: .none
      )
      let centerY = (bounds.minY + bounds.maxY) / 2
      let left = renderer.projectPoint(SCNVector3(bounds.minX, centerY, 0))
      let right = renderer.projectPoint(SCNVector3(bounds.maxX, centerY, 0))
      let measuredPixelsPerWorldUnit = Double(right.x - left.x)
          / Double(sampleScale) / (bounds.maxX - bounds.minX)
      precondition(abs(measuredPixelsPerWorldUnit - setup.pixelsPerWorldUnit) < 0.000001)
    `);
    const executablePath = path.join(temporaryRoot, 'camera-scale-test');
    const compile = spawnSync('swiftc', [rendererLibraryPath, harnessPath, '-o', executablePath], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world manifest freezes the audited v3 layout, budgets, geometry, and thirteen recipes', () => {
  const manifest = JSON.parse(read('tools/world-assets.json'));
  assert.equal(manifest.version, 3);
  assert.deepEqual(manifest.frames.upright, {
    width: 320,
    height: 320,
    yawDegrees: [-80, -55, -30, 0, 30, 55, 80],
    pitchDegrees: [20, 55, 80],
  });
  assert.deepEqual(manifest.frames.roadEdge, {
    width: 512,
    height: 512,
    yawDegrees: [-30, -20, -10, 0, 10, 20, 30],
  });
  assert.deepEqual(manifest.budgets.upright, {
    maxFileBytes: 3145728,
    maxCombinedBytes: 31457280,
    maxDecodedBytes: 117440512,
  });
  assert.equal(manifest.budgets.roadEdge.maxFileBytes, 2 * 1024 * 1024,
    'legacy road-edge files retain their separate 2 MiB ceiling');
  assert.equal(manifest.budgets.roadEdge.maxDecodedBytes, 3584 * 512 * 4,
    'the legacy road-edge decoded budget stays separate from upright matrices');
  assert.equal(UPRIGHT_ATLAS_IDS.length * 2240 * 960 * 4, 103219200);
  assert.ok(UPRIGHT_ATLAS_IDS.length * 2240 * 960 * 4 < manifest.budgets.upright.maxDecodedBytes);
  assert.deepEqual(manifest.geometry, {
    drone: { worldWidth: 432, worldHeight: 360, baseY: 140 },
    turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 },
    wallLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    wallMedium: { worldWidth: 648, worldHeight: 1250, baseY: 0 },
    wallHigh: { worldWidth: 648, worldHeight: 2000, baseY: 0 },
    corridorLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    corridorMedium: { worldWidth: 648, worldHeight: 1250, baseY: 0 },
  });
  assert.deepEqual(manifest.framing, {
    drone: { targetWidthRatio: 0.72, targetHeightRatio: 0.64, bottomPadding: 48 },
    turret: { targetWidthRatio: 0.76, targetHeightRatio: 0.86, bottomPadding: 36 },
    wallLow: { targetWidthRatio: 0.86, targetHeightRatio: 0.58, bottomPadding: 36 },
    wallHigh: { targetWidthRatio: 0.78, targetHeightRatio: 0.88, bottomPadding: 28 },
    gap: { targetWidthRatio: 0.88, targetHeightRatio: 0.56, bottomPadding: 32 },
  });
  assert.deepEqual(manifest.upstream.map(({
    id, sourcePage, archiveFilename, archiveSha256, downloadDate, license,
    licenseSource, licenseCommitted, licenseSha256,
  }) => ({
    id, sourcePage, archiveFilename, archiveSha256, downloadDate, license,
    licenseSource, licenseCommitted, licenseSha256,
  })), [
    {
      id: 'kenney-space-kit',
      sourcePage: 'https://kenney.nl/assets/space-kit',
      archiveFilename: 'kenney_space-kit.zip',
      archiveSha256: 'd5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9',
      downloadDate: '2026-08-03',
      license: 'Creative Commons CC0 1.0 Universal',
      licenseSource: 'space-kit/License.txt',
      licenseCommitted: 'licenses/Kenney-Space-Kit-CC0.txt',
      licenseSha256: 'bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7',
    },
    {
      id: 'kenney-modular-space-kit',
      sourcePage: 'https://kenney.nl/assets/modular-space-kit',
      archiveFilename: 'kenney_modular-space-kit_1.0.zip',
      archiveSha256: 'f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc',
      downloadDate: '2026-08-03',
      license: 'Creative Commons CC0 1.0 Universal',
      licenseSource: 'modular-space-kit/License.txt',
      licenseCommitted: 'licenses/Kenney-Modular-Space-Kit-CC0.txt',
      licenseSha256: '38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb',
    },
  ]);

  const identity = { scale: 1, rotationDegrees: [0, 0, 0], translation: [0, 0, 0] };
  const component = (model, textures, transform = identity) => ({
    model,
    material: model.replace(/\.obj$/, '.mtl'),
    textures,
    ...transform,
  });
  const modularTexture = ['modular-space-kit/Models/OBJ format/Textures/colormap.png'];
  const expected = [
    ['drone-scout', 'kenney-space-kit', 'upright', 'drone', [
      component('space-kit/Models/OBJ format/craft_speederA.obj', []),
    ], [], null],
    ['drone-striker', 'kenney-space-kit', 'upright', 'drone', [
      component('space-kit/Models/OBJ format/craft_speederD.obj', []),
    ], [], null],
    ['turret-sentry', 'kenney-space-kit', 'upright', 'turret', [
      component('space-kit/Models/OBJ format/turret_single.obj', []),
    ], ['turret'], null],
    ['turret-heavy', 'kenney-space-kit', 'upright', 'turret', [
      component('space-kit/Models/OBJ format/turret_double.obj', []),
    ], ['turret'], null],
    ['barrier-rail', 'kenney-space-kit', 'upright', 'wallLow', [
      component('space-kit/Models/OBJ format/barrels_rail.obj', [], {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [-0.44, 0, 0],
      }),
      component('space-kit/Models/OBJ format/barrels_rail.obj', [], {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0.44, 0, 0],
      }),
    ], [], null],
    ['barrier-crate', 'kenney-modular-space-kit', 'upright', 'wallLow', [
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [-0.85, 0, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0.85, 0, 0],
      }),
    ], [], null],
    ['structure-pylon', 'kenney-modular-space-kit', 'upright', 'wallMedium', [
      component('modular-space-kit/Models/OBJ format/room-large.obj', modularTexture, {
        scale: 0.8, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.74, rotationDegrees: [0, 0, 0], translation: [0, 0.78, 0],
      }),
    ], [], null],
    ['structure-bastion', 'kenney-space-kit', 'upright', 'wallMedium', [
      component('space-kit/Models/OBJ format/rocket_baseA.obj', [], {
        scale: 0.78, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      component('space-kit/Models/OBJ format/rocket_sidesA.obj', [], {
        scale: 0.7, rotationDegrees: [0, 0, 0], translation: [-0.68, 0.62, 0],
      }),
      component('space-kit/Models/OBJ format/rocket_sidesA.obj', [], {
        scale: 0.7, rotationDegrees: [0, 0, 0], translation: [0.68, 0.62, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.68, rotationDegrees: [0, 0, 0], translation: [0, 0.48, 0],
      }),
    ], [], null],
    ['structure-reactor', 'kenney-space-kit', 'upright', 'wallHigh', [
      ...[-0.74, 0.74].flatMap((x) => [
        component('space-kit/Models/OBJ format/rocket_baseA.obj', [], {
          scale: 0.85, rotationDegrees: [0, 0, 0], translation: [x, 0, 0],
        }),
        component('space-kit/Models/OBJ format/rocket_sidesA.obj', [], {
          scale: 0.80, rotationDegrees: [0, 0, 0], translation: [x, 0.72, 0],
        }),
        component('space-kit/Models/OBJ format/rocket_fuelA.obj', [], {
          scale: 0.72, rotationDegrees: [0, 0, 0], translation: [x, 1.40, 0],
        }),
        component('space-kit/Models/OBJ format/rocket_topA.obj', [], {
          scale: 0.72, rotationDegrees: [0, 0, 0], translation: [x, 2.02, 0],
        }),
      ]),
    ], [], null],
    ['structure-tower', 'kenney-modular-space-kit', 'upright', 'wallHigh', [
      component('modular-space-kit/Models/OBJ format/room-large.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      ...[0.60, 1.20, 1.80, 2.40, 3.00].map((y) => component(
        'modular-space-kit/Models/OBJ format/room-large.obj', modularTexture,
        { scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0, y, 0] },
      )),
    ], [], null],
    ['corridor-low', 'kenney-space-kit', 'upright', 'corridorLow', [
      component('space-kit/Models/OBJ format/barrels_rail.obj', [], {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [-0.44, 0, 0],
      }),
      component('space-kit/Models/OBJ format/barrels_rail.obj', [], {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0.44, 0, 0],
      }),
    ], [], {
      runtimeContinuity: true, cyanBandY: [390],
    }],
    ['corridor-medium', 'kenney-modular-space-kit', 'upright', 'corridorMedium', [
      component('modular-space-kit/Models/OBJ format/room-large.obj', modularTexture, {
        scale: 0.78, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.7, rotationDegrees: [0, 0, 0], translation: [0, 0.72, 0],
      }),
    ], [], {
      runtimeContinuity: true, cyanBandY: [460, 910],
    }],
    ['gap-edge', 'kenney-space-kit', 'roadEdge', 'gap', [
      component('space-kit/Models/OBJ format/terrain_sideCliff.obj', [], {
        scale: 0.78, rotationDegrees: [0, 0, 0], translation: [-0.42, 0, 0],
      }),
      component('space-kit/Models/OBJ format/terrain_sideCliff.obj', [], {
        scale: 0.78, rotationDegrees: [0, 0, 0], translation: [0.42, 0, 0],
      }),
    ], [], null],
  ];
  assert.deepEqual(manifest.assets.map(({
    id, sourceFamily, layout, category, components, hideNodes, generatedDetails = null,
  }) => [
    id, sourceFamily, layout, category, components, hideNodes, generatedDetails,
  ]), expected);
  const reactor = manifest.assets.find(({ id }) => id === 'structure-reactor');
  const fuelCenters = reactor.components
    .filter(({ model }) => model.endsWith('/rocket_fuelA.obj'))
    .map(({ translation }) => translation[0]);
  assert.ok(fuelCenters[1] - fuelCenters[0] >= 1.44,
    'the two normalized 2:1 fuel bodies at scale 0.72 must not overlap horizontally');
  assert.deepEqual(manifest.assets.map(({ id }) => id), MANIFEST_RECIPE_IDS);
  assert.deepEqual(manifest.assets.map(({ layout, category }) => [layout, category]), [
    ['upright', 'drone'], ['upright', 'drone'],
    ['upright', 'turret'], ['upright', 'turret'],
    ['upright', 'wallLow'], ['upright', 'wallLow'],
    ['upright', 'wallMedium'], ['upright', 'wallMedium'],
    ['upright', 'wallHigh'], ['upright', 'wallHigh'],
    ['upright', 'corridorLow'], ['upright', 'corridorMedium'],
    ['roadEdge', 'gap'],
  ]);

  const sourcePaths = manifest.assets.flatMap(({ components }) => components.flatMap(({ model, material, textures }) => [
    model, material, ...textures,
  ]));
  assert.deepEqual(Object.keys(manifest.sourceHashes).sort(), [...new Set(sourcePaths)].sort());
  assert.deepEqual(manifest.sourceHashes, WORLD_SOURCE_HASHES);
  for (const [sourcePath, hash] of Object.entries(manifest.sourceHashes)) {
    assert.match(hash, /^[a-f0-9]{64}$/, `${sourcePath} must have an audited SHA-256`);
    assert.equal(path.posix.isAbsolute(sourcePath), false, `${sourcePath} must be relative`);
    assert.doesNotMatch(sourcePath, /(?:https?:|file:|\/Source(?:s| Edition)?\/|\.(?:blend|fbx|glb|gltf)$)/i);
  }
});

test('corridor recipes reserve every longitudinal continuity primitive for runtime Canvas', () => {
  const manifest = JSON.parse(read('tools/world-assets.json'));
  const expected = new Map([
    ['corridor-low', { runtimeContinuity: true, cyanBandY: [390] }],
    ['corridor-medium', { runtimeContinuity: true, cyanBandY: [460, 910] }],
  ]);
  for (const [id, details] of expected) {
    const asset = manifest.assets.find((candidate) => candidate.id === id);
    assert.deepEqual(asset.generatedDetails, details, `${id} generated-only schema`);
  }

  const renderer = read('tools/render-world-assets.swift').toString('utf8');
  assert.match(renderer, /let runtimeContinuity: Bool/);
  assert.doesNotMatch(renderer, /details\.(?:plinthSize|conduitSize|conduitY)/,
    'offline rendering must not bake topology-dependent plinths or conduits');
});

test('corridor atlas cyan bands sit on the normalized armor front', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'corridor-band-contract.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import Foundation
      import SceneKit

      let armorHalfDepth = 120.1234567
      let recipe = AssetRecipe(
          id: "synthetic-corridor-low",
          sourceFamily: "fixture",
          layout: "upright",
          category: "corridorLow",
          components: [],
          hideNodes: [],
          generatedDetails: GeneratedDetails(
              runtimeContinuity: true,
              cyanBandY: [390]
          )
      )
      let turntable = SCNNode()
      try addUprightDetails(
          to: turntable,
          asset: recipe,
          armorHalfDepth: armorHalfDepth
      )
      let bands = turntable.childNodes.filter {
          abs(Double($0.position.y) - 390) < 0.000000001
      }
      precondition(bands.count == 1)
      precondition(abs(Double(bands[0].position.z) - (armorHalfDepth + 3)) < 0.0001)
    `);
    const executablePath = path.join(temporaryRoot, 'corridor-band-contract');
    const compile = spawnSync('swiftc', [
      '-warnings-as-errors', rendererLibraryPath, harnessPath, '-o', executablePath,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the upright renderer assembles deterministic pitch-major metadata from synthetic cells', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'upright-atlas-contract.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import Foundation

      func expectRenderFailure(_ message: String, _ body: () throws -> Void) {
          do {
              try body()
              preconditionFailure("expected renderer failure containing: \\(message)")
          } catch let error as RenderError {
              precondition(error.description.localizedCaseInsensitiveContains(message), error.description)
          } catch {
              preconditionFailure("unexpected error: \\(error)")
          }
      }

      func replacing(
          _ source: UprightAtlasMetadata,
          atlasWidth: Int? = nil,
          atlasHeight: Int? = nil,
          detailFrontZ: Double? = nil,
          pixelsPerWorldUnit: Double? = nil,
          frames: [UprightFrameMetadata]? = nil
      ) -> UprightAtlasMetadata {
          UprightAtlasMetadata(
              layout: source.layout,
              atlasWidth: atlasWidth ?? source.atlasWidth,
              atlasHeight: atlasHeight ?? source.atlasHeight,
              frameWidth: source.frameWidth,
              frameHeight: source.frameHeight,
              yawDegrees: source.yawDegrees,
              pitchDegrees: source.pitchDegrees,
              detailFrontZ: detailFrontZ ?? source.detailFrontZ,
              worldBounds: source.worldBounds,
              pixelsPerWorldUnit: pixelsPerWorldUnit ?? source.pixelsPerWorldUnit,
              frames: frames ?? source.frames
          )
      }

      let contract = UprightFrameContract(
          width: 320,
          height: 320,
          yawDegrees: [-80, -55, -30, 0, 30, 55, 80],
          pitchDegrees: [20, 55, 80]
      )
      precondition(baseCyanBandRatios(for: "drone") == [0.48])
      precondition(baseCyanBandRatios(for: "turret") == [0.34])
      precondition(baseCyanBandRatios(for: "wallLow") == [0.34])
      precondition(baseCyanBandRatios(for: "wallMedium") == [0.34, 0.68])
      precondition(baseCyanBandRatios(for: "wallHigh") == [0.34, 0.68])
      precondition(baseCyanBandRatios(for: "corridorLow") == [0.34])
      precondition(baseCyanBandRatios(for: "corridorMedium") == [0.34])
      let syntheticDetailFrontZ = try normalizedArmorHalfDepth(
          sourceDepth: 240.2469134,
          horizontalScale: 1
      )
      precondition(abs(syntheticDetailFrontZ - 120.1234567) < 0.000000001)
      let worldBounds = WorldBoundsMetadata(
          minX: -216, maxX: 216,
          minY: 140, maxY: 500,
          minZ: -25, maxZ: 25
      )
      var cells: [UprightRenderedCell] = []
      for pitchIndex in 0..<3 {
          for yawIndex in 0..<7 {
              var pixels = [UInt8](repeating: 0, count: 320 * 320 * 4)
              let minX = 8 + yawIndex
              let minY = 10 + pitchIndex * 2
              let maxX = minX + 20 + yawIndex
              let maxY = minY + 24 + pitchIndex
              for y in (minY + 1)...maxY {
                  for x in (minX + 1)...maxX {
                      let offset = (y * 320 + x) * 4
                      pixels[offset] = 32
                      pixels[offset + 1] = 48
                      pixels[offset + 2] = 64
                      pixels[offset + 3] = 255
                  }
              }
              if pitchIndex == 0 && yawIndex == 0 {
                  let invalidPremultipliedOffset = ((minY + 2) * 320 + minX + 2) * 4
                  pixels[invalidPremultipliedOffset] = 250
                  pixels[invalidPremultipliedOffset + 1] = 200
                  pixels[invalidPremultipliedOffset + 2] = 100
                  pixels[invalidPremultipliedOffset + 3] = 70
                  let validPremultipliedOffset = ((minY + 2) * 320 + minX + 3) * 4
                  pixels[validPremultipliedOffset] = 16
                  pixels[validPremultipliedOffset + 1] = 32
                  pixels[validPremultipliedOffset + 2] = 48
                  pixels[validPremultipliedOffset + 3] = 64
              }
              let alphaOneOffset = (minY * 320 + minX) * 4
              pixels[alphaOneOffset] = 1
              pixels[alphaOneOffset + 1] = 1
              pixels[alphaOneOffset + 2] = 1
              pixels[alphaOneOffset + 3] = 1
              let desiredTopLeftX = Double(40 + yawIndex) + 0.1234567
              let desiredTopLeftY = Double(210 + pitchIndex) + 0.7654321
              cells.append(UprightRenderedCell(
                  pixels: pixels,
                  projectedOrigin: PixelPoint(
                      x: desiredTopLeftX * 2,
                      y: (320 - desiredTopLeftY) * 2
                  )
              ))
          }
      }

      let product = try makeUprightAtlas(
          cells: cells,
          frame: contract,
          worldBounds: worldBounds,
          detailFrontZ: syntheticDetailFrontZ,
          pixelsPerWorldUnit: 2.3456789,
          supersample: 2,
          assetID: "drone-scout"
      )
      let metadata = product.metadata
      precondition(metadata.atlasWidth == 2240)
      precondition(metadata.atlasHeight == 960)
      precondition(product.pixels.count == 2240 * 960 * 4)
      precondition(metadata.frames.count == 21)
      precondition(metadata.detailFrontZ == 120.123457)
      precondition(metadata.pixelsPerWorldUnit == 2.345679)
      precondition(metadata.frames[0].origin == PixelPoint(x: 40.123457, y: 210.765432))
      let repairedPremultipliedOffset = (12 * 2_240 + 10) * 4
      precondition(Array(product.pixels[repairedPremultipliedOffset..<(repairedPremultipliedOffset + 4)]) == [70, 70, 70, 70])
      let preservedPremultipliedOffset = (12 * 2_240 + 11) * 4
      precondition(Array(product.pixels[preservedPremultipliedOffset..<(preservedPremultipliedOffset + 4)]) == [16, 32, 48, 64])

      for pitchIndex in 0..<3 {
          for yawIndex in 0..<7 {
              let frameIndex = pitchIndex * 7 + yawIndex
              let record = metadata.frames[frameIndex]
              let source = record.source
              let cellX = yawIndex * 320
              let cellY = pitchIndex * 320
              precondition(source.sx == cellX + 8 + yawIndex)
              precondition(source.sy == cellY + 10 + pitchIndex * 2)
              precondition(source.sw > 0 && source.sh > 0)
              precondition(source.sx >= cellX && source.sx + source.sw <= cellX + 320)
              precondition(source.sy >= cellY && source.sy + source.sh <= cellY + 320)
              precondition(record.origin.x.isFinite && record.origin.y.isFinite)

              let expectedX = Double(cellX + 40 + yawIndex) + 0.1234567
              let expectedY = Double(cellY + 210 + pitchIndex) + 0.7654321
              precondition(abs(record.origin.x - (expectedX * 1_000_000).rounded() / 1_000_000) < 0.0000001)
              precondition(abs(record.origin.y - (expectedY * 1_000_000).rounded() / 1_000_000) < 0.0000001)
              let croppedOriginX = (record.origin.x - Double(source.sx)) / metadata.pixelsPerWorldUnit
              let croppedOriginY = (record.origin.y - Double(source.sy)) / metadata.pixelsPerWorldUnit
              let reconstructedX = Double(source.sx) + croppedOriginX * metadata.pixelsPerWorldUnit
              let reconstructedY = Double(source.sy) + croppedOriginY * metadata.pixelsPerWorldUnit
              precondition(abs(reconstructedX - record.origin.x) < 0.0000001)
              precondition(abs(reconstructedY - record.origin.y) < 0.0000001)
          }
      }
      try validateUprightAtlasMetadata(
          metadata,
          expectedWorldBounds: worldBounds,
          assetID: "drone-scout"
      )

      expectRenderFailure("21") {
          _ = try makeUprightAtlas(
              cells: Array(cells.dropLast()), frame: contract, worldBounds: worldBounds,
              detailFrontZ: syntheticDetailFrontZ,
              pixelsPerWorldUnit: 2, supersample: 2, assetID: "short"
          )
      }
      var emptyCells = cells
      emptyCells[0] = UprightRenderedCell(
          pixels: [UInt8](repeating: 0, count: 320 * 320 * 4),
          projectedOrigin: PixelPoint(x: 20, y: 20)
      )
      expectRenderFailure("alpha") {
          _ = try makeUprightAtlas(
              cells: emptyCells, frame: contract, worldBounds: worldBounds,
              detailFrontZ: syntheticDetailFrontZ,
              pixelsPerWorldUnit: 2, supersample: 2, assetID: "empty"
          )
      }

      expectRenderFailure("21") {
          try validateUprightAtlasMetadata(
              replacing(metadata, frames: Array(metadata.frames.dropLast())),
              expectedWorldBounds: worldBounds, assetID: "short-metadata"
          )
      }
      var invalidFrames = metadata.frames
      invalidFrames[0] = UprightFrameMetadata(
          source: PixelRect(sx: 0, sy: 0, sw: 0, sh: 1),
          origin: invalidFrames[0].origin
      )
      expectRenderFailure("non-empty") {
          try validateUprightAtlasMetadata(
              replacing(metadata, frames: invalidFrames),
              expectedWorldBounds: worldBounds, assetID: "empty-source"
          )
      }
      invalidFrames = metadata.frames
      invalidFrames[0] = UprightFrameMetadata(
          source: PixelRect(sx: 320, sy: 0, sw: 1, sh: 1),
          origin: invalidFrames[0].origin
      )
      expectRenderFailure("own cell") {
          try validateUprightAtlasMetadata(
              replacing(metadata, frames: invalidFrames),
              expectedWorldBounds: worldBounds, assetID: "outside-cell"
          )
      }
      invalidFrames = metadata.frames
      invalidFrames[0] = UprightFrameMetadata(
          source: invalidFrames[0].source,
          origin: PixelPoint(x: Double.nan, y: 1)
      )
      expectRenderFailure("finite") {
          try validateUprightAtlasMetadata(
              replacing(metadata, frames: invalidFrames),
              expectedWorldBounds: worldBounds, assetID: "nan-origin"
          )
      }
      expectRenderFailure("positive") {
          try validateUprightAtlasMetadata(
              replacing(metadata, pixelsPerWorldUnit: 0),
              expectedWorldBounds: worldBounds, assetID: "zero-scale"
          )
      }
      expectRenderFailure("detailFrontZ") {
          try validateUprightAtlasMetadata(
              replacing(metadata, detailFrontZ: 0),
              expectedWorldBounds: worldBounds, assetID: "zero-detail-front"
          )
      }
      expectRenderFailure("detailFrontZ") {
          try validateUprightAtlasMetadata(
              replacing(metadata, detailFrontZ: Double.nan),
              expectedWorldBounds: worldBounds, assetID: "nan-detail-front"
          )
      }
      expectRenderFailure("2240x960") {
          try validateUprightAtlasMetadata(
              replacing(metadata, atlasWidth: 2239),
              expectedWorldBounds: worldBounds, assetID: "wrong-dimensions"
          )
      }

      let atlases = Dictionary(uniqueKeysWithValues: canonicalUprightIDs.map { ($0, metadata) })
      let sourceHashes = ["fixture/source.obj": String(repeating: "a", count: 64)]
      let outputHashes = Dictionary(uniqueKeysWithValues: canonicalUprightIDs.map {
          ("\\($0).png", String(repeating: "b", count: 64))
      })
      let report = try encodeRendererReport(
          rendererSha256: String(repeating: "c", count: 64),
          sourceHashes: sourceHashes,
          outputHashes: outputHashes,
          uprightAtlases: atlases
      )
      let reportAgain = try encodeRendererReport(
          rendererSha256: String(repeating: "c", count: 64),
          sourceHashes: sourceHashes,
          outputHashes: outputHashes,
          uprightAtlases: atlases
      )
      precondition(report == reportAgain)
      let javascript = try encodeUprightMetadataJavaScript(atlases)
      let javascriptAgain = try encodeUprightMetadataJavaScript(atlases)
      precondition(javascript == javascriptAgain)
      let reportText = String(decoding: report, as: UTF8.self)
      let javascriptText = String(decoding: javascript, as: UTF8.self)
      precondition(reportText.contains("2.345679"))
      precondition(!reportText.contains("2.3456789"))
      precondition(javascriptText.contains("GENERATED_UPRIGHT_ATLAS_DATA"))
      try report.write(
          to: URL(fileURLWithPath: CommandLine.arguments[1]),
          options: Data.WritingOptions.atomic
      )
      try javascript.write(
          to: URL(fileURLWithPath: CommandLine.arguments[2]),
          options: Data.WritingOptions.atomic
      )
    `);
    const executablePath = path.join(temporaryRoot, 'upright-atlas-contract');
    const compile = spawnSync('swiftc', [
      '-warnings-as-errors', rendererLibraryPath, harnessPath, '-o', executablePath,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const reportPath = path.join(temporaryRoot, 'report.json');
    const metadataPath = path.join(temporaryRoot, 'generated-upright-data.js');
    const run = spawnSync(executablePath, [reportPath, metadataPath], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);

    const reportBytes = fs.readFileSync(reportPath);
    const metadataBytes = fs.readFileSync(metadataPath);
    const report = JSON.parse(reportBytes);
    const metadataSource = metadataBytes.toString('utf8');
    assert.deepEqual(Object.keys(report.uprightAtlases).sort(), [...UPRIGHT_ATLAS_IDS].sort());
    assert.equal(report.uprightAtlases['drone-scout'].atlasWidth, 2240);
    assert.equal(report.uprightAtlases['drone-scout'].atlasHeight, 960);
    assert.equal(report.uprightAtlases['drone-scout'].detailFrontZ, 120.123457);
    assert.equal(report.uprightAtlases['drone-scout'].frames.length, 21);
    assert.deepEqual(Object.keys(report).sort(), [
      'outputHashes', 'rendererSha256', 'sourceHashes', 'uprightAtlases',
    ]);
    assert.equal(metadataSource.includes(temporaryRoot), false, 'metadata must not leak temporary paths');
    assert.equal(reportBytes.includes(Buffer.from(temporaryRoot)), false, 'report must not leak temporary paths');
    assert.equal((metadataSource.match(/GENERATED_UPRIGHT_ATLAS_DATA/g) || []).length, 1);
    let previousIndex = -1;
    for (const id of UPRIGHT_ATLAS_IDS) {
      const currentIndex = metadataSource.indexOf(JSON.stringify(id));
      assert.ok(currentIndex > previousIndex, `${id} must use canonical manifest order in metadata JS`);
      previousIndex = currentIndex;
    }
    const generated = vm.runInNewContext(`${metadataSource}\nGENERATED_UPRIGHT_ATLAS_DATA`, Object.create(null));
    assert.deepEqual(Object.keys(generated), UPRIGHT_ATLAS_IDS);
    assert.equal(generated['drone-scout'].detailFrontZ, 120.123457);
    assert.equal(JSON.stringify(generated), JSON.stringify(Object.fromEntries(
      UPRIGHT_ATLAS_IDS.map((id) => [id, report.uprightAtlases[id]]),
    )));
    const assertDeepFrozen = (value) => {
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') assertDeepFrozen(child);
      }
    };
    assertDeepFrozen(generated);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer CLI rejects forbidden paths in every manifest path field', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const usage = spawnSync('swift', [renderer], { cwd: root, encoding: 'utf8' });
  assert.notEqual(usage.status, 0);
  assert.match(usage.stderr, /Usage: render-world-assets\.swift --manifest WORLD_ASSETS\.json --source-root EXTRACTED --output OUTPUT --metadata-js OUTPUT\.js/);
  const duplicateFlag = spawnSync('swift', [renderer,
    '--manifest', 'manifest.json',
    '--source-root', 'source',
    '--output', 'output-a',
    '--metadata-js', 'metadata.js',
    '--output', 'output-b',
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(duplicateFlag.status, 0);
  assert.match(duplicateFlag.stderr, /Usage:/);

  const original = JSON.parse(read('tools/world-assets.json'));
  const invalidPaths = [
    ['/tmp/fixture.bin', /absolute paths are forbidden/i],
    ['https://example.invalid/fixture.bin', /network URLs are forbidden/i],
    ['../fixture.bin', /path traversal is forbidden/i],
    ['quaternius/Source/fixture.bin', /source-edition paths are forbidden/i],
  ];
  const pathFields = [
    ['upstream.archiveFilename', (manifest, value) => { manifest.upstream[0].archiveFilename = value; }],
    ['upstream.licenseSource', (manifest, value) => { manifest.upstream[0].licenseSource = value; }],
    ['upstream.licenseCommitted', (manifest, value) => { manifest.upstream[0].licenseCommitted = value; }],
    ['component.model', (manifest, value) => { manifest.assets[0].components[0].model = value; }],
  ];
  for (const [field, setPath] of pathFields) for (const [invalidPath, expectedMessage] of invalidPaths) {
    const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-renderer-contract.'));
    try {
      const manifest = structuredClone(original);
      setPath(manifest, invalidPath);
      const sourceRoot = path.join(temporaryRoot, 'source');
      for (const [licenseSource, committedPath] of [
        ['space-kit/License.txt', 'licenses/Kenney-Space-Kit-CC0.txt'],
        ['modular-space-kit/License.txt', 'licenses/Kenney-Modular-Space-Kit-CC0.txt'],
      ]) {
        const absolutePath = path.join(sourceRoot, licenseSource);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.copyFileSync(path.join(root, committedPath), absolutePath);
      }
      const manifestPath = path.join(temporaryRoot, 'manifest.json');
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      const result = spawnSync('swift', [renderer,
        '--manifest', manifestPath,
        '--source-root', sourceRoot,
        '--output', path.join(temporaryRoot, 'output'),
        '--metadata-js', path.join(temporaryRoot, 'metadata.js'),
      ], { cwd: root, encoding: 'utf8' });
      assert.notEqual(result.status, 0, `${field}=${invalidPath} must be rejected`);
      assert.match(result.stderr, expectedMessage, `${field}=${invalidPath}`);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('the world renderer verifies each source-root license before accepting the manifest', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-license-validator.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import Foundation
      let arguments = try Arguments([
          "render-world-assets.swift",
          "--manifest", CommandLine.arguments[1],
          "--source-root", CommandLine.arguments[2],
          "--output", CommandLine.arguments[3],
          "--metadata-js", CommandLine.arguments[4],
      ])
      _ = try loadAndValidateManifest(arguments: arguments)
      print("validated")
    `);
    const executablePath = path.join(temporaryRoot, 'license-validator-test');
    const compile = spawnSync('swiftc', [rendererLibraryPath, harnessPath, '-o', executablePath], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(compile.status, 0, compile.stderr);

    const manifest = JSON.parse(read('tools/world-assets.json'));
    const sourceRoot = path.join(temporaryRoot, 'source');
    for (const sourcePath of Object.keys(manifest.sourceHashes)) {
      const bytes = Buffer.from(`fixture:${sourcePath}`);
      const absolutePath = path.join(sourceRoot, sourcePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, bytes);
      manifest.sourceHashes[sourcePath] = crypto.createHash('sha256').update(bytes).digest('hex');
    }
    for (const [licenseSource, committedPath] of [
      ['space-kit/License.txt', 'licenses/Kenney-Space-Kit-CC0.txt'],
      ['modular-space-kit/License.txt', 'licenses/Kenney-Modular-Space-Kit-CC0.txt'],
    ]) {
      const absolutePath = path.join(sourceRoot, licenseSource);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.copyFileSync(path.join(root, committedPath), absolutePath);
    }
    const validManifestPath = path.join(temporaryRoot, 'valid-manifest.json');
    fs.writeFileSync(validManifestPath, `${JSON.stringify(manifest)}\n`);
    const metadataPath = path.join(temporaryRoot, 'metadata.js');
    const valid = spawnSync(executablePath, [
      validManifestPath, sourceRoot, path.join(temporaryRoot, 'output'), metadataPath,
    ], {
      encoding: 'utf8',
    });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout.trim(), 'validated');

    manifest.upstream[0].licenseSource = 'space-kit/Models/OBJ format/craft_speederA.obj';
    const wrongManifestPath = path.join(temporaryRoot, 'wrong-manifest.json');
    fs.writeFileSync(wrongManifestPath, `${JSON.stringify(manifest)}\n`);
    const wrong = spawnSync(executablePath, [
      wrongManifestPath, sourceRoot, path.join(temporaryRoot, 'output'), metadataPath,
    ], {
      encoding: 'utf8',
    });
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /License hash mismatch for space-kit\/Models\/OBJ format\/craft_speederA\.obj/);

    manifest.upstream[0].licenseSource = 'space-kit/License.txt';
    fs.rmSync(path.join(sourceRoot, 'modular-space-kit/License.txt'));
    const missingManifestPath = path.join(temporaryRoot, 'missing-manifest.json');
    fs.writeFileSync(missingManifestPath, `${JSON.stringify(manifest)}\n`);
    const missing = spawnSync(executablePath, [
      missingManifestPath, sourceRoot, path.join(temporaryRoot, 'output'), metadataPath,
    ], {
      encoding: 'utf8',
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing or unreadable license source: modular-space-kit\/License\.txt/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer rejects opaque left or right padding in every atlas frame', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-padding-validator.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harness = `
      import Foundation

      let frameWidth = 512
      let frameCount = 7
      let height = 3
      let bytesPerRow = frameWidth * frameCount * 4
      let transparent = [UInt8](repeating: 0, count: bytesPerRow * height)
      try validateTransparentAtlasPadding(
          transparent,
          frameWidth: frameWidth,
          frameHeight: height,
          frameCount: frameCount,
          bytesPerRow: bytesPerRow,
          assetID: "transparent-fixture"
      )

      for seamX in [512, 1023] {
          var opaqueSeam = transparent
          opaqueSeam[bytesPerRow + seamX * 4 + 3] = 255
          do {
              try validateTransparentAtlasPadding(
                  opaqueSeam,
                  frameWidth: frameWidth,
                  frameHeight: height,
                  frameCount: frameCount,
                  bytesPerRow: bytesPerRow,
                  assetID: "opaque-seam-fixture"
              )
              preconditionFailure("opaque internal frame seam must be rejected")
          } catch let error as RenderError {
              precondition(error.description.contains("nontransparent left or right frame border"))
          }
      }
    `;
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    const executablePath = path.join(temporaryRoot, 'padding-validator-test');
    fs.writeFileSync(harnessPath, harness);
    const compile = spawnSync('swiftc', [
      rendererLibraryPath, harnessPath, '-o', executablePath,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer canonicalizes only isolated opaque one-bucket GPU noise', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-canonicalizer.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harness = `
      import Foundation

      func fixture(center: [UInt8], repeatedCenter: Bool = false, transparentNeighbor: Bool = false) -> [UInt8] {
          let candidate: [UInt8] = [64, 48, 160, 255]
          var pixels = [UInt8](repeating: 0, count: 3 * 3 * 4)
          let neighbors: [[UInt8]] = [
              [48, 32, 144, 255], [48, 32, 144, 255], candidate,
              [48, 32, 144, 255], center, candidate,
              [64, 32, 144, 255], candidate, [64, 48, 176, 255],
          ]
          for (index, color) in neighbors.enumerated() {
              for channel in 0..<4 { pixels[index * 4 + channel] = color[channel] }
          }
          if repeatedCenter {
              for channel in 0..<4 { pixels[channel] = center[channel] }
          }
          if transparentNeighbor { pixels[3] = 0 }
          return pixels
      }

      let isolated = fixture(center: [64, 32, 160, 255])
      var normalized = isolated
      canonicalizeIsolatedOpaqueNoise(&normalized, width: 3, height: 3, bytesPerRow: 12)
      precondition(Array(normalized[16..<20]) == [64, 48, 160, 255])
      precondition(Array(normalized[0..<16]) == Array(isolated[0..<16]))
      precondition(Array(normalized[20...]) == Array(isolated[20...]))

      for protected in [
          fixture(center: [48, 32, 144, 255], repeatedCenter: true),
          fixture(center: [48, 32, 144, 255]),
          fixture(center: [64, 32, 160, 255], transparentNeighbor: true),
          fixture(center: [64, 32, 144, 255]),
      ] {
          var result = protected
          canonicalizeIsolatedOpaqueNoise(&result, width: 3, height: 3, bytesPerRow: 12)
          precondition(result == protected)
      }
    `;
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    const executablePath = path.join(temporaryRoot, 'canonicalizer-test');
    fs.writeFileSync(harnessPath, harness);
    const compile = spawnSync('swiftc', [
      rendererLibraryPath, harnessPath, '-o', executablePath,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer rounds GPU colors to the nearest 4-bit bucket', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-color-quantizer.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import Foundation
      precondition(quantizedPremultipliedChannel(79, alpha: 255) == 80)
      precondition(quantizedPremultipliedChannel(80, alpha: 255) == 80)
      precondition(quantizedPremultipliedChannel(63, alpha: 255) == 64)
      precondition(quantizedPremultipliedChannel(64, alpha: 255) == 64)
      precondition(quantizedPremultipliedChannel(255, alpha: 255) == 255)
      precondition(quantizedPremultipliedChannel(80, alpha: 70) == 70)
    `);
    const executablePath = path.join(temporaryRoot, 'color-quantizer-test');
    const compile = spawnSync('swiftc', [rendererLibraryPath, harnessPath, '-o', executablePath], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer shifts all yaw frames together into the required bottom band', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-bottom-anchor.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    fs.writeFileSync(harnessPath, `
      import Foundation
      var first = [UInt8](repeating: 0, count: 2 * 8 * 4)
      var second = first
      first[(2 * 2 + 0) * 4 + 3] = 255
      second[(4 * 2 + 1) * 4 + 3] = 255
      let anchored = try bottomBandAnchoredFrames(
          [first, second], width: 2, height: 8, minimumBottom: 4, maximumBottom: 6
      )
      precondition(anchored[0][(4 * 2 + 0) * 4 + 3] == 255)
      precondition(anchored[1][(6 * 2 + 1) * 4 + 3] == 255)
    `);
    const executablePath = path.join(temporaryRoot, 'bottom-anchor-test');
    const compile = spawnSync('swiftc', [rendererLibraryPath, harnessPath, '-o', executablePath], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the world renderer filters only exact hidden OBJ groups and rejects missing groups', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const temporaryRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'world-obj-filter.'));
  try {
    const rendererLibraryPath = path.join(temporaryRoot, 'Renderer.swift');
    const rendererLibrary = fs.readFileSync(renderer, 'utf8')
      .replace(/^#!.*\n/, '')
      .replace(/\n#if !WORLD_CANONICALIZER_TEST[\s\S]*\n#endif\s*$/, '\n');
    fs.writeFileSync(rendererLibraryPath, rendererLibrary);
    const harness = `
      import Foundation

      let fixtureLF = """
      mtllib original.mtl
      v 0 0 0
      v 1 0 0
      v 0 1 0
      g base
      usemtl dark
      f 1 2 3
      g turret
      usemtl orange
      f 1 3 2
      g turret_mount
      f 2 1 3

      """
      let fixture = fixtureLF.replacingOccurrences(of: "\\n", with: "\\r\\n")
      let filtered = try filterOBJSource(
          fixture,
          hidingGroups: ["turret"],
          materialFilename: "orbital-source.mtl",
          label: "synthetic.obj"
      )
      precondition(filtered.contains("mtllib orbital-source.mtl"))
      precondition(filtered.contains("g base\\nusemtl dark\\nf 1 2 3"))
      precondition(filtered.contains("g turret\\nusemtl orange"))
      precondition(!filtered.contains("f 1 3 2"))
      precondition(filtered.contains("g turret_mount\\nf 2 1 3"))

      do {
          _ = try filterOBJSource(
              fixture,
              hidingGroups: ["missing"],
              materialFilename: "orbital-source.mtl",
              label: "synthetic.obj"
          )
          preconditionFailure("a requested but undeclared group must be rejected")
      } catch let error as RenderError {
          precondition(error.description.contains("missing"))
      }

      let coincidentFixture = """
      mtllib original.mtl
      v 0 0 0
      v 1 0 0
      v 0 1 0
      v -0.0 0 0
      v 1.0 0 0
      v 0 1.0 0
      vt 0 0
      vt 1 0
      vt 0 1
      vt -0.0 0
      vt 1.0 0
      vt 0 1.0
      vn 0 0 1
      vn 0 0 0.99999976
      usemtl shell
      f 1/1/1 2/2/1 3/3/1
      f 1/1/1 2/2/1 3/3/1
      f 5/5/2 6/6/2 4/4/2
      f 1/1/1 3/3/1 2/2/1
      f 1/2/1 2/3/1 3/1/1
      usemtl accent
      f 1/1/1 2/2/1 3/3/1
      """
      let canonical = try filterOBJSource(
          coincidentFixture,
          hidingGroups: [],
          materialFilename: "orbital-source.mtl",
          label: "coincident.obj",
          deduplicateOrientedFaces: true
      )
      let canonicalFaces = canonical.split(separator: "\\n").filter { $0.hasPrefix("f ") }
      precondition(canonicalFaces.count == 4)
      precondition(canonical.contains("f 1/1/1 2/2/1 3/3/1"))
      precondition(!canonical.contains("f 5/5/2 6/6/2 4/4/2"))
      precondition(canonical.contains("f 1/1/1 3/3/1 2/2/1"))
      precondition(canonical.contains("f 1/2/1 2/3/1 3/1/1"))
      precondition(canonical.contains("usemtl accent\\nf 1/1/1 2/2/1 3/3/1"))

      precondition(requiresCoincidentFaceCanonicalization(
          "modular-space-kit/Models/OBJ format/room-large.obj"
      ))
      precondition(requiresCoincidentFaceCanonicalization(
          "modular-space-kit/Models/OBJ format/gate-lasers.obj"
      ))
      precondition(!requiresCoincidentFaceCanonicalization(
          "space-kit/Models/OBJ format/craft_speederA.obj"
      ))

      let conflictingNormals = """
      v 0 0 0
      v 1 0 0
      v 0 1 0
      vt 0 0
      vt 1 0
      vt 0 1
      vn 0 0 1
      vn 0 0 0.99999974
      usemtl shell
      f 1/1/1 2/2/1 3/3/1
      f 1/1/2 2/2/2 3/3/2
      """
      do {
          _ = try filterOBJSource(
              conflictingNormals,
              hidingGroups: [],
              materialFilename: "orbital-source.mtl",
              label: "conflicting.obj",
              deduplicateOrientedFaces: true
          )
          preconditionFailure("normal deltas above 2.5e-7 must be rejected")
      } catch let error as RenderError {
          precondition(error.description.contains("conflicting normals"))
      }
    `;
    const harnessPath = path.join(temporaryRoot, 'main.swift');
    const executablePath = path.join(temporaryRoot, 'obj-filter-test');
    fs.writeFileSync(harnessPath, harness);
    const compile = spawnSync('swiftc', [
      rendererLibraryPath, harnessPath, '-o', executablePath,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the committed world inventory contains the twelve upright atlases and preserved road edge', () => {
  const actual = fs.readdirSync(path.join(root, 'assets/world'))
    .filter((name) => name.endsWith('.png'))
    .map((name) => `assets/world/${name}`)
    .sort();
  assert.deepEqual(actual, [...FINAL_WORLD_ATLAS_PATHS].sort());
});

test('the twelve upright atlases freeze exact 2240 by 960 outputs within v3 budgets', () => {
  const manifest = JSON.parse(read('tools/world-assets.json'));
  let totalBytes = 0;
  for (const relativePath of UPRIGHT_ATLAS_PATHS) {
    const bytes = assertPng(relativePath);
    totalBytes += bytes.length;
    assert.match(WORLD_OUTPUT_HASHES[relativePath], /^[a-f0-9]{64}$/,
      `${relativePath} requires a frozen final SHA-256`);
    assert.equal(sha256(relativePath), WORLD_OUTPUT_HASHES[relativePath],
      `${relativePath} must match its frozen final render`);
    assert.ok(bytes.length <= manifest.budgets.upright.maxFileBytes,
      `${relativePath} must stay within the upright file budget`);
    assert.deepEqual(sipsDimensions(relativePath), { width: 2240, height: 960 });
  }
  assert.ok(totalBytes <= manifest.budgets.upright.maxCombinedBytes);
  assert.equal(UPRIGHT_ATLAS_PATHS.length * 2240 * 960 * 4, 103219200);
  assert.ok(UPRIGHT_ATLAS_PATHS.length * 2240 * 960 * 4 <= manifest.budgets.upright.maxDecodedBytes);
});

test('generated metadata exactly describes every rendered alpha crop and world-origin anchor', () => {
  const alphaStats = new Map(pngAlphaStats(UPRIGHT_ATLAS_PATHS).map((stats) => [stats.path, stats]));
  for (const id of UPRIGHT_ATLAS_IDS) {
    const relativePath = `assets/world/${id}.png`;
    const decoded = decodePngRgba(relativePath);
    const metadata = WORLD_ATLAS_MANIFEST[UPRIGHT_RUNTIME_KEYS[id]];
    assert.equal(validateAtlasMetadata(metadata), true, id);
    assert.deepEqual(alphaStats.get(relativePath).borders, { top: 0, right: 0, bottom: 0, left: 0 }, id);
    assert.equal(alphaStats.get(relativePath).hiddenRgbPixels, 0, id);

    for (let frameIndex = 0; frameIndex < metadata.frames.length; frameIndex += 1) {
      const column = frameIndex % 7;
      const row = Math.floor(frameIndex / 7);
      const cellX = column * 320;
      const cellY = row * 320;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      let visiblePixels = 0;
      for (let y = cellY; y < cellY + 320; y += 1) for (let x = cellX; x < cellX + 320; x += 1) {
        const offset = (y * decoded.width + x) * 4;
        if (decoded.rgba[offset + 3] === 0) continue;
        visiblePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      assert.ok(visiblePixels > 0, `${id} frame ${frameIndex} must contain visible armor`);
      assert.deepEqual(metadata.frames[frameIndex].source, {
        sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1,
      }, `${id} frame ${frameIndex}`);
      assert.ok(minX > cellX && maxX < cellX + 319 && minY > cellY && maxY < cellY + 319,
        `${id} frame ${frameIndex} must retain a transparent own-cell border`);
      assert.ok(Number.isFinite(metadata.frames[frameIndex].origin.x));
      assert.ok(Number.isFinite(metadata.frames[frameIndex].origin.y));

      const depth = 1000;
      const yaw = metadata.yawDegrees[column] * Math.PI / 180;
      const pitch = metadata.pitchDegrees[row] * Math.PI / 180;
      const visualCenterY = (metadata.worldBounds.minY + metadata.worldBounds.maxY) / 2;
      const projectedOrigin = { x: 500, y: 300 };
      const plan = buildSpriteDrawPlan({
        metadata,
        worldX: Math.tan(yaw) * depth,
        zRel: depth,
        cameraY: visualCenterY + Math.tan(pitch) * depth,
        projectedOrigin,
        pixelsPerWorldUnitX: metadata.pixelsPerWorldUnit,
        pixelsPerWorldUnitY: metadata.pixelsPerWorldUnit,
      });
      assert.ok(plan.draws.length >= 1 && plan.draws.length <= 4, `${id} frame ${frameIndex}`);
      const draw = plan.draws.find(({ source }) => ['sx', 'sy', 'sw', 'sh']
        .every((key) => source[key] === metadata.frames[frameIndex].source[key]));
      assert.ok(draw && draw.weight > 0.999999999, `${id} frame ${frameIndex} exact sample weight`);
      assert.ok(Math.abs(draw.destination.x
        + metadata.frames[frameIndex].origin.x - draw.source.sx - projectedOrigin.x) < 1e-9);
      assert.ok(Math.abs(draw.destination.y
        + metadata.frames[frameIndex].origin.y - draw.source.sy - projectedOrigin.y) < 1e-9);
    }
  }
});

test('declared armor envelopes and pitch rows retain the approved perspective hierarchy', () => {
  for (const id of UPRIGHT_ATLAS_IDS) {
    const metadata = WORLD_ATLAS_MANIFEST[UPRIGHT_RUNTIME_KEYS[id]];
    const geometry = WORLD_GEOMETRY[metadata.category];
    const decoded = decodePngRgba(`assets/world/${id}.png`);
    const centerLowPitch = metadata.frames[3];
    const measuredArmorWidth = measureCenterArmorWidth(decoded, metadata);
    assert.ok(Math.abs(measuredArmorWidth - geometry.worldWidth) <= 2, id);
    assert.ok(centerLowPitch.source.sh > 0, `${id} must keep a nonzero projected Y envelope`);
    if (metadata.category !== 'drone') {
      const centerPitchHeights = [3, 10, 17].map((index) => metadata.frames[index].source.sh);
      assert.ok(centerPitchHeights[0] > centerPitchHeights[1]
        && centerPitchHeights[1] > centerPitchHeights[2],
      `${id} must shorten vertically as pitch exposes more of its top`);
    }
  }
  assert.equal(WORLD_GEOMETRY.drone.worldWidth, 432);
  for (const id of ['drone-scout', 'drone-striker']) {
    const measuredDroneWidth = measureCenterArmorWidth(
      decodePngRgba(`assets/world/${id}.png`),
      WORLD_ATLAS_MANIFEST[UPRIGHT_RUNTIME_KEYS[id]],
    );
    assert.ok(measuredDroneWidth > 380 && measuredDroneWidth < 648, id);
  }
});

test('rendered cyan bands and high-tier gold follow the recipe hierarchy', () => {
  const manifest = JSON.parse(read('tools/world-assets.json'));
  const goldOutput = [255, 255, 160, 255];
  const highIDs = new Set(['structure-reactor', 'structure-tower']);
  for (const id of UPRIGHT_ATLAS_IDS) {
    const { width, height, rgba } = decodePngRgba(`assets/world/${id}.png`);
    let goldPixels = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha] = rgba.subarray(offset, offset + 4);
      if (red === goldOutput[0] && green === goldOutput[1]
        && blue === goldOutput[2] && alpha === goldOutput[3]) goldPixels += 1;
    }
    assert.equal(goldPixels > 0, highIDs.has(id), `${id} gold-beacon evidence`);
  }
  const corridorLow = manifest.assets.find(({ id }) => id === 'corridor-low').generatedDetails;
  const corridorMedium = manifest.assets.find(({ id }) => id === 'corridor-medium').generatedDetails;
  assert.deepEqual(corridorLow, {
    runtimeContinuity: true, cyanBandY: [390],
  });
  assert.deepEqual(corridorMedium, {
    runtimeContinuity: true, cyanBandY: [460, 910],
  });
  for (const details of [corridorLow, corridorMedium]) {
    assert.equal(Object.keys(details).some((key) => /^(?:text|label|locale|font)$/i.test(key)), false);
  }

  for (const { id, runtimeKey, ratios } of [
    { id: 'barrier-rail', runtimeKey: 'barrierRail', ratios: [0.34] },
    { id: 'barrier-crate', runtimeKey: 'barrierCrate', ratios: [0.34] },
    { id: 'structure-pylon', runtimeKey: 'structurePylon', ratios: [0.34, 0.68] },
    { id: 'structure-bastion', runtimeKey: 'structureBastion', ratios: [0.34, 0.68] },
    { id: 'structure-reactor', runtimeKey: 'structureReactor', ratios: [0.34, 0.68] },
    { id: 'structure-tower', runtimeKey: 'structureTower', ratios: [0.34, 0.68] },
  ]) {
    const decoded = decodePngRgba(`assets/world/${id}.png`);
    const metadata = WORLD_ATLAS_MANIFEST[runtimeKey];
    const geometry = WORLD_GEOMETRY[metadata.category];
    const seamHeight = Math.max(6, Math.min(geometry.worldHeight * 0.018, 18));
    for (const ratio of ratios) {
      let count = 0;
      let maxHorizontalRun = 0;
        for (let frameIndex = 0; frameIndex < 21; frameIndex += 1) {
        const evidence = generatedCyanEvidence(decoded, projectedWorldBoxBounds(
          metadata,
          frameIndex,
          {
            x: 0,
            y: geometry.baseY + geometry.worldHeight * ratio,
            z: metadata.detailFrontZ + 4,
          },
          { x: geometry.worldWidth * 0.48, y: seamHeight, z: 8 },
        ));
        count += evidence.count;
        maxHorizontalRun = Math.max(maxHorizontalRun, evidence.maxHorizontalRun);
      }
      assert.ok(count >= 40, `${id} ${ratio} generated seam needs projected pixel evidence`);
      assert.ok(maxHorizontalRun >= 8,
        `${id} ${ratio} generated seam needs contiguous evidence, not incidental colormap cyan`);
    }
  }

  const corridorEvidence = new Map();
  for (const { id, referenceID, runtimeKey, details } of [
    { id: 'corridor-low', referenceID: 'barrier-rail', runtimeKey: 'corridorLow', details: corridorLow },
    { id: 'corridor-medium', referenceID: 'structure-pylon', runtimeKey: 'corridorMedium', details: corridorMedium },
  ]) {
    const candidate = decodePngRgba(`assets/world/${id}.png`);
    const reference = decodePngRgba(`assets/world/${referenceID}.png`);
    const metadata = WORLD_ATLAS_MANIFEST[runtimeKey];
    const geometry = WORLD_GEOMETRY[metadata.category];
    const bandEvidence = details.cyanBandY.map((bandY) => {
      let count = 0;
      for (let frameIndex = 0; frameIndex < 21; frameIndex += 1) {
        count += countGeneratedCyanDifference(candidate, reference, projectedWorldBoxBounds(
          metadata,
          frameIndex,
          { x: 0, y: bandY, z: metadata.detailFrontZ + 3 },
          { x: geometry.worldWidth * 0.72, y: 12, z: 6 },
        ));
      }
      assert.ok(count >= 100, `${id} generated band Y=${bandY} needs projected raster evidence`);
      return count;
    });
    corridorEvidence.set(id, bandEvidence);

  }
  assert.equal(corridorEvidence.get('corridor-low').length, 1);
  assert.equal(corridorEvidence.get('corridor-medium').length, 2);
  const renderer = read('tools/render-world-assets.swift').toString('utf8');
  assert.match(renderer, /let gold = flatMaterial\(srgb\(0xff, 0xd6, 0x6b\)/);
});

test('gap-edge remains the byte-identical legacy 3584 by 512 road-edge atlas', () => {
  const relativePath = 'assets/world/gap-edge.png';
  assertPng(relativePath);
  assert.deepEqual(sipsDimensions(relativePath), { width: 3584, height: 512 });
  assert.equal(sha256(relativePath), 'c3a0962aee773cfa9ac129dba9b49764d297491307836472b1743fead4ebba49');
});

test('world-art provenance pins official free archives, CC0 licenses, and reproduction command', () => {
  const provenance = read('docs/assets/world-art.md').toString('utf8');
  const notices = read('THIRD_PARTY_NOTICES.md').toString('utf8');
  for (const value of [
    'https://kenney.nl/assets/space-kit',
    'https://kenney.nl/assets/modular-space-kit',
    'kenney_space-kit.zip',
    'kenney_modular-space-kit_1.0.zip',
    'd5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9',
    'f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc',
    'CC0',
    '[-80, -55, -30, 0, 30, 55, 80]',
    '[20, 55, 80]',
    '--metadata-js "$WORLD_WORK_DIR/world-art-a.js"',
  ]) assert.match(provenance, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const document of [provenance, notices]) {
    assert.ok(document.includes(FINAL_RENDERER_SHA256), 'the final renderer hash must be frozen');
    for (const [sourcePath, expectedHash] of Object.entries(WORLD_SOURCE_HASHES)) {
      assert.ok(document.includes(sourcePath) && document.includes(expectedHash), `${sourcePath} provenance must be frozen`);
    }
    for (const [relativePath, expectedHash] of Object.entries(WORLD_OUTPUT_HASHES)) {
      assert.ok(document.includes(relativePath) && document.includes(expectedHash), `${relativePath} output hash must be frozen`);
    }
  }
  const runtime = read('src/world-art.js').toString('utf8');
  assert.match(runtime, /GENERATED_UPRIGHT_ATLAS_DATA/);
  assert.doesNotMatch(runtime, /(?:\/var\/tmp\/|\/private\/var\/|runtime JSON|fetch\s*\()/i);
});

test('Nebula Cruise committed codecs match the documented 144 BPM render contract', () => {
  const outputs = [
    ['assets/audio/nebula-cruise-atmosphere.ogg', 'c08808afe852ad2fc6d0c33d04ca1898711895e2b83bbd7ce77350570db24eaf'],
    ['assets/audio/nebula-cruise-drive.ogg', '89d2e0258a6497267743da1416f1ca4d6a7f6aabb1bd28a7edda44b5ccdadf0e'],
    ['assets/audio/nebula-cruise-overdrive.ogg', '584fb8c0e08187a90339df843be73f2a421247c5f3c920e2d49cc61142d191d6'],
    ['assets/audio/nebula-cruise-atmosphere.mp3', '664986af51147374ed093a626eb63328be8f94fbf99ee7228e43605546b0de1f'],
    ['assets/audio/nebula-cruise-drive.mp3', 'a462b0541cd4860d443e32e2755d8dbfa8c383c556ee267ad746c75ae5445655'],
    ['assets/audio/nebula-cruise-overdrive.mp3', 'b88afe29bc54a5d017341de32d2c023a02ed9d7b2576f87ab59ad67e54484e1d'],
  ];
  for (const [relativePath, expectedHash] of outputs) {
    assert.equal(sha256(relativePath), expectedHash, `${relativePath} must match the deterministic codec output`);
  }

  for (const extension of ['ogg', 'mp3']) {
    const durations = outputs
      .filter(([relativePath]) => relativePath.endsWith(`.${extension}`))
      .map(([relativePath]) => audioDuration(relativePath));
    assert.ok(Math.max(...durations) - Math.min(...durations) <= 0.001, `${extension} siblings must agree within 1 ms`);
  }

  const document = read('docs/assets/audio-generation.md').toString('utf8');
  for (const expected of [
    '144 BPM',
    '2646000',
    '@ffmpeg-installer/darwin-arm64@4.1.5',
    'two-loop audition procedure',
    ...outputs.map(([, hash]) => hash),
  ]) assert.match(document, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});

test('runtime HTML, CSS and JavaScript contain no remote URL dependency', () => {
  const runtimeFiles = [
    'index.html',
    ...fs.readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.js')).map((name) => `src/${name}`),
    ...fs.readdirSync(path.join(root, 'styles')).filter((name) => name.endsWith('.css')).map((name) => `styles/${name}`),
  ];
  for (const relativePath of runtimeFiles) {
    const source = read(relativePath).toString('utf8');
    assert.doesNotMatch(source, /(?:src|href)\s*=\s*["']https?:\/\//i, `${relativePath} must not load a remote URL`);
    assert.doesNotMatch(source, /url\(\s*["']?https?:\/\//i, `${relativePath} must not load a remote URL`);
  }
});

test('visual preloading reports every local asset and requires both player frames', async () => {
  const queuedPaths = [];
  class ImageSuccess {
    set src(value) {
      this.currentSrc = value;
      queuedPaths.push(value);
      applyWorldImageDimensions(this, value);
      queueMicrotask(() => this.onload());
    }
  }
  class FontFaceSuccess {
    constructor(family, source) {
      this.family = family;
      this.source = source;
    }
    async load() { return this; }
  }
  const addedFonts = [];
  const result = await preloadVisualAssets({
    timeoutMs: 100,
    ImageCtor: ImageSuccess,
    FontFaceCtor: FontFaceSuccess,
    fontSet: { add(font) { addedFonts.push(font); } },
  });

  assert.equal(result.shipFramesReady, true);
  assert.equal(result.fallbackRequired, false);
  assert.equal(result.timedOut, false);
  assert.equal(result.loadedCount, 24);
  assert.equal(result.failedCount, 0);
  assert.equal(result.assets.ship.neutral.loaded, true);
  assert.equal(result.assets.ship.thrust.loaded, true);
  assert.equal(Object.keys(result.assets.ui).length, 2);
  assert.equal(Object.keys(result.assets.icons).length, 6);
  assert.deepEqual(queuedPaths.slice(-13), [
    './assets/world/drone-scout.png',
    './assets/world/drone-striker.png',
    './assets/world/turret-sentry.png',
    './assets/world/turret-heavy.png',
    './assets/world/barrier-rail.png',
    './assets/world/barrier-crate.png',
    './assets/world/structure-pylon.png',
    './assets/world/structure-bastion.png',
    './assets/world/structure-reactor.png',
    './assets/world/structure-tower.png',
    './assets/world/corridor-low.png',
    './assets/world/corridor-medium.png',
    './assets/world/gap-edge.png',
  ]);
  assert.deepEqual(result.world.loaded, [
    'droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail',
    'barrierCrate', 'structurePylon', 'structureBastion', 'structureReactor',
    'structureTower', 'corridorLow', 'corridorMedium', 'gapEdge',
  ]);
  assert.deepEqual(result.world.fallback, []);
  assert.deepEqual(result.world.categoryReady, {
    drone: true, turret: true, wallLow: true, wallMedium: true, wallHigh: true,
    corridorLow: true, corridorMedium: true, gap: true,
  });
  assert.equal(Object.isFrozen(result.assets.world), true);
  assert.equal(Object.isFrozen(result.world), true);
  assert.equal(Object.isFrozen(result.world.loaded), true);
  assert.equal(Object.isFrozen(result.world.fallback), true);
  assert.equal(Object.isFrozen(result.world.categoryReady), true);
  assert.equal(result.assets.font.orbitron.loaded, true);
  assert.equal(addedFonts.length, 1);
});

test('world atlas fallback leaves independent variants and categories available', async () => {
  class ImageWithMissingDroneScout {
    set src(value) {
      this.currentSrc = value;
      applyWorldImageDimensions(this, value);
      queueMicrotask(() => value.includes('drone-scout') ? this.onerror() : this.onload());
    }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 100,
    ImageCtor: ImageWithMissingDroneScout,
    FontFaceCtor: null,
    fontSet: null,
  });

  assert.equal(result.fallbackRequired, false, 'world art must not change player-ship fallback');
  assert.equal(result.assets.world.droneScout.loaded, false);
  assert.equal(result.assets.world.droneStriker.loaded, true);
  assert.deepEqual(result.world.fallback, ['droneScout']);
  assert.deepEqual(result.world.categoryReady, {
    drone: true, turret: true, wallLow: true, wallMedium: true, wallHigh: true,
    corridorLow: true, corridorMedium: true, gap: true,
  });
});

test('world atlas diagnostics mark only a fully unavailable category as not ready', async () => {
  class ImageWithMissingLowWalls {
    set src(value) {
      this.currentSrc = value;
      applyWorldImageDimensions(this, value);
      queueMicrotask(() => value.includes('barrier-') ? this.onerror() : this.onload());
    }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 100,
    ImageCtor: ImageWithMissingLowWalls,
    FontFaceCtor: null,
    fontSet: null,
  });

  assert.deepEqual(result.world.fallback, ['barrierRail', 'barrierCrate']);
  assert.deepEqual(result.world.categoryReady, {
    drone: true, turret: true, wallLow: false, wallMedium: true, wallHigh: true,
    corridorLow: true, corridorMedium: true, gap: true,
  });
});

test('all world atlas failures do not require the procedural player fallback', async () => {
  class ImageWithMissingWorldArt {
    set src(value) {
      this.currentSrc = value;
      applyWorldImageDimensions(this, value);
      queueMicrotask(() => value.includes('/world/') ? this.onerror() : this.onload());
    }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 100,
    ImageCtor: ImageWithMissingWorldArt,
    FontFaceCtor: null,
    fontSet: null,
  });

  assert.equal(result.shipFramesReady, true);
  assert.equal(result.fallbackRequired, false);
  assert.equal(result.world.loaded.length, 0);
  assert.deepEqual(result.world.fallback, [
    'droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail',
    'barrierCrate', 'structurePylon', 'structureBastion', 'structureReactor',
    'structureTower', 'corridorLow', 'corridorMedium', 'gapEdge',
  ]);
  assert.deepEqual(result.world.categoryReady, {
    drone: false, turret: false, wallLow: false, wallMedium: false, wallHigh: false,
    corridorLow: false, corridorMedium: false, gap: false,
  });
});

test('one missing required ship frame triggers procedural fallback without hiding optional success', async () => {
  class ImageWithMissingThrust {
    set src(value) {
      this.currentSrc = value;
      applyWorldImageDimensions(this, value);
      queueMicrotask(() => value.includes('player-thrust') ? this.onerror() : this.onload());
    }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 100,
    ImageCtor: ImageWithMissingThrust,
    FontFaceCtor: null,
    fontSet: null,
  });

  assert.equal(result.shipFramesReady, false);
  assert.equal(result.fallbackRequired, true);
  assert.equal(result.assets.ship.neutral.loaded, true);
  assert.equal(result.assets.ship.thrust.loaded, false);
  assert.equal(result.assets.ui.panel.loaded, true);
  assert.equal(result.failedCount, 2);
});

test('visual preloading returns deterministic failure diagnostics on timeout', async () => {
  class HangingImage {
    set src(value) { this.currentSrc = value; }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 5,
    ImageCtor: HangingImage,
    FontFaceCtor: null,
    fontSet: null,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.shipFramesReady, false);
  assert.equal(result.fallbackRequired, true);
  assert.equal(result.loadedCount, 0);
  assert.equal(result.failedCount, 24);
});

test('timeout seals image handlers so late completion cannot mutate terminal diagnostics', async () => {
  const images = [];
  class LateImage {
    constructor() { images.push(this); }
    set src(value) { this.currentSrc = value; }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 5,
    ImageCtor: LateImage,
    FontFaceCtor: null,
    fontSet: null,
  });
  const frozenSnapshot = JSON.stringify(result, (key, value) => key === 'element' ? undefined : value);

  assert.equal(result.timedOut, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.assets.ship.neutral), true);
  for (const image of images) {
    assert.equal(image.onload, null, `${image.currentSrc} must detach its late success handler`);
    assert.equal(image.onerror, null, `${image.currentSrc} must detach its late failure handler`);
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(JSON.stringify(result, (key, value) => key === 'element' ? undefined : value), frozenSnapshot);
  assert.equal(result.loadedCount, 0);
  assert.equal(result.failedCount, 24);
});

test('visual preloading survives an Image constructor security failure', async () => {
  class ThrowingImage {
    constructor() { throw new Error('blocked by browser policy'); }
  }
  const result = await preloadVisualAssets({
    timeoutMs: 10,
    ImageCtor: ThrowingImage,
    FontFaceCtor: null,
    fontSet: null,
  });
  assert.equal(result.timedOut, false);
  assert.equal(result.shipFramesReady, false);
  assert.equal(result.fallbackRequired, true);
  assert.equal(result.loadedCount, 0);
  assert.equal(result.failedCount, 24);
});

test('player frame selection uses thrust only when both frames are ready', () => {
  const neutral = { id: 'neutral' };
  const thrust = { id: 'thrust' };
  const ready = {
    shipFramesReady: true,
    assets: { ship: { neutral: { loaded: true, element: neutral }, thrust: { loaded: true, element: thrust } } },
  };
  assert.equal(resolvePlayerShipFrame(ready, false), neutral);
  assert.equal(resolvePlayerShipFrame(ready, true), thrust);

  const partial = {
    shipFramesReady: false,
    assets: { ship: { neutral: { loaded: true, element: neutral }, thrust: { loaded: false, element: null } } },
  };
  assert.equal(resolvePlayerShipFrame(partial, false), null);
  assert.equal(resolvePlayerShipFrame(partial, true), null);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { preloadVisualAssets, resolvePlayerShipFrame } = require('../src/presentation.js');

const root = path.resolve(__dirname, '..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WORLD_ATLAS_IDS = [
  'drone-scout',
  'drone-striker',
  'turret-sentry',
  'turret-heavy',
  'barrier-rail',
  'barrier-crate',
  'structure-reactor',
  'structure-tower',
  'gap-edge',
];
const WORLD_ATLAS_PATHS = WORLD_ATLAS_IDS.map((id) => `assets/world/${id}.png`);
const WORLD_RENDERER_SHA256 = 'd6a84146e16e584d6e664dc548fa1117162d7f7e75d899488a364edc4d0a4d98';
const WORLD_OUTPUT_HASHES = {
  'assets/world/drone-scout.png': 'e67825e80a45e4accbe1d8d575d2d567cf0bdf75bdda637baa0bb2aeb40dca6c',
  'assets/world/drone-striker.png': '05ba45525809874f36560372a87e3fa5b01091323c2ac31f18d5ae5c5f192fbb',
  'assets/world/turret-sentry.png': 'd1cc90386ef83adefe23373dd8ea2ea6bd63c161e6fd57af3f5922dd4102276e',
  'assets/world/turret-heavy.png': '89f51d2f4cd8e6a976ca9bfc082d7eb2808074c237ccb34aa964a4407b18a5b9',
  'assets/world/barrier-rail.png': '33bb2c69b61943b81d6c2f04d5a0ce1b3bab5890fbe2d5d8e7cb0c371aefb36c',
  'assets/world/barrier-crate.png': '33b44384aae4c7cb6ea7d3f468fddf41f7918bf04b26ced88ef7e5561faf386d',
  'assets/world/structure-reactor.png': '267f169abd1040c6a90e6c1e74b1f21b4f697294e8c65740125518fccef6730d',
  'assets/world/structure-tower.png': '360a2fbae947d891c4b2ee9b50d141ad12186dfd894630036e9f4d953a360b3d',
  'assets/world/gap-edge.png': '00b05e81a7ec92b9b0fddf3a6e0af058d3f598a9feb5232adc0b8646d2f1687d',
};
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

function pngAlphaStats(relativePaths) {
  const source = `
    import AppKit
    import Foundation
    for path in CommandLine.arguments.dropFirst() {
      guard let image = NSImage(contentsOfFile: path),
            let data = image.tiffRepresentation,
            let bitmap = NSBitmapImageRep(data: data) else { exit(2) }
      var borders = ["top": 0, "right": 0, "bottom": 0, "left": 0]
      var frameLeftBorders = [Int](repeating: 0, count: 7)
      var frameRightBorders = [Int](repeating: 0, count: 7)
      var frameBounds = (0..<7).map { _ in [
        "minX": Int.max,
        "maxX": Int.min,
        "minY": Int.max,
        "maxY": Int.min,
      ] }
      var transparentPixels = 0
      var hiddenRgbPixels = 0
      for y in 0..<bitmap.pixelsHigh {
        for x in 0..<bitmap.pixelsWide {
          guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { exit(3) }
          if color.alphaComponent == 0 {
            transparentPixels += 1
            if color.redComponent != 0 || color.greenComponent != 0 || color.blueComponent != 0 {
              hiddenRgbPixels += 1
            }
          }
          if color.alphaComponent > 0 {
            if y == 0 { borders["top"]! += 1 }
            if x == bitmap.pixelsWide - 1 { borders["right"]! += 1 }
            if y == bitmap.pixelsHigh - 1 { borders["bottom"]! += 1 }
            if x == 0 { borders["left"]! += 1 }
            if x % 512 == 0 { frameLeftBorders[x / 512] += 1 }
            if x % 512 == 511 { frameRightBorders[x / 512] += 1 }
          }
          if color.alphaComponent >= (16.0 / 255.0) {
            let frameIndex = x / 512
            let frameX = x % 512
            frameBounds[frameIndex]["minX"] = min(frameBounds[frameIndex]["minX"]!, frameX)
            frameBounds[frameIndex]["maxX"] = max(frameBounds[frameIndex]["maxX"]!, frameX)
            frameBounds[frameIndex]["minY"] = min(frameBounds[frameIndex]["minY"]!, y)
            frameBounds[frameIndex]["maxY"] = max(frameBounds[frameIndex]["maxY"]!, y)
          }
        }
      }
      let frameBorders = (0..<7).map { [
        "left": frameLeftBorders[$0],
        "right": frameRightBorders[$0],
      ] }
      let opaqueBounds = frameBounds.map { bounds -> [String: Int] in
        let minX = bounds["minX"]!
        let maxX = bounds["maxX"]!
        let minY = bounds["minY"]!
        let maxY = bounds["maxY"]!
        return [
          "minX": minX,
          "maxX": maxX,
          "minY": minY,
          "maxY": maxY,
          "opaqueWidth": maxX >= minX ? maxX - minX + 1 : 0,
          "opaqueHeight": maxY >= minY ? maxY - minY + 1 : 0,
        ]
      }
      let result: [String: Any] = [
        "path": path,
        "width": bitmap.pixelsWide,
        "height": bitmap.pixelsHigh,
        "borders": borders,
        "frameBorders": frameBorders,
        "opaqueBounds": opaqueBounds,
        "transparentPixels": transparentPixels,
        "hiddenRgbPixels": hiddenRgbPixels,
      ]
      let encoded = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
      print(String(data: encoded, encoding: .utf8)!)
    }
  `;
  const absolutePaths = relativePaths.map((relativePath) => path.join(root, relativePath));
  return execFileSync('swift', ['-e', source, ...absolutePaths], { encoding: 'utf8' })
    .trim().split('\n').map((line) => JSON.parse(line));
}

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

test('the world manifest freezes the audited free OBJ recipes and seven-view geometry', () => {
  const manifest = JSON.parse(read('tools/world-assets.json'));
  assert.equal(manifest.version, 2);
  assert.deepEqual(manifest.frame, {
    width: 512,
    height: 512,
    yawDegrees: [-30, -20, -10, 0, 10, 20, 30],
  });
  assert.deepEqual(manifest.geometry, {
    drone: { worldWidth: 380, worldHeight: 360, baseY: 140 },
    turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0 },
    wallLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
    wallHigh: { worldWidth: 648, worldHeight: 2000, baseY: 0 },
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
    licenseCommitted, licenseSha256,
  }) => ({
    id, sourcePage, archiveFilename, archiveSha256, downloadDate, license,
    licenseCommitted, licenseSha256,
  })), [
    {
      id: 'kenney-space-kit',
      sourcePage: 'https://kenney.nl/assets/space-kit',
      archiveFilename: 'kenney_space-kit.zip',
      archiveSha256: 'd5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9',
      downloadDate: '2026-08-03',
      license: 'Creative Commons CC0 1.0 Universal',
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
    ['drone-scout', 'kenney-space-kit', 'drone', [
      component('space-kit/Models/OBJ format/craft_speederA.obj', []),
    ], []],
    ['drone-striker', 'kenney-space-kit', 'drone', [
      component('space-kit/Models/OBJ format/craft_speederD.obj', []),
    ], []],
    ['turret-sentry', 'kenney-space-kit', 'turret', [
      component('space-kit/Models/OBJ format/turret_single.obj', []),
    ], ['turret']],
    ['turret-heavy', 'kenney-space-kit', 'turret', [
      component('space-kit/Models/OBJ format/turret_double.obj', []),
    ], ['turret']],
    ['barrier-rail', 'kenney-space-kit', 'wallLow', [
      component('space-kit/Models/OBJ format/barrels_rail.obj', [], {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [-0.44, 0, 0],
      }),
      component('space-kit/Models/OBJ format/barrels_rail.obj', [], {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0.44, 0, 0],
      }),
    ], []],
    ['barrier-crate', 'kenney-modular-space-kit', 'wallLow', [
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [-0.85, 0, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      component('modular-space-kit/Models/OBJ format/gate-lasers.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0.85, 0, 0],
      }),
    ], []],
    ['structure-reactor', 'kenney-space-kit', 'wallHigh', [
      ...[-0.48, 0.48].flatMap((x) => [
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
    ], []],
    ['structure-tower', 'kenney-modular-space-kit', 'wallHigh', [
      component('modular-space-kit/Models/OBJ format/room-large.obj', modularTexture, {
        scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0, 0, 0],
      }),
      ...[0.60, 1.20, 1.80, 2.40, 3.00].map((y) => component(
        'modular-space-kit/Models/OBJ format/room-large.obj', modularTexture,
        { scale: 0.72, rotationDegrees: [0, 0, 0], translation: [0, y, 0] },
      )),
    ], []],
    ['gap-edge', 'kenney-space-kit', 'gap', [
      component('space-kit/Models/OBJ format/terrain_sideCliff.obj', [], {
        scale: 0.78, rotationDegrees: [0, 0, 0], translation: [-0.42, 0, 0],
      }),
      component('space-kit/Models/OBJ format/terrain_sideCliff.obj', [], {
        scale: 0.78, rotationDegrees: [0, 0, 0], translation: [0.42, 0, 0],
      }),
    ], []],
  ];
  assert.deepEqual(manifest.assets.map(({ id, sourceFamily, category, components, hideNodes }) => [
    id, sourceFamily, category, components, hideNodes,
  ]), expected);
  assert.deepEqual(manifest.assets.map(({ id }) => id), WORLD_ATLAS_IDS);

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

test('the world renderer CLI rejects forbidden paths in every manifest path field', () => {
  const renderer = path.join(root, 'tools/render-world-assets.swift');
  const usage = spawnSync('swift', [renderer], { cwd: root, encoding: 'utf8' });
  assert.notEqual(usage.status, 0);
  assert.match(usage.stderr, /Usage: render-world-assets\.swift --manifest WORLD_ASSETS\.json --source-root EXTRACTED --output OUTPUT/);

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
      const manifestPath = path.join(temporaryRoot, 'manifest.json');
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      const result = spawnSync('swift', [renderer,
        '--manifest', manifestPath,
        '--source-root', path.join(temporaryRoot, 'source'),
        '--output', path.join(temporaryRoot, 'output'),
      ], { cwd: root, encoding: 'utf8' });
      assert.notEqual(result.status, 0, `${field}=${invalidPath} must be rejected`);
      assert.match(result.stderr, expectedMessage, `${field}=${invalidPath}`);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
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

test('the nine committed world atlases are bounded transparent 3584 by 512 PNGs', () => {
  let totalBytes = 0;
  for (const relativePath of WORLD_ATLAS_PATHS) {
    const bytes = assertPng(relativePath);
    totalBytes += bytes.length;
    assert.equal(sha256(relativePath), WORLD_OUTPUT_HASHES[relativePath], `${relativePath} must match its frozen render`);
    assert.ok(bytes.length <= 2 * 1024 * 1024, `${relativePath} must not exceed 2 MiB`);
    assert.deepEqual(sipsDimensions(relativePath), { width: 3584, height: 512 });
  }
  assert.ok(totalBytes <= 18 * 1024 * 1024, 'world atlases must not exceed 18 MiB in total');
  const minimumOpaqueExtent = {
    drone: { width: 280, height: 140 },
    turret: { width: 260, height: 240 },
    wallLow: { width: 392, height: 140 },
    wallHigh: { width: 240, height: 360 },
    gap: { width: 330, height: 120 },
  };
  const categories = ['drone', 'drone', 'turret', 'turret', 'wallLow', 'wallLow', 'wallHigh', 'wallHigh', 'gap'];
  for (const [atlasIndex, stats] of pngAlphaStats(WORLD_ATLAS_PATHS).entries()) {
    assert.deepEqual(stats.borders, { bottom: 0, left: 0, right: 0, top: 0 }, stats.path);
    assert.deepEqual(stats.frameBorders, Array.from({ length: 7 }, () => ({ left: 0, right: 0 })), stats.path);
    assert.ok(stats.transparentPixels > 0, `${stats.path} must retain transparent padding`);
    assert.equal(stats.hiddenRgbPixels, 0, `${stats.path} must clear RGB under zero alpha`);
    const minimum = minimumOpaqueExtent[categories[atlasIndex]];
    for (const [frameIndex, bounds] of stats.opaqueBounds.entries()) {
      assert.ok(bounds.minX >= 12, `${stats.path} frame ${frameIndex} must keep 12 transparent pixels on the left`);
      assert.ok(bounds.maxX <= 499, `${stats.path} frame ${frameIndex} must keep 12 transparent pixels on the right`);
      assert.ok(bounds.minY >= 12, `${stats.path} frame ${frameIndex} must keep 12 transparent pixels on top`);
      assert.ok(bounds.maxY >= 440 && bounds.maxY <= 488, `${stats.path} frame ${frameIndex} must keep its bottom anchor`);
      assert.ok(bounds.opaqueWidth >= minimum.width, `${stats.path} frame ${frameIndex} must fill the canonical width`);
      assert.ok(bounds.opaqueHeight >= minimum.height, `${stats.path} frame ${frameIndex} must fill the canonical height`);
    }
  }
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
    '[-30, -20, -10, 0, 10, 20, 30]',
    'swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-a"',
  ]) assert.match(provenance, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(sha256('tools/render-world-assets.swift'), WORLD_RENDERER_SHA256);
  for (const document of [provenance, notices]) {
    assert.ok(document.includes(WORLD_RENDERER_SHA256), 'world renderer hash must be frozen');
    for (const [sourcePath, expectedHash] of Object.entries(WORLD_SOURCE_HASHES)) {
      assert.ok(document.includes(sourcePath) && document.includes(expectedHash), `${sourcePath} provenance must be frozen`);
    }
    for (const [relativePath, expectedHash] of Object.entries(WORLD_OUTPUT_HASHES)) {
      assert.ok(document.includes(relativePath) && document.includes(expectedHash), `${relativePath} output hash must be frozen`);
    }
  }
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
  assert.equal(result.loadedCount, 20);
  assert.equal(result.failedCount, 0);
  assert.equal(result.assets.ship.neutral.loaded, true);
  assert.equal(result.assets.ship.thrust.loaded, true);
  assert.equal(Object.keys(result.assets.ui).length, 2);
  assert.equal(Object.keys(result.assets.icons).length, 6);
  assert.deepEqual(queuedPaths.slice(-9), [
    './assets/world/drone-scout.png',
    './assets/world/drone-striker.png',
    './assets/world/turret-sentry.png',
    './assets/world/turret-heavy.png',
    './assets/world/barrier-rail.png',
    './assets/world/barrier-crate.png',
    './assets/world/structure-reactor.png',
    './assets/world/structure-tower.png',
    './assets/world/gap-edge.png',
  ]);
  assert.deepEqual(result.world.loaded, [
    'droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail',
    'barrierCrate', 'structureReactor', 'structureTower', 'gapEdge',
  ]);
  assert.deepEqual(result.world.fallback, []);
  assert.deepEqual(result.world.categoryReady, {
    drone: true, turret: true, wallLow: true, wallHigh: true, gap: true,
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
    drone: true, turret: true, wallLow: true, wallHigh: true, gap: true,
  });
});

test('world atlas diagnostics mark only a fully unavailable category as not ready', async () => {
  class ImageWithMissingLowWalls {
    set src(value) {
      this.currentSrc = value;
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
    drone: true, turret: true, wallLow: false, wallHigh: true, gap: true,
  });
});

test('all world atlas failures do not require the procedural player fallback', async () => {
  class ImageWithMissingWorldArt {
    set src(value) {
      this.currentSrc = value;
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
    'barrierCrate', 'structureReactor', 'structureTower', 'gapEdge',
  ]);
  assert.deepEqual(result.world.categoryReady, {
    drone: false, turret: false, wallLow: false, wallHigh: false, gap: false,
  });
});

test('one missing required ship frame triggers procedural fallback without hiding optional success', async () => {
  class ImageWithMissingThrust {
    set src(value) {
      this.currentSrc = value;
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
  assert.equal(result.failedCount, 20);
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
  assert.equal(result.failedCount, 20);
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
  assert.equal(result.failedCount, 20);
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

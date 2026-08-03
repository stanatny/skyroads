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
const WORLD_RENDERER_SHA256 = '9096815858ca5450baaef09d08a2bf5d4eba37d648d28209bee05521e1045259';
const WORLD_OUTPUT_HASHES = {
  'assets/world/drone-scout.png': '069bb170fb605de78c924ab8983c09e1eddd2899a20ea794fa6c0ebc9b0e3bc1',
  'assets/world/drone-striker.png': 'a4f775132ad64e15ac472f4939e3b818c46fcee0757e6a32174131c5ee13a872',
  'assets/world/turret-sentry.png': '5642f2a677179923fac523bdc63b1c41430799d6e79e4b9c2a444d62a6b09ba2',
  'assets/world/turret-heavy.png': '63912cd7406faee52cb27a0dd96e8f6f0c12341695f4d04f470b9a28674d134f',
  'assets/world/barrier-rail.png': 'ec28a7233c5c1e17e6c2307491397ce1e022b857e9dac640bab18d33e16b65fc',
  'assets/world/barrier-crate.png': '00948d25ba1d9eebbc9bd43e3112c0cbd8ea52a2c0f15df2e45363700f11b54f',
  'assets/world/structure-reactor.png': '1495fffeb812f561d23be5c89fc603de3598c2990df9a04c1013e547673762cd',
  'assets/world/structure-tower.png': '44dd46fddc6a04a220550cc9c9a699eae501e758bdf8d7cdc727f6eb2c50e25c',
  'assets/world/gap-edge.png': '72d469cdac888c4dbde50f3a45823dc8cc0367a722ae92ee8ceced0a89ed5900',
};
const WORLD_SOURCE_HASHES = {
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/containers_B.mtl': 'bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/containers_B.obj': '2768e85d33c3253e658c7a1a14a9144c2ccc861a44aaaf1845f034f1c0e7f2fd',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/drill_structure.mtl': 'bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/drill_structure.obj': 'e8181916c9b8f0b08948e12c8b7a39a2d3a7b82f0d83498b988c08a9515e2a4b',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/spacebits_texture.png': 'f19fe5ced42f72104a3c2e9f15d591622723695dd461a380691a8a21ebb01ae9',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/structure_tall.mtl': 'bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/structure_tall.obj': '99811112971149909c38bfb286d38484e06678228e6476db797b75b94009e24c',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/terrain_low.mtl': 'bc5ba933f194e86177da5560ac535dbe82485e029f32d92566bc3260cd091a14',
  'kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/terrain_low.obj': '10e1d8fe49028038bba3def7ea20e771efa7d57988592c7cdbc88d565a324f5e',
  'quaternius/OBJ/Enemy_EyeDrone.mtl': 'b14e181d95f4c2ff09b03f15afeee1c7989fde2638ec862f2eabd93138a90b2a',
  'quaternius/OBJ/Enemy_EyeDrone.obj': 'c0c0e9c7b0347dcbc22c862e43e67106f7032c081fabf62db1c328fa2eb28d87',
  'quaternius/OBJ/Enemy_QuadShell.mtl': '6a3da0a19d0c3443af158c84c7713d476cbc6cbe3d49f2cd9085a62ed52c19d1',
  'quaternius/OBJ/Enemy_QuadShell.obj': 'bf8650079aac176f2924d122932ee206345e4bb3b69ef7a2eccce3f08209cc3b',
  'quaternius/OBJ/Prop_Barrel2_Closed.mtl': 'f60be363e5a207e294084b9883a3697d0ee5f4a1546faab339a47e060f2e1d48',
  'quaternius/OBJ/Prop_Barrel2_Closed.obj': 'e9e205c2f7edd3436258056973f1139ee6ee75fe438ef199b79f924650aa8bd3',
  'quaternius/OBJ/Prop_Crate_Large.mtl': 'fa13718900aaaa8d22dcbb1fa5dd140321c14a23646513885c729aeff6a441c1',
  'quaternius/OBJ/Prop_Crate_Large.obj': '7ecccb65d1c328c05d10803b0c78c92ebf2ab20fd5b7b85c2aeced76bccec255',
  'quaternius/OBJ/Prop_Crate_Tarp_Large.mtl': 'fa13718900aaaa8d22dcbb1fa5dd140321c14a23646513885c729aeff6a441c1',
  'quaternius/OBJ/Prop_Crate_Tarp_Large.obj': '2cd1a32679df2c608562c9afbd7f40794bd18a4f534af4c71bd57a66b7f2e2a1',
  'quaternius/OBJ/Prop_Mine.mtl': '6130165535beb5ac72a8620fdac603b89ed702bb239135a5466bbd26d5071147',
  'quaternius/OBJ/Prop_Mine.obj': 'c24bef15e2ba615c2533e264bf135175eab19f9044c1430a5283460d91d377c4',
  'quaternius/OBJ/Prop_SatelliteDish.mtl': 'fd12fb0d4d7f74ccb49c457226a97fc86b60927585cda02888e9d837e70e3074',
  'quaternius/OBJ/Prop_SatelliteDish.obj': 'ae50567124bcca21882cc67fb36df2b4cfbc0f4d6c7772462233cfa9c638bdd7',
  'quaternius/Textures/T_Enemies_BaseColor.png': '65ab96c4ed89e64d84ed453fd67dfd37027860d81b93fb2a5d5bb2e9e0e35df8',
  'quaternius/Textures/T_Enemies_Emissive.png': 'da6ebc7bb22dc15a39a127bcf4ebdf27047274f0f1fb26ca31bb7fc93a46ed0c',
  'quaternius/Textures/T_Enemies_Normal.png': '3e1f78e93b93df32828ee9a9389665e9ccbe330065a36f365267bd9e094d2187',
  'quaternius/Textures/T_Enemies_ORM.png': 'c9b85f821df22954ca63cbeb09bc392bba4e12a3776c413886ea86b8457fd08d',
  'quaternius/Textures/T_Props_Batch1_BaseColor.png': 'c0ea20e93b451f65a22a11bbfbc3542e2408f9d5c3f2ac3fd12304f1308106e9',
  'quaternius/Textures/T_Props_Batch1_Normal.png': '3a0d462366e5d03ef13fb35efc97c38c2463c118a89e303d356bac54d941d4ee',
  'quaternius/Textures/T_Props_Batch1_ORM.png': '021629ac29f3761db317303a862c731502cd3a1a207291011adac241f9f48fa0',
  'quaternius/Textures/T_Props_Batch2_BaseColor.png': '8977c1d6ada0ce151552caaf44be0b533827627f0172e6c1912175ab314260cd',
  'quaternius/Textures/T_Props_Batch2_Emissive.png': 'e9ebf8ddd7e4d6c156e084b4d6f00d0a8090f40f0e6e188385980cf1e8a95aa0',
  'quaternius/Textures/T_Props_Batch2_Normal.png': '5dc16d40e5e92c956f0fdbeea346d2b6792f9f25b13addee5f33d984d75072aa',
  'quaternius/Textures/T_Props_Batch2_ORM.png': '3b66c58f973d119f8501a38a3bf7743818a1559366ddc4bb5c54b23667d233f3',
  'quaternius/Textures/T_Props_Crates_BaseColor.png': '79d604644b8ef63731735cfb29a4a9ded81598d20ecffe75e2af3fd9e18d255c',
  'quaternius/Textures/T_Props_Crates_Normal.png': '9fe8aa4951198c0dd3e06a41cd7aca1e50e308c2629f620f4d5be53dfc835b21',
  'quaternius/Textures/T_Props_Crates_ORM.png': 'a36b59d07082dde265f13689f0acaacfa0cfb22b4769a2dad1bad282a39bf795',
  'quaternius/Textures/T_Trim_01_BaseColor.png': 'a8f3271be2aa9c450ef5ef85c15bf8bcaeeaa48f5fc616df12d1334a96e78605',
  'quaternius/Textures/T_Trim_01_Normal.png': '1aec7ad47a642fc68216b5a3119341b7dca038c1fc9493df8a15ad4aa27ddbcf',
  'quaternius/Textures/T_Trim_01_ORM.png': '6ab7ad231df22867652048ebfd602684a9072d45c483ca57df0fcd4cb2cb4feb',
  'quaternius/Textures/T_Trim_02_BaseColor.png': '7b13c6a7d82b434314237c4b1930b8e12ddc69a70ffef28d73cbd178d3ff6293',
  'quaternius/Textures/T_Trim_02_Normal.png': '7faaa7059192f43aded9cc2f93917dd54fd14545509c37318d4e6bf0a8104960',
  'quaternius/Textures/T_Trim_02_ORM.png': '2a433e6a7fbcec375b5c5e5c7aa57dbe1fd23ca6592f48c52d09dde2d622aab8',
  'quaternius/Textures/T_Trim_03_Dark.png': '758a95beccdc9f0621d8b8a283ee2593e04b56f1cd32776165ec85e1568e8eb8',
  'quaternius/Textures/T_Trim_03_Normal.png': 'b2c3238cbe2586e44df0b00179adf85e5b7ac7fed1713ec0b807482245a30738',
  'quaternius/Textures/T_Trim_03_ORM.png': 'c57134b5d496b39b955a87765ea32b93567b1ab494fe6b890de24c75dcfd6fe4',
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
        }
      }
      let frameBorders = (0..<7).map { [
        "left": frameLeftBorders[$0],
        "right": frameRightBorders[$0],
      ] }
      let result: [String: Any] = [
        "path": path,
        "width": bitmap.pixelsWide,
        "height": bitmap.pixelsHigh,
        "borders": borders,
        "frameBorders": frameBorders,
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
    ['licenses/Quaternius-Sci-Fi-Essentials-CC0.txt', '2687fba65dca7bbd2f9ab2fb7a8c51dd0c7c8e9acd7579415612bec43f68b3f5'],
    ['licenses/KayKit-Space-Base-Bits-CC0.txt', 'ab3bfedd06f2149bd9a3b78294c2797e039cdcf254979a8a4c83973a9900ea91'],
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

test('the world manifest freezes the audited free OBJ recipes and seven-view geometry', () => {
  const manifest = JSON.parse(read('tools/world-assets.json'));
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.frame, {
    width: 512,
    height: 512,
    yawDegrees: [-30, -20, -10, 0, 10, 20, 30],
  });
  assert.deepEqual(manifest.geometry, {
    drone: { worldWidth: 380, worldHeight: 360, baseY: 140 },
    turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0 },
    wallLow: { worldWidth: 576, worldHeight: 600, baseY: 0 },
    wallHigh: { worldWidth: 576, worldHeight: 2000, baseY: 0 },
  });
  assert.deepEqual(manifest.upstream.map(({ id, uploadId, archiveFilename, archiveSha256 }) => ({
    id, uploadId, archiveFilename, archiveSha256,
  })), [
    {
      id: 'quaternius-sci-fi-essentials-standard',
      uploadId: 12009762,
      archiveFilename: 'Sci-Fi Essentials Kit[Standard].zip',
      archiveSha256: 'a08346d538aa39fbea9fa492e03620d1860fc6214eedd62a4f5db373ac6fca01',
    },
    {
      id: 'kaykit-space-base-bits-free',
      uploadId: 8609688,
      archiveFilename: 'KayKit_Space_Base_Bits_1.0_FREE.zip',
      archiveSha256: '4f8d3e2e90a74d9a0d5262e9e09daccac320f1bcfbe4fa2837559a8ad7b98c17',
    },
  ]);

  const identity = { scale: 1, rotationDegrees: [0, 0, 0], translation: [0, 0, 0] };
  const component = (model, textures, transform = identity) => ({
    model,
    material: model.replace(/\.obj$/, '.mtl'),
    textures,
    ...transform,
  });
  const quaterniusEnemy = [
    'quaternius/Textures/T_Enemies_BaseColor.png',
    'quaternius/Textures/T_Enemies_Emissive.png',
    'quaternius/Textures/T_Enemies_Normal.png',
    'quaternius/Textures/T_Enemies_ORM.png',
  ];
  const quaterniusCrates = [
    'quaternius/Textures/T_Props_Crates_BaseColor.png',
    'quaternius/Textures/T_Props_Crates_Normal.png',
    'quaternius/Textures/T_Props_Crates_ORM.png',
  ];
  const quaterniusTrim = [
    'quaternius/Textures/T_Trim_01_BaseColor.png',
    'quaternius/Textures/T_Trim_01_Normal.png',
    'quaternius/Textures/T_Trim_01_ORM.png',
    'quaternius/Textures/T_Trim_02_BaseColor.png',
    'quaternius/Textures/T_Trim_02_Normal.png',
    'quaternius/Textures/T_Trim_02_ORM.png',
    'quaternius/Textures/T_Trim_03_Dark.png',
    'quaternius/Textures/T_Trim_03_Normal.png',
    'quaternius/Textures/T_Trim_03_ORM.png',
  ];
  const quaterniusBatch1 = [
    'quaternius/Textures/T_Props_Batch1_BaseColor.png',
    'quaternius/Textures/T_Props_Batch1_Normal.png',
    'quaternius/Textures/T_Props_Batch1_ORM.png',
  ];
  const quaterniusBatch2 = [
    'quaternius/Textures/T_Props_Batch2_BaseColor.png',
    'quaternius/Textures/T_Props_Batch2_Emissive.png',
    'quaternius/Textures/T_Props_Batch2_Normal.png',
    'quaternius/Textures/T_Props_Batch2_ORM.png',
  ];
  const kaykitTexture = ['kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/spacebits_texture.png'];
  const expected = [
    ['drone-scout', 'quaternius-sci-fi-essentials-standard', 'drone', [
      component('quaternius/OBJ/Enemy_EyeDrone.obj', quaterniusEnemy),
    ]],
    ['drone-striker', 'quaternius-sci-fi-essentials-standard', 'drone', [
      component('quaternius/OBJ/Enemy_QuadShell.obj', quaterniusEnemy),
    ]],
    ['turret-sentry', 'quaternius-sci-fi-essentials-standard', 'turret', [
      component('quaternius/OBJ/Prop_Crate_Large.obj', quaterniusCrates),
      component('quaternius/OBJ/Prop_SatelliteDish.obj', quaterniusTrim, {
        scale: 0.62, rotationDegrees: [-12, 0, 0], translation: [0, 0.72, 0],
      }),
    ]],
    ['turret-heavy', 'quaternius-sci-fi-essentials-standard', 'turret', [
      component('quaternius/OBJ/Prop_Barrel2_Closed.obj', quaterniusBatch1),
      component('quaternius/OBJ/Prop_Mine.obj', quaterniusBatch2, {
        scale: 0.74, rotationDegrees: [0, 0, 0], translation: [0, 0.68, 0],
      }),
    ]],
    ['barrier-rail', 'quaternius-sci-fi-essentials-standard', 'wallLow', [
      component('quaternius/OBJ/Prop_Crate_Tarp_Large.obj', quaterniusCrates),
    ]],
    ['barrier-crate', 'kaykit-space-base-bits-free', 'wallLow', [
      component('kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/containers_B.obj', kaykitTexture),
    ]],
    ['structure-reactor', 'kaykit-space-base-bits-free', 'wallHigh', [
      component('kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/drill_structure.obj', kaykitTexture),
    ]],
    ['structure-tower', 'kaykit-space-base-bits-free', 'wallHigh', [
      component('kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/structure_tall.obj', kaykitTexture),
    ]],
    ['gap-edge', 'kaykit-space-base-bits-free', 'gap', [
      component('kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/terrain_low.obj', kaykitTexture),
    ]],
  ];
  assert.deepEqual(manifest.assets.map(({ id, sourceFamily, category, components }) => [
    id, sourceFamily, category, components,
  ]), expected);
  assert.deepEqual(manifest.assets.map(({ id }) => id), WORLD_ATLAS_IDS);
  for (const asset of manifest.assets) assert.deepEqual(asset.hideNodes, []);

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
  for (const stats of pngAlphaStats(WORLD_ATLAS_PATHS)) {
    assert.deepEqual(stats.borders, { bottom: 0, left: 0, right: 0, top: 0 }, stats.path);
    assert.deepEqual(stats.frameBorders, Array.from({ length: 7 }, () => ({ left: 0, right: 0 })), stats.path);
    assert.ok(stats.transparentPixels > 0, `${stats.path} must retain transparent padding`);
    assert.equal(stats.hiddenRgbPixels, 0, `${stats.path} must clear RGB under zero alpha`);
  }
});

test('world-art provenance pins official free archives, CC0 licenses, and reproduction command', () => {
  const provenance = read('docs/assets/world-art.md').toString('utf8');
  const notices = read('THIRD_PARTY_NOTICES.md').toString('utf8');
  for (const value of [
    'https://quaternius.com/packs/scifiessentialskit.html',
    'https://kaylousberg.itch.io/space-base-bits',
    '12009762',
    '8609688',
    'Sci-Fi Essentials Kit[Standard].zip',
    'KayKit_Space_Base_Bits_1.0_FREE.zip',
    'a08346d538aa39fbea9fa492e03620d1860fc6214eedd62a4f5db373ac6fca01',
    '4f8d3e2e90a74d9a0d5262e9e09daccac320f1bcfbe4fa2837559a8ad7b98c17',
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

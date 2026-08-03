'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { preloadVisualAssets, resolvePlayerShipFrame } = require('../src/presentation.js');

const root = path.resolve(__dirname, '..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(read(relativePath)).digest('hex');
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

function shipAlphaStats(relativePaths) {
  const source = `
    import AppKit
    import Foundation
    for path in CommandLine.arguments.dropFirst() {
      guard let image = NSImage(contentsOfFile: path),
            let data = image.tiffRepresentation,
            let bitmap = NSBitmapImageRep(data: data) else { exit(2) }
      var borders = ["top": 0, "right": 0, "bottom": 0, "left": 0]
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
          }
        }
      }
      let result: [String: Any] = [
        "path": path,
        "width": bitmap.pixelsWide,
        "height": bitmap.pixelsHigh,
        "borders": borders,
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
  for (const stats of shipAlphaStats(relativePaths)) {
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
  class ImageSuccess {
    set src(value) {
      this.currentSrc = value;
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
  assert.equal(result.loadedCount, 11);
  assert.equal(result.failedCount, 0);
  assert.equal(result.assets.ship.neutral.loaded, true);
  assert.equal(result.assets.ship.thrust.loaded, true);
  assert.equal(Object.keys(result.assets.ui).length, 2);
  assert.equal(Object.keys(result.assets.icons).length, 6);
  assert.equal(result.assets.font.orbitron.loaded, true);
  assert.equal(addedFonts.length, 1);
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
  assert.equal(result.failedCount, 11);
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
  assert.equal(result.failedCount, 11);
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
  assert.equal(result.failedCount, 11);
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

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { preloadVisualAssets, resolvePlayerShipFrame } = require('../src/presentation.js');

const root = path.resolve(__dirname, '..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function assertPng(relativePath) {
  const bytes = read(relativePath);
  assert.equal(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true, `${relativePath} must be a PNG`);
  assert.ok(bytes.length > 100, `${relativePath} must not be empty`);
  return bytes;
}

function sipsDimensions(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', absolutePath], { encoding: 'utf8' });
  return {
    width: Number(output.match(/pixelWidth: (\d+)/)?.[1]),
    height: Number(output.match(/pixelHeight: (\d+)/)?.[1]),
  };
}

test('both player frames are decodable 512 by 384 transparent PNGs', () => {
  for (const relativePath of ['assets/ship/player-neutral.png', 'assets/ship/player-thrust.png']) {
    assertPng(relativePath);
    assert.deepEqual(sipsDimensions(relativePath), { width: 512, height: 384 });
  }
});

test('the selected semantic UI assets are committed as nonempty PNGs', () => {
  for (const relativePath of [
    'assets/ui/panel-frame-cyan.png',
    'assets/ui/button-frame-gold.png',
    'assets/ui/meter-frame-cyan.png',
  ]) assertPng(relativePath);
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
    'PNG/Yellow/Double/button_square_header_notch_rectangle_screws.png',
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
  const sha256Values = notices.match(/\b[a-f0-9]{64}\b/g) || [];
  assert.ok(sha256Values.length >= 15, 'notices must include original SHA-256 values for every selected upstream input');
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
  assert.equal(result.loadedCount, 12);
  assert.equal(result.failedCount, 0);
  assert.equal(result.assets.ship.neutral.loaded, true);
  assert.equal(result.assets.ship.thrust.loaded, true);
  assert.equal(Object.keys(result.assets.ui).length, 3);
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
  assert.equal(result.failedCount, 12);
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
  assert.equal(result.failedCount, 12);
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

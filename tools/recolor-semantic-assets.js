#!/usr/bin/env node
'use strict';

// Semantic spectrum recolor (v4, AI-art edition).
//
// v3 applied fixed color matrices designed for flat-shaded low-poly sources.
// The v4 sources are realistic AI-generated sprites (tools/build-world-atlases.py),
// so the recolor now works in HSV space: it pulls each pixel's hue toward the
// semantic role color while preserving value and per-pixel detail, which keeps
// weathering, panel lines and glow gradients intact (tests/semantic-assets.test.js
// enforces the palette ratios and the source-detail fidelity floor).
//
// Invariants kept from v3: output alpha === source alpha, hidden RGB is zero,
// output is byte-deterministic, and sources are verified by SHA-256.

const fs = require('node:fs');
const path = require('node:path');
const {
  decodePngRgba,
  encodePngRgba,
  sha256,
} = require('./png-rgba.js');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'tools/semantic-assets.json');

function parseArguments(argv) {
  const options = { outputRoot: root, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-root') options.outputRoot = path.resolve(argv[++index] || '');
    else if (argument === '--report') options.report = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown argument ${argument}`);
  }
  if (!options.outputRoot) throw new Error('--output-root requires a path');
  return options;
}

function rgbToHsv(red, green, blue) {
  const channels = [red, green, blue].map((channel) => channel / 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference > 0) {
    if (maximum === channels[0]) hue = ((channels[1] - channels[2]) / difference) % 6;
    else if (maximum === channels[1]) hue = (channels[2] - channels[0]) / difference + 2;
    else hue = (channels[0] - channels[1]) / difference + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return {
    hue,
    saturation: maximum === 0 ? 0 : difference / maximum,
    value: maximum,
  };
}

function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 360) + 360) % 360 / 60;
  const c = value * saturation;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = value - c;
  let rgb;
  if (h < 1) rgb = [c, x, 0];
  else if (h < 2) rgb = [x, c, 0];
  else if (h < 3) rgb = [0, c, x];
  else if (h < 4) rgb = [0, x, c];
  else if (h < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((channel) => Math.round((channel + m) * 255));
}

function pullHue(hue, target, weight) {
  const delta = ((target - hue + 540) % 360) - 180;
  return hue + delta * weight;
}

// coolPull/satFloor shape the body material; warmRange/warmPull/warmTarget
// shape lamps, hazard paint and thruster flames.
const PROFILES = Object.freeze({
  player: Object.freeze({
    coolHue: 202, coolPull: 0.88, satFloor: 0.33, satScale: 0.92,
    warmRange: [5, 65], warmTarget: 46, warmPull: 0.8, warmSplit: 0.72,
    value: 1.06,
  }),
  hostile: Object.freeze({
    coolHue: 325, coolPull: 0.62, satFloor: 0.34, satScale: 1.05,
    warmRange: null, warmTarget: 325, warmPull: 0.62,
    value: 0.98,
  }),
  structure: Object.freeze({
    coolHue: 26, coolPull: 0.18, satFloor: 0.10, satScale: 0.9,
    warmRange: [15, 65], warmTarget: 30, warmPull: 0.6,
    value: 1.03,
  }),
  barrier: Object.freeze({
    coolHue: 24, coolPull: 0.15, satFloor: 0.10, satScale: 0.9,
    warmRange: [15, 65], warmTarget: 34, warmPull: 0.45,
    value: 1.0,
  }),
  gap: Object.freeze({
    coolHue: 196, coolPull: 0.5, satFloor: 0.28, satScale: 0.9,
    warmRange: [12, 42], warmTarget: 26, warmPull: 0.3,
    value: 0.9,
  }),
});

function profileFor(asset) {
  if (asset.role === 'structure' && /(?:barrier|corridor)/.test(asset.output)) return 'barrier';
  return asset.role;
}

function recolorPixel(profile, red, green, blue) {
  const color = rgbToHsv(red, green, blue);
  const inWarm = profile.warmRange
    && color.hue >= profile.warmRange[0]
    && color.hue < profile.warmRange[1]
    && color.saturation > 0.25;
  let hue;
  let saturation;
  if (inWarm) {
    if (profile.warmSplit != null && color.value <= profile.warmSplit) {
      // dim warm decals keep their orange identity; only bright flames go gold
      hue = color.hue;
    } else {
      hue = pullHue(color.hue, profile.warmTarget, profile.warmPull);
    }
    saturation = color.saturation;
  } else {
    hue = pullHue(color.hue, profile.coolHue, profile.coolPull);
    saturation = Math.max(color.saturation * profile.satScale,
      color.value > 0.12 ? profile.satFloor : color.saturation);
  }
  const value = Math.min(1, Math.max(0, color.value * profile.value));
  return hsvToRgb(hue, Math.min(1, saturation), value);
}

function recolor(decoded, asset) {
  const profile = PROFILES[profileFor(asset)];
  if (!profile) throw new Error(`Unknown semantic profile ${profileFor(asset)}`);
  const rgba = Buffer.alloc(decoded.rgba.length);
  for (let offset = 0; offset < decoded.rgba.length; offset += 4) {
    const alpha = decoded.rgba[offset + 3];
    rgba[offset + 3] = alpha;
    if (alpha === 0) continue;
    const straight = [0, 1, 2].map((channel) => (
      Math.min(255, Math.round(decoded.rgba[offset + channel] * 255 / alpha))
    ));
    const target = recolorPixel(profile, straight[0], straight[1], straight[2]);
    for (let channel = 0; channel < 3; channel += 1) {
      rgba[offset + channel] = Math.min(alpha, Math.round(target[channel] * alpha / 255));
    }
  }
  return { width: decoded.width, height: decoded.height, rgba };
}

function writeAtomic(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filePath);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error('Unsupported semantic asset manifest');
  }

  const assets = [];
  for (const asset of manifest.assets) {
    const sourcePath = path.join(root, asset.source);
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceSha256 = sha256(sourceBytes);
    if (sourceSha256 !== asset.sourceSha256) {
      throw new Error(`${asset.source} SHA-256 ${sourceSha256} does not match ${asset.sourceSha256}`);
    }
    const decoded = decodePngRgba(sourceBytes);
    const outputBytes = encodePngRgba(recolor(decoded, asset));
    const outputPath = path.join(options.outputRoot, asset.output);
    writeAtomic(outputPath, outputBytes);
    assets.push({
      source: asset.source,
      output: asset.output,
      role: asset.role,
      sourceSha256,
      outputSha256: sha256(outputBytes),
      width: decoded.width,
      height: decoded.height,
    });
  }

  const report = {
    version: manifest.version,
    manifestSha256: sha256(fs.readFileSync(manifestPath)),
    assets,
  };
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  if (options.report) writeAtomic(options.report, reportBytes);
  else process.stdout.write(reportBytes);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
}

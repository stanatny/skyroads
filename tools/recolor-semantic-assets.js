#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  decodePngRgba,
  encodePngRgba,
  sha256,
} = require('./png-rgba.js');
const { SCENE_STYLE } = require('../src/scene-style.js');

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

function rgb(hex) {
  return hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16));
}

function mix(left, right, ratio) {
  const amount = Math.max(0, Math.min(1, ratio));
  return left.map((channel, index) => Math.round(channel + (right[index] - channel) * amount));
}

function multiplyMatrices(left, right) {
  const output = Array.from({ length: 4 }, () => Array(5).fill(0));
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      output[row][column] = column === 4 ? left[row][4] : 0;
      for (let index = 0; index < 4; index += 1) {
        output[row][column] += left[row][index] * right[index][column];
      }
    }
  }
  return output;
}

function sepiaMatrix(amount) {
  return [
    [1 - 0.607 * amount, 0.769 * amount, 0.189 * amount, 0, 0],
    [0.349 * amount, 1 - 0.314 * amount, 0.168 * amount, 0, 0],
    [0.272 * amount, 0.534 * amount, 1 - 0.869 * amount, 0, 0],
    [0, 0, 0, 1, 0],
  ];
}

function saturationMatrix(amount) {
  return [
    [0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount, 0, 0],
    [0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount, 0, 0],
    [0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount, 0, 0],
    [0, 0, 0, 1, 0],
  ];
}

function hueRotationMatrix(degrees) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    [
      0.213 + cosine * 0.787 - sine * 0.213,
      0.715 - cosine * 0.715 - sine * 0.715,
      0.072 - cosine * 0.072 + sine * 0.928,
      0,
      0,
    ],
    [
      0.213 - cosine * 0.213 + sine * 0.143,
      0.715 + cosine * 0.285 + sine * 0.140,
      0.072 - cosine * 0.072 - sine * 0.283,
      0,
      0,
    ],
    [
      0.213 - cosine * 0.213 - sine * 0.787,
      0.715 - cosine * 0.715 + sine * 0.715,
      0.072 + cosine * 0.928 + sine * 0.072,
      0,
      0,
    ],
    [0, 0, 0, 1, 0],
  ];
}

function brightnessMatrix(amount) {
  return [
    [amount, 0, 0, 0, 0],
    [0, amount, 0, 0, 0],
    [0, 0, amount, 0, 0],
    [0, 0, 0, 1, 0],
  ];
}

function colorMatrix(filters) {
  let matrix = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
  ];
  for (const filter of filters) matrix = multiplyMatrices(filter, matrix);
  return matrix;
}

function applyColorMatrix(matrix, channels) {
  return [0, 1, 2].map((row) => Math.max(0, Math.min(255,
    matrix[row][0] * channels[0]
      + matrix[row][1] * channels[1]
      + matrix[row][2] * channels[2]
      + matrix[row][4] * 255,
  )));
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

function isGeneratedCyan(channels) {
  return channels[0] >= 112
    && channels[1] >= 224
    && channels[2] >= 224
    && Math.abs(channels[1] - channels[2]) <= 24;
}

const PROFILE_MATRICES = Object.freeze({
  player: colorMatrix([
    sepiaMatrix(0.22),
    saturationMatrix(0.72),
    brightnessMatrix(1.20),
  ]),
  structure: colorMatrix([
    saturationMatrix(0.50),
    sepiaMatrix(0.15),
    hueRotationMatrix(348),
    brightnessMatrix(1.03),
  ]),
  barrier: colorMatrix([
    saturationMatrix(0.65),
    sepiaMatrix(0.30),
    hueRotationMatrix(342),
    brightnessMatrix(1.05),
  ]),
  hostile: colorMatrix([
    hueRotationMatrix(103),
    saturationMatrix(1.35),
    brightnessMatrix(0.96),
  ]),
  gap: colorMatrix([
    saturationMatrix(0.55),
    sepiaMatrix(0.12),
    brightnessMatrix(0.90),
  ]),
});

function profileFor(asset) {
  if (asset.role === 'structure' && /(?:barrier|corridor)/.test(asset.output)) return 'barrier';
  return asset.role;
}

function accentColor(profile, channels, color) {
  if (profile === 'player'
    && color.hue >= 175
    && color.hue < 215
    && color.saturation > 0.60
    && color.value > 0.62) return rgb(SCENE_STYLE.player.identity);
  const brightCyan = isGeneratedCyan(channels)
    || (color.hue >= 175
      && color.hue < 205
      && color.saturation > 0.65
      && color.value > 0.86);
  if (!brightCyan) return null;
  if (profile === 'structure') return rgb(SCENE_STYLE.structure.signal);
  if (profile === 'barrier') return rgb(SCENE_STYLE.structure.danger);
  if (profile === 'gap') return rgb(SCENE_STYLE.gap.warningPrimary);
  return null;
}

function recolor(decoded, asset) {
  const profile = profileFor(asset);
  const matrix = PROFILE_MATRICES[profile];
  if (!matrix) throw new Error(`Unknown semantic profile ${profile}`);
  const rgba = Buffer.alloc(decoded.rgba.length);
  for (let offset = 0; offset < decoded.rgba.length; offset += 4) {
    const alpha = decoded.rgba[offset + 3];
    rgba[offset + 3] = alpha;
    if (alpha === 0) continue;
    const straight = [0, 1, 2].map((channel) => (
      Math.min(255, Math.round(decoded.rgba[offset + channel] * 255 / alpha))
    ));
    const color = rgbToHsv(straight[0], straight[1], straight[2]);
    const target = accentColor(profile, straight, color)
      || applyColorMatrix(matrix, straight);
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

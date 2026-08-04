'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  decodePngRgba,
  sha256,
  alphaPlane,
} = require('../tools/png-rgba.js');

const root = path.resolve(__dirname, '..');
const generator = path.join(root, 'tools/recolor-semantic-assets.js');

const EXPECTED_ASSETS = Object.freeze([
  ['assets/ship/player-neutral.png', 'assets/ship/semantic/player-neutral.png', 'player'],
  ['assets/ship/player-thrust.png', 'assets/ship/semantic/player-thrust.png', 'player'],
  ['assets/world/drone-scout.png', 'assets/world/semantic/drone-scout.png', 'hostile'],
  ['assets/world/drone-striker.png', 'assets/world/semantic/drone-striker.png', 'hostile'],
  ['assets/world/turret-sentry.png', 'assets/world/semantic/turret-sentry.png', 'hostile'],
  ['assets/world/turret-heavy.png', 'assets/world/semantic/turret-heavy.png', 'hostile'],
  ['assets/world/barrier-rail.png', 'assets/world/semantic/barrier-rail.png', 'structure'],
  ['assets/world/barrier-crate.png', 'assets/world/semantic/barrier-crate.png', 'structure'],
  ['assets/world/structure-pylon.png', 'assets/world/semantic/structure-pylon.png', 'structure'],
  ['assets/world/structure-bastion.png', 'assets/world/semantic/structure-bastion.png', 'structure'],
  ['assets/world/structure-reactor.png', 'assets/world/semantic/structure-reactor.png', 'structure'],
  ['assets/world/structure-tower.png', 'assets/world/semantic/structure-tower.png', 'structure'],
  ['assets/world/corridor-low.png', 'assets/world/semantic/corridor-low.png', 'structure'],
  ['assets/world/corridor-medium.png', 'assets/world/semantic/corridor-medium.png', 'structure'],
  ['assets/world/gap-edge.png', 'assets/world/semantic/gap-edge.png', 'gap'],
]);

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

function hueDistribution(decoded) {
  const counts = { visible: 0, cyan: 0, gold: 0, orange: 0, magenta: 0 };
  for (let offset = 0; offset < decoded.rgba.length; offset += 4) {
    const alpha = decoded.rgba[offset + 3];
    if (alpha < 64) continue;
    const unpremultiply = (channel) => Math.min(255, Math.round(decoded.rgba[offset + channel] * 255 / alpha));
    const hsv = rgbToHsv(unpremultiply(0), unpremultiply(1), unpremultiply(2));
    counts.visible += 1;
    if (hsv.saturation > 0.24 && hsv.hue >= 165 && hsv.hue < 220) counts.cyan += 1;
    if (hsv.saturation > 0.24 && hsv.hue >= 38 && hsv.hue < 65) counts.gold += 1;
    if (hsv.saturation > 0.24 && hsv.hue >= 10 && hsv.hue < 38) counts.orange += 1;
    if (hsv.saturation > 0.24 && hsv.hue >= 305 && hsv.hue < 350) counts.magenta += 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => (
    [key, key === 'visible' ? value : value / counts.visible]
  )));
}

function visualFidelity(decoded) {
  const quantizedColors = new Map();
  let visible = 0;
  let luminance = 0;
  let edgeEnergy = 0;
  let edgePairs = 0;
  const straightPixel = (x, y) => {
    const offset = (y * decoded.width + x) * 4;
    const alpha = decoded.rgba[offset + 3];
    if (alpha < 64) return null;
    return [0, 1, 2].map((channel) => (
      Math.min(255, Math.round(decoded.rgba[offset + channel] * 255 / alpha))
    ));
  };
  const pixelLuminance = (pixel) => (
    0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]
  );
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const pixel = straightPixel(x, y);
      if (!pixel) continue;
      visible += 1;
      luminance += pixelLuminance(pixel) / 255;
      const colorKey = (pixel[0] >> 3) << 10 | (pixel[1] >> 3) << 5 | (pixel[2] >> 3);
      quantizedColors.set(colorKey, (quantizedColors.get(colorKey) || 0) + 1);
      for (const [neighborX, neighborY] of [[x - 1, y], [x, y - 1]]) {
        if (neighborX < 0 || neighborY < 0) continue;
        const neighbor = straightPixel(neighborX, neighborY);
        if (!neighbor) continue;
        edgeEnergy += Math.abs(pixelLuminance(pixel) - pixelLuminance(neighbor));
        edgePairs += 1;
      }
    }
  }
  let colorEntropy = 0;
  for (const count of quantizedColors.values()) {
    const probability = count / visible;
    colorEntropy -= probability * Math.log2(probability);
  }
  return {
    quantizedColors: quantizedColors.size,
    colorEntropy,
    meanLuminance: luminance / visible,
    edgeEnergy: edgeEnergy / edgePairs,
  };
}

function generateInto(outputRoot) {
  const reportPath = path.join(outputRoot, 'report.json');
  fs.mkdirSync(outputRoot, { recursive: true });
  execFileSync(process.execPath, [
    generator,
    '--output-root', outputRoot,
    '--report', reportPath,
  ], { cwd: root, stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

test('semantic generator verifies sources and produces deterministic alpha-invariant assets', () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyroads-semantic-a-'));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyroads-semantic-b-'));
  try {
    const firstReport = generateInto(firstRoot);
    const secondReport = generateInto(secondRoot);
    assert.deepEqual(
      firstReport.assets.map(({ source, output, role }) => [source, output, role]),
      EXPECTED_ASSETS,
    );
    assert.deepEqual(secondReport, firstReport);

    for (const [source, output] of EXPECTED_ASSETS) {
      const sourceBytes = fs.readFileSync(path.join(root, source));
      const firstBytes = fs.readFileSync(path.join(firstRoot, output));
      const secondBytes = fs.readFileSync(path.join(secondRoot, output));
      assert.equal(firstBytes.equals(secondBytes), true, `${output} must be byte-deterministic`);
      const sourceImage = decodePngRgba(sourceBytes);
      const outputImage = decodePngRgba(firstBytes);
      assert.deepEqual(
        { width: outputImage.width, height: outputImage.height },
        { width: sourceImage.width, height: sourceImage.height },
        output,
      );
      assert.equal(alphaPlane(outputImage.rgba).equals(alphaPlane(sourceImage.rgba)), true, `${output} alpha`);
      for (let offset = 0; offset < outputImage.rgba.length; offset += 4) {
        if (outputImage.rgba[offset + 3] !== 0) continue;
        assert.deepEqual(
          [...outputImage.rgba.subarray(offset, offset + 3)],
          [0, 0, 0],
          `${output} hidden RGB at ${offset / 4}`,
        );
      }
      const reportEntry = firstReport.assets.find((asset) => asset.output === output);
      assert.equal(reportEntry.sourceSha256, sha256(sourceBytes), `${source} report hash`);
      assert.equal(reportEntry.outputSha256, sha256(firstBytes), `${output} report hash`);
    }
  } finally {
    fs.rmSync(firstRoot, { recursive: true, force: true });
    fs.rmSync(secondRoot, { recursive: true, force: true });
  }
});

test('semantic outputs reserve localized gold orange and magenta accents without replacing base materials', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyroads-semantic-palette-'));
  try {
    generateInto(outputRoot);
    const player = hueDistribution(decodePngRgba(
      fs.readFileSync(path.join(outputRoot, 'assets/ship/semantic/player-neutral.png')),
    ));
    assert.ok(player.gold >= 0.01 && player.gold <= 0.12, `player gold ratio ${player.gold}`);
    assert.ok(player.cyan >= 0.25 && player.cyan <= 0.95, `player cyan ratio ${player.cyan}`);

    for (const name of ['barrier-rail', 'structure-tower']) {
      const structure = hueDistribution(decodePngRgba(
        fs.readFileSync(path.join(outputRoot, `assets/world/semantic/${name}.png`)),
      ));
      assert.ok(structure.orange >= 0.015 && structure.orange <= 0.25,
        `${name} orange ratio ${structure.orange}`);
      assert.ok(structure.cyan <= 0.65, `${name} cyan ratio ${structure.cyan}`);
    }

    for (const name of ['drone-scout', 'turret-heavy']) {
      const hostile = hueDistribution(decodePngRgba(
        fs.readFileSync(path.join(outputRoot, `assets/world/semantic/${name}.png`)),
      ));
      assert.ok(hostile.magenta >= 0.2 && hostile.magenta <= 0.95,
        `${name} magenta ratio ${hostile.magenta}`);
      assert.ok(hostile.cyan < 0.10, `${name} cyan ratio ${hostile.cyan}`);
    }

    const gap = hueDistribution(decodePngRgba(
      fs.readFileSync(path.join(outputRoot, 'assets/world/semantic/gap-edge.png')),
    ));
    assert.ok(gap.orange >= 0.003 && gap.orange <= 0.12, `gap orange ratio ${gap.orange}`);
    assert.ok(gap.cyan >= 0.10 && gap.cyan <= 0.70, `gap cyan ratio ${gap.cyan}`);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('semantic outputs preserve source material detail instead of collapsing into flat accent colors', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyroads-semantic-fidelity-'));
  try {
    generateInto(outputRoot);
    for (const [source, output] of EXPECTED_ASSETS) {
      const sourceImage = decodePngRgba(fs.readFileSync(path.join(root, source)));
      const outputImage = decodePngRgba(fs.readFileSync(path.join(outputRoot, output)));
      const sourceStats = visualFidelity(sourceImage);
      const outputStats = visualFidelity(outputImage);
      assert.ok(
        outputStats.colorEntropy >= sourceStats.colorEntropy * 0.75,
        `${output} entropy ${outputStats.colorEntropy} from ${sourceStats.colorEntropy}`,
      );
      assert.ok(
        outputStats.quantizedColors >= sourceStats.quantizedColors * 0.45,
        `${output} colors ${outputStats.quantizedColors} from ${sourceStats.quantizedColors}`,
      );
      assert.ok(
        outputStats.edgeEnergy >= sourceStats.edgeEnergy * 0.65,
        `${output} edge energy ${outputStats.edgeEnergy} from ${sourceStats.edgeEnergy}`,
      );
      assert.ok(
        outputStats.meanLuminance >= sourceStats.meanLuminance * 0.65
          && outputStats.meanLuminance <= sourceStats.meanLuminance * 1.45,
        `${output} luminance ${outputStats.meanLuminance} from ${sourceStats.meanLuminance}`,
      );
    }

    const player = hueDistribution(decodePngRgba(
      fs.readFileSync(path.join(outputRoot, 'assets/ship/semantic/player-neutral.png')),
    ));
    assert.ok(player.gold >= 0.01 && player.gold <= 0.12, `player gold ratio ${player.gold}`);

    for (const name of ['barrier-rail', 'structure-tower']) {
      const structure = hueDistribution(decodePngRgba(
        fs.readFileSync(path.join(outputRoot, `assets/world/semantic/${name}.png`)),
      ));
      assert.ok(structure.orange >= 0.015 && structure.orange <= 0.25,
        `${name} orange ratio ${structure.orange}`);
    }

    const drone = hueDistribution(decodePngRgba(
      fs.readFileSync(path.join(outputRoot, 'assets/world/semantic/drone-scout.png')),
    ));
    assert.ok(drone.magenta >= 0.2 && drone.magenta <= 0.95, `drone magenta ratio ${drone.magenta}`);

    const gap = hueDistribution(decodePngRgba(
      fs.readFileSync(path.join(outputRoot, 'assets/world/semantic/gap-edge.png')),
    ));
    assert.ok(gap.orange >= 0.003 && gap.orange <= 0.12, `gap orange ratio ${gap.orange}`);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

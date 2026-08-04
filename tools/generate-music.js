#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHORDS = Object.freeze({
  'Em(add9)': [52, 55, 59, 66],
  Cmaj7: [48, 52, 55, 59],
  G: [43, 50, 55, 59],
  D: [50, 54, 57, 62],
  Em: [52, 55, 59, 64],
  C: [48, 52, 55, 60],
  Am7: [45, 48, 52, 55],
  B7: [47, 51, 54, 57],
});
const EIGHTH_GRID = Object.freeze([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
const SIXTEENTH_PICKUPS = Object.freeze([0.75, 1.75, 2.75, 3.75]);
const SIXTEENTH_GRID = Object.freeze([
  0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75,
  2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75,
]);
const BASS_PATTERN = Object.freeze([0, 0, 2, 0, 1, 0, 3, 2]);
const LEAD_PATTERN = Object.freeze([0, 2, 1, 2, 3, 2]);
const LEAD_OFFSETS = Object.freeze([0, 0.75, 1.5, 2, 2.75, 3.5]);

function exactFrameCount(score) {
  return Math.round(score.bars * score.beatsPerBar * 60 / score.bpm * score.sampleRate);
}

function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return function next() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frequency(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

function makeStem(frames) {
  return { left: new Float32Array(frames), right: new Float32Array(frames) };
}

function addTone(stem, sampleRate, startSeconds, durationSeconds, midi, amplitude, {
  pan = 0,
  attack = 0.02,
  release = 0.12,
  brightness = 0,
  detune = 0,
} = {}) {
  const start = Math.max(0, Math.round(startSeconds * sampleRate));
  const end = Math.min(stem.left.length, Math.round((startSeconds + durationSeconds) * sampleRate));
  const frameLength = Math.max(1, end - start);
  const attackFrames = Math.max(1, Math.round(Math.min(attack, durationSeconds * 0.35) * sampleRate));
  const releaseFrames = Math.max(1, Math.round(Math.min(release, durationSeconds * 0.45) * sampleRate));
  const baseFrequency = frequency(midi) * Math.pow(2, detune / 1200);
  const step = Math.PI * 2 * baseFrequency / sampleRate;
  const leftGain = Math.cos((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4);
  const rightGain = Math.sin((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4);
  for (let offset = 0; offset < frameLength; offset++) {
    const attackEnvelope = Math.min(1, offset / attackFrames);
    const releaseEnvelope = Math.min(1, (frameLength - 1 - offset) / releaseFrames);
    const envelope = Math.max(0, Math.min(attackEnvelope, releaseEnvelope));
    const phase = step * offset;
    const sample = amplitude * envelope * (
      Math.sin(phase) + brightness * 0.45 * Math.sin(phase * 2) + brightness * 0.18 * Math.sin(phase * 3)
    );
    stem.left[start + offset] += sample * leftGain;
    stem.right[start + offset] += sample * rightGain;
  }
}

function addKick(stem, sampleRate, startSeconds, amplitude) {
  const length = Math.round(0.20 * sampleRate);
  const start = Math.round(startSeconds * sampleRate);
  let phase = 0;
  for (let offset = 0; offset < length && start + offset < stem.left.length; offset++) {
    const progress = offset / length;
    const hz = 46 + 105 * Math.pow(1 - progress, 3);
    phase += Math.PI * 2 * hz / sampleRate;
    const sample = Math.sin(phase) * amplitude * Math.pow(1 - progress, 3.5);
    stem.left[start + offset] += sample * 0.74;
    stem.right[start + offset] += sample * 0.74;
  }
}

function addNoiseHit(stem, sampleRate, startSeconds, durationSeconds, amplitude, random, pan = 0) {
  const start = Math.round(startSeconds * sampleRate);
  const length = Math.round(durationSeconds * sampleRate);
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  let filtered = 0;
  let previous = 0;
  for (let offset = 0; offset < length && start + offset < stem.left.length; offset++) {
    const progress = offset / length;
    const white = random() * 2 - 1;
    filtered = filtered * 0.72 + (white - previous) * 0.28;
    previous = white;
    const sample = filtered * amplitude * Math.pow(1 - progress, 2.6);
    stem.left[start + offset] += sample * leftGain;
    stem.right[start + offset] += sample * rightGain;
  }
}

function normalize(stem, targetPeak) {
  const peak = measurePeak(stem);
  const scale = peak > 0 ? targetPeak / peak : 1;
  const edgeFrames = Math.min(882, Math.floor(stem.left.length / 2));
  for (let i = 0; i < stem.left.length; i++) {
    const edge = Math.min(1, i / edgeFrames, (stem.left.length - 1 - i) / edgeFrames);
    stem.left[i] *= scale * Math.max(0, edge);
    stem.right[i] *= scale * Math.max(0, edge);
  }
  return stem;
}

function measurePeak(stem) {
  let peak = 0;
  for (let i = 0; i < stem.left.length; i++) {
    peak = Math.max(peak, Math.abs(stem.left[i]), Math.abs(stem.right[i]));
  }
  return peak;
}

function measurePulse(stem, sampleRate, bpm) {
  const windowFrames = Math.round(sampleRate * 0.035);
  const halfWindow = Math.floor(windowFrames / 2);
  const beatFrames = sampleRate * 60 / bpm;
  const earlyFrames = Math.min(stem.left.length, Math.round(sampleRate * 2));
  let transientSquares = 0;
  let sustainedSquares = 0;
  let sampleCount = 0;

  for (let beatCenter = beatFrames;
    beatCenter + beatFrames / 2 + halfWindow <= earlyFrames;
    beatCenter += beatFrames) {
    const transientStart = Math.round(beatCenter) - halfWindow;
    const sustainedStart = Math.round(beatCenter + beatFrames / 2) - halfWindow;
    for (let offset = 0; offset < windowFrames; offset++) {
      const transientLeft = stem.left[transientStart + offset];
      const transientRight = stem.right[transientStart + offset];
      const sustainedLeft = stem.left[sustainedStart + offset];
      const sustainedRight = stem.right[sustainedStart + offset];
      transientSquares += transientLeft * transientLeft + transientRight * transientRight;
      sustainedSquares += sustainedLeft * sustainedLeft + sustainedRight * sustainedRight;
      sampleCount += 2;
    }
  }

  const transientRms = sampleCount ? Math.sqrt(transientSquares / sampleCount) : 0;
  const sustainedRms = sampleCount ? Math.sqrt(sustainedSquares / sampleCount) : 0;
  return {
    transientRms,
    sustainedRms,
    earlyPulseRatio: sustainedRms ? transientRms / sustainedRms : Infinity,
  };
}

function measureIntenseMixPeak(stems, { atmosphere, drive, overdrive, busGain }) {
  let peak = 0;
  for (let i = 0; i < stems.atmosphere.left.length; i++) {
    const left = (stems.atmosphere.left[i] * atmosphere + stems.drive.left[i] * drive
      + stems.overdrive.left[i] * overdrive) * busGain;
    const right = (stems.atmosphere.right[i] * atmosphere + stems.drive.right[i] * drive
      + stems.overdrive.right[i] * overdrive) * busGain;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
  }
  return peak;
}

function renderScore(score) {
  const frames = exactFrameCount(score);
  const sampleRate = score.sampleRate;
  const beat = 60 / score.bpm;
  const bar = beat * score.beatsPerBar;
  const atmosphere = makeStem(frames);
  const drive = makeStem(frames);
  const overdrive = makeStem(frames);
  const atmosphereRandom = seededRandom(score.seed);
  const driveRandom = seededRandom(score.seed ^ 0x44524956);
  const overdriveRandom = seededRandom(score.seed ^ 0x4F564552);

  for (let barIndex = 0; barIndex < score.bars; barIndex++) {
    const chord = CHORDS[score.progression[barIndex % score.progression.length]];
    const barStart = barIndex * bar;
    chord.forEach((note, index) => {
      addTone(atmosphere, sampleRate, barStart, bar * 1.02, note, 0.052, {
        pan: (index - 1.5) * 0.28,
        attack: 0.18,
        release: 0.34,
        brightness: 0.12,
        detune: index % 2 === 0 ? -3 : 3,
      });
      addTone(atmosphere, sampleRate, barStart, bar * 1.02, note + 12, 0.013, {
        pan: (1.5 - index) * 0.32,
        attack: 0.24,
        release: 0.40,
        detune: index % 2 === 0 ? 5 : -5,
      });
    });
    if (barIndex % 2 === 1) {
      [71, 76, 79].forEach((note, index) => {
        addTone(atmosphere, sampleRate, barStart + beat * (1.5 + index * 0.55), beat * 0.62, note, 0.026, {
          pan: [-0.32, 0.08, 0.34][index], attack: 0.08, release: 0.25, brightness: 0.1,
        });
      });
    }

    for (const [stepIndex, beatOffset] of EIGHTH_GRID.entries()) {
      const start = barStart + beatOffset * beat;
      const octaveLift = stepIndex === 3 || stepIndex === 7 ? 12 : 0;
      const note = chord[BASS_PATTERN[stepIndex] % chord.length] - 12 + octaveLift;
      addTone(drive, sampleRate, start, beat * 0.28, note, 0.13, {
        pan: beatOffset % 1 === 0 ? -0.08 : 0.08,
        attack: 0.006,
        release: 0.055,
        brightness: 0.38,
      });
      if (beatOffset % 1 === 0) addKick(drive, sampleRate, start, beatOffset === 0 ? 0.29 : 0.21);
      if (beatOffset === 1 || beatOffset === 3) {
        addNoiseHit(drive, sampleRate, start, 0.13, 0.15, driveRandom, 0.08);
        addNoiseHit(drive, sampleRate, start + 0.018, 0.08, 0.07, driveRandom, -0.12);
      }
    }
    for (const [stepIndex, beatOffset] of SIXTEENTH_GRID.entries()) {
      const accent = stepIndex % 4 === 2 ? 0.044 : stepIndex % 2 === 0 ? 0.030 : 0.018;
      addNoiseHit(drive, sampleRate, barStart + beatOffset * beat, 0.026, accent, driveRandom,
        stepIndex % 2 === 0 ? -0.30 : 0.30);
    }
    for (const beatOffset of [0.5, 1.5, 2.5, 3.5]) {
      addNoiseHit(drive, sampleRate, barStart + beatOffset * beat, 0.075, 0.038, driveRandom, 0.22);
    }
    if (barIndex % 2 === 1) {
      addKick(drive, sampleRate, barStart + 3.75 * beat, 0.09);
    }

    for (let sixteenth = 0; sixteenth < score.beatsPerBar * 4; sixteenth++) {
      const start = barStart + sixteenth * beat / 4;
      const arpPattern = [0, 2, 1, 3, 1, 2, 0, 3, 2, 1, 3, 1, 0, 2, 1, 3];
      const note = chord[arpPattern[sixteenth] % chord.length] + 12;
      addTone(overdrive, sampleRate, start, beat * 0.20, note, 0.068, {
        pan: sixteenth % 2 ? 0.34 : -0.34, attack: 0.006, release: 0.065, brightness: 0.42,
      });
      if (sixteenth % 2 === 0) {
        addNoiseHit(overdrive, sampleRate, start, 0.028, 0.028, overdriveRandom, sixteenth % 4 ? 0.38 : -0.38);
      }
    }
    LEAD_OFFSETS.forEach((beatOffset, index) => {
      const counterNote = chord[LEAD_PATTERN[index] % chord.length] + 24;
      addTone(overdrive, sampleRate, barStart + beatOffset * beat, beat * 0.34, counterNote, 0.050, {
        pan: index % 2 ? 0.22 : -0.22, attack: 0.012, release: 0.09, brightness: 0.38,
      });
    });
    for (let beatIndex = 0; beatIndex < score.beatsPerBar; beatIndex++) {
      addKick(overdrive, sampleRate, barStart + beatIndex * beat, beatIndex === 0 ? 0.13 : 0.09);
      if (beatIndex === 1 || beatIndex === 3) {
        addNoiseHit(overdrive, sampleRate, barStart + beatIndex * beat, 0.11, 0.10, overdriveRandom, -0.08);
      }
    }
    if (barIndex % 4 === 3) {
      for (const beatOffset of SIXTEENTH_PICKUPS) {
        addNoiseHit(overdrive, sampleRate, barStart + beatOffset * beat, 0.040, 0.050, overdriveRandom,
          beatOffset < 2 ? -0.35 : 0.35);
      }
    }
  }

  let nebulaLeft = 0;
  let nebulaRight = 0;
  for (let i = 0; i < frames; i++) {
    nebulaLeft = nebulaLeft * 0.997 + (atmosphereRandom() * 2 - 1) * 0.003;
    nebulaRight = nebulaRight * 0.997 + (atmosphereRandom() * 2 - 1) * 0.003;
    const slowPulse = 0.55 + 0.45 * Math.sin(Math.PI * 2 * i / frames * 8);
    atmosphere.left[i] += nebulaLeft * 0.055 * slowPulse;
    atmosphere.right[i] += nebulaRight * 0.055 * slowPulse;
  }

  return {
    atmosphere: normalize(atmosphere, score.normalization.atmosphere),
    drive: normalize(drive, score.normalization.drive),
    overdrive: normalize(overdrive, score.normalization.overdrive),
  };
}

function writeStereoWav(filePath, stem, sampleRate) {
  if (!stem || !stem.left || !stem.right || stem.left.length !== stem.right.length) {
    throw new TypeError('A stereo stem with equal channel lengths is required');
  }
  const frames = stem.left.length;
  const buffer = Buffer.allocUnsafe(44 + frames * 4);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const left = Math.round(Math.max(-1, Math.min(1, stem.left[i])) * 32767);
    const right = Math.round(Math.max(-1, Math.min(1, stem.right[i])) * 32767);
    buffer.writeInt16LE(left, 44 + i * 4);
    buffer.writeInt16LE(right, 46 + i * 4);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

function defaultOutputDirectory(_root, tempRoot = os.tmpdir()) {
  return path.join(tempRoot, 'nebula-cruise-wav-render');
}

function main() {
  const root = path.resolve(__dirname, '..');
  const scorePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'assets/audio/source/nebula-cruise-score.json');
  const outputDirectory = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutputDirectory(root);
  const score = JSON.parse(fs.readFileSync(scorePath, 'utf8'));
  const stems = renderScore(score);
  for (const [name, stem] of Object.entries(stems)) {
    writeStereoWav(path.join(outputDirectory, `${name}.wav`), stem, score.sampleRate);
  }
  process.stdout.write(`${JSON.stringify({ title: score.title, frames: exactFrameCount(score), sampleRate: score.sampleRate, outputDirectory })}\n`);
}

module.exports = {
  exactFrameCount,
  renderScore,
  writeStereoWav,
  defaultOutputDirectory,
  measurePeak,
  measurePulse,
  measureIntenseMixPeak,
};
if (require.main === module) main();

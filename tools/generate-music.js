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
  const length = Math.round(0.24 * sampleRate);
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
  let peak = 0;
  for (let i = 0; i < stem.left.length; i++) {
    peak = Math.max(peak, Math.abs(stem.left[i]), Math.abs(stem.right[i]));
  }
  const scale = peak > 0 ? targetPeak / peak : 1;
  const edgeFrames = Math.min(882, Math.floor(stem.left.length / 2));
  for (let i = 0; i < stem.left.length; i++) {
    const edge = Math.min(1, i / edgeFrames, (stem.left.length - 1 - i) / edgeFrames);
    stem.left[i] *= scale * Math.max(0, edge);
    stem.right[i] *= scale * Math.max(0, edge);
  }
  return stem;
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
        attack: 0.42,
        release: 0.65,
        brightness: 0.12,
        detune: index % 2 === 0 ? -3 : 3,
      });
      addTone(atmosphere, sampleRate, barStart, bar * 1.02, note + 12, 0.013, {
        pan: (1.5 - index) * 0.32,
        attack: 0.55,
        release: 0.72,
        detune: index % 2 === 0 ? 5 : -5,
      });
    });
    if (barIndex % 4 === 1) {
      [71, 76, 79].forEach((note, index) => {
        addTone(atmosphere, sampleRate, barStart + beat * (1.5 + index * 0.55), beat * 0.62, note, 0.026, {
          pan: [-0.32, 0.08, 0.34][index], attack: 0.08, release: 0.25, brightness: 0.1,
        });
      });
    }

    for (let beatIndex = 0; beatIndex < score.beatsPerBar; beatIndex++) {
      const beatStart = barStart + beatIndex * beat;
      if (beatIndex === 0 || beatIndex === 2 || (barIndex % 4 === 3 && beatIndex === 3)) {
        addTone(drive, sampleRate, beatStart, beat * 0.72, 40, 0.19, {
          pan: -0.04, attack: 0.008, release: 0.18, brightness: 0.18,
        });
      }
      addKick(drive, sampleRate, beatStart, beatIndex === 0 ? 0.23 : 0.16);
      if (beatIndex === 1 || beatIndex === 3) addNoiseHit(drive, sampleRate, beatStart, 0.16, 0.13, driveRandom, 0.08);
      addNoiseHit(drive, sampleRate, beatStart + beat / 2, 0.055, 0.055, driveRandom, beatIndex % 2 ? -0.3 : 0.3);
    }

    for (let eighth = 0; eighth < score.beatsPerBar * 2; eighth++) {
      const start = barStart + eighth * beat / 2;
      const arpPattern = [0, 2, 1, 3, 1, 2, 0, 3];
      const note = chord[arpPattern[eighth] % chord.length] + 12;
      addTone(overdrive, sampleRate, start, beat * 0.42, note, 0.10, {
        pan: eighth % 2 ? 0.34 : -0.34, attack: 0.008, release: 0.10, brightness: 0.42,
      });
      addNoiseHit(overdrive, sampleRate, start, 0.035, 0.032, overdriveRandom, eighth % 2 ? 0.38 : -0.38);
    }
    [0, 2.5].forEach((beatOffset, index) => {
      const counterNote = chord[(barIndex + index) % chord.length] + 24;
      addTone(overdrive, sampleRate, barStart + beatOffset * beat, beat * 0.9, counterNote, 0.037, {
        pan: index ? 0.2 : -0.2, attack: 0.035, release: 0.24, brightness: 0.28,
      });
    });
    for (let beatIndex = 0; beatIndex < score.beatsPerBar; beatIndex++) {
      if (beatIndex === 0 || beatIndex === 2) addKick(overdrive, sampleRate, barStart + beatIndex * beat, 0.13);
      if (beatIndex === 1 || beatIndex === 3) {
        addNoiseHit(overdrive, sampleRate, barStart + beatIndex * beat, 0.12, 0.09, overdriveRandom, -0.08);
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
    atmosphere: normalize(atmosphere, 0.76),
    drive: normalize(drive, 0.74),
    overdrive: normalize(overdrive, 0.70),
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

module.exports = { exactFrameCount, renderScore, writeStereoWav, defaultOutputDirectory };
if (require.main === module) main();

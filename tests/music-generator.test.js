'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const score = require('../assets/audio/source/nebula-cruise-score.json');
const {
  exactFrameCount,
  renderScore,
  writeStereoWav,
  defaultOutputDirectory,
  measurePeak,
  measurePulse,
  measureIntenseMixPeak,
} = require('../tools/generate-music.js');

test('Nebula Cruise score locks the 128 BPM rhythm contract', () => {
  assert.deepEqual(score, {
    title: 'Nebula Cruise',
    bpm: 128,
    beatsPerBar: 4,
    bars: 32,
    sampleRate: 44100,
    key: 'E minor',
    progression: ['Em(add9)', 'Cmaj7', 'G', 'D', 'Em', 'C', 'Am7', 'B7'],
    normalization: { atmosphere: 0.68, drive: 0.72, overdrive: 0.66 },
    seed: 1312965196,
  });
  assert.equal(exactFrameCount(score), 2646000);
});

test('the rhythm-forward score renders deterministically with its target peaks and pulse guardrails', () => {
  const first = renderScore(score);
  const second = renderScore(score);
  assert.deepEqual(Object.keys(first), ['atmosphere', 'drive', 'overdrive']);
  for (const stem of Object.keys(first)) {
    assert.equal(first[stem].left.length, 2646000);
    assert.equal(first[stem].right.length, 2646000);
  }
  assert.deepEqual(first.drive.left, second.drive.left);
  assert.equal(measurePeak(first.atmosphere).toFixed(2), '0.68');
  assert.equal(measurePeak(first.drive).toFixed(2), '0.72');
  assert.equal(measurePeak(first.overdrive).toFixed(2), '0.66');
  // The first two seconds compare 35 ms beat-centered windows against equally sized inter-beat windows.
  const pulse = measurePulse(first.drive, score.sampleRate, score.bpm);
  assert.ok(pulse.earlyPulseRatio >= 1.35);
  assert.ok(pulse.transientRms > pulse.sustainedRms);
  assert.ok(measureIntenseMixPeak(first, {
    atmosphere: 0.68, drive: 1, overdrive: 0.78, busGain: 0.55,
  }) <= 0.95);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(first.drive.left.buffer)).digest('hex'),
    crypto.createHash('sha256').update(Buffer.from(second.drive.left.buffer)).digest('hex'));
});

test('WAV output is stereo 16-bit PCM at 44.1 kHz with the exact frame payload', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-cruise-audio-test-'));
  const output = path.join(directory, 'stem.wav');
  const frames = 16;
  try {
    writeStereoWav(output, {
      left: new Float32Array(frames).fill(0.25),
      right: new Float32Array(frames).fill(-0.25),
    }, 44100);
    const wav = fs.readFileSync(output);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), frames * 4);
    assert.equal(wav.length, 44 + frames * 4);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('default rendering uses the OS temporary directory instead of the tracked asset tree', () => {
  const output = defaultOutputDirectory('/workspace/skyroads', '/private/tmp');
  assert.equal(output, '/private/tmp/nebula-cruise-wav-render');
  assert.equal(output.startsWith('/workspace/skyroads/assets/'), false);
});

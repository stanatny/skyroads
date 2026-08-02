'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const score = require('../assets/audio/source/nebula-cruise-score.json');
const { exactFrameCount, renderScore, writeStereoWav, defaultOutputDirectory } = require('../tools/generate-music.js');

test('Nebula Cruise score keeps the approved global composition values', () => {
  assert.deepEqual(score, {
    title: 'Nebula Cruise',
    bpm: 112,
    beatsPerBar: 4,
    bars: 32,
    sampleRate: 44100,
    key: 'E minor',
    progression: ['Em(add9)', 'Cmaj7', 'G', 'D', 'Em', 'C', 'Am7', 'B7'],
    seed: 1312965196,
  });
});

test('all three deterministic stems have the same exact approved frame count', () => {
  assert.equal(exactFrameCount(score), 3024000);
  const first = renderScore(score);
  const second = renderScore(score);
  assert.deepEqual(Object.keys(first), ['atmosphere', 'drive', 'overdrive']);
  for (const stem of Object.keys(first)) {
    assert.equal(first[stem].left.length, 3024000);
    assert.equal(first[stem].right.length, 3024000);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(first[stem].left.buffer)).digest('hex'),
      crypto.createHash('sha256').update(Buffer.from(second[stem].left.buffer)).digest('hex'));
  }
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

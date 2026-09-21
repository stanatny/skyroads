const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../src/cockpit_runtime.js');

function fixture(rendererApi, onFallback) {
  const attributes = {};
  const canvas = { hidden: true };
  const notice = { hidden: true, textContent: '' };
  const events = [];
  const state = { mode: 'PLAYING', width: 1440, height: 900, dpr: 2,
    translator: { locale: 'en' }, ctx: { clearRect: () => events.push('clear') } };
  const documentObject = {
    documentElement: { setAttribute: (key, value) => { attributes[key] = value; } },
    getElementById: (id) => id === 'flight-scene' ? canvas : notice,
  };
  const runtime = create({ state, config: {}, documentObject, rendererApi, onFallback,
    uiApi: { create: () => ({ setAvailable: (value) => events.push(value), update: () => events.push('ui'), dispose() {} }) } });
  return { runtime, state, canvas, notice, events, attributes };
}

test('missing WebGL renderer keeps the playable classic fallback with an explanation', () => {
  const f = fixture(null);
  assert.equal(f.runtime.render(), false);
  assert.equal(f.canvas.hidden, true);
  assert.equal(f.attributes['data-renderer'], 'classic');
  assert.equal(f.notice.hidden, false);
  assert.match(f.notice.textContent, /3D.*unavailable/i);
});

test('renderer failure cannot stop physics or leave an opaque empty cockpit', () => {
  let disposeCount = 0;
  const f = fixture({ create: () => ({ resize() {}, render() { throw new Error('GPU failure'); }, dispose() { disposeCount += 1; } }) });
  assert.equal(f.canvas.hidden, false);
  assert.equal(f.runtime.render(), false);
  assert.equal(f.canvas.hidden, true);
  assert.equal(f.attributes['data-renderer'], 'classic');
  assert.equal(f.runtime.getDiagnostics().error, 'GPU failure');
  assert.equal(disposeCount, 1);
  assert.equal(f.state.mode, 'PLAYING');
});

test('cockpit receives the same state as physics, and context loss restores classic rendering', () => {
  let callbacks;
  let received;
  const sizes = [];
  const f = fixture({ create: (args) => {
    callbacks = args;
    return { resize: (...args) => sizes.push(args), render: (state) => { received = state; }, dispose() {}, getDiagnostics: () => ({ calls: 42 }) };
  } });
  assert.equal(f.runtime.render(), true);
  assert.equal(received, f.state);
  assert.deepEqual(sizes[0], [1440, 900, 2]);
  assert.equal(f.runtime.getDiagnostics().calls, 42);
  callbacks.onFailure(new Error('WebGL context lost'));
  assert.equal(f.runtime.render(), false);
  assert.equal(f.canvas.hidden, true);
});

test('context loss requests a static fallback repaint while a mission is paused', () => {
  let callbacks;
  let repaints = 0;
  const f = fixture({ create: (args) => {
    callbacks = args;
    return { resize() {}, render() {}, dispose() {} };
  } }, () => { repaints += 1; });
  f.state.mode = 'PAUSED';
  callbacks.onFailure(new Error('WebGL context lost'));
  assert.equal(repaints, 1);
  assert.equal(f.state.mode, 'PAUSED');
});

test('sky audio cue disappears with a failed or disposed renderer', () => {
  const cue = { active: true, phase: 0.35 };
  const f = fixture({ create: () => ({ resize() {}, render() {}, dispose() {}, getSkyAudioCue: () => cue }) });
  assert.equal(f.runtime.getSkyAudioCue(), cue);
  f.runtime.dispose();
  assert.equal(f.runtime.getSkyAudioCue(), null);
  const fallback = fixture(null);
  assert.equal(fallback.runtime.getSkyAudioCue(), null);
});

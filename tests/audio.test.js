'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STEM_TRANSITION_SECONDS,
  chooseStemFormat,
  validateStemDurations,
  mixForGameState,
  keepProceduralTimelineCurrent,
  createAudioController,
} = require('../src/audio.js');

const completeFiles = {
  atmosphereOgg: 'atmosphere.ogg', driveOgg: 'drive.ogg', overdriveOgg: 'overdrive.ogg',
  atmosphereMp3: 'atmosphere.mp3', driveMp3: 'drive.mp3', overdriveMp3: 'overdrive.mp3',
};

test('a complete OGG set wins over MP3', () => {
  assert.equal(chooseStemFormat(() => 'probably', completeFiles), 'ogg');
});

test('an incomplete OGG set falls back as a whole to MP3', () => {
  const files = { ...completeFiles, overdriveOgg: null };
  assert.equal(chooseStemFormat((mime) => mime.includes('mpeg') ? 'probably' : 'maybe', files), 'mp3');
});

test('both incomplete sets select procedural fallback', () => {
  assert.equal(chooseStemFormat(() => '', {}), 'procedural');
});

test('decoded stem durations must agree within one millisecond', () => {
  assert.equal(validateStemDurations([{ duration: 68.5710 }, { duration: 68.5715 }, { duration: 68.5719 }], 1), true);
  assert.equal(validateStemDurations([{ duration: 68.571 }, { duration: 68.573 }, { duration: 68.571 }], 1), false);
});

test('invalid decoded stem durations are rejected safely', () => {
  assert.equal(validateStemDurations([], 1), false);
  assert.equal(validateStemDurations([{ duration: 0 }, { duration: 0 }, { duration: 0 }], 1), false);
  assert.equal(validateStemDurations([{ duration: 68.571 }, { duration: Number.NaN }, { duration: 68.571 }], 1), false);
});

test('game over keeps atmosphere and lowers action layers', () => {
  assert.deepEqual(mixForGameState({ mode: 'GAMEOVER', speedRatio: 1, danger: true }), { atmosphere: 1, drive: 0, overdrive: 0 });
});

test('cruise uses atmosphere and drive without overdrive', () => {
  assert.deepEqual(mixForGameState({ mode: 'PLAYING', speedRatio: 0.5 }), { atmosphere: 1, drive: 0.72, overdrive: 0 });
});

test('speed ratio at the three-quarter boundary enables overdrive', () => {
  assert.deepEqual(mixForGameState({ mode: 'PLAYING', speedRatio: 0.75 }), { atmosphere: 1, drive: 0.72, overdrive: 0.82 });
});

test('BOOST and danger each override low speed with overdrive', () => {
  assert.equal(mixForGameState({ mode: 'PLAYING', speedRatio: 0.1, boost: true }).overdrive, 0.82);
  assert.equal(mixForGameState({ mode: 'PLAYING', speedRatio: 0.1, danger: true }).overdrive, 0.82);
});

test('menus and unknown states retain atmosphere only', () => {
  assert.deepEqual(mixForGameState({ mode: 'MENU', speedRatio: 1 }), { atmosphere: 1, drive: 0, overdrive: 0 });
  assert.deepEqual(mixForGameState(), { atmosphere: 1, drive: 0, overdrive: 0 });
});

test('stem changes use a 300 millisecond transition', () => {
  assert.equal(STEM_TRANSITION_SECONDS, 0.3);
});

test('muted procedural music advances its clock instead of accumulating past notes', () => {
  assert.equal(keepProceduralTimelineCurrent({ muted: true, currentTime: 60, nextNoteTime: 0.1 }), 60.1);
  assert.equal(keepProceduralTimelineCurrent({ muted: false, currentTime: 60, nextNoteTime: 60.08 }), 60.08);
});

test('an audible procedural timeline recovers from a long background gap', () => {
  assert.equal(keepProceduralTimelineCurrent({ muted: false, currentTime: 60, nextNoteTime: 0.1 }), 60.1);
});

test('ordinary scheduler lateness is preserved so no regular note is skipped', () => {
  assert.equal(keepProceduralTimelineCurrent({ muted: false, currentTime: 60, nextNoteTime: 59.7 }), 59.7);
});

function makeAudioHarness({ durationByUrl = {}, fetchFailure = null, decodeFailure = null, startFailureAt = 0, connectFailureKind = null, responseFactory = null } = {}) {
  const calls = { fetched: [], starts: [], ramps: [], filterRamps: [], filters: [], nodes: [], resumes: 0, stopAttempts: 0, stops: 0, disconnects: 0, closes: 0 };
  let startAttempts = 0;
  function makeConnection(kind) {
    return {
      kind,
      disconnected: false,
      connect() {
        if (connectFailureKind === kind) throw new Error(`${kind} connect failed`);
      },
      disconnect() {
        this.disconnected = true;
        calls.disconnects++;
      },
    };
  }
  class FakeAudioContext {
    constructor() {
      this.currentTime = 10;
      this.state = 'suspended';
      this.destination = {};
    }
    resume() { calls.resumes++; this.state = 'running'; return Promise.resolve(); }
    close() { calls.closes++; this.state = 'closed'; return Promise.resolve(); }
    createGain() {
      const connection = makeConnection(calls.nodes.some((node) => node.kind === 'bus') ? 'gain' : 'bus');
      const gain = {
        ...connection,
        gain: {
          value: 0,
          cancelScheduledValues() {},
          setValueAtTime(value, time) { calls.ramps.push(['set', value, time]); },
          linearRampToValueAtTime(value, time) { calls.ramps.push(['ramp', value, time]); },
        },
      };
      calls.nodes.push(gain);
      return gain;
    }
    createBiquadFilter() {
      const connection = makeConnection('filter');
      const filter = {
        ...connection,
        type: '',
        frequency: {
          value: 0,
          cancelScheduledValues() {},
          setValueAtTime() {},
          linearRampToValueAtTime(value, time) { calls.filterRamps.push([value, time]); },
        },
      };
      calls.filters.push(filter);
      calls.nodes.push(filter);
      return filter;
    }
    createBufferSource() {
      const connection = makeConnection('source');
      const source = {
        ...connection,
        loop: false,
        started: false,
        start(time) {
          startAttempts++;
          if (startFailureAt === startAttempts) throw new Error('start failed');
          this.started = true;
          calls.starts.push(time);
        },
        stop() {
          calls.stopAttempts++;
          if (!this.started) throw new Error('cannot stop an unstarted source');
          calls.stops++;
          this.started = false;
        },
      };
      calls.nodes.push(source);
      return source;
    }
    decodeAudioData(arrayBuffer) {
      const url = arrayBuffer.url;
      if (decodeFailure && decodeFailure(url)) return Promise.reject(new Error('decode failed'));
      return Promise.resolve({ duration: durationByUrl[url] || 68.571 });
    }
  }
  const fetchImpl = async (url) => {
    calls.fetched.push(url);
    if (fetchFailure && fetchFailure(url)) throw new Error('fetch failed');
    if (responseFactory) return responseFactory(url);
    return {
      ok: true,
      arrayBuffer: async () => ({ url }),
    };
  };
  return { calls, FakeAudioContext, fetchImpl };
}

test('unlock loads one complete format and starts all stems on one timeline', async () => {
  const harness = makeAudioHarness();
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });

  await controller.unlock();
  await controller.ready;

  assert.deepEqual(harness.calls.fetched, ['atmosphere.ogg', 'drive.ogg', 'overdrive.ogg']);
  assert.deepEqual(harness.calls.starts, [10.05, 10.05, 10.05]);
  assert.equal(controller.getState().format, 'ogg');
  assert.equal(controller.getState().decoded, true);
});

test('local-file responses with status zero still decode their complete stem set', async () => {
  const harness = makeAudioHarness({
    responseFactory: (url) => ({
      ok: false,
      status: 0,
      url: `file:///bundle/assets/audio/${url}`,
      arrayBuffer: async () => ({ url }),
    }),
  });
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });

  await controller.unlock();

  assert.equal(controller.getState().status, 'ready');
  assert.equal(controller.getState().format, 'ogg');
  assert.equal(controller.getState().decoded, true);
});

test('a failed OGG load retries the complete MP3 set without mixing formats', async () => {
  const harness = makeAudioHarness({ fetchFailure: (url) => url.endsWith('.ogg') });
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });

  await controller.unlock();
  await controller.ready;

  assert.deepEqual(harness.calls.fetched.slice(-3), ['atmosphere.mp3', 'drive.mp3', 'overdrive.mp3']);
  assert.equal(controller.getState().format, 'mp3');
});

test('decode or duration failure falls back without rejecting game startup', async () => {
  const harness = makeAudioHarness({ decodeFailure: () => true });
  let fallbacks = 0;
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    proceduralFallback() { fallbacks++; },
  });

  await assert.doesNotReject(controller.unlock());
  await assert.doesNotReject(controller.ready);
  assert.equal(fallbacks, 1);
  assert.equal(controller.getState().format, 'procedural');
  assert.equal(controller.getState().decoded, false);
});

test('partial source startup failure stops and disconnects adaptive nodes before one fallback', async () => {
  const harness = makeAudioHarness({ startFailureAt: 2 });
  let fallbacks = 0;
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    proceduralFallback() { fallbacks++; },
  });

  await controller.unlock();

  assert.equal(fallbacks, 1);
  assert.equal(harness.calls.starts.length, 1);
  assert.ok(harness.calls.stops >= 1, 'the already-started source must be stopped');
  assert.ok(harness.calls.disconnects >= 4, 'created sources, gains, and bus must be disconnected');
  assert.equal(harness.calls.closes, 1, 'the failed adaptive context must be closed');
  assert.equal(controller.getState().status, 'fallback');
});

test('every node is cleaned when adaptive graph setup throws during connect', async () => {
  for (const connectFailureKind of ['filter', 'bus', 'gain', 'source']) {
    const harness = makeAudioHarness({ connectFailureKind });
    let fallbacks = 0;
    const controller = createAudioController({
      AudioContextClass: harness.FakeAudioContext,
      fetchImpl: harness.fetchImpl,
      canPlayType: () => 'probably',
      files: completeFiles,
      proceduralFallback() { fallbacks++; },
    });

    await controller.unlock();

    assert.equal(fallbacks, 1, `${connectFailureKind}: fallback must run once`);
    assert.equal(harness.calls.closes, 1, `${connectFailureKind}: failed context must close`);
    assert.equal(harness.calls.starts.length, 0, `${connectFailureKind}: no source may start`);
    assert.equal(harness.calls.nodes.every((node) => node.disconnected), true, `${connectFailureKind}: every created node must disconnect`);
    assert.equal(harness.calls.nodes.some((node) => node.kind === 'source' && node.started), false, `${connectFailureKind}: no source may remain started`);
  }
});

test('game state updates ramp every stem to its mix over exactly 300 milliseconds', async () => {
  const harness = makeAudioHarness();
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });
  await controller.unlock();
  harness.calls.ramps.length = 0;

  controller.setGameState({ mode: 'PLAYING', speedRatio: 0.8 });

  assert.deepEqual(harness.calls.ramps.filter(([kind]) => kind === 'ramp').map(([, value, time]) => [value, time]), [
    [1, 10.3], [0.72, 10.3], [0.82, 10.3],
  ]);
});

test('master low-pass brightens for speed danger and boost over the same 300 milliseconds', async () => {
  const harness = makeAudioHarness();
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });
  await controller.unlock();
  harness.calls.filterRamps.length = 0;

  controller.setGameState({ mode: 'PLAYING', speedRatio: 0.75, danger: false, boost: false });
  controller.setGameState({ mode: 'PLAYING', speedRatio: 0.2, danger: false, boost: false });
  controller.setGameState({ mode: 'PLAYING', speedRatio: 0.2, danger: true, boost: false });
  controller.setGameState({ mode: 'PLAYING', speedRatio: 0.2, danger: false, boost: true });

  assert.equal(harness.calls.filters.length, 1);
  assert.equal(harness.calls.filters[0].type, 'lowpass');
  assert.deepEqual(harness.calls.filterRamps, [
    [14000, 10.3], [4200, 10.3], [14000, 10.3], [14000, 10.3],
  ]);
});

test('mute preferences survive throwing storage and total mute remains observable', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const controller = createAudioController({ storage, AudioContextClass: null, files: completeFiles });

  assert.doesNotThrow(() => controller.setMusicMuted(true));
  assert.doesNotThrow(() => controller.setSfxMuted(true));
  assert.deepEqual(controller.getState(), {
    status: 'locked', format: null, decoded: false,
    musicMuted: true, sfxMuted: true, storageAvailable: false,
    error: null,
  });
});

test('unlock is idempotent and invokes procedural fallback once when Web Audio is unavailable', async () => {
  let fallbacks = 0;
  const controller = createAudioController({
    AudioContextClass: null,
    files: completeFiles,
    proceduralFallback() { fallbacks++; },
  });
  await Promise.all([controller.unlock(), controller.unlock()]);
  assert.equal(fallbacks, 1);
  assert.equal(controller.getState().status, 'fallback');
});

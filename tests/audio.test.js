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

test('adaptive music uses the frozen menu normal and intense state table', () => {
  const cases = [
    [{ mode: 'MENU', speedRatio: 1 }, { atmosphere: 1, drive: 0, overdrive: 0, cutoff: 4200 }],
    [{ mode: 'PLAYING', speedRatio: 0.5 }, { atmosphere: 0.72, drive: 0.92, overdrive: 0.18, cutoff: 8000 }],
    [{ mode: 'PLAYING', speedRatio: 0.75 }, { atmosphere: 0.68, drive: 1, overdrive: 0.78, cutoff: 14000 }],
  ];

  for (const [state, expected] of cases) assert.deepEqual(mixForGameState(state), expected);
  assert.deepEqual(mixForGameState(), { atmosphere: 1, drive: 0, overdrive: 0, cutoff: 4200 });
});

test('BOOST and danger each select the intense mix at low speed', () => {
  assert.deepEqual(mixForGameState({ mode: 'PLAYING', speedRatio: 0.1, boost: true }), { atmosphere: 0.68, drive: 1, overdrive: 0.78, cutoff: 14000 });
  assert.deepEqual(mixForGameState({ mode: 'PLAYING', speedRatio: 0.1, danger: true }), { atmosphere: 0.68, drive: 1, overdrive: 0.78, cutoff: 14000 });
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

function makeAudioHarness({ durationByUrl = {}, fetchFailure = null, decodeFailure = null, decodePending = false, resumePending = false, closePending = false, startFailureAt = 0, connectFailureKind = null, responseFactory = null } = {}) {
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
    resume() { calls.resumes++; this.state = 'running'; return resumePending ? new Promise(() => {}) : Promise.resolve(); }
    close() { calls.closes++; this.state = 'closed'; return closePending ? new Promise(() => {}) : Promise.resolve(); }
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
      if (decodePending) return new Promise(() => {});
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

function makeManualTimers() {
  const pending = [];
  return {
    setTimeout(callback) {
      const timer = { callback, cleared: false };
      pending.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
    count() {
      return pending.filter((timer) => !timer.cleared).length;
    },
    fireNext() {
      const timer = pending.find((candidate) => !candidate.cleared);
      assert.ok(timer, 'expected an active format-load timeout');
      timer.cleared = true;
      timer.callback();
    },
  };
}

async function settleUntil(predicate, message) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

test('a pending format fetch reaches terminal fallback and aborts its requests at the configured deadline', async () => {
  const timers = makeManualTimers();
  let aborts = 0;
  let fetches = 0;
  const controller = createAudioController({
    AudioContextClass: makeAudioHarness().FakeAudioContext,
    fetchImpl: (_url, { signal }) => new Promise(() => {
      fetches++;
      signal.addEventListener('abort', () => { aborts++; });
    }),
    canPlayType: () => 'probably',
    files: completeFiles,
    formatLoadTimeoutMs: 100,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  });

  const unlock = controller.unlock();
  await settleUntil(() => fetches === 3 && timers.count() === 1, 'format loading should receive one deadline');
  timers.fireNext();
  await settleUntil(() => fetches === 6 && timers.count() === 1, 'MP3 retry should receive its own deadline');
  timers.fireNext();
  await assert.doesNotReject(unlock);
  await assert.doesNotReject(controller.ready);

  assert.equal(aborts, 6);
  assert.equal(controller.getState().status, 'fallback');
  assert.equal(controller.getState().format, 'procedural');
});

test('a fast format failure aborts sibling requests before retrying MP3', async () => {
  const harness = makeAudioHarness();
  let siblingAborts = 0;
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: (url, { signal }) => {
      harness.calls.fetched.push(url);
      if (url === 'atmosphere.ogg') return Promise.reject(new Error('OGG unavailable'));
      if (url.endsWith('.ogg')) {
        return new Promise(() => signal.addEventListener('abort', () => { siblingAborts++; }));
      }
      return Promise.resolve({ ok: true, url, arrayBuffer: async () => ({ url }) });
    },
    canPlayType: () => 'probably',
    files: completeFiles,
  });

  await controller.unlock();

  assert.equal(siblingAborts, 2);
  assert.equal(controller.getState().format, 'mp3');
});

test('a pending context resume reaches terminal fallback at the configured deadline', async () => {
  const timers = makeManualTimers();
  const harness = makeAudioHarness({ resumePending: true });
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    formatLoadTimeoutMs: 100,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  });

  const unlock = controller.unlock();
  await settleUntil(() => timers.count() === 1, 'context resume should receive a deadline');
  timers.fireNext();
  await unlock;

  assert.equal(controller.getState().status, 'fallback');
  assert.equal(harness.calls.closes, 1);
});

test('a pending context close cannot prevent fallback from resolving unlock or ready', async () => {
  const harness = makeAudioHarness({
    closePending: true,
    responseFactory: (url) => ({ ok: false, status: 500, url, arrayBuffer: async () => ({ url }) }),
  });
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });

  await controller.unlock();
  await controller.ready;

  assert.equal(controller.getState().status, 'fallback');
  assert.equal(harness.calls.closes, 1);
});

test('a pending format body read reaches terminal fallback at the configured deadline', async () => {
  const timers = makeManualTimers();
  const harness = makeAudioHarness({
    responseFactory: (url) => ({ ok: true, arrayBuffer: () => new Promise(() => {}), url }),
  });
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    formatLoadTimeoutMs: 100,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  });

  const unlock = controller.unlock();
  await settleUntil(() => harness.calls.fetched.length === 3 && timers.count() === 1, 'body reading should share the format deadline');
  timers.fireNext();
  await settleUntil(() => harness.calls.fetched.length === 6 && timers.count() === 1, 'MP3 body reading should receive its own deadline');
  timers.fireNext();
  await unlock;

  assert.equal(controller.getState().status, 'fallback');
  assert.equal(harness.calls.closes, 1);
});

test('a pending format decode reaches terminal fallback at the configured deadline', async () => {
  const timers = makeManualTimers();
  const harness = makeAudioHarness({ decodePending: true });
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    formatLoadTimeoutMs: 100,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  });

  const unlock = controller.unlock();
  await settleUntil(() => harness.calls.fetched.length === 3 && timers.count() === 1, 'decode should share the format deadline');
  timers.fireNext();
  await settleUntil(() => harness.calls.fetched.length === 6 && timers.count() === 1, 'MP3 decode should receive its own deadline');
  timers.fireNext();
  await unlock;

  assert.equal(controller.getState().status, 'fallback');
  assert.equal(harness.calls.closes, 1);
});

test('a late OGG completion cannot attach after its deadline has selected MP3', async () => {
  const timers = makeManualTimers();
  const harness = makeAudioHarness();
  const delayedOgg = [];
  let oggBodyReads = 0;
  const fetchImpl = (url) => {
    harness.calls.fetched.push(url);
    if (url.endsWith('.ogg')) {
      return new Promise((resolve) => delayedOgg.push(() => resolve({
        ok: true,
        url,
        arrayBuffer: async () => { oggBodyReads++; return { url }; },
      })));
    }
    return Promise.resolve({ ok: true, url, arrayBuffer: async () => ({ url }) });
  };
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    formatLoadTimeoutMs: 100,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  });

  const unlock = controller.unlock();
  await settleUntil(() => harness.calls.fetched.length === 3 && timers.count() === 1, 'OGG should receive its own deadline');
  timers.fireNext();
  await unlock;
  delayedOgg.forEach((resolve) => resolve());
  await settleUntil(() => controller.getState().status === 'ready', 'MP3 should become ready after OGG times out');

  assert.equal(controller.getState().format, 'mp3');
  assert.equal(harness.calls.starts.length, 3);
  assert.equal(oggBodyReads, 0);
});

test('a late OGG completion cannot revive adaptive audio after MP3 reaches fallback cleanup', async () => {
  const timers = makeManualTimers();
  const harness = makeAudioHarness();
  const delayedOgg = [];
  let oggBodyReads = 0;
  const fetchImpl = (url) => {
    harness.calls.fetched.push(url);
    if (url.endsWith('.ogg')) {
      return new Promise((resolve) => delayedOgg.push(() => resolve({
        ok: true,
        url,
        arrayBuffer: async () => { oggBodyReads++; return { url }; },
      })));
    }
    return Promise.reject(new Error('MP3 unavailable'));
  };
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
    formatLoadTimeoutMs: 100,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  });

  const unlock = controller.unlock();
  await settleUntil(() => harness.calls.fetched.length === 3 && timers.count() === 1, 'OGG should receive its own deadline');
  timers.fireNext();
  await unlock;
  delayedOgg.forEach((resolve) => resolve());
  await settleUntil(() => controller.getState().status === 'fallback', 'failed MP3 should reach fallback');

  assert.equal(controller.getState().format, 'procedural');
  assert.equal(harness.calls.starts.length, 0);
  assert.equal(oggBodyReads, 0);
  assert.equal(harness.calls.closes, 1);
});

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

test('responses without an exact boolean success flag fall back instead of decoding', async () => {
  for (const scenario of [
    { label: 'absent', fields: {} },
    { label: 'null', fields: { ok: null } },
    { label: 'numeric', fields: { ok: 1 } },
    { label: 'string', fields: { ok: 'true' } },
  ]) {
    const harness = makeAudioHarness({
      responseFactory: (url) => ({
        ...scenario.fields,
        status: 200,
        url: `https://example.test/${url}`,
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

    assert.equal(controller.getState().status, 'fallback', scenario.label);
    assert.equal(controller.getState().decoded, false, scenario.label);
  }
});

test('HTTP 500 and non-file status-zero responses are rejected', async () => {
  for (const response of [
    { ok: false, status: 500, url: 'https://example.test/stem.ogg' },
    { ok: false, status: 0, url: 'https://example.test/stem.ogg' },
  ]) {
    const harness = makeAudioHarness({
      responseFactory: (url) => ({ ...response, arrayBuffer: async () => ({ url }) }),
    });
    const controller = createAudioController({
      AudioContextClass: harness.FakeAudioContext,
      fetchImpl: harness.fetchImpl,
      canPlayType: () => 'probably',
      files: completeFiles,
    });

    await controller.unlock();

    assert.equal(controller.getState().status, 'fallback', response.url);
    assert.equal(controller.getState().format, 'procedural', response.url);
  }
});

test('a rejected local-file body read reaches one terminal fallback', async () => {
  let fallbacks = 0;
  const harness = makeAudioHarness({
    responseFactory: () => ({
      ok: false,
      status: 0,
      url: 'file:///bundle/assets/audio/stem.ogg',
      arrayBuffer: async () => { throw new Error('local body read failed'); },
    }),
  });
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
  assert.equal(controller.getState().status, 'fallback');
  assert.equal(controller.getState().format, 'procedural');
  assert.equal(controller.getState().decoded, false);
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
    [0.68, 10.3], [1, 10.3], [0.78, 10.3],
  ]);
});

test('adaptive graph starts its music bus at the shared 0.55 gain', async () => {
  const harness = makeAudioHarness();
  const controller = createAudioController({
    AudioContextClass: harness.FakeAudioContext,
    fetchImpl: harness.fetchImpl,
    canPlayType: () => 'probably',
    files: completeFiles,
  });

  await controller.unlock();

  assert.equal(harness.calls.nodes.find((node) => node.kind === 'bus').gain.value, 0.55);
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
    [14000, 10.3], [8000, 10.3], [14000, 10.3], [14000, 10.3],
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

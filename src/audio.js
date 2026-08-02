(function (root, factory) {
  'use strict';
  const api = factory();
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.audio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STEM_TRANSITION_SECONDS = 0.3;
  const STORAGE_KEYS = Object.freeze({
    musicMuted: 'nebula-cruise.audio.music-muted',
    sfxMuted: 'nebula-cruise.audio.sfx-muted',
  });
  const DEFAULT_FILES = Object.freeze({
    atmosphereOgg: './assets/audio/nebula-cruise-atmosphere.ogg',
    driveOgg: './assets/audio/nebula-cruise-drive.ogg',
    overdriveOgg: './assets/audio/nebula-cruise-overdrive.ogg',
    atmosphereMp3: './assets/audio/nebula-cruise-atmosphere.mp3',
    driveMp3: './assets/audio/nebula-cruise-drive.mp3',
    overdriveMp3: './assets/audio/nebula-cruise-overdrive.mp3',
  });
  const STEM_NAMES = Object.freeze(['atmosphere', 'drive', 'overdrive']);

  function completeSet(files, format) {
    const suffix = format === 'ogg' ? 'Ogg' : 'Mp3';
    return STEM_NAMES.every((stem) => typeof files[`${stem}${suffix}`] === 'string' && files[`${stem}${suffix}`].length > 0);
  }

  function playable(canPlayType, mime) {
    try { return Boolean(canPlayType(mime)); } catch (_) { return false; }
  }

  function chooseStemFormat(canPlayType, files = DEFAULT_FILES) {
    const probe = typeof canPlayType === 'function' ? canPlayType : () => '';
    if (completeSet(files, 'ogg') && playable(probe, 'audio/ogg; codecs="vorbis"')) return 'ogg';
    if (completeSet(files, 'mp3') && playable(probe, 'audio/mpeg')) return 'mp3';
    return 'procedural';
  }

  function validateStemDurations(buffers, toleranceMs = 1) {
    if (!Array.isArray(buffers) || buffers.length !== 3) return false;
    const durations = buffers.map((buffer) => Number(buffer && buffer.duration));
    if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) return false;
    const toleranceSeconds = Math.max(0, Number(toleranceMs) || 0) / 1000;
    return Math.max(...durations) - Math.min(...durations) <= toleranceSeconds + Number.EPSILON;
  }

  function mixForGameState(state = {}) {
    if (state.mode !== 'PLAYING') return { atmosphere: 1, drive: 0, overdrive: 0 };
    const speedRatio = Number.isFinite(Number(state.speedRatio)) ? Number(state.speedRatio) : 0;
    const intense = speedRatio >= 0.75 || Boolean(state.boost) || Boolean(state.danger);
    return { atmosphere: 1, drive: 0.72, overdrive: intense ? 0.82 : 0 };
  }

  function keepProceduralTimelineCurrent({ muted = false, currentTime = 0, nextNoteTime = 0 } = {}) {
    const now = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0;
    const next = Number.isFinite(Number(nextNoteTime)) ? Number(nextNoteTime) : now + 0.1;
    // A normal 40 ms scheduler may be slightly late; only discard deadlines
    // more than 500 ms behind after a muted/backgrounded tab resumes.
    return muted || now - next > 0.5 ? now + 0.1 : next;
  }

  function readPreference(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return { value: false, available: false };
    try { return { value: storage.getItem(key) === 'true', available: true }; } catch (_) {
      return { value: false, available: false };
    }
  }

  function writePreference(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try { storage.setItem(key, String(Boolean(value))); return true; } catch (_) { return false; }
  }

  function urlsForFormat(files, format) {
    const suffix = format === 'ogg' ? 'Ogg' : 'Mp3';
    return STEM_NAMES.map((stem) => files[`${stem}${suffix}`]);
  }

  function createAudioController({
    AudioContextClass = null,
    fetchImpl = null,
    storage = null,
    proceduralFallback = null,
    canPlayType = null,
    files = DEFAULT_FILES,
  } = {}) {
    const savedMusic = readPreference(storage, STORAGE_KEYS.musicMuted);
    const savedSfx = readPreference(storage, STORAGE_KEYS.sfxMuted);
    const state = {
      status: 'locked',
      format: null,
      decoded: false,
      musicMuted: savedMusic.value,
      sfxMuted: savedSfx.value,
      storageAvailable: savedMusic.available && savedSfx.available,
      error: null,
    };
    let context = null;
    let gains = null;
    let masterFilter = null;
    let adaptiveNodes = [];
    let adaptiveSources = [];
    let fallbackActivated = false;
    let gameState = { mode: 'MENU', speedRatio: 0, danger: false, boost: false };
    let unlockPromise = null;
    let resolveReady;
    const ready = new Promise((resolve) => { resolveReady = resolve; });

    function snapshot() { return Object.freeze({ ...state }); }

    function rampMix() {
      if (!context || !gains) return;
      const mix = mixForGameState(gameState);
      const now = context.currentTime;
      for (const stem of STEM_NAMES) {
        const parameter = gains[stem].gain;
        const target = state.musicMuted ? 0 : mix[stem];
        try {
          parameter.cancelScheduledValues(now);
          parameter.setValueAtTime(Number(parameter.value) || 0, now);
          parameter.linearRampToValueAtTime(target, now + STEM_TRANSITION_SECONDS);
        } catch (_) {
          try { parameter.value = target; } catch (_) {}
        }
      }
      if (masterFilter && masterFilter.frequency) {
        const speedRatio = Number(gameState.speedRatio) || 0;
        const bright = gameState.mode === 'PLAYING'
          && (speedRatio >= 0.75 || Boolean(gameState.danger) || Boolean(gameState.boost));
        const cutoff = bright ? 14000 : 4200;
        const parameter = masterFilter.frequency;
        try {
          parameter.cancelScheduledValues(now);
          parameter.setValueAtTime(Number(parameter.value) || 4200, now);
          parameter.linearRampToValueAtTime(cutoff, now + STEM_TRANSITION_SECONDS);
        } catch (_) {
          try { parameter.value = cutoff; } catch (_) {}
        }
      }
    }

    async function cleanupAdaptiveGraph() {
      for (const source of adaptiveSources) {
        try { source.stop(); } catch (_) {}
      }
      for (const node of adaptiveNodes) {
        try { if (node && typeof node.disconnect === 'function') node.disconnect(); } catch (_) {}
      }
      adaptiveSources = [];
      adaptiveNodes = [];
      gains = null;
      masterFilter = null;
      if (context) {
        const failedContext = context;
        context = null;
        try {
          if (typeof failedContext.close === 'function') await failedContext.close();
          else if (typeof failedContext.suspend === 'function') await failedContext.suspend();
        } catch (_) {
          try { if (typeof failedContext.suspend === 'function') await failedContext.suspend(); } catch (_) {}
        }
      }
    }

    async function activateFallback(error) {
      await cleanupAdaptiveGraph();
      state.status = 'fallback';
      state.format = 'procedural';
      state.decoded = false;
      state.error = error ? String(error.message || error) : null;
      if (fallbackActivated) return;
      fallbackActivated = true;
      try { if (typeof proceduralFallback === 'function') proceduralFallback(); } catch (_) {}
    }

    async function loadSet(format) {
      const urls = urlsForFormat(files, format);
      const responses = await Promise.all(urls.map((url) => fetchImpl(url)));
      if (responses.some((response) => !response || response.ok === false || typeof response.arrayBuffer !== 'function')) {
        throw new Error(`${format} stem response failed`);
      }
      const encoded = await Promise.all(responses.map((response) => response.arrayBuffer()));
      const buffers = await Promise.all(encoded.map((data) => context.decodeAudioData(data)));
      if (!validateStemDurations(buffers, 1)) throw new Error(`${format} stem durations disagree`);
      return buffers;
    }

    async function unlock() {
      if (unlockPromise) return unlockPromise;
      unlockPromise = (async () => {
        state.status = 'loading';
        try {
          if (typeof AudioContextClass !== 'function' || typeof fetchImpl !== 'function') {
            await activateFallback(new Error('Web Audio unavailable'));
            return snapshot();
          }
          context = new AudioContextClass();
          if (context.state === 'suspended' && typeof context.resume === 'function') await context.resume();

          const preferred = chooseStemFormat(canPlayType, files);
          const formats = preferred === 'ogg' ? ['ogg', 'mp3'] : preferred === 'mp3' ? ['mp3'] : [];
          let buffers = null;
          let lastError = null;
          for (const format of formats) {
            if (!completeSet(files, format)) continue;
            if (format === 'ogg' && !playable(canPlayType, 'audio/ogg; codecs="vorbis"')) continue;
            if (format === 'mp3' && !playable(canPlayType, 'audio/mpeg')) continue;
            try {
              buffers = await loadSet(format);
              state.format = format;
              break;
            } catch (error) { lastError = error; }
          }
          if (!buffers) {
            await activateFallback(lastError || new Error('No complete playable stem set'));
            return snapshot();
          }

          gains = {};
          masterFilter = context.createBiquadFilter();
          adaptiveNodes.push(masterFilter);
          masterFilter.type = 'lowpass';
          const initialSpeedRatio = Number(gameState.speedRatio) || 0;
          masterFilter.frequency.value = gameState.mode === 'PLAYING'
            && (initialSpeedRatio >= 0.75 || Boolean(gameState.danger) || Boolean(gameState.boost))
            ? 14000 : 4200;
          masterFilter.connect(context.destination);
          const musicBus = context.createGain();
          adaptiveNodes.push(musicBus);
          musicBus.gain.value = 0.72;
          musicBus.connect(masterFilter);
          const startTime = context.currentTime + 0.05;
          const initialMix = mixForGameState(gameState);
          buffers.forEach((buffer, index) => {
            const stem = STEM_NAMES[index];
            const gain = context.createGain();
            adaptiveNodes.push(gain);
            gain.gain.value = state.musicMuted ? 0 : initialMix[stem];
            gain.connect(musicBus);
            const source = context.createBufferSource();
            adaptiveSources.push(source);
            adaptiveNodes.push(source);
            source.buffer = buffer;
            source.loop = true;
            source.connect(gain);
            gains[stem] = gain;
          });
          adaptiveSources.forEach((source) => source.start(startTime));
          state.status = 'ready';
          state.decoded = true;
          state.error = null;
          return snapshot();
        } catch (error) {
          await activateFallback(error);
          return snapshot();
        }
      })();
      unlockPromise.then(resolveReady, () => resolveReady(snapshot()));
      return unlockPromise;
    }

    function setGameState(nextState = {}) {
      gameState = { ...gameState, ...nextState };
      rampMix();
    }

    function setMusicMuted(value) {
      state.musicMuted = Boolean(value);
      state.storageAvailable = writePreference(storage, STORAGE_KEYS.musicMuted, state.musicMuted) && state.storageAvailable;
      rampMix();
      return state.musicMuted;
    }

    function setSfxMuted(value) {
      state.sfxMuted = Boolean(value);
      state.storageAvailable = writePreference(storage, STORAGE_KEYS.sfxMuted, state.sfxMuted) && state.storageAvailable;
      return state.sfxMuted;
    }

    return Object.freeze({ unlock, setGameState, setMusicMuted, setSfxMuted, getState: snapshot, ready });
  }

  return Object.freeze({
    STEM_TRANSITION_SECONDS,
    DEFAULT_FILES,
    chooseStemFormat,
    validateStemDurations,
    mixForGameState,
    keepProceduralTimelineCurrent,
    createAudioController,
  });
}));

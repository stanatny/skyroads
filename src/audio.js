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
    }

    function activateFallback(error) {
      state.status = 'fallback';
      state.format = 'procedural';
      state.decoded = false;
      state.error = error ? String(error.message || error) : null;
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
            activateFallback(new Error('Web Audio unavailable'));
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
            activateFallback(lastError || new Error('No complete playable stem set'));
            return snapshot();
          }

          gains = {};
          const musicBus = context.createGain();
          musicBus.gain.value = 0.72;
          musicBus.connect(context.destination);
          const startTime = context.currentTime + 0.05;
          const initialMix = mixForGameState(gameState);
          buffers.forEach((buffer, index) => {
            const stem = STEM_NAMES[index];
            const gain = context.createGain();
            gain.gain.value = state.musicMuted ? 0 : initialMix[stem];
            gain.connect(musicBus);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(gain);
            source.start(startTime);
            gains[stem] = gain;
          });
          state.status = 'ready';
          state.decoded = true;
          state.error = null;
          return snapshot();
        } catch (error) {
          activateFallback(error);
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
    createAudioController,
  });
}));

'use strict';

(function attachLeaderboard(root) {
  const DEFAULT_NAMES = Object.freeze(['Nova','Orion','Vega','Luna','Atlas','Echo','Comet','Cosmo','Lyra','Zenith']);
  const STORAGE_KEYS = Object.freeze({
    active: 'skyroads_leaderboard_v1',
    backup: 'skyroads_leaderboard_v1_backup',
    legacy: 'skyroads_best',
  });
  const MAX_ENTRIES = 15;
  const MAX_NAME_CHARACTERS = 16;
  const MAX_ID_CHARACTERS = 128;
  const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

  function isFiniteNonnegative(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function calculateScore({ distanceMeters, enemyKills, enemyKillBonus = 20 } = {}) {
    if (!isFiniteNonnegative(distanceMeters)
      || !isFiniteNonnegative(enemyKills)
      || !isFiniteNonnegative(enemyKillBonus)) return 0;
    return Math.floor(distanceMeters) + Math.floor(enemyKills) * enemyKillBonus;
  }

  function isRegionalIndicator(codePoint) {
    return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
  }

  function isGraphemeExtension(codePoint) {
    return (codePoint >= 0x0300 && codePoint <= 0x036f)
      || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
      || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
      || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
      || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
      || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
      || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
      || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
      || (codePoint >= 0xe0020 && codePoint <= 0xe007f);
  }

  function fallbackSegmentGraphemes(value) {
    const codePoints = Array.from(value);
    const clusters = [];
    for (let index = 0; index < codePoints.length;) {
      if (codePoints[index] === '\u200d') {
        index += 1;
        continue;
      }

      let cluster = codePoints[index];
      const firstCodePoint = cluster.codePointAt(0);
      index += 1;

      if (cluster === '\r' && codePoints[index] === '\n') {
        cluster += codePoints[index];
        index += 1;
      } else if (isRegionalIndicator(firstCodePoint)
        && index < codePoints.length
        && isRegionalIndicator(codePoints[index].codePointAt(0))) {
        cluster += codePoints[index];
        index += 1;
      }

      while (index < codePoints.length && isGraphemeExtension(codePoints[index].codePointAt(0))) {
        cluster += codePoints[index];
        index += 1;
      }

      while (codePoints[index] === '\u200d') {
        if (index + 1 >= codePoints.length) {
          index += 1;
          break;
        }
        cluster += codePoints[index] + codePoints[index + 1];
        index += 2;
        while (index < codePoints.length && isGraphemeExtension(codePoints[index].codePointAt(0))) {
          cluster += codePoints[index];
          index += 1;
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  function segmentGraphemes(value) {
    try {
      if (root.Intl && typeof root.Intl.Segmenter === 'function') {
        const segmenter = new root.Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(segmenter.segment(value), (part) => part.segment);
      }
    } catch (_) {
      // Older WebViews and partial Intl implementations use the safe fallback.
    }
    return fallbackSegmentGraphemes(value);
  }

  function sanitizeCharacters(value, limit) {
    return segmentGraphemes(String(value == null ? '' : value).replace(CONTROL_CHARACTERS, '').trim())
      .slice(0, limit)
      .join('');
  }

  function normalizeName(value, fallbackName = DEFAULT_NAMES[0]) {
    const normalized = sanitizeCharacters(value, MAX_NAME_CHARACTERS);
    if (normalized) return normalized;
    return sanitizeCharacters(fallbackName, MAX_NAME_CHARACTERS) || DEFAULT_NAMES[0];
  }

  function generateDefaultName({ random = Math.random } = {}) {
    let sample;
    try {
      sample = Number(random());
    } catch (_) {
      sample = 0;
    }
    if (!Number.isFinite(sample)) sample = 0;
    const bounded = Math.max(0, Math.min(0.9999999999999999, sample));
    return DEFAULT_NAMES[Math.floor(bounded * DEFAULT_NAMES.length)];
  }

  function compareCodeUnits(a, b) {
    const left = String(a);
    const right = String(b);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function compareEntries(a, b) {
    return (b.score - a.score)
      || (b.distanceMeters - a.distanceMeters)
      || (a.elapsedMs - b.elapsedMs)
      || compareCodeUnits(a.createdAt, b.createdAt)
      || compareCodeUnits(a.id, b.id);
  }

  function sortEntries(entries) {
    return Array.isArray(entries) ? entries.slice().sort(compareEntries) : [];
  }

  function sanitizeId(value) {
    if (typeof value !== 'string') return null;
    const id = sanitizeCharacters(value, MAX_ID_CHARACTERS);
    return id || null;
  }

  function sanitizeIsoDate(value) {
    if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : value;
  }

  function validateEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = sanitizeId(value.id);
    const playerId = sanitizeId(value.playerId);
    const rawName = typeof value.name === 'string' ? value.name : '';
    const name = normalizeName(rawName, '');
    const createdAt = sanitizeIsoDate(value.createdAt);
    if (!id || !playerId || !sanitizeCharacters(rawName, MAX_NAME_CHARACTERS) || !createdAt) return null;
    if (!Number.isInteger(value.score) || !isFiniteNonnegative(value.score)
      || !isFiniteNonnegative(value.distanceMeters)
      || !isFiniteNonnegative(value.elapsedMs)) return null;
    return {
      id,
      playerId,
      name,
      score: value.score,
      distanceMeters: value.distanceMeters,
      elapsedMs: value.elapsedMs,
      createdAt,
    };
  }

  function validateDocument(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
    if (!value.profile || typeof value.profile !== 'object' || Array.isArray(value.profile)) return null;
    const playerId = sanitizeId(value.profile.playerId);
    const rawName = typeof value.profile.name === 'string' ? value.profile.name : '';
    const name = normalizeName(rawName, '');
    if (!playerId || !sanitizeCharacters(rawName, MAX_NAME_CHARACTERS) || !Array.isArray(value.entries)) return null;

    const seenIds = new Set();
    const entries = [];
    for (const candidate of value.entries) {
      const entry = validateEntry(candidate);
      if (!entry || seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      entries.push(entry);
    }

    const document = {
      version: 1,
      profile: { playerId, name },
      entries: sortEntries(entries).slice(0, MAX_ENTRIES),
    };
    if (isFiniteNonnegative(value.legacyBest)) document.legacyBest = value.legacyBest;
    return document;
  }

  function renameProfile(document, rawName) {
    const valid = validateDocument(document);
    if (!valid) return null;
    const name = normalizeName(rawName, valid.profile.name);
    const playerId = valid.profile.playerId;
    return {
      ...valid,
      profile: { playerId, name },
      entries: valid.entries.map((entry) => entry.playerId === playerId ? { ...entry, name } : entry),
    };
  }

  function createLeaderboard({
    storage,
    cryptoObject = root.crypto,
    now = () => new Date(),
    random = Math.random,
    keys = STORAGE_KEYS,
  } = {}) {
    let currentDocument = null;
    let initialized = false;
    let persistenceAvailable = Boolean(storage);
    let fallbackIdCounter = 0;
    const finalizedRuns = new Map();

    function snapshot() {
      const valid = validateDocument(currentDocument);
      if (!valid) return null;
      return {
        version: valid.version,
        profile: { ...valid.profile },
        entries: valid.entries.map((entry) => ({ ...entry })),
        legacyBest: Object.hasOwn(valid, 'legacyBest') ? valid.legacyBest : null,
        persistenceAvailable,
        persistenceWarning: !persistenceAvailable,
      };
    }

    function getNow() {
      let value;
      try {
        value = now();
      } catch (_) {
        value = new Date();
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    function createId() {
      try {
        if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
          const generated = sanitizeId(cryptoObject.randomUUID());
          if (generated) return generated;
        }
      } catch (_) {
        // Fall through to a local identifier. IDs are not security credentials.
      }
      let sample;
      try {
        sample = Number(random());
      } catch (_) {
        sample = 0;
      }
      if (!Number.isFinite(sample)) sample = 0;
      fallbackIdCounter += 1;
      return `local-${getNow().getTime().toString(36)}-${Math.abs(sample).toString(36).slice(2, 12)}-${fallbackIdCounter.toString(36)}`;
    }

    function readDocument(key) {
      if (!persistenceAvailable) return null;
      try {
        const raw = storage.getItem(key);
        if (raw == null) return null;
        return validateDocument(JSON.parse(raw));
      } catch (error) {
        if (error instanceof SyntaxError) return null;
        persistenceAvailable = false;
        return null;
      }
    }

    function restoreActive(backupDocument) {
      if (!storage || !backupDocument) return;
      try {
        storage.setItem(keys.active, JSON.stringify(backupDocument));
      } catch (_) {
        // The validated next document remains available in memory.
      }
    }

    function persistNext(nextDocument, previousDocument, { initial = false } = {}) {
      const next = validateDocument(nextDocument);
      const previous = validateDocument(previousDocument);
      if (!next) return false;
      currentDocument = next;
      if (!persistenceAvailable) return false;

      const serializedNext = JSON.stringify(next);
      try {
        if (!initial && previous) storage.setItem(keys.backup, JSON.stringify(previous));
        storage.setItem(keys.active, serializedNext);
        const rawReadback = storage.getItem(keys.active);
        const verified = validateDocument(JSON.parse(rawReadback));
        if (!verified || JSON.stringify(verified) !== serializedNext) throw new Error('Leaderboard write verification failed');
        currentDocument = verified;
        return true;
      } catch (_) {
        restoreActive(previous);
        currentDocument = next;
        persistenceAvailable = false;
        return false;
      }
    }

    function promoteBackup(backupDocument) {
      if (!persistenceAvailable) return false;
      const serialized = JSON.stringify(backupDocument);
      try {
        storage.setItem(keys.active, serialized);
        const promoted = validateDocument(JSON.parse(storage.getItem(keys.active)));
        if (!promoted || JSON.stringify(promoted) !== serialized) throw new Error('Backup promotion verification failed');
        currentDocument = promoted;
        return true;
      } catch (_) {
        currentDocument = backupDocument;
        persistenceAvailable = false;
        return false;
      }
    }

    function readLegacyBest() {
      if (!persistenceAvailable) return null;
      try {
        const raw = storage.getItem(keys.legacy);
        if (raw == null || String(raw).trim() === '') return null;
        const value = Number(raw);
        return isFiniteNonnegative(value) ? value : null;
      } catch (_) {
        persistenceAvailable = false;
        return null;
      }
    }

    function removeLegacyBest() {
      if (!persistenceAvailable) return false;
      try {
        storage.removeItem(keys.legacy);
        return true;
      } catch (_) {
        persistenceAvailable = false;
        return false;
      }
    }

    function ensureInitialized() {
      if (!initialized) initialize();
    }

    function initialize() {
      if (initialized) return snapshot();
      initialized = true;

      const active = readDocument(keys.active);
      if (active) {
        currentDocument = active;
      } else {
        const backup = readDocument(keys.backup);
        if (backup) {
          currentDocument = backup;
          promoteBackup(backup);
        }
      }

      const legacyBest = readLegacyBest();
      if (!currentDocument) {
        currentDocument = {
          version: 1,
          profile: { playerId: createId(), name: generateDefaultName({ random }) },
          entries: [],
        };
        if (legacyBest != null) currentDocument.legacyBest = legacyBest;
        const persisted = persistNext(currentDocument, null, { initial: true });
        if (legacyBest != null && persisted) removeLegacyBest();
        return snapshot();
      }

      if (legacyBest != null && !Object.hasOwn(currentDocument, 'legacyBest')) {
        const previous = currentDocument;
        const next = { ...previous, legacyBest };
        if (persistNext(next, previous)) removeLegacyBest();
      } else if (legacyBest != null && Object.hasOwn(currentDocument, 'legacyBest')) {
        removeLegacyBest();
      }
      return snapshot();
    }

    function getSnapshot() {
      ensureInitialized();
      return snapshot();
    }

    function createRunId() {
      return createId();
    }

    function finalizeRun({ id, distanceMeters, enemyKills, elapsedMs } = {}) {
      ensureInitialized();
      const runId = sanitizeId(id);
      if (!runId) throw new TypeError('A valid run ID is required');
      if (finalizedRuns.has(runId)) return finalizedRuns.get(runId);
      if (!isFiniteNonnegative(distanceMeters)
        || !isFiniteNonnegative(enemyKills)
        || !isFiniteNonnegative(elapsedMs)) throw new TypeError('Run counters must be finite and nonnegative');

      const existing = currentDocument.entries.find((entry) => entry.id === runId);
      if (existing) {
        const rank = currentDocument.entries.findIndex((entry) => entry.id === runId) + 1;
        const result = {
          id: runId,
          score: existing.score,
          distanceMeters: existing.distanceMeters,
          enemyKills,
          elapsedMs: existing.elapsedMs,
          qualified: true,
          rank,
          cutoff: currentDocument.entries.length === MAX_ENTRIES ? currentDocument.entries[MAX_ENTRIES - 1].score : null,
          entry: { ...existing },
          newLocalBest: rank === 1,
          snapshot: snapshot(),
        };
        finalizedRuns.set(runId, result);
        return result;
      }

      const candidate = validateEntry({
        id: runId,
        playerId: currentDocument.profile.playerId,
        name: currentDocument.profile.name,
        score: calculateScore({ distanceMeters, enemyKills }),
        distanceMeters,
        elapsedMs,
        createdAt: getNow().toISOString(),
      });
      if (!candidate) throw new TypeError('Run data could not be validated');

      const ranked = sortEntries([...currentDocument.entries, candidate]);
      const rankIndex = ranked.findIndex((entry) => entry.id === runId);
      const qualified = currentDocument.entries.length < MAX_ENTRIES || rankIndex < MAX_ENTRIES;
      if (qualified) {
        const previous = currentDocument;
        const next = { ...previous, entries: ranked.slice(0, MAX_ENTRIES) };
        persistNext(next, previous);
      }

      const currentSnapshot = snapshot();
      const result = {
        id: runId,
        score: candidate.score,
        distanceMeters,
        enemyKills,
        elapsedMs,
        qualified,
        rank: qualified ? rankIndex + 1 : null,
        cutoff: currentSnapshot.entries.length === MAX_ENTRIES ? currentSnapshot.entries[MAX_ENTRIES - 1].score : null,
        entry: qualified ? { ...candidate } : null,
        newLocalBest: qualified && rankIndex === 0,
        snapshot: currentSnapshot,
      };
      finalizedRuns.set(runId, result);
      return result;
    }

    function renamePlayer(rawName) {
      ensureInitialized();
      const next = renameProfile(currentDocument, rawName);
      const changed = Boolean(next && next.profile.name !== currentDocument.profile.name);
      const persisted = changed ? persistNext(next, currentDocument) : persistenceAvailable;
      return { changed, persisted, snapshot: snapshot() };
    }

    function acknowledgeLegacyBest() {
      ensureInitialized();
      if (!Object.hasOwn(currentDocument, 'legacyBest')) {
        return { changed: false, persisted: persistenceAvailable, snapshot: snapshot() };
      }
      const previous = currentDocument;
      const next = { ...previous };
      delete next.legacyBest;
      const persisted = persistNext(next, previous);
      return { changed: true, persisted, snapshot: snapshot() };
    }

    return Object.freeze({
      initialize,
      getSnapshot,
      createRunId,
      finalizeRun,
      renamePlayer,
      acknowledgeLegacyBest,
    });
  }

  const api = Object.freeze({
    DEFAULT_NAMES,
    STORAGE_KEYS,
    MAX_ENTRIES,
    MAX_NAME_CHARACTERS,
    calculateScore,
    normalizeName,
    generateDefaultName,
    compareEntries,
    sortEntries,
    validateEntry,
    validateDocument,
    renameProfile,
    createLeaderboard,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.leaderboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

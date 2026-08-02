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

  // Unicode 16.0 union of Grapheme_Extend, Spacing_Mark, Emoji_Modifier, and
  // Variation_Selector, encoded as base-36 inclusive ranges. Keeping this
  // generated table local makes the fallback deterministic and lets classic
  // WebViews work without parsing Unicode-property regular expressions.
  const UNICODE_16_EXTENDER_DATA = 'lc-of,w3-w9,13l-14t,14v,14x-14y,150-151,153,174-17e,18r-19b,19s,1cm-1cs,1cv-1d0,1d3-1d4,1d6-1d9,1e9,1f4-1fu,1ie-1io,1kb-1kj,1kt,1li-1ll,1ln-1lv,1lx-1lz,1m1-1m5,1nd-1nf,1p3-1pb,1qi-1r5,1r7-1s3,1tm-1to,1tq-1u7,1u9-1uf,1uq-1ur,1vl-1vn,1x8,1xa-1xg,1xj-1xk,1xn-1xp,1xz,1ya-1yb,1z2,1z5-1z7,20s,20u-20y,213-214,217-219,21d,228-229,22d,22p-22r,24c,24e-24l,24n-24p,24r-24t,25e-25f,262-267,269-26b,27w,27y-284,287-288,28b-28d,28l-28n,28y-28z,29u,2bi-2bm,2bq-2bs,2bu-2bx,2c7,2dc-2dg,2f0,2f2-2f8,2fa-2fc,2fe-2fh,2fp-2fq,2g2-2g3,2gx-2gz,2ik,2im-2is,2iu-2iw,2iy-2j1,2j9-2ja,2jm-2jn,2k3,2kg-2kj,2m3-2m4,2m6-2mc,2me-2mg,2mi-2ml,2mv,2n6-2n7,2o1-2o3,2q2,2q7-2qc,2qe,2qg-2qn,2r6-2r7,2sx,2t0-2t6,2tj-2tq,2wh,2wk-2ws,2x4-2xa,2zc-2zd,305,307,309,30e-30f,31t-32c,32e-32f,32l-32v,32x-33w,346,36z-37i,386-389,38e-38g,38i-38k,38n-38t,38x-390,39e-39p,39r,3a2-3a5,3tp-3tr,4k2-4k5,4ky-4l0,4lu-4lv,4mq-4mr,4ok-4pf,4pp,4qz-4r1,4r3,4ud-4ue,4vd,4yo-4yz,4z4-4zf,55j-55n,579-57i,57k-58c,58f,59s-5am,5c0-5c4,5dg-5dw,5ez-5f7,5fk-5fm,5gh-5gt,5ie-5ir,5k4-5kn,5ow-5oy,5p0-5pk,5pp,5pw,5pz-5q1,5vk-5xb,6bw,6hc-6i8,8vj-8vl,8zj,928-933,9ii-9in,9ll-9lm,wvj-wvm,wvo-wvx,wwu-wwv,wz4-wz5,x6q,x6u,x6z,x7n-x7r,x7w,xa8-xa9,xbo-xc5,xcw-xdd,xdr,xeu-xf1,xfr-xg3,xhc-xhf,xir-xj4,xk5,xm1-xme,xmr,xn0-xn1,xob-xod,xps,xpu-xpw,xpz-xq0,xq6-xq7,xq9,xrf-xrj,xrp-xrq,xyb-xyi,xyk-xyl,1dlq,1e68-1e6n,1e74-1e7j,1ehq-1ehr,1eyl,1f4w,1f92-1f96,1gjl-1gjn,1gjp-1gjq,1gjw-1gjz,1gl4-1gl6,1glb,1gpx-1gpy,1h5w-1h5z,1h7t-1h7x,1hgr-1hgs,1hj0-1hj3,1hl2-1hlc,1hmq-1hmt,1hq8-1hqa,1hrs-1hs6,1htc,1htf-1htg,1htr-1htu,1hv4-1hve,1hvm,1hxc-1hxe,1hyf-1hys,1hz9-1hza,1i0j,1i0w-1i0y,1i2b-1i2o,1i2x-1i30,1i32-1i33,1i5o-1i5z,1i66,1i69,1ian-1iay,1ibk-1ibn,1id7-1id8,1ida-1idg,1idj-1idk,1idn-1idp,1idz,1iea-1ieb,1iee-1iek,1ieo-1ies,1igo-1igw,1igy,1ih1,1ih3-1ih6,1ih8-1ihc,1ihe,1iht-1ihu,1ik5-1ikm,1ila,1ink-1io3,1iun-1iut,1iuw-1iv4,1ivw-1ivx,1iy8-1iyo,1j1n-1j1z,1j4t-1j57,1jcc-1jcq,1jjk-1jjp,1jjr-1jjs,1jjv-1jjy,1jk0,1jk2-1jk3,1jo1-1jo7,1joa-1jog,1jok,1jpd-1jpm,1jqr-1jqx,1jqz-1jr2,1jrb,1jrl-1jrv,1jt6-1jtl,1k4v-1k52,1k54-1k5b,1k7m-1k87,1k89-1k8m,1kc1-1kc6,1kca,1kcc-1kcd,1kcf-1kcl,1kcn,1kei-1kem,1keo-1kep,1ker-1kev,1koj-1kom,1kow-1kox,1koz,1kqc-1kqi,1kqm-1kqq,1kre,1ow0,1ow7-1owl,1xr2-1xrj,1zow-1zp0,1zqo-1zqu,20jz,20k1-20lj,20lr-20lu,20o4,20og-20oh,2ftp-2ftq,2jgg-2jhp,2jhs-2jie,2jxh-2jxl,2jxp-2jxu,2jy3-2jya,2jyd-2jyj,2jze-2jzh,2k3m-2k3o,2lmo-2lo6,2lob-2lpo,2lpx,2lqc,2lqz-2lr3,2lr5-2lrj,2mtc-2mti,2mtk-2mu0,2mu3-2mu9,2mub-2muc,2mue-2mui,2mxb,2n1s-2n1y,2nce,2ne4-2ne7,2nsc-2nsf,2nzi-2nzj,2ok0-2ok6,2on8-2one,2qrf-2qrj,jnz4-jo1r,jo5c-jobz';
  const UNICODE_16_EXTENDER_RANGES = UNICODE_16_EXTENDER_DATA.split(',').map((encodedRange) => {
    const parts = encodedRange.split('-');
    const start = parseInt(parts[0], 36);
    return [start, parts.length === 1 ? start : parseInt(parts[1], 36)];
  });

  function isStructuralExtender(character) {
    const codePoint = character.codePointAt(0);
    let low = 0;
    let high = UNICODE_16_EXTENDER_RANGES.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const range = UNICODE_16_EXTENDER_RANGES[middle];
      if (codePoint < range[0]) high = middle - 1;
      else if (codePoint > range[1]) low = middle + 1;
      else return true;
    }
    return false;
  }

  function isRegionalIndicator(character) {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
  }

  function isGraphemeBase(character) {
    return Boolean(character) && character !== '\u200d' && !isStructuralExtender(character);
  }

  // Compact UAX #29-style fallback for macOS WebViews predating Intl.Segmenter.
  // Unicode properties supply complete mark/modifier tables without embedding a stale range list.
  // Malformed standalone extenders and invalid ZWJ runs are discarded rather than emitted dangling.
  function fallbackSegmentGraphemes(value) {
    const codePoints = Array.from(value);
    const clusters = [];
    for (let index = 0; index < codePoints.length;) {
      if (!isGraphemeBase(codePoints[index])) {
        index += 1;
        continue;
      }

      let cluster = codePoints[index];
      index += 1;

      if (cluster === '\r' && codePoints[index] === '\n') {
        cluster += codePoints[index];
        index += 1;
      } else if (isRegionalIndicator(cluster)
        && index < codePoints.length
        && isRegionalIndicator(codePoints[index])) {
        cluster += codePoints[index];
        index += 1;
      }

      while (index < codePoints.length && isStructuralExtender(codePoints[index])) {
        cluster += codePoints[index];
        index += 1;
      }

      while (codePoints[index] === '\u200d') {
        let joinerEnd = index;
        while (codePoints[joinerEnd] === '\u200d') joinerEnd += 1;
        if (joinerEnd !== index + 1 || !isGraphemeBase(codePoints[joinerEnd])) {
          index = joinerEnd;
          while (index < codePoints.length && isStructuralExtender(codePoints[index])) index += 1;
          break;
        }
        if (joinerEnd >= codePoints.length) {
          index += 1;
          break;
        }
        cluster += codePoints[index] + codePoints[joinerEnd];
        index = joinerEnd + 1;
        while (index < codePoints.length && isStructuralExtender(codePoints[index])) {
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

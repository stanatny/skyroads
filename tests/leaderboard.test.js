const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  DEFAULT_NAMES,
  STORAGE_KEYS,
  calculateScore,
  normalizeName,
  generateDefaultName,
  compareEntries,
  sortEntries,
  validateEntry,
  validateDocument,
  renameProfile,
  createLeaderboard,
} = require('../src/leaderboard.js');

function loadLeaderboardWithoutSegmenter({ unicodeProperties = true } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'leaderboard.js'), 'utf8');
  const context = { Intl: {}, module: { exports: {} } };
  if (!unicodeProperties) {
    context.RegExp = function LegacyRegExp(pattern, flags) {
      if (String(pattern).includes('\\p{')) throw new SyntaxError('Unicode properties unavailable');
      return new RegExp(pattern, flags);
    };
    context.RegExp.prototype = RegExp.prototype;
  }
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'leaderboard-without-segmenter.js' });
  return context.module.exports;
}

test('score keeps distance separate and floors only source counters', () => {
  assert.equal(calculateScore({ distanceMeters: 8042.9, enemyKills: 3 }), 8102);
  assert.equal(calculateScore({ distanceMeters: 1.9, enemyKills: 2.9 }), 41);
});

test('score rejects non-finite or negative source counters instead of publishing invalid totals', () => {
  assert.equal(calculateScore({ distanceMeters: Infinity, enemyKills: 1 }), 0);
  assert.equal(calculateScore({ distanceMeters: 100, enemyKills: -1 }), 0);
});

test('name normalization removes controls and limits Unicode characters', () => {
  assert.equal(normalizeName('  Nova\u0000🚀ExplorerBeyond  ', 'Vega'), 'Nova🚀ExplorerBey');
  assert.equal(normalizeName('   ', 'Vega'), 'Vega');
});

test('name normalization keeps ZWJ emoji intact at the 16-visible-character boundary', () => {
  const family = '👨‍👩‍👧‍👦';
  assert.equal(normalizeName(family.repeat(17), 'Vega'), family.repeat(16));
});

test('name normalization counts combining sequences as one visible character', () => {
  const accented = 'e\u0301';
  assert.equal(normalizeName(accented.repeat(17), 'Vega'), accented.repeat(16));
});

test('name normalization fallback preserves joined and combining sequences without Intl.Segmenter', () => {
  const fallbackNormalizeName = loadLeaderboardWithoutSegmenter().normalizeName;
  const family = '👨‍👩‍👧‍👦';
  const accented = 'e\u0301';
  assert.equal(fallbackNormalizeName(family.repeat(17), 'Vega'), family.repeat(16));
  assert.equal(fallbackNormalizeName(accented.repeat(17), 'Vega'), accented.repeat(16));
});

test('name normalization fallback keeps Unicode spacing marks and combining marks with their base', () => {
  const fallbackNormalizeName = loadLeaderboardWithoutSegmenter().normalizeName;
  assert.equal(fallbackNormalizeName(`${'A'.repeat(15)}किB`, 'Vega'), `${'A'.repeat(15)}कि`);
  assert.equal(fallbackNormalizeName(`${'A'.repeat(15)}Б\u0483C`, 'Vega'), `${'A'.repeat(15)}Б\u0483`);
});

test('name normalization fallback rejects consecutive ZWJs instead of returning a dangling joiner', () => {
  const fallbackNormalizeName = loadLeaderboardWithoutSegmenter().normalizeName;
  assert.equal(fallbackNormalizeName(`${'A'.repeat(15)}B\u200d\u200dC`, 'Vega'), `${'A'.repeat(15)}B`);
});

test('name normalization fallback rejects standalone grapheme fragments', () => {
  const fallbackNormalizeName = loadLeaderboardWithoutSegmenter().normalizeName;
  for (const fragment of ['\u0301', '\ufe0f', '\ud83c\udffb', '\u{e0020}']) {
    assert.equal(fallbackNormalizeName(fragment, 'Vega'), 'Vega');
  }
});

test('name normalization fallback remains safe without Unicode property escapes', () => {
  const fallbackNormalizeName = loadLeaderboardWithoutSegmenter({ unicodeProperties: false }).normalizeName;
  assert.equal(fallbackNormalizeName(`${'A'.repeat(15)}किB`, 'Vega'), `${'A'.repeat(15)}कि`);
  assert.equal(fallbackNormalizeName(`${'A'.repeat(15)}Б\u0483C`, 'Vega'), `${'A'.repeat(15)}Б\u0483`);
  assert.equal(fallbackNormalizeName(`${'A'.repeat(15)}B\u200d\u200dC`, 'Vega'), `${'A'.repeat(15)}B`);
  for (const fragment of ['\u0301', '\ufe0f', '\ud83c\udffb', '\u{e0020}']) {
    assert.equal(fallbackNormalizeName(fragment, 'Vega'), 'Vega');
  }
});

test('name fallback is also sanitized and never empty', () => {
  assert.equal(normalizeName('', '  Lu\u0000na  '), 'Luna');
  assert.equal(normalizeName('', '\u0000   '), DEFAULT_NAMES[0]);
});

test('default-name selection uses the injected random source and safe approved names', () => {
  assert.equal(generateDefaultName({ random: () => 0 }), 'Nova');
  assert.equal(generateDefaultName({ random: () => 0.999999 }), 'Zenith');
  assert.ok(DEFAULT_NAMES.includes(generateDefaultName({ random: () => NaN })));
});

test('sorting applies all deterministic tie breakers including final ID order', () => {
  const entries = [
    { id:'b', score:10, distanceMeters:9, elapsedMs:100, createdAt:'2026-01-02T00:00:00.000Z' },
    { id:'z', score:10, distanceMeters:10, elapsedMs:110, createdAt:'2026-01-02T00:00:00.000Z' },
    { id:'a', score:10, distanceMeters:10, elapsedMs:110, createdAt:'2026-01-02T00:00:00.000Z' },
    { id:'c', score:10, distanceMeters:10, elapsedMs:90, createdAt:'2026-01-03T00:00:00.000Z' },
    { id:'high', score:11, distanceMeters:1, elapsedMs:999, createdAt:'2027-01-01T00:00:00.000Z' },
  ];
  assert.deepEqual(sortEntries(entries).map((entry) => entry.id), ['high', 'c', 'a', 'z', 'b']);
  assert.ok(compareEntries(entries[4], entries[3]) < 0);
  assert.deepEqual(entries.map((entry) => entry.id), ['b', 'z', 'a', 'c', 'high']);
});

test('sorting uses locale-independent code-unit order for exact-tie IDs', () => {
  const tied = [
    { id:'a', score:10, distanceMeters:10, elapsedMs:100, createdAt:'2026-01-02T00:00:00.000Z' },
    { id:'Z', score:10, distanceMeters:10, elapsedMs:100, createdAt:'2026-01-02T00:00:00.000Z' },
  ];
  assert.deepEqual(sortEntries(tied).map((entry) => entry.id), ['Z', 'a']);
});

test('entry validation sanitizes valid data and rejects malformed identifiers dates and numerics', () => {
  const valid = {
    id: 'run-1', playerId: 'player-1', name: '  Nova\u0000  ', score: 120,
    distanceMeters: 100.75, elapsedMs: 5010, createdAt: '2026-08-02T12:00:00.000Z',
  };
  assert.deepEqual(validateEntry(valid), { ...valid, name: 'Nova' });
  for (const mutation of [
    { id: '' },
    { playerId: '\u0000' },
    { score: 1.5 },
    { distanceMeters: -1 },
    { elapsedMs: Infinity },
    { createdAt: 'not-an-iso-date' },
  ]) {
    assert.equal(validateEntry({ ...valid, ...mutation }), null);
  }
});

test('document validation discards invalid entries, sorts results and enforces the Top 15 cap', () => {
  const entries = Array.from({ length: 17 }, (_, index) => ({
    id: `run-${index}`, playerId: 'player-1', name: 'Nova', score: index,
    distanceMeters: index, elapsedMs: 1000 - index,
    createdAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));
  entries.push({ ...entries[0], id: '', score: 9999 });
  const document = validateDocument({
    version: 1,
    profile: { playerId: 'player-1', name: ' Nova ' },
    entries,
    legacyBest: 77,
  });
  assert.equal(document.entries.length, 15);
  assert.equal(document.entries[0].score, 16);
  assert.equal(document.entries[14].score, 2);
  assert.deepEqual(document.profile, { playerId: 'player-1', name: 'Nova' });
  assert.equal(document.legacyBest, 77);
});

test('document validation rejects wrong versions and malformed profiles', () => {
  const base = { version: 1, profile: { playerId: 'player-1', name: 'Nova' }, entries: [] };
  assert.equal(validateDocument({ ...base, version: 2 }), null);
  assert.equal(validateDocument({ ...base, profile: { playerId: '', name: 'Nova' } }), null);
  assert.equal(validateDocument({ ...base, profile: { playerId: 'player-1', name: '\u0000' } }), null);
});

test('renameProfile changes only history owned by the current profile', () => {
  const document = {
    version: 1,
    profile: { playerId: 'player-1', name: 'Nova' },
    entries: [
      { id:'mine', playerId:'player-1', name:'Nova', score:2, distanceMeters:2, elapsedMs:2, createdAt:'2026-01-01T00:00:00.000Z' },
      { id:'other', playerId:'player-2', name:'Vega', score:1, distanceMeters:1, elapsedMs:1, createdAt:'2026-01-01T00:00:00.000Z' },
    ],
  };
  const renamed = renameProfile(document, '  Lyra\u0000  ');
  assert.equal(renamed.profile.name, 'Lyra');
  assert.deepEqual(renamed.entries.map((entry) => entry.name), ['Lyra', 'Vega']);
  assert.equal(document.profile.name, 'Nova');
});

class FakeStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.events = [];
    this.nextReads = new Map();
    this.setError = null;
  }

  getItem(key) {
    this.events.push(['get', key]);
    const action = this.nextReads.get(key);
    if (action) {
      this.nextReads.delete(key);
      if (action.type === 'throw') throw action.error;
      return action.value;
    }
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.events.push(['set', key]);
    if (this.setError) throw this.setError;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.events.push(['remove', key]);
    this.values.delete(key);
  }

  corruptNextRead(key, value = '{corrupt') {
    this.nextReads.set(key, { type: 'return', value });
  }

  throwNextRead(key, error) {
    this.nextReads.set(key, { type: 'throw', error });
  }
}

function makeEntry(index, overrides = {}) {
  return {
    id: `run-${index}`,
    playerId: 'player-1',
    name: 'Nova',
    score: 1000 - index,
    distanceMeters: 900 - index,
    elapsedMs: 1000 + index,
    createdAt: `2026-08-02T12:00:${String(index).padStart(2, '0')}.000Z`,
    ...overrides,
  };
}

function makeDocument(overrides = {}) {
  return {
    version: 1,
    profile: { playerId: 'player-1', name: 'Nova' },
    entries: [],
    ...overrides,
  };
}

function createTestLeaderboard(storage, overrides = {}) {
  let nextId = 0;
  return createLeaderboard({
    storage,
    cryptoObject: { randomUUID: () => `generated-${++nextId}` },
    now: () => new Date('2026-08-02T13:00:00.000Z'),
    random: () => 0,
    ...overrides,
  });
}

test('initialize prefers a valid active document instead of replacing saved history', () => {
  const active = makeDocument({ entries: [makeEntry(1)] });
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(active) });
  const leaderboard = createTestLeaderboard(storage);
  const snapshot = leaderboard.initialize();
  assert.deepEqual(snapshot.profile, active.profile);
  assert.deepEqual(snapshot.entries, active.entries);
  assert.equal(snapshot.persistenceAvailable, true);
});

test('initialize recovers a corrupt active document from backup and promotes the backup', () => {
  const backup = makeDocument({ profile: { playerId: 'backup-player', name: 'Vega' } });
  const storage = new FakeStorage({
    [STORAGE_KEYS.active]: '{bad json',
    [STORAGE_KEYS.backup]: JSON.stringify(backup),
  });
  const snapshot = createTestLeaderboard(storage).initialize();
  assert.deepEqual(snapshot.profile, backup.profile);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)), backup);
});

test('initialize replaces two invalid documents with a fresh safe persisted profile', () => {
  const storage = new FakeStorage({
    [STORAGE_KEYS.active]: JSON.stringify({ version: 2 }),
    [STORAGE_KEYS.backup]: JSON.stringify({ version: 1, profile: null, entries: [] }),
  });
  const snapshot = createTestLeaderboard(storage).initialize();
  assert.deepEqual(snapshot.profile, { playerId: 'generated-1', name: 'Nova' });
  assert.deepEqual(snapshot.entries, []);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)), makeDocument({
    profile: { playerId: 'generated-1', name: 'Nova' },
  }));
});

test('legacy migration keeps the old incomparable best out of ranking entries', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.legacy]: '4321.5' });
  const snapshot = createTestLeaderboard(storage).initialize();
  assert.equal(snapshot.legacyBest, 4321.5);
  assert.deepEqual(snapshot.entries, []);
  assert.equal(storage.values.has(STORAGE_KEYS.legacy), false);
});

test('legacy migration removes the old key only after active write validation succeeds', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.legacy]: '4321' });
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (key === STORAGE_KEYS.active) storage.corruptNextRead(STORAGE_KEYS.active);
  };
  const snapshot = createTestLeaderboard(storage).initialize();
  assert.equal(snapshot.legacyBest, 4321);
  assert.equal(snapshot.persistenceAvailable, false);
  assert.equal(storage.values.get(STORAGE_KEYS.legacy), '4321');
  assert.equal(storage.events.some(([operation, key]) => operation === 'remove' && key === STORAGE_KEYS.legacy), false);
});

test('legacy migration orders removal after the verified active read', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.legacy]: '123' });
  createTestLeaderboard(storage).initialize();
  const activeSet = storage.events.findIndex(([operation, key]) => operation === 'set' && key === STORAGE_KEYS.active);
  const verifiedRead = storage.events.findIndex(([operation, key], index) => index > activeSet && operation === 'get' && key === STORAGE_KEYS.active);
  const legacyRemoval = storage.events.findIndex(([operation, key]) => operation === 'remove' && key === STORAGE_KEYS.legacy);
  assert.ok(activeSet >= 0 && verifiedRead > activeSet && legacyRemoval > verifiedRead);
});

test('finalizeRun qualifies every valid run while fewer than 15 records exist', () => {
  const storage = new FakeStorage({
    [STORAGE_KEYS.active]: JSON.stringify(makeDocument({ entries: Array.from({ length: 14 }, (_, index) => makeEntry(index)) })),
  });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const result = leaderboard.finalizeRun({ id: 'new-run', distanceMeters: 0, enemyKills: 0, elapsedMs: 9999 });
  assert.equal(result.qualified, true);
  assert.equal(result.rank, 15);
  assert.equal(result.entry.id, 'new-run');
  assert.equal(result.snapshot.entries.length, 15);
});

test('finalizeRun applies the rank-15 boundary and reports the nonqualifying cutoff', () => {
  const entries = Array.from({ length: 15 }, (_, index) => makeEntry(index, {
    score: 100 - index,
    distanceMeters: 100 - index,
  }));
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument({ entries })) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const miss = leaderboard.finalizeRun({ id: 'miss', distanceMeters: 85, enemyKills: 0, elapsedMs: 1 });
  assert.equal(miss.qualified, false);
  assert.equal(miss.rank, null);
  assert.equal(miss.cutoff, 86);
  assert.equal(miss.entry, null);
  const hit = leaderboard.finalizeRun({ id: 'hit', distanceMeters: 86, enemyKills: 0, elapsedMs: 0 });
  assert.equal(hit.qualified, true);
  assert.equal(hit.rank, 15);
  assert.equal(hit.snapshot.entries.at(-1).id, 'hit');
});

test('finalizeRun caches a nonqualifying run ID so repeated finalization is idempotent', () => {
  const entries = Array.from({ length: 15 }, (_, index) => makeEntry(index));
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument({ entries })) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const first = leaderboard.finalizeRun({ id: 'miss', distanceMeters: 1, enemyKills: 0, elapsedMs: 10 });
  const second = leaderboard.finalizeRun({ id: 'miss', distanceMeters: 99999, enemyKills: 999, elapsedMs: 1 });
  assert.strictEqual(second, first);
  assert.equal(second.qualified, false);
  assert.equal(leaderboard.getSnapshot().entries.some((entry) => entry.id === 'miss'), false);
});

test('renamePlayer updates only entries owned by the current player ID', () => {
  const entries = [
    makeEntry(1),
    makeEntry(2, { id: 'other', playerId: 'other-player', name: 'Vega' }),
  ];
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument({ entries })) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const result = leaderboard.renamePlayer('  Lyra  ');
  assert.equal(result.changed, true);
  assert.equal(result.snapshot.profile.name, 'Lyra');
  assert.deepEqual(result.snapshot.entries.map((entry) => entry.name), ['Lyra', 'Vega']);
});

test('failed active readback writes backup first, restores it, and retains the next document in memory', () => {
  const active = makeDocument({ entries: [makeEntry(1)] });
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(active) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const mutationStart = storage.events.length;
  storage.corruptNextRead(STORAGE_KEYS.active);
  const result = leaderboard.finalizeRun({ id: 'new-run', distanceMeters: 2000, enemyKills: 0, elapsedMs: 10 });
  const mutationEvents = storage.events.slice(mutationStart);
  const backupWrite = mutationEvents.findIndex(([operation, key]) => operation === 'set' && key === STORAGE_KEYS.backup);
  const activeWrite = mutationEvents.findIndex(([operation, key]) => operation === 'set' && key === STORAGE_KEYS.active);
  const verificationRead = mutationEvents.findIndex(([operation, key]) => operation === 'get' && key === STORAGE_KEYS.active);
  const activeRestore = mutationEvents.findLastIndex(([operation, key]) => operation === 'set' && key === STORAGE_KEYS.active);
  assert.ok(backupWrite >= 0 && backupWrite < activeWrite);
  assert.ok(activeWrite < verificationRead && verificationRead < activeRestore);
  assert.equal(result.qualified, true);
  assert.equal(result.snapshot.entries.some((entry) => entry.id === 'new-run'), true);
  assert.equal(result.snapshot.persistenceAvailable, false);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)), active);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.backup)), active);
});

test('SecurityError storage failure switches to memory and keeps later runs for the session', () => {
  const error = new DOMException('blocked', 'SecurityError');
  const storage = {
    getItem() { throw error; },
    setItem() { throw error; },
    removeItem() { throw error; },
  };
  const leaderboard = createTestLeaderboard(storage);
  const initialized = leaderboard.initialize();
  const first = leaderboard.finalizeRun({ id: 'one', distanceMeters: 100, enemyKills: 0, elapsedMs: 10 });
  const second = leaderboard.finalizeRun({ id: 'two', distanceMeters: 200, enemyKills: 0, elapsedMs: 20 });
  assert.equal(initialized.persistenceAvailable, false);
  assert.deepEqual(second.snapshot.entries.map((entry) => entry.id), ['two', 'one']);
  assert.equal(first.snapshot.entries.length, 1);
});

test('quota failure after initialization keeps the accepted run in session memory', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  storage.setError = new DOMException('full', 'QuotaExceededError');
  const result = leaderboard.finalizeRun({ id: 'one', distanceMeters: 100, enemyKills: 0, elapsedMs: 10 });
  assert.equal(result.snapshot.persistenceAvailable, false);
  assert.equal(leaderboard.getSnapshot().entries[0].id, 'one');
});

test('acknowledgeLegacyBest clears the one-time reference without changing rankings', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.legacy]: '456' });
  const leaderboard = createTestLeaderboard(storage);
  const before = leaderboard.initialize();
  const result = leaderboard.acknowledgeLegacyBest();
  assert.equal(before.legacyBest, 456);
  assert.equal(result.changed, true);
  assert.equal(result.snapshot.legacyBest, null);
  assert.deepEqual(result.snapshot.entries, []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  DEFAULT_NAMES,
  STORAGE_KEYS,
  MAX_NAME_CHARACTERS,
  calculateScore,
  segmentGraphemes,
  sanitizeNameInput,
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

test('rename presentation helpers count and clamp the same grapheme clusters', () => {
  const family = '👨‍👩‍👧‍👦';
  const combining = 'e\u0301';
  const raw = `${'A'.repeat(14)}${family}${combining}Z`;
  const sanitized = sanitizeNameInput(raw);
  assert.equal(segmentGraphemes(sanitized).length, MAX_NAME_CHARACTERS);
  assert.equal(sanitized, `${'A'.repeat(14)}${family}${combining}`);
});

test('leaderboard runs when Object.hasOwn is unavailable in an older WebView', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'leaderboard.js'), 'utf8');
  const context = { module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext('Object.hasOwn = undefined;', context);
  vm.runInContext(source, context, { filename: 'leaderboard-without-object-has-own.js' });
  const leaderboard = context.module.exports.createLeaderboard({ storage: null, random: () => 0 });
  assert.doesNotThrow(() => leaderboard.initialize());
  assert.equal(leaderboard.getSnapshot().entries.length, 0);
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

test('name normalization fallback preserves Hangul, Prepend, and Indic conjunct graphemes', () => {
  const fallback = loadLeaderboardWithoutSegmenter();
  const clusters = ['가', '؀A', 'क्ष'];
  assert.deepEqual(Array.from(fallback.segmentGraphemes(clusters.join(''))), clusters);
  for (const cluster of clusters) {
    assert.equal(fallback.normalizeName(cluster.repeat(17), 'Vega'), cluster.repeat(16));
  }
});

test('fallback follows Unicode 16 GB6-8, GB9b, and GB9c fixture boundaries', () => {
  const fallback = loadLeaderboardWithoutSegmenter();
  const fixture = (...codePoints) => String.fromCodePoint(...codePoints);
  const cases = [
    ['GB6 L × V', fixture(0x1100, 0x1160)],
    ['GB6 L × LV', fixture(0x1100, 0xac00)],
    ['GB7 LV × V × T', fixture(0xac00, 0x1161, 0x11a8)],
    ['GB8 LVT × T', fixture(0xac01, 0x11a8)],
    ['GB9b Prepend × Other', fixture(0x0600, 0x0020)],
    ['GB9c Consonant × Linker × Consonant', fixture(0x0915, 0x094d, 0x0937)],
    ['GB9c accepts Extend and ZWJ after Linker', fixture(0x0915, 0x094d, 0x0308, 0x200d, 0x0937)],
    ['GB9c accepts ZWJ before Linker', fixture(0x0915, 0x200d, 0x094d, 0x0937)],
  ];
  for (const [rule, value] of cases) {
    assert.deepEqual(Array.from(fallback.segmentGraphemes(value)), [value], rule);
  }

  const hangulBreak = fixture(0x1100, 0x0308, 0x1160);
  assert.deepEqual(Array.from(fallback.segmentGraphemes(hangulBreak)), [
    fixture(0x1100, 0x0308),
    fixture(0x1160),
  ], 'an intervening Extend prevents the adjacent GB6 boundary');

  const missingLinker = fixture(0x0915, 0x200d, 0x0937);
  assert.deepEqual(Array.from(fallback.segmentGraphemes(missingLinker)), [
    fixture(0x0915, 0x200d),
    fixture(0x0937),
  ], 'GB9c must not join Indic consonants when the Linker is absent');

  const spacingMarkBeforeLinker = fixture(0x0915, 0x093e, 0x094d, 0x0937);
  assert.deepEqual(Array.from(fallback.segmentGraphemes(spacingMarkBeforeLinker)), [
    fixture(0x0915, 0x093e, 0x094d),
    fixture(0x0937),
  ], 'GB9c must not scan through a SpacingMark that is not InCB=Extend');
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

test('renameProfile updates the profile name but keeps historical entry names', () => {
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
  // 历史记录保留创造纪录时的名字，不被改名回溯改写
  assert.deepEqual(renamed.entries.map((entry) => entry.name), ['Nova', 'Vega']);
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

test('initialize does not promote a stale backup over a peer run saved between storage reads', () => {
  const storage = new FakeStorage();
  const peer = createTestLeaderboard(storage, {
    cryptoObject: { randomUUID: () => 'shared-player' },
  });
  const initializing = createTestLeaderboard(storage, {
    cryptoObject: { randomUUID: () => 'shared-player' },
  });
  const originalGetItem = storage.getItem.bind(storage);
  let injectedPeerWrite = false;
  storage.getItem = (key) => {
    if (key === STORAGE_KEYS.backup && !injectedPeerWrite) {
      injectedPeerWrite = true;
      peer.initialize();
      peer.finalizeRun({ id: 'peer-run', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });
    }
    return originalGetItem(key);
  };

  const snapshot = initializing.initialize();

  assert.deepEqual(snapshot.entries.map((entry) => entry.id), ['peer-run']);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)).entries.map((entry) => entry.id), ['peer-run']);
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

test('renamePlayer updates the profile but keeps historical entry names', () => {
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
  // 改名只影响之后的成绩：既有记录保留落盘时的名字
  assert.deepEqual(result.snapshot.entries.map((entry) => entry.name), ['Nova', 'Vega']);
});

test('two initialized controllers reconcile sequential runs and back up the latest active document', () => {
  const storage = new FakeStorage();
  const first = createTestLeaderboard(storage, {
    cryptoObject: { randomUUID: () => 'player-shared' },
  });
  const second = createTestLeaderboard(storage, {
    cryptoObject: { randomUUID: () => 'player-shared' },
  });
  first.initialize();
  second.initialize();

  first.finalizeRun({ id: 'run-a', distanceMeters: 100, enemyKills: 0, elapsedMs: 20 });
  const result = second.finalizeRun({ id: 'run-b', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });

  assert.deepEqual(result.snapshot.entries.map((entry) => entry.id), ['run-b', 'run-a']);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)).entries.map((entry) => entry.id), ['run-b', 'run-a']);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.backup)).entries.map((entry) => entry.id), ['run-a']);
});

test('stale rename and run mutations rebase without losing peer history or profile state', () => {
  const initial = makeDocument();
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(initial) });
  const first = createTestLeaderboard(storage);
  const second = createTestLeaderboard(storage);
  first.initialize();
  second.initialize();

  first.finalizeRun({ id: 'run-a', distanceMeters: 100, enemyKills: 0, elapsedMs: 20 });
  second.renamePlayer('Lyra');
  let durable = JSON.parse(storage.values.get(STORAGE_KEYS.active));
  assert.equal(durable.profile.name, 'Lyra');
  // run-a 落盘时署名 Nova，改名不回溯改写
  assert.deepEqual(durable.entries.map((entry) => [entry.id, entry.name]), [['run-a', 'Nova']]);

  first.finalizeRun({ id: 'run-b', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });
  durable = JSON.parse(storage.values.get(STORAGE_KEYS.active));
  // 新成绩 run-b 使用改名后的 Lyra
  assert.deepEqual(durable.entries.map((entry) => [entry.id, entry.name]), [['run-b', 'Lyra'], ['run-a', 'Nova']]);

  second.renamePlayer('Vega');
  durable = JSON.parse(storage.values.get(STORAGE_KEYS.active));
  assert.equal(durable.profile.name, 'Vega');
  // 再次改名同样不影响既有记录
  assert.deepEqual(durable.entries.map((entry) => [entry.id, entry.name]), [['run-b', 'Lyra'], ['run-a', 'Nova']]);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.backup)).entries.map((entry) => entry.id), ['run-b', 'run-a']);
});

test('a mutation reconciles a corrupt active with a valid backup before writing', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  storage.values.set(STORAGE_KEYS.active, '{corrupt');
  storage.values.set(STORAGE_KEYS.backup, JSON.stringify(makeDocument({ entries: [makeEntry(1, {
    id: 'run-a', score: 100, distanceMeters: 100,
  })] })));

  const result = leaderboard.finalizeRun({ id: 'run-b', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });

  assert.equal(result.snapshot.persistenceAvailable, true);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)).entries.map((entry) => entry.id), ['run-b', 'run-a']);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.backup)).entries.map((entry) => entry.id), ['run-a']);
});

test('a valid competing readback is merged and retried instead of disabling persistence', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const originalSetItem = storage.setItem.bind(storage);
  let controllerActiveWrites = 0;
  let injected = false;
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (key !== STORAGE_KEYS.active) return;
    controllerActiveWrites += 1;
    if (!injected) {
      injected = true;
      storage.values.set(STORAGE_KEYS.active, JSON.stringify(makeDocument({ entries: [makeEntry(2, {
        id: 'run-b', score: 200, distanceMeters: 200,
      })] })));
    }
  };

  const result = leaderboard.finalizeRun({ id: 'run-a', distanceMeters: 100, enemyKills: 0, elapsedMs: 20 });

  assert.equal(result.snapshot.persistenceAvailable, true);
  assert.equal(controllerActiveWrites, 2);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)).entries.map((entry) => entry.id), ['run-b', 'run-a']);
});

test('bounded contention exhaustion preserves the local semantic mutation in session memory', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const originalSetItem = storage.setItem.bind(storage);
  let activeWrites = 0;
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (key !== STORAGE_KEYS.active) return;
    activeWrites += 1;
    storage.values.set(STORAGE_KEYS.active, JSON.stringify(makeDocument({ entries: [makeEntry(activeWrites, {
      id: `peer-${activeWrites}`,
    })] })));
  };

  const result = leaderboard.renamePlayer('Lyra');

  assert.equal(activeWrites, 3);
  assert.equal(result.persisted, false);
  assert.equal(result.snapshot.persistenceAvailable, false);
  assert.equal(result.snapshot.profile.name, 'Lyra');
});

test('active storage events converge once without backup-event or duplicate-event ping-pong', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const first = createTestLeaderboard(storage);
  const second = createTestLeaderboard(storage);
  first.initialize();
  second.initialize();
  first.finalizeRun({ id: 'run-a', distanceMeters: 100, enemyKills: 0, elapsedMs: 20 });
  const afterFirst = storage.values.get(STORAGE_KEYS.active);
  const writesBeforeEvents = storage.events.filter(([operation]) => operation === 'set').length;

  second.handleStorageEvent({ key: STORAGE_KEYS.backup, storageArea: storage, newValue: storage.values.get(STORAGE_KEYS.backup) });
  second.handleStorageEvent({ key: STORAGE_KEYS.active, storageArea: storage, newValue: afterFirst });
  second.handleStorageEvent({ key: STORAGE_KEYS.active, storageArea: storage, newValue: afterFirst });
  second.handleStorageEvent({ key: 'unrelated', storageArea: storage, newValue: '{}' });
  assert.deepEqual(second.getSnapshot().entries.map((entry) => entry.id), ['run-a']);
  assert.equal(storage.events.filter(([operation]) => operation === 'set').length, writesBeforeEvents);

  second.finalizeRun({ id: 'run-b', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });
  const unionValue = storage.values.get(STORAGE_KEYS.active);
  first.handleStorageEvent({ key: STORAGE_KEYS.active, storageArea: storage, newValue: unionValue });
  const writesAfterUnion = storage.events.filter(([operation]) => operation === 'set').length;
  first.handleStorageEvent({ key: STORAGE_KEYS.active, storageArea: storage, newValue: unionValue });
  assert.deepEqual(first.getSnapshot().entries.map((entry) => entry.id), ['run-b', 'run-a']);
  assert.equal(storage.events.filter(([operation]) => operation === 'set').length, writesAfterUnion);

  storage.values.set(STORAGE_KEYS.active, JSON.stringify(makeDocument({ entries: [makeEntry(3, {
    id: 'run-c', score: 300, distanceMeters: 300,
  })] })));
  const repairEvent = { key: STORAGE_KEYS.active, storageArea: storage, newValue: storage.values.get(STORAGE_KEYS.active) };
  first.handleStorageEvent(repairEvent);
  const afterRepairWrites = storage.events.filter(([operation]) => operation === 'set').length;
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)).entries.map((entry) => entry.id), ['run-c', 'run-b', 'run-a']);
  first.handleStorageEvent({ ...repairEvent, newValue: storage.values.get(STORAGE_KEYS.active) });
  assert.equal(storage.events.filter(([operation]) => operation === 'set').length, afterRepairWrites);
});

test('a storage event adopts a peer rename without echoing it', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const first = createTestLeaderboard(storage);
  const second = createTestLeaderboard(storage);
  first.initialize();
  second.initialize();
  first.renamePlayer('Lyra');
  const renamedValue = storage.values.get(STORAGE_KEYS.active);
  const writesBefore = storage.events.filter(([operation]) => operation === 'set').length;

  const eventResult = second.handleStorageEvent({ key: STORAGE_KEYS.active, storageArea: storage, newValue: renamedValue });

  assert.equal(eventResult.changed, true);
  assert.equal(second.getSnapshot().profile.name, 'Lyra');
  assert.equal(storage.events.filter(([operation]) => operation === 'set').length, writesBefore);
  const run = second.finalizeRun({ id: 'run-a', distanceMeters: 10, enemyKills: 0, elapsedMs: 10 });
  assert.equal(run.entry.name, 'Lyra');
});

test('an active storage event repairs corrupt durable state from valid session memory', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  leaderboard.finalizeRun({ id: 'saved-run', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });
  storage.values.set(STORAGE_KEYS.active, '{corrupt');
  storage.values.delete(STORAGE_KEYS.backup);
  const writesBefore = storage.events.filter(([operation]) => operation === 'set').length;

  const result = leaderboard.handleStorageEvent({
    key: STORAGE_KEYS.active,
    storageArea: storage,
    newValue: '{corrupt',
  });

  assert.equal(result.repaired, true);
  assert.equal(result.snapshot.persistenceAvailable, true);
  assert.equal(storage.events.filter(([operation]) => operation === 'set').length > writesBefore, true);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEYS.active)).entries.map((entry) => entry.id), ['saved-run']);
});

test('repairing corrupt active state keeps a newer in-memory profile over its older backup', () => {
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(makeDocument()) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  leaderboard.finalizeRun({ id: 'saved-run', distanceMeters: 200, enemyKills: 0, elapsedMs: 10 });
  leaderboard.renamePlayer('Lyra');
  assert.equal(JSON.parse(storage.values.get(STORAGE_KEYS.backup)).profile.name, 'Nova');
  storage.values.set(STORAGE_KEYS.active, '{corrupt');

  const result = leaderboard.handleStorageEvent({
    key: STORAGE_KEYS.active,
    storageArea: storage,
    newValue: '{corrupt',
  });

  assert.equal(result.repaired, true);
  assert.equal(result.snapshot.profile.name, 'Lyra');
  // 历史成绩保留落盘时的署名 Nova，改名只影响之后的记录
  assert.equal(result.snapshot.entries[0].name, 'Nova');
  assert.equal(JSON.parse(storage.values.get(STORAGE_KEYS.active)).profile.name, 'Lyra');
});

test('failed active readback writes backup first, restores it, and retains the next document in memory', () => {
  const active = makeDocument({ entries: [makeEntry(1)] });
  const storage = new FakeStorage({ [STORAGE_KEYS.active]: JSON.stringify(active) });
  const leaderboard = createTestLeaderboard(storage);
  leaderboard.initialize();
  const mutationStart = storage.events.length;
  const originalSetItem = storage.setItem.bind(storage);
  let corruptVerification = true;
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (key === STORAGE_KEYS.active && corruptVerification) {
      corruptVerification = false;
      storage.corruptNextRead(STORAGE_KEYS.active);
    }
  };
  const result = leaderboard.finalizeRun({ id: 'new-run', distanceMeters: 2000, enemyKills: 0, elapsedMs: 10 });
  const mutationEvents = storage.events.slice(mutationStart);
  const backupWrite = mutationEvents.findIndex(([operation, key]) => operation === 'set' && key === STORAGE_KEYS.backup);
  const activeWrite = mutationEvents.findIndex(([operation, key]) => operation === 'set' && key === STORAGE_KEYS.active);
  const verificationRead = mutationEvents.findIndex(([operation, key], index) => index > activeWrite && operation === 'get' && key === STORAGE_KEYS.active);
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

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MESSAGES, resolveLocale, readLocalePreference,
  writeLocalePreference, createTranslator,
} = require('../src/i18n.js');

test('saved preference wins over system locale', () => {
  assert.equal(resolveLocale({ savedLocale: 'en', languages: ['zh-CN'] }), 'en');
});

test('any Chinese navigator language resolves to zh-CN', () => {
  assert.equal(resolveLocale({ languages: ['fr-FR', 'zh-Hant-TW'] }), 'zh-CN');
});

test('non-Chinese and invalid saved values resolve to English', () => {
  assert.equal(resolveLocale({ savedLocale: 'fr', languages: ['ja-JP'] }), 'en');
});

test('translation interpolates and counts Unicode characters', () => {
  const translator = createTranslator('zh-CN');
  assert.equal(translator.t('rename.characterCount', { count: 3, max: 16 }), '3 / 16');
  assert.equal(translator.countCharacters('Nova🚀'), 5);
});

test('both production catalogs have the same non-empty IDs', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES['zh-CN']).sort());
  for (const catalog of Object.values(MESSAGES)) {
    for (const value of Object.values(catalog)) assert.equal(typeof value === 'string' && value.length > 0, true);
  }
});

test('storage helpers survive browser security errors', () => {
  const storage = { getItem() { throw new DOMException('blocked', 'SecurityError'); }, setItem() { throw new DOMException('blocked', 'SecurityError'); } };
  assert.equal(readLocalePreference(storage), null);
  assert.equal(writeLocalePreference(storage, 'en'), false);
});

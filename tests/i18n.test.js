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

test('music and sound-effect toggles have independent bilingual labels', () => {
  assert.equal(createTranslator('en').t('settings.label'), 'Game settings');
  assert.equal(createTranslator('en').t('settings.musicOn'), 'MUSIC ON');
  assert.equal(createTranslator('en').t('settings.sfxOff'), 'SFX OFF');
  assert.equal(createTranslator('zh-CN').t('settings.label'), '游戏设置');
  assert.equal(createTranslator('zh-CN').t('settings.musicOff'), '音乐关闭');
  assert.equal(createTranslator('zh-CN').t('settings.sfxOn'), '音效开启');
});

test('mission shortcut labels are available in both catalogs', () => {
  assert.equal(createTranslator('en').t('shortcut.startRestart'), 'Enter / Space');
  assert.equal(createTranslator('zh-CN').t('shortcut.returnMenu'), 'Esc');
});

test('version, pause control, and pause status use the approved bilingual copy', () => {
  const en = createTranslator('en');
  const zh = createTranslator('zh-CN');

  assert.equal(en.t('app.versionLabel', { version: '1.1' }), 'Version 1.1');
  assert.equal(en.t('controls.pause'), 'Pause / resume: P');
  assert.equal(en.t('pause.title'), 'GAME PAUSED');
  assert.equal(en.t('pause.resumeHint'), 'Press P to resume');

  assert.equal(zh.t('app.versionLabel', { version: '1.1' }), '版本 1.1');
  assert.equal(zh.t('controls.pause'), '暂停 / 继续：P');
  assert.equal(zh.t('pause.title'), '游戏已暂停');
  assert.equal(zh.t('pause.resumeHint'), '按 P 继续');
});

test('jump, fuel-burst and obstacle-route guidance uses the approved bilingual copy', () => {
  const en = MESSAGES.en;
  const zh = MESSAGES['zh-CN'];
  assert.equal(en['controls.jump'], 'Jump / glide: K / Space · hold while descending to glide');
  assert.equal(zh['controls.jump'], '跳跃 / 滑翔：K / Space · 下落时按住即可滑翔');
  assert.equal(en['controls.fuelBurst'], 'Fuel burst: fuel ≥ 75% + hold W / ↑ for 1s (costs 50% fuel)');
  assert.equal(zh['controls.fuelBurst'], '燃料爆发：燃料 ≥ 75% 时按住 W / ↑ 1 秒（消耗 50% 燃料）');
  assert.equal(
    en['guide.routes'],
    '1 cyan band: one jump · 2 bands: two jumps · gold beacon: super-form third jump · lit corridor: jump, then hold while descending · every advanced route has an ordinary bypass lane',
  );
  assert.equal(
    zh['guide.routes'],
    '1 条青色灯带：一段跳 · 2 条灯带：二段跳 · 金色信标：超级形态三段跳 · 发光连排：起跳后在下落时按住 · 每条进阶路线都有普通绕行车道',
  );
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

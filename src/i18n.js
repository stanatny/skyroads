'use strict';

(function attachI18n(root) {
  const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);
  const LOCALE_STORAGE_KEY = 'skyroads_locale';
  const MESSAGES = Object.freeze({
    en: Object.freeze({
      'app.documentTitle': 'Nebula Cruise', 'meta.description': 'A fast sci-fi lane runner through an endless nebula.', 'canvas.label': 'Nebula Cruise game canvas', 'language.switchToChinese': '中文', 'language.switchToEnglish': 'EN',
      'menu.title': 'NEBULA CRUISE', 'menu.subtitle': 'INTERSTELLAR COMMAND', 'menu.start': 'Start Mission', 'menu.leaderboard': 'Local Top 15', 'shortcut.startRestart': 'Enter / Space', 'shortcut.returnMenu': 'Esc',
      'controls.move': 'Move: A / D or ← / →', 'controls.jump': 'Jump: K / Space / W / ↑', 'controls.shoot': 'Fire: tap or hold J', 'controls.touch': 'Swipe to move · tap to jump',
      'hud.fuel': 'FUEL', 'hud.jump': 'JUMPS', 'hud.distance': 'DISTANCE', 'hud.score': 'SCORE', 'hud.speed': 'SPEED', 'hud.elapsed': 'TIME', 'hud.localBest': 'LOCAL BEST', 'hud.musicOn': 'AUDIO ON', 'hud.musicOff': 'AUDIO OFF', 'hud.shootHint': 'J: FIRE / HOLD TO CHARGE',
      'settings.label': 'Game settings', 'settings.musicOn': 'MUSIC ON', 'settings.musicOff': 'MUSIC OFF', 'settings.sfxOn': 'SFX ON', 'settings.sfxOff': 'SFX OFF',
      'status.chargeIdle': 'MISSILE CHARGE', 'status.charging': 'CHARGING {percent}%', 'status.chargeReady': 'MISSILE READY', 'status.boost': 'BOOST {seconds}s', 'status.boostWarning': 'BOOST ENDING {seconds}s', 'status.super': 'SUPER FORM {seconds}s', 'status.superWarning': 'SUPER ENDING {seconds}s', 'status.magnet': 'MAGNET {seconds}s', 'effect.superForm': '★ SUPER FORM ★',
      'gameover.title': 'MISSION ENDED', 'death.wall': 'Collision detected', 'death.gap': 'Lost to the void', 'death.fuel': 'Fuel depleted', 'death.enemy': 'Enemy collision', 'death.default': 'Mission ended',
      'result.score': 'Score {value}', 'result.distance': 'Distance {value} m', 'result.elapsed': 'Time {value}', 'result.qualified': 'Entered Local Top 15 at #{rank}', 'result.notQualified': 'Top 15 cutoff: {value}', 'result.newLocalBest': 'New local best!', 'result.restart': 'Fly Again', 'result.menu': 'Command Center',
      'leaderboard.title': 'LOCAL TOP 15', 'leaderboard.rank': 'Rank', 'leaderboard.name': 'Pilot', 'leaderboard.score': 'Score', 'leaderboard.distance': 'Distance', 'leaderboard.time': 'Time', 'leaderboard.date': 'Date', 'leaderboard.empty': 'Complete a mission to set the first record.', 'leaderboard.close': 'Close', 'leaderboard.rename': 'Rename Pilot', 'leaderboard.newest': 'NEW', 'leaderboard.cutoff': 'Cutoff {value}', 'leaderboard.persistenceWarning': 'Records are available for this session but could not be saved.', 'leaderboard.legacyBest': 'Previous-version best: {value}',
      'rename.title': 'Pilot Name', 'rename.label': 'Name', 'rename.placeholder': 'Enter a name', 'rename.characterCount': '{count} / {max}', 'rename.save': 'Save', 'rename.cancel': 'Cancel', 'rename.emptyKeepsName': 'Leave empty to keep the current name.',
    }),
    'zh-CN': Object.freeze({
      'app.documentTitle': '星云巡航', 'meta.description': '驾驶飞船穿越无尽星云的高速科幻跑酷游戏。', 'canvas.label': '星云巡航游戏画面', 'language.switchToChinese': '中文', 'language.switchToEnglish': 'EN',
      'menu.title': '星云巡航', 'menu.subtitle': '星际指挥中心', 'menu.start': '开始任务', 'menu.leaderboard': '本机 Top 15', 'shortcut.startRestart': 'Enter / Space', 'shortcut.returnMenu': 'Esc',
      'controls.move': '移动：A / D 或 ← / →', 'controls.jump': '跳跃：K / 空格 / W / ↑', 'controls.shoot': '射击：点按或按住 J', 'controls.touch': '左右滑动变道 · 点按跳跃',
      'hud.fuel': '燃料', 'hud.jump': '跳跃', 'hud.distance': '距离', 'hud.score': '得分', 'hud.speed': '速度', 'hud.elapsed': '时间', 'hud.localBest': '本机最佳', 'hud.musicOn': '声音开启', 'hud.musicOff': '声音关闭', 'hud.shootHint': 'J：射击 / 按住蓄力',
      'settings.label': '游戏设置', 'settings.musicOn': '音乐开启', 'settings.musicOff': '音乐关闭', 'settings.sfxOn': '音效开启', 'settings.sfxOff': '音效关闭',
      'status.chargeIdle': '导弹蓄力', 'status.charging': '蓄力中 {percent}%', 'status.chargeReady': '导弹就绪', 'status.boost': '超级加速 {seconds}秒', 'status.boostWarning': '加速即将结束 {seconds}秒', 'status.super': '超级形态 {seconds}秒', 'status.superWarning': '形态即将结束 {seconds}秒', 'status.magnet': '磁铁 {seconds}秒', 'effect.superForm': '★ 超级形态 ★',
      'gameover.title': '任务结束', 'death.wall': '撞上障碍物', 'death.gap': '坠入虚空', 'death.fuel': '燃料耗尽', 'death.enemy': '撞上敌机', 'death.default': '任务结束',
      'result.score': '得分 {value}', 'result.distance': '距离 {value} 米', 'result.elapsed': '用时 {value}', 'result.qualified': '进入本机 Top 15，第 {rank} 名', 'result.notQualified': 'Top 15 门槛：{value}', 'result.newLocalBest': '本机新纪录！', 'result.restart': '再来一局', 'result.menu': '返回指挥中心',
      'leaderboard.title': '本机 TOP 15', 'leaderboard.rank': '名次', 'leaderboard.name': '玩家', 'leaderboard.score': '得分', 'leaderboard.distance': '距离', 'leaderboard.time': '用时', 'leaderboard.date': '日期', 'leaderboard.empty': '完成一局后即可留下第一条记录。', 'leaderboard.close': '关闭', 'leaderboard.rename': '修改名字', 'leaderboard.newest': '最新', 'leaderboard.cutoff': '门槛 {value}', 'leaderboard.persistenceWarning': '记录仅在本次会话可用，暂时无法保存。', 'leaderboard.legacyBest': '旧版本最佳：{value}',
      'rename.title': '玩家名字', 'rename.label': '名字', 'rename.placeholder': '输入名字', 'rename.characterCount': '{count} / {max}', 'rename.save': '保存', 'rename.cancel': '取消', 'rename.emptyKeepsName': '留空将保留当前名字。',
    }),
  });

  function resolveLocale({ savedLocale = null, languages = [], language = '' } = {}) {
    if (SUPPORTED_LOCALES.includes(savedLocale)) return savedLocale;
    const candidates = Array.isArray(languages) ? languages : [];
    if ([...candidates, language].some((value) => typeof value === 'string' && /^zh(?:-|$)/i.test(value))) return 'zh-CN';
    return 'en';
  }

  function readLocalePreference(storage, key = LOCALE_STORAGE_KEY) {
    try {
      const locale = storage && storage.getItem(key);
      return SUPPORTED_LOCALES.includes(locale) ? locale : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalePreference(storage, locale, key = LOCALE_STORAGE_KEY) {
    if (!SUPPORTED_LOCALES.includes(locale)) return false;
    try {
      if (!storage) return false;
      storage.setItem(key, locale);
      return true;
    } catch (_) {
      return false;
    }
  }

  function createTranslator(initialLocale, catalogs = MESSAGES) {
    const locale = resolveLocale({ savedLocale: initialLocale });
    const activeCatalog = catalogs[locale] || {};
    const englishCatalog = catalogs.en || {};
    return Object.freeze({
      locale,
      t(id, values = {}) {
        const message = activeCatalog[id] || englishCatalog[id] || `[${id}]`;
        return message.replace(/\{(\w+)\}/g, (_, name) => values[name] == null ? `{${name}}` : String(values[name]));
      },
      formatNumber(value, options) { return new Intl.NumberFormat(locale, options).format(value); },
      formatDate(value, options) { return new Intl.DateTimeFormat(locale, options).format(value); },
      countCharacters(value) { return Array.from(String(value == null ? '' : value)).length; },
    });
  }

  const api = Object.freeze({ SUPPORTED_LOCALES, LOCALE_STORAGE_KEY, MESSAGES, resolveLocale, readLocalePreference, writeLocalePreference, createTranslator });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.i18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

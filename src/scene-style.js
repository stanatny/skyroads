'use strict';

(function attachSceneStyle(root) {
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  const SCENE_STYLE = deepFreeze({
    background: Object.freeze({
      upper: '#080b16',
      horizon: '#1b1323',
      lower: '#04060a',
    }),
    road: Object.freeze({
      deckA: '#222a34',
      deckB: '#28323d',
      laneRgb: '151,166,176',
      edgeRgb: '194,207,214',
    }),
    player: Object.freeze({
      shadow: '#202833',
      mid: '#4a5158',
      highlight: '#fff2d4',
      identity: '#ffd36a',
    }),
    structure: Object.freeze({
      shadow: '#1c2730',
      mid: '#53616b',
      highlight: '#aebbc2',
      signal: '#ff9b45',
      danger: '#ff713d',
      beacon: '#ffd66b',
    }),
    hostile: Object.freeze({
      shadow: '#23142f',
      mid: '#7b285f',
      signal: '#ff4fa3',
      warning: '#ff4f63',
      cue: '#fff4f7',
      drone: Object.freeze({
        armorShadow: '#070a10',
        armorMid: '#171d26',
        armorHighlight: '#8f9baa',
        podRecess: '#0b0f16',
        energy: '#c70f48',
        core: '#ff315f',
        warningLight: '#ff3b4f',
      }),
    }),
    gap: Object.freeze({
      well: '#03040a',
      core: '#000005',
      innerRing: '#5de8ff',
      middleRing: '#6091ff',
      fringe: '#a05dff',
      sideFracture: '93,232,255',
      warningPrimary: '#ff6b4d',
      warningSecondary: '#ffb24c',
    }),
  });

  function relativeLuminance(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return NaN;
    const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrastRatio(foreground, background) {
    const foregroundLuminance = relativeLuminance(foreground);
    const backgroundLuminance = relativeLuminance(background);
    if (!Number.isFinite(foregroundLuminance) || !Number.isFinite(backgroundLuminance)) return NaN;
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function semanticRoleFor(category) {
    if (category === 'player') return 'player';
    if (category === 'drone' || category === 'turret' || category === 'enemy') return 'hostile';
    if (category === 'gap') return 'gap';
    if (category === 'fuel' || category === 'pickup') return 'pickup';
    if (category === 'wallLow'
      || category === 'wallMedium'
      || category === 'wallHigh'
      || category === 'corridorLow'
      || category === 'corridorMedium'
      || category === 'structure') return 'structure';
    return 'neutral';
  }

  const api = Object.freeze({
    SCENE_STYLE,
    relativeLuminance,
    contrastRatio,
    semanticRoleFor,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.sceneStyle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));

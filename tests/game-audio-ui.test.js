'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class FakeEventTarget {
  constructor(ownerDocument = null, tagName = '') {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.listeners = new Map();
    this.attributes = new Map();
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.style = {};
    this.textContent = '';
    this.value = '';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ type, target: this, preventDefault() {}, ...event });
    }
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  closest() { return null; }
  querySelectorAll() {
    const descendants = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(child.tagName)) descendants.push(child);
        visit(child);
      }
    };
    visit(this);
    return descendants;
  }
}

function makeGameUiSandbox({
  musicMuted = false,
  sfxMuted = false,
  loadAdaptiveAudio = true,
  storage = undefined,
  reducedMotion = false,
} = {}) {
  const documentObject = new FakeEventTarget();
  documentObject.ownerDocument = documentObject;
  documentObject.activeElement = null;
  documentObject.documentElement = {};
  documentObject.createElement = (tagName) => {
    const element = new FakeEventTarget(documentObject, tagName);
    if (tagName === 'audio') element.canPlayType = () => 'probably';
    return element;
  };

  const ids = [
    'game', 'app-ui', 'utility-controls', 'title-screen', 'pause-screen', 'game-over-screen',
    'leaderboard-dialog', 'rename-dialog', 'persistence-warning', 'aria-status',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, documentObject.createElement(id === 'game' ? 'canvas' : 'div')]));
  elements['leaderboard-dialog'].hidden = true;
  elements['rename-dialog'].hidden = true;
  const drawingContext = { setTransform() {} };
  elements.game.getContext = () => drawingContext;
  elements.game.setAttribute('tabindex', '-1');
  documentObject.getElementById = (id) => elements[id] || null;
  const meta = documentObject.createElement('meta');
  documentObject.querySelector = (selector) => {
    if (selector === 'meta[name="description"]') return meta;
    if (selector === '#app-ui [role="dialog"][aria-modal="true"]:not([hidden])') {
      return [elements['leaderboard-dialog'], elements['rename-dialog']].find((dialog) => !dialog.hidden) || null;
    }
    return null;
  };

  const windowObject = new FakeEventTarget();
  windowObject.innerWidth = 960;
  windowObject.innerHeight = 600;
  windowObject.devicePixelRatio = 1;
  const motionListeners = [];
  const motionQuery = {
    matches: Boolean(reducedMotion),
    addEventListener(type, listener) { if (type === 'change') motionListeners.push(listener); },
    removeEventListener(type, listener) {
      if (type !== 'change') return;
      const index = motionListeners.indexOf(listener);
      if (index >= 0) motionListeners.splice(index, 1);
    },
    setMatches(matches) {
      this.matches = Boolean(matches);
      for (const listener of motionListeners) listener({ matches: this.matches });
    },
  };
  windowObject.matchMedia = () => motionQuery;

  const audioContexts = [];
  class FakeImage {
    set src(value) {
      this.currentSrc = value;
      if (value.includes('/world/')) {
        this.naturalWidth = value.endsWith('/gap-edge.png') ? 3584 : 2240;
        this.naturalHeight = value.endsWith('/gap-edge.png') ? 512 : 960;
      }
      if (typeof this.onload === 'function') this.onload();
    }
  }
  class FakeAudioContext {
    constructor() {
      this.currentTime = 10;
      this.state = 'running';
      this.destination = {};
      this.gains = [];
      this.filters = [];
      audioContexts.push(this);
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() {
      const gain = {
        gain: {
          value: 0,
          cancelScheduledValues() {},
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; },
        },
        connect() {}, disconnect() {},
      };
      this.gains.push(gain);
      return gain;
    }
    createBiquadFilter() {
      const filter = {
        type: '', frequency: {
          value: 0,
          cancelScheduledValues() {},
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; },
        },
        connect() {}, disconnect() {},
      };
      this.filters.push(filter);
      return filter;
    }
    createBufferSource() {
      return { buffer: null, loop: false, connect() {}, disconnect() {}, start() {}, stop() {} };
    }
    decodeAudioData() { return Promise.resolve({ duration: 68.571 }); }
  }
  windowObject.AudioContext = FakeAudioContext;

  const stored = new Map([
    ['nebula-cruise.audio.music-muted', String(Boolean(musicMuted))],
    ['nebula-cruise.audio.sfx-muted', String(Boolean(sfxMuted))],
  ]);
  const defaultStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const localStorage = storage === undefined ? defaultStorage : storage;
  const observerCallbacks = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observerCallbacks.push(callback); }
    observe() {}
    disconnect() {}
  }
  const sandbox = {
    console,
    document: documentObject,
    window: windowObject,
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage,
    crypto: { randomUUID() { return '00000000-0000-4000-8000-000000000001'; } },
    performance: { now() { return 1000; } },
    requestAnimationFrame() {},
    setInterval() { return 1; },
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: true, arrayBuffer: async () => ({}) }),
    MutationObserver: FakeMutationObserver,
    Image: FakeImage,
  };
  vm.createContext(sandbox);
  const files = ['version.js', 'i18n.js', 'leaderboard.js', 'presentation.js', 'world-art.js', 'input.js', 'obstacles.js'];
  if (loadAdaptiveAudio) files.push('audio.js');
  files.push('game.js');
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox, { filename: file });
  }
  return {
    sandbox,
    windowObject,
    documentObject,
    elements,
    audioContexts,
    motionQuery,
    dispatchOverlayMutation() { for (const callback of observerCallbacks) callback([]); },
  };
}

test('game wiring renders the V1.1 badge and localized pause panel without taking focus', () => {
  const { sandbox, documentObject, elements } = makeGameUiSandbox();
  const preservedFocus = elements.game;
  preservedFocus.focus();

  vm.runInContext("STATE.mode = 'PAUSED'; refreshPresentation()", sandbox);

  const rendered = vm.runInContext(`({
    versionText: STATE.ui.versionBadge.textContent,
    versionLabel: STATE.ui.versionBadge.getAttribute('aria-label'),
    pauseTitle: STATE.ui.pauseHeading.textContent,
    pauseHint: STATE.ui.pauseHint.textContent,
    pauseControl: STATE.ui.controlItems[4].textContent,
    pauseHidden: STATE.ui.pauseScreen.hidden,
  })`, sandbox);
  assert.deepEqual({ ...rendered }, {
    versionText: 'V1.1',
    versionLabel: 'Version 1.1',
    pauseTitle: 'GAME PAUSED',
    pauseHint: 'Press P to resume',
    pauseControl: 'Pause / resume: P',
    pauseHidden: false,
  });
  assert.equal(documentObject.activeElement, preservedFocus);

  vm.runInContext('STATE.ui.languageButton.dispatch(\'click\')', sandbox);
  const localized = vm.runInContext(`({
    versionLabel: STATE.ui.versionBadge.getAttribute('aria-label'),
    pauseTitle: STATE.ui.pauseHeading.textContent,
    pauseHint: STATE.ui.pauseHint.textContent,
    pauseControl: STATE.ui.controlItems[4].textContent,
    pauseHidden: STATE.ui.pauseScreen.hidden,
  })`, sandbox);
  assert.deepEqual({ ...localized }, {
    versionLabel: '版本 1.1',
    pauseTitle: '游戏已暂停',
    pauseHint: '按 P 继续',
    pauseControl: '暂停 / 继续：P',
    pauseHidden: false,
  });
  assert.equal(documentObject.activeElement, preservedFocus);
});

test('release diagnostics expose complete preferred world atlas readiness', async () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const diagnostics = await vm.runInContext('Skyroads.diagnostics.ready', sandbox);

  assert.equal(diagnostics.scripts.worldArt, true);
  assert.deepEqual(Array.from(diagnostics.visualAssets.world.loaded), [
    'droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail',
    'barrierCrate', 'structurePylon', 'structureBastion', 'structureReactor',
    'structureTower', 'corridorLow', 'corridorMedium', 'gapEdge',
  ]);
  assert.deepEqual(Array.from(diagnostics.visualAssets.world.fallback), []);
  assert.deepEqual({ ...diagnostics.visualAssets.world.categoryReady }, {
    drone: true, turret: true, wallLow: true, wallMedium: true, wallHigh: true,
    corridorLow: true, corridorMedium: true, gap: true,
  });
  assert.equal(Object.isFrozen(diagnostics.visualAssets.world), true);
});

test('drone direction telegraphs keep the exact reaction and movement windows', () => {
  const { sandbox } = makeGameUiSandbox();
  const timing = vm.runInContext('({ warn: CONFIG.DRONE_WARN_TIME, move: CONFIG.DRONE_MOVE_TIME })', sandbox);
  assert.deepEqual({ ...timing }, { warn: 0.6, move: 0.4 });
});

function appUiTarget(elements, tagName = 'button') {
  const target = new FakeEventTarget(elements['app-ui'].ownerDocument, tagName);
  target.closest = (selector) => selector === '#app-ui' ? elements['app-ui'] : null;
  return target;
}

function markInsideAppUi(element) {
  element.closest = (selector) => selector === '#app-ui' ? { id: 'app-ui' } : null;
  return element;
}

function dispatchMissionShortcut(windowObject, target, code, repeat = false) {
  let prevented = false;
  windowObject.dispatch('keydown', {
    code,
    key: code === 'Space' ? ' ' : 'Enter',
    target,
    repeat,
    defaultPrevented: false,
    preventDefault() { prevented = true; },
  });
  return prevented;
}

for (const [mode, buttonName] of [['MENU', 'startButton'], ['GAMEOVER', 'restartButton']]) {
  for (const code of ['Enter', 'Space']) {
    test(`${mode} accepts ${code} from its focused primary button`, () => {
      const { sandbox, windowObject } = makeGameUiSandbox();
      vm.runInContext(`STATE.mode = '${mode}'`, sandbox);
      const button = markInsideAppUi(vm.runInContext(`STATE.ui.${buttonName}`, sandbox));

      const prevented = dispatchMissionShortcut(windowObject, button, code);

      assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
      assert.equal(prevented, true);
    });
  }
}

test('repeated mission shortcuts do not start a menu mission', () => {
  const { sandbox, windowObject, elements } = makeGameUiSandbox();

  const prevented = dispatchMissionShortcut(windowObject, elements.game, 'Space', true);

  assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');
  assert.equal(prevented, false);
});

for (const [label, prepare] of [
  ['an editing target', ({ elements }) => appUiTarget(elements, 'input')],
  ['an open dialog', ({ elements }) => {
    elements['leaderboard-dialog'].hidden = false;
    return elements.game;
  }],
]) {
  test(`a repeated shortcut with ${label} leaves the input lifecycle untouched`, () => {
    const game = makeGameUiSandbox();
    const { sandbox, windowObject } = game;
    vm.runInContext(`
      KEYS.KeyJ = true;
      STATE.chargeT = 2;
      STATE.chargeStage = 2;
      STATE.gliding = true;
      STATE.movement.heldLeft = true;
      STATE.movement.activeDirection = -1;
    `, sandbox);

    dispatchMissionShortcut(windowObject, prepare(game), 'Space', true);

    const state = vm.runInContext(`({
      heldLeft: STATE.movement.heldLeft,
      activeDirection: STATE.movement.activeDirection,
      keyJ: KEYS.KeyJ,
      chargeT: STATE.chargeT,
      chargeStage: STATE.chargeStage,
      gliding: STATE.gliding,
    })`, sandbox);
    assert.deepEqual({ ...state }, {
      heldLeft: true,
      activeDirection: -1,
      keyJ: true,
      chargeT: 2,
      chargeStage: 2,
      gliding: true,
    });
  });
}

for (const [label, target] of [
  ['input', (elements) => appUiTarget(elements, 'input')],
  ['contenteditable', (elements) => {
    const element = appUiTarget(elements);
    element.setAttribute('contenteditable', 'true');
    return element;
  }],
]) {
  test(`${label} targets do not start a menu mission`, () => {
    const { sandbox, windowObject, elements } = makeGameUiSandbox();

    const prevented = dispatchMissionShortcut(windowObject, target(elements), 'Enter');

    assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');
    assert.equal(prevented, false);
  });
}

for (const dialogName of ['leaderboard-dialog', 'rename-dialog']) {
  test(`an open ${dialogName} does not start a menu mission`, () => {
    const { sandbox, windowObject, elements } = makeGameUiSandbox();
    elements[dialogName].hidden = false;

    const prevented = dispatchMissionShortcut(windowObject, elements.game, 'Space');

    assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');
    assert.equal(prevented, false);
  });
}

test('a non-primary app UI button does not start a menu mission or suppress native activation', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  const musicButton = markInsideAppUi(vm.runInContext('STATE.ui.musicButton', sandbox));

  const prevented = dispatchMissionShortcut(windowObject, musicButton, 'Space');

  assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');
  assert.equal(prevented, false);
});

test('a Canvas target still starts a menu mission', () => {
  const { sandbox, windowObject, elements } = makeGameUiSandbox();

  const prevented = dispatchMissionShortcut(windowObject, elements.game, 'Enter');

  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
  assert.equal(prevented, true);
});

test('M retains total-mute semantics when adaptive audio is unavailable', () => {
  const { sandbox, windowObject } = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext('startGame()', sandbox);

  windowObject.dispatch('keydown', { key: 'M', code: 'KeyM' });

  const state = vm.runInContext(`({
    musicMuted: audioIsMusicMuted(),
    sfxMuted: audioIsSfxMuted(),
    mirror: AUDIO.muted,
    master: AUDIO.master.gain.value,
  })`, sandbox);
  assert.deepEqual({ ...state }, {
    musicMuted: true, sfxMuted: true, mirror: true, master: 0,
  });
});

test('starting a run sends the normal adaptive music mix through the shared bus', async () => {
  const { sandbox, audioContexts } = makeGameUiSandbox();
  const controller = vm.runInContext('STATE.audioController', sandbox);
  vm.runInContext('startGame()', sandbox);
  await controller.ready;

  const adaptiveContext = audioContexts.at(-1);
  assert.deepEqual(adaptiveContext.gains.map((gain) => gain.gain.value), [0.55, 0.48, 1, 0.42]);
  assert.equal(adaptiveContext.filters[0].frequency.value, 11000);
});

test('a saved partial preference keeps the shared legacy bus audible for the enabled channel', () => {
  const { sandbox } = makeGameUiSandbox({ musicMuted: true, sfxMuted: false });
  vm.runInContext('startGame()', sandbox);

  const state = vm.runInContext(`({
    musicMuted: audioIsMusicMuted(),
    sfxMuted: audioIsSfxMuted(),
    master: AUDIO.master.gain.value,
    musicLabel: STATE.ui.musicButton.textContent,
    sfxLabel: STATE.ui.sfxButton.textContent,
  })`, sandbox);
  assert.deepEqual({ ...state }, {
    musicMuted: true, sfxMuted: false, master: 0.45,
    musicLabel: 'MUSIC OFF', sfxLabel: 'SFX ON',
  });
});

for (const control of ['music', 'sfx']) {
  test(`the ${control} control coherently restores legacy audio after M total mute`, () => {
    const { sandbox, windowObject } = makeGameUiSandbox();
    vm.runInContext('startGame()', sandbox);
    windowObject.dispatch('keydown', { key: 'M', code: 'KeyM' });

    const totalMute = vm.runInContext(`({
      musicMuted: audioIsMusicMuted(),
      sfxMuted: audioIsSfxMuted(),
      master: AUDIO.master.gain.value,
      musicLabel: STATE.ui.musicButton.textContent,
      sfxLabel: STATE.ui.sfxButton.textContent,
    })`, sandbox);
    assert.deepEqual({ ...totalMute }, {
      musicMuted: true, sfxMuted: true, master: 0,
      musicLabel: 'MUSIC OFF', sfxLabel: 'SFX OFF',
    });

    vm.runInContext(`STATE.ui.${control}Button.dispatch('click')`, sandbox);
    const restored = vm.runInContext(`({
      musicMuted: audioIsMusicMuted(),
      sfxMuted: audioIsSfxMuted(),
      master: AUDIO.master.gain.value,
      musicLabel: STATE.ui.musicButton.textContent,
      sfxLabel: STATE.ui.sfxButton.textContent,
    })`, sandbox);
    assert.equal(restored.master, 0.45);
    assert.equal(restored[`${control}Muted`], false);
    assert.equal(restored[control === 'music' ? 'sfxMuted' : 'musicMuted'], true);
    assert.equal(restored[`${control}Label`], control === 'music' ? 'MUSIC ON' : 'SFX ON');
  });
}

test('held gameplay actions use stable codes and ignore repeated keydown events', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);

  windowObject.dispatch('keydown', { key: 'μ', code: 'KeyM', repeat: false });
  windowObject.dispatch('keydown', { key: 'μ', code: 'KeyM', repeat: true });
  windowObject.dispatch('keydown', { key: 'κ', code: 'KeyK', repeat: false });
  windowObject.dispatch('keydown', { key: 'ĵ', code: 'KeyJ', repeat: false });

  const state = vm.runInContext(`({
    muted: audioIsMusicMuted() && audioIsSfxMuted(),
    jumpsUsed: STATE.jumpsUsed,
    chargeT: STATE.chargeT,
    heldCodes: Object.keys(KEYS).filter((key) => KEYS[key]).sort(),
  })`, sandbox);
  assert.deepEqual({ ...state, heldCodes: [...state.heldCodes] }, {
    muted: true,
    jumpsUsed: 1,
    chargeT: 0.001,
    heldCodes: ['KeyJ', 'KeyK', 'KeyM'],
  });
});

test('P toggles only PLAYING and PAUSED after editing and dialog guards', () => {
  const { sandbox, windowObject, documentObject, elements } = makeGameUiSandbox();
  const utility = appUiTarget(elements);
  let prevented = 0;
  const pressPause = (target = utility, repeat = false) => windowObject.dispatch('keydown', {
    code: 'KeyP', target, repeat, preventDefault() { prevented++; },
  });

  pressPause();
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');

  vm.runInContext('startGame()', sandbox);
  documentObject.activeElement = utility;
  pressPause();
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
  assert.deepEqual({ ...vm.runInContext('Skyroads.diagnostics.snapshot().overlays', sandbox) }, {
    title: false, pause: true, gameOver: false,
  });
  pressPause(utility, true);
  pressPause();
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');

  windowObject.dispatch('keyup', { code: 'KeyP', target: utility });
  vm.runInContext('STATE.lastTime = 123', sandbox);
  pressPause();
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
  assert.equal(vm.runInContext('STATE.lastTime', sandbox), 0);
  assert.equal(documentObject.activeElement, utility);
  assert.equal(prevented, 2);

  windowObject.dispatch('keyup', { code: 'KeyP', target: utility });
  const inputTarget = appUiTarget(elements, 'input');
  const editableTarget = appUiTarget(elements, 'div');
  editableTarget.isContentEditable = true;
  for (const target of [inputTarget, editableTarget]) {
    const beforeMode = vm.runInContext('STATE.mode', sandbox);
    pressPause(target);
    assert.equal(vm.runInContext('STATE.mode', sandbox), beforeMode);
  }

  for (const dialogName of ['leaderboard-dialog', 'rename-dialog']) {
    elements[dialogName].hidden = false;
    const beforeDialogMode = vm.runInContext('STATE.mode', sandbox);
    pressPause(utility);
    assert.equal(vm.runInContext('STATE.mode', sandbox), beforeDialogMode);
    elements[dialogName].hidden = true;
  }

  vm.runInContext("STATE.mode = 'GAMEOVER'", sandbox);
  pressPause();
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'GAMEOVER');
  assert.equal(prevented, 2);
});

test('pause clears movement glide and charge without firing', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext(`
    startGame();
    STATE.movement.heldRight = true;
    STATE.movement.activeDirection = 1;
    STATE.movement.segmentActive = true;
    STATE.chargeT = 2;
    STATE.chargeStage = 2;
    STATE.gliding = true;
    KEYS.KeyJ = true;
  `, sandbox);

  windowObject.dispatch('keydown', { code: 'KeyP' });
  windowObject.dispatch('keyup', { code: 'KeyJ' });

  const state = vm.runInContext(`({
    mode: STATE.mode,
    heldRight: STATE.movement.heldRight,
    activeDirection: STATE.movement.activeDirection,
    segmentActive: STATE.movement.segmentActive,
    chargeT: STATE.chargeT,
    chargeStage: STATE.chargeStage,
    gliding: STATE.gliding,
    shots: STATE.shots.length,
    activeKeys: Object.keys(KEYS).filter((key) => KEYS[key]),
  })`, sandbox);
  assert.deepEqual({ ...state, activeKeys: [...state.activeKeys] }, {
    mode: 'PAUSED', heldRight: false, activeDirection: 0, segmentActive: true,
    chargeT: 0, chargeStage: 0, gliding: false, shots: 0, activeKeys: [],
  });
});

test('paused gameplay keys are inert while global mute remains usable and focus stays put', () => {
  const { sandbox, windowObject, documentObject, elements } = makeGameUiSandbox();
  const utility = appUiTarget(elements);
  vm.runInContext('startGame()', sandbox);
  documentObject.activeElement = utility;
  windowObject.dispatch('keydown', { code: 'KeyP', target: utility });
  const before = vm.runInContext('JSON.stringify({ y: STATE.playerY, shots: STATE.shots, keys: KEYS })', sandbox);

  for (const code of ['KeyA', 'KeyD', 'KeyJ', 'KeyK', 'Space', 'Enter']) {
    windowObject.dispatch('keydown', { code, target: utility });
  }

  assert.equal(vm.runInContext('JSON.stringify({ y: STATE.playerY, shots: STATE.shots, keys: KEYS })', sandbox), before);
  windowObject.dispatch('keydown', { code: 'KeyM', target: utility });
  assert.equal(vm.runInContext('audioIsMusicMuted() && audioIsSfxMuted()', sandbox), true);
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
  assert.equal(documentObject.activeElement, utility);
});

test('blur and hidden-page cleanup release the P latch without auto-pausing', () => {
  const { sandbox, windowObject, documentObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);

  windowObject.dispatch('keydown', { code: 'KeyP' });
  windowObject.dispatch('blur');
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
  windowObject.dispatch('keydown', { code: 'KeyP' });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');

  documentObject.hidden = true;
  documentObject.dispatch('visibilitychange');
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
  windowObject.dispatch('keydown', { code: 'KeyP' });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
});

test('pause fades adaptive music to atmosphere and restores an audible legacy bus without rewriting preferences', async () => {
  const { sandbox, windowObject, audioContexts } = makeGameUiSandbox();
  const controller = vm.runInContext('STATE.audioController', sandbox);
  vm.runInContext('startGame()', sandbox);
  await controller.ready;
  const adaptiveContext = audioContexts.at(-1);
  const preferencesBefore = [
    sandbox.localStorage.getItem('nebula-cruise.audio.music-muted'),
    sandbox.localStorage.getItem('nebula-cruise.audio.sfx-muted'),
  ];

  windowObject.dispatch('keydown', { code: 'KeyP' });
  assert.equal(vm.runInContext('AUDIO.master.gain.value', sandbox), 0);
  assert.deepEqual(adaptiveContext.gains.map((gain) => gain.gain.value), [0.55, 1, 0, 0]);
  assert.equal(adaptiveContext.filters[0].frequency.value, 4200);

  windowObject.dispatch('keyup', { code: 'KeyP' });
  windowObject.dispatch('keydown', { code: 'KeyP' });
  assert.equal(vm.runInContext('AUDIO.master.gain.value', sandbox), 0.45);
  assert.deepEqual(adaptiveContext.gains.map((gain) => gain.gain.value), [0.55, 0.48, 1, 0.42]);
  assert.equal(adaptiveContext.filters[0].frequency.value, 11000);
  assert.deepEqual([
    sandbox.localStorage.getItem('nebula-cruise.audio.music-muted'),
    sandbox.localStorage.getItem('nebula-cruise.audio.sfx-muted'),
  ], preferencesBefore);
});

test('a legacy bus muted before pause stays muted after resume', () => {
  const { sandbox, windowObject } = makeGameUiSandbox({ musicMuted: true, sfxMuted: true });
  vm.runInContext('startGame()', sandbox);
  const gains = [vm.runInContext('AUDIO.master.gain.value', sandbox)];
  const modes = [vm.runInContext('STATE.mode', sandbox)];

  windowObject.dispatch('keydown', { code: 'KeyP' });
  gains.push(vm.runInContext('AUDIO.master.gain.value', sandbox));
  modes.push(vm.runInContext('STATE.mode', sandbox));
  windowObject.dispatch('keyup', { code: 'KeyP' });
  windowObject.dispatch('keydown', { code: 'KeyP' });
  gains.push(vm.runInContext('AUDIO.master.gain.value', sandbox));
  modes.push(vm.runInContext('STATE.mode', sandbox));

  assert.deepEqual(gains, [0, 0, 0]);
  assert.deepEqual(modes, ['PLAYING', 'PAUSED', 'PLAYING']);
  assert.equal(sandbox.localStorage.getItem('nebula-cruise.audio.music-muted'), 'true');
  assert.equal(sandbox.localStorage.getItem('nebula-cruise.audio.sfx-muted'), 'true');
});

for (const control of ['music', 'sfx']) {
  test(`the ${control} utility remains live while paused without leaking legacy audio`, () => {
    const { sandbox, windowObject } = makeGameUiSandbox();
    vm.runInContext('startGame()', sandbox);
    windowObject.dispatch('keydown', { code: 'KeyP' });

    vm.runInContext(`STATE.ui.${control}Button.dispatch('click')`, sandbox);
    assert.equal(vm.runInContext(`audioIs${control === 'music' ? 'Music' : 'Sfx'}Muted()`, sandbox), true);
    assert.equal(vm.runInContext('AUDIO.master.gain.value', sandbox), 0);
    assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');

    vm.runInContext(`STATE.ui.${control}Button.dispatch('click')`, sandbox);
    assert.equal(vm.runInContext(`audioIs${control === 'music' ? 'Music' : 'Sfx'}Muted()`, sandbox), false);
    assert.equal(vm.runInContext('AUDIO.master.gain.value', sandbox), 0);
    assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
  });
}

test('M and game-over Escape work from non-editing app controls but stay suppressed in text fields and dialogs', () => {
  const { sandbox, windowObject, elements } = makeGameUiSandbox();
  const buttonTarget = appUiTarget(elements);
  const inputTarget = appUiTarget(elements, 'input');
  vm.runInContext('startGame()', sandbox);

  windowObject.dispatch('keydown', { key: 'm', code: 'KeyM', target: buttonTarget });
  assert.equal(vm.runInContext('audioIsMusicMuted() && audioIsSfxMuted()', sandbox), true);
  windowObject.dispatch('keyup', { key: 'm', code: 'KeyM', target: buttonTarget });
  windowObject.dispatch('keydown', { key: 'm', code: 'KeyM', target: inputTarget });
  assert.equal(vm.runInContext('audioIsMusicMuted() && audioIsSfxMuted()', sandbox), true);

  vm.runInContext("die('wall')", sandbox);
  windowObject.dispatch('keydown', { key: 'Escape', code: 'Escape', target: inputTarget });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'GAMEOVER');
  windowObject.dispatch('keydown', { key: 'Escape', code: 'Escape', target: buttonTarget });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');

  vm.runInContext('startGame()', sandbox);
  elements['leaderboard-dialog'].hidden = false;
  windowObject.dispatch('keyup', { key: 'm', code: 'KeyM', target: buttonTarget });
  windowObject.dispatch('keydown', { key: 'm', code: 'KeyM', target: buttonTarget });
  assert.equal(vm.runInContext('audioIsMusicMuted() && audioIsSfxMuted()', sandbox), true);
  vm.runInContext("STATE.mode = 'GAMEOVER'", sandbox);
  windowObject.dispatch('keydown', { key: 'Escape', code: 'Escape', target: buttonTarget });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'GAMEOVER');
});

test('losing input ownership clears every held action without firing and lets an active lane segment finish', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  windowObject.dispatch('keydown', { key: 'd', code: 'KeyD' });
  windowObject.dispatch('keydown', { key: 'j', code: 'KeyJ' });
  windowObject.dispatch('keydown', { key: 'k', code: 'KeyK' });
  vm.runInContext(`
    advanceMovement(STATE.movement, 70);
    STATE.playerY = 10;
    STATE.playerVY = -1;
    STATE.gliding = true;
    globalThis.__glideStops = 0;
    AUDIO.glideNodes = {
      gain: { gain: { exponentialRampToValueAtTime() {} } },
      src: { stop() { globalThis.__glideStops++; } },
      lfo: { stop() { globalThis.__glideStops++; } },
      lfo2: { stop() { globalThis.__glideStops++; } },
    };
  `, sandbox);
  const interruptedPosition = vm.runInContext('STATE.movement.lanePosition', sandbox);

  windowObject.dispatch('blur');

  const cleared = vm.runInContext(`({
    heldLeft: STATE.movement.heldLeft,
    heldRight: STATE.movement.heldRight,
    segmentActive: STATE.movement.segmentActive,
    chargeT: STATE.chargeT,
    chargeStage: STATE.chargeStage,
    gliding: STATE.gliding,
    activeKeys: Object.keys(KEYS).filter((key) => KEYS[key]),
    shots: STATE.shots.length,
    glideNodes: AUDIO.glideNodes,
    glideStops: globalThis.__glideStops,
  })`, sandbox);
  assert.equal(cleared.heldLeft, false);
  assert.equal(cleared.heldRight, false);
  assert.equal(cleared.segmentActive, true, 'blur must not snap an in-flight lane segment');
  assert.equal(cleared.chargeT, 0);
  assert.equal(cleared.chargeStage, 0);
  assert.equal(cleared.gliding, false);
  assert.deepEqual([...cleared.activeKeys], []);
  assert.equal(cleared.shots, 0);
  assert.equal(cleared.glideNodes, null);
  assert.equal(cleared.glideStops, 3);
  assert.equal(vm.runInContext('STATE.movement.lanePosition', sandbox), interruptedPosition);

  vm.runInContext('advanceMovement(STATE.movement, 100)', sandbox);
  assert.equal(vm.runInContext('STATE.movement.lanePosition', sandbox), 4);
  assert.equal(vm.runInContext('STATE.movement.segmentActive', sandbox), false);
});

test('visibility, app focus, modal transitions, restart, menu, and game over clear the full input lifecycle', () => {
  const { sandbox, windowObject, documentObject, elements, dispatchOverlayMutation } = makeGameUiSandbox();
  const dirty = () => vm.runInContext(`
    KEYS.KeyJ = true;
    KEYS.KeyK = true;
    STATE.chargeT = 2;
    STATE.chargeStage = 2;
    STATE.gliding = true;
    STATE.movement.heldLeft = true;
    STATE.movement.activeDirection = -1;
  `, sandbox);
  const assertCleared = (label) => {
    const state = vm.runInContext(`({
      activeKeys: Object.keys(KEYS).filter((key) => KEYS[key]).length,
      chargeT: STATE.chargeT,
      chargeStage: STATE.chargeStage,
      gliding: STATE.gliding,
      heldLeft: STATE.movement.heldLeft,
      heldRight: STATE.movement.heldRight,
    })`, sandbox);
    assert.deepEqual({ ...state }, {
      activeKeys: 0, chargeT: 0, chargeStage: 0, gliding: false, heldLeft: false, heldRight: false,
    }, label);
  };

  vm.runInContext('startGame()', sandbox);
  dirty();
  documentObject.hidden = true;
  documentObject.dispatch('visibilitychange');
  assertCleared('visibility');

  dirty();
  documentObject.dispatch('focusin', { target: appUiTarget(elements) });
  assertCleared('app focus');

  dirty();
  elements['leaderboard-dialog'].hidden = false;
  dispatchOverlayMutation();
  assertCleared('modal');
  elements['leaderboard-dialog'].hidden = true;

  dirty();
  vm.runInContext('startGame()', sandbox);
  assertCleared('restart');

  dirty();
  vm.runInContext('gotoMenu()', sandbox);
  assertCleared('menu');

  vm.runInContext('startGame()', sandbox);
  dirty();
  vm.runInContext("die('wall')", sandbox);
  assertCleared('game over');
});

test('reduced-motion preference updates live and materially reduces Canvas effects without stopping gameplay', () => {
  const { sandbox, motionQuery } = makeGameUiSandbox({ reducedMotion: false });
  assert.equal(vm.runInContext('STATE.reducedMotion', sandbox), false);
  motionQuery.setMatches(true);
  assert.equal(vm.runInContext('STATE.reducedMotion', sandbox), true);

  vm.runInContext('startGame(); updatePhysics(0.01)', sandbox);
  assert.ok(vm.runInContext('STATE.position', sandbox) > 0, 'world/gameplay motion must continue');
  vm.runInContext("die('wall')", sandbox);
  const effects = vm.runInContext(`({
    shake: STATE.shake,
    flash: STATE.flash,
    particles: STATE.particles.length,
    shockwave: STATE.shockwave,
  })`, sandbox);
  assert.deepEqual({ ...effects }, { shake: 0, flash: 0.15, particles: 12, shockwave: null });
});

test('enabling reduced motion scrubs moving decorative effects already on screen', () => {
  const { sandbox, motionQuery } = makeGameUiSandbox({ reducedMotion: false });
  vm.runInContext(`
    STATE.shake = 1;
    STATE.shockwave = { x: 1, y: 2, r: 3, alpha: 1 };
    STATE.trail = [{ x: 4, y: 5, vx: 6, vy: 7, life: 1, maxLife: 1 }];
    STATE.particles = Array.from({ length: 48 }, (_, index) => ({
      x: index, y: index + 1, vx: 20, vy: 30, life: 1, maxLife: 1,
      spin: 4, ang: 0, size: 1, color: '#fff',
    }));
  `, sandbox);

  motionQuery.setMatches(true);
  const beforeUpdate = JSON.parse(vm.runInContext(`JSON.stringify({
    shake: STATE.shake,
    shockwave: STATE.shockwave,
    trail: STATE.trail.length,
    particles: STATE.particles.map((particle) => ({
      x: particle.x, y: particle.y, vx: particle.vx, vy: particle.vy, spin: particle.spin,
    })),
  })`, sandbox));
  vm.runInContext('updateEffects(0.1)', sandbox);
  const afterUpdate = JSON.parse(vm.runInContext(`JSON.stringify(STATE.particles.map((particle) => ({
    x: particle.x, y: particle.y, vx: particle.vx, vy: particle.vy, spin: particle.spin,
  })))`, sandbox));

  assert.equal(beforeUpdate.shake, 0);
  assert.equal(beforeUpdate.shockwave, null);
  assert.equal(beforeUpdate.trail, 0);
  assert.equal(beforeUpdate.particles.length, 12);
  assert.ok(beforeUpdate.particles.every((particle) => particle.vx === 0 && particle.vy === 0 && particle.spin === 0));
  assert.deepEqual(afterUpdate, beforeUpdate.particles);
});

test('reduced-motion Canvas rendering freezes decorative parallax while normal rendering still drifts', () => {
  const { sandbox } = makeGameUiSandbox();
  const capture = (reduced, position) => JSON.parse(vm.runInContext(`(() => {
    STATE.reducedMotion = ${reduced};
    STATE.position = ${position};
    STATE.time = 1.25;
    const arcs = [];
    const gradient = { addColorStop() {} };
    const context = {
      globalAlpha: 1,
      createLinearGradient() { return gradient; },
      createRadialGradient() { return gradient; },
      fillRect() {}, beginPath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {},
      arc(x, y, radius) { arcs.push([x, y, radius]); },
    };
    renderBackground(context);
    return JSON.stringify(arcs);
  })()`, sandbox));

  assert.deepEqual(capture(true, 0), capture(true, 100));
  assert.notDeepEqual(capture(false, 0), capture(false, 100));
});

test('reduced-motion freezes pickup animation and suppresses random ship trails and flame jitter', () => {
  const { sandbox } = makeGameUiSandbox();
  const capturePickup = (reduced, time) => JSON.parse(vm.runInContext(`(() => {
    STATE.reducedMotion = ${reduced};
    STATE.time = ${time};
    const events = [];
    const gradient = { addColorStop(...args) { events.push(['stop', ...args]); } };
    const context = new Proxy({
      createLinearGradient(...args) { events.push(['linear', ...args]); return gradient; },
      createRadialGradient(...args) { events.push(['radial', ...args]); return gradient; },
    }, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => { events.push([String(key), ...args]); };
      },
      set(target, key, value) { events.push(['set', String(key), value]); target[key] = value; return true; },
    });
    renderPickup(context, LANE_TYPE.BOOST, 3, 10, 900, 1200);
    return JSON.stringify(events);
  })()`, sandbox));
  const renderShip = (reduced) => JSON.parse(vm.runInContext(`(() => {
    STATE.reducedMotion = ${reduced};
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    STATE.boostT = 1;
    STATE.tripleT = 1;
    STATE.trail = [];
    const originalRandom = Math.random;
    let randomCalls = 0;
    Math.random = () => { randomCalls += 1; return 0.5; };
    const gradient = { addColorStop() {} };
    const context = new Proxy({
      createLinearGradient() { return gradient; },
      createRadialGradient() { return gradient; },
    }, {
      get(target, key) { return key in target ? target[key] : () => {}; },
      set(target, key, value) { target[key] = value; return true; },
    });
    try {
      renderPlayer(context);
      return JSON.stringify({ trail: STATE.trail.length, randomCalls });
    } finally {
      Math.random = originalRandom;
    }
  })()`, sandbox));

  assert.deepEqual(capturePickup(true, 1), capturePickup(true, 2));
  assert.notDeepEqual(capturePickup(false, 1), capturePickup(false, 2));
  assert.deepEqual(renderShip(true), { trail: 0, randomCalls: 0 });
  assert.ok(renderShip(false).trail > 0);
  assert.ok(renderShip(false).randomCalls > 0);
});

test('fuel and reward icons retain their silhouettes while sharing metal rims and environment reflection', () => {
  const { sandbox } = makeGameUiSandbox();
  const capture = (type) => JSON.parse(vm.runInContext(`(() => {
    STATE.width = 960;
    STATE.height = 600;
    STATE.time = 1;
    const events = [];
    let currentPath = [];
    const target = {
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      beginPath() { currentPath = []; },
      moveTo(...args) { currentPath.push(['moveTo', ...args]); },
      lineTo(...args) { currentPath.push(['lineTo', ...args]); },
      closePath() { currentPath.push(['closePath']); },
      arc(...args) { currentPath.push(['arc', ...args]); },
      ellipse(...args) { currentPath.push(['ellipse', ...args]); },
      fill() { events.push({ type: 'fill', style: typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient', path: currentPath }); },
      stroke() { events.push({ type: 'stroke', style: typeof this.strokeStyle === 'string' ? this.strokeStyle : 'gradient', path: currentPath }); },
      fillRect(...args) { events.push({ type: 'fillRect', style: this.fillStyle, args }); },
      createLinearGradient() {
        return { addColorStop(offset, color) { events.push({ type: 'stop', offset, color }); } };
      },
      createRadialGradient() {
        return { addColorStop(offset, color) { events.push({ type: 'stop', offset, color }); } };
      },
      save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    };
    const context = new Proxy(target, {
      get(object, key) { return key in object ? object[key] : () => {}; },
      set(object, key, value) { object[key] = value; return true; },
    });
    ${type === 'FUEL'
    ? 'renderFuel(context, 3, 10, 900, 1200);'
    : `renderPickup(context, LANE_TYPE.${type}, 3, 10, 900, 1200);`}
    return JSON.stringify(events);
  })()`, sandbox));

  const captures = Object.fromEntries(['FUEL', 'BOOST', 'SLOW', 'TRIPLE', 'MAGNET']
    .map((type) => [type, capture(type)]));
  for (const [type, events] of Object.entries(captures)) {
    assert.ok(events.some((event) => event.type === 'fill' && event.style === '#111a31'), `${type} navy rim`);
    assert.ok(events.some((event) => event.type === 'stroke'
      && event.style === 'rgba(115,235,255,0.78)'), `${type} cyan environment reflection`);
  }

  const closedPolygonSizes = (events) => events
    .filter((event) => event.type === 'fill' && event.path.at(-1)?.[0] === 'closePath')
    .map((event) => event.path.filter((command) => command[0] === 'moveTo' || command[0] === 'lineTo').length);
  assert.ok(closedPolygonSizes(captures.FUEL).includes(6), 'fuel keeps its six-point crystal');
  assert.ok(closedPolygonSizes(captures.BOOST).includes(6), 'BOOST keeps its six-point bolt');
  assert.equal(closedPolygonSizes(captures.SLOW).filter((size) => size === 3).length, 2, 'SLOW keeps two triangles');
  assert.ok(closedPolygonSizes(captures.TRIPLE).includes(10), 'TRIPLE keeps its ten-point star');
  assert.ok(captures.MAGNET.some((event) => event.type === 'stroke'
    && event.path.map((command) => command[0]).join(',') === 'moveTo,lineTo,arc,lineTo'), 'MAGNET keeps its U core');
  assert.equal(captures.MAGNET.filter((event) => event.type === 'fillRect').length, 2, 'MAGNET keeps two pole caps');

  const semanticStops = {
    FUEL: 'rgba(70,255,220,0.40)',
    BOOST: 'rgba(255,240,130,',
    SLOW: 'rgba(190,110,255,0.42)',
    TRIPLE: 'rgba(120,240,255,0.45)',
    MAGNET: 'rgba(255,110,110,0.40)',
  };
  for (const [type, expected] of Object.entries(semanticStops)) {
    assert.ok(captures[type].some((event) => event.type === 'stop' && event.color.startsWith(expected)), `${type} semantic glow`);
  }
});

test('reduced-motion freezes gap embers, ship navigation lights, energy dashes, and orbit effects', () => {
  const { sandbox } = makeGameUiSandbox();
  const capture = (renderer, reduced, time) => JSON.parse(vm.runInContext(`(() => {
    STATE.reducedMotion = ${reduced};
    STATE.time = ${time};
    STATE.mode = 'MENU';
    STATE.gliding = true;
    STATE.boostT = 1;
    STATE.tripleT = 1;
    STATE.trail = [];
    STATE.track = [{ lanes: Array(CONFIG.LANES).fill(LANE_TYPE.GAP), enemies: null }];
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    const events = [];
    const gradient = { addColorStop(...args) { events.push(['stop', ...args]); } };
    const context = new Proxy({
      createLinearGradient(...args) { events.push(['linear', ...args]); return gradient; },
      createRadialGradient(...args) { events.push(['radial', ...args]); return gradient; },
    }, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => { events.push([String(key), ...args]); };
      },
      set(target, key, value) { events.push(['set', String(key), value]); target[key] = value; return true; },
    });
    try {
      ${renderer}(context);
      return JSON.stringify(events);
    } finally {
      Math.random = originalRandom;
    }
  })()`, sandbox));

  for (const renderer of ['renderTrack', 'renderPlayer']) {
    assert.deepEqual(capture(renderer, true, 1), capture(renderer, true, 2), `${renderer} must be steady`);
    assert.notDeepEqual(capture(renderer, false, 1), capture(renderer, false, 2), `${renderer} must still animate normally`);
  }
});

test('canvas touchstart leaves native pinch zoom available outside app controls', () => {
  const { sandbox, windowObject, elements } = makeGameUiSandbox();
  let prevented = false;

  windowObject.dispatch('touchstart', {
    target: elements.game,
    changedTouches: [{ clientX: 100, clientY: 100 }],
    touches: [
      { clientX: 100, clientY: 100 },
      { clientX: 140, clientY: 140 },
    ],
    preventDefault() { prevented = true; },
  });
  windowObject.dispatch('touchend', {
    target: elements.game,
    changedTouches: [{ clientX: 100, clientY: 100 }],
    touches: [],
  });

  assert.equal(prevented, false);
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU', 'a pinch must cancel the pending game tap');
});

test('blocked storage still publishes an in-memory qualifying result through the full game stack', () => {
  const error = new DOMException('blocked', 'SecurityError');
  const storage = {
    getItem() { throw error; },
    setItem() { throw error; },
    removeItem() { throw error; },
  };
  const { sandbox } = makeGameUiSandbox({ storage });
  vm.runInContext(`
    startGame();
    STATE.distanceMeters = 321.8;
    STATE.enemyKills = 2;
    STATE.elapsedMs = 5000;
    die('wall');
  `, sandbox);
  const result = vm.runInContext(`({
    qualified: STATE.finalResult.qualified,
    id: STATE.finalResult.entry && STATE.finalResult.entry.id,
    stored: STATE.leaderboard.getSnapshot().entries.some((entry) => entry.id === STATE.finalResult.id),
    persistenceAvailable: STATE.leaderboard.getSnapshot().persistenceAvailable,
  })`, sandbox);
  assert.equal(result.qualified, true);
  assert.equal(result.stored, true);
  assert.equal(result.id, vm.runInContext('STATE.finalResult.id', sandbox));
  assert.equal(result.persistenceAvailable, false);
});

test('the game refreshes its cached command-center snapshot from active storage events', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext(`
    globalThis.__peerLeaderboard = Skyroads.leaderboard.createLeaderboard({
      storage: localStorage,
      cryptoObject: { randomUUID() { return 'peer-id'; } },
      random: () => 0,
    });
    globalThis.__peerLeaderboard.initialize();
    globalThis.__peerLeaderboard.renamePlayer('Lyra');
  `, sandbox);

  windowObject.dispatch('storage', {
    key: 'skyroads_leaderboard_v1',
    storageArea: sandbox.localStorage,
    newValue: sandbox.localStorage.getItem('skyroads_leaderboard_v1'),
  });

  assert.equal(vm.runInContext('STATE.leaderboardSnapshot.profile.name', sandbox), 'Lyra');
  assert.equal(vm.runInContext('STATE.ui.profileName.textContent', sandbox), 'Name: Lyra');
});

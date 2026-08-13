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
    this.dataset = {};
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
    if (tagName === 'canvas') element.getContext = () => ({ drawImage() {} });
    return element;
  };

  const ids = [
    'game', 'app-ui', 'utility-controls', 'title-screen', 'pause-screen', 'game-over-screen',
    'leaderboard-dialog', 'rename-dialog', 'persistence-warning', 'aria-status',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, documentObject.createElement(id === 'game' ? 'canvas' : 'div')]));
  elements['leaderboard-dialog'].hidden = true;
  elements['rename-dialog'].hidden = true;
  const drawingContext = {
    drawImageCalls: 0,
    setTransform() {},
    drawImage() { this.drawImageCalls += 1; },
  };
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
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = {};
      this.gains = [];
      this.filters = [];
      this.buffers = [];
      this.sources = [];
      this.oscillators = [];
      audioContexts.push(this);
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    audioParam(value = 0) {
      return {
        value,
        events: [],
        cancelScheduledValues(time) { this.events.push(['cancel', time]); },
        setValueAtTime(nextValue, time) {
          this.value = nextValue;
          this.events.push(['set', nextValue, time]);
        },
        linearRampToValueAtTime(nextValue, time) {
          this.value = nextValue;
          this.events.push(['linear', nextValue, time]);
        },
        exponentialRampToValueAtTime(nextValue, time) {
          this.value = nextValue;
          this.events.push(['exponential', nextValue, time]);
        },
      };
    }
    createGain() {
      const gain = {
        gain: this.audioParam(0),
        connect() {}, disconnect() {},
      };
      this.gains.push(gain);
      return gain;
    }
    createBiquadFilter() {
      const filter = {
        type: '',
        frequency: this.audioParam(0),
        Q: this.audioParam(0),
        connect() {}, disconnect() {},
      };
      this.filters.push(filter);
      return filter;
    }
    createBuffer(channels, length, sampleRate) {
      const channelData = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      const buffer = {
        channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData(index) { return channelData[index]; },
      };
      this.buffers.push(buffer);
      return buffer;
    }
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        starts: [],
        stops: [],
        connect() {},
        disconnect() {},
        start(time = 0) { this.starts.push(time); },
        stop(time = 0) { this.stops.push(time); },
      };
      this.sources.push(source);
      return source;
    }
    createOscillator() {
      const oscillator = {
        type: 'sine',
        frequency: this.audioParam(440),
        starts: [],
        stops: [],
        connect() {},
        disconnect() {},
        start(time = 0) { this.starts.push(time); },
        stop(time = 0) { this.stops.push(time); },
      };
      this.oscillators.push(oscillator);
      return oscillator;
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
  const files = [
    'version.js',
    'i18n.js',
    'leaderboard.js',
    'presentation.js',
    'world-art.js',
    'scene-style.js',
    'drone-visual.js',
    'input.js',
    'obstacles.js',
    'gap-regions.js',
  ];
  if (loadAdaptiveAudio) files.push('audio.js');
  files.push('tutorial.js');
  files.push('game.js');
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox, { filename: file });
  }
  return {
    sandbox,
    windowObject,
    documentObject,
    elements,
    drawingContext,
    audioContexts,
    motionQuery,
    dispatchOverlayMutation() { for (const callback of observerCallbacks) callback([]); },
  };
}

function simulationSnapshot(sandbox) {
  return vm.runInContext(`JSON.stringify({
    mode: STATE.mode,
    time: STATE.time,
    position: STATE.position,
    speed: STATE.speed,
    movement: STATE.movement,
    playerY: STATE.playerY,
    playerVY: STATE.playerVY,
    jumpsUsed: STATE.jumpsUsed,
    jumpBurst: STATE.jumpBurst,
    jumpBurstTier: STATE.jumpBurstTier,
    recoil: STATE.recoil,
    boostT: STATE.boostT,
    boostPrevSpeed: STATE.boostPrevSpeed,
    boostWarnStage: STATE.boostWarnStage,
    tripleT: STATE.tripleT,
    tripleWarnStage: STATE.tripleWarnStage,
    superFx: STATE.superFx,
    magnetT: STATE.magnetT,
    magnetPulls: STATE.magnetPulls,
    gliding: STATE.gliding,
    fuelFlash: STATE.fuelFlash,
    chargeT: STATE.chargeT,
    chargeStage: STATE.chargeStage,
    shots: STATE.shots,
    bulletCD: STATE.bulletCD,
    fuel: STATE.fuel,
    distanceMeters: STATE.distanceMeters,
    enemyKills: STATE.enemyKills,
    score: STATE.score,
    elapsedMs: STATE.elapsedMs,
    trackLength: STATE.track.length,
    trackSample: STATE.track.slice(
      Math.max(0, Math.floor(STATE.position)),
      Math.max(0, Math.floor(STATE.position)) + 2,
    ),
    gen: STATE.gen,
    flash: STATE.flash,
    particles: STATE.particles,
    shake: STATE.shake,
    shockwave: STATE.shockwave,
    trail: STATE.trail,
    deathReason: STATE.deathReason,
  })`, sandbox);
}

test('game wiring renders the V1.3 badge and localized pause panel without taking focus', () => {
  const { sandbox, documentObject, elements } = makeGameUiSandbox();
  const preservedFocus = elements.game;
  preservedFocus.focus();

  vm.runInContext("STATE.mode = 'PAUSED'; refreshPresentation()", sandbox);

  const rendered = vm.runInContext(`({
    versionText: STATE.ui.versionBadge.textContent,
    versionLabel: STATE.ui.versionBadge.getAttribute('aria-label'),
    pauseTitle: STATE.ui.pauseHeading.textContent,
    pauseHint: STATE.ui.pauseHint.textContent,
    pauseControl: STATE.ui.controlItems[5].textContent,
    fuelBurstControl: STATE.ui.controlItems[2].textContent,
    pauseHidden: STATE.ui.pauseScreen.hidden,
  })`, sandbox);
  assert.deepEqual({ ...rendered }, {
    versionText: 'V1.3',
    versionLabel: 'Version 1.3',
    pauseTitle: 'GAME PAUSED',
    pauseHint: 'Press P to resume',
    pauseControl: 'Pause / resume: P',
    fuelBurstControl: 'Fuel burst: fuel ≥ 70% + hold W / ↑ for 1s (costs 40% fuel)',
    pauseHidden: false,
  });
  assert.equal(documentObject.activeElement, preservedFocus);

  vm.runInContext('STATE.ui.languageButton.dispatch(\'click\')', sandbox);
  const localized = vm.runInContext(`({
    versionLabel: STATE.ui.versionBadge.getAttribute('aria-label'),
    pauseTitle: STATE.ui.pauseHeading.textContent,
    pauseHint: STATE.ui.pauseHint.textContent,
    pauseControl: STATE.ui.controlItems[5].textContent,
    fuelBurstControl: STATE.ui.controlItems[2].textContent,
    pauseHidden: STATE.ui.pauseScreen.hidden,
  })`, sandbox);
  assert.deepEqual({ ...localized }, {
    versionLabel: '版本 1.3',
    pauseTitle: '游戏已暂停',
    pauseHint: '按 P 继续',
    pauseControl: '暂停 / 继续：P',
    fuelBurstControl: '燃料爆发：燃料 ≥ 70% 时按住 W / ↑ 1 秒（消耗 40% 燃料）',
    pauseHidden: false,
  });
  assert.equal(documentObject.activeElement, preservedFocus);
});

test('active HUD keeps immediate instruments and hides historical or instructional noise', () => {
  const { sandbox } = makeGameUiSandbox();
  const capture = (state) => JSON.parse(vm.runInContext(`(() => {
    Object.assign(STATE, ${JSON.stringify(state)});
    STATE.visualAssets = {
      assets: {
        ui: {
          hologramPanel: {
            loaded: true,
            element: { currentSrc: './assets/ui/hologram-panel.png' },
          },
          industrialMeter: {
            loaded: true,
            element: { currentSrc: './assets/ui/industrial-meter-overlay.png' },
          },
        },
      },
    };
    const events = [];
    const gradient = { addColorStop() {} };
    const context = new Proxy({
      fillStyle: '#000',
      strokeStyle: '#000',
      font: '',
      textAlign: 'left',
      globalAlpha: 1,
      fillText(text, x, y) { events.push({ type: 'text', text: String(text), x, y }); },
      fillRect(...args) { events.push({ type: 'fillRect', style: this.fillStyle, args }); },
      strokeRect(...args) { events.push({ type: 'strokeRect', style: this.strokeStyle, args }); },
      drawImage(image, ...args) { events.push({ type: 'drawImage', image: image && image.currentSrc, args }); },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      createLinearGradient() { return gradient; },
      createRadialGradient() { return gradient; },
    }, {
      get(target, key) { return key in target ? target[key] : () => {}; },
      set(target, key, value) { target[key] = value; return true; },
    });
    renderHUD(context);
    return JSON.stringify(events);
  })()`, sandbox));

  const idle = capture({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0,
    boostT: 0,
    tripleT: 0,
    magnetT: 0,
    distanceMeters: 321,
    elapsedMs: 4567,
    score: 321,
    speed: 9.4,
  });
  const idleText = idle.filter((event) => event.type === 'text').map((event) => event.text);
  for (const expected of ['FUEL', 'JUMPS', 'SCORE', 'DISTANCE', 'SPEED']) {
    assert.ok(idleText.some((text) => text.includes(expected)), expected);
  }
  for (const removed of ['LOCAL BEST', 'TIME', 'J: FIRE / HOLD TO CHARGE', 'AUDIO ON', 'MISSILE CHARGE']) {
    assert.equal(idleText.some((text) => text.includes(removed)), false, removed);
  }
  assert.ok(idle.some((event) => event.type === 'drawImage'
    && event.image === './assets/ui/hologram-panel.png'));
  assert.ok(idle.some((event) => event.type === 'drawImage'
    && event.image === './assets/ui/industrial-meter-overlay.png'));

  const active = capture({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0.75,
    boostT: 2,
    tripleT: 3,
    magnetT: 4,
    distanceMeters: 321,
    elapsedMs: 4567,
    score: 321,
    speed: 9.4,
  });
  const activeText = active.filter((event) => event.type === 'text').map((event) => event.text);
  for (const expected of ['CHARGING', 'BOOST', 'SUPER', 'MAGNET']) {
    assert.ok(activeText.some((text) => text.includes(expected)), expected);
  }

  const quickTap = capture({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0.49,
    boostT: 2,
    tripleT: 3,
    magnetT: 4,
    distanceMeters: 321,
    elapsedMs: 4567,
    score: 321,
    speed: 9.4,
  });
  const quickTapText = quickTap.filter((event) => event.type === 'text');
  assert.equal(quickTapText.some((event) => event.text.includes('CHARGING')), false);

  const visibleCharge = capture({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0.5,
    boostT: 2,
    tripleT: 3,
    magnetT: 4,
    distanceMeters: 321,
    elapsedMs: 4567,
    score: 321,
    speed: 9.4,
  });
  const statusY = (fragment) => visibleCharge.find(
    (event) => event.type === 'text' && event.text.includes(fragment),
  ).y;
  assert.ok(statusY('BOOST') < statusY('SUPER'));
  assert.ok(statusY('SUPER') < statusY('MAGNET'));
  assert.ok(statusY('MAGNET') < statusY('CHARGING'));

  const fallbackText = JSON.parse(vm.runInContext(`(() => {
    STATE.visualAssets = { assets: { ui: {} } };
    Object.assign(STATE, ${JSON.stringify({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0,
    boostT: 0,
    tripleT: 0,
    magnetT: 0,
    distanceMeters: 321,
    score: 321,
    speed: 9.4,
  })});
    const text = [];
    const gradient = { addColorStop() {} };
    const context = new Proxy({
      fillStyle: '#000', strokeStyle: '#000', font: '', textAlign: 'left', globalAlpha: 1,
      fillText(value) { text.push(String(value)); },
      createLinearGradient() { return gradient; },
      createRadialGradient() { return gradient; },
    }, {
      get(target, key) { return key in target ? target[key] : () => {}; },
      set(target, key, value) { target[key] = value; return true; },
    });
    renderHUD(context);
    return JSON.stringify(text);
  })()`, sandbox));
  for (const expected of ['FUEL', 'JUMPS', 'SCORE', 'DISTANCE', 'SPEED']) {
    assert.ok(fallbackText.some((text) => text.includes(expected)), `fallback ${expected}`);
  }
});

test('presentation mode exposes utilities outside active play only', () => {
  const { sandbox, elements } = makeGameUiSandbox();
  for (const [mode, expected] of [
    ['MENU', 'MENU'],
    ['PLAYING', 'PLAYING'],
    ['PAUSED', 'PAUSED'],
    ['GAMEOVER', 'GAMEOVER'],
  ]) {
    vm.runInContext(`STATE.mode = '${mode}'; refreshPresentation();`, sandbox);
    assert.equal(elements['app-ui'].dataset.mode, expected);
  }
});

test('release diagnostics expose complete preferred world atlas readiness', async () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const diagnostics = await vm.runInContext('Skyroads.diagnostics.ready', sandbox);

  assert.equal(diagnostics.scripts.worldArt, true);
  assert.equal(diagnostics.scripts.sceneStyle, true);
  assert.equal(diagnostics.scripts.droneVisual, true);
  assert.equal(diagnostics.scripts.obstacles, true);
  assert.equal(diagnostics.scripts.gapRegions, true);
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
      STATE.chargeT = 1.5;
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
      chargeT: 1.5,
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

function legacyAudioContext(game) {
  return game.audioContexts[0];
}

test('second and third jumps use distinct procedural ignition recipes', () => {
  const second = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.playerY = 500;
    STATE.playerVY = -100;
    STATE.jumpsUsed = 1;
    STATE.fuel = 10;
    tryJump();
  `, second.sandbox);
  const secondContext = legacyAudioContext(second);
  const secondSignature = {
    oscillatorStarts: secondContext.oscillators.map((oscillator) => (
      oscillator.frequency.events.find((event) => event[0] === 'set')?.[1]
    )),
    noiseSources: secondContext.sources.length,
  };

  const third = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.playerY = 500;
    STATE.playerVY = -100;
    STATE.jumpsUsed = 2;
    STATE.tripleT = 1;
    STATE.fuel = 10;
    tryJump();
  `, third.sandbox);
  const thirdContext = legacyAudioContext(third);
  const thirdSignature = {
    oscillatorStarts: thirdContext.oscillators.map((oscillator) => (
      oscillator.frequency.events.find((event) => event[0] === 'set')?.[1]
    )),
    noiseSources: thirdContext.sources.length,
  };

  assert.notDeepEqual(thirdSignature, secondSignature);
  assert.ok(thirdSignature.oscillatorStarts.length > secondSignature.oscillatorStarts.length);
  assert.ok(secondSignature.noiseSources >= 1);
  assert.ok(thirdSignature.noiseSources >= 1);
});

test('glide entry creates one ignition transient and one two-band two-second sustain graph', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    sfxNoise(0.08, 0.04, 1800);
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    STATE.tripleT = 0;
    syncGlideAudio();
  `, game.sandbox);
  const context = legacyAudioContext(game);
  const state = vm.runInContext(`({
    hasNodes: Boolean(AUDIO.glideNodes),
    sourceBufferSeconds: AUDIO.glideNodes.src.buffer.duration,
    rumbleFilter: AUDIO.glideNodes.rumbleFilter.frequency.value,
    rumbleGain: AUDIO.glideNodes.rumbleGain.gain.value,
    fireFilterType: AUDIO.glideNodes.fireFilter.type,
    fireFilter: AUDIO.glideNodes.fireFilter.frequency.value,
    fireGain: AUDIO.glideNodes.fireGain.gain.value,
  })`, game.sandbox);
  assert.equal(state.hasNodes, true);
  assert.equal(state.sourceBufferSeconds, 2);
  assert.equal(state.rumbleFilter, 520);
  assert.equal(state.rumbleGain, 0.125);
  assert.equal(state.fireFilterType, 'bandpass');
  assert.equal(state.fireFilter, 1450);
  assert.equal(state.fireGain, 0.065);
  assert.equal(context.buffers.some((buffer) => buffer.duration === 0.5), true);
  assert.equal(context.buffers.some((buffer) => buffer.duration === 2), true);
  assert.equal(context.sources.length, 3, 'one-shot probe, glide ignition, and glide sustain');
  assert.equal(context.oscillators.length, 2);
  assert.equal(context.filters.filter((filter) => filter.type === 'lowpass').length >= 2, true);
  assert.equal(context.filters.some((filter) => filter.type === 'bandpass'), true);

  vm.runInContext('syncGlideAudio()', game.sandbox);
  assert.equal(context.sources.length, 3);
  assert.equal(context.oscillators.length, 2);
});

test('active glide ramps both rumble and fire bands without rebuilding nodes', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    STATE.tripleT = 0;
    syncGlideAudio();
  `, game.sandbox);
  const context = legacyAudioContext(game);
  const initialNodes = vm.runInContext('AUDIO.glideNodes', game.sandbox);
  vm.runInContext(`
    STATE.tripleT = 1;
    syncGlideAudio();
  `, game.sandbox);
  const updated = vm.runInContext(`({
    sameNodes: AUDIO.glideNodes === globalThis.__initialGlideNodes,
    rumbleFilter: AUDIO.glideNodes.rumbleFilter.frequency.value,
    rumbleGain: AUDIO.glideNodes.rumbleGain.gain.value,
    fireFilter: AUDIO.glideNodes.fireFilter.frequency.value,
    fireGain: AUDIO.glideNodes.fireGain.gain.value,
    rumbleFilterEvents: AUDIO.glideNodes.rumbleFilter.frequency.events,
    rumbleGainEvents: AUDIO.glideNodes.rumbleGain.gain.events,
    fireFilterEvents: AUDIO.glideNodes.fireFilter.frequency.events,
    fireGainEvents: AUDIO.glideNodes.fireGain.gain.events,
  })`, Object.assign(game.sandbox, { __initialGlideNodes: initialNodes }));
  assert.equal(updated.sameNodes, true);
  assert.equal(updated.rumbleFilter, 650);
  assert.equal(updated.rumbleGain, 0.14);
  assert.equal(updated.fireFilter, 1750);
  assert.equal(updated.fireGain, 0.075);
  assert.ok(Array.from(updated.rumbleFilterEvents).some((event) => (
    event[0] === 'linear' && event[1] === 650
  )));
  assert.ok(Array.from(updated.rumbleGainEvents).some((event) => (
    event[0] === 'linear' && event[1] === 0.14
  )));
  assert.ok(Array.from(updated.fireFilterEvents).some((event) => (
    event[0] === 'linear' && event[1] === 1750
  )));
  assert.ok(Array.from(updated.fireGainEvents).some((event) => (
    event[0] === 'linear' && event[1] === 0.075
  )));
  assert.equal(context.sources.length, 2);
  assert.equal(context.oscillators.length, 2);
});

test('BOOST alone starts the strongest propulsion mode and overrides glide without rebuilding', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.gliding = false;
    STATE.boostT = 5;
    syncPropulsionAudio();
    globalThis.__boostSource = AUDIO.glideNodes.src;
  `, game.sandbox);
  const boost = vm.runInContext(`({
    mode: AUDIO.glideNodes.targetMode,
    rumbleFilter: AUDIO.glideNodes.rumbleFilter.frequency.value,
    rumbleGain: AUDIO.glideNodes.rumbleGain.gain.value,
    fireFilter: AUDIO.glideNodes.fireFilter.frequency.value,
    fireGain: AUDIO.glideNodes.fireGain.gain.value,
  })`, game.sandbox);
  assert.deepEqual({ ...boost }, {
    mode: 'boost',
    rumbleFilter: 820,
    rumbleGain: 0.175,
    fireFilter: 2200,
    fireGain: 0.095,
  });

  vm.runInContext(`
    STATE.gliding = true;
    STATE.tripleT = 10;
    syncPropulsionAudio();
  `, game.sandbox);
  const overlap = vm.runInContext(`({
    sameSource: AUDIO.glideNodes.src === globalThis.__boostSource,
    mode: AUDIO.glideNodes.targetMode,
  })`, game.sandbox);
  assert.deepEqual({ ...overlap }, { sameSource: true, mode: 'boost' });
  assert.equal(legacyAudioContext(game).sources.length, 1,
    'one shared BOOST sustain source');
});

test('collecting BOOST starts its continuous propulsion graph in the pickup frame', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  const result = vm.runInContext(`(() => {
    startGame();
    const segment = { lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD) };
    segment.lanes[3] = LANE_TYPE.BOOST;
    const collected = collectPickup(segment, 3, LANE_TYPE.BOOST);
    return {
      collected,
      laneType: segment.lanes[3],
      boostT: STATE.boostT,
      mode: AUDIO.glideNodes && AUDIO.glideNodes.targetMode,
    };
  })()`, game.sandbox);
  assert.deepEqual({ ...result }, {
    collected: true,
    laneType: 'ROAD',
    boostT: 5,
    mode: 'boost',
  });
});

test('BOOST expiry during glide ramps the shared graph back to glide parameters', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    STATE.tripleT = 0;
    STATE.boostT = 1;
    syncPropulsionAudio();
    globalThis.__boostSource = AUDIO.glideNodes.src;
    STATE.boostT = 0;
    syncPropulsionAudio();
  `, game.sandbox);
  const result = vm.runInContext(`({
    sameSource: AUDIO.glideNodes.src === globalThis.__boostSource,
    mode: AUDIO.glideNodes.targetMode,
    rumbleFilter: AUDIO.glideNodes.rumbleFilter.frequency.value,
    rumbleGain: AUDIO.glideNodes.rumbleGain.gain.value,
    fireFilter: AUDIO.glideNodes.fireFilter.frequency.value,
    fireGain: AUDIO.glideNodes.fireGain.gain.value,
  })`, game.sandbox);
  assert.deepEqual({ ...result }, {
    sameSource: true,
    mode: 'ordinary',
    rumbleFilter: 520,
    rumbleGain: 0.125,
    fireFilter: 1450,
    fireGain: 0.065,
  });
});

test('BOOST sustain respects pause blur hidden-page and modal audio ownership', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.boostT = 5;
    syncPropulsionAudio();
  `, game.sandbox);
  assert.equal(vm.runInContext('Boolean(AUDIO.glideNodes)', game.sandbox), true);

  game.windowObject.dispatch('blur');
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('AUDIO.glideNodes', game.sandbox), null);

  game.windowObject.dispatch('focus');
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('Boolean(AUDIO.glideNodes)', game.sandbox), true);

  game.documentObject.hidden = true;
  game.documentObject.dispatch('visibilitychange');
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('AUDIO.glideNodes', game.sandbox), null);

  game.documentObject.hidden = false;
  game.documentObject.dispatch('visibilitychange');
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('Boolean(AUDIO.glideNodes)', game.sandbox), true);

  game.elements['leaderboard-dialog'].hidden = false;
  game.dispatchOverlayMutation();
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('AUDIO.glideNodes', game.sandbox), null);

  game.elements['leaderboard-dialog'].hidden = true;
  game.dispatchOverlayMutation();
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('Boolean(AUDIO.glideNodes)', game.sandbox), true);

  game.windowObject.dispatch('keydown', { code: 'KeyP' });
  vm.runInContext('syncPropulsionAudio()', game.sandbox);
  assert.equal(vm.runInContext('AUDIO.glideNodes', game.sandbox), null);
});

test('glide stop fades both bands for 120ms and stops sustain nodes after 120ms', () => {
  const game = makeGameUiSandbox({ loadAdaptiveAudio: false });
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    syncGlideAudio();
    globalThis.__activeGlideNodes = AUDIO.glideNodes;
    STATE.gliding = false;
    syncGlideAudio();
  `, game.sandbox);
  const result = vm.runInContext(`({
    cleared: AUDIO.glideNodes === null,
    rumbleGainEvents: __activeGlideNodes.rumbleGain.gain.events,
    fireGainEvents: __activeGlideNodes.fireGain.gain.events,
    sourceStops: __activeGlideNodes.src.stops,
    lfoStops: __activeGlideNodes.lfo.stops,
    lfo2Stops: __activeGlideNodes.lfo2.stops,
  })`, game.sandbox);
  assert.equal(result.cleared, true);
  assert.ok(Array.from(result.rumbleGainEvents).some((event) => (
    event[0] === 'exponential'
      && event[1] === 0.0001
      && Math.abs(event[2] - 10.12) < 1e-9
  )));
  assert.ok(Array.from(result.fireGainEvents).some((event) => (
    event[0] === 'exponential'
      && event[1] === 0.0001
      && Math.abs(event[2] - 10.12) < 1e-9
  )));
  assert.deepEqual(Array.from(result.sourceStops), [10.12]);
  assert.deepEqual(Array.from(result.lfoStops), [10.12]);
  assert.deepEqual(Array.from(result.lfo2Stops), [10.12]);
});

test('muting SFX from the utility stops an active glide graph immediately', () => {
  const game = makeGameUiSandbox({ musicMuted: false, sfxMuted: false });
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    syncGlideAudio();
    globalThis.__activeGlideNodes = AUDIO.glideNodes;
  `, game.sandbox);
  assert.equal(vm.runInContext('Boolean(AUDIO.glideNodes)', game.sandbox), true);

  vm.runInContext("STATE.ui.sfxButton.dispatch('click')", game.sandbox);

  const stopped = vm.runInContext(`({
    cleared: AUDIO.glideNodes === null,
    sourceStops: __activeGlideNodes.src.stops,
    lfoStops: __activeGlideNodes.lfo.stops,
    lfo2Stops: __activeGlideNodes.lfo2.stops,
  })`, game.sandbox);
  assert.equal(stopped.cleared, true);
  assert.deepEqual(Array.from(stopped.sourceStops), [10.12]);
  assert.deepEqual(Array.from(stopped.lfoStops), [10.12]);
  assert.deepEqual(Array.from(stopped.lfo2Stops), [10.12]);
});

test('total mute shortcut stops an active glide graph immediately', () => {
  const game = makeGameUiSandbox({ musicMuted: false, sfxMuted: false });
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.gliding = true;
    syncGlideAudio();
    globalThis.__activeGlideNodes = AUDIO.glideNodes;
  `, game.sandbox);

  game.windowObject.dispatch('keydown', { key: 'm', code: 'KeyM' });

  const stopped = vm.runInContext(`({
    cleared: AUDIO.glideNodes === null,
    sourceStops: __activeGlideNodes.src.stops,
    lfoStops: __activeGlideNodes.lfo.stops,
    lfo2Stops: __activeGlideNodes.lfo2.stops,
  })`, game.sandbox);
  assert.equal(stopped.cleared, true);
  assert.deepEqual(Array.from(stopped.sourceStops), [10.12]);
  assert.deepEqual(Array.from(stopped.lfoStops), [10.12]);
  assert.deepEqual(Array.from(stopped.lfo2Stops), [10.12]);
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

test('charged-shot release switches from bullet to missile at one and a half seconds', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const releaseAt = (seconds) => {
    vm.runInContext(`
      STATE.shots = [];
      STATE.bulletCD = 0;
      STATE.chargeT = ${seconds};
      STATE.chargeStage = 0;
      KEYS.KeyJ = true;
    `, sandbox);
    windowObject.dispatch('keyup', { code: 'KeyJ' });
    return vm.runInContext('STATE.shots[0] && STATE.shots[0].kind', sandbox);
  };

  assert.equal(releaseAt(1.499), 'bullet');
  assert.equal(releaseAt(1.5), 'missile');
});

test('charge cues track half one and one-and-a-half-second progress', () => {
  const { sandbox } = makeGameUiSandbox();
  const result = JSON.parse(vm.runInContext(`(() => {
    const cues = [];
    sfxChargeTick = (stage) => cues.push('tick:' + stage);
    sfxChargeReady = () => cues.push('ready');
    STATE.mode = 'PLAYING';
    STATE.speed = 0;
    STATE.position = 0;
    STATE.track = [{ lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD), enemies: null }];
    STATE.shots = [];
    KEYS.KeyJ = true;
    extendTrack = () => {};
    updateEnemies = () => {};
    advanceShots = () => {};
    checkCollisions = () => {};
    for (const [chargeT, chargeStage] of [
      [CONFIG.CHARGE_TIME / 3 - 0.01, 0],
      [CONFIG.CHARGE_TIME * 2 / 3 - 0.01, 1],
      [CONFIG.CHARGE_TIME - 0.01, 2],
    ]) {
      STATE.chargeT = chargeT;
      STATE.chargeStage = chargeStage;
      updatePhysics(0.02);
    }
    return JSON.stringify({
      chargeTime: CONFIG.CHARGE_TIME,
      chargeT: STATE.chargeT,
      chargeStage: STATE.chargeStage,
      cues,
    });
  })()`, sandbox));

  assert.deepEqual(result, {
    chargeTime: 1.5,
    chargeT: 1.5,
    chargeStage: 3,
    cues: ['tick:1', 'tick:2', 'ready'],
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
  assert.deepEqual(Array.from(vm.runInContext(
    '[STATE.ui.languageButton.tabIndex, STATE.ui.musicButton.tabIndex, STATE.ui.sfxButton.tabIndex]',
    sandbox,
  )), [0, 0, 0]);
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
  assert.equal(documentObject.activeElement, elements.game);
  assert.deepEqual(Array.from(vm.runInContext(
    '[STATE.ui.languageButton.tabIndex, STATE.ui.musicButton.tabIndex, STATE.ui.sfxButton.tabIndex]',
    sandbox,
  )), [-1, -1, -1]);
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

test('browser and operating-system P shortcuts are not captured by the game', () => {
  const { sandbox, windowObject, elements } = makeGameUiSandbox();
  const utility = appUiTarget(elements);
  vm.runInContext('startGame()', sandbox);

  for (const modifiers of [
    { metaKey: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true, shiftKey: true },
  ]) {
    let prevented = false;
    windowObject.dispatch('keydown', {
      code: 'KeyP',
      target: utility,
      ...modifiers,
      preventDefault() { prevented = true; },
    });
    assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
    assert.equal(vm.runInContext('pauseKeyHeld', sandbox), false);
    assert.equal(prevented, false);
  }
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

test('enabling either audio channel while paused restores the legacy bus on resume', () => {
  for (const control of ['music', 'sfx']) {
    const { sandbox, windowObject } = makeGameUiSandbox({ musicMuted: true, sfxMuted: true });
    vm.runInContext('startGame()', sandbox);
    windowObject.dispatch('keydown', { code: 'KeyP' });

    vm.runInContext(`STATE.ui.${control}Button.dispatch('click')`, sandbox);
    assert.equal(vm.runInContext('AUDIO.master.gain.value', sandbox), 0);

    windowObject.dispatch('keyup', { code: 'KeyP' });
    windowObject.dispatch('keydown', { code: 'KeyP' });
    assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
    assert.equal(vm.runInContext('AUDIO.master.gain.value', sandbox), 0.45);
    assert.equal(vm.runInContext(`audioIs${control === 'music' ? 'Music' : 'Sfx'}Muted()`, sandbox), false);
  }
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

test('paused RAF freezes simulation effects timing and Canvas while still scheduling', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext(`
    startGame();
    STATE.mode = 'PAUSED';
    STATE.lastTime = 1000;
    STATE.time = 3;
    STATE.position = 12;
    STATE.speed = 18;
    STATE.movement.heldRight = true;
    STATE.movement.activeDirection = 1;
    STATE.movement.segmentActive = true;
    STATE.playerY = 240;
    STATE.playerVY = -90;
    STATE.jumpsUsed = 2;
    STATE.jumpBurst = 0.2;
    STATE.recoil = 0.7;
    STATE.boostT = 4;
    STATE.boostPrevSpeed = 16;
    STATE.boostWarnStage = 1;
    STATE.tripleT = 5;
    STATE.tripleWarnStage = 1;
    STATE.superFx = 0.6;
    STATE.magnetT = 6;
    STATE.magnetPulls = [{ x: 9, y: 10, t: 0.1, dur: 0.35 }];
    STATE.gliding = true;
    STATE.fuelFlash = 0.5;
    STATE.chargeT = 2;
    STATE.chargeStage = 2;
    STATE.shots = [{ kind: 'bullet', seg: 14, lanePosition: 2, y: 200 }];
    STATE.bulletCD = 0.2;
    STATE.fuel = 72;
    STATE.distanceMeters = 1200;
    STATE.enemyKills = 3;
    STATE.score = 1230;
    STATE.elapsedMs = 2400;
    STATE.flash = 0.8;
    STATE.shake = 0.7;
    STATE.trail = [{ x: 1, y: 2, vx: 3, vy: 4, life: 1, maxLife: 1 }];
    STATE.particles = [{ x: 5, y: 6, vx: 7, vy: 8, life: 1, maxLife: 1, size: 1, color: '#fff' }];
    STATE.shockwave = { x: 11, y: 12, r: 13, alpha: 0.9 };
    STATE.track[12].enemies = [{
      type: 'drone', lane: 2, fromLane: 2, toLane: 3,
      state: 'warn', warnT: 0.4, moveT: 0, restT: 1,
    }];
    globalThis.__renders = 0;
    globalThis.__rafCount = 0;
    render = () => { globalThis.__renders += 1; };
    requestAnimationFrame = () => { globalThis.__rafCount += 1; };
  `, sandbox);

  const before = simulationSnapshot(sandbox);
  vm.runInContext('loop(5000); loop(9000);', sandbox);

  assert.equal(simulationSnapshot(sandbox), before);
  assert.equal(vm.runInContext('STATE.lastTime', sandbox), 9000);
  assert.equal(vm.runInContext('globalThis.__renders', sandbox), 0);
  assert.equal(vm.runInContext('globalThis.__rafCount', sandbox), 2);
});

test('resizing while paused preserves the static Canvas bitmap without simulating or rendering', () => {
  const { sandbox, windowObject, elements, drawingContext } = makeGameUiSandbox();
  vm.runInContext(`
    startGame();
    STATE.mode = 'PAUSED';
    STATE.time = 4;
    STATE.position = 8;
    STATE.flash = 0.7;
    globalThis.__renders = 0;
    render = () => { globalThis.__renders += 1; };
  `, sandbox);
  const before = simulationSnapshot(sandbox);

  windowObject.innerWidth = 1280;
  windowObject.innerHeight = 720;
  windowObject.devicePixelRatio = 2;
  windowObject.dispatch('resize');

  assert.equal(simulationSnapshot(sandbox), before);
  assert.equal(elements.game.width, 2560);
  assert.equal(elements.game.height, 1440);
  assert.equal(drawingContext.drawImageCalls, 1);
  assert.equal(vm.runInContext('globalThis.__renders', sandbox), 0);
});

test('first resumed frame has zero delta before normal 16ms progress', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext(`
    startGame();
    STATE.mode = 'PLAYING';
    STATE.lastTime = 0;
    STATE.time = 7;
    STATE.position = 0;
    STATE.distanceMeters = 0;
    STATE.elapsedMs = 1000;
    STATE.speed = 8;
    STATE.boostT = 4;
    STATE.boostPrevSpeed = 8;
    STATE.flash = 0.8;
    globalThis.__renders = 0;
    globalThis.__rafCount = 0;
    render = () => { globalThis.__renders += 1; };
    requestAnimationFrame = () => { globalThis.__rafCount += 1; };
  `, sandbox);

  const before = simulationSnapshot(sandbox);
  vm.runInContext('loop(20000)', sandbox);
  assert.equal(simulationSnapshot(sandbox), before);
  assert.equal(vm.runInContext('STATE.lastTime', sandbox), 20000);
  assert.equal(vm.runInContext('globalThis.__renders', sandbox), 1);
  assert.equal(vm.runInContext('globalThis.__rafCount', sandbox), 1);

  const progressed = vm.runInContext(`(() => {
    loop(20016);
    return ({
      time: STATE.time,
      elapsedMs: STATE.elapsedMs,
      position: STATE.position,
      distanceMeters: STATE.distanceMeters,
      boostT: STATE.boostT,
      flash: STATE.flash,
      renders: globalThis.__renders,
      rafCount: globalThis.__rafCount,
    });
  })()`, sandbox);
  const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ~= ${expected}`);
  closeTo(progressed.time, 7.016);
  closeTo(progressed.elapsedMs, 1016);
  closeTo(progressed.position, 36 * 0.016);
  closeTo(progressed.distanceMeters, 36 * 0.016 * 10);
  closeTo(progressed.boostT, 4 - 0.016);
  closeTo(progressed.flash, 0.8 - 0.016 * 2.2);
  assert.equal(progressed.renders, 2);
  assert.equal(progressed.rafCount, 2);
});

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

// v1.3.2 路面抗闪烁：mipmap 分级 + 纹素对齐（真实激活纹理路径，三个级别都要用到）
test('road deck is pure vector and never samples the retired photo textures', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const result = JSON.parse(vm.runInContext(`(() => {
    const mk = (tag) => ({ tag, naturalWidth: 1024, naturalHeight: 1024 });
    STATE.visualAssets = {
      assets: {
        ui: {
          roadSurface: { loaded: true, element: mk('L0-sharp') },
          roadSurfaceMip1: { loaded: true, element: mk('L1-mid') },
          roadSurfaceMip2: { loaded: true, element: mk('L2-far') },
        },
      },
    };
    const draws = [];
    const gradient = { addColorStop() {} };
    const context = new Proxy({
      createLinearGradient() { return gradient; },
      createRadialGradient() { return gradient; },
      drawImage(img, sx, sy) { draws.push([img && img.tag, sy]); },
    }, {
      get(target, key) {
        if (key in target) return target[key];
        return () => {};
      },
      set() { return true; },
    });
    renderTrack(context);
    return JSON.stringify({
      taggedDraws: draws.filter((d) => d[0]).length,
    });
  })()`, sandbox));

  assert.equal(result.taggedDraws, 0,
    'vector deck must not drawImage the road photo textures (seam/banding/flicker source)');
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

test('reward pickups draw their realistic sprite when the asset is loaded, keeping glow and metal rim', () => {
  const { sandbox } = makeGameUiSandbox();
  const capture = (type, assetKey) => JSON.parse(vm.runInContext(`(() => {
    STATE.width = 960;
    STATE.height = 600;
    STATE.time = 1;
    const sprite = { naturalWidth: 512, naturalHeight: 512 };
    STATE.visualAssets = { assets: { ui: { ${assetKey}: { loaded: true, element: sprite } } } };
    const events = [];
    const target = {
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
      fill() { events.push({ type: 'fill', style: typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient' }); },
      stroke() { events.push({ type: 'stroke', style: typeof this.strokeStyle === 'string' ? this.strokeStyle : 'gradient' }); },
      drawImage(...args) { events.push({ type: 'drawImage', same: args[0] === sprite }); },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() {
        return { addColorStop(offset, color) { events.push({ type: 'stop', offset, color }); } };
      },
      save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    };
    const context = new Proxy(target, {
      get(object, key) { return key in object ? object[key] : () => {}; },
      set(object, key, value) { object[key] = value; return true; },
    });
    renderPickup(context, LANE_TYPE.${type}, 3, 10, 900, 1200);
    return JSON.stringify(events);
  })()`, sandbox));

  const spriteGlow = {
    BOOST: 'rgba(255,240,130,',
    SLOW: 'rgba(190,110,255,',
    TRIPLE: 'rgba(120,240,255,',
    MAGNET: 'rgba(255,110,110,',
  };
  for (const [type, expected] of Object.entries(spriteGlow)) {
    const assetKey = 'pickup' + type.charAt(0) + type.slice(1).toLowerCase();
    const events = capture(type, assetKey);
    assert.ok(events.some((event) => event.type === 'drawImage' && event.same), `${type} draws its sprite`);
    assert.equal(events.filter((event) => event.type === 'drawImage').length, 1, `${type} draws exactly one sprite`);
    assert.ok(events.some((event) => event.type === 'fill' && event.style === '#111a31'), `${type} keeps navy rim`);
    assert.ok(events.some((event) => event.type === 'stop' && event.color.startsWith(expected)), `${type} keeps semantic glow`);
  }
});

test('reduced-motion freezes event-horizon decoration, ship navigation lights, energy dashes, and orbit effects', () => {
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

// ---- v1.2.0 燃料爆发（Fuel Burst）：W/↑ 在地面且燃料 ≥75% 时主动超级加速 ----

test('holding W for one second triggers fuel burst from the ground at or above 70 percent fuel', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  vm.runInContext('STATE.fuel = 100; STATE.speed = 20; STATE.tutorial.active = false;', sandbox);

  windowObject.dispatch('keydown', { key: 'w', code: 'KeyW' });

  const charging = vm.runInContext(`({
    chargeT: STATE.fuelBurstChargeT, fuel: STATE.fuel, burstT: STATE.fuelBurstT, jumpsUsed: STATE.jumpsUsed,
  })`, sandbox);
  assert.ok(charging.chargeT > 0, 'keydown must start the one-second charge');
  assert.equal(charging.burstT, 0, 'burst must not fire on keydown');
  assert.equal(charging.jumpsUsed, 0, 'keydown must not jump while charging');
  assert.equal(charging.fuel, 100, 'no fuel cost before the burst fires');

  const fired = JSON.parse(vm.runInContext(`(() => {
    extendTrack = () => {};
    collectPickup = () => {};         // 排除热身区燃料晶体的随机干扰
    pickupFuel = () => {};
    KEYS.KeyW = true;                 // 模拟仍然按住
    updatePhysics(0.99);              // 蓄力 0.99s：尚未触发
    const beforeFire = STATE.fuelBurstT;
    updatePhysics(0.05);              // 累计超过 1s：本帧触发
    return JSON.stringify({
      beforeFire,
      fuel: STATE.fuel,
      burstT: STATE.fuelBurstT,
      prevSpeed: STATE.fuelBurstPrevSpeed,
      chargeT: STATE.fuelBurstChargeT,
      jumpsUsed: STATE.jumpsUsed,
      elapsed: 0.99 + 0.05,
    });
  })()`, sandbox));
  assert.equal(fired.beforeFire, 0, 'burst must not fire before one full second');
  assert.equal(fired.chargeT, 0, 'charge state must reset after firing');
  assert.equal(fired.jumpsUsed, 0, 'burst must not consume a jump');
  assert.ok(Math.abs(fired.prevSpeed - (20 + 0.4 * 0.99)) < 1e-6,
    `burst must remember the speed reached while charging, got ${fired.prevSpeed}`);
  assert.ok(Math.abs(fired.fuel - (60 - 4.5 * fired.elapsed)) < 1e-6, `fuel ≈ 100 minus 40 cost minus drain, got ${fired.fuel}`);
  assert.ok(fired.burstT > 2.9 && fired.burstT <= 3, `burstT should start near 3s, got ${fired.burstT}`);
});

test('releasing W within one second cancels the burst charge without jumping', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  vm.runInContext('STATE.fuel = 100; STATE.tutorial.active = false;', sandbox);

  windowObject.dispatch('keydown', { key: 'w', code: 'KeyW' });
  vm.runInContext('collectPickup = () => {}; pickupFuel = () => {}; updatePhysics(0.4)', sandbox);   // 按住 0.4 秒（未满 1 秒）
  windowObject.dispatch('keyup', { key: 'w', code: 'KeyW' });

  const snap = vm.runInContext(`({
    chargeT: STATE.fuelBurstChargeT, burstT: STATE.fuelBurstT,
    jumpsUsed: STATE.jumpsUsed, playerY: STATE.playerY, fuel: STATE.fuel,
  })`, sandbox);
  assert.equal(snap.chargeT, 0, 'charge state must reset on release');
  assert.equal(snap.burstT, 0, 'burst must not fire on an early release');
  assert.equal(snap.jumpsUsed, 0, 'W is no longer a jump key — early release must not jump');
  assert.equal(snap.playerY, 0);
  assert.ok(Math.abs(snap.fuel - (100 - 4.5 * 0.4)) < 1e-6, `only ambient fuel drain, got ${snap.fuel}`);
});

test('a burst charge is cancelled silently when the conditions break mid-charge', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  vm.runInContext('STATE.fuel = 100;', sandbox);

  windowObject.dispatch('keydown', { key: 'w', code: 'KeyW' });
  vm.runInContext('collectPickup = () => {}; pickupFuel = () => {}; STATE.boostT = 2; updatePhysics(0.4)', sandbox);   // 蓄力中吃到 BOOST

  const snap = vm.runInContext(`({
    chargeT: STATE.fuelBurstChargeT, burstT: STATE.fuelBurstT, fuel: STATE.fuel,
  })`, sandbox);
  assert.equal(snap.chargeT, 0, 'charge must cancel when BOOST takes over');
  assert.equal(snap.burstT, 0);
  assert.ok(snap.fuel > 85, `no 40-percent burst fuel cost, got ${snap.fuel}`);

  windowObject.dispatch('keyup', { key: 'w', code: 'KeyW' });   // 松手不再补跳（蓄力已取消）
  assert.equal(vm.runInContext('STATE.jumpsUsed', sandbox), 0);
});

test('a burst charge survives fuel dropping below the threshold mid-charge and still fires', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  vm.runInContext('STATE.tutorial.active = false; STATE.fuel = 80;', sandbox);   // 关闭练习场（其会钉住燃料）；开始蓄力时满足 ≥70%

  windowObject.dispatch('keydown', { key: 'w', code: 'KeyW' });
  vm.runInContext('collectPickup = () => {}; pickupFuel = () => {}; updatePhysics(0.5)', sandbox);
  vm.runInContext('STATE.fuel = 60; updatePhysics(0.6)', sandbox);   // 蓄力中跌破 70%：不再取消，蓄满 1.1s 触发

  const snap = vm.runInContext(`({
    chargeT: STATE.fuelBurstChargeT, burstT: STATE.fuelBurstT, fuel: STATE.fuel,
  })`, sandbox);
  assert.equal(snap.chargeT, 0, 'charge state resets after the burst fires');
  assert.ok(snap.burstT > 0, `burst must fire once charging started above the threshold, got burstT=${snap.burstT}`);
  assert.ok(snap.fuel < 60, `the 40-percent burst cost applies on trigger, got ${snap.fuel}`);
});

test('Space and K always jump even when fuel burst is ready', () => {
  for (const code of ['Space', 'KeyK']) {
    const { sandbox, windowObject } = makeGameUiSandbox();
    vm.runInContext('startGame()', sandbox);
    vm.runInContext('STATE.fuel = 100;', sandbox);

    windowObject.dispatch('keydown', { key: code === 'Space' ? ' ' : 'k', code });

    const snap = vm.runInContext(`({
      fuel: STATE.fuel, burstT: STATE.fuelBurstT, jumpsUsed: STATE.jumpsUsed, playerY: STATE.playerY,
    })`, sandbox);
    assert.equal(snap.jumpsUsed, 1, `${code} must perform the first jump`);
    assert.equal(snap.burstT, 0, `${code} must not trigger fuel burst`);
    assert.equal(snap.fuel, 100, `${code} jump must keep the free first-jump fuel`);
    assert.ok(snap.playerY > 0, `${code} must lift the ship`);
  }
});

test('W stays inert below the fuel burst threshold or while airborne', () => {
  for (const setup of ['STATE.fuel = 69;', 'STATE.fuel = 100; STATE.playerY = 500; STATE.jumpsUsed = 1;']) {
    const { sandbox, windowObject } = makeGameUiSandbox();
    vm.runInContext('startGame()', sandbox);
    vm.runInContext(setup, sandbox);
    const jumpsBefore = vm.runInContext('STATE.jumpsUsed', sandbox);

    windowObject.dispatch('keydown', { key: 'w', code: 'KeyW' });

    const snap = vm.runInContext(`({ fuel: STATE.fuel, burstT: STATE.fuelBurstT, jumpsUsed: STATE.jumpsUsed, playerY: STATE.playerY })`, sandbox);
    assert.equal(snap.burstT, 0, `fuel burst must stay locked under setup: ${setup}`);
    assert.ok(snap.fuel >= 69 - CONFIG_TOLERANCE, `no burst fuel cost under setup: ${setup}`);
    assert.equal(snap.jumpsUsed, jumpsBefore, `W must not jump under setup: ${setup}`);
    assert.equal(snap.playerY, setup.includes('playerY = 500') ? 500 : 0, `W must not lift the ship under setup: ${setup}`);
  }
});

const CONFIG_TOLERANCE = 1e-9;

test('fuel burst stays locked out during BOOST and W stays inert', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  vm.runInContext('STATE.fuel = 100; STATE.boostT = 2;', sandbox);

  windowObject.dispatch('keydown', { key: 'w', code: 'KeyW' });

  const snap = vm.runInContext(`({
    fuel: STATE.fuel, burstT: STATE.fuelBurstT, jumpsUsed: STATE.jumpsUsed,
  })`, sandbox);
  assert.deepEqual({ ...snap }, { fuel: 100, burstT: 0, jumpsUsed: 0 });
});

test('fuel burst locks speed for three seconds and restores the previous speed on expiry', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const result = JSON.parse(vm.runInContext(`(() => {
    STATE.fuel = 100;
    STATE.speed = 20;
    STATE.tutorial.active = false;   // 关闭练习场沙盒，测真实规则
    extendTrack = () => {};
    tryFuelBurst();
    updatePhysics(0.1);
    const during = STATE.speed;
    STATE.fuelBurstT = 0;            // 强制到期：下一帧走恢复分支
    updatePhysics(0.1);
    return JSON.stringify({
      during,
      after: STATE.speed,
      prevCleared: STATE.fuelBurstPrevSpeed,
      invincible: STATE.boostT > 0 || STATE.fuelBurstT > 0,
    });
  })()`, sandbox));
  assert.equal(result.during, 36);
  assert.ok(Math.abs(result.after - (20 + 0.4 * 0.1)) < 1e-9, `speed must restore then resume acceleration, got ${result.after}`);
  assert.equal(result.prevCleared, 0);
});

test('fuel burst natural expiry fires end FX and a grace of invincibility, then collisions resume', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const result = JSON.parse(vm.runInContext(`(() => {
    STATE.fuel = 100;
    STATE.speed = 20;
    STATE.tutorial.active = false;   // 关闭练习场沙盒，测真实规则
    extendTrack = () => {};
    collectPickup = () => {};
    pickupFuel = () => {};
    for (const seg of STATE.track) seg.lanes = Array(CONFIG.LANES).fill(LANE_TYPE.WALL_LOW);  // 全程墙壁
    tryFuelBurst();
    STATE.fuelBurstT = 0.05;         // 即将自然到期（非强制清零，走跨零分支）
    updatePhysics(0.1);              // 跨零：结束特效 + 保护期开启
    const atExpiry = {
      burstT: STATE.fuelBurstT,
      graceT: STATE.fuelBurstGraceT,
      shockwave: Boolean(STATE.shockwave),
      flash: STATE.flash > 0,
      mode: STATE.mode,
      speedDuringExpiryFrame: STATE.speed,   // 跨零帧仍锁定 36（下一帧才恢复）
    };
    updatePhysics(0.5);              // 保护期内（剩约 0.5s）：穿墙不死；速度已恢复
    const midGrace = {
      mode: STATE.mode,
      graceT: STATE.fuelBurstGraceT,
      speedRestored: Math.abs(STATE.speed - (20 + CONFIG.ACCEL * 0.6)) < 0.5,
    };
    updatePhysics(1.0);              // 保护期耗尽 → 撞墙死亡
    const afterGrace = { mode: STATE.mode, graceT: STATE.fuelBurstGraceT };
    return JSON.stringify({ atExpiry, midGrace, afterGrace });
  })()`, sandbox));

  assert.equal(result.atExpiry.burstT, 0);
  assert.ok(result.atExpiry.graceT > 0.8, `grace should start near FUEL_BURST_GRACE(1), got ${result.atExpiry.graceT}`);
  assert.equal(result.atExpiry.shockwave, true, 'expiry must emit the gold shockwave ring');
  assert.equal(result.atExpiry.flash, true, 'expiry must flash the screen');
  assert.equal(result.atExpiry.mode, 'PLAYING', 'walls must not kill during the expiry frame');
  assert.equal(result.atExpiry.speedDuringExpiryFrame, 36, 'speed stays locked during the crossing frame');
  assert.equal(result.midGrace.mode, 'PLAYING', 'grace must keep the ship alive through walls');
  assert.equal(result.midGrace.speedRestored, true, 'speed must restore to the pre-burst value on the next frame');
  assert.ok(result.midGrace.graceT > 0 && result.midGrace.graceT < 0.6, `grace should tick down, got ${result.midGrace.graceT}`);
  assert.equal(result.afterGrace.mode, 'GAMEOVER', 'collisions must resume after the grace ends');
  assert.equal(result.afterGrace.graceT, 0);
});

// ---- v1.2.0 新手引导（Tutorial）----

test('the first mission walks through all five tutorial phases and marks them seen', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.active', sandbox), true);

  const result = JSON.parse(vm.runInContext(`(() => {
    const t = STATE.tutorial;
    const step = (s) => Skyroads.tutorial.updateTutorial(t, s, {
      position: 0,
      playerY: 0,
      playerVY: 0,
      fuel: 100,
      fuelBurstMin: CONFIG.FUEL_BURST_MIN,
      storage: STATE.storage,
    });
    const seen = [Skyroads.tutorial.currentPhase(t).id];
    for (const flag of ['laneChanged', 'jumped', 'glided', 'shot', 'fuelBursted']) {
      t[flag] = true;
      step(3);       // 超过 minDisplayTime，开始渐隐
      step(0.5);     // 完成渐隐，进入下一阶段
      const phase = Skyroads.tutorial.currentPhase(t);
      seen.push(phase ? phase.id : 'done');
    }
    return JSON.stringify({
      seen,
      active: t.active,
      stored: STATE.storage.getItem('skyroads_tutorial_seen_v2'),
    });
  })()`, sandbox));

  assert.deepEqual(result.seen, ['move', 'jump', 'glide', 'shoot', 'fuelBurst', 'done']);
  assert.equal(result.active, false);
  assert.equal(result.stored, 'true');
});

test('a pilot who has seen the tutorial skips it on later missions', () => {
  const stored = new Map([['skyroads_tutorial_seen_v2', 'true']]);
  const storage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const { sandbox } = makeGameUiSandbox({ storage });
  vm.runInContext('startGame()', sandbox);

  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.active', sandbox), false);
});

test('the tutorial times out without marking it seen, so later missions still offer it', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const result = JSON.parse(vm.runInContext(`(() => {
    const step = (s) => Skyroads.tutorial.updateTutorial(STATE.tutorial, s, {
      position: 0,
      playerY: 0,
      playerVY: 0,
      fuel: 100,
      fuelBurstMin: CONFIG.FUEL_BURST_MIN,
      storage: STATE.storage,
    });
    step(Skyroads.tutorial.TUTORIAL_TIME_CAP - 1);
    const beforeCap = STATE.tutorial.active;
    step(2);   // 累计超过 TUTORIAL_TIME_CAP
    return JSON.stringify({
      beforeCap,
      active: STATE.tutorial.active,
      stored: STATE.storage.getItem('skyroads_tutorial_seen_v2'),
    });
  })()`, sandbox));

  assert.equal(result.beforeCap, true, 'tutorial must survive long past the 24-segment warmup zone');
  assert.equal(result.active, false, 'tutorial ends after the time cap');
  assert.equal(result.stored, null, 'timeout must NOT mark the tutorial seen — an unfinished pilot keeps getting the guide');
});

test('the tutorial no longer ends when the player leaves the warmup zone early', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const result = JSON.parse(vm.runInContext(`(() => {
    // 回归：曾按 position >= WARMUP_SEGMENTS(24) 截断教学，
    // 起步约 3 秒就跑完 24 段，五个阶段只能看到第 1 个
    Skyroads.tutorial.updateTutorial(STATE.tutorial, 0.1, {
      position: CONFIG.WARMUP_SEGMENTS * 10,
      playerY: 0,
      playerVY: 0,
      fuel: 100,
      fuelBurstMin: CONFIG.FUEL_BURST_MIN,
      storage: STATE.storage,
    });
    return JSON.stringify({
      active: STATE.tutorial.active,
      phase: Skyroads.tutorial.currentPhase(STATE.tutorial).id,
    });
  })()`, sandbox));

  assert.equal(result.active, true, 'tutorial must continue beyond the warmup zone');
  assert.equal(result.phase, 'move');
});

test('the Training button forces the full tutorial even for a pilot who has seen it', () => {
  const stored = new Map([['skyroads_tutorial_seen_v2', 'true']]);
  const storage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const { sandbox } = makeGameUiSandbox({ storage });

  vm.runInContext('STATE.ui.tutorialButton.dispatch(\'click\')', sandbox);

  const snap = vm.runInContext(`({
    mode: STATE.mode,
    active: STATE.tutorial && STATE.tutorial.active,
    phase: STATE.tutorial && Skyroads.tutorial.currentPhase(STATE.tutorial).id,
  })`, sandbox);
  assert.deepEqual({ ...snap }, { mode: 'PLAYING', active: true, phase: 'move' });

  // 普通"开始任务"仍然尊重"已看过"标记
  vm.runInContext('gotoMenu()', sandbox);
  vm.runInContext('STATE.ui.startButton.dispatch(\'click\')', sandbox);
  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.active', sandbox), false);
});

test('tutorial practice sandbox: invincible, fuel pinned, speed capped while the guide is active', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);   // 首局自动教学处于 active
  const result = JSON.parse(vm.runInContext(`(() => {
    extendTrack = () => {};
    collectPickup = () => {};
    pickupFuel = () => {};
    for (const seg of STATE.track) seg.lanes = Array(CONFIG.LANES).fill(LANE_TYPE.WALL_LOW);  // 全程墙壁
    STATE.speed = 30;                        // 远超教学限速
    STATE.fuel = 40;                         // 低于燃料爆发阈值
    updatePhysics(1.0);
    const during = {
      mode: STATE.mode,
      fuel: STATE.fuel,
      speedCapped: STATE.speed <= CONFIG.TUTORIAL_SPEED_CAP + 1e-9,
      tutorialActive: STATE.tutorial.active,
    };
    Skyroads.tutorial.endTutorial(STATE.tutorial, STATE.storage);   // 教学结束 → 恢复真实规则
    updatePhysics(1.0);
    return JSON.stringify({ during, afterEnd: { mode: STATE.mode } });
  })()`, sandbox));

  assert.equal(result.during.tutorialActive, true);
  assert.equal(result.during.mode, 'PLAYING', 'walls must not kill during the tutorial sandbox');
  assert.equal(result.during.fuel, 100, 'fuel must be pinned to full so the Fuel Burst phase is always reachable');
  assert.equal(result.during.speedCapped, true, 'speed must be capped for newcomers');
  assert.equal(result.afterEnd.mode, 'GAMEOVER', 'real rules must resume once the tutorial ends');
});

test('the tutorial mission stays reachable after dying — no page refresh needed', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  // 教学超时结束后（不标记"已看过"）死亡：模拟用户问题"死了就再也进不去教学"
  vm.runInContext('STATE.tutorial.active = false; STATE.fuel = 0.001; updatePhysics(0.5)', sandbox);
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'GAMEOVER');

  // 途径一：指挥中心"新手教学"按钮随时可强制进入
  vm.runInContext('startTutorialMission()', sandbox);
  const snap = vm.runInContext(`({
    mode: STATE.mode,
    active: STATE.tutorial && STATE.tutorial.active,
    phase: STATE.tutorial && Skyroads.tutorial.currentPhase(STATE.tutorial).id,
  })`, sandbox);
  assert.deepEqual({ ...snap }, { mode: 'PLAYING', active: true, phase: 'move' });

  // 途径二：教学未完成（未标"已看过"）时死亡，普通"开始任务"也会继续自动引导
  vm.runInContext('STATE.tutorial.active = false; STATE.fuel = 0.001; updatePhysics(0.5)', sandbox);
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'GAMEOVER');
  vm.runInContext('startGame()', sandbox);
  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.active', sandbox), true,
    'an unfinished tutorial must be offered again on the next mission');
});

test('keyboard lane changes count toward the tutorial move phase', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.laneChanged', sandbox), false);

  windowObject.dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight' });

  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.laneChanged', sandbox), true,
    'a keyboard lane change must credit the tutorial move phase');

  // 走完显示时长后，引导应推进到跳跃阶段
  const phase = vm.runInContext(`(() => {
    const t = STATE.tutorial;
    Skyroads.tutorial.updateTutorial(t, 3, {
      position: 0, playerY: 0, playerVY: 0, fuel: 100,
      fuelBurstMin: CONFIG.FUEL_BURST_MIN, storage: STATE.storage,
    });
    Skyroads.tutorial.updateTutorial(t, 0.5, {
      position: 0, playerY: 0, playerVY: 0, fuel: 100,
      fuelBurstMin: CONFIG.FUEL_BURST_MIN, storage: STATE.storage,
    });
    const current = Skyroads.tutorial.currentPhase(t);
    return current ? current.id : 'done';
  })()`, sandbox);
  assert.equal(phase, 'jump');
});

test('firing a charged missile also counts toward the tutorial shoot phase', () => {
  const { sandbox } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  vm.runInContext('STATE.shots = []; fireMissile()', sandbox);
  assert.equal(vm.runInContext('STATE.tutorial && STATE.tutorial.shot', sandbox), true);
});

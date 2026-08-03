'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeShipDrawRect,
  fallbackShipLayout,
  VISUAL_ASSET_MANIFEST,
  preloadVisualAssets,
  resolveWorldAtlas,
  playerVisualLayerPlan,
  canvasMotionPolicy,
  computeHudLayout,
  canvasMetrics,
  overlayForMode,
  setOverlayMode,
  trapDialogTab,
  finalizeRunOnce,
  bindOverlayActions,
  renderRankingRows,
  createCommandCenter,
  updateNameCount,
  renderCommandCenter,
  focusPrimaryForMode,
} = require('../src/presentation.js');
const worldArt = require('../src/world-art.js');
const { createLeaderboard } = require('../src/leaderboard.js');
const {
  createMovementState,
  pressDirection,
  directionForCode,
  shouldHandleGameInput,
} = require('../src/input.js');

function imageAssetCount() {
  return ['ship', 'ui', 'icons'].reduce(
    (count, group) => count + Object.keys(VISUAL_ASSET_MANIFEST[group]).length,
    0,
  );
}

function recordingImageCtor(dimensionsForPath) {
  const record = { constructed: 0, sources: [], instances: [] };
  class RecordingImage {
    constructor() {
      record.constructed += 1;
      record.instances.push(this);
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
    }

    set src(value) {
      this._src = value;
      record.sources.push(value);
      const [width, height] = dimensionsForPath(value);
      this.naturalWidth = width;
      this.naturalHeight = height;
      queueMicrotask(() => { if (this.onload) this.onload(); });
    }

    get src() { return this._src; }
  }
  return { ImageCtor: RecordingImage, record };
}

async function withWorldManifest(manifest, callback) {
  const previous = globalThis.Skyroads.worldArt;
  globalThis.Skyroads.worldArt = {
    ...worldArt,
    WORLD_ATLAS_MANIFEST: manifest,
  };
  try {
    return await callback();
  } finally {
    globalThis.Skyroads.worldArt = previous;
  }
}

test('loaded neutral and thrust frames retain charge boost and super layers in draw order', () => {
  const neutral = { id: 'neutral' };
  const thrust = { id: 'thrust' };
  const ready = {
    shipFramesReady: true,
    assets: { ship: { neutral: { loaded: true, element: neutral }, thrust: { loaded: true, element: thrust } } },
  };

  const charging = playerVisualLayerPlan(ready, { chargeActive: true });
  assert.equal(charging.shipFrame, neutral);
  assert.deepEqual(charging.layers, ['ship-image', 'charge']);

  const energized = playerVisualLayerPlan(ready, {
    energized: true,
    chargeActive: true,
    boostActive: true,
    superActive: true,
  });
  assert.equal(energized.shipFrame, thrust);
  assert.deepEqual(energized.layers, ['ship-image', 'super-surface', 'charge', 'boost-aura', 'super-aura']);

  const fallback = playerVisualLayerPlan(null, { chargeActive: true, boostActive: true, superActive: true });
  assert.equal(fallback.shipFrame, null);
  assert.deepEqual(fallback.layers, ['procedural-ship', 'super-surface', 'charge', 'boost-aura', 'super-aura']);
});

test('world atlas resolution isolates unavailable variants from loaded atlases', () => {
  const scout = { id: 'drone-scout' };
  const visualAssets = {
    assets: {
      world: {
        droneScout: { loaded: true, element: scout },
        droneStriker: { loaded: false, element: { id: 'missing' } },
      },
    },
  };

  assert.equal(resolveWorldAtlas(visualAssets, 'droneScout'), scout);
  assert.equal(resolveWorldAtlas(visualAssets, 'droneStriker'), null);
  assert.equal(resolveWorldAtlas(visualAssets, 'unknown'), null);
});

test('world preload rejects malformed exact metadata before constructing an image', async () => {
  const malformed = structuredClone(worldArt.WORLD_ATLAS_MANIFEST.droneScout);
  malformed.path = './assets/world/malformed-drone.png';
  malformed.atlasWidth = 2239;
  const manifest = {
    droneScout: malformed,
    droneStriker: worldArt.WORLD_ATLAS_MANIFEST.droneStriker,
  };
  const { ImageCtor, record } = recordingImageCtor((assetPath) => (
    assetPath === manifest.droneStriker.path ? [2240, 960] : [1, 1]
  ));

  const visualAssets = await withWorldManifest(manifest, () => preloadVisualAssets({
    ImageCtor,
    FontFaceCtor: null,
    setTimeoutFn: null,
  }));

  assert.equal(record.constructed, imageAssetCount() + 1);
  assert.equal(record.sources.includes(malformed.path), false);
  assert.deepEqual(visualAssets.world.loaded, ['droneStriker']);
  assert.deepEqual(visualAssets.world.fallback, ['droneScout']);
  assert.equal(visualAssets.assets.world.droneScout.element, null);
  assert.equal(resolveWorldAtlas(visualAssets, 'droneScout'), null);
  assert.equal(resolveWorldAtlas(visualAssets, 'droneStriker').src, manifest.droneStriker.path);
});

test('world preload isolates every non-record and unreadable or empty exact path', async () => {
  const emptyPath = structuredClone(worldArt.WORLD_ATLAS_MANIFEST.droneScout);
  emptyPath.path = '';
  const whitespacePath = structuredClone(worldArt.WORLD_ATLAS_MANIFEST.droneScout);
  whitespacePath.path = '   ';
  const numericPath = structuredClone(worldArt.WORLD_ATLAS_MANIFEST.droneScout);
  numericPath.path = 0;
  const throwingPath = structuredClone(worldArt.WORLD_ATLAS_MANIFEST.droneScout);
  Object.defineProperty(throwingPath, 'path', {
    enumerable: true,
    get() { throw new Error('unreadable exact path'); },
  });
  const cases = [
    ['null record', null],
    ['undefined record', undefined],
    ['false record', false],
    ['zero record', 0],
    ['string record', 'not metadata'],
    ['empty path', emptyPath],
    ['whitespace path', whitespacePath],
    ['numeric path', numericPath],
    ['throwing path getter', throwingPath],
  ];

  for (const [label, invalid] of cases) {
    const sibling = worldArt.WORLD_ATLAS_MANIFEST.droneStriker;
    const manifest = { invalid, droneStriker: sibling };
    const { ImageCtor, record } = recordingImageCtor((assetPath) => (
      assetPath === sibling.path ? [2240, 960] : [1, 1]
    ));
    let visualAssets = null;
    let failure = null;
    try {
      visualAssets = await withWorldManifest(manifest, () => preloadVisualAssets({
        ImageCtor,
        FontFaceCtor: null,
        setTimeoutFn: null,
      }));
    } catch (error) {
      failure = error;
    }

    assert.equal(failure, null, label);
    assert.equal(record.constructed, imageAssetCount() + 1, label);
    assert.deepEqual(visualAssets.world.loaded, ['droneStriker'], label);
    assert.deepEqual(visualAssets.world.fallback, ['invalid'], label);
    assert.equal(visualAssets.assets.world.invalid.element, null, label);
    assert.equal(resolveWorldAtlas(visualAssets, 'invalid'), null, label);
    assert.equal(resolveWorldAtlas(visualAssets, 'droneStriker').src, sibling.path, label);
    assert.deepEqual(visualAssets.world.categoryReady, {
      drone: true,
      turret: false,
      wallLow: false,
      wallMedium: false,
      wallHigh: false,
      corridorLow: false,
      corridorMedium: false,
      gap: false,
    }, label);
  }
});

test('world preload enforces exact upright and road-edge natural dimensions per key', async () => {
  const manifest = worldArt.WORLD_ATLAS_MANIFEST;
  const { ImageCtor } = recordingImageCtor((assetPath) => {
    if (assetPath === manifest.droneScout.path) return [3584, 512];
    if (assetPath === manifest.gapEdge.path) return [2240, 960];
    if (Object.values(manifest).some((metadata) => metadata.path === assetPath)) return [2240, 960];
    return [1, 1];
  });

  const visualAssets = await withWorldManifest(manifest, () => preloadVisualAssets({
    ImageCtor,
    FontFaceCtor: null,
    setTimeoutFn: null,
  }));

  assert.deepEqual(visualAssets.world.fallback, ['droneScout', 'gapEdge']);
  assert.equal(resolveWorldAtlas(visualAssets, 'droneScout'), null);
  assert.equal(resolveWorldAtlas(visualAssets, 'droneStriker').src, manifest.droneStriker.path);
  assert.equal(resolveWorldAtlas(visualAssets, 'gapEdge'), null);
});

test('world preload exposes all eight exact categories when dimensions are valid', async () => {
  const manifest = worldArt.WORLD_ATLAS_MANIFEST;
  const worldPaths = new Set(Object.values(manifest).map((metadata) => metadata.path));
  const { ImageCtor } = recordingImageCtor((assetPath) => {
    if (assetPath === manifest.gapEdge.path) return [3584, 512];
    if (worldPaths.has(assetPath)) return [2240, 960];
    return [1, 1];
  });

  const visualAssets = await withWorldManifest(manifest, () => preloadVisualAssets({
    ImageCtor,
    FontFaceCtor: null,
    setTimeoutFn: null,
  }));

  assert.deepEqual(visualAssets.world.fallback, []);
  assert.deepEqual(visualAssets.world.categoryReady, {
    drone: true,
    turret: true,
    wallLow: true,
    wallMedium: true,
    wallHigh: true,
    corridorLow: true,
    corridorMedium: true,
    gap: true,
  });
});

test('canvas reduced-motion policy keeps gameplay moving but steadies decorative effects', () => {
  assert.deepEqual(canvasMotionPolicy(false), {
    decorativeMotion: true,
    warningPulse: true,
    shakeScale: 1,
    deathFlashScale: 1,
    deathParticleCount: 48,
    deathShockwave: true,
  });
  assert.deepEqual(canvasMotionPolicy(true), {
    decorativeMotion: false,
    warningPulse: false,
    shakeScale: 0,
    deathFlashScale: 0.15,
    deathParticleCount: 12,
    deathShockwave: false,
  });
  assert.equal(canvasMotionPolicy(false), canvasMotionPolicy(false), 'hot render paths must reuse the normal policy object');
  assert.equal(canvasMotionPolicy(true), canvasMotionPolicy(true), 'hot render paths must reuse the reduced policy object');
});

test('ship stays within seven to nine percent at target viewports', () => {
  for (const [width, height] of [[960, 600], [1280, 800], [1440, 900], [1920, 1080]]) {
    const rect = computeShipDrawRect(width, height, 4 / 3);
    const ratio = rect.width / width;
    assert.ok(ratio >= 0.07 && ratio <= 0.09, `${width}x${height}: ${ratio}`);
    assert.equal(rect.height, rect.width / (4 / 3));
  }
});

test('the fallback renderer layout consumes the shared ship draw rectangle', () => {
  for (const [width, height] of [[960, 600], [1280, 800], [1440, 900], [1920, 1080]]) {
    const drawRect = computeShipDrawRect(width, height, 2.4);
    const layout = fallbackShipLayout(width, height, width * 0.42, height * 0.73);
    assert.equal(layout.width, drawRect.width);
    assert.equal(layout.height, drawRect.height);
    assert.equal(layout.halfWidth, drawRect.width / 2);
    assert.equal(layout.centerX, width * 0.42);
    assert.equal(layout.centerY, height * 0.73);
  }
});

test('right HUD starts below utility controls at all target viewports', () => {
  for (const locale of ['zh-CN', 'en']) {
    for (const [width, height] of [[960, 600], [1280, 800], [1440, 900], [1920, 1080]]) {
      const layout = computeHudLayout(width, height, locale);
      assert.ok(layout.rightTop > layout.utilityBottom, `${locale} ${width}x${height}`);
      assert.ok(layout.rightBottom <= height, `${locale} ${width}x${height}`);
      assert.equal(layout.rightX, width - 16);
    }
  }
});

test('only the mode overlay selected by game state is visible', () => {
  assert.deepEqual(overlayForMode('MENU'), { title: true, pause: false, gameOver: false });
  assert.deepEqual(overlayForMode('PLAYING'), { title: false, pause: false, gameOver: false });
  assert.deepEqual(overlayForMode('PAUSED'), { title: false, pause: true, gameOver: false });
  assert.deepEqual(overlayForMode('GAMEOVER'), { title: false, pause: false, gameOver: true });
});

test('setOverlayMode exposes exactly one of the three semantic panels', () => {
  const titleScreen = { hidden: true };
  const pauseScreen = { hidden: true };
  const gameOverScreen = { hidden: true };
  const elements = { titleScreen, pauseScreen, gameOverScreen };
  for (const [mode, expected] of [
    ['MENU', [false, true, true]],
    ['PLAYING', [true, true, true]],
    ['PAUSED', [true, false, true]],
    ['GAMEOVER', [true, true, false]],
  ]) {
    setOverlayMode(elements, mode);
    assert.deepEqual([titleScreen.hidden, pauseScreen.hidden, gameOverScreen.hidden], expected, mode);
  }
});

test('device pixel ratio is capped at two without changing logical size', () => {
  assert.deepEqual(canvasMetrics(1280, 800, 3), {
    cssWidth: 1280,
    cssHeight: 800,
    pixelWidth: 2560,
    pixelHeight: 1600,
    dpr: 2,
  });
});

test('mode transitions move focus to the active gameplay or panel surface', () => {
  const focused = [];
  const canvas = { tabIndex: 0, focus() { focused.push('canvas'); } };
  const startButton = { focus() { focused.push('start'); } };
  const restartButton = { focus() { focused.push('restart'); } };
  const elements = { canvas, startButton, restartButton };

  assert.equal(focusPrimaryForMode(elements, 'PLAYING'), canvas);
  assert.equal(canvas.tabIndex, -1);
  assert.equal(focusPrimaryForMode(elements, 'MENU'), startButton);
  assert.equal(focusPrimaryForMode(elements, 'PAUSED'), null);
  assert.equal(focusPrimaryForMode(elements, 'GAMEOVER'), restartButton);
  assert.deepEqual(focused, ['canvas', 'start', 'restart']);
});

test('dialog Tab handling wraps focus in both directions', () => {
  const focused = [];
  const makeElement = (name) => ({
    hidden: false,
    disabled: false,
    tabIndex: 0,
    getAttribute() { return null; },
    focus() { focused.push(name); },
  });
  const first = makeElement('first');
  const last = makeElement('last');
  const dialog = { querySelectorAll() { return [first, last]; } };
  let prevented = false;

  assert.equal(trapDialogTab(dialog, { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } }, last), true);
  assert.equal(prevented, true);
  assert.deepEqual(focused, ['first']);

  prevented = false;
  assert.equal(trapDialogTab(dialog, { key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } }, first), true);
  assert.equal(prevented, true);
  assert.deepEqual(focused, ['first', 'last']);

  prevented = false;
  assert.equal(trapDialogTab(dialog, { key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } }, {}), true);
  assert.equal(prevented, true);
  assert.deepEqual(focused, ['first', 'last', 'last']);
});

test('finalizeRunOnce inserts one result even when called repeatedly', () => {
  let id = 0;
  const leaderboard = createLeaderboard({
    storage: null,
    cryptoObject: { randomUUID() { id += 1; return `id-${id}`; } },
    now: () => new Date('2026-08-02T12:00:00.000Z'),
    random: () => 0,
  });
  leaderboard.initialize();
  const run = {
    runId: leaderboard.createRunId(),
    distanceMeters: 321.8,
    enemyKills: 2,
    elapsedMs: 5000,
    score: 0,
    finalResult: null,
  };

  const first = finalizeRunOnce(run, leaderboard);
  const second = finalizeRunOnce(run, leaderboard);

  assert.equal(first, second);
  assert.equal(run.score, 361);
  assert.equal(leaderboard.getSnapshot().entries.length, 1);
});

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.children = [];
    this.attributes = new Map();
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
    for (const listener of this.listeners.get(type) || []) listener({ type, target: this, ...event });
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}

function makeFakeDocument() {
  const documentObject = new FakeEventTarget();
  documentObject.activeElement = null;
  documentObject.createElement = (tagName) => {
    const element = new FakeEventTarget();
    element.ownerDocument = documentObject;
    element.tagName = tagName.toUpperCase();
    element.textContent = '';
    element.value = '';
    element.focus = () => { documentObject.activeElement = element; };
    return element;
  };
  return documentObject;
}

test('bound dialogs trap Tab, close on Escape and restore opener focus', () => {
  const documentObject = new FakeEventTarget();
  documentObject.activeElement = null;
  const opener = new FakeEventTarget();
  opener.focus = () => { documentObject.activeElement = opener; };
  const first = new FakeEventTarget();
  first.focus = () => { documentObject.activeElement = first; };
  const last = new FakeEventTarget();
  last.focus = () => { documentObject.activeElement = last; };
  const dialog = new FakeEventTarget();
  dialog.hidden = true;
  dialog.querySelectorAll = () => [first, last];

  const gameOverScreen = new FakeEventTarget();
  const pauseScreen = new FakeEventTarget();
  const utilityControls = new FakeEventTarget();
  const controller = bindOverlayActions({ documentObject, elements: { gameOverScreen, pauseScreen, utilityControls } });
  controller.openDialog(dialog, opener);
  assert.equal(dialog.hidden, false);
  assert.equal(gameOverScreen.inert, true);
  assert.equal(pauseScreen.inert, true);
  assert.equal(pauseScreen.getAttribute('aria-hidden'), 'true');
  assert.equal(gameOverScreen.getAttribute('aria-hidden'), 'true');
  assert.equal(documentObject.activeElement, first);

  let tabPrevented = false;
  documentObject.dispatch('keydown', {
    key: 'Tab',
    shiftKey: true,
    preventDefault() { tabPrevented = true; },
  });
  assert.equal(tabPrevented, true);
  assert.equal(documentObject.activeElement, last);

  let escapePrevented = false;
  documentObject.dispatch('keydown', {
    key: 'Escape',
    preventDefault() { escapePrevented = true; },
  });
  assert.equal(escapePrevented, true);
  assert.equal(dialog.hidden, true);
  assert.equal(gameOverScreen.inert, false);
  assert.equal(gameOverScreen.getAttribute('aria-hidden'), null);
  assert.equal(pauseScreen.inert, false);
  assert.equal(pauseScreen.getAttribute('aria-hidden'), null);
  assert.equal(documentObject.activeElement, opener);
  controller.destroy();
});

test('nested rename dialog returns to its leaderboard opener before restoring the page', () => {
  const documentObject = makeFakeDocument();
  const pageOpener = documentObject.createElement('button');
  const leaderboardOpener = documentObject.createElement('button');
  const leaderboardDialog = documentObject.createElement('section');
  const renameDialog = documentObject.createElement('section');
  leaderboardDialog.hidden = true;
  renameDialog.hidden = true;
  leaderboardDialog.querySelectorAll = () => [leaderboardOpener];
  renameDialog.querySelectorAll = () => [documentObject.createElement('input')];
  const titleScreen = documentObject.createElement('section');
  pageOpener.focus = () => {
    assert.equal(titleScreen.inert, false, 'page must leave inert state before focus restoration');
    documentObject.activeElement = pageOpener;
  };
  const controller = bindOverlayActions({ documentObject, elements: { titleScreen } });

  controller.openDialog(leaderboardDialog, pageOpener);
  controller.openDialog(renameDialog, leaderboardOpener);
  assert.equal(leaderboardDialog.hidden, true);
  controller.closeDialog(renameDialog);
  assert.equal(renameDialog.hidden, true);
  assert.equal(leaderboardDialog.hidden, false);
  assert.equal(controller.getOpenDialog(), leaderboardDialog);
  assert.equal(documentObject.activeElement, leaderboardOpener);
  assert.equal(titleScreen.inert, true);

  controller.closeDialog(leaderboardDialog);
  assert.equal(documentObject.activeElement, pageOpener);
  assert.equal(titleScreen.inert, false);
  controller.destroy();
});

test('nested dialogs isolate Canvas and restore its prior accessibility and focus state', () => {
  const documentObject = makeFakeDocument();
  const canvas = documentObject.createElement('canvas');
  canvas.tabIndex = -1;
  canvas.inert = false;
  canvas.setAttribute('aria-hidden', 'false');
  const titleScreen = documentObject.createElement('section');
  titleScreen.inert = true;
  const leaderboardOpener = documentObject.createElement('button');
  const leaderboardDialog = documentObject.createElement('section');
  const renameDialog = documentObject.createElement('section');
  const renameInput = documentObject.createElement('input');
  leaderboardDialog.hidden = true;
  renameDialog.hidden = true;
  leaderboardDialog.querySelectorAll = () => [leaderboardOpener];
  renameDialog.querySelectorAll = () => [renameInput];
  canvas.focus();

  const controller = bindOverlayActions({ documentObject, elements: { canvas, titleScreen } });
  controller.openDialog(leaderboardDialog, canvas);
  assert.equal(canvas.inert, true);
  assert.equal(canvas.getAttribute('aria-hidden'), 'true');
  assert.equal(canvas.tabIndex, -1);

  controller.openDialog(renameDialog, leaderboardOpener);
  controller.closeDialog(renameDialog);
  assert.equal(canvas.inert, true);
  assert.equal(canvas.getAttribute('aria-hidden'), 'true');
  assert.equal(documentObject.activeElement, leaderboardOpener);

  controller.closeDialog(leaderboardDialog);
  assert.equal(canvas.inert, false);
  assert.equal(canvas.getAttribute('aria-hidden'), 'false');
  assert.equal(canvas.tabIndex, -1);
  assert.equal(titleScreen.inert, true);
  assert.equal(titleScreen.getAttribute('aria-hidden'), null);
  assert.equal(documentObject.activeElement, canvas);
  controller.destroy();
});

test('language music and SFX utilities restore gameplay focus before the next movement key', () => {
  const documentObject = makeFakeDocument();
  const canvas = documentObject.createElement('canvas');
  const languageButton = documentObject.createElement('button');
  const musicButton = documentObject.createElement('button');
  const sfxButton = documentObject.createElement('button');
  const dialog = documentObject.createElement('section');
  const dialogButton = documentObject.createElement('button');
  dialog.hidden = true;
  dialog.querySelectorAll = () => [dialogButton];
  let mode = 'PLAYING';
  const calls = [];
  const controller = bindOverlayActions({
    documentObject,
    elements: { canvas, languageButton, musicButton, sfxButton },
    actions: {
      getMode: () => mode,
      language() { calls.push('language'); },
      music() { calls.push('music'); },
      sfx() { calls.push('sfx'); },
    },
  });

  function pressMovementKey(code) {
    const movement = createMovementState(3);
    const canHandle = shouldHandleGameInput({
      mode,
      targetInsideAppUi: documentObject.activeElement !== canvas,
      modalOpen: Boolean(controller.getOpenDialog()),
    });
    if (canHandle) pressDirection(movement, directionForCode(code));
    return movement.segmentTarget;
  }

  languageButton.focus();
  languageButton.dispatch('click');
  assert.equal(documentObject.activeElement, canvas);
  assert.equal(pressMovementKey('ArrowRight'), 4);

  musicButton.focus();
  musicButton.dispatch('click');
  assert.equal(documentObject.activeElement, canvas);
  assert.equal(pressMovementKey('ArrowLeft'), 2);

  sfxButton.focus();
  sfxButton.dispatch('click');
  assert.equal(documentObject.activeElement, canvas);

  controller.openDialog(dialog, canvas);
  languageButton.dispatch('click');
  assert.equal(documentObject.activeElement, dialogButton);
  assert.equal(pressMovementKey('ArrowRight'), 3);
  assert.deepEqual(calls, ['language', 'music', 'sfx', 'language']);
  mode = 'MENU';
  controller.closeDialog(dialog);
  controller.destroy();
});

test('ranking renderer preserves player names as text and never markup', () => {
  const documentObject = {
    createElement(tagName) {
      const element = new FakeEventTarget();
      element.tagName = tagName.toUpperCase();
      element.textContent = '';
      return element;
    },
  };
  const body = new FakeEventTarget();
  const translator = {
    t(id) { return id === 'leaderboard.newest' ? 'NEW' : id; },
    formatNumber(value) { return String(value); },
    formatDate() { return '2026-08-02'; },
  };
  renderRankingRows(body, [{
    id: 'run-1',
    name: '<img src=x onerror=alert(1)>',
    score: 42,
    distanceMeters: 40,
    elapsedMs: 2000,
    createdAt: '2026-08-02T12:00:00.000Z',
  }], { documentObject, translator, newestId: 'run-1' });

  const row = body.children[0];
  assert.equal(row.children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(row.children[1].children.length, 0);
  assert.equal(row.getAttribute('data-newest'), 'true');
});

test('command center builds one semantic control tree and renders translated state', () => {
  const documentObject = makeFakeDocument();
  const elements = {
    utilityControls: documentObject.createElement('nav'),
    titleScreen: documentObject.createElement('section'),
    pauseScreen: documentObject.createElement('section'),
    gameOverScreen: documentObject.createElement('section'),
    leaderboardDialog: documentObject.createElement('section'),
    renameDialog: documentObject.createElement('section'),
    persistenceWarning: documentObject.createElement('p'),
    ariaStatus: documentObject.createElement('p'),
  };
  const ui = createCommandCenter({ documentObject, elements });
  assert.deepEqual(elements.utilityControls.children, [ui.languageButton, ui.musicButton, ui.sfxButton]);
  assert.equal(elements.leaderboardDialog.children[0], ui.leaderboardPanel);
  assert.equal(elements.renameDialog.children[0], ui.renamePanel);
  assert.match(ui.startButton.className, /mission-action/);
  assert.equal(ui.startButton.getAttribute('aria-keyshortcuts'), 'Enter Space');
  assert.equal(ui.restartButton.getAttribute('aria-keyshortcuts'), 'Enter Space');
  assert.equal(ui.menuButton.getAttribute('aria-keyshortcuts'), 'Escape');
  assert.equal(ui.controlItems.length, 5);
  assert.equal(ui.titleMeta.tagName, 'DIV');
  assert.equal(ui.titleMeta.className, 'title-meta');
  assert.deepEqual(ui.titleMeta.children, [ui.titleKicker, ui.versionBadge]);
  assert.equal(ui.versionBadge.tagName, 'SMALL');
  assert.equal(ui.versionBadge.tabIndex, -1);
  assert.equal(elements.pauseScreen.getAttribute('aria-labelledby'), 'pause-heading');
  assert.deepEqual(elements.pauseScreen.children, [ui.pauseHeading, ui.pauseHint]);
  assert.ok(ui.routeGuide, 'the command center must expose its route-guide paragraph');
  assert.equal(ui.routeGuide.tagName, 'P');
  assert.equal(ui.routeGuide.className, 'route-guide');
  assert.equal(elements.titleScreen.children.at(-1), ui.routeGuide);
  assert.equal(
    elements.titleScreen.children.filter((child) => child.className === 'route-guide').length,
    1,
  );
  const translator = {
    locale: 'en',
    t(id, values = {}) {
      if (id === 'shortcut.startRestart') return 'Enter / Space';
      if (id === 'shortcut.returnMenu') return 'Esc';
      return `${id}${Object.keys(values).length ? `:${Object.values(values).join('|')}` : ''}`;
    },
    formatNumber(value) { return String(value); },
    formatDate() { return '2026-08-02'; },
    countCharacters(value) { return Array.from(value).length; },
  };
  renderCommandCenter(ui, {
    translator,
    mode: 'PAUSED',
    productVersion: { display: 'V1.1', accessible: '1.1' },
    deathReason: 'wall',
    musicMuted: false,
    sfxMuted: true,
    audioStatus: 'ready',
    audioFormat: 'ogg',
    audioDecoded: true,
    snapshot: {
      profile: { playerId: 'player-1', name: '<Nova>' },
      entries: [],
      legacyBest: 77,
      persistenceWarning: true,
    },
    finalResult: {
      score: 123,
      distanceMeters: 101.5,
      elapsedMs: 2500,
      qualified: false,
      rank: null,
      cutoff: 200,
      entry: null,
      newLocalBest: false,
    },
  });

  assert.equal(elements.titleScreen.hidden, true);
  assert.equal(elements.pauseScreen.hidden, false);
  assert.equal(elements.gameOverScreen.hidden, true);
  assert.equal(ui.versionBadge.hidden, false);
  assert.equal(ui.versionBadge.textContent, 'V1.1');
  assert.equal(ui.versionBadge.getAttribute('aria-label'), 'app.versionLabel:1.1');
  assert.equal(ui.pauseHeading.textContent, 'pause.title');
  assert.equal(ui.pauseHint.textContent, 'pause.resumeHint');
  assert.equal(ui.controlItems[4].textContent, 'controls.pause');
  assert.equal(ui.profileName.textContent, 'rename.label: <Nova>');
  assert.equal(ui.deathReason.textContent, 'death.wall');
  assert.equal(ui.resultScore.textContent, 'result.score:123');
  assert.equal(ui.resultRank.textContent, 'result.notQualified:200');
  assert.equal(ui.legacyBest.hidden, false);
  assert.equal(elements.persistenceWarning.hidden, false);
  assert.equal(ui.leaderboardEmpty.hidden, false);
  assert.equal(ui.musicButton.textContent, 'settings.musicOn');
  assert.equal(ui.musicButton.getAttribute('aria-pressed'), 'true');
  assert.equal(ui.musicButton.getAttribute('data-muted'), 'false');
  assert.equal(ui.sfxButton.textContent, 'settings.sfxOff');
  assert.equal(ui.sfxButton.getAttribute('aria-pressed'), 'false');
  assert.equal(ui.sfxButton.getAttribute('data-muted'), 'true');
  assert.equal(elements.utilityControls.getAttribute('data-audio-status'), 'ready');
  assert.equal(elements.utilityControls.getAttribute('data-audio-format'), 'ogg');
  assert.equal(elements.utilityControls.getAttribute('data-audio-decoded'), 'true');
  assert.equal(elements.utilityControls.getAttribute('aria-label'), 'settings.label');
  assert.equal(ui.startButton.children[1].className, 'shortcut-hint');
  assert.equal(ui.startButton.children[1].children[0].textContent, 'Enter');
  assert.equal(ui.startButton.children[1].children[2].textContent, 'Space');
  assert.equal(ui.startButton.children[0].textContent, 'menu.start');
  assert.equal(ui.routeGuide.textContent, 'guide.routes');

  const originalRouteGuide = ui.routeGuide;
  const alternateTranslator = {
    ...translator,
    locale: 'zh-CN',
    t(id, values = {}) {
      if (id === 'guide.routes') return 'translated:guide.routes';
      return translator.t(id, values);
    },
  };
  renderCommandCenter(ui, {
    translator: alternateTranslator,
    mode: 'MENU',
    productVersion: null,
    snapshot: {
      profile: { playerId: 'player-1', name: '<Nova>' },
      entries: [],
      legacyBest: null,
      persistenceWarning: false,
    },
  });
  assert.equal(ui.routeGuide, originalRouteGuide);
  assert.equal(ui.routeGuide.textContent, 'translated:guide.routes');
  assert.equal(ui.versionBadge.hidden, true);
  assert.equal(ui.versionBadge.textContent, '');
  assert.equal(ui.versionBadge.getAttribute('aria-label'), null);
  assert.equal(ui.pauseHeading.textContent, 'pause.title');
  assert.equal(ui.pauseHint.textContent, 'pause.resumeHint');
  assert.equal(
    elements.titleScreen.children.filter((child) => child.className === 'route-guide').length,
    1,
  );
});

test('rename count uses the same grapheme segmentation as the persisted name', () => {
  const documentObject = makeFakeDocument();
  const ui = { renameCount: documentObject.createElement('span') };
  const translator = {
    t(id, values) { return `${id}:${values.count}/${values.max}`; },
    countCharacters(value) { return Array.from(value).length; },
  };
  updateNameCount(ui, translator, `👨‍👩‍👧‍👦e\u0301`);
  assert.equal(ui.renameCount.textContent, 'rename.characterCount:2/16');
});

test('rename input clamps and submits at the shared 16-grapheme boundary', () => {
  const documentObject = makeFakeDocument();
  const button = () => documentObject.createElement('button');
  const elements = {
    renameForm: documentObject.createElement('form'),
    renameInput: documentObject.createElement('input'),
    renameDialog: documentObject.createElement('section'),
    renameCancelButton: button(),
  };
  elements.renameDialog.hidden = false;
  elements.renameDialog.querySelectorAll = () => [elements.renameInput, elements.renameCancelButton];
  const calls = [];
  const controller = bindOverlayActions({
    documentObject,
    elements,
    actions: {
      nameInput(value) { calls.push(['count', value]); },
      rename(value) { calls.push(['rename', value]); },
    },
  });
  const family = '👨‍👩‍👧‍👦';
  const combining = 'e\u0301';
  const expected = `${'A'.repeat(14)}${family}${combining}`;
  elements.renameInput.value = `${expected}Z`;
  elements.renameInput.dispatch('input');
  elements.renameForm.dispatch('submit', { preventDefault() {} });

  assert.equal(elements.renameInput.value, expected);
  assert.deepEqual(calls, [['count', expected], ['rename', expected]]);
  controller.destroy();
});

test('rename input preserves an in-progress space so multiword pilot names remain typeable', () => {
  const documentObject = makeFakeDocument();
  const elements = {
    renameForm: documentObject.createElement('form'),
    renameInput: documentObject.createElement('input'),
    renameDialog: documentObject.createElement('section'),
    renameCancelButton: documentObject.createElement('button'),
  };
  elements.renameDialog.hidden = false;
  elements.renameDialog.querySelectorAll = () => [elements.renameInput, elements.renameCancelButton];
  const submitted = [];
  const controller = bindOverlayActions({
    documentObject,
    elements,
    actions: { rename(value) { submitted.push(value); } },
  });

  elements.renameInput.value = 'Han ';
  elements.renameInput.dispatch('input');
  assert.equal(elements.renameInput.value, 'Han ');
  elements.renameInput.value += 'Solo';
  elements.renameForm.dispatch('submit', { preventDefault() {} });
  assert.deepEqual(submitted, ['Han Solo']);
  controller.destroy();
});

test('rename input defers clamping during IME composition and clamps once composition ends', () => {
  const documentObject = makeFakeDocument();
  const elements = {
    renameForm: documentObject.createElement('form'),
    renameInput: documentObject.createElement('input'),
    renameDialog: documentObject.createElement('section'),
    renameCancelButton: documentObject.createElement('button'),
    leaderboardRenameButton: documentObject.createElement('button'),
  };
  elements.renameDialog.hidden = false;
  elements.renameDialog.querySelectorAll = () => [elements.renameInput, elements.renameCancelButton];
  const counts = [];
  const controller = bindOverlayActions({
    documentObject,
    elements,
    actions: { nameInput(value) { counts.push(value); } },
  });
  const composing = '星'.repeat(17);
  elements.renameInput.dispatch('compositionstart');
  elements.renameInput.value = composing;
  elements.renameInput.dispatch('input', { isComposing: true });

  assert.equal(elements.renameInput.value, composing);
  assert.deepEqual(counts, []);

  elements.renameInput.dispatch('compositionend');
  assert.equal(elements.renameInput.value, '星'.repeat(16));
  assert.deepEqual(counts, ['星'.repeat(16)]);

  elements.renameInput.dispatch('compositionstart');
  elements.renameCancelButton.dispatch('click');
  elements.leaderboardRenameButton.dispatch('click');
  elements.renameInput.value = 'Nova';
  elements.renameInput.dispatch('input');
  assert.deepEqual(counts, ['星'.repeat(16), '星'.repeat(16), 'Nova'], 'reopening clears a stranded composition state');
  controller.destroy();
});

test('rename input does not rewrite an unchanged value or move its caret', () => {
  const documentObject = makeFakeDocument();
  const renameInput = documentObject.createElement('input');
  let value = 'Nova';
  let writes = 0;
  Object.defineProperty(renameInput, 'value', {
    configurable: true,
    get() { return value; },
    set(next) {
      writes += 1;
      value = String(next);
      this.selectionStart = value.length;
      this.selectionEnd = value.length;
    },
  });
  renameInput.selectionStart = 1;
  renameInput.selectionEnd = 1;
  const elements = {
    renameForm: documentObject.createElement('form'),
    renameInput,
    renameDialog: documentObject.createElement('section'),
    renameCancelButton: documentObject.createElement('button'),
  };
  elements.renameDialog.hidden = false;
  elements.renameDialog.querySelectorAll = () => [renameInput, elements.renameCancelButton];
  const controller = bindOverlayActions({ documentObject, elements, actions: {} });

  renameInput.dispatch('input');

  assert.equal(writes, 0);
  assert.equal(renameInput.selectionStart, 1);
  assert.equal(renameInput.selectionEnd, 1);

  value = 'No\u0000va';
  renameInput.selectionStart = 3;
  renameInput.selectionEnd = 3;
  renameInput.dispatch('input');
  assert.equal(writes, 1);
  assert.equal(renameInput.value, 'Nova');
  assert.equal(renameInput.selectionStart, 2);
  assert.equal(renameInput.selectionEnd, 2);
  controller.destroy();
});

test('overlay buttons invoke game actions and rename submits the optional value', () => {
  const documentObject = makeFakeDocument();
  const button = () => documentObject.createElement('button');
  const elements = {
    startButton: button(), restartButton: button(), menuButton: button(),
    titleLeaderboardButton: button(), gameOverLeaderboardButton: button(),
    leaderboardCloseButton: button(), leaderboardRenameButton: button(),
    gameOverRenameButton: button(), renameCancelButton: button(),
    languageButton: button(), musicButton: button(), sfxButton: button(),
    renameForm: documentObject.createElement('form'),
    renameInput: documentObject.createElement('input'),
    leaderboardDialog: documentObject.createElement('section'),
    renameDialog: documentObject.createElement('section'),
  };
  elements.leaderboardDialog.hidden = true;
  elements.renameDialog.hidden = true;
  elements.leaderboardDialog.querySelectorAll = () => [elements.leaderboardCloseButton];
  elements.renameDialog.querySelectorAll = () => [elements.renameInput, elements.renameCancelButton];
  const calls = [];
  const controller = bindOverlayActions({
    documentObject,
    elements,
    actions: {
      start() { calls.push('start'); },
      menu() { calls.push('menu'); },
      rename(value) { calls.push(`rename:${value}`); },
      language() { calls.push('language'); },
      music() { calls.push('music'); },
      sfx() { calls.push('sfx'); },
    },
  });

  elements.startButton.dispatch('click');
  elements.menuButton.dispatch('click');
  elements.languageButton.dispatch('click');
  elements.musicButton.dispatch('click');
  elements.sfxButton.dispatch('click');
  elements.titleLeaderboardButton.dispatch('click');
  assert.equal(elements.leaderboardDialog.hidden, false);
  elements.leaderboardRenameButton.dispatch('click');
  assert.equal(elements.renameDialog.hidden, false);
  elements.renameInput.value = '  Lyra  ';
  let submitPrevented = false;
  elements.renameForm.dispatch('submit', { preventDefault() { submitPrevented = true; } });

  assert.equal(submitPrevented, true);
  assert.deepEqual(calls, ['start', 'menu', 'language', 'music', 'sfx', 'rename:Lyra']);
  assert.equal(elements.renameDialog.hidden, true);
  controller.destroy();
});

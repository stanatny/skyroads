'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeShipDrawRect,
  fallbackShipLayout,
  computeHudLayout,
  canvasMetrics,
  overlayForMode,
  setOverlayMode,
  trapDialogTab,
  finalizeRunOnce,
  bindOverlayActions,
  renderRankingRows,
  createCommandCenter,
  renderCommandCenter,
  focusPrimaryForMode,
} = require('../src/presentation.js');
const { createLeaderboard } = require('../src/leaderboard.js');
const {
  createMovementState,
  pressDirection,
  directionForCode,
  shouldHandleGameInput,
} = require('../src/input.js');

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
  assert.deepEqual(overlayForMode('MENU'), { title: true, gameOver: false });
  assert.deepEqual(overlayForMode('PLAYING'), { title: false, gameOver: false });
  assert.deepEqual(overlayForMode('GAMEOVER'), { title: false, gameOver: true });
  assert.throws(() => overlayForMode('PAUSED'), /Unsupported game mode/);
});

test('setOverlayMode hides both inactive semantic panels', () => {
  const titleScreen = { hidden: true };
  const gameOverScreen = { hidden: true };
  setOverlayMode({ titleScreen, gameOverScreen }, 'GAMEOVER');
  assert.equal(titleScreen.hidden, true);
  assert.equal(gameOverScreen.hidden, false);
  setOverlayMode({ titleScreen, gameOverScreen }, 'PLAYING');
  assert.equal(titleScreen.hidden, true);
  assert.equal(gameOverScreen.hidden, true);
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
  const utilityControls = new FakeEventTarget();
  const controller = bindOverlayActions({ documentObject, elements: { gameOverScreen, utilityControls } });
  controller.openDialog(dialog, opener);
  assert.equal(dialog.hidden, false);
  assert.equal(gameOverScreen.inert, true);
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

test('language and audio utilities restore gameplay focus before the next movement key', () => {
  const documentObject = makeFakeDocument();
  const canvas = documentObject.createElement('canvas');
  const languageButton = documentObject.createElement('button');
  const audioButton = documentObject.createElement('button');
  const dialog = documentObject.createElement('section');
  const dialogButton = documentObject.createElement('button');
  dialog.hidden = true;
  dialog.querySelectorAll = () => [dialogButton];
  let mode = 'PLAYING';
  const calls = [];
  const controller = bindOverlayActions({
    documentObject,
    elements: { canvas, languageButton, audioButton },
    actions: {
      getMode: () => mode,
      language() { calls.push('language'); },
      audio() { calls.push('audio'); },
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

  audioButton.focus();
  audioButton.dispatch('click');
  assert.equal(documentObject.activeElement, canvas);
  assert.equal(pressMovementKey('ArrowLeft'), 2);

  controller.openDialog(dialog, canvas);
  languageButton.dispatch('click');
  assert.equal(documentObject.activeElement, dialogButton);
  assert.equal(pressMovementKey('ArrowRight'), 3);
  assert.deepEqual(calls, ['language', 'audio', 'language']);
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
    gameOverScreen: documentObject.createElement('section'),
    leaderboardDialog: documentObject.createElement('section'),
    renameDialog: documentObject.createElement('section'),
    persistenceWarning: documentObject.createElement('p'),
    ariaStatus: documentObject.createElement('p'),
  };
  const ui = createCommandCenter({ documentObject, elements });
  assert.equal(elements.leaderboardDialog.children[0], ui.leaderboardPanel);
  assert.equal(elements.renameDialog.children[0], ui.renamePanel);
  const translator = {
    locale: 'en',
    t(id, values = {}) { return `${id}${Object.keys(values).length ? `:${Object.values(values).join('|')}` : ''}`; },
    formatNumber(value) { return String(value); },
    formatDate() { return '2026-08-02'; },
    countCharacters(value) { return Array.from(value).length; },
  };
  renderCommandCenter(ui, {
    translator,
    mode: 'GAMEOVER',
    deathReason: 'wall',
    audioMuted: false,
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
  assert.equal(elements.gameOverScreen.hidden, false);
  assert.equal(ui.profileName.textContent, 'rename.label: <Nova>');
  assert.equal(ui.deathReason.textContent, 'death.wall');
  assert.equal(ui.resultScore.textContent, 'result.score:123');
  assert.equal(ui.resultRank.textContent, 'result.notQualified:200');
  assert.equal(ui.legacyBest.hidden, false);
  assert.equal(elements.persistenceWarning.hidden, false);
  assert.equal(ui.leaderboardEmpty.hidden, false);
  assert.equal(ui.audioButton.getAttribute('data-muted'), 'false');
});

test('overlay buttons invoke game actions and rename submits the optional value', () => {
  const documentObject = makeFakeDocument();
  const button = () => documentObject.createElement('button');
  const elements = {
    startButton: button(), restartButton: button(), menuButton: button(),
    titleLeaderboardButton: button(), gameOverLeaderboardButton: button(),
    leaderboardCloseButton: button(), leaderboardRenameButton: button(),
    gameOverRenameButton: button(), renameCancelButton: button(),
    languageButton: button(), audioButton: button(),
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
      audio() { calls.push('audio'); },
    },
  });

  elements.startButton.dispatch('click');
  elements.menuButton.dispatch('click');
  elements.languageButton.dispatch('click');
  elements.audioButton.dispatch('click');
  elements.titleLeaderboardButton.dispatch('click');
  assert.equal(elements.leaderboardDialog.hidden, false);
  elements.leaderboardRenameButton.dispatch('click');
  assert.equal(elements.renameDialog.hidden, false);
  elements.renameInput.value = '  Lyra  ';
  let submitPrevented = false;
  elements.renameForm.dispatch('submit', { preventDefault() { submitPrevented = true; } });

  assert.equal(submitPrevented, true);
  assert.deepEqual(calls, ['start', 'menu', 'language', 'audio', 'rename:  Lyra  ']);
  assert.equal(elements.renameDialog.hidden, true);
  controller.destroy();
});

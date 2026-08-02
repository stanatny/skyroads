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

function makeGameUiSandbox({ musicMuted = false, sfxMuted = false, loadAdaptiveAudio = true } = {}) {
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
    'game', 'app-ui', 'utility-controls', 'title-screen', 'game-over-screen',
    'leaderboard-dialog', 'rename-dialog', 'persistence-warning', 'aria-status',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, documentObject.createElement(id === 'game' ? 'canvas' : 'div')]));
  const drawingContext = { setTransform() {} };
  elements.game.getContext = () => drawingContext;
  elements.game.setAttribute('tabindex', '-1');
  documentObject.getElementById = (id) => elements[id] || null;
  const meta = documentObject.createElement('meta');
  documentObject.querySelector = (selector) => selector === 'meta[name="description"]' ? meta : null;

  const windowObject = new FakeEventTarget();
  windowObject.innerWidth = 960;
  windowObject.innerHeight = 600;
  windowObject.devicePixelRatio = 1;

  class FakeAudioContext {
    constructor() { this.currentTime = 10; this.state = 'running'; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() {
      return {
        gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
    }
    createBiquadFilter() {
      return {
        type: '', frequency: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
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
  const localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const sandbox = {
    console,
    document: documentObject,
    window: windowObject,
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage,
    crypto: { randomUUID() { return '00000000-0000-4000-8000-000000000001'; } },
    requestAnimationFrame() {},
    setInterval() { return 1; },
    fetch: async () => ({ ok: true, arrayBuffer: async () => ({}) }),
  };
  vm.createContext(sandbox);
  const files = ['i18n.js', 'leaderboard.js', 'presentation.js', 'input.js'];
  if (loadAdaptiveAudio) files.push('audio.js');
  files.push('game.js');
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox, { filename: file });
  }
  return { sandbox, windowObject };
}

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

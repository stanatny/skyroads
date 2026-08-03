const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/game.css'), 'utf8');

test('the static shell references loadable classic CSS and JavaScript', () => {
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.match(html, /href="\.\/styles\/game\.css"/);
  assert.match(html, /src="\.\/src\/game\.js"/);
  const urls = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g),
  ].map((match) => match[1]).filter((url) => url.startsWith('./'));
  assert.ok(urls.length >= 2);
  for (const url of urls) {
    const file = path.join(root, url.slice(2));
    assert.equal(fs.existsSync(file), true, `${url} must exist`);
    if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  }
});

test('the viewport keeps native browser zoom available', () => {
  const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i);
  assert.ok(viewport, 'the page must declare a viewport');
  assert.doesNotMatch(viewport[1], /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(viewport[1], /maximum-scale\s*=\s*1(?:\.0+)?(?:\s|,|$)/i);
  assert.match(css, /#game\s*\{[^}]*touch-action:\s*pinch-zoom\s*;/s);
});

test('the browser namespace exists before feature modules attach', () => {
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
  assert.match(source, /globalThis\.Skyroads\s*\|\|/);
});

test('the adaptive audio policy loads as a classic script before the game', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  const audioIndex = scripts.indexOf('./src/audio.js');
  const gameIndex = scripts.indexOf('./src/game.js');
  assert.ok(audioIndex >= 0, 'the audio policy must be part of the static resource graph');
  assert.ok(audioIndex < gameIndex, 'audio must initialize before the game consumes it');
});

test('the world-art contract loads as a classic script after presentation and before the game', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  const presentationIndex = scripts.indexOf('./src/presentation.js');
  const worldArtIndex = scripts.indexOf('./src/world-art.js');
  const gameIndex = scripts.indexOf('./src/game.js');
  assert.ok(presentationIndex >= 0, 'presentation must be part of the static resource graph');
  assert.ok(worldArtIndex > presentationIndex, 'world-art must initialize after presentation');
  assert.ok(worldArtIndex < gameIndex, 'world-art must initialize before the game consumes it');
});

test('startup exposes a locked adaptive-audio diagnostic without creating AudioContext', () => {
  let contextConstructions = 0;
  class GuardAudioContext { constructor() { contextConstructions++; } }
  const canvas = { getContext() { return {}; }, setAttribute() {} };
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 320, innerHeight: 480, addEventListener() {}, AudioContext: GuardAudioContext },
    document: {
      documentElement: {},
      createElement(tag) { return tag === 'audio' ? { canPlayType() { return 'probably'; } } : {}; },
      getElementById(id) { return id === 'game' ? canvas : null; },
      querySelector() { return { setAttribute() {} }; },
      addEventListener() {},
    },
    requestAnimationFrame() {},
    fetch: async () => { throw new Error('must not fetch before a gesture'); },
  };
  vm.createContext(sandbox);
  for (const file of ['i18n.js', 'input.js', 'audio.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox);
  }

  const diagnostic = sandbox.Skyroads.diagnostics.snapshot();
  assert.equal(contextConstructions, 0);
  assert.equal(diagnostic.scripts.audio, true);
  assert.equal(diagnostic.audio.status, 'locked');
  assert.equal(diagnostic.audio.decoded, false);
});

function makeAudioDiagnosticSandbox({ fetchFails = false } = {}) {
  class FakeAudioContext {
    constructor() { this.currentTime = 4; this.state = 'suspended'; this.destination = {}; }
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
      return { connect() {}, disconnect() {}, start() {}, stop() {}, loop: false, buffer: null };
    }
    decodeAudioData() { return Promise.resolve({ duration: 68.571 }); }
  }
  const canvas = { getContext() { return {}; }, setAttribute() {} };
  return {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 320, innerHeight: 480, addEventListener() {}, AudioContext: FakeAudioContext },
    document: {
      documentElement: {},
      createElement(tag) { return tag === 'audio' ? { canPlayType() { return 'probably'; } } : {}; },
      getElementById(id) { return id === 'game' ? canvas : null; },
      querySelector() { return { setAttribute() {} }; },
      addEventListener() {},
    },
    requestAnimationFrame() {},
    setInterval() { return 1; },
    fetch: async () => {
      if (fetchFails) throw new Error('local file blocked');
      return { ok: true, arrayBuffer: async () => ({}) };
    },
  };
}

async function runPostGestureDiagnostics(options) {
  const sandbox = makeAudioDiagnosticSandbox(options);
  vm.createContext(sandbox);
  for (const file of ['i18n.js', 'input.js', 'audio.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox);
  }
  return vm.runInContext('startGame(); Skyroads.diagnostics.ready', sandbox);
}

test('diagnostics.ready waits for post-gesture adaptive decoding', async () => {
  const diagnostic = await runPostGestureDiagnostics();
  assert.equal(diagnostic.audio.status, 'ready');
  assert.equal(diagnostic.audio.format, 'ogg');
  assert.equal(diagnostic.audio.decoded, true);
});

test('diagnostics.ready resolves the terminal procedural fallback after audio failure', async () => {
  const diagnostic = await runPostGestureDiagnostics({ fetchFails: true });
  assert.equal(diagnostic.audio.status, 'fallback');
  assert.equal(diagnostic.audio.format, 'procedural');
  assert.equal(diagnostic.audio.decoded, false);
});

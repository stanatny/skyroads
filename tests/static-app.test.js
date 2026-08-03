const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/game.css'), 'utf8');
const englishReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const chineseReadme = fs.readFileSync(path.join(root, 'README.zh-CN.md'), 'utf8');

function markdownSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return '';
  const remainder = markdown.slice(start + marker.length);
  const nextHeading = remainder.search(/\n## /);
  return nextHeading < 0 ? remainder : remainder.slice(0, nextHeading);
}

test('the static shell references loadable classic CSS and JavaScript', () => {
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.match(html, /href="\.\/styles\/game\.css"/);
  assert.match(html, /src="\.\/src\/obstacles\.js"/);
  assert.match(html, /src="\.\/src\/game\.js"/);
  assert.ok(html.indexOf('./src/obstacles.js') < html.indexOf('./src/game.js'));
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

test('the immutable version contract is the first deferred classic script', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.equal(scripts[0], './src/version.js');
});

test('the static shell includes one hidden noninteractive polite pause status panel', () => {
  const pausePanels = [...html.matchAll(/<section\b[^>]*\bid="pause-screen"[^>]*>/g)];
  assert.equal(pausePanels.length, 1);
  const panel = pausePanels[0][0];
  assert.match(panel, /\bclass="screen-panel"/);
  assert.match(panel, /\brole="status"/);
  assert.match(panel, /\baria-live="polite"/);
  assert.match(panel, /\baria-atomic="true"/);
  assert.match(panel, /\bhidden\b/);

  const rule = css.match(/#pause-screen\s*\{([^}]*)\}/);
  assert.ok(rule, 'the pause panel needs a dedicated compact layout');
  assert.match(rule[1], /width:\s*min\(86vw,\s*440px\)\s*;/);
  assert.match(rule[1], /text-align:\s*center\s*;/);
  assert.match(rule[1], /pointer-events:\s*none\s*;/);
});

test('the title metadata and five-control layout stay compact at the 960 by 600 floor', () => {
  assert.match(css, /\.title-meta\s*\{[^}]*display:\s*flex\s*;[^}]*justify-content:\s*space-between\s*;/s);
  assert.match(css, /\.version-badge\s*\{[^}]*flex:\s*none\s*;[^}]*font:\s*500\s+0\.68rem\/1\s+"Orbitron"/s);
  assert.match(css, /\.control-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/s);
  assert.match(css, /\.control-list\s*\{[^}]*font-size:\s*0\.82rem\s*;/s);
});

test('the viewport keeps native browser zoom available', () => {
  const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i);
  assert.ok(viewport, 'the page must declare a viewport');
  assert.doesNotMatch(viewport[1], /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(viewport[1], /maximum-scale\s*=\s*1(?:\.0+)?(?:\s|,|$)/i);
  assert.match(css, /#game\s*\{[^}]*touch-action:\s*pinch-zoom\s*;/s);
});

test('the route guide uses a compact centered muted layout', () => {
  const match = css.match(/\.route-guide\s*\{([^}]*)\}/);
  assert.ok(match, 'the route-guide rule must exist');
  const rule = match[1];
  assert.match(rule, /max-width:\s*62rem\s*;/);
  assert.match(rule, /margin:\s*0\.65rem auto 0\s*;/);
  assert.match(rule, /color:\s*var\(--muted\)\s*;/);
  assert.match(rule, /font-size:\s*clamp\(0\.72rem,\s*1\.35vw,\s*0\.92rem\)\s*;/);
  assert.match(rule, /line-height:\s*1\.45\s*;/);
  assert.match(rule, /text-align:\s*center\s*;/);
});

test('English and Chinese READMEs explain equivalent obstacle routes and local play', () => {
  assert.match(englishReadme, /^## Obstacle route language$/m);
  assert.match(chineseReadme, /^## 障碍路线提示$/m);
  const englishRoutes = markdownSection(englishReadme, 'Obstacle route language');
  const chineseRoutes = markdownSection(chineseReadme, '障碍路线提示');

  assert.match(englishRoutes, /1 cyan band[^\n]*600[^\n]*one jump/i);
  assert.match(englishRoutes, /2 cyan bands[^\n]*1,250[^\n]*two jumps/i);
  assert.match(englishRoutes, /gold beacon[^\n]*2,000[^\n]*super-form third jump/i);
  assert.match(englishRoutes, /low lit corridor[^\n]*one jump[^\n]*glide[^\n]*second jump[^\n]*accepted/i);
  assert.match(englishRoutes, /medium lit corridor[^\n]*requires two jumps[^\n]*glide/i);
  assert.match(englishRoutes, /ordinary bypass lane/i);
  assert.match(englishRoutes, /seven-lane all-gap challenge[^\n]*unchanged/i);

  assert.match(chineseRoutes, /1 条青色灯带[^\n]*600[^\n]*一段跳/);
  assert.match(chineseRoutes, /2 条青色灯带[^\n]*1,250[^\n]*二段跳/);
  assert.match(chineseRoutes, /金色信标[^\n]*2,000[^\n]*超级形态[^\n]*三段跳/);
  assert.match(chineseRoutes, /发光矮墙连排[^\n]*一段跳[^\n]*滑翔[^\n]*二段跳[^\n]*替代/);
  assert.match(chineseRoutes, /发光中墙连排[^\n]*必须[^\n]*二段跳[^\n]*滑翔/);
  assert.match(chineseRoutes, /普通绕行车道/);
  assert.match(chineseRoutes, /七车道全缺口挑战[^\n]*保持不变/);

  assert.match(englishReadme, /\| Start \/ fly again \| `Space` or `Enter`/);
  assert.match(chineseReadme, /\| 开始 \/ 再来一局 \| `Space` 或 `Enter`/);
  assert.match(englishReadme, /\| Pause \/ resume \| `P`/);
  assert.match(chineseReadme, /\| 暂停 \/ 继续 \| `P`/);
  assert.match(englishReadme, /The local Top 15 is kept in this browser only/);
  assert.match(chineseReadme, /本机 Top 15 仅保存在当前浏览器中/);
  assert.match(englishReadme, /\[THIRD_PARTY_NOTICES\.md\]\(THIRD_PARTY_NOTICES\.md\)/);
  assert.match(chineseReadme, /\[THIRD_PARTY_NOTICES\.md\]\(THIRD_PARTY_NOTICES\.md\)/);

  assert.match(englishReadme, /^\[中文\]\(README\.zh-CN\.md\)$/m);
  assert.match(chineseReadme, /^\[English\]\(README\.md\)$/m);
  for (const readme of [englishReadme, chineseReadme]) {
    assert.match(readme, /npm test/);
    assert.match(readme, /npm run check/);
    assert.match(readme, /bash app\/build\.sh/);
  }
  assert.match(englishReadme, /^## Use and licensing$/m);
  assert.match(chineseReadme, /^## 使用与许可$/m);
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
  for (const file of ['version.js', 'i18n.js', 'input.js', 'obstacles.js', 'audio.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox);
  }

  const diagnostic = sandbox.Skyroads.diagnostics.snapshot();
  assert.equal(contextConstructions, 0);
  assert.equal(diagnostic.scripts.version, true);
  assert.equal(diagnostic.version.semver, '1.1.0');
  assert.equal(diagnostic.version.display, 'V1.1');
  assert.equal(diagnostic.version.tag, 'v1.1.0');
  assert.equal(Object.isFrozen(diagnostic.version), true);
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
  for (const file of ['version.js', 'i18n.js', 'input.js', 'obstacles.js', 'audio.js', 'game.js']) {
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

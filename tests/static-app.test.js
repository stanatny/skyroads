const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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

test('the browser namespace exists before feature modules attach', () => {
  const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
  assert.match(source, /globalThis\.Skyroads\s*\|\|/);
});

test('blocked storage does not prevent startup or saving a new best score', () => {
  const canvas = { getContext() { return {}; }, setAttribute() {} };
  const languageToggle = { addEventListener() {}, textContent: '' };
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 320, innerHeight: 480, addEventListener() {} },
    document: {
      documentElement: {},
      getElementById(id) { return id === 'game' ? canvas : languageToggle; },
      querySelector() { return { setAttribute() {} }; },
    },
    requestAnimationFrame() {},
  };
  Object.defineProperty(sandbox, 'localStorage', {
    get() { throw new Error('storage blocked'); },
  });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/i18n.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/input.js'), 'utf8'), sandbox);
  assert.doesNotThrow(() => vm.runInContext(
    `${fs.readFileSync(path.join(root, 'src/game.js'), 'utf8')}\nSTATE.mode = 'PLAYING'; STATE.distance = 1; STATE.best = 0; die('wall');`,
    sandbox,
  ));
});

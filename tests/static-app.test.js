const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('the static shell references loadable classic CSS and JavaScript', () => {
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

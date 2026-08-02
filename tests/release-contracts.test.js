'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('the hidden WebKit smoke keeps its storage ephemeral without changing normal persistence', () => {
  const source = fs.readFileSync(path.join(root, 'app/main.swift'), 'utf8');
  const normalDelegate = source.slice(
    source.indexOf('final class AppDelegate'),
    source.indexOf('final class SmokeDelegate'),
  );
  const smokeDelegate = source.slice(
    source.indexOf('final class SmokeDelegate'),
    source.indexOf('let app = NSApplication.shared'),
  );

  assert.match(
    smokeDelegate,
    /configuration\.websiteDataStore\s*=\s*WKWebsiteDataStore\.nonPersistent\(\)/,
    'smoke launches must not read or write the player\'s persistent WebKit storage',
  );
  assert.doesNotMatch(
    normalDelegate,
    /websiteDataStore\s*=/,
    'normal launches must retain WKWebViewConfiguration\'s default persistent store',
  );
});

test('Git whitespace suppression is limited to the four byte-identical license copies', () => {
  const licensePaths = [
    'licenses/Quaternius-Ultimate-Spaceships-CC0.txt',
    'licenses/Kenney-UI-Pack-Sci-Fi-CC0.txt',
    'licenses/Phosphor-Icons-MIT.txt',
    'licenses/Orbitron-OFL-1.1.txt',
  ];
  const ordinaryPaths = ['README.md', 'app/main.swift'];
  const output = execFileSync(
    'git',
    ['check-attr', 'whitespace', '--', ...licensePaths, ...ordinaryPaths],
    { cwd: root, encoding: 'utf8' },
  );
  const attributes = new Map(output.trim().split('\n').map((line) => {
    const match = line.match(/^(.*): whitespace: (.*)$/);
    assert.ok(match, `unexpected git check-attr output: ${line}`);
    return [match[1], match[2]];
  }));

  for (const relativePath of licensePaths) {
    assert.equal(attributes.get(relativePath), 'unset', `${relativePath} must keep its upstream whitespace verbatim`);
  }
  for (const relativePath of ordinaryPaths) {
    assert.equal(attributes.get(relativePath), 'unspecified', `${relativePath} must keep normal whitespace checks`);
  }
});

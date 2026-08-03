'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');

function plistString(source, key) {
  const match = source.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  assert.ok(match, `${key} must exist`);
  return match[1];
}

test('V1.1 metadata agrees across the static game and macOS bundle', () => {
  const version = require('../src/version.js');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const plist = fs.readFileSync(path.join(root, 'app/Info.plist'), 'utf8');

  assert.equal(packageJson.version, '1.1.0');
  assert.deepEqual(version, {
    semver: '1.1.0', display: 'V1.1', accessible: '1.1', tag: 'v1.1.0',
  });
  assert.equal(Object.isFrozen(version), true);
  assert.match(html, /<meta name="application-version" content="1\.1\.0">/);
  assert.equal(plistString(plist, 'CFBundleShortVersionString'), packageJson.version);
  assert.equal(plistString(plist, 'CFBundleVersion'), '2');
});

test('release tag validation accepts only v plus package semver', () => {
  const script = path.join(root, 'scripts/check-release-tag.js');
  const { expectedReleaseTag, validateReleaseTag } = require(script);

  assert.equal(expectedReleaseTag('1.1.0'), 'v1.1.0');
  assert.equal(validateReleaseTag('v1.1.0', '1.1.0'), true);
  assert.equal(validateReleaseTag('V1.1', '1.1.0'), false);
  assert.equal(validateReleaseTag('v1.1', '1.1.0'), false);
  assert.equal(spawnSync(process.execPath, [script, 'v1.1.0']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'V1.1']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'v1.1']).status, 0);
});

test('the hidden WebKit smoke keeps its storage ephemeral without changing normal persistence', () => {
  const source = fs.readFileSync(path.join(root, 'app/main.swift'), 'utf8');
  const normalStart = source.indexOf('final class AppDelegate');
  const smokeStart = source.indexOf('final class SmokeDelegate');
  const smokeEnd = source.indexOf('let app = NSApplication.shared');
  assert.ok(normalStart >= 0, 'normal delegate delimiter must exist');
  assert.ok(smokeStart >= 0, 'smoke delegate delimiter must exist');
  assert.ok(smokeEnd >= 0, 'app-launch delimiter must exist');
  assert.ok(normalStart < smokeStart && smokeStart < smokeEnd, 'delegate delimiters must remain ordered');
  const normalDelegate = source.slice(normalStart, smokeStart);
  const smokeDelegate = source.slice(smokeStart, smokeEnd);

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

test('Git whitespace suppression is limited to the six byte-identical license copies', () => {
  const licensePaths = [
    'licenses/Quaternius-Ultimate-Spaceships-CC0.txt',
    'licenses/Kenney-UI-Pack-Sci-Fi-CC0.txt',
    'licenses/Phosphor-Icons-MIT.txt',
    'licenses/Orbitron-OFL-1.1.txt',
    'licenses/Kenney-Space-Kit-CC0.txt',
    'licenses/Kenney-Modular-Space-Kit-CC0.txt',
  ];
  const ordinaryPaths = ['README.md', 'app/main.swift', 'src/game.js'];
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

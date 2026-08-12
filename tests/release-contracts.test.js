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

test('V1.2.0 metadata agrees across the static game and macOS bundle', () => {
  const version = require('../src/version.js');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const plist = fs.readFileSync(path.join(root, 'app/Info.plist'), 'utf8');

  assert.equal(packageJson.version, '1.2.0');
  assert.deepEqual(version, {
    semver: '1.2.0', display: 'V1.2', accessible: '1.2', tag: 'v1.2.0',
  });
  assert.equal(Object.isFrozen(version), true);
  assert.match(html, /<meta name="application-version" content="1\.2\.0">/);
  assert.equal(plistString(plist, 'CFBundleShortVersionString'), packageJson.version);
  assert.equal(plistString(plist, 'CFBundleVersion'), '4');
});

test('release tag validation accepts only v plus package semver', () => {
  const script = path.join(root, 'scripts/check-release-tag.js');
  const { expectedReleaseTag, validateReleaseTag } = require(script);

  assert.equal(expectedReleaseTag('1.2.0'), 'v1.2.0');
  assert.equal(validateReleaseTag('v1.2.0', '1.2.0'), true);
  assert.equal(validateReleaseTag('V1.2', '1.2.0'), false);
  assert.equal(validateReleaseTag('v1.2', '1.2.0'), false);
  assert.equal(spawnSync(process.execPath, [script, 'v1.2.0']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'V1.2']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'v1.2']).status, 0);
});

test('the bilingual READMEs publish the same V1.1 identity and keyboard release controls', () => {
  const english = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const chinese = fs.readFileSync(path.join(root, 'README.zh-CN.md'), 'utf8');
  const playableUrl = 'https://stanatny.github.io/skyroads/';
  const releaseUrl = 'https://github.com/stanatny/skyroads/releases/tag/v1.1.1';

  assert.equal(english.split('\n', 1)[0], '[中文](README.zh-CN.md)');
  assert.equal(chinese.split('\n', 1)[0], '[English](README.md)');
  for (const source of [english, chinese]) {
    assert.equal(source.split(playableUrl).length - 1, 1, 'each README must expose one canonical playable URL');
    assert.equal(source.split(releaseUrl).length - 1, 1, 'each README must expose one exact V1.1 release URL');
  }

  assert.match(english, /^Current version: \[v1\.1\.1\]\(https:\/\/github\.com\/stanatny\/skyroads\/releases\/tag\/v1\.1\.1\)$/m);
  assert.match(chinese, /^当前版本：\[v1\.1\.1\]\(https:\/\/github\.com\/stanatny\/skyroads\/releases\/tag\/v1\.1\.1\)$/m);
  assert.match(english, /^\| Pause \/ resume \| `P` \| Keyboard only \|$/m);
  assert.match(chinese, /^\| 暂停 \/ 继续 \| `P` \| 仅键盘 \|$/m);
  assert.match(english, /^\| Start \/ fly again \| `Space` or `Enter` \|/m);
  assert.match(chinese, /^\| 开始 \/ 再来一局 \| `Space` 或 `Enter` \|/m);
});

test('the reusable bilingual V1.1 release notes describe this release without online-data claims', () => {
  const releasePath = path.join(root, 'docs/releases/v1.1.0.md');
  assert.equal(fs.existsSync(releasePath), true, 'the copy-ready V1.1 release notes must exist');
  const release = fs.readFileSync(releasePath, 'utf8');

  assert.equal((release.match(/^# 星云巡航 V1\.1 \/ Nebula Cruise V1\.1$/gm) || []).length, 1);
  assert.equal((release.match(/^## 中文$/gm) || []).length, 1);
  assert.equal((release.match(/^## English$/gm) || []).length, 1);
  assert.ok(release.indexOf('## 中文') < release.indexOf('## English'));
  assert.match(release, /https:\/\/stanatny\.github\.io\/skyroads\//);
  assert.match(release, /Nebula-Cruise-macOS-v1\.1\.0\.zip/);
  assert.match(release, /144 BPM/);
  assert.match(release, /Orbital Defense/);
  assert.match(release, /轨道防线/);
  for (const height of ['600', '1,250', '2,000']) assert.match(release, new RegExp(height));
  for (const key of ['`Space`', '`Enter`', '`P`', 'Top 15', '.agent/skills/ship-browser-games']) {
    assert.ok(release.includes(key), `release notes must retain ${key}`);
  }
  assert.match(release, /do not sync across devices/);
  assert.match(release, /不会跨设备同步/);
  assert.doesNotMatch(release, /online leaderboard|cloud sync|云端排行榜|云同步/i);
  assert.doesNotMatch(release, /V1\.1 is now live|archive is now available|V1\.1 现已上线|安装包现已可下载/i);
});

test('the bilingual V1.1.1 release notes describe the charge HUD patch without availability claims', () => {
  const releasePath = path.join(root, 'docs/releases/v1.1.1.md');
  assert.equal(fs.existsSync(releasePath), true, 'the copy-ready V1.1.1 release notes must exist');
  const release = fs.readFileSync(releasePath, 'utf8');

  assert.equal((release.match(/^# 星云巡航 V1\.1\.1 \/ Nebula Cruise V1\.1\.1$/gm) || []).length, 1);
  assert.equal((release.match(/^## 中文$/gm) || []).length, 1);
  assert.equal((release.match(/^## English$/gm) || []).length, 1);
  assert.ok(release.indexOf('## 中文') < release.indexOf('## English'));
  assert.match(release, /https:\/\/stanatny\.github\.io\/skyroads\//);
  assert.match(release, /Nebula-Cruise-macOS-v1\.1\.1\.zip/);
  assert.match(release, /0\.5 秒/);
  assert.match(release, /0\.5-second/);
  assert.match(release, /1\.5 秒/);
  assert.match(release, /one and a half seconds/);
  assert.match(release, /BOOST、超级形态和磁铁状态之后/);
  assert.match(release, /below BOOST, super form, and magnet/);
  assert.doesNotMatch(release, /V1\.1\.1 is now live|archive is now available|V1\.1\.1 现已上线|安装包现已可下载/i);
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

test('Git whitespace suppression is limited to the seven byte-identical license copies', () => {
  const licensePaths = [
    'licenses/Quaternius-Ultimate-Spaceships-CC0.txt',
    'licenses/Kenney-UI-Pack-Sci-Fi-CC0.txt',
    'licenses/Phosphor-Icons-MIT.txt',
    'licenses/Orbitron-OFL-1.1.txt',
    'licenses/Kenney-Space-Kit-CC0.txt',
    'licenses/Kenney-Modular-Space-Kit-CC0.txt',
    'licenses/OpenGameArt-CC0-1.0.txt',
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

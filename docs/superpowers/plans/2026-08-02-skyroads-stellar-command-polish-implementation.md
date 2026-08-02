# Skyroads Stellar Command Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved “星云巡航 / Nebula Cruise” polish release with responsive held movement, continuous collision, a reliable local Top 15, Chinese/English UI, licensed command-center visuals, and an original adaptive soundtrack.

**Architecture:** Keep the existing Canvas game and static hosting model, but move its inline CSS and JavaScript into classic deferred files that also work under the macOS `file://` WKWebView. Pure logic lives in small browser/CommonJS modules and is driven test-first with Node’s built-in test runner; the Canvas loop consumes those modules through one `globalThis.Skyroads` namespace. HTML overlays own menus, language, ranking, and rename interactions while Canvas retains the world, player, effects, and compact HUD.

**Tech Stack:** HTML5 Canvas 2D, plain JavaScript, CSS, Node 22 `node:test`, Web Audio, Swift/Cocoa/WebKit, SceneKit asset rendering, macOS `afconvert`, GitHub Pages, GitHub Actions.

## Global Constraints

- Work only on `feat/stellar-command-polish` in `/Users/stan/Developer/GitHub/skyroads/.worktrees/stellar-command-polish`; target PR branch is `main`.
- No framework, runtime CDN, backend, database, account, or cross-device leaderboard.
- Runtime must work both from repository-relative HTTP URLs and the macOS app’s bundled local-file URL.
- Use classic deferred scripts; do not switch to ES modules.
- Keep `CFBundleIdentifier = com.skyroads.jumpcar` and `CFBundleExecutable = SkyRoads` while renaming visible product branding.
- Support only `zh-CN` and `en`: a valid saved preference wins; any `zh`/`zh-*` system locale selects Chinese; every other locale selects English.
- Movement constants are 145 ms for the first lane, 140 ms hold delay, and 85 ms for each continued lane; release finishes the active segment; opposite input reverses immediately without position jumps.
- Seven lanes remain; existing swipe-to-move, tap-to-jump, J/K/M controls, enemies, weapons, pickups, course generation, and macOS universal build remain functional.
- Leaderboard is local Top 15 only. Score is `floor(distanceMeters) + floor(enemyKills) * 20`; sort by score descending, distance descending, elapsed ascending, createdAt ascending, then ID.
- Player names are remembered, optional to change, limited to 16 Unicode characters, and initially chosen from the approved safe space-name list.
- Ship target width is 7–9% at 1280 × 800; logical collision width stays independent from sprite/glow/bank transforms.
- Music is an original 112 BPM, 32-bar, 68.571-second loop with synchronized atmosphere/drive/overdrive stems in OGG and MP3.
- Third-party assets are copied into the repository, documented, and never hotlinked. Quaternius and Kenney assets are CC0; Phosphor is MIT; Orbitron is OFL 1.1.
- Use strict red-green-refactor for every new behavior. Observe the expected failing test before adding its implementation.
- Keep commits small and green. Do not combine binary visual assets, audio assets, and macOS packaging in one commit.

---

## File Map

```text
index.html                         semantic shell, Canvas, overlay markup, ordered scripts
styles/game.css                    responsive command-center visuals and overlay states
src/i18n.js                        locale resolution, catalogs, translation and Intl helpers
src/input.js                       lane controller and continuous lateral hitbox helpers
src/leaderboard.js                 scoring, schema, Top 15, profile and resilient storage
src/presentation.js                overlay state, asset preload, ship sizing, diagnostics
src/audio.js                       adaptive stems, format fallback, mute persistence
src/game.js                        existing game loop/rendering plus module integration
assets/ship/                       two rendered player-ship frames
assets/ui/                         three selected/recolored Kenney elements
assets/icons/                      six selected Phosphor SVG files
assets/fonts/                      self-hosted Orbitron display font
assets/audio/                      six committed adaptive-music stem files
assets/audio/source/               deterministic score data for the original track
tools/render-ship.swift            repeatable SceneKit render CLI for downloaded CC0 model
tools/generate-music.js            deterministic PCM stem renderer
tests/static-app.test.js           static resource graph and script syntax
tests/i18n.test.js                 locale and catalog behavior
tests/input.test.js                movement and continuous hitboxes
tests/leaderboard.test.js          ranking and persistence behavior
tests/presentation.test.js         layout/overlay/asset-manifest behavior
tests/audio.test.js                format, duration, intensity and mute behavior
tests/assets.test.js               committed binary signatures and dimensions
tests/app-resources-smoke.sh       bundle resource inventory
tests/app-wkwebview-smoke.sh       real local-file WebKit initialization/decode smoke
app/main.swift                     normal app mode and hidden `--smoke-test` mode
app/build.sh                       universal app build and complete resource copying
app/Info.plist                     visible Nebula Cruise app metadata
.github/workflows/release-macos.yml tests, bundle verification, renamed release artifact
README.md                          default English documentation
README.zh-CN.md                    equivalent Chinese documentation
THIRD_PARTY_NOTICES.md             asset sources, licenses and modifications
licenses/                          copied upstream license texts
docs/assets/ship-render.md         selected model hash and deterministic render settings
```

---

### Task 1: Establish the Static App Boundary and Zero-Dependency Test Runner

**Files:**
- Create: `package.json`
- Create: `tests/static-app.test.js`
- Create: `src/game.js`
- Create: `styles/game.css`
- Modify: `index.html:7-16`
- Modify: `index.html:17-3497`
- Modify: `app/build.sh:28-32`
- Modify: `.github/workflows/release-macos.yml:20-31`

**Interfaces:**
- Consumes: current inline `index.html` behavior and existing macOS smoke scripts.
- Produces: `npm test`, `styles/game.css`, `src/game.js`, `globalThis.Skyroads`, and a static resource graph usable over HTTP and `file://`.

- [x] **Step 1: Write the failing static-resource test**

Create `tests/static-app.test.js` with a real resource-graph check. The production change that makes it pass is externalizing the live app while keeping every referenced resource loadable.

```js
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
```

- [x] **Step 2: Run the test and verify RED**

Run: `node --test tests/static-app.test.js`

Expected: FAIL because `styles/game.css` and `src/game.js` do not yet exist and `index.html` contains inline CSS/script.

- [x] **Step 3: Add the test command and externalize without changing behavior**

Create the exact `package.json`:

```json
{
  "name": "nebula-cruise",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.js",
    "check": "for file in src/*.js; do node --check \"$file\"; done"
  }
}
```

Move the existing `<style>` contents byte-for-byte into `styles/game.css`, and move the existing inline script contents byte-for-byte into `src/game.js`. Prepend this line after `'use strict';`:

```js
globalThis.Skyroads = globalThis.Skyroads || {};
```

Replace the shell references with classic deferred resources:

```html
<link rel="stylesheet" href="./styles/game.css">
...
<canvas id="game" aria-label="Nebula Cruise game canvas"></canvas>
<script defer src="./src/game.js"></script>
```

Update `app/build.sh` resource copying now so the refactor remains runnable in the wrapper:

```bash
cp "$ROOT/index.html" "$BUNDLE_RES/index.html"
cp -R "$ROOT/src" "$BUNDLE_RES/src"
cp -R "$ROOT/styles" "$BUNDLE_RES/styles"
```

Replace the workflow’s inline-script extraction with:

```yaml
- name: Validate web game
  run: |
    npm test
    npm run check
```

- [x] **Step 4: Verify GREEN and preserve the current app**

Run:

```bash
npm test
npm run check
bash tests/app-universal-smoke.sh
bash tests/app-signature-smoke.sh
```

Expected: all tests pass; the universal app still builds and signs.

- [x] **Step 5: Commit**

```bash
git add package.json index.html src/game.js styles/game.css tests/static-app.test.js app/build.sh .github/workflows/release-macos.yml
git commit -m "refactor: establish testable static app boundary"
```

---

### Task 2: Add the Bilingual Localization Core

**Files:**
- Create: `src/i18n.js`
- Create: `tests/i18n.test.js`
- Modify: `index.html`
- Modify: `src/game.js`

**Interfaces:**
- Consumes: `globalThis.Skyroads` from Task 1 and optional browser `localStorage`/`navigator`.
- Produces: `Skyroads.i18n.resolveLocale`, `readLocalePreference`, `writeLocalePreference`, and `createTranslator`.

- [x] **Step 1: Write focused failing locale tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MESSAGES, resolveLocale, readLocalePreference,
  writeLocalePreference, createTranslator,
} = require('../src/i18n.js');

test('saved preference wins over system locale', () => {
  assert.equal(resolveLocale({ savedLocale: 'en', languages: ['zh-CN'] }), 'en');
});

test('any Chinese navigator language resolves to zh-CN', () => {
  assert.equal(resolveLocale({ languages: ['fr-FR', 'zh-Hant-TW'] }), 'zh-CN');
});

test('non-Chinese and invalid saved values resolve to English', () => {
  assert.equal(resolveLocale({ savedLocale: 'fr', languages: ['ja-JP'] }), 'en');
});

test('translation interpolates and counts Unicode characters', () => {
  const translator = createTranslator('zh-CN');
  assert.equal(translator.t('rename.characterCount', { count: 3, max: 16 }), '3 / 16');
  assert.equal(translator.countCharacters('Nova🚀'), 5);
});

test('both production catalogs have the same non-empty IDs', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES['zh-CN']).sort());
  for (const catalog of Object.values(MESSAGES)) {
    for (const value of Object.values(catalog)) assert.equal(typeof value === 'string' && value.length > 0, true);
  }
});

test('storage helpers survive browser security errors', () => {
  const storage = { getItem() { throw new DOMException('blocked', 'SecurityError'); }, setItem() { throw new DOMException('blocked', 'SecurityError'); } };
  assert.equal(readLocalePreference(storage), null);
  assert.equal(writeLocalePreference(storage, 'en'), false);
});
```

- [x] **Step 2: Run and verify RED**

Run: `node --test tests/i18n.test.js`

Expected: FAIL with `Cannot find module '../src/i18n.js'`.

- [x] **Step 3: Implement the exact public API and catalogs**

Use a browser/CommonJS wrapper and export:

```js
const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);
const LOCALE_STORAGE_KEY = 'skyroads_locale';

function resolveLocale({ savedLocale = null, languages = [], language = '' } = {}) {}
function readLocalePreference(storage, key = LOCALE_STORAGE_KEY) {}
function writeLocalePreference(storage, locale, key = LOCALE_STORAGE_KEY) {}
function createTranslator(initialLocale, catalogs = MESSAGES) {}
```

The catalogs must contain these exact IDs and meanings:

| ID | English | 中文 |
|---|---|---|
| `app.documentTitle` | Nebula Cruise | 星云巡航 |
| `meta.description` | A fast sci-fi lane runner through an endless nebula. | 驾驶飞船穿越无尽星云的高速科幻跑酷游戏。 |
| `canvas.label` | Nebula Cruise game canvas | 星云巡航游戏画面 |
| `language.switchToChinese` | 中文 | 中文 |
| `language.switchToEnglish` | EN | EN |
| `menu.title` | NEBULA CRUISE | 星云巡航 |
| `menu.subtitle` | INTERSTELLAR COMMAND | 星际指挥中心 |
| `menu.start` | Start Mission | 开始任务 |
| `menu.leaderboard` | Local Top 15 | 本机 Top 15 |
| `controls.move` | Move: A / D or ← / → | 移动：A / D 或 ← / → |
| `controls.jump` | Jump: K / Space / W / ↑ | 跳跃：K / 空格 / W / ↑ |
| `controls.shoot` | Fire: tap or hold J | 射击：点按或按住 J |
| `controls.touch` | Swipe to move · tap to jump | 左右滑动变道 · 点按跳跃 |
| `hud.fuel` | FUEL | 燃料 |
| `hud.jump` | JUMPS | 跳跃 |
| `hud.distance` | DISTANCE | 距离 |
| `hud.score` | SCORE | 得分 |
| `hud.speed` | SPEED | 速度 |
| `hud.elapsed` | TIME | 时间 |
| `hud.localBest` | LOCAL BEST | 本机最佳 |
| `hud.musicOn` | AUDIO ON | 声音开启 |
| `hud.musicOff` | AUDIO OFF | 声音关闭 |
| `hud.shootHint` | J: FIRE / HOLD TO CHARGE | J：射击 / 按住蓄力 |
| `status.chargeIdle` | MISSILE CHARGE | 导弹蓄力 |
| `status.charging` | CHARGING {percent}% | 蓄力中 {percent}% |
| `status.chargeReady` | MISSILE READY | 导弹就绪 |
| `status.boost` | BOOST {seconds}s | 超级加速 {seconds}秒 |
| `status.boostWarning` | BOOST ENDING {seconds}s | 加速即将结束 {seconds}秒 |
| `status.super` | SUPER FORM {seconds}s | 超级形态 {seconds}秒 |
| `status.superWarning` | SUPER ENDING {seconds}s | 形态即将结束 {seconds}秒 |
| `status.magnet` | MAGNET {seconds}s | 磁铁 {seconds}秒 |
| `effect.superForm` | ★ SUPER FORM ★ | ★ 超级形态 ★ |
| `gameover.title` | MISSION ENDED | 任务结束 |
| `death.wall` | Collision detected | 撞上障碍物 |
| `death.gap` | Lost to the void | 坠入虚空 |
| `death.fuel` | Fuel depleted | 燃料耗尽 |
| `death.enemy` | Enemy collision | 撞上敌机 |
| `death.default` | Mission ended | 任务结束 |
| `result.score` | Score {value} | 得分 {value} |
| `result.distance` | Distance {value} m | 距离 {value} 米 |
| `result.elapsed` | Time {value} | 用时 {value} |
| `result.qualified` | Entered Local Top 15 at #{rank} | 进入本机 Top 15，第 {rank} 名 |
| `result.notQualified` | Top 15 cutoff: {value} | Top 15 门槛：{value} |
| `result.newLocalBest` | New local best! | 本机新纪录！ |
| `result.restart` | Fly Again | 再来一局 |
| `result.menu` | Command Center | 返回指挥中心 |
| `leaderboard.title` | LOCAL TOP 15 | 本机 TOP 15 |
| `leaderboard.rank` | Rank | 名次 |
| `leaderboard.name` | Pilot | 玩家 |
| `leaderboard.score` | Score | 得分 |
| `leaderboard.distance` | Distance | 距离 |
| `leaderboard.time` | Time | 用时 |
| `leaderboard.date` | Date | 日期 |
| `leaderboard.empty` | Complete a mission to set the first record. | 完成一局后即可留下第一条记录。 |
| `leaderboard.close` | Close | 关闭 |
| `leaderboard.rename` | Rename Pilot | 修改名字 |
| `leaderboard.newest` | NEW | 最新 |
| `leaderboard.cutoff` | Cutoff {value} | 门槛 {value} |
| `leaderboard.persistenceWarning` | Records are available for this session but could not be saved. | 记录仅在本次会话可用，暂时无法保存。 |
| `leaderboard.legacyBest` | Previous-version best: {value} | 旧版本最佳：{value} |
| `rename.title` | Pilot Name | 玩家名字 |
| `rename.label` | Name | 名字 |
| `rename.placeholder` | Enter a name | 输入名字 |
| `rename.characterCount` | {count} / {max} | {count} / {max} |
| `rename.save` | Save | 保存 |
| `rename.cancel` | Cancel | 取消 |
| `rename.emptyKeepsName` | Leave empty to keep the current name. | 留空将保留当前名字。 |

`t()` falls back to English, then `[message.id]`; `formatNumber` and `formatDate` use the active locale; character counting uses `Array.from`.

- [x] **Step 4: Verify GREEN**

Run: `npm test`

Expected: all localization and static-app tests pass.

- [x] **Step 5: Load the module and apply locale metadata**

Load `./src/i18n.js` before `./src/game.js`. In `init()`, resolve the saved/system locale, create one translator, and update `html.lang`, `<title>`, meta description, Canvas label, and the visible `中文 / EN` button through one `applyLocale(locale)` function. Do not yet translate every Canvas screen; Task 6 migrates those screens to overlays.

- [x] **Step 6: Run tests and commit**

```bash
npm test
npm run check
git add index.html src/i18n.js src/game.js tests/i18n.test.js
git commit -m "feat: add bilingual localization core"
```

---

### Task 3: Build the Responsive Lane Controller and Hitbox Primitives

**Files:**
- Create: `src/input.js`
- Create: `tests/input.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `globalThis.Skyroads`.
- Produces: `createMovementState`, `resetMovement`, `pressDirection`, `releaseDirection`, `requestDiscreteLaneChange`, `advanceMovement`, `clearHeldDirections`, `movementSnapshot`, `directionForCode`, and continuous collision helpers.

- [x] **Step 1: Write the failing movement timing tests**

Use these exact tuning and hitbox literals:

```js
const MOVEMENT_TUNING = Object.freeze({
  laneCount: 7,
  tapDurationMs: 145,
  holdDelayMs: 140,
  repeatDurationMs: 85,
});
const HITBOX = Object.freeze({
  playerHalfWidth: 0.14,
  wallHalfWidth: 0.42,
  pickupRadius: 0.38,
  droneHalfWidth: 0.22,
  turretHalfWidth: 0.26,
  projectileHalfWidth: 0.08,
});
```

The first tests must be real state transitions with hand-derived expectations:

```js
test('tap completes exactly one lane in 145ms', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  releaseDirection(state, 1);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3.5);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 4);
  advanceMovement(state, 500);
  assert.equal(state.lanePosition, 4);
});

test('hold carries leftover time into an 85ms repeat segment', () => {
  const state = createMovementState(1);
  pressDirection(state, 1);
  advanceMovement(state, 187.5);
  assert.equal(state.lanePosition, 2.5);
});

test('opposite press reverses without a position jump', () => {
  const state = createMovementState(3);
  pressDirection(state, 1);
  advanceMovement(state, 72.5);
  const before = state.lanePosition;
  const result = pressDirection(state, -1);
  assert.equal(result.reversed, true);
  assert.equal(state.lanePosition, before);
  advanceMovement(state, 72.5);
  assert.equal(state.lanePosition, 3);
});
```

Also add separate tests with these literal outcomes:

- `first segment completes at 145ms, not 144ms`: after 144 ms position is below target 4; after one more millisecond it is exactly 4.
- `hold shorter than 140ms does not repeat`: release at 139 ms, finish the first segment, then add 500 ms and remain at lane 4.
- `holding through the delay starts repeat at the first boundary`: remain held through 145 ms and assert the next active target is lane 5 with an 85 ms duration.
- `same timeline is frame-rate independent`: 187.5 ms as one step and as 30/60/120 Hz slices all finish at 2.5 within `1e-9`.
- `release during repeat finishes the current lane and discards future lanes`: lane 3, hold 160 ms, release, add 70 ms => lane 5; add 500 ms => lane 5.
- `last pressed wins and releasing it restores the still-held direction`: `activeDirection` becomes `-1` without position discontinuity.
- `edge hold starts no segment`: lane 0 + left + 500 ms => lane 0 and zero started segments.
- `clear held directions prevents sticky movement`: active segment finishes, no next segment begins.
- `touch requests one lane and never repeat`: +145 ms reaches adjacent lane, +500 ms stays; a swipe during an active segment returns `started:false`.
- `directionForCode maps only ArrowLeft/KeyA/ArrowRight/KeyD` to `-1/-1/1/1`.

- [x] **Step 2: Run timing tests and verify RED**

Run: `node --test tests/input.test.js`

Expected: FAIL because `src/input.js` is absent.

- [x] **Step 3: Implement the minimal frame-independent controller**

The movement state must include:

```js
{
  lanePosition, previousLanePosition,
  segmentStart, segmentSource, segmentTarget,
  segmentElapsedMs, segmentDurationMs, segmentLaneDurationMs,
  heldLeft, heldRight, heldSinceLeftMs, heldSinceRightMs,
  activeDirection, pressedAt, repeatEligibleAt, clockMs,
  segmentActive
}
```

Implement `advanceMovement(state, deltaMs)` with a `while (remainingMs > 0)` loop. It must consume segment boundaries, carry leftover time into subsequent held segments, use `smoothstep01(t) = t*t*(3 - 2*t)`, and snap exactly to integer targets on completion. On opposite press, start a return from the current float position to the old `segmentSource` with duration `abs(current - oldSource) * oldSegmentLaneDurationMs`; never mutate position during the press itself.

Every public mutator returns an observable result:

```js
pressDirection(state, dir) // => { started, reversed }
releaseDirection(state, dir) // => { reversed }
requestDiscreteLaneChange(state, dir) // => { started }
advanceMovement(state, deltaMs) // => { previousLanePosition, lanePosition, segmentsStarted }
```

- [x] **Step 4: Verify timing GREEN**

Run: `node --test tests/input.test.js`

Expected: all timing/input tests pass.

- [x] **Step 5: Write failing continuous-hitbox tests**

```js
test('wall sweep catches crossing overlap but permits visible clearance', () => {
  assert.equal(sweptIntervalsOverlap(3, 3.5, 0.14, 4, 0.42), true);
  assert.equal(sweptIntervalsOverlap(3, 3.43, 0.14, 4, 0.42), false);
});

test('pickup sweep uses the 0.38-lane radius', () => {
  assert.ok(sweptPointDistance(3, 3.62, 4) <= 0.38 + Number.EPSILON);
  assert.ok(sweptPointDistance(3, 3.61, 4) > 0.38);
});

test('gap support changes at the lane midpoint', () => {
  assert.equal(laneTileContaining(3.49), 3);
  assert.equal(laneTileContaining(3.50), 4);
});

test('projectile at a floating position returns an integer wall lane', () => {
  const lanes = ['road', 'road', 'road', 'road', 'wall-high', 'road', 'road'];
  assert.equal(findIntersectedWallLane(lanes, 3.50), 4);
});
```

Add enemy-width assertions at exact boundaries: player `0.14` + drone `0.22` hits at distance `0.36`; player + turret `0.26` hits at `0.40`.

- [x] **Step 6: Run hitbox tests and verify RED**

Expected: FAIL on missing hitbox helpers.

- [x] **Step 7: Implement hitbox helpers and verify GREEN**

Export:

```js
intervalsOverlap(centerA, halfA, centerB, halfB)
sweptPointDistance(from, to, point)
sweptIntervalsOverlap(from, to, movingHalf, fixedCenter, fixedHalf)
laneTileContaining(lanePosition, laneCount = 7)
hitboxHalfWidthForEnemy(type)
findIntersectedWallLane(lanes, projectileLane, projectileHalf = 0.08, wallHalf = 0.42)
```

Run: `npm test`

Expected: all tests pass.

- [x] **Step 8: Load the module and commit**

Load `./src/input.js` after i18n and before game.

```bash
git add index.html src/input.js tests/input.test.js
git commit -m "feat: add responsive lane movement core"
```

---

### Task 4: Integrate Held Movement and Continuous Collision into Gameplay

**Files:**
- Modify: `src/game.js` input block, player state, `playerWorldX`, `renderPlayer`, `updatePhysics`, `advanceShots`, `checkCollisions`, reset/death flows
- Modify: `tests/input.test.js`

**Interfaces:**
- Consumes: all Task 3 input APIs and the current seven-lane game state.
- Produces: one authoritative `STATE.movement` snapshot shared by rendering, physics, pickups, magnet, enemies, gaps, and projectiles.

- [x] **Step 1: Add a failing gameplay-input-boundary test**

Add this new public adapter predicate to the desired API before it exists:

```js
test('gameplay input is disabled while UI owns keyboard focus', () => {
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:false, modalOpen:false }), true);
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:true, modalOpen:false }), false);
  assert.equal(shouldHandleGameInput({ mode:'PLAYING', targetInsideAppUi:false, modalOpen:true }), false);
  assert.equal(shouldHandleGameInput({ mode:'MENU', targetInsideAppUi:false, modalOpen:false }), false);
});
```

The production change that makes it pass is `shouldHandleGameInput(descriptor)`, used by the DOM adapter before it invokes movement, jump, fire, or restart shortcuts. This catches the bug where typing a name starts/restarts the game.

Run: `node --test tests/input.test.js` and observe the new assertion fail before changing `src/game.js`.

- [x] **Step 2: Replace direction input with the controller**

Make these exact changes:

- Replace `STATE.lane/laneFrom/laneTo/laneT` truth with `STATE.movement = createMovementState(midLane())`.
- Use `KeyboardEvent.code`; ignore direction `keydown` when that direction is already held.
- Play `sfxLane()` only when `{started:true}` or `{reversed:true}`.
- On keyup call `releaseDirection`; on `blur`, hidden `visibilitychange`, game over, and overlay opening call `clearHeldDirections`.
- Keep the existing `KEYS` map for jump/charge controls.
- Route each existing horizontal swipe through `requestDiscreteLaneChange`; keep tap-to-jump thresholds unchanged.
- Ignore gameplay shortcuts whenever the event target is inside `#app-ui`.

- [x] **Step 3: Drive rendering and physics from continuous position**

- `playerWorldX()` becomes `laneCenterX(STATE.movement.lanePosition)`.
- Projectiles store the float `lanePosition` at fire time.
- At the start of every existing longitudinal physics substep, call `advanceMovement(STATE.movement, sdt * 1000)` and retain both returned positions.
- Derive player bank from segment direction/eased progress; do not feed it back into collision.
- Reset with `resetMovement(STATE.movement, midLane())`.

- [x] **Step 4: Convert each rounded-lane consumer explicitly**

Apply these exact contracts:

- Walls: `sweptIntervalsOverlap(previous, current, 0.14, lane, 0.42)`, then existing height/BOOST rules.
- Enemies: same swept check with `enemyLane(e)` and per-type `0.22/0.26`, then existing height/BOOST rules.
- Pickups: `sweptPointDistance(previous, current, lane) <= 0.38`, apply one pickup side effect and stop scanning that substep.
- Gap: `laneTileContaining(current)` only; preserve the existing safe-jump-height rule.
- Magnet: `Math.abs(fuelLane - current) <= CONFIG.MAGNET_RANGE`; preserve actual `±3` range.
- Projectile/enemy: compare projectile `0.08` plus enemy half-width.
- Projectile/wall: call `findIntersectedWallLane`, then use the returned integer for every array mutation and burst location.
- Remove `currentLaneIndex()` and every general `Math.round(lanePosition)` collision path.

- [x] **Step 5: Verify automated and manual GREEN**

Run:

```bash
npm test
npm run check
bash tests/app-universal-smoke.sh
```

Manual browser checks:

- tap completes one lane;
- hold crosses several lanes at the approved cadence;
- release finishes only the active lane;
- opposite press reverses immediately without a jump;
- holding at either edge is silent;
- losing focus never leaves movement stuck;
- swipe still moves one lane and tap still jumps;
- J/K/M behavior is unchanged;
- visible wall/enemy overlap kills, visible clearance survives.

- [x] **Step 6: Commit**

```bash
git add src/game.js tests/input.test.js
git commit -m "feat: integrate responsive continuous movement"
```

---

### Task 5: Implement the Reliable Local Top 15 Core

**Files:**
- Create: `src/leaderboard.js`
- Create: `tests/leaderboard.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: browser-like storage, injected clock/random/crypto, and `globalThis.Skyroads`.
- Produces: pure scoring/validation functions and `createLeaderboard(...).initialize/finalizeRun/renamePlayer/acknowledgeLegacyBest`.

- [x] **Step 1: Write failing score, name and ordering tests**

```js
test('score keeps distance separate and floors only source counters', () => {
  assert.equal(calculateScore({ distanceMeters: 8042.9, enemyKills: 3 }), 8102);
});

test('name normalization removes controls and limits Unicode characters', () => {
  assert.equal(normalizeName('  Nova\u0000🚀ExplorerBeyond  ', 'Vega'), 'Nova🚀ExplorerBey');
  assert.equal(normalizeName('   ', 'Vega'), 'Vega');
});

test('sorting applies all deterministic tie breakers', () => {
  const entries = [
    { id:'b', score:10, distanceMeters:9, elapsedMs:100, createdAt:'2026-01-02T00:00:00.000Z' },
    { id:'a', score:10, distanceMeters:10, elapsedMs:110, createdAt:'2026-01-02T00:00:00.000Z' },
    { id:'c', score:10, distanceMeters:10, elapsedMs:90, createdAt:'2026-01-03T00:00:00.000Z' },
  ];
  assert.deepEqual(sortEntries(entries).map((entry) => entry.id), ['c', 'a', 'b']);
});
```

Use the exact defaults:

```js
const DEFAULT_NAMES = ['Nova','Orion','Vega','Luna','Atlas','Echo','Comet','Cosmo','Lyra','Zenith'];
const STORAGE_KEYS = {
  active: 'skyroads_leaderboard_v1',
  backup: 'skyroads_leaderboard_v1_backup',
  legacy: 'skyroads_best',
};
```

- [x] **Step 2: Verify RED, then implement pure functions**

Run: `node --test tests/leaderboard.test.js`

Expected: FAIL because the module does not exist.

Implement and export:

```js
calculateScore({ distanceMeters, enemyKills, enemyKillBonus = 20 })
normalizeName(value, fallbackName)
generateDefaultName({ random = Math.random } = {})
compareEntries(a, b)
sortEntries(entries)
validateEntry(value)
validateDocument(value)
renameProfile(document, rawName)
```

Validation requires version `1`, finite nonnegative numerics, valid profile IDs/names, valid ISO dates, sanitized entries, and a hard cap of 15.

- [x] **Step 3: Verify pure GREEN**

Run: `node --test tests/leaderboard.test.js`

Expected: the score/name/sort/validation tests pass.

- [x] **Step 4: Add failing real-storage-sequence tests**

Build a `FakeStorage` in the test file that stores real strings and can throw or corrupt the next read. Assert these behaviors separately:

- valid active loads normally;
- corrupt active loads valid backup and promotes it;
- two invalid documents create a fresh safe profile;
- valid `skyroads_best` becomes `legacyBest`, never a ranking entry;
- old key is removed only after active write/read validation;
- fewer than 15 entries always qualify;
- rank 15 boundary and nonqualifying cutoff are correct;
- same run ID is idempotent even when it did not qualify;
- rename updates only entries with the current `playerId`;
- corrupt readback restores backup and retains the next document in memory;
- `SecurityError`/quota failure switches to memory and later runs remain available in session.

The mutation each test catches must be named in its test title; do not assert on FakeStorage call counts unless order is part of the write-recovery contract.

- [x] **Step 5: Verify RED, then implement the stateful facade**

```js
createLeaderboard({
  storage,
  cryptoObject = globalThis.crypto,
  now = () => new Date(),
  random = Math.random,
  keys = STORAGE_KEYS,
})
```

Return methods and structures exactly as specified in the design:

```js
initialize() // => Snapshot
getSnapshot() // => Snapshot
createRunId() // => string
finalizeRun({ id, distanceMeters, enemyKills, elapsedMs }) // => RunResult
renamePlayer(rawName) // => MutationResult
acknowledgeLegacyBest() // => MutationResult
```

Writes use active/backup/verify/restore order. Cache finalized run IDs inside the facade. Use `crypto.randomUUID()` with a timestamp/random fallback only for local identifiers.

- [x] **Step 6: Verify GREEN and load the module**

Run: `npm test`

Load `./src/leaderboard.js` after i18n and before game.

- [x] **Step 7: Commit**

```bash
git add index.html src/leaderboard.js tests/leaderboard.test.js
git commit -m "feat: add resilient local leaderboard core"
```

---

### Task 6: Build Semantic Command-Center Overlays and Integrate Ranking/i18n

**Files:**
- Create: `src/presentation.js`
- Create: `tests/presentation.test.js`
- Modify: `index.html`
- Modify: `styles/game.css`
- Modify: `src/game.js`

**Interfaces:**
- Consumes: translator, leaderboard facade, game modes, Canvas, and module namespace.
- Produces: semantic overlays, `computeShipDrawRect`, `overlayForMode`, `setOverlayMode`, `bindOverlayActions`, and `Skyroads.diagnostics`.

- [x] **Step 1: Write failing pure presentation tests**

```js
test('ship stays within seven to nine percent at target viewports', () => {
  for (const [width, height] of [[960,600],[1280,800],[1440,900],[1920,1080]]) {
    const rect = computeShipDrawRect(width, height, 4 / 3);
    const ratio = rect.width / width;
    assert.ok(ratio >= 0.07 && ratio <= 0.09, `${width}x${height}: ${ratio}`);
  }
});

test('only the mode overlay selected by game state is visible', () => {
  assert.deepEqual(overlayForMode('MENU'), { title:true, gameOver:false });
  assert.deepEqual(overlayForMode('PLAYING'), { title:false, gameOver:false });
  assert.deepEqual(overlayForMode('GAMEOVER'), { title:false, gameOver:true });
});

test('device pixel ratio is capped at two without changing logical size', () => {
  assert.deepEqual(canvasMetrics(1280, 800, 3), { cssWidth:1280, cssHeight:800, pixelWidth:2560, pixelHeight:1600, dpr:2 });
});
```

- [x] **Step 2: Verify RED, implement pure layout/state helpers, verify GREEN**

Run: `node --test tests/presentation.test.js`.

Implement the exact ship width rule as `Math.min(viewportWidth * 0.08, viewportHeight * 0.14)`, while satisfying the four literal assertions. `canvasMetrics` caps DPR at 2. `overlayForMode` is exhaustive for MENU/PLAYING/GAMEOVER.

- [x] **Step 3: Add fixed semantic overlay markup**

Add these nodes after `#game`:

```html
<div id="app-ui">
  <div id="command-frame" aria-hidden="true"></div>
  <nav id="utility-controls" aria-label="Game settings"></nav>
  <section id="title-screen" class="screen-panel"></section>
  <section id="game-over-screen" class="screen-panel" hidden></section>
  <section id="leaderboard-dialog" role="dialog" aria-modal="true" hidden></section>
  <section id="rename-dialog" role="dialog" aria-modal="true" hidden></section>
  <p id="persistence-warning" role="status" hidden></p>
  <p id="aria-status" class="sr-only" aria-live="polite"></p>
</div>
```

Do not rely on native `<dialog>`. Build elements once, update text with `textContent`, create ranking cells with DOM methods, restore focus on close, trap Tab inside an open dialog, close on Escape, and make hidden overlays `pointer-events:none`.

- [x] **Step 4: Integrate localization and leaderboard lifecycle**

In `init()`:

1. Initialize translator and call `applyLocale`.
2. Initialize leaderboard and show its persisted player name/warning/legacy reference.
3. Set `STATE.distanceMeters = 0`, `enemyKills = 0`, `score = 0`, `runId`, `finalResult = null`.

During play, accumulate distance only. In `killEnemy`, increment `enemyKills` only. In the first `die()` transition, compute/finalize exactly once and set `finalResult`; repeated render/input calls must not insert again.

The game-over overlay shows score, true distance, elapsed time, qualifying rank/cutoff, restart/menu, optional rename, and leaderboard. Rename changes the remembered profile and all local-player history without prompting every run.

Replace every remaining player-facing Canvas literal with the Task 2 message ID and use translator number/time formatting. Canvas menu/game-over functions become background dimming only; HTML owns actionable content.

- [x] **Step 5: Implement command-center CSS fallback**

Use these visual tokens in `:root`:

```css
--space-0: #020611;
--space-1: #071426;
--panel: rgba(5, 21, 39, 0.82);
--cyan: #5de7ff;
--cyan-soft: #8ff3ff;
--gold: #ffc857;
--danger: #ff4f72;
--text: #e9fbff;
--muted: #86a9b8;
```

Menus use crisp 1px cyan borders, clipped/notched corners, a restrained scan line, gold primary actions, visible `:focus-visible`, and no central gameplay obstruction. Under `prefers-reduced-motion`, disable panel scans/parallax/pulses but keep gameplay motion.

- [x] **Step 6: Verify GREEN manually and automatically**

```bash
npm test
npm run check
```

Check Chinese and English title/game-over/ranking/rename states, keyboard focus, empty-name behavior, reload persistence, one-time legacy reference, storage-disabled warning, and that closed overlays do not block swipes/taps.

- [x] **Step 7: Commit**

```bash
git add index.html styles/game.css src/game.js src/presentation.js tests/presentation.test.js
git commit -m "feat: add bilingual command center and local Top 15"
```

---

### Task 7: Add the Licensed Visual Assets and Refined Player Ship

**Files:**
- Create: `assets/ship/player-neutral.png`
- Create: `assets/ship/player-thrust.png`
- Create: `assets/ui/panel-frame-cyan.png`
- Create: `assets/ui/button-frame-gold.png`
- Create: `assets/ui/meter-frame-cyan.png`
- Create: six files under `assets/icons/`
- Create: `assets/fonts/Orbitron-Medium.ttf`
- Create: `tools/render-ship.swift`
- Create: `tests/assets.test.js`
- Create: `licenses/Quaternius-Ultimate-Spaceships-CC0.txt`
- Create: `licenses/Kenney-UI-Pack-Sci-Fi-CC0.txt`
- Create: `licenses/Phosphor-Icons-MIT.txt`
- Create: `licenses/Orbitron-OFL-1.1.txt`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `docs/assets/ship-render.md`
- Modify: `src/presentation.js`
- Modify: `src/game.js`
- Modify: `styles/game.css`
- Modify: `app/AppIcon.png`

**Interfaces:**
- Consumes: the Task 6 presentation shell, `computeShipDrawRect`, and the existing procedural ship fallback.
- Produces: repository-local licensed assets, `preloadVisualAssets({ timeoutMs })`, and deterministic visual-load diagnostics.

- [x] **Step 1: Write failing binary asset tests**

`tests/assets.test.js` must read real files and assert:

- both ship PNGs start with the PNG signature, decode through `sips`, and report 512 × 384;
- the three Kenney PNGs are nonempty PNG files;
- each SVG begins with `<svg` after optional XML declaration and contains no `http(s)` runtime reference;
- Orbitron is nonempty and begins with a valid TrueType/OpenType signature;
- notices mention Quaternius, Kenney, Phosphor, Orbitron, each upstream URL, each license, and each repository path;
- no runtime HTML/CSS/JS URL begins with `http://` or `https://`.

Run `node --test tests/assets.test.js` and verify RED because assets are absent.

- [x] **Step 2: Fetch only the approved upstream inputs**

Use the official sources and record download date `2026-08-02` plus original SHA-256 values:

- Quaternius Ultimate Spaceships: select `Striker/OBJ/Striker.obj`, `Striker.mtl`, and `Textures/Striker_Blue.png`; CC0.
- Kenney UI Pack Sci-Fi 2.0: extract `PNG/Extra/Double/panel_glass_notches.png`, `PNG/Yellow/Double/button_square_header_notch_rectangle_screws.png`, and `PNG/Blue/Double/bar_round_gloss_large.png`; CC0.
- Phosphor Core regular SVGs: `translate`, `speaker-high`, `speaker-slash`, `trophy`, `pencil-simple`, `arrow-counter-clockwise`; MIT.
- Orbitron: `fonts/ttf/Orbitron-Medium.ttf` from the official archived Google Fonts Orbitron repository; OFL 1.1.

Copy only final derived/runtime files into `assets/`; do not commit the complete source packs.

- [x] **Step 3: Implement and run the deterministic SceneKit renderer**

`tools/render-ship.swift` accepts:

```text
--model /path/to/Striker.obj
--texture /path/to/Striker_Blue.png
--neutral assets/ship/player-neutral.png
--thrust assets/ship/player-thrust.png
```

Use `SCNScene`, `SCNRenderer`, a transparent 512 × 384 output, orthographic camera at the same rear-high angle as gameplay, a cool key light from upper-left, cyan rim light, low ambient fill, deep-navy body tint, and small gold accent. Neutral/thrust share camera/crop; thrust adds cyan exhaust emissive geometry only. Record exact camera transform, orthographic scale, colors, lights, source hashes, and command in `docs/assets/ship-render.md`.

- [x] **Step 4: Prepare UI/font/icon assets and notices**

Rename the selected yellow button, blue meter, and neutral glass panel semantically without changing alpha dimensions, copy upstream license texts, and write `THIRD_PARTY_NOTICES.md` with modifications and the project-license carve-out.

- [x] **Step 5: Verify asset GREEN**

Run:

```bash
node --test tests/assets.test.js
npm test
```

- [x] **Step 6: Preload and render with fallback**

`preloadVisualAssets({ timeoutMs: 5000 })` returns status for ship frames, UI files, icons, and font. `renderPlayer` uses the neutral/thrust image at `computeShipDrawRect` size, Canvas rotation/shear for bank, and existing boost/super glows around it. If either required frame fails, call the unchanged procedural ship renderer. Use Orbitron only for Latin/numeric headings; Chinese uses system sans-serif.

Update `app/AppIcon.png` from the same rendered ship on the navy/cyan/gold command emblem, without text.

- [x] **Step 7: Visual matrix and commit**

Inspect 960 × 600, 1280 × 800, 1440 × 900, and 1920 × 1080 in normal/boost/super and left/right bank. Confirm ship width 7–9%, coherent lighting, no alpha fringe, and unchanged hitbox behavior.

```bash
git add assets tools/render-ship.swift licenses THIRD_PARTY_NOTICES.md docs/assets/ship-render.md tests/assets.test.js src/presentation.js src/game.js styles/game.css app/AppIcon.png
git commit -m "feat: add licensed command center visuals"
```

---

### Task 8: Compose and Integrate the Adaptive Nebula Cruise Soundtrack

**Files:**
- Create: `src/audio.js`
- Create: `tests/audio.test.js`
- Create: `tools/generate-music.js`
- Create: `assets/audio/source/nebula-cruise-score.json`
- Create: six files under `assets/audio/`
- Modify: `index.html`
- Modify: `src/game.js`
- Modify: `src/presentation.js`

**Interfaces:**
- Consumes: browser AudioContext, game mode/speed/BOOST/danger, current procedural music fallback, mute storage.
- Produces: `chooseStemFormat`, `validateStemDurations`, `mixForGameState`, and `createAudioController`.

- [x] **Step 1: Write failing audio-policy tests**

Define the complete fixture literally:

```js
const completeFiles = {
  atmosphereOgg:'atmosphere.ogg', driveOgg:'drive.ogg', overdriveOgg:'overdrive.ogg',
  atmosphereMp3:'atmosphere.mp3', driveMp3:'drive.mp3', overdriveMp3:'overdrive.mp3',
};

test('a complete OGG set wins over MP3', () => {
  assert.equal(chooseStemFormat(() => 'probably', completeFiles), 'ogg');
});

test('an incomplete OGG set falls back as a whole to MP3', () => {
  const files = { ...completeFiles, overdriveOgg: null };
  assert.equal(chooseStemFormat((mime) => mime.includes('mpeg') ? 'probably' : 'maybe', files), 'mp3');
});

test('both incomplete sets select procedural fallback', () => {
  assert.equal(chooseStemFormat(() => '', {}), 'procedural');
});

test('decoded stem durations must agree within one millisecond', () => {
  assert.equal(validateStemDurations([{duration:68.5710},{duration:68.5715},{duration:68.5719}], 1), true);
  assert.equal(validateStemDurations([{duration:68.571},{duration:68.573},{duration:68.571}], 1), false);
});

test('game over keeps atmosphere and lowers action layers', () => {
  assert.deepEqual(mixForGameState({ mode:'GAMEOVER', speedRatio:1, danger:true }), { atmosphere:1, drive:0, overdrive:0 });
});
```

Add tests for cruise mix, overdrive at `speedRatio >= 0.75`, BOOST/danger override, a 300 ms transition constant, and mute preference surviving throwing storage.

- [x] **Step 2: Verify RED, implement pure policy, verify GREEN**

Run: `node --test tests/audio.test.js` and observe missing-module failure.

Implement the pure functions, then `createAudioController({ AudioContextClass, fetchImpl, storage, proceduralFallback })` with:

```js
unlock()
setGameState({ mode, speedRatio, danger, boost })
setMusicMuted(value)
setSfxMuted(value)
getState()
ready
```

Choose one complete format before fetching. Decode three buffers, reject the set if any load/decode/duration check fails, schedule all `AudioBufferSourceNode`s at one `context.currentTime + 0.05`, and ramp gains over exactly 0.3 seconds. If both sets fail, invoke the existing procedural music through the injected fallback.

- [x] **Step 3: Define and render the original score**

Create score data with exact global values:

```json
{
  "title": "Nebula Cruise",
  "bpm": 112,
  "beatsPerBar": 4,
  "bars": 32,
  "sampleRate": 44100,
  "key": "E minor",
  "progression": ["Em(add9)", "Cmaj7", "G", "D", "Em", "C", "Am7", "B7"]
}
```

`tools/generate-music.js` uses a fixed PRNG seed and renders the same exact frame count `round(32 * 4 * 60 / 112 * 44100)` for:

- atmosphere: warm pad, nebula texture, restrained B–E–G motif;
- drive: E-root bass pulse and restrained kick/snare/hat pattern;
- overdrive: eighth-note arpeggio, brighter counterline, and extra percussion.

Render temporary stereo 16-bit WAVs, then use:

```bash
afconvert -f Oggf -d vorb atmosphere.wav assets/audio/nebula-cruise-atmosphere.ogg
afconvert -f MPG3 -d .mp3 -b 192000 atmosphere.wav assets/audio/nebula-cruise-atmosphere.mp3
```

Repeat for drive and overdrive. Remove temporary WAVs after validating the six committed files with `afinfo`; source score and renderer remain reproducible.

- [x] **Step 4: Integrate playback and diagnostics**

Load `./src/audio.js` before game. Unlock only after the first player gesture. Feed mode, `speed / CONFIG.MAX_SPEED`, BOOST and danger state into `setGameState`. Preserve M as the total shortcut while the settings UI exposes music/SFX states. On game over, atmosphere remains and action layers fade. Audio failure never blocks game start.

Add audio format/decode state to `Skyroads.diagnostics.ready`. Under local-file WebKit failure, report the fallback and keep gameplay functional.

- [ ] **Step 5: Verify two loops and commit**

Run:

```bash
npm test
npm run check
afinfo assets/audio/nebula-cruise-atmosphere.ogg
afinfo assets/audio/nebula-cruise-atmosphere.mp3
```

Listen through at least two full loops in HTTP browser mode and verify no click, drift, restart, or abrupt layer change.

```bash
git add index.html src/audio.js src/game.js src/presentation.js tests/audio.test.js tools/generate-music.js assets/audio
git commit -m "feat: add adaptive nebula cruise soundtrack"
```

---

### Task 9: Finish Branding, Bilingual Documentation, and macOS Resource Packaging

**Files:**
- Modify: `README.md`
- Create: `README.zh-CN.md`
- Modify: `app/Info.plist`
- Modify: `app/main.swift`
- Modify: `app/build.sh`
- Create: `tests/app-resources-smoke.sh`
- Create: `tests/app-wkwebview-smoke.sh`
- Modify: `tests/app-universal-smoke.sh`
- Modify: `tests/app-signature-smoke.sh`
- Modify: `.github/workflows/release-macos.yml`

**Interfaces:**
- Consumes: complete static resource graph and `Skyroads.diagnostics.ready`.
- Produces: `星云巡航 Nebula Cruise.app`, hidden WebKit smoke mode, bilingual repository landing pages, and release CI.

- [x] **Step 1: Write the failing bundle resource smoke**

`tests/app-resources-smoke.sh` builds the app and requires these exact bundle paths:

```text
index.html
src/i18n.js
src/input.js
src/leaderboard.js
src/presentation.js
src/audio.js
src/game.js
styles/game.css
assets/ship/player-neutral.png
assets/ship/player-thrust.png
assets/fonts/Orbitron-Medium.ttf
assets/audio/nebula-cruise-atmosphere.ogg
assets/audio/nebula-cruise-drive.ogg
assets/audio/nebula-cruise-overdrive.ogg
THIRD_PARTY_NOTICES.md
licenses/
```

Run it and verify RED because the current build copies only index/src/styles and uses the old app name.

- [x] **Step 2: Rename visible macOS branding and copy resources**

Set `CFBundleDisplayName` and `CFBundleName` to `星云巡航 Nebula Cruise`; keep bundle ID and executable unchanged. Rename the build output variable to:

```bash
APP="$ROOT/星云巡航 Nebula Cruise.app"
```

Copy `index.html`, `src/`, `styles/`, `assets/`, `THIRD_PARTY_NOTICES.md`, and `licenses/`. Update window title and the bilingual missing-file page in `main.swift`. Update both existing smoke scripts and workflow paths.

- [x] **Step 3: Add the real WKWebView smoke mode**

When launched with `--smoke-test`, `main.swift` creates a hidden WKWebView, loads bundled `index.html`, waits up to 10 seconds, and uses `callAsyncJavaScript` to await `globalThis.Skyroads.diagnostics.ready`. It prints one JSON object and exits 0 only when classic scripts, CSS, both ship frames, Orbitron, and at least one complete audio format decode successfully. Normal launch behavior remains unchanged.

`tests/app-wkwebview-smoke.sh` runs:

```bash
bash app/build.sh
"星云巡航 Nebula Cruise.app/Contents/MacOS/SkyRoads" --smoke-test
```

Run before implementation to see RED, then after implementation to see GREEN.

- [x] **Step 4: Rewrite equivalent English and Chinese READMEs**

`README.md` starts with `[中文](README.zh-CN.md)` and is the English default. `README.zh-CN.md` starts with `[English](README.md)`. Both include the same online URL, product overview, held movement, full controls, local Top 15 and remembered-name behavior, automatic/manual language behavior, local run instructions, macOS build command/output, third-party notice link, AI assistance statement, and project-license carve-out.

Human-facing prose receives manual parity review rather than a source-grep unit test.

- [x] **Step 5: Update release CI and verify complete GREEN**

The workflow runs:

```yaml
npm test
npm run check
bash tests/app-universal-smoke.sh
bash tests/app-signature-smoke.sh
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
plutil -lint "星云巡航 Nebula Cruise.app/Contents/Info.plist"
```

Package `星云巡航 Nebula Cruise.app` into `Nebula-Cruise-macOS-${RELEASE_TAG}.zip`.

- [x] **Step 6: Commit**

```bash
git add README.md README.zh-CN.md app tests .github/workflows/release-macos.yml
git commit -m "build: package bilingual Nebula Cruise release"
```

---

### Task 10: Full Integration, Visual QA, Independent Review, and PR Readiness

**Files:**
- Modify only files required by defects found during verification.
- Update: this plan’s completed checkboxes as tasks land.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a clean, verified feature branch ready for a PR against `main`.

- [x] **Step 1: Run the complete automated suite from a clean worktree**

```bash
npm test
npm run check
bash tests/app-universal-smoke.sh
bash tests/app-signature-smoke.sh
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
git diff --check main...HEAD
```

Expected: every command exits 0 with no warnings that indicate fallback or missing release assets.

- [x] **Step 2: Run the browser gameplay matrix**

Serve the worktree over HTTP and verify both locales at 960 × 600, 1280 × 800, 1440 × 900, and 1920 × 1080. Cover title, gameplay, game over, rename, leaderboard, normal/reduced-motion, neutral/thrust/bank/BOOST/super ship states, tap/hold/reverse/edge/focus loss, swipe/tap controls, shooting, magnet, gaps, walls, enemies, score, qualifying/nonqualifying runs, rename persistence, muted audio persistence, and corrupted/disabled storage fallback.

- [ ] **Step 3: Verify persistence and audio in the actual app**

Build and open the app, complete a run, rename the player, fully quit, reopen, and confirm name/ranking/language/mute persistence. Listen through two complete music loops and transition menu → cruise → overdrive → game over.

Also build/open the `main` version first, create a legacy `skyroads_best`, quit it, then open the new app with the unchanged bundle identifier. Confirm the old value appears only as the previous-version reference and never as a fabricated Top 15 entry. If WebKit storage does not survive the visible app rename, keep the internal resource origin stable or preserve the old bundle display path until this upgrade check passes.

- [x] **Step 4: Request independent code and design review**

Review every diff against the approved design specification. Resolve all correctness, data-loss, licensing, accessibility, and packaging findings. Re-run the complete suite after every fix.

- [ ] **Step 5: Confirm branch hygiene and prepare the PR**

```bash
git status --short
git log --oneline main..HEAD
git diff --stat main...HEAD
```

Expected: clean status; only scoped commits and files; no downloaded source packs, temp WAVs, generated app bundle, visual-companion files, or unrelated user changes.

Use the finishing-development-branch workflow to push `feat/stellar-command-polish` and open a PR against `main`. The PR summary must call out local-only ranking, data migration behavior, two locales, asset licenses, movement timings, soundtrack format fallbacks, and the exact verification commands.

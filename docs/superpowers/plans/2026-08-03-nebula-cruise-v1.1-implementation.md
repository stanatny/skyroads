# Nebula Cruise V1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved `P` pause flow and a consistent, publicly verifiable Nebula Cruise V1.1 across the static web game, macOS wrapper, bilingual documentation, GitHub Pages, and GitHub Release pipeline.

**Architecture:** Keep the game build-free and dependency-free. Add one tiny classic-script version module, extend the existing presentation/i18n boundary for the version badge and semantic pause overlay, and keep the pause transition, input latch, legacy-audio gate, and RAF freeze inside `src/game.js`, where the mutable runtime state already lives. Lock duplicated static metadata together with Node and macOS smoke contracts, then verify the merged GitHub Pages deployment by exact commit SHA before tagging `v1.1.0`.

**Tech Stack:** HTML5 Canvas, classic browser JavaScript, DOM/CSS, Node.js built-in test runner, Web Audio, Swift/AppKit/WKWebView, shell smoke tests, GitHub Actions, GitHub Pages.

## Global Constraints

- Work only on `feat/stellar-command-polish`; the approved base release is `v1.0.0` and the PR base is `main`.
- Product version is exactly `1.1.0`; in-game display is `V1.1`; Git tag is `v1.1.0`; macOS build number is `2`.
- Valid modes are exactly `MENU | PLAYING | PAUSED | GAMEOVER`; `P` only toggles `PLAYING ↔ PAUSED`.
- Pause must freeze gameplay, elapsed time, effects, cooldowns, power-ups, Canvas animation, and random visual repaint while RAF remains scheduled.
- Entering and leaving pause clears held gameplay input, glide, and charge without firing; it must not move focus.
- Music, SFX, language, and `M` remain usable while paused; mute preferences are never rewritten by pause.
- English and Chinese catalog keys and README scope remain equivalent.
- The supported minimum viewport remains 960 × 600; the fifth control line and version badge must not overflow.
- No new runtime dependency, backend, online leaderboard, storage key, permission, entitlement, asset, or build step.
- Leaderboard schema `version: 1` and its versioned local-storage keys remain unchanged.
- Do not create or push `v1.1.0` from the feature branch. Tag only the merged `main` commit after its Pages deployment is verified.
- The complete tracked `.agent/skills/ship-browser-games/` package, its official validation, three successful forward tests, Git index proof, Skill commit, and temporary handoff are V1.1 prerequisites; any failure blocks the V1.1 pull request.

## File Structure

**Create**

- `src/version.js` — immutable browser/CommonJS product-version API derived from one semantic version literal.
- `scripts/check-release-tag.js` — dependency-free release-tag validator used by tests and GitHub Actions.
- `docs/releases/v1.1.0.md` — reusable bilingual GitHub Release notes.

**Modify**

- `package.json`, `app/Info.plist`, `index.html` — canonical package version, macOS metadata, public version metadata, script graph, and pause panel shell.
- `src/i18n.js`, `src/presentation.js`, `styles/game.css` — bilingual pause/version presentation and 960 × 600 layout.
- `src/audio.js`, `src/game.js` — explicit paused audio contract, input/state transition, full frame freeze, diagnostics, and version wiring.
- `README.md`, `README.zh-CN.md` — V1.1 identity, controls, highlights, and canonical playable URL.
- `.github/workflows/release-macos.yml` — reject release tags that do not equal `v${package.version}`.
- `app/main.swift`, `tests/app-resources-smoke.sh`, `tests/app-wkwebview-smoke.sh` — bundled script/version diagnostics and packaged metadata checks.
- `tests/audio.test.js`, `tests/game-audio-ui.test.js`, `tests/i18n.test.js`, `tests/presentation.test.js`, `tests/release-contracts.test.js`, `tests/static-app.test.js` — focused red-green coverage.

---

### Task 0: Ship the Repository Browser-Game Skill

**Files:**
- Create: `.agent/skills/ship-browser-games/SKILL.md`
- Create: `.agent/skills/ship-browser-games/agents/openai.yaml`
- Create: `.agent/skills/ship-browser-games/references/*.md`
- Modify: `.gitignore`
- Modify: this plan
- Create outside repository: a temporary `skyroads-v1.1-handoff.md`

**Interfaces:**
- Produces: a tracked `$ship-browser-games` workflow and temporary continuation handoff.
- Consumes: `docs/superpowers/plans/2026-08-03-ship-browser-games-skill-implementation.md`.

- [ ] **Step 1: Execute the approved Skill implementation plan**

Complete every task in `docs/superpowers/plans/2026-08-03-ship-browser-games-skill-implementation.md`, including the required official scaffold and all eight approved Skill files.

- [ ] **Step 2: Prove validation and forward behavior**

Require `quick_validate.py` to succeed and require all three minimal-context forward tests from the Skill plan to pass. A structural validation or routing failure blocks further V1.1 release work.

- [ ] **Step 3: Prove tracking and commit completeness**

Force-stage the Skill, verify every Skill file with `git ls-files --error-unmatch`, and create a commit that contains the complete Skill package. Confirm the commit file list includes `SKILL.md`, `agents/openai.yaml`, and all six references.

- [ ] **Step 4: Create the temporary handoff**

Create and validate the out-of-repository handoff required by Task 6 of the Skill implementation plan. Do not place it in the repository.

- [ ] **Step 5: Enforce the release blocker**

Do not open or update the V1.1 pull request as ready for merge until the Skill plan, official validation, forward tests, Git index proof, complete Skill commit, and temporary handoff have all succeeded.

---

### Task 1: Establish the V1.1 Version Contract

**Files:**
- Create: `src/version.js`
- Create: `scripts/check-release-tag.js`
- Modify: `package.json`
- Modify: `index.html`
- Modify: `app/Info.plist`
- Modify: `.github/workflows/release-macos.yml`
- Modify: `src/game.js:3845-3905`
- Modify: `app/main.swift:96-116`
- Modify: `tests/release-contracts.test.js`
- Modify: `tests/static-app.test.js`
- Modify: `tests/app-resources-smoke.sh`
- Modify: `tests/app-wkwebview-smoke.sh`

**Interfaces:**
- Produces: `Skyroads.version` and CommonJS export `Readonly<{ semver: string, display: string, accessible: string, tag: string }>`.
- Produces: `expectedReleaseTag(version: string): string` and `validateReleaseTag(actual: string, version: string): boolean` from `scripts/check-release-tag.js`.
- Produces: diagnostics fields `scripts.version: boolean` and `version: { semver, display, tag }`.
- Consumes: no earlier task.

- [ ] **Step 1: Add failing cross-file version and tag-validator tests**

Append focused checks to `tests/release-contracts.test.js`:

```js
const { spawnSync } = require('node:child_process');
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
  assert.match(html, /<meta name="application-version" content="1\.1\.0">/);
  assert.equal(plistString(plist, 'CFBundleShortVersionString'), packageJson.version);
  assert.equal(plistString(plist, 'CFBundleVersion'), '2');
});

test('release tag validation accepts only v plus package semver', () => {
  const script = path.join(root, 'scripts/check-release-tag.js');
  assert.equal(spawnSync(process.execPath, [script, 'v1.1.0']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'V1.1']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'v1.1']).status, 0);
});
```

Extend `tests/static-app.test.js` to assert that `./src/version.js` is the first deferred script and that diagnostics include the version module.

- [ ] **Step 2: Run the focused tests and confirm the intended red state**

Run:

```bash
node --test tests/release-contracts.test.js tests/static-app.test.js
```

Expected: FAIL because `package.json.version`, `src/version.js`, the HTML metadata, and the tag validator do not exist and `Info.plist` is still `1.0` / build `1`.

- [ ] **Step 3: Add the immutable version module and release-tag validator**

Create `src/version.js` with the repository's existing classic-script/CommonJS pattern:

```js
'use strict';

(function attachVersion(root) {
  const semver = '1.1.0';
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!match) throw new TypeError(`Invalid product version: ${semver}`);
  const api = Object.freeze({
    semver,
    display: `V${match[1]}.${match[2]}`,
    accessible: `${match[1]}.${match[2]}`,
    tag: `v${semver}`,
  });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.version = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
```

Create `scripts/check-release-tag.js`:

```js
'use strict';

const packageJson = require('../package.json');

function expectedReleaseTag(version) { return `v${String(version)}`; }
function validateReleaseTag(actual, version) {
  return String(actual || '') === expectedReleaseTag(version);
}

if (require.main === module) {
  const actual = process.argv[2] || process.env.RELEASE_TAG || '';
  const expected = expectedReleaseTag(packageJson.version);
  if (!validateReleaseTag(actual, packageJson.version)) {
    console.error(`Release tag ${actual || '<empty>'} does not match ${expected}`);
    process.exitCode = 1;
  }
}

module.exports = { expectedReleaseTag, validateReleaseTag };
```

- [ ] **Step 4: Wire every static and packaged version surface**

Make these exact metadata changes:

```json
{
  "name": "nebula-cruise",
  "version": "1.1.0",
  "private": true
}
```

Add to `index.html`:

```html
<meta name="application-version" content="1.1.0">
...
<script defer src="./src/version.js"></script>
```

Load `version.js` before all other feature modules. Set `CFBundleShortVersionString` to `1.1.0` and `CFBundleVersion` to `2`. Add `src/version.js` to the packaged resource list, add `version` to the WKWebView/Swift script-ready lists, and expose this immutable diagnostic snapshot from `installDiagnostics()`:

```js
const productVersion = globalThis.Skyroads.version || null;
// scripts.version: Boolean(productVersion)
version: productVersion ? Object.freeze({
  semver: productVersion.semver,
  display: productVersion.display,
  tag: productVersion.tag,
}) : null,
```

Add this workflow step immediately after checkout:

```yaml
- name: Validate release version contract
  env:
    RELEASE_TAG: ${{ github.event.release.tag_name }}
  run: node scripts/check-release-tag.js "$RELEASE_TAG"
```

In `tests/app-resources-smoke.sh`, assert the built plist values are `1.1.0` and `2`; in `tests/app-wkwebview-smoke.sh`, assert `diagnostics.scripts.version === true` and `diagnostics.version.semver === '1.1.0'`.

- [ ] **Step 5: Run version, syntax, and packaged-resource checks**

Run:

```bash
node --test tests/release-contracts.test.js tests/static-app.test.js
npm run check
bash tests/app-resources-smoke.sh
```

Expected: all pass; the built app plist reports `1.1.0` and build `2`.

- [ ] **Step 6: Commit the version contract**

```bash
git add package.json index.html app/Info.plist .github/workflows/release-macos.yml \
  src/version.js src/game.js app/main.swift scripts/check-release-tag.js \
  tests/release-contracts.test.js tests/static-app.test.js \
  tests/app-resources-smoke.sh tests/app-wkwebview-smoke.sh
git commit -m "build: establish v1.1 release contract"
```

---

### Task 2: Build the Semantic Pause and Version Presentation

**Files:**
- Modify: `index.html:12-22`
- Modify: `src/i18n.js:7-31`
- Modify: `src/presentation.js:233-260, 300-330, 570-735`
- Modify: `styles/game.css:105-220, 330-355`
- Modify: `tests/i18n.test.js`
- Modify: `tests/presentation.test.js`
- Modify: `tests/static-app.test.js`

**Interfaces:**
- Consumes: `Skyroads.version` from Task 1.
- Produces: overlay shape `{ title: boolean, pause: boolean, gameOver: boolean }`.
- Produces: UI references `titleMeta`, `versionBadge`, `pauseHeading`, `pauseHint`, and five `controlItems`.
- Produces catalog keys: `app.versionLabel`, `controls.pause`, `pause.title`, `pause.resumeHint`.

- [ ] **Step 1: Write failing presentation, i18n, and shell tests**

Update the overlay assertions in `tests/presentation.test.js`:

```js
assert.deepEqual(overlayForMode('MENU'), { title: true, pause: false, gameOver: false });
assert.deepEqual(overlayForMode('PLAYING'), { title: false, pause: false, gameOver: false });
assert.deepEqual(overlayForMode('PAUSED'), { title: false, pause: true, gameOver: false });
assert.deepEqual(overlayForMode('GAMEOVER'), { title: false, pause: false, gameOver: true });
```

Add a three-panel visibility test and assert `focusPrimaryForMode(elements, 'PAUSED')` returns `null` without invoking any `focus()` method. Extend the command-center test with:

```js
assert.equal(ui.controlItems.length, 5);
assert.equal(ui.versionBadge.tagName, 'SMALL');
assert.equal(ui.versionBadge.tabIndex, -1);
renderCommandCenter(ui, {
  translator,
  productVersion: { display: 'V1.1', accessible: '1.1' },
  mode: 'PAUSED',
  snapshot,
});
assert.equal(ui.versionBadge.textContent, 'V1.1');
assert.equal(ui.versionBadge.getAttribute('aria-label'), 'app.versionLabel:1.1');
assert.equal(ui.pauseHeading.textContent, 'pause.title');
assert.equal(ui.pauseHint.textContent, 'pause.resumeHint');
assert.equal(ui.controlItems[4].textContent, 'controls.pause');
```

In `tests/i18n.test.js`, assert the exact English and Chinese strings. In `tests/static-app.test.js`, assert one hidden, noninteractive `#pause-screen` with `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`.

- [ ] **Step 2: Run the UI tests and confirm they fail for missing PAUSED presentation**

Run:

```bash
node --test tests/i18n.test.js tests/presentation.test.js tests/static-app.test.js
```

Expected: FAIL because `PAUSED` is unsupported, the pause panel/version badge do not exist, and the catalogs still have four controls.

- [ ] **Step 3: Add the static pause panel and exact bilingual copy**

Add beside the title and game-over panels:

```html
<section id="pause-screen" class="screen-panel" role="status"
         aria-live="polite" aria-atomic="true" hidden></section>
```

Add matching messages:

```js
// en
'app.versionLabel': 'Version {version}',
'controls.pause': 'Pause / resume: P',
'pause.title': 'GAME PAUSED',
'pause.resumeHint': 'Press P to resume',

// zh-CN
'app.versionLabel': '版本 {version}',
'controls.pause': '暂停 / 继续：P',
'pause.title': '游戏已暂停',
'pause.resumeHint': '按 P 继续',
```

- [ ] **Step 4: Extend the command-center presentation tree**

Update `overlayForMode()` and `setOverlayMode()` to control all three panels. Make `focusPrimaryForMode()` validate `PAUSED` but return `null` without changing focus. Include `pauseScreen` in the background-inert list used by dialogs.

Create the title metadata row and pause content inside `createCommandCenter()`:

```js
const titleMeta = makeElement(documentObject, 'div', { className: 'title-meta' });
const titleKicker = makeElement(documentObject, 'p', { className: 'panel-kicker' });
const versionBadge = makeElement(documentObject, 'small', { id: 'version-badge', className: 'version-badge' });
versionBadge.tabIndex = -1;
titleMeta.append(titleKicker, versionBadge);

const pauseHeading = makeElement(documentObject, 'h2', { id: 'pause-heading' });
const pauseHint = makeElement(documentObject, 'p', { className: 'pause-hint' });
elements.pauseScreen.setAttribute('aria-labelledby', 'pause-heading');
elements.pauseScreen.replaceChildren(pauseHeading, pauseHint);
```

Extend the existing destructured options with the product version and render with:

```js
function renderCommandCenter(ui, {
  translator,
  snapshot,
  mode,
  finalResult = null,
  deathReason = null,
  audioMuted = false,
  musicMuted = null,
  sfxMuted = null,
  audioStatus = 'unavailable',
  audioFormat = null,
  audioDecoded = false,
  productVersion = (root.Skyroads && root.Skyroads.version) || null,
} = {}) {
  if (!ui || !translator || !snapshot) return;
  // Keep the existing overlay, audio, result, leaderboard, and rename rendering.
  ui.versionBadge.hidden = !productVersion;
  ui.versionBadge.textContent = productVersion ? productVersion.display : '';
  ui.versionBadge.setAttribute('aria-label', productVersion
    ? translator.t('app.versionLabel', { version: productVersion.accessible }) : '');
  ui.pauseHeading.textContent = translator.t('pause.title');
  ui.pauseHint.textContent = translator.t('pause.resumeHint');
  const controlIds = ['controls.move', 'controls.jump', 'controls.shoot', 'controls.touch', 'controls.pause'];
  ui.controlItems.forEach((item, index) => { item.textContent = translator.t(controlIds[index]); });
}
```

- [ ] **Step 5: Style the metadata row and compact pause panel**

Add CSS equivalent to:

```css
.title-meta { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.version-badge {
  flex: none;
  padding: 0.2rem 0.5rem;
  border: 1px solid rgba(93, 231, 255, 0.55);
  color: var(--cyan-soft);
  font: 500 0.68rem/1 "Orbitron", sans-serif;
  letter-spacing: 0.12em;
}
#pause-screen { width: min(86vw, 440px); text-align: center; pointer-events: none; }
.pause-hint { color: var(--cyan-soft); letter-spacing: 0.08em; }
```

Keep the existing `prefers-reduced-motion` rule responsible for disabling the panel scan animation.

- [ ] **Step 6: Run the presentation tests and commit**

Run:

```bash
node --test tests/i18n.test.js tests/presentation.test.js tests/static-app.test.js
```

Expected: all pass with five controls and one localized, noninteractive version badge.

```bash
git add index.html src/i18n.js src/presentation.js styles/game.css \
  tests/i18n.test.js tests/presentation.test.js tests/static-app.test.js
git commit -m "feat: add pause and v1.1 presentation"
```

---

### Task 3: Implement Pause Input, State, and Audio Transitions

**Files:**
- Modify: `src/audio.js:48-65`
- Modify: `src/game.js:192-430, 2930-2960, 3032-3065, 3460-3535, 3940-4015`
- Modify: `tests/audio.test.js`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- Produces internal `togglePause(): boolean` and `setLegacyAudioPaused(paused: boolean): void`.
- Produces internal `pauseKeyHeld: boolean`, released only on `keyup`, blur, or hidden-page input cleanup.
- Consumes: pause DOM and `PAUSED` overlay from Task 2.
- Preserves: `clearAllInputState()` cancels held directions, keys, charge, glide, and touch without firing.

- [ ] **Step 1: Add explicit paused adaptive-audio coverage**

Add to `tests/audio.test.js`:

```js
test('paused missions retain atmosphere only through the 300ms transition', () => {
  assert.deepEqual(
    mixForGameState({ mode: 'PAUSED', speedRatio: 1, danger: true, boost: true }),
    { atmosphere: 1, drive: 0, overdrive: 0 },
  );
  assert.equal(STEM_TRANSITION_SECONDS, 0.3);
});
```

This should already pass and locks the existing non-playing policy before game integration.

- [ ] **Step 2: Add failing P-key and input-reset integration tests**

Extend the game sandbox element IDs with `pause-screen` and load `version.js` before the existing modules. Add tests with these exact contracts:

```js
test('P toggles only PLAYING and PAUSED after editing and dialog guards', () => {
  const { sandbox, windowObject, elements } = makeGameUiSandbox();
  let prevented = 0;
  windowObject.dispatch('keydown', { code: 'KeyP', preventDefault() { prevented++; } });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'MENU');

  vm.runInContext('startGame()', sandbox);
  windowObject.dispatch('keydown', { code: 'KeyP', preventDefault() { prevented++; } });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
  windowObject.dispatch('keydown', { code: 'KeyP', repeat: true });
  windowObject.dispatch('keydown', { code: 'KeyP', repeat: false });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PAUSED');
  windowObject.dispatch('keyup', { code: 'KeyP' });
  windowObject.dispatch('keydown', { code: 'KeyP' });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
  assert.equal(prevented, 2);

  elements['leaderboard-dialog'].hidden = false;
  windowObject.dispatch('keyup', { code: 'KeyP' });
  windowObject.dispatch('keydown', { code: 'KeyP' });
  assert.equal(vm.runInContext('STATE.mode', sandbox), 'PLAYING');
});
```

Add concrete reset and paused-key coverage:

```js
test('pause clears movement glide and charge without firing', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext(`
    startGame();
    STATE.movement.heldRight = true;
    STATE.movement.activeDirection = 1;
    STATE.movement.segmentActive = true;
    STATE.chargeT = 2;
    STATE.chargeStage = 2;
    STATE.gliding = true;
    KEYS.KeyJ = true;
  `, sandbox);
  windowObject.dispatch('keydown', { code: 'KeyP' });
  windowObject.dispatch('keyup', { code: 'KeyJ' });
  const state = vm.runInContext(`({
    heldRight: STATE.movement.heldRight,
    activeDirection: STATE.movement.activeDirection,
    segmentActive: STATE.movement.segmentActive,
    chargeT: STATE.chargeT,
    chargeStage: STATE.chargeStage,
    gliding: STATE.gliding,
    shots: STATE.shots.length,
    activeKeys: Object.keys(KEYS).filter((key) => KEYS[key]),
  })`, sandbox);
  assert.deepEqual({ ...state, activeKeys: [...state.activeKeys] }, {
    heldRight: false, activeDirection: 0, segmentActive: true,
    chargeT: 0, chargeStage: 0, gliding: false, shots: 0, activeKeys: [],
  });
});

test('paused gameplay keys are inert while a utility target keeps focus', () => {
  const { sandbox, windowObject, documentObject, elements } = makeGameUiSandbox();
  const utility = appUiTarget(elements);
  vm.runInContext('startGame()', sandbox);
  documentObject.activeElement = utility;
  windowObject.dispatch('keydown', { code: 'KeyP', target: utility });
  const before = vm.runInContext('JSON.stringify({ y: STATE.playerY, shots: STATE.shots, keys: KEYS })', sandbox);
  for (const code of ['KeyA', 'KeyD', 'KeyJ', 'KeyK', 'Space', 'Enter']) {
    windowObject.dispatch('keydown', { code, target: utility });
  }
  assert.equal(vm.runInContext('JSON.stringify({ y: STATE.playerY, shots: STATE.shots, keys: KEYS })', sandbox), before);
  assert.equal(documentObject.activeElement, utility);
});
```

Add this exact guard matrix and use a non-editing utility target in the primary P test to prove it can pause and resume:

```js
const inputTarget = appUiTarget(elements, 'input');
const editableTarget = appUiTarget(elements, 'div');
editableTarget.isContentEditable = true;
for (const target of [inputTarget, editableTarget]) {
  const beforeMode = vm.runInContext('STATE.mode', sandbox);
  windowObject.dispatch('keydown', { code: 'KeyP', target });
  assert.equal(vm.runInContext('STATE.mode', sandbox), beforeMode);
}
elements['leaderboard-dialog'].hidden = false;
const beforeDialogMode = vm.runInContext('STATE.mode', sandbox);
windowObject.dispatch('keydown', { code: 'KeyP', target: appUiTarget(elements) });
assert.equal(vm.runInContext('STATE.mode', sandbox), beforeDialogMode);
```

Add a legacy-bus test covering `.45 → 0 → .45`, `0 → 0 → 0`, preference storage stability, and paused music/SFX utility clicks keeping the shared bus at zero.

- [ ] **Step 3: Run the input integration tests and confirm the red state**

Run:

```bash
node --test tests/audio.test.js tests/game-audio-ui.test.js
```

Expected: audio unit tests pass; game tests fail because `KeyP`, `PAUSED`, the pause latch, and the legacy pause gate do not exist.

- [ ] **Step 4: Add a dedicated P latch and transition function**

Near `KEYS`, add `let pauseKeyHeld = false;`. Keep it separate because `togglePause()` calls `clearAllInputState()`.

Handle P after editing/dialog guards and `preventDefault()`, but before ordinary app-UI focus gating:

```js
if (code === 'KeyP') {
  if (e.repeat || pauseKeyHeld) return;
  if (STATE.mode === 'PLAYING' || STATE.mode === 'PAUSED') {
    pauseKeyHeld = true;
    togglePause();
  }
  return;
}
```

Add `KeyP` to recognized keys. After global `M` handling, return immediately for all other keys while `STATE.mode === 'PAUSED'`, before writing to `KEYS`. On `keyup KeyP`, set the latch false and return. Blur and hidden-page cleanup must call both `clearAllInputState()` and a small `releasePauseKey()` helper.

Implement the transition without focus changes:

```js
function togglePause() {
  if (STATE.mode !== 'PLAYING' && STATE.mode !== 'PAUSED') return false;
  const paused = STATE.mode === 'PLAYING';
  clearAllInputState();
  STATE.mode = paused ? 'PAUSED' : 'PLAYING';
  if (!paused) STATE.lastTime = 0;
  setLegacyAudioPaused(paused);
  syncAdaptiveAudio(true);
  refreshPresentation();
  return true;
}
```

Do not call `focusPrimarySurface()` and do not add blur/visibility auto-pause.

- [ ] **Step 5: Gate the shared legacy bus without changing preferences**

Add `resumeLegacyAfterPause: false` to `AUDIO`, then implement:

```js
function setLegacyAudioPaused(paused) {
  const current = adaptiveAudioState();
  const preferencesAllowAudio = !(current.musicMuted && current.sfxMuted);
  try {
    if (paused) {
      AUDIO.resumeLegacyAfterPause = Boolean(AUDIO.master && AUDIO.master.gain.value > 0);
      if (AUDIO.master) AUDIO.master.gain.value = 0;
      return;
    }
    if (AUDIO.master) {
      AUDIO.master.gain.value = AUDIO.resumeLegacyAfterPause && preferencesAllowAudio ? 0.45 : 0;
    }
    AUDIO.resumeLegacyAfterPause = false;
  } catch (_) {}
}
```

Change `syncLegacyAudioMuteState()` so `STATE.mode === 'PAUSED'` always targets gain `0`, even when a paused utility changes a preference. Keep `setMusicMuted()` / `setSfxMuted()` untouched for the transition itself.

Pass `pauseScreen` into `createCommandCenter()`, pass `productVersion: globalThis.Skyroads.version` into `renderCommandCenter()`, and let diagnostics report `mode: 'PAUSED'` with `overlays.pause === true`.

- [ ] **Step 6: Run state/audio tests and commit**

Run:

```bash
node --test tests/audio.test.js tests/game-audio-ui.test.js tests/presentation.test.js
```

Expected: all pass; P is suppressed in text/dialog contexts, held P toggles once, and paused utilities remain live without leaking legacy audio.

```bash
git add src/audio.js src/game.js tests/audio.test.js tests/game-audio-ui.test.js
git commit -m "feat: add explicit pause transitions"
```

---

### Task 4: Freeze RAF Simulation and Preserve the Static Canvas

**Files:**
- Modify: `src/game.js:3790-3830`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- Consumes: `STATE.mode === 'PAUSED'` and resumed `STATE.lastTime = 0` from Task 3.
- Produces: RAF policy that continues scheduling while skipping clock, physics, effects, and Canvas repaint during pause.
- Preserves: `MENU` and `GAMEOVER` animation/effect behavior.

- [ ] **Step 1: Add a failing comprehensive paused-frame test**

Add a test that dirties representative state before pausing:

```js
vm.runInContext(`
  STATE.lastTime = 1000;
  STATE.time = 3;
  STATE.position = 12;
  STATE.elapsedMs = 2400;
  STATE.boostT = 4;
  STATE.tripleT = 5;
  STATE.magnetT = 6;
  STATE.bulletCD = 0.2;
  STATE.flash = 0.8;
  STATE.shake = 0.7;
  STATE.trail = [{ x: 1, y: 2, vx: 3, vy: 4, life: 1, maxLife: 1 }];
  STATE.particles = [{ x: 5, y: 6, vx: 7, vy: 8, life: 1, maxLife: 1, size: 1, color: '#fff' }];
  globalThis.__renders = 0;
  render = () => { globalThis.__renders++; };
`, sandbox);
windowObject.dispatch('keydown', { code: 'KeyP' });
```

Capture a JSON snapshot excluding `lastTime`, call `loop(5000)` and `loop(9000)`, and assert the snapshot is byte-for-byte equal, `__renders === 0`, and RAF was scheduled twice. Include movement, speed, player Y/VY, fuel, score/distance, charge, shots/enemies, warning stages, shockwave, magnet pulls, and every effect timer in the snapshot.

Add a resume test: release and press P, call `loop(20000)`, assert no world/time/effect change and no physics side effect, then call `loop(20016)` and assert approximately 16 ms of progress rather than the 50 ms clamp.

- [ ] **Step 2: Run the focused frame tests and confirm the red state**

Run:

```bash
node --test --test-name-pattern="paused RAF|first resumed frame" tests/game-audio-ui.test.js
```

Expected: FAIL because the current loop advances `STATE.time`, effects, and render during non-playing modes.

- [ ] **Step 3: Apply the explicit paused RAF policy**

Replace the main-loop policy with:

```js
function loop(now) {
  if (!STATE.lastTime) STATE.lastTime = now;
  const dt = Math.min(Math.max(0, (now - STATE.lastTime) / 1000), 0.05);
  STATE.lastTime = now;
  const paused = STATE.mode === 'PAUSED';

  if (!paused && dt > 0) {
    STATE.time += dt;
    if (STATE.mode === 'PLAYING') updatePhysics(dt);
    updateEffects(dt);
  }
  syncAdaptiveAudio();
  if (!paused) render();
  requestAnimationFrame(loop);
}
```

Skipping `render()` intentionally retains the last completed Canvas frame below the semantic DOM pause panel. It also prevents random shake, flame, and charge-arc repaint while paused. `MENU` and `GAMEOVER` still update effects and render normally; the first resumed frame has `dt === 0` because Task 3 resets `lastTime`.

- [ ] **Step 4: Run pause, rendering, and reduced-motion regression tests**

Run:

```bash
node --test tests/game-audio-ui.test.js tests/player-render.test.js tests/presentation.test.js
```

Expected: all pass, including existing reduced-motion and render safety coverage.

- [ ] **Step 5: Commit the freeze policy**

```bash
git add src/game.js tests/game-audio-ui.test.js
git commit -m "fix: freeze paused simulation and canvas"
```

---

### Task 5: Complete Bilingual V1.1 Documentation and Release Notes

**Files:**
- Create: `docs/releases/v1.1.0.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `tests/release-contracts.test.js`

**Interfaces:**
- Consumes: exact `1.1.0`, `V1.1`, `v1.1.0`, `P`, and canonical Pages URL from earlier tasks/specs.
- Produces: copy-ready bilingual release body for GitHub Release.
- Preserves: English default README and reciprocal language links.

- [ ] **Step 1: Add failing documentation contract assertions**

Append to `tests/release-contracts.test.js`:

```js
test('both READMEs describe the V1.1 web release and pause control', () => {
  const english = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const chinese = fs.readFileSync(path.join(root, 'README.zh-CN.md'), 'utf8');
  const releaseUrl = 'https://github.com/stanatny/skyroads/releases/tag/v1.1.0';
  for (const source of [english, chinese]) {
    assert.ok(source.includes('https://stanatny.github.io/skyroads/'));
    assert.ok(source.includes(releaseUrl));
    assert.ok(source.includes('`P`'));
  }
  assert.match(english, /Current version: \[v1\.1\.0\]/);
  assert.match(chinese, /当前版本：\[v1\.1\.0\]/);
});
```

- [ ] **Step 2: Run the documentation contract and confirm it fails**

Run:

```bash
node --test tests/release-contracts.test.js
```

Expected: FAIL because neither README declares V1.1 or the pause row.

- [ ] **Step 3: Update the English and Chinese README files in parallel**

Immediately after the playable URL, add:

```md
Current version: [v1.1.0](https://github.com/stanatny/skyroads/releases/tag/v1.1.0)
```

```md
当前版本：[v1.1.0](https://github.com/stanatny/skyroads/releases/tag/v1.1.0)
```

Add `Pause / resume | P | Keyboard only` and `暂停 / 继续 | P | 仅键盘` rows. Update both highlight sections to cover the command-center art, responsive held movement, adaptive soundtrack, bilingual UI, reliable local Top 15, remembered optional pilot name, and explicit pause. Keep the local-only ranking and system-language behavior unchanged.

- [ ] **Step 4: Create complete reusable bilingual release notes**

Create `docs/releases/v1.1.0.md` with this structure and finished copy:

```markdown
# 星云巡航 V1.1 / Nebula Cruise V1.1

## 中文

V1.1 将网页游戏升级为更完整的星际指挥中心体验：精细飞船与科幻 UI、按住连续变道、原创三轨自适应配乐、中英双语、本机 Top 15，以及按 `P` 暂停/继续。排行榜只保存在当前浏览器；玩家名会自动沿用，也可以随时修改。

在线游玩：https://stanatny.github.io/skyroads/

macOS 下载：`Nebula-Cruise-macOS-v1.1.0.zip`

主要操作：按住 `A` / `D` 或方向键连续移动，`K` / 空格跳跃，`J` 射击或蓄力，`P` 暂停或继续，`M` 切换全部声音。

说明：Top 15 与玩家名字只保存在当前浏览器，不会跨设备同步。

## English

V1.1 upgrades the browser game into a fuller interstellar command-center experience: detailed ship and sci-fi UI art, responsive held lane movement, an original three-stem adaptive soundtrack, English/Chinese localization, a reliable local Top 15, and `P` to pause or resume. Rankings stay in this browser; the current pilot name is remembered and can be changed at any time.

Play online: https://stanatny.github.io/skyroads/

macOS download: `Nebula-Cruise-macOS-v1.1.0.zip`

Core controls: hold `A` / `D` or the arrow keys to move, use `K` / Space to jump, `J` to fire or charge, `P` to pause or resume, and `M` to toggle all audio.

Note: the Top 15 and pilot name stay in this browser and do not sync across devices.
```

Use the text exactly as written above; it intentionally does not claim cloud sync or an online leaderboard.

- [ ] **Step 5: Run docs tests and commit**

Run:

```bash
node --test tests/release-contracts.test.js tests/i18n.test.js
```

Expected: all pass.

```bash
git add README.md README.zh-CN.md docs/releases/v1.1.0.md tests/release-contracts.test.js
git commit -m "docs: prepare bilingual v1.1 release"
```

---

### Task 6: Run Full Verification and Browser Acceptance

**Files:**
- Modify if findings require fixes: only files already listed in Tasks 1–5.
- Verify: all tracked source, test, app, workflow, and documentation files.

**Interfaces:**
- Consumes: completed V1.1 implementation from Tasks 1–5.
- Produces: green automated/macOS evidence, real-browser evidence, and a review-ready feature branch.

- [ ] **Step 1: Run the complete Node, syntax, and Git checks**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: the complete suite passes with no syntax or whitespace errors.

- [ ] **Step 2: Run all four macOS smoke scripts and direct packaged smoke**

Run:

```bash
bash tests/app-universal-smoke.sh
bash tests/app-signature-smoke.sh
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
"Nebula Cruise.app/Contents/MacOS/SkyRoads" --smoke-test \
  | jq -e '.ok == true and .diagnostics.initialized == true and .diagnostics.version.semver == "1.1.0" and .diagnostics.audio.status == "ready"'
plutil -lint "Nebula Cruise.app/Contents/Info.plist"
test "$(plutil -extract CFBundleShortVersionString raw "Nebula Cruise.app/Contents/Info.plist")" = "1.1.0"
test "$(plutil -extract CFBundleVersion raw "Nebula Cruise.app/Contents/Info.plist")" = "2"
```

Expected: all commands exit zero and the universal signed app reports V1.1 diagnostics.

- [ ] **Step 3: Verify the real browser at exactly 960 × 600 in both locales**

Start the static server from the worktree:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Use the in-app browser at `http://127.0.0.1:8000/` with a 960 × 600 viewport. For English and Chinese, evaluate:

```js
(() => {
  const titleScreen = document.getElementById('title-screen');
  const versionBadge = document.getElementById('version-badge');
  return {
    viewport: [innerWidth, innerHeight],
    pageFits: document.documentElement.scrollWidth <= innerWidth
      && document.documentElement.scrollHeight <= innerHeight,
    titleFits: titleScreen.scrollWidth <= titleScreen.clientWidth
      && titleScreen.scrollHeight <= titleScreen.clientHeight,
    controls: document.querySelectorAll('.control-list li').length,
    versionCount: document.querySelectorAll('#version-badge').length,
    versionText: versionBadge?.textContent,
    versionLabel: versionBadge?.getAttribute('aria-label'),
  };
})()
```

Require `[960, 600]`, both fit booleans true, five controls, exactly one `V1.1` badge, and locale-specific accessible labels `Version 1.1` / `版本 1.1`. Start a mission, verify Canvas focus, press P twice, and confirm the semantic pause panel, exact localized copy, static Canvas, and `Skyroads.diagnostics.snapshot().mode` transitions. While paused, toggle language/music/SFX and confirm the pause state remains active and P still resumes from the focused utility control.

- [ ] **Step 4: Request independent code and design review**

Give the reviewer both approved specs, this plan, and the diff from `main`. Require explicit checks for state transitions, held-key latch behavior, full freeze, shared legacy audio, focus/accessibility, version drift, Pages acceptance, and documentation parity. Resolve every valid finding with a failing regression test first, then rerun the affected focused suite.

- [ ] **Step 5: Re-run the full suite after review fixes**

Run every command from Steps 1 and 2 again, then repeat the two-locale browser matrix. Expected: all green on the exact final worktree commit.

- [ ] **Step 6: Inspect and commit any review fixes**

```bash
git status --short
git diff --stat
git diff
git diff --check
```

Confirm the app build product is ignored and only intended V1.1 files are tracked. If review produced source changes:

```bash
git add -u
git commit -m "fix: close v1.1 release review findings"
```

Do not create a release tag in this task.

---

### Task 7: Push the PR Candidate and Define Post-Merge Proof

**Files:**
- Read: `docs/releases/v1.1.0.md`
- No source changes expected.

**Interfaces:**
- Consumes: fully verified branch from Task 6.
- Produces: pushed PR candidate, PR text, and exact post-merge verification commands.

- [ ] **Step 1: Capture final branch and base evidence**

Run:

```bash
git fetch origin main
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main...HEAD
git merge-base --is-ancestor origin/main HEAD
```

Expected: clean named branch `feat/stellar-command-polish`, based on `main`, with only reviewed commits.

- [ ] **Step 2: Push the named feature branch without force**

```bash
git push -u origin feat/stellar-command-polish
```

Expected: ordinary fast-forward push succeeds. Never force-push to repair a rejection.

- [ ] **Step 3: Create the PR against `main` or provide the exact authenticated compare URL**

Use the repository compare page:

```text
https://github.com/stanatny/skyroads/compare/main...feat/stellar-command-polish?expand=1
```

Title:

```text
feat: ship Nebula Cruise V1.1
```

Use this PR body, changing a verification line only if the final command genuinely differs:

```markdown
## Summary

- rebuild the game as the bilingual Nebula Cruise interstellar command center with licensed, self-hosted visuals and a detailed ship
- add responsive held lane movement, the original three-stem adaptive soundtrack, and a reliable browser-local Top 15 with remembered optional pilot names
- add a formal `PAUSED` state: press `P` to freeze and resume simulation, effects, timing, input, and audio safely
- establish the V1.1 contract across the web UI, package metadata, macOS app, documentation, diagnostics, and release workflow

## Play online

After merge, GitHub Pages continues to serve:
https://stanatny.github.io/skyroads/

The release checklist requires the Pages deployment SHA to equal the merged commit before `v1.1.0` is tagged.

## Verification

- `npm test`
- `npm run check`
- `git diff --check`
- `bash tests/app-universal-smoke.sh`
- `bash tests/app-signature-smoke.sh`
- `bash tests/app-resources-smoke.sh`
- `bash tests/app-wkwebview-smoke.sh`
- direct packaged `--smoke-test`
- real-browser 960 × 600 pause/version/language/audio checks in English and Chinese

## Release

- product: `1.1.0`
- in-game badge: `V1.1`
- planned tag after merge and Pages verification: `v1.1.0`
```

If the environment is not authenticated, do not bypass authentication; leave the compare page open and give the user this complete title/body.

- [ ] **Step 4: After user merge, prove Pages serves that exact commit before tagging**

Run from a clean `main` checkout after the PR is merged:

```bash
git fetch origin main
MERGED_SHA="$(git rev-parse origin/main)"
DEPLOYMENTS="$(curl -fsSL -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  'https://api.github.com/repos/stanatny/skyroads/deployments?environment=github-pages&per_page=10')"
printf '%s' "$DEPLOYMENTS" | jq -e --arg sha "$MERGED_SHA" \
  '.[0] | .environment == "github-pages" and .ref == "main" and .sha == $sha'
DEPLOYMENT_ID="$(printf '%s' "$DEPLOYMENTS" | jq -r '.[0].id')"
STATUS="$(curl -fsSL -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/stanatny/skyroads/deployments/$DEPLOYMENT_ID/statuses?per_page=10")"
printf '%s' "$STATUS" | jq -e \
  '.[0] | .state == "success" and .environment == "github-pages" and .environment_url == "https://stanatny.github.io/skyroads/"'
```

Then prove the cache-busted public shell is V1.1:

```bash
VERIFY_URL="https://stanatny.github.io/skyroads/?verify=$MERGED_SHA"
HTML="$(curl -fsSL --retry 5 --retry-delay 5 "$VERIFY_URL")"
printf '%s' "$HTML" | grep -Eq '<meta[^>]+name="application-version"[^>]+content="1\.1\.0"'
printf '%s' "$HTML" | grep -F './src/version.js'
printf '%s' "$HTML" | grep -F './src/game.js'
if printf '%s' "$HTML" | grep -Fq '<title>太空跳跳车 SkyRoads</title>'; then exit 1; fi
curl -fsSL "https://stanatny.github.io/skyroads/src/version.js?verify=$MERGED_SHA" | grep -F "1.1.0"
```

Repeat the Task 6 browser matrix on the public cache-busted URL, then on the plain canonical URL after the Pages cache window.

- [ ] **Step 5: Tag and publish only after Pages proof passes**

On the merged `main` commit:

```bash
git fetch origin main
MERGED_SHA="$(git rev-parse origin/main)"
git tag -a v1.1.0 "$MERGED_SHA" -m "Nebula Cruise V1.1"
git push origin v1.1.0
```

Create GitHub Release `星云巡航 V1.1 / Nebula Cruise V1.1` with `docs/releases/v1.1.0.md`. Verify the release workflow succeeds and publishes `Nebula-Cruise-macOS-v1.1.0.zip`; if authentication is unavailable, stop before tag/release mutation and hand the exact commands and release text to the authenticated user.

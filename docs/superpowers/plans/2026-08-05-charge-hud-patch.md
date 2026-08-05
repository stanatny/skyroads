# Charge HUD V1.1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the contextual HUD during tap fire, reduce charged-missile time to 1.5 seconds, and prepare a consistent V1.1.1 patch release.

**Architecture:** Keep pure HUD visibility policy in `src/presentation.js` and keep simulation timing, audio stages, input release, and Canvas ordering in `src/game.js`. Reuse the existing VM integration harnesses to prove visible order and real key-release behavior, then update every canonical version surface from one `1.1.1` contract without changing the V1.1 display badge.

**Tech Stack:** Build-free classic JavaScript, Canvas 2D, Node.js built-in test runner, shell smoke tests, GitHub Pages, macOS WKWebView wrapper.

## Global Constraints

- Start from `origin/main` commit `e1c9583f92213f5e7b2abc96296b22d5f411b7ab`.
- Show the charge HUD only when elapsed charge is at least `0.5` seconds.
- Render contextual status in exact order: BOOST, super form, magnet, missile charge.
- Set full charge to exactly `1.5` seconds.
- Play intermediate charge ticks at one-third and two-thirds progress, then the ready cue at full progress.
- Preserve bullet/missile rules and every unrelated gameplay, input, collision, score, power-up, storage, asset, and audio behavior.
- Use only the public target repository and public open-source sources.
- Canonical product version is `1.1.1`; display remains `V1.1`; macOS bundle build becomes `3`.
- Every commit message ends with exactly one `Co-authored-by: TRAE CLI <noreply@bytedance.com>` trailer.

---

### Task 1: Delayed Charge Visibility and Stable HUD Ordering

**Files:**
- Modify: `tests/presentation.test.js:437`
- Modify: `tests/game-audio-ui.test.js:392`
- Modify: `src/presentation.js:322`
- Modify: `src/game.js:4621`

**Interfaces:**
- Consumes: `hudVisibilityPlan(options)` and existing `renderHUD(ctx)`.
- Produces: `hudVisibilityPlan({ chargeElapsed, chargeRevealDelay, boostActive, superActive, magnetActive })`, returning the existing frozen `{ charge, boost, super, magnet }` shape.

- [ ] **Step 1: Write the failing pure-policy test**

Replace the old boolean charge assertions in `tests/presentation.test.js` with boundary assertions:

```js
test('HUD visibility delays charge until the contextual reveal threshold', () => {
  assert.deepEqual(hudVisibilityPlan({}), {
    charge: false,
    boost: false,
    super: false,
    magnet: false,
  });
  assert.equal(hudVisibilityPlan({
    chargeElapsed: 0.49,
    chargeRevealDelay: 0.5,
  }).charge, false);
  assert.equal(hudVisibilityPlan({
    chargeElapsed: 0.5,
    chargeRevealDelay: 0.5,
  }).charge, true);
  assert.deepEqual(hudVisibilityPlan({
    boostActive: true,
    superActive: true,
    magnetActive: true,
  }), {
    charge: false,
    boost: true,
    super: true,
    magnet: true,
  });
});
```

- [ ] **Step 2: Run the pure-policy test and verify RED**

Run:

```bash
node --test --test-name-pattern='HUD visibility delays charge' tests/presentation.test.js
```

Expected: FAIL because the current function ignores `chargeElapsed` and `chargeRevealDelay`.

- [ ] **Step 3: Write the failing Canvas integration assertions**

Extend the existing `active HUD keeps immediate instruments...` test in `tests/game-audio-ui.test.js`:

```js
  const quickTap = capture({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0.49,
    boostT: 2,
    tripleT: 3,
    magnetT: 4,
    distanceMeters: 321,
    elapsedMs: 4567,
    score: 321,
    speed: 9.4,
  });
  const quickTapText = quickTap.filter((event) => event.type === 'text');
  assert.equal(quickTapText.some((event) => event.text.includes('CHARGING')), false);

  const visibleCharge = capture({
    mode: 'PLAYING',
    fuel: 80,
    jumpsUsed: 0,
    chargeT: 0.5,
    boostT: 2,
    tripleT: 3,
    magnetT: 4,
    distanceMeters: 321,
    elapsedMs: 4567,
    score: 321,
    speed: 9.4,
  });
  const statusY = (fragment) => visibleCharge.find(
    (event) => event.type === 'text' && event.text.includes(fragment),
  ).y;
  assert.ok(statusY('BOOST') < statusY('SUPER'));
  assert.ok(statusY('SUPER') < statusY('MAGNET'));
  assert.ok(statusY('MAGNET') < statusY('CHARGING'));
```

- [ ] **Step 4: Run the Canvas integration test and verify RED**

Run:

```bash
node --test --test-name-pattern='active HUD keeps immediate instruments' tests/game-audio-ui.test.js
```

Expected: FAIL because `chargeT = 0.49` is currently visible and charge is currently rendered before BOOST.

- [ ] **Step 5: Implement the minimal visibility policy**

Change `hudVisibilityPlan()` in `src/presentation.js`:

```js
  function hudVisibilityPlan({
    chargeElapsed = 0,
    chargeRevealDelay = 0.5,
    boostActive = false,
    superActive = false,
    magnetActive = false,
  } = {}) {
    const elapsed = Math.max(0, Number(chargeElapsed) || 0);
    const revealDelay = Math.max(0, Number(chargeRevealDelay) || 0);
    return Object.freeze({
      charge: elapsed > 0 && elapsed >= revealDelay,
      boost: Boolean(boostActive),
      super: Boolean(superActive),
      magnet: Boolean(magnetActive),
    });
  }
```

- [ ] **Step 6: Implement the minimal HUD integration**

In `src/game.js`:

1. Add `CHARGE_HUD_DELAY: 0.5` beside `CHARGE_TIME`.
2. Call the policy with:

```js
    chargeElapsed: STATE.chargeT,
    chargeRevealDelay: CONFIG.CHARGE_HUD_DELAY,
```

3. Render BOOST, super form, and magnet first.
4. Increment `statusY` after magnet when visible.
5. Render the existing charge panel block last without changing its label, ratio, or colors.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='HUD visibility delays charge|active HUD keeps immediate instruments' \
  tests/presentation.test.js tests/game-audio-ui.test.js
```

Expected: PASS with both threshold and bottom-order assertions satisfied.

- [ ] **Step 8: Commit HUD policy and ordering**

```bash
git add src/presentation.js src/game.js tests/presentation.test.js tests/game-audio-ui.test.js
git commit -m "fix: stabilize charged-shot HUD" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 2: Two-Second Charge and Proportional Cues

**Files:**
- Modify: `tests/game-audio-ui.test.js`
- Modify: `src/game.js:169`
- Modify: `README.md:31`
- Modify: `README.zh-CN.md:31`

**Interfaces:**
- Consumes: existing keyboard `keydown`/`keyup`, `updatePhysics(dt)`, `fireBullet()`, and `fireMissile()`.
- Produces: `CONFIG.CHARGE_TIME === 1.5`, proportional `chargeStage` thresholds, and unchanged projectile kinds on release.

- [ ] **Step 1: Write the failing release-boundary test**

Add to `tests/game-audio-ui.test.js`:

```js
test('charged-shot release switches from bullet to missile at one and a half seconds', () => {
  const { sandbox, windowObject } = makeGameUiSandbox();
  vm.runInContext('startGame()', sandbox);
  const releaseAt = (seconds) => {
    vm.runInContext(`
      STATE.shots = [];
      STATE.bulletCD = 0;
      STATE.chargeT = ${seconds};
      STATE.chargeStage = 0;
      KEYS.KeyJ = true;
    `, sandbox);
    windowObject.dispatch('keyup', { code: 'KeyJ' });
    return vm.runInContext('STATE.shots[0] && STATE.shots[0].kind', sandbox);
  };

  assert.equal(releaseAt(1.499), 'bullet');
  assert.equal(releaseAt(1.5), 'missile');
});
```

- [ ] **Step 2: Run the release-boundary test and verify RED**

Run:

```bash
node --test --test-name-pattern='switches from bullet to missile at one and a half seconds' \
  tests/game-audio-ui.test.js
```

Expected: FAIL because the current 1.5-second release is still below `CHARGE_TIME = 3`.

- [ ] **Step 3: Write the failing proportional-cue test**

Add to `tests/game-audio-ui.test.js`:

```js
test('charge cues track half one and one-and-a-half-second progress', () => {
  const { sandbox } = makeGameUiSandbox();
  const result = JSON.parse(vm.runInContext(`(() => {
    const cues = [];
    sfxChargeTick = (stage) => cues.push('tick:' + stage);
    sfxChargeReady = () => cues.push('ready');
    STATE.mode = 'PLAYING';
    STATE.speed = 0;
    STATE.position = 0;
    STATE.track = [{ lanes: Array(CONFIG.LANES).fill(LANE_TYPE.ROAD), enemies: null }];
    STATE.shots = [];
    KEYS.KeyJ = true;
    extendTrack = () => {};
    updateEnemies = () => {};
    advanceShots = () => {};
    checkCollisions = () => {};
    for (const [chargeT, chargeStage] of [
      [CONFIG.CHARGE_TIME / 3 - 0.01, 0],
      [CONFIG.CHARGE_TIME * 2 / 3 - 0.01, 1],
      [CONFIG.CHARGE_TIME - 0.01, 2],
    ]) {
      STATE.chargeT = chargeT;
      STATE.chargeStage = chargeStage;
      updatePhysics(0.02);
    }
    return JSON.stringify({
      chargeTime: CONFIG.CHARGE_TIME,
      chargeT: STATE.chargeT,
      chargeStage: STATE.chargeStage,
      cues,
    });
  })()`, sandbox));

  assert.deepEqual(result, {
    chargeTime: 1.5,
    chargeT: 1.5,
    chargeStage: 3,
    cues: ['tick:1', 'tick:2', 'ready'],
  });
});
```

- [ ] **Step 4: Run the cue test and verify RED**

Run:

```bash
node --test --test-name-pattern='charge cues track one-third' tests/game-audio-ui.test.js
```

Expected: FAIL because the current charge duration is three seconds.

- [ ] **Step 5: Implement the minimal timing change**

In `src/game.js`:

```js
  CHARGE_TIME: 1.5,
```

Replace hardcoded stage thresholds with:

```js
      const firstChargeCue = CONFIG.CHARGE_TIME / 3;
      const secondChargeCue = CONFIG.CHARGE_TIME * 2 / 3;
      const cst = STATE.chargeT >= CONFIG.CHARGE_TIME
        ? 3
        : (STATE.chargeT >= secondChargeCue ? 2 : (STATE.chargeT >= firstChargeCue ? 1 : 0));
```

Update nearby comments from three seconds to the new proportional 1.5-second contract.

- [ ] **Step 6: Update player documentation**

Change the charged-missile control rows in both READMEs:

```md
| Charged missile | Hold `J` for 1.5 seconds, then release | Keyboard only |
```

```md
| 蓄力导弹 | 按住 `J` 1.5 秒后松开 | 仅键盘 |
```

Update the HUD description in both languages to explain that charge appears after a deliberate hold rather than on every tap.

- [ ] **Step 7: Run focused behavior tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='switches from bullet to missile at one and a half seconds|charge cues track half one|active HUD keeps immediate instruments' \
  tests/game-audio-ui.test.js
npm run check
```

Expected: PASS; JavaScript syntax check exits zero.

- [ ] **Step 8: Commit charge timing**

```bash
git add src/game.js tests/game-audio-ui.test.js README.md README.zh-CN.md
git commit -m "fix: shorten charged missile timing" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 3: V1.1.1 Version and Release Contract

**Files:**
- Create: `docs/releases/v1.1.1.md`
- Modify: `tests/release-contracts.test.js`
- Modify: `tests/static-app.test.js`
- Modify: `tests/app-resources-smoke.sh`
- Modify: `tests/app-wkwebview-smoke.sh`
- Modify: `package.json`
- Modify: `src/version.js`
- Modify: `index.html`
- Modify: `app/Info.plist`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

**Interfaces:**
- Consumes: `src/version.js` immutable product-version API and `scripts/check-release-tag.js`.
- Produces: semver `1.1.1`, display `V1.1`, tag `v1.1.1`, bundle build `3`, and archive `Nebula-Cruise-macOS-v1.1.1.zip`.

- [ ] **Step 1: Update release tests first**

In `tests/release-contracts.test.js`, change the metadata contract to:

```js
  assert.equal(packageJson.version, '1.1.1');
  assert.deepEqual(version, {
    semver: '1.1.1', display: 'V1.1', accessible: '1.1', tag: 'v1.1.1',
  });
  assert.match(html, /<meta name="application-version" content="1\.1\.1">/);
  assert.equal(plistString(plist, 'CFBundleShortVersionString'), packageJson.version);
  assert.equal(plistString(plist, 'CFBundleVersion'), '3');
```

Change tag validation examples and README release URLs to `v1.1.1`. Add a V1.1.1 release-note test that requires:

- one Chinese section before one English section;
- the canonical Pages URL;
- `Nebula-Cruise-macOS-v1.1.1.zip`;
- `0.5` seconds, `2` seconds, fixed bottom ordering, and no “already live” claim.

Update `tests/static-app.test.js`, `tests/app-resources-smoke.sh`, and `tests/app-wkwebview-smoke.sh` to expect semver `1.1.1`, tag `v1.1.1`, short version `1.1.1`, and bundle build `3`, while retaining display `V1.1`.

- [ ] **Step 2: Run version tests and verify RED**

Run:

```bash
node --test tests/release-contracts.test.js tests/static-app.test.js
```

Expected: FAIL on old `1.1.0` metadata and the missing `docs/releases/v1.1.1.md`.

- [ ] **Step 3: Update canonical version surfaces**

Apply these exact values:

- `package.json`: `"version": "1.1.1"`
- `src/version.js`: `const semver = '1.1.1';`
- `index.html`: `<meta name="application-version" content="1.1.1">`
- `app/Info.plist`: short version `1.1.1`, bundle version `3`
- README current-version links: `v1.1.1`
- README archive names: `Nebula-Cruise-macOS-v1.1.1.zip`

- [ ] **Step 4: Add bilingual V1.1.1 release notes**

Create `docs/releases/v1.1.1.md` with:

```md
# 星云巡航 V1.1.1 / Nebula Cruise V1.1.1

## 中文

V1.1.1 是一次战斗 HUD 与蓄力节奏补丁：

- 点射 `J` 不再闪现蓄力状态；按住达到 0.5 秒后才显示。
- 蓄力状态固定在 BOOST、超级形态和磁铁状态之后，其他状态不再上下跳动。
- 导弹蓄满时间从 3 秒缩短到 1.5 秒，中间提示音在 0.5 秒和 1.0 秒给出反馈。

在线游玩目标：https://stanatny.github.io/skyroads/

通用 macOS 发布资产目标：`Nebula-Cruise-macOS-v1.1.1.zip`

上线状态仅以合并后的 Pages 与发布工作流验证结果为准。

## English

V1.1.1 is a combat-HUD and charge-pacing patch:

- Tapping `J` no longer flashes the charge status; it appears only after a 0.5-second hold.
- Charge stays below BOOST, super form, and magnet so existing status instruments no longer jump.
- Full missile charge drops from three seconds to one and a half seconds, with intermediate cues at 0.5 and 1.0 seconds.

Canonical web target: https://stanatny.github.io/skyroads/

Universal macOS release asset target: `Nebula-Cruise-macOS-v1.1.1.zip`

Availability is established only by post-merge Pages and release-workflow verification.
```

- [ ] **Step 5: Run release tests and verify GREEN**

Run:

```bash
node --test tests/release-contracts.test.js tests/static-app.test.js
node scripts/check-release-tag.js v1.1.1
npm run check
```

Expected: PASS and exit zero.

- [ ] **Step 6: Commit the patch-version contract**

```bash
git add package.json src/version.js index.html app/Info.plist \
  README.md README.zh-CN.md docs/releases/v1.1.1.md \
  tests/release-contracts.test.js tests/static-app.test.js \
  tests/app-resources-smoke.sh tests/app-wkwebview-smoke.sh
git commit -m "release: prepare v1.1.1" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 4: Integrated Verification and Review Branch

**Files:**
- Verify only; no planned production-file changes.

**Interfaces:**
- Consumes: committed Tasks 1-3.
- Produces: reproducible automated evidence, a browser preview, and a pushed review branch.

- [ ] **Step 1: Run all Linux-compatible Node suites**

Run:

```bash
node --test \
  tests/audio.test.js \
  tests/drone-visual.test.js \
  tests/game-audio-ui.test.js \
  tests/gap-regions.test.js \
  tests/i18n.test.js \
  tests/input.test.js \
  tests/leaderboard.test.js \
  tests/music-generator.test.js \
  tests/obstacle-playability.test.js \
  tests/player-thruster.test.js \
  tests/png-rgba.test.js \
  tests/presentation.test.js \
  tests/release-contracts.test.js \
  tests/scene-style.test.js \
  tests/static-app.test.js \
  tests/world-art.test.js
```

Expected: all selected tests PASS with zero failures.

- [ ] **Step 2: Run syntax and full-suite checks**

Run:

```bash
npm run check
npm test
```

Expected:

- `npm run check`: PASS.
- `npm test` on Linux: only the previously recorded 16 macOS-tool failures caused by unavailable `sips`, `swiftc`, and `afinfo`; no new failure names.

- [ ] **Step 3: Inspect public diff and repository state**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git log --format='%h %s%n%b' origin/main..HEAD
git status --short --branch
git diff --word-diff=porcelain origin/main...HEAD | sed -n '1,240p'
```

Expected: clean worktree, no credential, private-domain, private-address, absolute-workspace-path, or proprietary-source additions, and every commit contains exactly one required co-author trailer.

- [ ] **Step 4: Start the browser preview**

Run:

```bash
python3 -m http.server 8766 --bind 0.0.0
```

Serve from the worktree root and keep the process alive during acceptance.

- [ ] **Step 5: Perform browser acceptance**

Open the machine-reachable URL for port `8766` and verify in English and Chinese. Report that URL in the review thread without committing it to the repository:

1. Repeated quick `J` taps fire bullets and never show a charge panel.
2. While BOOST, super form, or magnet is active, quick taps do not move its status panel.
3. Holding `J` for 0.5 seconds reveals charge below every active power-up status.
4. Releasing before 1.5 seconds fires a bullet.
5. Reaching 1.5 seconds shows ready state; releasing fires a missile.
6. Pause, blur, menu, restart, and game over still clear charge.
7. The command center badge remains `V1.1`; diagnostics report semver `1.1.1`.
8. Browser console has no new error.

- [ ] **Step 6: Push the review branch**

Run:

```bash
git push -u git@github.com:stanatny/skyroads.git fix/v1.1.1-charge-hud
```

Expected: remote branch points at local `HEAD`.

- [ ] **Step 7: Stop before merge/tag/release**

Report the branch, commits, tests, preview URL, known Linux-only test gap, and review URL. Do not merge, tag, or publish until the user accepts the preview and explicitly authorizes release continuation.

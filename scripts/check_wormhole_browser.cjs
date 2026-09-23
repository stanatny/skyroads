'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 使用真实 Chrome 和输入事件；只接管帧时钟，让二段跳与穿洞时机可重复。
let playwright;
try { playwright = require('playwright'); }
catch (_) {
  playwright = require(process.env.SKYROADS_PLAYWRIGHT_MODULE
    || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const previewUrl = process.argv[2] || process.env.SKYROADS_PREVIEW_URL || 'http://127.0.0.1:7101/';
const evidenceDirectory = path.resolve(process.argv[3] || '/tmp/skyroads_wormhole_browser');
const report = { url: previewUrl, checks: [], samples: {}, errors: [] };
fs.mkdirSync(evidenceDirectory, { recursive: true });

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

async function installClock(page) {
  await page.addInitScript(() => {
    let time = performance.now();
    let sequence = 0;
    const callbacks = new Map();
    window.requestAnimationFrame = (callback) => { callbacks.set(++sequence, callback); return sequence; };
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
    window.__wormholeTestClock = {
      get now() { return time; },
      step(milliseconds) {
        time += milliseconds;
        const ready = Array.from(callbacks.values());
        callbacks.clear();
        ready.forEach((callback) => callback(time));
      },
    };
  });
}

async function advance(page, seconds) {
  await page.evaluate((duration) => {
    const frames = Math.max(1, Math.ceil(duration * 60 - 1e-8));
    for (let frame = 0; frame < frames; frame += 1) __wormholeTestClock.step(duration * 1000 / frames);
  }, seconds);
}

async function sample(page) {
  return page.evaluate(() => ({
    mode: STATE.mode,
    deathReason: STATE.deathReason,
    fuel: STATE.fuel,
    position: STATE.position,
    distance: STATE.distanceMeters,
    elapsedMs: STATE.elapsedMs,
    lane: STATE.movement.lanePosition,
    playerY: STATE.playerY,
    groundHeight: STATE.groundHeight,
    shots: STATE.shots.length,
    chargeT: STATE.chargeT,
    fuelBurstChargeT: STATE.fuelBurstChargeT,
    heldKeys: Object.keys(KEYS),
    jumpsUsed: STATE.jumpsUsed,
    timers: { boostT: STATE.boostT, boostGraceT: STATE.boostGraceT, tripleT: STATE.tripleT, magnetT: STATE.magnetT,
      fuelBurstT: STATE.fuelBurstT, fuelBurstGraceT: STATE.fuelBurstGraceT },
    wormhole: JSON.parse(JSON.stringify(STATE.wormhole)),
    flight: Skyroads.diagnostics.snapshot().flight,
  }));
}

async function setupApproach(page, { laneOffset = 0, speed = 24, fuel = 100, leadSeconds = 0.45 } = {}) {
  return page.evaluate((options) => {
    startGame();
    STATE.tutorial = null;
    CONFIG.ACCEL = 0;
    const gate = Skyroads.wormhole.nextGate(0, Skyroads.flightTerrain);
    const lane = gate.lane + options.laneOffset;
    STATE.position = gate.segment - options.speed * options.leadSeconds;
    STATE.distanceMeters = STATE.position * CONFIG.DISTANCE_PER_SEGMENT;
    STATE.speed = options.speed;
    STATE.fuel = options.fuel;
    STATE.boostT = options.speed >= CONFIG.BOOST_SPEED ? 10 : 0;
    STATE.boostPrevSpeed = STATE.boostT > 0 ? options.speed - CONFIG.BOOST_SPEED_BONUS : 0;
    resetMovement(STATE.movement, lane);
    STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, lane);
    STATE.playerY = 0;
    STATE.playerVY = 0;
    STATE.jumpsUsed = 0;
    STATE.wormhole.gate = gate;
    STATE.lastTime = __wormholeTestClock.now;
    extendTrack();
    // 仅清除该段的随机危险和奖励，保留真实高程、跳跃、按键以及虫洞扫掠。
    for (const segment of STATE.track.slice(Math.floor(STATE.position), gate.segment + 20)) {
      segment.lanes.fill('ROAD');
      segment.enemies = [];
    }
    focusPrimarySurface();
    render();
    return gate;
  }, { laneOffset, speed, fuel, leadSeconds });
}

async function doubleJump(page, secondKey = 'k') {
  await page.keyboard.press('Space');
  await advance(page, 14 / 60);
  await page.keyboard.press(secondKey);
  await advance(page, 0.23);
}

async function finishWarp(page) {
  for (let frame = 0; frame < 180; frame += 1) {
    if (!(await page.evaluate(() => STATE.wormhole.active))) return sample(page);
    await advance(page, 1 / 60);
  }
  throw new Error('Warp did not finish within three seconds of simulation time');
}

async function localizedHud(page, locale, phase) {
  await page.evaluate((language) => { applyLocale(language); render(); }, locale);
  const hud = await page.evaluate(() => {
    const node = document.querySelector('.cockpit-wormhole');
    if (!node) throw new Error('Wormhole HUD element was not found');
    const rect = node.getBoundingClientRect();
    return { text: node.innerText, hidden: node.hidden, rect: { x: rect.x, right: rect.right, width: rect.width } };
  });
  assert.equal(hud.hidden, false, `${locale} ${phase} HUD should be visible`);
  if (locale === 'zh-CN') assert.match(hud.text, /虫洞|折跃|异常/);
  else {
    assert.match(hud.text, /warp|wormhole|anomaly|portal/i);
    assert.doesNotMatch(hud.text, /[\u3400-\u9fff]/);
  }
  assert.doesNotMatch(hud.text, /undefined|NaN|wormhole\./);
  report.samples[`${locale}_${phase}`] = hud;
  return hud;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(evidenceDirectory, `${name}.png`) });
}

async function verifyBoostProtection(page, timerField, graceField, label) {
  await setupApproach(page, { leadSeconds: 1 });
  await page.evaluate(({ timerField }) => {
    STATE.wormhole.gate = null;
    STATE.boostT = 0;
    STATE.boostGraceT = 0;
    STATE.fuelBurstT = 0;
    STATE.fuelBurstGraceT = 0;
    STATE[ timerField ] = 0.25;
  }, { timerField });
  // 多走 1ms，避免浮点采样恰好落在到期边界之前；接续保护应恰好剩 1.999s。
  await advance(page, 0.251);
  const naturalExpiry = await sample(page);
  close(naturalExpiry.timers[timerField], 0);
  close(naturalExpiry.timers[graceField], 1.999);
  await page.evaluate(() => {
    STATE.speed = 0;
    STATE.boostPrevSpeed = 0;
    STATE.fuelBurstPrevSpeed = 0;
    resetMovement(STATE.movement, 3);
    STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, 3);
    STATE.playerY = 0;
    STATE.playerVY = 0;
    STATE.track[Math.floor(STATE.position)].lanes[3] = LANE_TYPE.WALL_HIGH;
    render();
  });
  const protectedEntry = await sample(page);
  assert.equal(protectedEntry.flight.statusFx.shield.active, true);
  await screenshot(page, `${label}_protection`);
  await advance(page, naturalExpiry.timers[graceField] - 0.001);
  const stillProtected = await sample(page);
  assert.equal(stillProtected.mode, 'PLAYING');
  close(stillProtected.timers[graceField], 0.001);
  assert.equal(stillProtected.flight.statusFx.shield.active, true);
  await advance(page, 0.002);
  await advance(page, 0.001);
  const expired = await sample(page);
  assert.equal(expired.mode, 'GAMEOVER');
  assert.equal(expired.deathReason, 'wall');
  assert.equal(expired.timers[graceField], 0);
  assert.equal(expired.flight.statusFx.shield.active, false);
  report.samples[`${label}_boundary`] = { naturalExpiry, before: stillProtected, after: expired };
  report.checks.push(`${label} naturally hands off to a visible full two-second shield; a real wall is blocked at 1.999 s and lethal after expiry`);
}

function watchErrors(page, label, errors = report.errors) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => errors.push(`${label}: ${request.failure()?.errorText} ${request.url()}`));
}

async function main() {
  const browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.SKYROADS_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    watchErrors(page, 'http');
    await installClock(page);
    await page.goto(previewUrl);
    await page.waitForFunction(() => Boolean(window.Skyroads?.diagnostics && window.Skyroads?.wormhole), null, { polling: 100 });
    await advance(page, 1 / 60);
    const boot = await page.evaluate(() => Skyroads.diagnostics.snapshot());
    assert.equal(boot.flight.renderer, 'webgl-chase');
    assert.equal(boot.flight.error, null);
    await page.evaluate(() => Skyroads.tutorial.markTutorialSeen(localStorage));
    // force 跳过 Playwright 自身等待 RAF 稳定的步骤；点击仍走真实浏览器输入。
    await page.locator('#start-mission').click({ force: true });
    // 音频 ready 由首次真实手势解锁，不能在开始按钮之前等待它。
    await page.evaluate(() => Promise.race([Skyroads.diagnostics.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Diagnostics readiness timed out')), 15000))]));

    const firstGate = await setupApproach(page, { leadSeconds: 1 });
    assert.ok(firstGate.segment * 10 >= 10000, 'The first opportunity must require at least 10 km of flight');
    close(firstGate.halfWidth, 0.34);
    close(firstGate.halfHeight, 240);
    const aperture = (await sample(page)).flight.wormhole.aperture;
    assert.deepEqual(aperture, { rx: 2.65, ry: 1.65, centerOffsetY: 0.76 });
    report.samples.aperture = aperture;
    report.checks.push('Entry tolerance leaves both the gate definition and rendered aperture unchanged');
    report.samples.firstGate = firstGate;
    await localizedHud(page, 'zh-CN', 'approach');
    await screenshot(page, 'entry_zh');
    await localizedHud(page, 'en', 'approach');
    await screenshot(page, 'entry_en');

    await setupApproach(page);
    await page.keyboard.press('Space');
    await advance(page, 0.5);
    let snapshot = await sample(page);
    assert.equal(snapshot.wormhole.active, false);
    assert.equal(snapshot.wormhole.completedT, 0);
    assert.equal(snapshot.mode, 'PLAYING');
    report.checks.push('A single jump misses the high aperture without a portal collision');

    await setupApproach(page, { laneOffset: 1 });
    await doubleJump(page);
    snapshot = await sample(page);
    assert.equal(snapshot.wormhole.active, false);
    assert.equal(snapshot.wormhole.completedT, 0);
    assert.equal(snapshot.mode, 'PLAYING');
    report.checks.push('A correctly timed double jump on the neighboring lane cannot trigger the reward');

    // 同一近顶点二段跳分别擦过入口边缘内外；只设初始航道，不替代跳跃或穿洞判定。
    await setupApproach(page, { laneOffset: 0.38, leadSeconds: 0.4 });
    await doubleJump(page);
    const grazingEntry = await sample(page);
    assert.equal(grazingEntry.wormhole.active, true);
    assert.equal(grazingEntry.mode, 'PLAYING');
    assert.equal(grazingEntry.jumpsUsed, 2);
    assert.ok(Math.abs(grazingEntry.lane - firstGate.lane) > firstGate.halfWidth,
      'The near-edge entry must lie outside the former 0.34-lane capture width');
    report.samples.grazingEntry = grazingEntry;
    await screenshot(page, 'grazing_entry');
    report.checks.push('Real Space then K input at a 0.38-lane offset enters through the added edge tolerance');

    await setupApproach(page, { laneOffset: 0.46, leadSeconds: 0.4 });
    await doubleJump(page);
    const outsideEntry = await sample(page);
    assert.equal(outsideEntry.wormhole.active, false);
    assert.equal(outsideEntry.wormhole.completedT, 0);
    assert.equal(outsideEntry.mode, 'PLAYING');
    assert.equal(outsideEntry.jumpsUsed, 2);
    assert.ok(outsideEntry.position > firstGate.segment);
    report.samples.outsideEntry = outsideEntry;
    report.checks.push('The same real double jump at a 0.46-lane offset still misses beyond the enlarged capture boundary');

    await setupApproach(page);
    await page.keyboard.press('Space');
    await advance(page, 0.05);
    await page.keyboard.press('k');
    await advance(page, 0.45);
    snapshot = await sample(page);
    assert.equal(snapshot.wormhole.active, false);
    assert.equal(snapshot.wormhole.completedT, 0);
    assert.equal(snapshot.mode, 'PLAYING');
    report.checks.push('An immediate 50 ms double tap is too low; the near-apex second jump remains a deliberate challenge');

    await setupApproach(page);
    await page.keyboard.down('j');
    await doubleJump(page);
    const entry = await sample(page);
    assert.equal(entry.wormhole.active, true);
    assert.equal(entry.mode, 'PLAYING');
    assert.deepEqual(entry.heldKeys, []);
    assert.equal(entry.chargeT, 0);
    await page.keyboard.up('j');
    assert.equal((await sample(page)).shots, 0);
    report.samples.entry = entry;
    report.checks.push('Real Space then K input legitimately enters the smaller portal from the high terrace');

    // 先真实跳入，再将余量调至临界值，专门检查演出内的零耗油不变量。
    await page.evaluate(() => {
      STATE.fuel = 0.02;
      STATE.boostT = 3;
      STATE.boostGraceT = 0.7;
      STATE.tripleT = 8;
      STATE.magnetT = 4;
      STATE.fuelBurstT = 2;
      STATE.fuelBurstGraceT = 1.1;
    });
    const protectedEntry = await sample(page);
    await page.keyboard.press('Space');
    await page.keyboard.down('w');
    await page.keyboard.down('j');
    await advance(page, 0.65);
    const tunnel = await sample(page);
    assert.equal(tunnel.wormhole.active, true);
    assert.equal(tunnel.mode, 'PLAYING');
    close(tunnel.fuel, 0.02);
    assert.deepEqual(tunnel.timers, protectedEntry.timers);
    assert.equal(tunnel.shots, 0);
    assert.equal(tunnel.chargeT, 0);
    assert.equal(tunnel.fuelBurstChargeT, 0);
    assert.equal(tunnel.jumpsUsed, protectedEntry.jumpsUsed);
    await localizedHud(page, 'en', 'active');
    await screenshot(page, 'tunnel_en');
    await localizedHud(page, 'zh-CN', 'active');
    await screenshot(page, 'tunnel_zh');
    report.samples.tunnel = tunnel;
    report.checks.push('Warp at 0.02 fuel ignores jump, charge and shooting attempts and freezes energy and reward timers');

    await page.keyboard.press('p');
    const pause = await sample(page);
    assert.equal(pause.mode, 'PAUSED');
    await advance(page, 0.75);
    const paused = await sample(page);
    close(paused.wormhole.elapsed, pause.wormhole.elapsed);
    close(paused.fuel, pause.fuel);
    close(paused.elapsedMs, pause.elapsedMs);
    await page.keyboard.press('p');
    await advance(page, 0);
    const beforeBlur = await sample(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await advance(page, 0.5);
    const blurred = await sample(page);
    close(blurred.wormhole.elapsed, beforeBlur.wormhole.elapsed);
    close(blurred.fuel, beforeBlur.fuel);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    if (blurred.mode === 'PAUSED') await page.keyboard.press('p');
    await advance(page, 0);
    report.checks.push('Pause and focus loss freeze an active warp without consuming fuel or elapsed race time');

    const beforeExit = await sample(page);
    await advance(page, Math.max(0, 2.15 - beforeExit.wormhole.elapsed));
    await screenshot(page, 'exit_wave');
    const completed = await finishWarp(page);
    assert.equal(completed.mode, 'PLAYING');
    assert.equal(completed.wormhole.active, false);
    assert.ok(completed.wormhole.completedT > 0);
    close(completed.wormhole.graceT, 2);
    const nextGateFlight = (completed.wormhole.gate.segment - completed.position) * 10;
    assert.ok(nextGateFlight >= 8400 && nextGateFlight <= 10800,
      'A successful warp must still leave 8.4–10.8 km of flight before the next gate');
    close(completed.fuel, 0.02);
    close(completed.distance - entry.distance, 6000);
    close(completed.position - entry.position, 600);
    close(completed.lane, 3);
    close(completed.playerY, 0);
    assert.deepEqual(completed.timers, protectedEntry.timers);
    assert.deepEqual(completed.heldKeys, []);
    const repeatsIgnored = await page.evaluate(() => {
      const snapshot = () => JSON.stringify({ keys: KEYS, movement: STATE.movement,
        jumpsUsed: STATE.jumpsUsed, playerVY: STATE.playerVY, chargeT: STATE.chargeT,
        fuelBurstChargeT: STATE.fuelBurstChargeT, fuel: STATE.fuel, shots: STATE.shots });
      const before = snapshot();
      for (const [code, key] of [['Space', ' '], ['KeyK', 'k'], ['KeyW', 'w'], ['KeyJ', 'j'], ['KeyD', 'd']]) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key, repeat: true, bubbles: true }));
      }
      return before === snapshot();
    });
    assert.equal(repeatsIgnored, true);
    await page.keyboard.up('j');
    await page.keyboard.up('w');
    assert.equal((await sample(page)).shots, 0);
    report.checks.push('Held entry and tunnel inputs are cleared; repeated keydown after exit cannot jump, steer, charge or fire');
    const safeExit = await page.evaluate(() => {
      const lane = Math.round(STATE.movement.lanePosition);
      const from = Math.floor(STATE.position);
      const safeSegments = Skyroads.wormhole.TUNING.safeExitMeters / CONFIG.DISTANCE_PER_SEGMENT;
      return STATE.track.slice(from, from + safeSegments).every((segment) => {
        const type = segment.lanes[lane];
        return type !== 'GAP' && !type.startsWith('WALL_')
          && !(segment.enemies || []).some((enemy) => Math.abs(enemy.lane - lane) < 0.6);
      });
    });
    assert.equal(safeExit, true);
    await localizedHud(page, 'zh-CN', 'completed');
    await screenshot(page, 'completed_zh');
    await localizedHud(page, 'en', 'completed');
    await screenshot(page, 'completed_en');
    report.samples.completed = completed;
    report.checks.push('Exit grants exactly 6,000 m once, remains alive at 0.02 fuel, centers the ship and provides a protected safe runway');

    // 演出结束后恢复正常耗油；补足测试燃料再验证没有重复结算。
    await page.evaluate(() => { STATE.fuel = 100; });
    await advance(page, 0.1);
    const after = await sample(page);
    assert.ok(after.distance > completed.distance && after.distance - completed.distance < 40);
    close(after.fuel, 100);
    assert.ok(after.wormhole.graceT > 0 && after.wormhole.graceT < completed.wormhole.graceT);
    await advance(page, 2);
    const afterProtection = await sample(page);
    assert.ok(afterProtection.fuel < 100);
    assert.equal(afterProtection.wormhole.graceT, 0);
    report.checks.push('Normal movement resumes without a second reward; fuel drain resumes after exit protection');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => STATE.reducedMotion === true, null, { polling: 50 });
    await setupApproach(page);
    await doubleJump(page);
    await advance(page, 0.6);
    const narrow = await sample(page);
    assert.equal(narrow.wormhole.active, true);
    const narrowEnglish = await localizedHud(page, 'en', 'mobile_active');
    assert.ok(narrowEnglish.rect.x >= -1 && narrowEnglish.rect.right <= 391);
    await screenshot(page, 'mobile_reduced_en');
    await localizedHud(page, 'zh-CN', 'mobile_active');
    await screenshot(page, 'mobile_reduced_zh');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (narrow.flight.wormhole) {
      report.samples.reducedMotion = narrow.flight.wormhole;
      if ('fovOffset' in narrow.flight.wormhole) close(narrow.flight.wormhole.fovOffset, 0);
    }
    const narrowFinish = await finishWarp(page);
    assert.equal(narrowFinish.mode, 'PLAYING');
    report.checks.push('English and Chinese HUD stay inside 390 px; reduced motion preserves the same playable reward');

    // 固定在出口高墙内，关掉其他无敌来源，只验证虫洞保护自身的完整两秒边界。
    await page.evaluate(() => {
      STATE.boostT = 0;
      STATE.boostGraceT = 0;
      STATE.fuelBurstT = 0;
      STATE.fuelBurstGraceT = 0;
      STATE.tripleT = 0;
      STATE.magnetT = 0;
      STATE.speed = 0;
      STATE.fuel = 100;
      STATE.track[Math.floor(STATE.position)].lanes[3] = LANE_TYPE.WALL_HIGH;
      render();
    });
    const protectionStart = await sample(page);
    close(protectionStart.wormhole.graceT, 2);
    assert.equal(protectionStart.flight.statusFx.shield.active, true);
    await advance(page, 1.999);
    const protectedWall = await sample(page);
    assert.equal(protectedWall.mode, 'PLAYING');
    assert.ok(protectedWall.wormhole.graceT > 0 && protectedWall.wormhole.graceT <= 0.001001);
    assert.equal(protectedWall.flight.statusFx.shield.active, true);
    await advance(page, 0.002);
    await advance(page, 0.001);
    const afterWall = await sample(page);
    assert.equal(afterWall.wormhole.graceT, 0);
    assert.equal(afterWall.mode, 'GAMEOVER');
    assert.equal(afterWall.deathReason, 'wall');
    assert.equal(afterWall.flight.statusFx.shield.active, false);
    report.samples.protectionBoundary = { before: protectedWall, after: afterWall };
    report.checks.push('The shield remains visible and blocks an actual wall at 1.999 s after exit, then expires after the full two seconds');

    await verifyBoostProtection(page, 'boostT', 'boostGraceT', 'boost');
    await verifyBoostProtection(page, 'fuelBurstT', 'fuelBurstGraceT', 'fuel_burst');

    const fallbackPage = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
    watchErrors(fallbackPage, 'context-loss');
    await installClock(fallbackPage);
    await fallbackPage.goto(previewUrl);
    await fallbackPage.waitForFunction(() => Boolean(window.Skyroads?.wormhole && window.Skyroads?.diagnostics), null, { polling: 100 });
    await advance(fallbackPage, 1 / 60);
    await fallbackPage.evaluate(() => Skyroads.tutorial.markTutorialSeen(localStorage));
    await fallbackPage.locator('#start-mission').click({ force: true });
    await setupApproach(fallbackPage);
    await doubleJump(fallbackPage);
    const fallbackEntry = await sample(fallbackPage);
    assert.equal(fallbackEntry.wormhole.active, true);
    await fallbackPage.evaluate(() => { STATE.fuel = 0.02; });
    await advance(fallbackPage, 0.65);
    const extensionAvailable = await fallbackPage.evaluate(() => {
      const canvas = document.getElementById('flight-scene');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const extension = gl && gl.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      return true;
    });
    assert.equal(extensionAvailable, true, 'Real Chrome should expose context loss testing');
    await fallbackPage.waitForFunction(() => Skyroads.diagnostics.snapshot().flight.renderer === 'classic', null, { polling: 50 });
    await fallbackPage.evaluate(() => {
      const original = STATE.ctx.fillText;
      window.__wormholeCanvasText = [];
      STATE.ctx.fillText = function (text, ...args) {
        __wormholeCanvasText.push(String(text));
        return original.call(this, text, ...args);
      };
    });
    for (const locale of ['en', 'zh-CN']) {
      const labels = await fallbackPage.evaluate((language) => {
        applyLocale(language);
        __wormholeCanvasText = [];
        render();
        return __wormholeCanvasText;
      }, locale);
      assert.ok(labels.includes(locale === 'en' ? 'IN TRANSIT' : '时空穿梭'));
      assert.ok(labels.includes(locale === 'en' ? 'NO DRAIN · POWER-UP TIMERS PAUSED' : '能量零消耗 · 增益计时暂停'));
      report.samples[`fallback_${locale}`] = labels;
      await screenshot(fallbackPage, `fallback_${locale}`);
    }
    const fallbackEnd = await finishWarp(fallbackPage);
    assert.equal(fallbackEnd.mode, 'PLAYING');
    assert.equal(fallbackEnd.flight.renderer, 'classic');
    close(fallbackEnd.fuel, 0.02);
    close(fallbackEnd.distance - fallbackEntry.distance, 6000);
    assert.equal(fallbackEnd.wormhole.completedCount, 1);
    assert.equal(fallbackEnd.wormhole.gate, null);
    close(fallbackEnd.playerY, 0);
    close(fallbackEnd.groundHeight, 0);
    await advance(fallbackPage, 0.1);
    const fallbackContinued = await sample(fallbackPage);
    assert.equal(fallbackContinued.mode, 'PLAYING');
    assert.equal(fallbackContinued.wormhole.completedCount, 1);
    assert.ok(fallbackContinued.distance - fallbackEnd.distance < 40);
    report.samples.fallbackCompleted = fallbackEnd;
    report.checks.push('Actual GPU context loss during warp falls back to localized Canvas and completes 6,000 m once without draining 0.02 fuel');
    // 从另一次真实入洞与 GPU 失败返回菜单，不能被残留 active 标记截断背景绘制。
    await fallbackPage.reload();
    await fallbackPage.waitForFunction(() => Boolean(window.Skyroads?.wormhole && window.Skyroads?.diagnostics), null, { polling: 100 });
    await fallbackPage.locator('#start-mission').click({ force: true });
    await setupApproach(fallbackPage);
    await doubleJump(fallbackPage);
    assert.equal((await sample(fallbackPage)).wormhole.active, true);
    await fallbackPage.evaluate(() => document.getElementById('flight-scene').getContext('webgl2')
      .getExtension('WEBGL_lose_context').loseContext());
    await fallbackPage.waitForFunction(() => Skyroads.diagnostics.snapshot().flight.renderer === 'classic', null, { polling: 50 });
    const menuFallback = await fallbackPage.evaluate(() => {
      const original = renderMenu;
      let paints = 0;
      renderMenu = function (ctx) { paints += 1; return original(ctx); };
      gotoMenu(); render();
      const result = { mode: STATE.mode, paints };
      startGame();
      result.restarted = !STATE.wormhole.active && STATE.wormhole.completedCount === 0 && STATE.distanceMeters === 0;
      gotoMenu(); render();
      return result;
    });
    assert.equal(menuFallback.mode, 'MENU');
    assert.ok(menuFallback.paints > 0);
    assert.equal(menuFallback.restarted, true);
    await screenshot(fallbackPage, 'fallback_menu');
    report.samples.fallbackMenu = menuFallback;
    report.checks.push('Returning to the classic menu during a real GPU-fallback warp repaints its background and restart clears the unfinished reward');
    await fallbackPage.close();

    if (process.env.SKYROADS_CHECK_FILE === '1') {
      const filePage = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
      report.fileErrors = [];
      watchErrors(filePage, 'file', report.fileErrors);
      await installClock(filePage);
      await filePage.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await filePage.waitForFunction(() => Boolean(window.Skyroads?.wormhole && window.Skyroads?.diagnostics), null, { polling: 100 });
      await advance(filePage, 1 / 60);
      report.samples.file = await filePage.evaluate(() => Skyroads.diagnostics.snapshot());
      assert.equal(report.samples.file.initialized, true);
      // 已在未修改的 main 工作区复现同样三个 CSS 图标 CORS，单独记录，不能宣称全环境零错误。
      assert.ok(report.fileErrors.every((error) => /assets\/icons\/(translate|speaker-high|trophy)\.svg|Failed to load resource: net::ERR_FAILED/.test(error)),
        'Direct-file smoke produced an error outside the known baseline icon limitation');
      report.fileStatus = report.fileErrors.length ? 'initialized_with_baseline_icon_cors' : 'initialized';
      report.checks.push('Optional direct-file launch initializes; known baseline SVG icon CORS errors are recorded separately');
      await filePage.close();
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ checks: report.checks, errors: report.errors,
      fileStatus: report.fileStatus, fileErrors: report.fileErrors, evidenceDirectory }, null, 2));
  } finally {
    fs.writeFileSync(path.join(evidenceDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

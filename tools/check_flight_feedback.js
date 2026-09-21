'use strict';

// 定点场景验收：保留真实按键、物理与死亡入口，仅清空起点并放置测试障碍。
// 用法与 check_cockpit_browser.js 相同，FEEDBACK_ARTIFACTS 可指定截图和录像帧目录。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:7101';
const output = process.env.FEEDBACK_ARTIFACTS || '/tmp/skyroads_feedback_evidence';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const report = { url, checks: [], samples: {}, errors: [], failures: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /Shader Error|THREE.WebGLProgram/.test(message.text())) report.errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) report.failures.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight.statusFx);
    await page.evaluate(() => document.fonts.ready.then(() => Skyroads.tutorial.markTutorialSeen(localStorage)));
    const clearStart = () => page.evaluate(() => STATE.track.slice(0, 260).forEach((segment) => {
      segment.lanes.fill('ROAD'); segment.enemies = [];
    }));
    const sample = () => page.evaluate(() => {
      const shield = document.querySelector('[data-effect="shield"]');
      const result = document.getElementById('game-over-screen').getBoundingClientRect();
      return { stamp: (performance.timeOrigin + performance.now()) / 1000,
        mode: STATE.mode, reason: STATE.deathReason, position: STATE.position,
        time: STATE.time, gliding: STATE.gliding, grace: STATE.fuelBurstGraceT, flight: Skyroads.diagnostics.snapshot().flight,
        shieldText: shield.textContent, shieldHidden: shield.hidden,
        result: { x: result.x, y: result.y, width: result.width, height: result.height } };
    });
    const cdp = await context.newCDPSession(page);
    const frames = [];
    cdp.on('Page.screencastFrame', async (event) => {
      const file = `frame_${String(frames.length).padStart(5, '0')}.jpg`;
      fs.writeFileSync(path.join(output, file), Buffer.from(event.data, 'base64'));
      frames.push({ file, time: event.metadata.timestamp });
      await cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });
    await page.click('#start-mission');
    await clearStart();
    await page.evaluate(() => {
      globalThis.__shieldAudit = { frames: 0, glideFrames: 0, mismatches: [], running: true };
      const check = () => {
        const audit = globalThis.__shieldAudit;
        if (!audit.running) return;
        if (STATE.mode === 'PLAYING') {
          const expected = STATE.boostT > 0 || STATE.fuelBurstT > 0 || STATE.fuelBurstGraceT > 0;
          const actual = Skyroads.diagnostics.snapshot().flight.statusFx.shield.active;
          const hud = !document.querySelector('[data-effect="shield"]').hidden;
          audit.frames += 1;
          if (STATE.gliding && STATE.fuel > 0 && !STATE.boostT && !STATE.fuelBurstT) {
            audit.glideFrames += 1;
            const mode = Skyroads.diagnostics.snapshot().flight.ship.propulsion.mode;
            if (mode !== 'glide') audit.mismatches.push({ gliding: true, mode });
          }
          if ((actual !== expected || hud !== expected) && audit.mismatches.length < 20) {
            audit.mismatches.push({ expected, actual, hud, burst: STATE.fuelBurstT, grace: STATE.fuelBurstGraceT });
          }
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
    report.samples.cruise = await sample();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => STATE.gliding);
    await page.waitForFunction(() => globalThis.__shieldAudit.glideFrames >= 4 && STATE.gliding);
    report.samples.glide = await sample();
    assert.equal(report.samples.glide.flight.ship.propulsion.mode, 'glide');
    assert.ok(report.samples.glide.flight.ship.propulsion.plumeLength > report.samples.cruise.flight.ship.propulsion.plumeLength * 1.5);
    await page.waitForFunction(() => STATE.playerY === 0 && !STATE.gliding);
    await page.keyboard.up('Space');
    assert.equal((await sample()).flight.ship.propulsion.mode, 'cruise');
    report.checks.push('Holding jump enters glide with continuous stronger exhaust; landing restores cruise thrust');
    await page.keyboard.down('w');
    await page.waitForFunction(() => STATE.fuelBurstT > 0);
    await page.keyboard.up('w');
    report.samples.burst = await sample();
    assert.equal(report.samples.burst.flight.statusFx.shield.active, true);
    assert.equal(report.samples.burst.shieldHidden, false);
    await page.waitForFunction(() => STATE.fuelBurstGraceT > 0);
    report.samples.shield = await sample();
    assert.equal(report.samples.shield.flight.statusFx.shield.active, true);
    assert.equal(report.samples.shield.shieldHidden, false);
    assert.match(report.samples.shield.shieldText, /无敌保护/);
    await page.keyboard.press('p');
    const paused = await sample();
    await page.waitForTimeout(220);
    const held = await sample();
    assert.equal(held.time, paused.time);
    assert.deepEqual(held.flight.statusFx, paused.flight.statusFx);
    await page.keyboard.press('p');
    // 在保护窗口内实际穿过一段墙，确认特效表达的是现有真实保护。
    const protectedWall = await page.evaluate(() => {
      const index = Math.floor(STATE.position) + 1;
      STATE.track[index].lanes.fill('WALL_HIGH');
      return index;
    });
    await page.waitForFunction((index) => STATE.position > index + 1 || STATE.mode === 'GAMEOVER', protectedWall);
    assert.equal((await sample()).mode, 'PLAYING');
    await page.waitForFunction(() => STATE.fuelBurstGraceT === 0);
    report.samples.expired = await sample();
    assert.equal(report.samples.expired.flight.statusFx.shield.active, false);
    assert.equal(report.samples.expired.shieldHidden, true);
    report.protectionAudit = await page.evaluate(() => {
      globalThis.__shieldAudit.running = false;
      return globalThis.__shieldAudit;
    });
    assert.ok(report.protectionAudit.frames > 30);
    assert.ok(report.protectionAudit.glideFrames > 5);
    assert.deepEqual(report.protectionAudit.mismatches, []);
    report.checks.push('Real W burst has a shield from activation through grace, with no frame gaps; paused freeze, protected wall passage and exact expiry');
    await page.evaluate(() => STATE.track[Math.floor(STATE.position) + 2].lanes.fill('WALL_HIGH'));
    await page.waitForFunction(() => STATE.mode === 'GAMEOVER');
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight.statusFx.explosion.age >= 0.18);
    report.samples.wall = await sample();
    assert.equal(report.samples.wall.reason, 'wall');
    assert.equal(report.samples.wall.flight.statusFx.explosion.active, true);
    assert.equal(report.samples.wall.flight.ship.visible, false);
    await page.waitForFunction(() => !Skyroads.diagnostics.snapshot().flight.statusFx.explosion.active);
    const settled = await sample();
    assert.equal(settled.flight.statusFx.explosion.triggerCount, report.samples.wall.flight.statusFx.explosion.triggerCount);
    report.checks.push('Real wall collision explodes once at the ship, continues during GAMEOVER and settles');
    await cdp.send('Page.stopScreencast');
    for (const name of ['cruise', 'glide', 'burst', 'shield', 'wall']) {
      const stamp = report.samples[name].stamp;
      const frame = frames.reduce((a, b) => Math.abs(b.time - stamp) < Math.abs(a.time - stamp) ? b : a);
      fs.copyFileSync(path.join(output, frame.file), path.join(output, `${name}.jpg`));
    }
    fs.writeFileSync(path.join(output, 'frames.ffconcat'), 'ffconcat version 1.0\n' + frames.map((frame, i) =>
      `file '${frame.file}'\nduration ${Math.max(0.01, Math.min(0.3, (frames[i + 1]?.time ?? frame.time + 0.05) - frame.time))}\n`).join(''));
    await page.click('#restart-mission');
    await clearStart();
    assert.equal((await sample()).flight.statusFx.explosion.active, false);
    await page.evaluate(() => {
      const first = Math.floor(STATE.position) + 2;
      for (let index = first; index < first + 4; index += 1) STATE.track[index].lanes.fill('GAP');
    });
    await page.waitForFunction(() => STATE.mode === 'GAMEOVER');
    report.samples.gap = await sample();
    assert.equal(report.samples.gap.reason, 'gap');
    assert.equal(report.samples.gap.flight.statusFx.explosion.active, true);
    await page.click('#return-menu');
    await page.waitForFunction(() => STATE.mode === 'MENU' && !Skyroads.diagnostics.snapshot().flight.statusFx.explosion.active);
    report.checks.push('Restart clears debris; real gap death triggers an explosion; menu clears it');
    await page.click('#start-mission');
    await clearStart();
    await page.evaluate(() => STATE.track[Math.floor(STATE.position) + 2].lanes[3] = 'BOOST');
    await page.waitForFunction(() => STATE.boostT > 0);
    report.samples.pickupBoost = await sample();
    assert.equal(report.samples.pickupBoost.flight.statusFx.shield.active, true);
    assert.equal(report.samples.pickupBoost.shieldHidden, false);
    await page.waitForFunction(() => STATE.boostT === 0);
    report.samples.pickupExpired = await sample();
    assert.equal(report.samples.pickupExpired.flight.statusFx.shield.active, false);
    assert.equal(report.samples.pickupExpired.shieldHidden, true);
    report.checks.push('Collected BOOST pickup shows the same shield throughout its invincible timer and clears at expiry');
    await page.evaluate(() => die('fuel'));
    await page.click('#return-menu');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#start-mission');
    await clearStart();
    await page.keyboard.down('w');
    await page.waitForFunction(() => STATE.fuelBurstT > 0);
    await page.keyboard.up('w');
    await page.waitForFunction(() => STATE.fuelBurstGraceT > 0);
    await page.keyboard.press('p');
    await page.setViewportSize({ width: 390, height: 844 });
    report.samples.reduced = await sample();
    assert.equal(report.samples.reduced.flight.statusFx.shield.active, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, 'shield_reduced_mobile.png') });
    await page.keyboard.press('p');
    await page.waitForFunction(() => STATE.fuelBurstGraceT === 0);
    await page.evaluate(() => STATE.track[Math.floor(STATE.position) + 2].lanes.fill('WALL_HIGH'));
    await page.waitForFunction(() => STATE.mode === 'GAMEOVER');
    report.samples.reducedDeath = await sample();
    assert.equal(report.samples.reducedDeath.flight.statusFx.explosion.active, true);
    await page.waitForFunction(() => !Skyroads.diagnostics.snapshot().flight.statusFx.explosion.active);
    report.checks.push('Reduced motion and narrow viewport preserve shield meaning and finite death feedback');
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failures, []);
    report.frames = frames.length;
    console.log(JSON.stringify({ checks: report.checks, errors: report.errors, failures: report.failures }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

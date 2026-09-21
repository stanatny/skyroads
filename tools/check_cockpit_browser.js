'use strict';

// 真实浏览器验收；Playwright 可从现有工具环境注入，无须改变游戏的零构建入口。
// 用法：PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/check_cockpit_browser.js http://127.0.0.1:7101
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.argv[2] || 'http://127.0.0.1:7101';
const artifactDirectory = process.env.COCKPIT_ARTIFACTS || '/tmp/skyroads_cockpit_evidence';

(async () => {
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const failures = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Shader Error|THREE\.WebGLProgram/.test(message.text())) {
      errors.push(message.text().slice(0, 600));
    }
  });
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  const report = { url: baseUrl, checks: [], screenshots: [], errors, failures };
  async function screenshot(name) {
    await page.screenshot({ path: path.join(artifactDirectory, `${name}.png`) });
    report.screenshots.push(name);
  }
  const state = () => page.evaluate(() => ({ mode: STATE.mode, lane: STATE.movement.lanePosition,
    altitude: STATE.playerY, groundHeight: STATE.groundHeight || 0, position: STATE.position, fuel: STATE.fuel, charge: STATE.chargeT,
    shots: STATE.shots.length, time: STATE.time, flight: Skyroads.diagnostics.snapshot().flight }));

  try {
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => Skyroads.diagnostics && document.documentElement.dataset.renderer === 'cockpit');
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().visualAssets !== null);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await screenshot('menu_en');
    report.checks.push('HTTP load and real WebGL chase view');

    // 清空起跑段仅用于输入测试，避免随机障碍在蓄力断言之前终止任务。
    await page.evaluate(() => Skyroads.tutorial.markTutorialSeen(localStorage));
    await page.click('#start-mission');
    await page.waitForFunction(() => STATE.mode === 'PLAYING');
    await page.evaluate(() => STATE.track.slice(0, 100).forEach((segment) => {
      segment.lanes.fill('ROAD'); segment.enemies = [];
    }));
    await page.keyboard.down('d');
    await page.waitForFunction(() => STATE.movement.lanePosition > 3.35);
    await page.keyboard.up('d');
    const moved = await state();
    assert.ok(moved.lane > 3.35);
    assert.ok(Math.abs(moved.flight.camera.x - (moved.lane - 3) * 3.4) < 0.001);
    assert.ok(Math.abs(moved.flight.ship.position.x - moved.flight.camera.x) < 0.001);
    assert.ok(Math.abs(moved.flight.shipScreen.x - 0.5) < 0.001);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => STATE.playerY > 100);
    await page.keyboard.up('Space');
    const jumped = await state();
    assert.ok(jumped.altitude > 0);
    const eyeHeight = await page.evaluate(() => Skyroads.flightRenderer.WORLD.eyeHeight);
    assert.ok(Math.abs(jumped.flight.camera.y - eyeHeight - (jumped.groundHeight + jumped.altitude) / 300) < 0.001);
    assert.ok(Math.abs(jumped.flight.ship.position.y - (jumped.groundHeight + jumped.altitude) / 300) < 0.001);
    assert.ok(Math.abs(jumped.flight.shipScreen.x - moved.flight.shipScreen.x) < 0.001);
    assert.ok(Math.abs(jumped.flight.shipScreen.y - moved.flight.shipScreen.y) < 0.002);
    await page.keyboard.down('j');
    await page.waitForFunction(() => STATE.chargeT > 0.1);
    await page.keyboard.up('j');
    await page.waitForFunction(() => STATE.shots.length > 0);
    report.checks.push('Real steering, jump and shooting; camera and ship share physical position and keep the ship screen anchor');

    await page.keyboard.down('j');
    await page.waitForFunction(() => STATE.chargeT >= CONFIG.CHARGE_TIME);
    await page.keyboard.up('j');
    await page.waitForFunction(() => STATE.shots.some((shot) => shot.kind === 'missile'));
    await page.keyboard.down('w');
    await page.waitForFunction(() => STATE.fuelBurstT > 0);
    await page.keyboard.up('w');
    await screenshot('flight_en');
    report.checks.push('Charged missile and fuel burst');

    await page.keyboard.press('p');
    await page.waitForFunction(() => STATE.mode === 'PAUSED');
    const paused = await state();
    // 真实经过一段时间后比较，检查暂停期间没有继续推进物理时钟。
    await page.waitForTimeout(240);
    const stillPaused = await state();
    assert.equal(stillPaused.position, paused.position);
    assert.equal(stillPaused.time, paused.time);
    await page.setViewportSize({ width: 960, height: 600 });
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight.width === 960);
    await screenshot('paused_960');
    await page.keyboard.press('p');
    await page.waitForFunction(() => STATE.mode === 'PLAYING' && STATE.position > 0);
    report.checks.push('Pause freezes simulation, paused resize redraws, resume');

    // 使用正常死亡入口构造结算，检验原有排行榜和重开动作。
    await page.evaluate(() => die('fuel'));
    await page.waitForFunction(() => STATE.mode === 'GAMEOVER');
    await page.click('#restart-mission');
    await page.waitForFunction(() => STATE.mode === 'PLAYING' && STATE.position < 3);
    await page.evaluate(() => die('wall'));
    await page.click('#return-menu');
    await page.waitForFunction(() => STATE.mode === 'MENU');
    await page.click('#language-toggle');
    await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    await page.setViewportSize({ width: 1440, height: 900 });
    await screenshot('menu_zh');
    await page.click('#open-leaderboard');
    assert.equal(await page.locator('#leaderboard-dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#leaderboard-dialog').isVisible(), false);
    report.checks.push('Game over, restart, return to menu, Chinese, local leaderboard');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => STATE.reducedMotion);
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot('menu_390');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.click('#start-tutorial');
    await page.waitForFunction(() => STATE.tutorial.active);
    assert.equal(await page.locator('.cockpit-tutorial').isVisible(), true);
    await screenshot('tutorial_390');
    report.checks.push('Narrow viewport, reduced motion, DOM tutorial');
    report.performance = (await state()).flight;

    await page.evaluate(() => {
      const gl = document.getElementById('flight-scene').getContext('webgl2');
      gl.getExtension('WEBGL_lose_context').loseContext();
    });
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'classic');
    assert.equal(await page.locator('#renderer-notice').isVisible(), true);
    assert.equal(await page.evaluate(() => STATE.mode), 'PLAYING');
    assert.equal(await page.evaluate(() => STATE.terrainEnabled), false);
    assert.equal(await page.evaluate(() => STATE.groundHeight), 0);
    report.checks.push('Live WebGL context loss preserves playable compatibility fallback');

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'cockpit');
    await page.click('#start-mission');
    await page.keyboard.press('p');
    await page.waitForFunction(() => STATE.mode === 'PAUSED');
    await page.evaluate(() => document.getElementById('flight-scene').getContext('webgl2')
      .getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'classic');
    const pausedFallback = await page.evaluate(() => ({ mode: STATE.mode,
      alpha: STATE.ctx.getImageData(Math.floor(STATE.width / 2), Math.floor(STATE.height / 2), 1, 1).data[3] }));
    assert.equal(pausedFallback.mode, 'PAUSED');
    assert.equal(pausedFallback.alpha, 255);
    assert.equal(await page.evaluate(() => STATE.terrainEnabled), false);
    report.checks.push('Context loss while paused repaints the fallback without resuming physics');

    const offlinePage = await context.newPage();
    await offlinePage.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href, { waitUntil: 'load' });
    await offlinePage.waitForFunction(() => Skyroads.diagnostics && document.documentElement.dataset.renderer === 'cockpit');
    await offlinePage.click('#start-mission');
    await offlinePage.waitForFunction(() => STATE.mode === 'PLAYING');
    report.checks.push('Direct file:// startup and mission without module/CDN dependencies');
    await offlinePage.close();

    const missingLibraryPage = await context.newPage();
    await missingLibraryPage.route('**/three_r170.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await missingLibraryPage.goto(baseUrl, { waitUntil: 'load' });
    await missingLibraryPage.waitForFunction(() => document.documentElement.dataset.renderer === 'classic');
    await missingLibraryPage.click('#start-mission');
    await missingLibraryPage.waitForFunction(() => STATE.mode === 'PLAYING');
    assert.equal(await missingLibraryPage.evaluate(() => STATE.terrainEnabled), false);
    await missingLibraryPage.close();
    report.checks.push('Unavailable 3D dependency retains a playable compatibility view');

    // 固定场景只用于模型视觉复核；独立页面冻结游戏循环，不冒充正常游戏实录。
    const obstaclePage = await context.newPage();
    obstaclePage.on('pageerror', (error) => errors.push(error.message));
    await obstaclePage.goto(baseUrl, { waitUntil: 'load' });
    await obstaclePage.waitForFunction(() => document.documentElement.dataset.renderer === 'cockpit');
    await obstaclePage.evaluate(() => document.fonts.ready.then(() => true));
    await obstaclePage.evaluate(() => Skyroads.tutorial.markTutorialSeen(localStorage));
    await obstaclePage.click('#start-mission');
    await obstaclePage.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await obstaclePage.waitForTimeout(100);
    await obstaclePage.evaluate(() => {
      Object.assign(STATE, {
        runId: 'obstacle-visual-fixture', mode: 'PLAYING', position: 100, time: 15,
        speed: 0, playerY: 0, fuel: 90, elapsedMs: 15000, score: 2500,
        distanceMeters: 2500, shots: [], particles: [],
      });
      STATE.movement.lanePosition = 3;
      STATE.movement.laneVelocity = 0;
      STATE.groundHeight = STATE.terrainEnabled ? Skyroads.flightTerrain.heightAt(STATE.position, 3) : 0;
      STATE.track.slice(95, 230).forEach((segment) => {
        segment.lanes.fill('ROAD'); segment.enemies = [];
      });
      STATE.track[105].lanes[1] = 'WALL_LOW';
      STATE.track[107].lanes[3] = 'WALL_MEDIUM';
      STATE.track[111].lanes[5] = 'WALL_HIGH';
      refreshPresentation(); render();
    });
    await obstaclePage.screenshot({ path: path.join(artifactDirectory, 'obstacle_models.png') });
    report.screenshots.push('obstacle_models');
    report.obstacleScene = await obstaclePage.evaluate(() => Skyroads.diagnostics.snapshot().flight);
    assert.equal(report.obstacleScene.clippedInstances, 0);
    await obstaclePage.evaluate(() => { STATE.tripleT = 12; STATE.reducedMotion = true; STATE.time += 0.1; render(); });
    await obstaclePage.waitForTimeout(140);
    await obstaclePage.evaluate(() => { refreshPresentation(); render(); });
    assert.equal(await obstaclePage.evaluate(() => Skyroads.diagnostics.snapshot().flight.ship.superBlend), 1);
    await obstaclePage.screenshot({ path: path.join(artifactDirectory, 'ship_super.png') });
    report.screenshots.push('ship_super');
    // 在真实浏览器中用键盘触发台边阻挡，固定时间步只用于稳定边界断言。
    await obstaclePage.evaluate(() => {
      clearAllInputState();
      Object.assign(STATE, { position: 160, playerY: 0, playerVY: 0, jumpsUsed: 0,
        speed: 8, tripleT: 0, boostT: 0, fuelBurstT: 0, fuelBurstGraceT: 0 });
      resetMovement(STATE.movement, 2);
      STATE.groundHeight = Skyroads.flightTerrain.heightAt(160, 2);
    });
    await obstaclePage.keyboard.down('a');
    const stoppedAtEdge = await obstaclePage.evaluate(() => {
      for (let frame = 0; frame < 90; frame += 1) updatePhysics(1 / 240);
      render();
      return { lane: STATE.movement.lanePosition, mode: STATE.mode, position: STATE.position };
    });
    assert.equal(stoppedAtEdge.mode, 'PLAYING');
    assert.ok(stoppedAtEdge.position > 162);
    assert.ok(Math.abs(stoppedAtEdge.lane - 1.940001) < 0.00001);
    await obstaclePage.keyboard.press('Space');
    const climbed = await obstaclePage.evaluate(() => {
      for (let frame = 0; frame < 75; frame += 1) updatePhysics(1 / 240);
      return { lane: STATE.movement.lanePosition, mode: STATE.mode };
    });
    assert.equal(climbed.mode, 'PLAYING');
    assert.ok(climbed.lane < 1.5);
    await obstaclePage.keyboard.up('a');
    await obstaclePage.evaluate(() => {
      clearAllInputState();
      Object.assign(STATE, { position: 160, playerY: 0, playerVY: 0, jumpsUsed: 0, speed: 8 });
      resetMovement(STATE.movement, 1.25);
      STATE.groundHeight = Skyroads.flightTerrain.heightAt(160, 1.25);
    });
    await obstaclePage.keyboard.down('d');
    const dropped = await obstaclePage.evaluate(() => {
      let fallingFrames = 0;
      for (let frame = 0; frame < 100; frame += 1) {
        updatePhysics(1 / 240);
        if (STATE.playerY > 0) fallingFrames += 1;
      }
      STATE.time += 0.5; render();
      return { fallingFrames, mode: STATE.mode, altitude: STATE.playerY, jumps: STATE.jumpsUsed,
        shipY: Skyroads.diagnostics.snapshot().flight.ship.position.y, ground: STATE.groundHeight };
    });
    await obstaclePage.keyboard.up('d');
    assert.equal(dropped.mode, 'PLAYING');
    assert.ok(dropped.fallingFrames > 12);
    assert.equal(dropped.altitude, 0);
    assert.equal(dropped.jumps, 0);
    assert.ok(Math.abs(dropped.shipY - dropped.ground / 300) < 0.001);
    report.checks.push('Terrain edges block without killing, held steering resumes after jumping, high-to-low travel falls and lands');
    await obstaclePage.close();
    report.checks.push('Fixed obstacle scene rendered for visual review without clipped instance batches');

    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(artifactDirectory, 'browser_report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

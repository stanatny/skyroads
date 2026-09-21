'use strict';

// 固定场景触发真实拾取和计时，验证磁吸进入3D渲染；截图为受控验收场景。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:7201/';
const output = process.argv[3] || '/tmp/skyroads_energy_polish/effects';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const report = { url, fixture: true, checks: [], samples: {}, errors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight?.magnetFx);
    await page.evaluate(() => { Skyroads.tutorial.markTutorialSeen(localStorage); requestAnimationFrame = () => 0; });
    await page.waitForTimeout(100);
    await page.click('#start-mission');
    await page.evaluate(() => {
      Object.assign(STATE, { mode: 'PLAYING', time: 30, position: 24.1, fuel: 10, reducedMotion: false,
        magnetT: 0, magnetPulls: [], speed: 8, tutorial: null, playerY: 0, playerVY: 0 });
      STATE.movement.lanePosition = 3;
      STATE.track.forEach((segment) => { segment.lanes.fill('ROAD'); segment.enemies = []; });
      STATE.track[24].lanes[3] = 'MAGNET';
      for (const lane of [1, 2, 4, 5]) STATE.track[26].lanes[lane] = 'FUEL';
      globalThis.__energyStep = (frames = 1, physics = true) => {
        for (let i = 0; i < frames; i += 1) {
          if (STATE.mode !== 'PAUSED') {
            STATE.time += 1 / 30;
            if (physics) updatePhysics(1 / 30);
            updateEffects(1 / 30);
          }
          refreshPresentation(); render();
        }
      };
      refreshPresentation(); render();
    });
    const sample = () => page.evaluate(() => ({ mode: STATE.mode, fuel: STATE.fuel, time: STATE.time,
      magnetT: STATE.magnetT, pulls: STATE.magnetPulls.map((pull) => ({ ...pull })),
      flight: Skyroads.diagnostics.snapshot().flight }));
    const step = (frames = 1, physics = true) => page.evaluate(({ frames, physics }) => __energyStep(frames, physics), { frames, physics });
    let frame = 0;
    const videoFrame = () => page.screenshot({ path: path.join(output, `frame_${String(frame++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    await page.screenshot({ path: path.join(output, 'magnet_before.png') });
    await step();
    report.samples.collected = await sample();
    assert.equal(report.samples.collected.pulls.length, 4);
    assert.equal(report.samples.collected.flight.magnetFx.visiblePulls, 4);
    assert.ok(report.samples.collected.fuel > 81 && report.samples.collected.fuel < 82);
    assert.ok(report.samples.collected.magnetT > 7.9);
    await videoFrame();
    for (let i = 0; i < 8; i += 1) { await step(); await videoFrame(); }
    report.samples.inFlight = await sample();
    assert.equal(report.samples.inFlight.flight.magnetFx.visiblePulls, 4);
    assert.notDeepEqual(report.samples.inFlight.flight.magnetFx.lastPosition, report.samples.collected.flight.magnetFx.lastPosition);
    assert.ok(report.samples.inFlight.fuel < report.samples.collected.fuel, 'Fuel is credited once, not per effect frame');
    await page.screenshot({ path: path.join(output, 'magnet_pull.png') });
    await page.keyboard.press('p');
    const paused = await sample();
    await step(20);
    assert.deepEqual((await sample()).flight.magnetFx, paused.flight.magnetFx);
    assert.equal((await sample()).time, paused.time);
    await page.keyboard.press('p');
    for (let i = 0; i < 17; i += 1) { await step(); await videoFrame(); }
    assert.equal((await sample()).flight.magnetFx.visiblePulls, 0);
    assert.equal((await sample()).pulls.length, 0);
    report.checks.push('A real MAGNET pickup attracts four actual crystals, renders moving 3D cores and trails, credits fuel once, freezes on pause and expires');

    // 再触发两组真实收集，录像展示不同方向同时汇入机身。
    for (let wave = 0; wave < 2; wave += 1) {
      await page.evaluate(() => { for (const lane of [0, 2, 4, 6]) STATE.track[Math.floor(STATE.position) + 2].lanes[lane] = 'FUEL'; });
      for (let i = 0; i < 23; i += 1) { await step(); await videoFrame(); }
    }
    await page.evaluate(() => {
      STATE.magnetT = 0; STATE.position = Math.floor(STATE.position) + 0.1;
      STATE.track[Math.floor(STATE.position)].lanes[3] = 'TRIPLE';
    });
    for (let i = 0; i < 40; i += 1) { await step(); await videoFrame(); }
    report.samples.super = await sample();
    assert.ok(report.samples.super.flight.ship.superBlend > 0.95);
    assert.equal(report.samples.super.flight.statusFx.shield.active, false, 'Super form alone does not imply invincibility');
    await page.screenshot({ path: path.join(output, 'super.png') });
    await page.evaluate(() => {
      STATE.position = Math.floor(STATE.position) + 0.1;
      STATE.track[Math.floor(STATE.position)].lanes[3] = 'BOOST';
    });
    await step();
    assert.equal((await sample()).flight.statusFx.shield.active, true);
    for (let i = 0; i < 24; i += 1) { await step(); await videoFrame(); }
    await page.screenshot({ path: path.join(output, 'super_shield.png') });
    await page.keyboard.down('Space');
    for (let i = 0; i < 15; i += 1) { await step(); await videoFrame(); }
    await page.keyboard.up('Space');
    await page.screenshot({ path: path.join(output, 'super_airborne.png') });
    report.checks.push('Actual TRIPLE then BOOST pickups show mechanical super form and protective shell separately; real jump is rendered from chase camera');

    await page.evaluate(() => {
      STATE.reducedMotion = true; STATE.magnetT = 3;
      STATE.magnetPulls = [{ lane: 1, segment: STATE.position + 2, height: 450, t: 0.1, dur: 0.68 }];
    });
    await step(1, false);
    const reduced = await sample();
    assert.equal(reduced.flight.magnetFx.active, true);
    assert.equal(reduced.flight.magnetFx.lastPosition, null);
    await step(22, false);
    assert.equal((await sample()).pulls.length, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => STATE.width === 390);
    await step(1, false);
    await page.screenshot({ path: path.join(output, 'narrow.png') });
    // Three.js 首次展示超级形态时才上传其几何；覆盖全部形态后再检查资源稳定性。
    const resourceCount = (await sample()).flight.geometries;
    await step(240, false);
    assert.equal((await sample()).flight.geometries, resourceCount, 'Repeated effects reuse GPU geometry');
    await page.evaluate(() => { resetGame(); refreshPresentation(); render(); });
    assert.equal((await sample()).flight.magnetFx.visiblePulls, 0);
    assert.equal((await sample()).flight.magnetFx.active, false);
    report.checks.push('Reduced motion retains a static magnet identity, drains old pulls, and restart clears all effects with stable GPU geometry count');
    assert.deepEqual(report.errors, []);
    report.frames = frame;
    console.log(JSON.stringify({ checks: report.checks, errors: report.errors, frames: frame }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

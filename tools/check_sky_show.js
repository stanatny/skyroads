'use strict';

// 使用真实渲染循环累积彩蛋时钟；固定路线/快进时刻只用于背景效果验收。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [url = 'http://127.0.0.1:7201/', output = '/tmp/skyroads_sky_show'] = process.argv.slice(2);

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const report = { url, fixture: true, checks: [], errors: [], samples: {} };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight?.skyShow);
    await page.evaluate(() => { requestAnimationFrame = () => 0; Skyroads.tutorial.markTutorialSeen(localStorage); });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      globalThis.__skyStep = (frames = 1) => {
        for (let frame = 0; frame < frames; frame += 1) { STATE.time += 0.05; render(); }
      };
      __skyStep(120);
    });
    const sample = () => page.evaluate(() => Skyroads.diagnostics.snapshot().flight);
    const step = (frames = 1) => page.evaluate((count) => __skyStep(count), frames);
    assert.equal((await sample()).skyShow.elapsed, 0);
    await page.click('#start-mission');
    await page.evaluate(() => {
      Object.assign(STATE, { position: 20, distanceMeters: 4999, speed: 8, playerY: 0, playerVY: 0, groundHeight: 0,
        fuel: 92, reducedMotion: false, tutorial: null });
      STATE.track.forEach((segment) => { segment.lanes.fill('ROAD'); segment.enemies = []; });
      STATE.track[28].lanes[1] = 'WALL_MEDIUM'; STATE.track[34].lanes[5] = 'WALL_HIGH';
      STATE.track[25].lanes[3] = 'FUEL'; STATE.track[29].lanes[4] = 'BOOST';
      refreshPresentation(); render();
    });
    const unchanged = () => page.evaluate(() => JSON.stringify({ position: STATE.position, distanceMeters: STATE.distanceMeters, fuel: STATE.fuel,
      score: STATE.score, playerY: STATE.playerY, track: STATE.track, shots: STATE.shots }));
    const beforeMeteor = await unchanged();
    let frame = 0;
    const image = (name) => page.screenshot({ path: path.join(output, name) });
    const video = () => page.screenshot({ path: path.join(output, `frame_${String(frame++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    await step(40);
    for (let i = 0; i < 28; i += 1) {
      await step(); await video();
      if (i === 12) { await image('meteor.png'); report.samples.meteor = await sample(); }
    }
    assert.ok(report.samples.meteor.skyShow.visibleMeteors > 0);
    assert.equal(await unchanged(), beforeMeteor, 'Meteor rendering must not change gameplay state');
    assert.equal((await sample()).skyShow.heroMilestone, 0);
    await page.evaluate(() => { STATE.distanceMeters = 5000; render(); });
    const before = await unchanged();
    for (let i = 0; i < 172; i += 1) {
      await step(); await video();
      if (i === 65) { await image('hero_near.png'); report.samples.heroNear = await sample(); }
      if (i === 81) { await image('hero.png'); report.samples.hero = await sample(); }
      if (i === 135) { await image('hero_far.png'); report.samples.heroFar = await sample(); }
    }
    assert.equal(report.samples.hero.skyShow.heroVisible, true);
    assert.equal(report.samples.hero.skyShow.heroFx.visible, true);
    assert.ok(report.samples.heroNear.skyShow.heroPosition[2] > report.samples.heroFar.skyShow.heroPosition[2] + 150);
    assert.equal(report.samples.heroNear.skyShow.heroScale, report.samples.heroFar.skyShow.heroScale);
    assert.equal(await unchanged(), before, 'Sky rendering must not change gameplay state');
    report.checks.push('Menu does not consume events; meteors and the 5000-meter hero pass render with acceleration effects; gameplay state including distance remains unchanged');
    // 在下一次掠过的中央取图，验证高架/跳跃、暂停重绘及窄屏位置。
    await step(2000);
    assert.equal((await sample()).skyShow.heroVisible, false);
    assert.equal((await sample()).skyShow.heroMilestone, 1);
    await page.evaluate(() => { STATE.distanceMeters = 10000; render(); });
    await step(82);
    assert.equal((await sample()).skyShow.heroMilestone, 2);
    await page.evaluate(() => {
      STATE.position = 160; STATE.playerY = 900; STATE.groundHeight = Skyroads.flightTerrain.heightAt(160, 3);
      refreshPresentation(); render();
    });
    await image('hero_elevated.png');
    assert.equal((await sample()).skyShow.heroVisible, true);
    await page.keyboard.press('p');
    const paused = (await sample()).skyShow;
    // 暂停重绘不推进自己的演出时钟，即使外部传入不断变化的时间。
    await step(20);
    assert.deepEqual((await sample()).skyShow, paused);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => STATE.width === 390);
    await page.evaluate(() => render());
    assert.equal((await sample()).skyShow.heroVisible, true);
    await page.keyboard.press('p');
    await image('hero_narrow.png');
    await page.evaluate(() => { STATE.reducedMotion = true; render(); });
    const reduced = (await sample()).skyShow;
    await step(60);
    assert.equal((await sample()).skyShow.active, false);
    assert.equal((await sample()).skyShow.elapsed, reduced.elapsed);
    await page.evaluate(() => { STATE.reducedMotion = false; render(); });
    const resources = await sample();
    await step(1000);
    const later = await sample();
    assert.equal(later.geometries, resources.geometries);
    assert.equal(later.textures, resources.textures);
    await page.evaluate(() => { resetGame(); refreshPresentation(); render(); });
    assert.equal((await sample()).skyShow.elapsed, 0);
    assert.equal((await sample()).skyShow.heroVisible, false);
    report.checks.push('Waiting at 5000 meters never repeats; 10000 meters triggers the next pass; high terrain and narrow camera retain sky placement; pause/reduced motion/restart and GPU resources remain correct');
    assert.deepEqual(report.errors, []);
    report.frames = frame;
    console.log(JSON.stringify({ checks: report.checks, errors: report.errors, frames: frame }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

'use strict';

// 使用真实地形装饰器和追尾镜头验收太空旅程；固定路线截图不代表随机游戏实录。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:7201/';
const output = process.argv[3] || '/tmp/skyroads_orbital_journey/final';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const report = { url, fixture: true, checks: [], samples: {}, errors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight?.galaxy);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.evaluate(() => { Skyroads.tutorial.markTutorialSeen(localStorage); requestAnimationFrame = () => 0; });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, 'menu.png') });
    await page.click('#start-mission');
    await page.evaluate(() => {
      Object.assign(STATE, { runId: 'orbital-review', mode: 'PLAYING', time: 30, position: 0,
        speed: 12, fuel: 92, reducedMotion: false, tutorial: null, shots: [], particles: [], distanceMeters: 0 });
      STATE.track = Array.from({ length: 3000 }, (_, index) => Skyroads.flightTerrain.decorateSegment({
        index, lanes: Array(7).fill('ROAD'), enemies: [],
      }));
      globalThis.__journeyPlace = (position, lane = 3, playerY = 0, frames = 1) => {
        Object.assign(STATE, { position, distanceMeters: position * 10, playerY, playerVY: 0,
          groundHeight: Skyroads.flightTerrain.heightAt(position, lane) });
        resetMovement(STATE.movement, lane);
        for (let i = 0; i < frames; i += 1) { STATE.time += 1 / 30; refreshPresentation(); render(); }
      };
    });
    const sample = () => page.evaluate(() => Skyroads.diagnostics.snapshot().flight);
    const place = (position, lane = 3, playerY = 0, frames = 30) => page.evaluate(
      args => __journeyPlace(...args), [position, lane, playerY, frames]);
    const capture = async name => {
      const diagnostic = await sample();
      assert.equal(diagnostic.clippedInstances, 0);
      report.samples[name] = diagnostic;
      await page.screenshot({ path: path.join(output, `${name}.png`) });
    };
    for (const [index, type] of ['transfer_ring', 'shipyard', 'habitat', 'research_dock'].entries()) {
      await place(index * 330 + 170);
      assert.equal((await sample()).orbitalEnvironment.visibleStations[0].variant, type);
      await capture(type);
      await place(index * 330 + 245);
      await capture(`${type}_close`);
      await place(index * 330 + 277.5);
      await capture(`${type}_passage`);
    }
    report.checks.push('All four stations approach and pass the actual chase camera with zero clipped instances');

    await place(157, 4, 0);
    await capture('island_approach');
    await place(170, 4, 1000);
    await capture('island_side');
    await place(75);
    await capture('higher_slope');
    const island = await page.evaluate(() => ({
      entry: STATE.track[162].lanes[6], island: STATE.track[164].lanes[6],
      side: STATE.track[170].lanes[5], exit: STATE.track[184].lanes[6],
      bypass: STATE.track.slice(160, 186).every(segment => segment.lanes[3] === 'ROAD'),
      peak: Skyroads.flightTerrain.heightAt(110, 3),
    }));
    assert.deepEqual(island, { entry: 'GAP', island: 'ROAD', side: 'GAP', exit: 'GAP', bypass: true, peak: 2340 });
    report.checks.push('Actual terrain decorator produces an isolated island with entry, exit and side gaps, a safe bypass and 30% higher first plateau');

    await place(245);
    await page.keyboard.press('p');
    const paused = (await sample()).orbitalEnvironment;
    await place(250);
    assert.deepEqual((await sample()).orbitalEnvironment, paused);
    await page.keyboard.press('p');
    await place(245);
    await page.evaluate(() => { STATE.reducedMotion = true; });
    const reducedStart = (await sample()).orbitalEnvironment.journeyDistance;
    await place(260);
    assert.equal((await sample()).orbitalEnvironment.journeyDistance, reducedStart);
    await page.evaluate(() => { STATE.reducedMotion = false; });
    await place(260);
    assert.equal((await sample()).orbitalEnvironment.journeyDistance, 1040);
    report.checks.push('Real keyboard pause and reduced-motion preference freeze station approach and resume correctly');

    // 先预热两轮全部站体和天空演出，再比较多次轮换的 GPU 资源。
    const cycle = () => page.evaluate(() => {
      for (let index = 0; index < 2700; index += 11) __journeyPlace(index, 3, 0, 1);
      return Skyroads.diagnostics.snapshot().flight;
    });
    await cycle();
    const before = await cycle();
    const after = await cycle();
    assert.equal(after.geometries, before.geometries);
    assert.equal(after.textures, before.textures);
    assert.equal(after.clippedInstances, 0);
    report.resources = { geometries: after.geometries, textures: after.textures };
    await place(170);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => STATE.width === 390);
    await place(170);
    await capture('narrow');
    await page.evaluate(() => { resetGame(); refreshPresentation(); render(); });
    assert.equal((await sample()).orbitalEnvironment.journeyDistance, 0);
    report.checks.push('Repeated station cycles keep GPU geometry and textures stable; narrow view and restart work');
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ output, checks: report.checks, errors: report.errors, resources: report.resources }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

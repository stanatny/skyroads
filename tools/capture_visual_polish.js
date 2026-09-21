'use strict';

// 固定真实追尾相机、时刻和路线，比较资产；场景夹具不代表正常随机游戏实录。
// 用法：PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/capture_visual_polish.js URL 输出目录 [基线文件目录]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [url = 'http://127.0.0.1:7201/', output = '/tmp/skyroads_visual_polish', baseline] = process.argv.slice(2);

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    if (baseline) await context.route('**/*', async (route) => {
      const requestPath = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '') || 'index.html';
      const file = path.resolve(baseline, requestPath);
      if (file.startsWith(`${path.resolve(baseline)}${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        await route.fulfill({ path: file });
      } else {
        // 基线是本地静态回放；所有资源同源提供，避免拦截首页后触发浏览器私网请求隔离。
        const project = path.resolve(__dirname, '..');
        const currentFile = path.resolve(project, requestPath);
        if (currentFile.startsWith(`${project}${path.sep}`) && fs.existsSync(currentFile) && fs.statSync(currentFile).isFile()) {
          await route.fulfill({ path: currentFile });
        } else await route.continue();
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'cockpit').catch(async (error) => {
      console.error(JSON.stringify({ errors, diagnostic: await page.evaluate(() => globalThis.Skyroads?.diagnostics?.snapshot()) }));
      throw error;
    });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { Skyroads.tutorial.markTutorialSeen(localStorage); requestAnimationFrame = () => 0; });
    // 等已排队帧消费完毕；此后只以 render() 绘制固定时刻。
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, 'menu.png') });
    await page.click('#start-mission');
    await page.evaluate(() => {
      Object.assign(STATE, { runId: 'visual-review', mode: 'PLAYING', time: 30, position: 20,
        speed: 9.2, playerY: 0, playerVY: 0, fuel: 92, groundHeight: 0, reducedMotion: true,
        elapsedMs: 45000, score: 2340, distanceMeters: 1800, shots: [], particles: [] });
      STATE.movement.lanePosition = 3;
      STATE.movement.laneVelocity = 0;
      STATE.track.forEach((segment) => { segment.lanes.fill('ROAD'); segment.enemies = []; });
      const put = (index, lane, type) => { STATE.track[index].lanes[lane] = type; };
      put(26, 0, 'WALL_LOW'); put(29, 1, 'WALL_MEDIUM'); put(32, 5, 'WALL_HIGH');
      put(24, 3, 'FUEL'); put(28, 3, 'BOOST'); put(31, 3, 'TRIPLE');
      put(28, 4, 'MAGNET'); put(32, 2, 'SLOW'); put(36, 0, 'WALL_HIGH');
      put(43, 3, 'WALL_MEDIUM'); put(39, 2, 'FUEL');
      STATE.track[25].enemies = [{ type: 'drone', lane: 4, fromLane: 4, toLane: 4, state: 'rest', moveT: 0 }];
      STATE.track[36].enemies = [{ type: 'turret', lane: 6 }];
      refreshPresentation(); render();
    });
    await page.screenshot({ path: path.join(output, 'flight.png') });
    await page.evaluate(() => { STATE.position = 23; STATE.time += 0.1; refreshPresentation(); render(); });
    await page.screenshot({ path: path.join(output, 'close.png') });
    await page.evaluate(() => {
      STATE.position = 24; STATE.time += 0.1;
      STATE.track.slice(20, 30).forEach((segment) => { segment.lanes.fill('ROAD'); segment.enemies = []; });
      ['FUEL', 'BOOST', 'SLOW', 'TRIPLE', 'MAGNET'].forEach((type, index) => { STATE.track[27].lanes[index + 1] = type; });
      refreshPresentation(); render();
    });
    await page.screenshot({ path: path.join(output, 'rewards.png') });
    const diagnostics = await page.evaluate(() => Skyroads.diagnostics.snapshot().flight);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => STATE.width === 390 && STATE.height === 844);
    await page.evaluate(() => { STATE.time += 0.1; refreshPresentation(); render(); });
    await page.screenshot({ path: path.join(output, 'narrow.png') });
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify({ url, fixture: true, errors, diagnostics }, null, 2)}\n`);
    console.log(JSON.stringify({ output, errors, drawCalls: diagnostics.drawCalls, triangles: diagnostics.triangles }));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

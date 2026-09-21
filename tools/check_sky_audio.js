'use strict';

// 使用固定验收路线和真实 Web Audio 图，验证画面同步、声音输出及生命周期。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [url = 'http://127.0.0.1:7201/', output = '/tmp/skyroads_hero_audio'] = process.argv.slice(2);

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const report = { url, fixture: true, checks: [], errors: [], samples: {} };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.waitForFunction(() => Skyroads.diagnostics.snapshot().flight?.skyShow && Skyroads.flightSkyAudio);
    await page.evaluate(() => { requestAnimationFrame = () => 0; Skyroads.tutorial.markTutorialSeen(localStorage); });
    await page.waitForTimeout(100);
    await page.click('#start-mission');
    await page.evaluate(() => {
      STATE.audioController.setMusicMuted(true);
      STATE.audioController.setSfxMuted(false);
      Object.assign(STATE, { position: 20, distanceMeters: 4999, speed: 8, playerY: 0, playerVY: 0, groundHeight: 0,
        fuel: 92, reducedMotion: false, tutorial: null });
      STATE.track.forEach(segment => { segment.lanes.fill('ROAD'); segment.enemies = []; });
      STATE.track[28].lanes[1] = 'WALL_MEDIUM'; STATE.track[34].lanes[5] = 'WALL_HIGH';
      refreshPresentation(); render();
      globalThis.skyAudioStep = (frames = 1) => {
        for (let i = 0; i < frames; i += 1) { STATE.time += 0.05; render(); syncSkyHeroAudio(); }
      };
      globalThis.skyAnalyser = AUDIO.ctx.createAnalyser();
      skyAnalyser.fftSize = 2048;
      AUDIO.master.connect(skyAnalyser);
      globalThis.skyRms = () => {
        const data = new Float32Array(skyAnalyser.fftSize);
        skyAnalyser.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
      };
      globalThis.skyAudioSnapshot = () => ({
        sound: AUDIO.skyHero ? AUDIO.skyHero.getDiagnostics() : null,
        cue: STATE.cockpitRuntime.getSkyAudioCue(), rms: skyRms(), context: AUDIO.ctx.state,
      });
    });
    const snapshot = () => page.evaluate(() => skyAudioSnapshot());
    const step = frames => page.evaluate(count => skyAudioStep(count), frames);
    const unchanged = () => page.evaluate(() => JSON.stringify({ position: STATE.position, distanceMeters: STATE.distanceMeters, fuel: STATE.fuel,
      score: STATE.score, playerY: STATE.playerY, track: STATE.track, shots: STATE.shots }));
    const beforeWaiting = await unchanged();
    // 六十秒真实渲染只等流星：未到五公里时，超人和声音不能按旧计时器提前出现。
    report.samples.meteors = await page.evaluate(() => {
      let previous = 0, starts = 0, maximumVisible = 0, heroFrames = 0;
      for (let frame = 0; frame < 1200; frame += 1) {
        skyAudioStep();
        const sky = Skyroads.diagnostics.snapshot().flight.skyShow;
        starts += Math.max(0, sky.visibleMeteors - previous);
        previous = sky.visibleMeteors;
        maximumVisible = Math.max(maximumVisible, sky.visibleMeteors);
        heroFrames += Number(sky.heroVisible);
      }
      return { starts, maximumVisible, heroFrames, sky: Skyroads.diagnostics.snapshot().flight.skyShow };
    });
    assert.ok(report.samples.meteors.starts >= 21, 'More than twice the previous ten meteors per minute');
    assert.ok(report.samples.meteors.maximumVisible <= 3);
    assert.equal(report.samples.meteors.heroFrames, 0);
    assert.equal(report.samples.meteors.sky.heroMilestone, 0);
    assert.equal((await snapshot()).sound?.startCount || 0, 0);
    assert.equal(await unchanged(), beforeWaiting);
    report.checks.push('At 4999 meters, sixty seconds produces at least 21 meteor appearances from a three-object pool and no hero or flyby sound');
    await page.evaluate(() => { STATE.distanceMeters = 5000; render(); syncSkyHeroAudio(); });
    const before = await unchanged();
    // 录像只录背景掠过声，便于听清近处破风与远去的尾音；不修改正式混音偏好。
    await page.evaluate(() => {
      globalThis.skyCapture = AUDIO.ctx.createMediaStreamDestination();
      AUDIO.master.connect(skyCapture);
      const video = document.getElementById('flight-scene').captureStream(20);
      globalThis.skyRecorder = new MediaRecorder(new MediaStream([...video.getVideoTracks(), ...skyCapture.stream.getAudioTracks()]),
        { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks = [];
      skyRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      globalThis.skyRecording = new Promise(resolve => {
        skyRecorder.onstop = async () => {
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          resolve(btoa(binary));
        };
      });
      skyRecorder.start();
    });
    let peakRms = 0;
    for (let frame = 0; frame < 178; frame += 1) {
      await step(1);
      await page.waitForTimeout(50);
      const current = await snapshot();
      peakRms = Math.max(peakRms, current.rms);
      if (frame === 60) {
        report.samples.near = current;
        await page.screenshot({ path: path.join(output, 'hero_audio.png') });
      }
      if (frame === 135) report.samples.far = current;
    }
    const recording = await page.evaluate(async () => { skyRecorder.stop(); return skyRecording; });
    fs.writeFileSync(path.join(output, 'hero_audio.webm'), Buffer.from(recording, 'base64'));
    assert.ok(peakRms > 0.001 && peakRms < 0.3, `Expected audible bounded flyby RMS, got ${peakRms}`);
    assert.equal(report.samples.near.sound.active, true);
    assert.equal(report.samples.near.sound.startCount, 1);
    assert.equal(report.samples.far.sound.startCount, 1);
    assert.ok(report.samples.near.rms > report.samples.far.rms, 'The flyby recedes in volume');
    assert.equal(await unchanged(), before);
    report.samples.peakRms = peakRms;
    report.checks.push('Crossing 5000 meters emits one audible receding flyby synchronized with the rendered hero; gameplay state including distance unchanged');

    // 同一里程停留超过旧周期不重播；第二次掠过必须由一万米节点触发。
    await step(2000);
    assert.equal((await snapshot()).sound.active, false);
    assert.equal((await snapshot()).sound.startCount, 1);
    assert.equal(await unchanged(), before);
    await page.evaluate(() => { STATE.distanceMeters = 9999; render(); syncSkyHeroAudio(); });
    await step(100);
    assert.equal((await snapshot()).sound.startCount, 1);
    await page.evaluate(() => { STATE.distanceMeters = 10000; render(); syncSkyHeroAudio(); });
    await step(60);
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).sound.active, true);
    const starts = (await snapshot()).sound.startCount;
    assert.equal(starts, 2);
    assert.equal(await page.evaluate(() => Skyroads.diagnostics.snapshot().flight.skyShow.heroMilestone), 2);
    report.checks.push('One hundred seconds at the same 5000-meter milestone does not replay; only crossing 10000 meters starts the second flyby sound');
    await page.evaluate(() => { for (let i = 0; i < 20; i += 1) { render(); syncSkyHeroAudio(); } });
    assert.equal((await snapshot()).sound.startCount, starts);
    await page.keyboard.press('p');
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).sound.active, false);
    assert.ok((await snapshot()).rms < 0.0001);
    await page.keyboard.press('p');
    await step(1); await page.waitForTimeout(150);
    assert.equal((await snapshot()).sound.active, true);
    await page.keyboard.press('m');
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).sound.active, false);
    assert.ok((await snapshot()).rms < 0.0001);
    await page.keyboard.press('m');
    await step(1); await page.waitForTimeout(100);
    assert.equal((await snapshot()).sound.active, true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).sound.active, false);
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); STATE.reducedMotion = true; render(); syncSkyHeroAudio(); });
    assert.equal((await snapshot()).sound.active, false);
    await page.evaluate(() => { STATE.reducedMotion = false; resetGame(); refreshPresentation(); render(); syncSkyHeroAudio(); });
    assert.equal((await snapshot()).sound.active, false);
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).sound.liveGraphs, 0);
    report.checks.push('Repeated redraw does not retrigger; keyboard pause/mute, blur, reduced motion and restart stop playback and release graphs');
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ checks: report.checks, errors: report.errors, peakRms }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

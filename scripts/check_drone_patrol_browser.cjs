'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let playwright;
try { playwright = require('playwright'); }
catch (_) {
  playwright = require(process.env.SKYROADS_PLAYWRIGHT_MODULE
    || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const previewUrl = process.argv[2] || process.env.SKYROADS_PREVIEW_URL || 'http://127.0.0.1:7201/';
const evidenceDirectory = path.resolve(process.argv[3] || '/tmp/skyroads_drone_horizontal');
const report = { url: previewUrl, checks: [], samples: {}, errors: [], fixture: {
  description: 'Real Chrome WebGL and keyboard input; deterministic frame clock. Random obstacles are cleared around test subjects. Two fixed-altitude fixtures exercise actual horizontal patrols. Jump and projectile targets rest temporarily; the ground collision regression approaches a drone after its real patrol completes a round trip.',
  noProductionState: true,
} };
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
    window.__droneClock = {
      get now() { return time; },
      step(milliseconds) {
        time += milliseconds;
        const ready = [...callbacks.values()];
        callbacks.clear();
        ready.forEach((callback) => callback(time));
      },
    };
  });
}

async function advance(page, seconds) {
  await page.evaluate((duration) => {
    const frames = Math.max(1, Math.ceil(duration * 60 - 1e-8));
    for (let frame = 0; frame < frames; frame += 1) __droneClock.step(duration * 1000 / frames);
  }, seconds);
}

async function sample(page) {
  return page.evaluate(() => ({
    mode: STATE.mode, position: STATE.position, speed: STATE.speed, playerY: STATE.playerY,
    deathReason: STATE.deathReason, kills: STATE.enemyKills, jumpCount: STATE.jumpsUsed,
    drone: window.__testDrone ? { ...__testDrone, actualLane: enemyLane(__testDrone) } : null,
    mesh: window.__droneMatrix, bursts: window.__droneBursts,
    flight: Skyroads.diagnostics.snapshot().flight,
  }));
}

async function setup(page, { position = 246, speed = 0, lane = 1.5, droneLane = 1, altitude = 0, moving = true } = {}) {
  await page.evaluate((options) => {
    startGame();
    STATE.tutorial = null;
    CONFIG.ACCEL = 0;
    STATE.position = options.position;
    STATE.distanceMeters = STATE.position * CONFIG.DISTANCE_PER_SEGMENT;
    STATE.speed = options.speed;
    STATE.fuel = 100;
    STATE.boostT = STATE.boostGraceT = STATE.tripleT = STATE.fuelBurstT = STATE.fuelBurstGraceT = 0;
    STATE.wormhole.gate = null;
    resetMovement(STATE.movement, options.lane);
    STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, options.lane);
    STATE.playerY = STATE.playerVY = STATE.jumpsUsed = 0;
    STATE.lastTime = __droneClock.now;
    extendTrack();
    for (const segment of STATE.track.slice(Math.max(0, Math.floor(STATE.position) - 3), Math.floor(STATE.position) + CONFIG.RENDER_DISTANCE + 2)) {
      segment.lanes.fill('ROAD');
      segment.enemies = [];
    }
    window.__testDrone = {
      type: 'drone', lane: options.droneLane, spawnLane: options.droneLane,
      fromLane: options.droneLane, toLane: options.droneLane, phase: 0,
      altitude: options.altitude,
      state: 'rest', restT: options.moving ? 0.25 : 10, warnT: 0, moveT: 1,
      patrolLaneA: options.droneLane, patrolLaneB: options.moving ? 2 : options.droneLane,
    };
    STATE.track[250].enemies = [__testDrone];
    window.__droneBursts = [];
    focusPrimarySurface();
    render();
  }, { position, speed, lane, droneLane, altitude, moving });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(evidenceDirectory, `${name}.png`) });
}

async function main() {
  const browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.SKYROADS_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', (request) => report.errors.push(`${request.failure()?.errorText} ${request.url()}`));
    await installClock(page);
    await page.goto(previewUrl);
    await page.waitForFunction(() => Boolean(window.Skyroads?.diagnostics), null, { polling: 100 });
    await advance(page, 1 / 60);
    await page.evaluate(() => Skyroads.tutorial.markTutorialSeen(localStorage));
    await page.locator('#start-mission').click({ force: true });
    await page.evaluate(() => Promise.race([Skyroads.diagnostics.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Diagnostics readiness timed out')), 15000))]));
    await page.evaluate(() => {
      // 只观察真实实例矩阵与爆炸入口，原函数原样执行；不修改模型或命中逻辑。
      const setMatrixAt = THREE.InstancedMesh.prototype.setMatrixAt;
      THREE.InstancedMesh.prototype.setMatrixAt = function (index, matrix) {
        if (this.name === 'object_drone_interceptor' && index === 0) {
          window.__droneMatrix = { x: matrix.elements[12], y: matrix.elements[13], z: matrix.elements[14] };
        }
        return setMatrixAt.call(this, index, matrix);
      };
      const burst = shotBurstFx;
      shotBurstFx = function (...args) { window.__droneBursts?.push(args); return burst(...args); };
    });
    assert.equal((await sample(page)).flight.renderer, 'webgl-chase');
    report.samples.tuning = await page.evaluate(() => ({ acceleration: CONFIG.ACCEL, initial: CONFIG.INITIAL_SPEED,
      softThreshold: CONFIG.CRUISE_SOFT_CAP, tailAcceleration: CONFIG.CRUISE_TAIL_ACCEL, tutorialMax: CONFIG.TUTORIAL_SPEED_CAP, boost: CONFIG.BOOST_SPEED }));
    assert.deepEqual(report.samples.tuning, { acceleration: 0.65, initial: 8, softThreshold: 36, tailAcceleration: 0.1, tutorialMax: 16, boost: 36 });
    await page.evaluate(() => {
      STATE.tutorial = null;
      for (const segment of STATE.track) { segment.lanes.fill('ROAD'); segment.enemies = []; }
    });
    await advance(page, 4);
    close((await sample(page)).speed, 10.6);
    report.checks.push('Real physics accelerates from 8 to 10.6 in four seconds; continuous tail growth, tutorial cap 16 and boost minimum 36 are configured');

    report.samples.horizontal = {};
    for (const altitude of [0, 720]) {
      await setup(page, { altitude });
      const endpoints = [];
      const warnings = [];
      const phases = new Set();
      let previous = (await sample(page)).drone.state;
      const start = await sample(page);
      assert.ok(start.mesh, 'Real drone instance matrix must be observed');
      const route = await page.evaluate(() => Skyroads.flightTerrain.routeAt(250));
      for (let frame = 0; frame < 312; frame += 1) {
        await advance(page, 1 / 60);
        const current = await sample(page);
        const e = current.drone;
        phases.add(e.state);
        assert.ok(!route.safeLanes.some((safe) => Math.abs(e.actualLane - safe) < 0.5));
        close(e.altitude, altitude);
        close(current.mesh.y, start.mesh.y);
        close(current.mesh.x - start.mesh.x, (e.actualLane - start.drone.actualLane) * 3.4);
        if (previous === 'move' && e.state === 'rest') {
          endpoints.push(e.actualLane);
          if (endpoints.length <= 2) await screenshot(page, `horizontal_${altitude}_${endpoints.length}`);
        }
        if (previous !== 'warn' && e.state === 'warn') {
          assert.notEqual(e.toLane, e.fromLane, 'A patrol warning must describe a lateral move');
          warnings.push(e.toLane - e.fromLane);
        }
        previous = e.state;
      }
      assert.deepEqual(endpoints.slice(0, 4), [2, 1, 2, 1]);
      assert.deepEqual(warnings.slice(0, 4), [1, -1, 1, -1]);
      assert.deepEqual([...phases].sort(), ['move', 'rest', 'warn']);
      report.samples.horizontal[altitude] = { endpoints, warnings, start, end: await sample(page) };
      report.checks.push(`Real 3D drone at altitude ${altitude} reverses left/right for two round trips; model height stays fixed through rest, warning and movement`);
    }
    close(report.samples.horizontal[720].start.mesh.y - report.samples.horizontal[0].start.mesh.y, 720 / 300);

    await page.keyboard.press('p');
    const paused = await sample(page);
    assert.equal(paused.mode, 'PAUSED');
    await advance(page, 2);
    assert.deepEqual((await sample(page)).drone, paused.drone);
    await page.keyboard.press('p');
    await advance(page, 0.5);
    assert.equal((await sample(page)).mode, 'PLAYING');
    assert.notDeepEqual((await sample(page)).drone, paused.drone);
    report.checks.push('Real P key pauses every patrol coordinate/timer and resumes the same patrol');

    // 让地面无人机先完成真实往返，再迎面驶入；不能靠自动升高消除地面危险。
    await setup(page, { position: 248.5 });
    let arrivals = 0;
    let previousPhase = (await sample(page)).drone.state;
    for (let frame = 0; frame < 180 && arrivals < 2; frame += 1) {
      await advance(page, 1 / 60);
      const phase = (await sample(page)).drone.state;
      if (previousPhase === 'move' && phase === 'rest') arrivals += 1;
      previousPhase = phase;
    }
    assert.equal(arrivals, 2);
    const approach = await sample(page);
    await page.evaluate(() => {
      const lane = enemyLane(__testDrone);
      resetMovement(STATE.movement, lane);
      STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, lane);
      STATE.speed = 8;
    });
    await advance(page, 0.3);
    const groundImpact = await sample(page);
    assert.equal(groundImpact.mode, 'GAMEOVER');
    assert.equal(groundImpact.deathReason, 'enemy');
    close(groundImpact.playerY, 0);
    close(groundImpact.drone.altitude, 0);
    report.samples.groundPatrolImpact = { approach, impact: groundImpact };
    report.checks.push('A ground drone still causes a real ground-level collision after completing a patrol round trip instead of rising out of the flight path');

    await setup(page, { position: 248.5, speed: 8, lane: 1, moving: false });
    await page.keyboard.press('Space');
    await advance(page, 0.33);
    const lowJump = await sample(page);
    assert.equal(lowJump.mode, 'PLAYING');
    assert.equal(lowJump.jumpCount, 1);
    assert.ok(lowJump.position >= 251 && lowJump.playerY > 500);
    report.samples.lowJump = lowJump;
    report.checks.push('A real single Space jump clears the low drone collision volume');

    await setup(page, { position: 248.5, speed: 8, lane: 1, altitude: 720, moving: false });
    await advance(page, 0.33);
    const underflight = await sample(page);
    assert.equal(underflight.mode, 'PLAYING');
    assert.ok(underflight.position >= 251);
    close(underflight.playerY, 0);
    report.samples.underflight = underflight;
    report.checks.push('Ground flight crosses safely underneath a raised drone');

    await setup(page, { position: 248.5, speed: 8, lane: 1, altitude: 720, moving: false });
    await page.keyboard.press('k');
    await advance(page, 0.33);
    const highJump = await sample(page);
    assert.equal(highJump.mode, 'GAMEOVER');
    assert.equal(highJump.deathReason, 'enemy');
    assert.ok(highJump.playerY >= 720 && highJump.playerY <= 1220);
    report.samples.highJump = highJump;
    report.checks.push('A real single K jump hits the raised drone at the same visible altitude');
    await page.keyboard.press('Enter');
    await advance(page, 1 / 60);
    const restart = await sample(page);
    assert.equal(restart.mode, 'PLAYING');
    assert.ok(restart.position < 1);
    assert.equal(restart.jumpCount, 0);
    assert.equal(await page.evaluate(() => STATE.track.some((segment) => segment.enemies?.includes(__testDrone))), false);
    report.checks.push('Real Enter restart resets the previous patrol and jump state');

    await setup(page, { lane: 1, altitude: 720, moving: false });
    await page.keyboard.press('j');
    await advance(page, 0.15);
    const shot = await sample(page);
    assert.equal(shot.kills, 1);
    assert.equal(await page.evaluate(() => STATE.track[250].enemies.length), 0);
    assert.equal(shot.bursts.length, 1);
    close(shot.bursts[0][2], 1040);
    await screenshot(page, 'high_drone_destroyed');
    report.samples.highShot = shot;
    report.checks.push('Real J input destroys a high drone; the actual explosion origin follows its height');

    await setup(page, { position: 248.5, altitude: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { STATE.reducedMotion = true; render(); });
    await advance(page, 1.8);
    const reduced = await sample(page);
    assert.equal(reduced.drone.state, 'warn');
    assert.equal(reduced.drone.fromLane, 2);
    assert.equal(reduced.drone.toLane, 1);
    assert.equal(reduced.drone.altitude, 720);
    await screenshot(page, 'horizontal_warning_reduced');
    await advance(page, 0.7);
    assert.equal((await sample(page)).drone.altitude, 720);
    assert.equal((await sample(page)).drone.actualLane, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); render(); });
    await screenshot(page, 'mobile_390_reduced');
    assert.equal((await sample(page)).flight.width, 390);
    report.samples.reduced = reduced;
    report.checks.push('Reduced motion retains horizontal return flight at fixed altitude and lateral warning lights at 390 px');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await setup(page);
    await page.evaluate(() => { STATE.reducedMotion = false; window.dispatchEvent(new Event('resize')); render(); });
    const resourceStart = (await sample(page)).flight;
    for (let cycle = 0; cycle < 8; cycle += 1) {
      await page.evaluate(() => { STATE.fuel = 100; });
      await advance(page, 5);
    }
    const resourceEnd = (await sample(page)).flight;
    assert.equal(resourceEnd.geometries, resourceStart.geometries);
    assert.equal(resourceEnd.textures, resourceStart.textures);
    assert.equal(resourceEnd.clippedInstances, 0);
    assert.equal(resourceEnd.contextLost, false);
    report.samples.resources = { before: resourceStart, after: resourceEnd };
    report.checks.push('Eight complete patrol cycles do not grow GPU geometries/textures or clip instances');

    if (process.env.SKYROADS_CAPTURE_VIDEO === '1') {
      await setup(page, { position: 248.5 });
      await page.evaluate(() => {
        const label = document.createElement('div');
        label.textContent = '水平巡航演示 · 定点镜头观察真实运动';
        label.style.cssText = 'position:fixed;left:50%;top:150px;transform:translateX(-50%);z-index:9999;padding:9px 15px;border:1px solid #64cbd077;border-radius:8px;background:#061723dd;color:#cef5ff;font:16px system-ui;pointer-events:none;white-space:nowrap';
        document.body.appendChild(label);
      });
      const frames = path.join(evidenceDirectory, 'video_frames');
      fs.mkdirSync(frames, { recursive: true });
      for (let frame = 0; frame < 144; frame += 1) {
        await advance(page, 1 / 24);
        await page.screenshot({ path: path.join(frames, `${String(frame).padStart(4, '0')}.png`) });
      }
      execFileSync(process.env.SKYROADS_FFMPEG_PATH || 'ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24',
        '-i', path.join(frames, '%04d.png'), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        path.join(evidenceDirectory, 'drone_horizontal_patrol.mp4')]);
      fs.copyFileSync(path.join(frames, '0055.png'), path.join(evidenceDirectory, 'drone_horizontal_cover.png'));
      report.video = { file: 'drone_horizontal_patrol.mp4', duration: 6, fps: 24, camera: 'Fixed-position inspection fixture; actual unmodified patrol state machine and renderer' };
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    fs.writeFileSync(path.join(evidenceDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
  console.log(`Passed ${report.checks.length} drone patrol browser checks; evidence: ${evidenceDirectory}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

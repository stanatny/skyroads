'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let playwright;
try { playwright = require('playwright'); }
catch (_) {
  playwright = require(process.env.SKYROADS_PLAYWRIGHT_MODULE
    || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const previewUrl = process.argv[2] || process.env.SKYROADS_PREVIEW_URL || 'http://127.0.0.1:7201/';
const evidenceDirectory = path.resolve(process.argv[3] || '/tmp/skyroads_cruise_balance_browser');
const report = { url: previewUrl, checks: [], samples: {}, errors: [], fixture: {
  description: 'Real Chrome, WebGL renderer, keyboard start and deterministic RAF clock. A flat empty road isolates speed and reward encounters; reward tiles use the real swept collision/collection path. No production save or gameplay implementation is replaced.',
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
    window.requestAnimationFrame = callback => { callbacks.set(++sequence, callback); return sequence; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    window.__balanceClock = {
      get now() { return time; },
      step(milliseconds) {
        time += milliseconds;
        const ready = [...callbacks.values()]; callbacks.clear();
        ready.forEach(callback => callback(time));
      },
    };
  });
}

async function advance(page, seconds) {
  await page.evaluate(duration => {
    const frames = Math.max(1, Math.ceil(duration * 60 - 1e-8));
    for (let frame = 0; frame < frames; frame += 1) __balanceClock.step(duration * 1000 / frames);
  }, seconds);
}

async function setup(page, { speed = 8, triple = 0, boost = 0 } = {}) {
  await page.evaluate(options => {
    startGame();
    STATE.tutorial = null;
    STATE.terrainEnabled = false;
    STATE.track = Array.from({ length: 5000 }, (_, index) => ({ index, lanes: Array(CONFIG.LANES).fill('ROAD'), enemies: [] }));
    STATE.position = 20.2;
    STATE.distanceMeters = STATE.position * CONFIG.DISTANCE_PER_SEGMENT;
    STATE.speed = options.speed;
    STATE.boostT = options.boost;
    STATE.boostPrevSpeed = options.boost > 0 ? options.speed : 0;
    STATE.fuelBurstT = STATE.fuelBurstPrevSpeed = STATE.boostGraceT = STATE.fuelBurstGraceT = 0;
    STATE.tripleT = options.triple;
    STATE.fuel = 100;
    STATE.wormhole.gate = null;
    STATE.groundHeight = STATE.playerY = STATE.playerVY = STATE.jumpsUsed = 0;
    resetMovement(STATE.movement, 3);
    STATE.lastTime = __balanceClock.now;
    window.__balanceBoostCues = 0;
    focusPrimarySurface(); render();
  }, { speed, triple, boost });
}

async function sample(page) {
  return page.evaluate(() => {
    const flight = Skyroads.diagnostics.snapshot().flight;
    return { mode: STATE.mode, position: STATE.position, speed: STATE.speed, cruiseSpeed: currentCruiseSpeed(),
      boostT: STATE.boostT, boostGraceT: STATE.boostGraceT, tripleT: STATE.tripleT, fuel: STATE.fuel,
      boostCues: window.__balanceBoostCues, warpActive: STATE.wormhole.active,
      tripleModels: window.__balanceMeshes?.object_triple_body?.count,
      boostModels: window.__balanceMeshes?.object_boost_body?.count,
      flight: { renderer: flight.renderer, error: flight.error, contextLost: flight.contextLost,
        clippedInstances: flight.clippedInstances, geometries: flight.geometries, textures: flight.textures },
    };
  });
}

async function main() {
  const browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.SKYROADS_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => report.errors.push(`${request.failure()?.errorText} ${request.url()}`));
    await installClock(page);
    await page.goto(previewUrl);
    await page.waitForFunction(() => Boolean(window.Skyroads?.diagnostics), null, { polling: 100 });
    await advance(page, 1 / 60);
    await page.evaluate(() => Skyroads.tutorial.markTutorialSeen(localStorage));
    await page.locator('#start-mission').click({ force: true });
    await page.evaluate(() => Promise.race([Skyroads.diagnostics.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Diagnostics readiness timed out')), 15000))]));
    await page.evaluate(() => {
      // 只观察真实实例批次，原矩阵写入和 WebGL 提交照常执行。
      window.__balanceMeshes = {};
      const original = THREE.InstancedMesh.prototype.setMatrixAt;
      THREE.InstancedMesh.prototype.setMatrixAt = function (...args) {
        if (this.name === 'object_triple_body' || this.name === 'object_boost_body') __balanceMeshes[this.name] = this;
        return original.apply(this, args);
      };
      const boostSound = sfxBoost;
      sfxBoost = function (...args) {
        window.__balanceBoostCues = (window.__balanceBoostCues || 0) + 1;
        return boostSound(...args);
      };
    });
    report.samples.tuning = await page.evaluate(() => ({ acceleration: CONFIG.ACCEL,
      threshold: CONFIG.CRUISE_SOFT_CAP, tail: CONFIG.CRUISE_TAIL_ACCEL,
      boostDuration: CONFIG.BOOST_DURATION, boostGrace: CONFIG.BOOST_GRACE,
      fuelBurstGrace: CONFIG.FUEL_BURST_GRACE, superDuration: CONFIG.TRIPLE_DURATION }));
    assert.deepEqual(report.samples.tuning, { acceleration: 0.65, threshold: 36, tail: 0.1,
      boostDuration: 5, boostGrace: 1.5, fuelBurstGrace: 2, superDuration: 20 });

    await setup(page);
    assert.equal((await sample(page)).flight.renderer, 'webgl-chase');
    await advance(page, 4);
    report.samples.initialAcceleration = await sample(page);
    close(report.samples.initialAcceleration.speed, 10.6);
    report.checks.push('Real RAF physics increases ordinary speed from 8 to 10.6 in four seconds');

    await setup(page, { speed: 36 });
    await advance(page, 5);
    report.samples.aboveThreshold = await sample(page);
    close(report.samples.aboveThreshold.speed, 36.5);
    assert.equal(report.samples.aboveThreshold.mode, 'PLAYING');
    report.checks.push('Crossing the former speed ceiling does not cap acceleration: 36 becomes 36.5 in five seconds');

    await setup(page);
    await page.evaluate(() => {
      STATE.track[21].lanes[3] = 'BOOST';
      STATE.track[24].lanes[2] = 'BOOST';
      STATE.track[24].lanes[4] = 'TRIPLE';
      render();
      STATE.boostT = CONFIG.BOOST_DURATION;
      STATE.boostPrevSpeed = STATE.speed;
      render();
    });
    assert.equal((await sample(page)).boostModels, 0);
    assert.equal((await sample(page)).tripleModels, 1);
    await advance(page, 0.05);
    const blockedBoost = await sample(page);
    close(blockedBoost.boostT, 4.95);
    assert.equal(blockedBoost.boostCues, 0);
    assert.equal(await page.evaluate(() => STATE.track[21].lanes[3]), 'ROAD');
    assert.equal(blockedBoost.boostModels, 0);
    report.samples.blockedBoost = blockedBoost;
    await page.screenshot({ path: path.join(evidenceDirectory, 'active_boost_no_duplicate.png') });
    report.checks.push('Active BOOST hides duplicate 3D pickups; a real collision clears the passed token without refreshing time or replaying its sound');

    await page.keyboard.press('p');
    await advance(page, 1);
    const pausedBoost = await sample(page);
    assert.equal(pausedBoost.mode, 'PAUSED');
    close(pausedBoost.boostT, blockedBoost.boostT);
    assert.equal(pausedBoost.boostModels, 0);
    await page.keyboard.press('p');
    await advance(page, 0);
    const boostCanvas = await page.evaluate(() => {
      const original = renderPickup;
      const calls = [];
      renderPickup = function (ctx, type, ...args) { calls.push(type); return original(ctx, type, ...args); };
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.canvas.width = STATE.width; ctx.canvas.height = STATE.height;
      try {
        renderTrack(ctx);
        const active = [...calls]; calls.length = 0;
        STATE.boostT = 0;
        STATE.boostGraceT = CONFIG.BOOST_GRACE;
        STATE.fuelBurstT = 3;
        renderTrack(ctx);
        return { active, inactive: [...calls] };
      } finally { renderPickup = original; render(); }
    });
    assert.ok(!boostCanvas.active.includes('BOOST'));
    assert.ok(boostCanvas.active.includes('TRIPLE'));
    assert.ok(boostCanvas.inactive.includes('BOOST'));
    assert.equal((await sample(page)).boostModels, 1);
    report.samples.boostCanvas = boostCanvas;
    report.checks.push('Pause preserves BOOST suppression; Canvas and WebGL reveal the remaining token immediately after active expiry despite grace or fuel burst');

    await setup(page, { boost: 0.0001 });
    await page.evaluate(() => { STATE.track[20].lanes[3] = 'BOOST'; });
    await advance(page, 0.00005);
    assert.equal(await page.evaluate(() => STATE.track[20].lanes[3]), 'ROAD');
    await advance(page, 0.001);
    assert.equal((await sample(page)).boostT, 0);
    assert.equal((await sample(page)).boostCues, 0);
    report.checks.push('A BOOST token touched during the last 0.0001 seconds cannot retrigger on the same road tile after expiry');

    await setup(page);
    await page.evaluate(() => { STATE.track[21].lanes[3] = 'BOOST'; });
    await advance(page, 0.2);
    const pickedBoost = await sample(page);
    assert.ok(pickedBoost.boostT > 4.8 && pickedBoost.boostT <= 5);
    assert.equal(pickedBoost.boostCues, 1);
    await advance(page, pickedBoost.boostT + 0.01);
    const expiredBoost = await sample(page);
    assert.equal(expiredBoost.boostT, 0);
    close(expiredBoost.boostGraceT, 1.49);
    await page.evaluate(() => {
      STATE.track[Math.floor(STATE.position) + 1].lanes[3] = 'BOOST';
    });
    await advance(page, 0.2);
    const boostInGrace = await sample(page);
    assert.ok(boostInGrace.boostT > 4.8);
    assert.equal(boostInGrace.boostCues, 2);
    report.samples.boostExpiry = { picked: pickedBoost, expired: expiredBoost, reacquired: boostInGrace };
    report.checks.push('A real BOOST lasts five seconds; the remaining 1.5-second shield does not block a newly encountered BOOST after expiry');

    await setup(page);
    await page.evaluate(() => {
      STATE.track[21].lanes[3] = 'TRIPLE';
      STATE.track[24].lanes[2] = 'TRIPLE';
      STATE.track[24].lanes[4] = 'BOOST';
      render();
      STATE.tripleT = 20;
      render();
    });
    assert.equal((await sample(page)).tripleModels, 0);
    assert.equal((await sample(page)).boostModels, 1);
    await page.screenshot({ path: path.join(evidenceDirectory, 'active_super_no_duplicate.png') });
    await advance(page, 0.3);
    const crossed = await sample(page);
    assert.ok(crossed.position > 22);
    close(crossed.tripleT, 19.7);
    report.samples.blockedSuper = crossed;
    report.checks.push('Active super form hides duplicate 3D tokens; crossing one uses real collision logic and cannot refresh its timer');

    const canvas = await page.evaluate(() => {
      const original = renderPickup;
      const calls = [];
      renderPickup = function (ctx, type, ...args) { calls.push(type); return original(ctx, type, ...args); };
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.canvas.width = STATE.width; ctx.canvas.height = STATE.height;
      try {
        renderTrack(ctx);
        const active = [...calls]; calls.length = 0;
        STATE.tripleT = 0;
        renderTrack(ctx);
        return { active, inactive: [...calls] };
      } finally { renderPickup = original; render(); }
    });
    assert.ok(canvas.active.includes('BOOST'));
    assert.ok(!canvas.active.includes('TRIPLE'));
    assert.ok(canvas.inactive.includes('TRIPLE'));
    assert.equal((await sample(page)).tripleModels, 1);
    report.samples.canvasRewards = canvas;
    report.checks.push('Classic Canvas and real WebGL both restore super tokens after expiry while leaving other rewards visible');

    await setup(page, { triple: 0.005 });
    await page.evaluate(() => { STATE.track[20].lanes[3] = 'TRIPLE'; });
    await advance(page, 0.001);
    assert.equal(await page.evaluate(() => STATE.track[20].lanes[3]), 'ROAD');
    await advance(page, 0.02);
    assert.equal((await sample(page)).tripleT, 0);
    report.checks.push('Touching an unavailable token just before expiry consumes only that token, preventing automatic refresh in the same road segment');

    await setup(page);
    await page.evaluate(() => { STATE.track[21].lanes[3] = 'TRIPLE'; });
    await advance(page, 0.2);
    const activated = await sample(page);
    assert.ok(activated.tripleT > 19.8 && activated.tripleT <= 20);
    await advance(page, activated.tripleT - 0.05);
    assert.ok((await sample(page)).tripleT > 0);
    await advance(page, 0.1);
    assert.equal((await sample(page)).tripleT, 0);
    assert.equal((await sample(page)).mode, 'PLAYING');
    report.samples.expiredSuper = await sample(page);
    report.checks.push('An ordinary real pickup activates super form for exactly twenty seconds and then expires');

    await setup(page, { speed: 24, boost: 2.5, triple: 8 });
    await page.evaluate(() => {
      // 实际二段跳进入当前随机高台的虫洞，只清除已隔离夹具中的危险。
      STATE.terrainEnabled = true;
      const gate = Skyroads.wormhole.nextGate(0, Skyroads.flightTerrain);
      STATE.wormhole.gate = gate;
      STATE.position = gate.segment - CONFIG.BOOST_SPEED * 0.45;
      STATE.distanceMeters = STATE.position * CONFIG.DISTANCE_PER_SEGMENT;
      resetMovement(STATE.movement, gate.lane);
      STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, gate.lane);
      STATE.lastTime = __balanceClock.now;
      focusPrimarySurface(); render();
    });
    await page.keyboard.press('Space');
    await advance(page, 14 / 60);
    await page.keyboard.press('k');
    await advance(page, 0.23);
    const warpEntry = await sample(page);
    assert.equal(warpEntry.warpActive, true);
    await advance(page, 0.7);
    const tunnel = await sample(page);
    close(tunnel.boostT, warpEntry.boostT);
    close(tunnel.tripleT, warpEntry.tripleT);
    for (let frame = 0; frame < 180 && (await sample(page)).warpActive; frame += 1) await advance(page, 1 / 60);
    const warpExit = await sample(page);
    assert.equal(warpExit.warpActive, false);
    close(warpExit.boostT, warpEntry.boostT);
    close(warpExit.tripleT, warpEntry.tripleT);
    await page.evaluate(() => {
      STATE.track[Math.floor(STATE.position) + 1].lanes[3] = 'BOOST';
    });
    await advance(page, 0.05);
    const afterWarpPickup = await sample(page);
    close(afterWarpPickup.boostT, warpExit.boostT - 0.05);
    close(afterWarpPickup.tripleT, warpExit.tripleT - 0.05);
    assert.equal(afterWarpPickup.boostCues, 0);
    report.samples.warpTimers = { entry: warpEntry, tunnel, exit: warpExit, afterPickup: afterWarpPickup };
    report.checks.push('A real double-jump warp freezes BOOST and TRIPLE; both resume afterward and a duplicate BOOST at the exit cannot renew the preserved timer');

    await setup(page, { speed: 30, boost: 3 });
    await page.evaluate(() => { STATE.track[21].lanes[3] = 'SLOW'; });
    await advance(page, 0.2);
    const slowed = await sample(page);
    assert.ok(slowed.boostT > 0);
    assert.ok(slowed.cruiseSpeed > 18 && slowed.cruiseSpeed < 18.2);
    close(slowed.speed, 36);
    await advance(page, 3);
    const restoredSlow = await sample(page);
    assert.equal(restoredSlow.boostT, 0);
    assert.ok(restoredSlow.speed > slowed.cruiseSpeed && restoredSlow.speed < 21);
    report.samples.slowDuringBoost = { during: slowed, after: restoredSlow };
    report.checks.push('A real SLOW tile during boost lowers the stored cruise baseline and the reduction survives boost expiry');

    await setup(page, { speed: 45 });
    await page.evaluate(() => { STATE.track[21].lanes[3] = 'BOOST'; });
    await advance(page, 0.2);
    const fastBoost = await sample(page);
    assert.ok(fastBoost.boostT > 0 && fastBoost.speed > 53);
    await advance(page, 5.1);
    const fastCruise = await sample(page);
    assert.equal(fastCruise.boostT, 0);
    close(fastCruise.speed, 45.53);
    report.samples.fastBoost = { during: fastBoost, after: fastCruise };
    report.checks.push('BOOST acquired above its old fixed speed still accelerates the ship; expiry restores a continuously advancing baseline');
    await page.screenshot({ path: path.join(evidenceDirectory, 'uncapped_cruise.png') });
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    fs.writeFileSync(path.join(evidenceDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
  console.log(`Passed ${report.checks.length} cruise balance browser checks; evidence: ${evidenceDirectory}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });

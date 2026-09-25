'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
const evidenceDirectory = path.resolve(process.argv[3] || '/tmp/skyroads_route_randomness');
const report = { url: previewUrl, checks: [], samples: {}, errors: [], fixture: {
  description: 'Real Chrome, WebGL, start/restart/menu controls and deterministic RAF. Five untouched newly generated routes are fingerprinted and their first four center-lane terrain-kind sequences compared independently of height or mirroring. A current-lane wall produces real game over between runs. Later fixtures relocate the ship to existing fuel, ramps, each current-run profile and the current run wormhole; only nearby unrelated hazards are cleared. Profile screenshots render the generated terrain unchanged at the same relative phases, with the real submitted road matrices checked.',
  noProductionState: true,
} };
fs.mkdirSync(evidenceDirectory, { recursive: true });

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function installClock(page) {
  await page.addInitScript(() => {
    let time = performance.now();
    let sequence = 0;
    const callbacks = new Map();
    window.requestAnimationFrame = callback => { callbacks.set(++sequence, callback); return sequence; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    window.__routeClock = {
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
    for (let frame = 0; frame < frames; frame += 1) __routeClock.step(duration * 1000 / frames);
  }, seconds);
}

async function captureRun(page) {
  const snapshot = await page.evaluate(() => {
    const terrain = Skyroads.flightTerrain;
    const heights = [];
    for (let position = 0; position < 600; position += 5) {
      heights.push(Array.from({ length: CONFIG.LANES }, (_, lane) => {
        const surface = terrain.sample(position, lane);
        return [surface.height, surface.kind];
      }));
    }
    const hazards = [];
    const rewards = [];
    for (const segment of STATE.track.slice(0, CONFIG.TRACK_INITIAL_SEGMENTS)) {
      segment.lanes.forEach((type, lane) => {
        if (type === 'GAP' || type.startsWith('WALL_')) hazards.push([segment.index, lane, type]);
        else if (type !== 'ROAD') rewards.push([segment.index, lane, type]);
      });
      for (const enemy of segment.enemies || []) hazards.push([segment.index, enemy.spawnLane ?? enemy.lane, enemy.type, enemy.altitude || 0]);
    }
    const gate = STATE.wormhole.gate;
    const gateRoute = terrain.routeAt(gate.segment);
    // 逐格比较中心路面的类型序列，不能用高度抖动、镜像或种子变化代替结构变化。
    const profiles = Array.from({ length: 4 }, (_, cycle) => {
      const cycleStart = terrain.TUNING.start + cycle * terrain.TUNING.period;
      const { layout } = terrain.routeAt(cycleStart + 100);
      return { cycle, profile: layout.profile, profilePoints: layout.profilePoints,
        islandEnabled: layout.islandEnabled, bridgeGapPhases: layout.bridgeGapPhases,
        centerKinds: Array.from({ length: terrain.TUNING.period }, (_, phase) => terrain.sample(cycleStart + phase, 3).kind) };
    });
    return { mode: STATE.mode, seed: STATE.routeSeed, heights, hazards, rewards,
      gate, gateBranchLanes: gateRoute.branchLanes, profiles,
      gateGroundHeight: terrain.heightAt(gate.segment, gate.lane),
      terrainStart: terrain.TUNING.start, terrainPeriod: terrain.TUNING.period };
  });
  return { mode: snapshot.mode, seed: snapshot.seed, terrainStart: snapshot.terrainStart,
    terrainPeriod: snapshot.terrainPeriod, terrainHash: hash(snapshot.heights), hazardHash: hash(snapshot.hazards),
    rewardHash: hash(snapshot.rewards), hazardCount: snapshot.hazards.length, rewardCount: snapshot.rewards.length,
    gate: snapshot.gate, gateBranchLanes: snapshot.gateBranchLanes, gateGroundHeight: snapshot.gateGroundHeight,
    profiles: snapshot.profiles };
}

async function captureProfileView(page, cycle, phase) {
  return page.evaluate(({ cycle, phase }) => {
    const terrain = Skyroads.flightTerrain;
    STATE.position = terrain.TUNING.start + cycle * terrain.TUNING.period + phase + 0.2;
    STATE.distanceMeters = STATE.position * CONFIG.DISTANCE_PER_SEGMENT;
    resetMovement(STATE.movement, 3);
    STATE.groundHeight = terrain.heightAt(STATE.position, 3);
    STATE.playerY = STATE.playerVY = STATE.jumpsUsed = 0;
    STATE.speed = 0;
    extendTrack();
    // 定点截图只清近处无关危险，地形采样、远处轮廓与真实实例提交保持原样。
    for (const segment of STATE.track.slice(Math.floor(STATE.position), Math.floor(STATE.position) + 4)) {
      segment.lanes[3] = 'ROAD'; segment.enemies = [];
    }
    // 推进显示时钟使 HUD 更新定位后的距离，不推进物理或重新生成路线。
    STATE.time += 0.1;
    render();
    const coordinates = Skyroads.flightRenderer.coordinates;
    const matrix = new THREE.Matrix4();
    const submittedTiles = [];
    for (const ahead of [0, 8, 24]) {
      const index = Math.floor(STATE.position) + ahead;
      const expectedX = coordinates.laneX(3, CONFIG.LANES);
      const expectedZ = coordinates.segmentZ(index, STATE.position);
      const tile = terrain.sampleTile(index, 3);
      let submitted = null;
      for (let slot = 0; slot < __routeRoadMesh.count; slot += 1) {
        __routeRoadMesh.getMatrixAt(slot, matrix);
        if (Math.abs(matrix.elements[12] - expectedX) < 1e-4
          && Math.abs(matrix.elements[14] - expectedZ) < 1e-4) {
          submitted = { actualY: matrix.elements[13], actualShear: matrix.elements[9] };
          break;
        }
      }
      submittedTiles.push({ index, ahead, kind: tile.kind, ...submitted,
        expectedY: coordinates.tileSurfaceY(tile) - 0.40,
        expectedShear: coordinates.heightY(tile.nearHeight - tile.farHeight) });
    }
    const flight = Skyroads.diagnostics.snapshot().flight;
    return { seed: STATE.routeSeed, cycle, phase, profile: terrain.routeAt(STATE.position).layout.profile,
      position: STATE.position, lane: STATE.movement.lanePosition, groundHeight: STATE.groundHeight,
      expectedGround: terrain.heightAt(STATE.position, 3), flightGround: flight.terrain.groundHeight,
      renderer: flight.renderer, terrainEnabled: flight.terrain.enabled, triangles: flight.triangles,
      camera: flight.camera, cameraTarget: flight.cameraTarget, submittedTiles };
  }, { cycle, phase });
}

async function crashForRestart(page) {
  await page.evaluate(() => {
    const lane = Math.round(STATE.movement.lanePosition);
    STATE.track[Math.floor(STATE.position)].lanes[lane] = 'WALL_HIGH';
    focusPrimarySurface();
    STATE.lastTime = __routeClock.now;
  });
  await advance(page, 1 / 60);
  assert.equal(await page.evaluate(() => STATE.mode), 'GAMEOVER');
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
    assert.equal(await page.evaluate(() => Skyroads.diagnostics.snapshot().flight.renderer), 'webgl-chase');

    const runs = [await captureRun(page)];
    for (const entry of ['restart-button', 'restart-key', 'menu-button', 'menu-key']) {
      await crashForRestart(page);
      if (entry === 'restart-button') await page.locator('#restart-mission').click({ force: true });
      else if (entry === 'restart-key') await page.keyboard.press('Enter');
      else {
        if (entry === 'menu-button') await page.locator('#return-menu').click({ force: true });
        else await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => STATE.mode), 'MENU');
        if (entry === 'menu-button') await page.locator('#start-mission').click({ force: true });
        else await page.keyboard.press('Enter');
      }
      runs.push(await captureRun(page));
    }
    for (const run of runs) {
      assert.equal(run.mode, 'PLAYING');
      assert.ok(Number.isInteger(run.seed) && run.seed > 0);
      assert.ok(run.terrainStart >= 48 && run.terrainStart <= 80);
      assert.equal(run.terrainPeriod, 240);
      assert.ok(run.hazardCount > 0 && run.rewardCount > 0);
      assert.ok(run.gateBranchLanes.includes(run.gate.lane));
      close(run.gate.groundHeight, run.gateGroundHeight);
      close(run.gate.height - run.gateGroundHeight, 1550);
    }
    for (const field of ['seed', 'terrainHash', 'hazardHash', 'rewardHash']) {
      assert.equal(new Set(runs.map(run => run[field])).size, 5, `Five real mission starts must yield distinct ${field}`);
    }
    report.samples.runs = runs;
    report.checks.push('Five real start/restart/menu flows generate distinct nonzero seeds and distinct terrain, hazard and reward fingerprints');
    report.checks.push('Every new run positions its wormhole on that run\'s actual high branch at the correct sampled ground height');

    for (const run of runs) {
      assert.deepEqual(run.profiles.map(profile => profile.profile).sort(), ['canyon', 'double_peak', 'long_plateau', 'ridge']);
      assert.equal(new Set(run.profiles.map(profile => JSON.stringify(profile.centerKinds))).size, 4,
        'The first four cycles must have four distinct center-lane terrain-kind sequences without using heights or mirrored lanes');
    }
    report.checks.push('Each real new run includes four structurally distinct center-lane terrain-kind sequences in its first four cycles, independent of height and mirroring');

    const stable = await captureRun(page);
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => STATE.mode), 'PAUSED');
    await advance(page, 2);
    await page.keyboard.press('p');
    await page.evaluate(() => { render(); window.dispatchEvent(new Event('resize')); render(); });
    assert.deepEqual(await captureRun(page), stable);
    report.checks.push('Pause, resume, repeated render and resize preserve the same run seed and all route fingerprints');

    const collected = await page.evaluate(() => {
      const segment = STATE.track.find(row => row.lanes.some((type, lane) => type === 'FUEL'
        && !(row.enemies || []).some(enemy => Math.abs(enemyLane(enemy) - lane) < 0.8)));
      if (!segment) throw new Error('The generated route has no isolated fuel reward');
      const lane = segment.lanes.findIndex((type, index) => type === 'FUEL'
        && !(segment.enemies || []).some(enemy => Math.abs(enemyLane(enemy) - index) < 0.8));
      STATE.position = segment.index + 0.1;
      resetMovement(STATE.movement, lane);
      STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, lane);
      STATE.playerY = STATE.playerVY = 0;
      STATE.speed = 0; CONFIG.ACCEL = 0; STATE.fuel = 50;
      STATE.lastTime = __routeClock.now;
      return { index: segment.index, lane, seed: STATE.routeSeed };
    });
    await advance(page, 1 / 60);
    const refresh = await page.evaluate(({ index, lane }) => {
      const before = JSON.stringify(STATE.track.map(segment => segment.lanes));
      const type = STATE.track[index].lanes[lane];
      const fuel = STATE.fuel;
      enableFlightTerrain(); render(); enableFlightTerrain(); render();
      return { type, fuel, afterType: STATE.track[index].lanes[lane], sameTrack: before === JSON.stringify(STATE.track.map(segment => segment.lanes)), seed: STATE.routeSeed };
    }, collected);
    assert.equal(refresh.type, 'ROAD');
    assert.ok(refresh.fuel > 50);
    assert.equal(refresh.afterType, 'ROAD');
    assert.equal(refresh.sameTrack, true);
    assert.equal(refresh.seed, collected.seed);
    report.samples.collectedReward = { ...collected, ...refresh };
    report.checks.push('A genuinely collected generated fuel tile stays collected after repeated terrain activation and renderer refresh');

    await page.evaluate(() => {
      const original = THREE.InstancedMesh.prototype.setMatrixAt;
      THREE.InstancedMesh.prototype.setMatrixAt = function (...args) {
        if (this.name === 'road_deck') window.__routeRoadMesh = this;
        return original.apply(this, args);
      };
      const terrain = Skyroads.flightTerrain;
      STATE.position = terrain.TUNING.start + terrain.TUNING.branchStart + 5.2;
      const lane = terrain.routeAt(STATE.position).branchLanes[0];
      resetMovement(STATE.movement, lane);
      STATE.groundHeight = terrain.heightAt(STATE.position, lane);
      STATE.playerY = STATE.playerVY = 0; STATE.speed = 8;
      STATE.lastTime = __routeClock.now;
      for (const segment of STATE.track.slice(Math.floor(STATE.position), Math.floor(STATE.position) + 4)) {
        segment.lanes[lane] = 'ROAD'; segment.enemies = [];
      }
    });
    await advance(page, 0.2);
    const surface = await page.evaluate(() => {
      const lane = STATE.movement.lanePosition;
      const index = Math.floor(STATE.position);
      const tile = Skyroads.flightTerrain.sampleTile(index, lane);
      const coordinates = Skyroads.flightRenderer.coordinates;
      const expectedX = coordinates.laneX(lane, CONFIG.LANES);
      const expectedZ = coordinates.segmentZ(index, STATE.position);
      const matrix = new THREE.Matrix4();
      let actualY = null;
      for (let slot = 0; slot < __routeRoadMesh.count; slot += 1) {
        __routeRoadMesh.getMatrixAt(slot, matrix);
        if (Math.abs(matrix.elements[12] - expectedX) < 1e-4 && Math.abs(matrix.elements[14] - expectedZ) < 1e-4) {
          actualY = matrix.elements[13]; break;
        }
      }
      return { seed: STATE.routeSeed, position: STATE.position, lane, groundHeight: STATE.groundHeight,
        expectedGround: Skyroads.flightTerrain.heightAt(STATE.position, lane), actualY,
        expectedY: coordinates.tileSurfaceY(tile) - 0.40, flightGround: Skyroads.diagnostics.snapshot().flight.terrain.groundHeight };
    });
    close(surface.groundHeight, surface.expectedGround);
    close(surface.flightGround, surface.expectedGround);
    assert.notEqual(surface.actualY, null);
    close(surface.actualY, surface.expectedY, 1e-4);
    report.samples.surface = surface;
    await page.screenshot({ path: path.join(evidenceDirectory, 'current_run_terrace.png') });
    report.checks.push('Actual physics ground, live renderer diagnostics and the submitted 3D road matrix match the current run terrain on a branch ramp');

    const profileViews = [];
    for (const profile of runs[runs.length - 1].profiles) {
      for (const phase of [30, 196]) {
        const view = await captureProfileView(page, profile.cycle, phase);
        assert.equal(view.seed, stable.seed);
        assert.equal(view.profile, profile.profile);
        assert.equal(view.renderer, 'webgl-chase');
        assert.equal(view.terrainEnabled, true);
        assert.ok(view.triangles > 0);
        close(view.groundHeight, view.expectedGround);
        close(view.flightGround, view.expectedGround);
        for (const tile of view.submittedTiles) {
          assert.ok(Number.isFinite(tile.actualY), `Missing actual road matrix at segment ${tile.index}`);
          close(tile.actualY, tile.expectedY, 1e-4);
          close(tile.actualShear, tile.expectedShear, 1e-4);
        }
        view.screenshot = `${view.profile}_phase_${phase}.png`;
        await page.screenshot({ path: path.join(evidenceDirectory, view.screenshot) });
        profileViews.push(view);
      }
    }
    report.samples.profileViews = profileViews;
    report.checks.push('Four current-run terrain profiles render at matching phases 30 and 196; actual road heights and slope matrices match near, middle and distant terrain samples');

    const gate = await page.evaluate(() => {
      const gate = STATE.wormhole.gate;
      STATE.position = gate.segment - 24 * 0.45;
      STATE.distanceMeters = STATE.position * CONFIG.DISTANCE_PER_SEGMENT;
      STATE.speed = 24; STATE.fuel = 100;
      resetMovement(STATE.movement, gate.lane);
      STATE.groundHeight = Skyroads.flightTerrain.heightAt(STATE.position, gate.lane);
      STATE.playerY = STATE.playerVY = STATE.jumpsUsed = 0;
      STATE.lastTime = __routeClock.now;
      extendTrack();
      for (const segment of STATE.track.slice(Math.floor(STATE.position), gate.segment + 20)) {
        segment.lanes.fill('ROAD'); segment.enemies = [];
      }
      focusPrimarySurface(); render();
      return { ...gate, seed: STATE.routeSeed };
    });
    await page.keyboard.press('Space');
    await advance(page, 14 / 60);
    await page.keyboard.press('k');
    await advance(page, 0.23);
    const entry = await page.evaluate(() => ({ active: STATE.wormhole.active, seed: STATE.routeSeed,
      jumps: STATE.jumpsUsed, lane: STATE.movement.lanePosition, position: STATE.position,
      flight: Skyroads.diagnostics.snapshot().flight.wormhole }));
    assert.equal(entry.active, true);
    assert.equal(entry.seed, gate.seed);
    assert.equal(entry.jumps, 2);
    close(entry.lane, gate.lane);
    assert.deepEqual(entry.flight.aperture, { rx: 2.65, ry: 1.65, centerOffsetY: 0.76 });
    report.samples.wormhole = { gate, entry };
    await page.screenshot({ path: path.join(evidenceDirectory, 'current_run_wormhole_entry.png') });
    report.checks.push('Real Space then K double jump still enters the dynamically positioned current-run wormhole without changing its visible aperture');

    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    fs.writeFileSync(path.join(evidenceDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
  console.log(`Passed ${report.checks.length} randomized-route browser checks; evidence: ${evidenceDirectory}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });

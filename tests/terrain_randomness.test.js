'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const terrain = require('../src/flight_terrain');
const wormhole = require('../src/wormhole');

const SEEDS = [1, 2, 42, 1337, 20260924, 0xffffffff];

function emptySegment(index) {
  return { index, lanes: Array(7).fill('ROAD'), enemies: [] };
}

function fingerprint(world) {
  return JSON.stringify({ start: world.TUNING.start,
    cycles: Array.from({ length: 6 }, (_, cycle) => {
      const start = world.TUNING.start + cycle * world.TUNING.period;
      return { route: world.routeAt(start + 128),
        samples: [80, 112, 143, 212].map((phase) => world.sample(start + phase, 0)),
        objects: Array.from({ length: 70 }, (_, i) => world.decorateSegment(emptySegment(start + 72 + i)).lanes) };
    }) });
}

test('each seeded four-cycle group changes normalized road structure rather than only height or mirroring', () => {
  const topologies = new Set();
  const profiles = new Set();
  for (const seed of SEEDS) {
    const world = terrain.createForRun(seed);
    for (let group = 0; group < 3; group += 1) {
      const structures = new Set();
      for (let slot = 0; slot < 4; slot += 1) {
        const start = world.TUNING.start + (group * 4 + slot) * 240;
        const layout = world.routeAt(start + 128).layout;
        // 消除峰高、谷深与左右镜像：必须连坡道先后和转折位置都不同。
        structures.add(JSON.stringify(Array.from({ length: 240 }, (_, phase) =>
          world.sample(start + phase, 3).kind)));
        profiles.add(layout.profile);
        topologies.add(JSON.stringify(Array.from({ length: 240 }, (_, phase) => {
          const route = world.routeAt(start + phase);
          return route ? [route.islandStage, route.gapLanes.length] : null;
        })));
      }
      assert.equal(structures.size, 4, `seed ${seed}, group ${group} repeats the same road structure`);
    }
  }
  assert.equal(profiles.size, 4);
  assert.ok(topologies.size >= 4, 'floating islands and bridge gaps must not appear identically every cycle');
});

test('run seeds create independent immutable terrain APIs and different safe layouts', () => {
  const signatures = new Set();
  const sides = new Set();
  const valleys = new Set();
  for (const seed of SEEDS) {
    const world = terrain.createForRun(seed);
    assert.equal(world.seed, seed);
    assert.ok(Object.isFrozen(world) && Object.isFrozen(world.TUNING));
    assert.equal(typeof world.createForRun, 'function');
    assert.ok(world.TUNING.start >= 48 && world.TUNING.start <= 80);
    assert.equal(world.TUNING.period, 240);
    signatures.add(fingerprint(world));
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const layout = world.routeAt(world.TUNING.start + cycle * 240 + 128).layout;
      assert.ok(Object.isFrozen(layout));
      sides.add(layout.primaryLeft);
      valleys.add(layout.valleyDepth);
    }
  }
  assert.equal(signatures.size, SEEDS.length);
  assert.equal(sides.size, 2);
  assert.deepEqual([...valleys].sort((a, b) => a - b), [600, 750, 900]);
  assert.equal(terrain.TUNING.start, 48);
});

test('seeded sampling is independent of query order, other worlds and Math.random', () => {
  const world = terrain.createForRun(1337);
  const points = [0, 49, 90, 160, 511, 4096, 100000].map((position, i) => ({ position, lane: i % 7 }));
  const expected = points.map(({ position, lane }) => ({
    sample: world.sample(position, lane), tile: world.sampleTile(Math.floor(position), lane),
    route: world.routeAt(position), segment: world.decorateSegment(emptySegment(Math.floor(position))),
  }));
  const random = Math.random;
  Math.random = () => { throw new Error('Terrain sampling must not consume random state'); };
  try {
    const replay = terrain.createForRun(1337);
    const unrelated = terrain.createForRun(42);
    // 先跳读大量远景，再回查旧位置；有限布局缓存淘汰不能改变已生成的地图。
    for (let cycle = 0; cycle < 96; cycle += 1) replay.sample(replay.TUNING.start + cycle * 240 + 128, 0);
    for (let i = points.length - 1; i >= 0; i -= 1) {
      const { position, lane } = points[i];
      unrelated.sample(position, lane);
      assert.deepEqual({ sample: replay.sample(position, lane), tile: replay.sampleTile(Math.floor(position), lane),
        route: replay.routeAt(position), segment: replay.decorateSegment(emptySegment(Math.floor(position))) }, expected[i]);
    }
    assert.deepEqual(world.routeAt(4096), replay.routeAt(4096));
  } finally {
    Math.random = random;
  }
});

test('seeded ramps retain continuous seams, bounded heights and a jumpable terrace drop', () => {
  for (const seed of SEEDS) {
    const world = terrain.createForRun(seed);
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const start = world.TUNING.start + cycle * 240;
      const route = world.routeAt(start + 128);
      assert.ok(route.layout.peak >= 2199 && route.layout.peak <= 3120);
      assert.ok(route.layout.branchRise >= 660 && route.layout.branchRise <= 780);
      assert.ok(route.layout.secondaryRise >= 360 && route.layout.secondaryRise <= 480);
      for (const phase of [0, 16, 42, 56, 72, 84, 96, 112, 132, 176, 184, 212, 240]) {
        for (let lane = 0; lane < 7; lane += 1) {
          assert.ok(Math.abs(world.heightAt(start + phase - 1e-7, lane)
            - world.heightAt(start + phase + 1e-7, lane)) < 0.0001,
          `seed ${seed}, cycle ${cycle}, phase ${phase}, lane ${lane}`);
        }
      }
      for (let lane = 0; lane < 7; lane += 1) {
        assert.equal(world.sampleTile(start + 143, lane).dropAtEnd, route.branchLanes.includes(lane));
        for (let phase = 0; phase < 240; phase += 0.75) {
          assert.ok(Math.abs(world.sample(start + phase, lane).slope) <= 117.001);
        }
      }
      assert.equal(world.heightAt(start + 240, 3), 0);
      assert.equal(world.sample(start + 240, 3).slope, 0);
    }
  }
});

test('seeded decoration keeps the center bypass clear and each selected bridge gap two segments long', () => {
  for (const seed of SEEDS) {
    const world = terrain.createForRun(seed);
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const start = world.TUNING.start + cycle * 240;
      const gapCounts = new Map();
      for (let phase = 16; phase < 240; phase += 1) {
        const index = start + phase;
        const route = world.routeAt(index);
        const source = { index, lanes: Array(7).fill('WALL_HIGH'),
          enemies: Array.from({ length: 7 }, (_, lane) => ({ type: 'turret', lane })) };
        const before = JSON.stringify(source);
        const decorated = world.decorateSegment(source);
        assert.equal(JSON.stringify(source), before);
        assert.equal(decorated.lanes[3], 'ROAD');
        for (const lane of route.safeLanes) {
          assert.ok(!/^WALL_|^GAP$/.test(decorated.lanes[lane]));
          assert.ok(!decorated.enemies.some((enemy) => enemy.lane === lane));
        }
        for (const lane of route.gapLanes) assert.equal(decorated.lanes[lane], 'GAP');
        if (route.gapLane !== null) {
          gapCounts.set(route.gapLane, (gapCounts.get(route.gapLane) || 0) + 1);
          assert.ok(route.branchLanes.some((lane) => lane !== route.gapLane && route.safeLanes.includes(lane)));
        }
      }
      const layout = world.routeAt(start + 128).layout;
      assert.equal(gapCounts.size, layout.bridgeGapPhases.length);
      assert.ok([...gapCounts.values()].every((length) => length === 2));
      for (const phase of [108, 126]) {
        assert.equal(world.routeAt(start + phase).gapLane !== null, layout.bridgeGapPhases.includes(phase));
      }
    }
  }
});

test('seeded challenge placement varies without changing the five-crystal and one-super-form budget', () => {
  const placements = new Set();
  const obstaclePlacements = new Set();
  for (const seed of SEEDS) {
    const world = terrain.createForRun(seed);
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const start = world.TUNING.start + cycle * 240;
      const rewards = [];
      const obstacles = [];
      for (let phase = 0; phase < 240; phase += 1) {
        const index = start + phase;
        const route = world.routeAt(index);
        const segment = world.decorateSegment(emptySegment(index));
        for (let lane = 0; lane < 7; lane += 1) {
          const type = segment.lanes[lane];
          if (type === 'FUEL' || type === 'TRIPLE') {
            rewards.push({ phase, lane, type });
            assert.ok(route.safeLanes.includes(lane));
            assert.ok(!route.gapLanes.includes(lane));
          }
          if (type.startsWith('WALL_')) {
            obstacles.push({ phase, lane, type });
            assert.ok(!route.safeLanes.includes(lane));
            assert.ok(!route.gapLanes.includes(lane));
          }
        }
      }
      assert.equal(rewards.filter(({ type }) => type === 'FUEL').length, 5);
      assert.equal(rewards.filter(({ type }) => type === 'TRIPLE').length, 1);
      assert.deepEqual(obstacles.map(({ type }) => type), ['WALL_LOW', 'WALL_MEDIUM', 'WALL_HIGH']);
      placements.add(JSON.stringify(rewards));
      obstaclePlacements.add(JSON.stringify(obstacles));
    }
  }
  assert.ok(placements.size > 20);
  assert.ok(obstaclePlacements.size > 20);
});

test('seeded worlds retain floating-island boundaries and safe high-platform wormhole runways', () => {
  const islandModes = new Set();
  for (const seed of SEEDS) {
    const world = terrain.createForRun(seed);
    let after = 0;
    let previous = null;
    for (let count = 0; count < 12; count += 1) {
      const gate = wormhole.nextGate(after, world);
      assert.equal(gate.segment, world.TUNING.start + gate.cycle * 240 + 128);
      if (previous) assert.ok([1440, 1680].includes(gate.segment - previous.segment));
      const route = world.routeAt(gate.segment);
      islandModes.add(route.layout.islandEnabled);
      assert.deepEqual(route.branchLanes, route.layout.primaryLeft ? [0, 1] : [5, 6]);
      assert.equal(gate.lane, route.branchLanes[0]);
      assert.equal(gate.groundHeight, world.heightAt(gate.segment, gate.lane));
      assert.ok(Math.abs(gate.height - gate.groundHeight - 1550) < 1e-6);
      assert.ok(gate.height - 300 > 3 * 7500 ** 2 / (2 * 32000));
      assert.ok(1550 - 300 > 7500 ** 2 / (2 * 32000));
      for (let index = gate.segment - 16; index <= gate.segment; index += 1) {
        const segment = world.decorateSegment({ index, lanes: Array(7).fill('WALL_HIGH'), enemies: [] });
        assert.ok(!/^WALL_|^GAP$/.test(segment.lanes[gate.lane]));
        assert.equal(world.heightAt(index, gate.lane), gate.groundHeight);
      }
      const cycleStart = world.TUNING.start + gate.cycle * 240;
      for (let phase = 96; phase <= 132; phase += 1) {
        assert.equal(world.heightAt(cycleStart + phase, gate.lane), gate.groundHeight);
      }
      for (let phase = 114; phase < 138; phase += 1) {
        const islandRoute = world.routeAt(cycleStart + phase);
        const segment = world.decorateSegment(emptySegment(cycleStart + phase));
        const enabled = route.layout.islandEnabled;
        assert.equal(segment.lanes[islandRoute.islandSideLane] === 'GAP', enabled);
        assert.equal(segment.lanes[islandRoute.islandLane] === 'GAP', enabled && (phase < 116 || phase >= 136));
        assert.equal(world.sample(cycleStart + phase, islandRoute.islandLane).kind === 'floating_island',
          enabled && phase >= 116 && phase < 136);
        if (!enabled) assert.equal(islandRoute.islandStage, null);
      }
      previous = gate;
      after = gate.segment;
    }
  }
  assert.deepEqual([...islandModes].sort(), [false, true]);
});

test('seed zero preserves legacy terrain heights, sides, rewards and obstacle slots', () => {
  const world = terrain.createForRun(0);
  assert.equal(world.TUNING.start, 48);
  assert.equal(fingerprint(world), fingerprint(terrain));
  for (let cycle = 0; cycle < 8; cycle += 1) {
    const start = 48 + cycle * 240;
    const primary = cycle % 2 === 0 ? [0, 1] : [5, 6];
    const island = cycle % 2 === 0 ? 6 : 0;
    assert.deepEqual(world.routeAt(start + 128).branchLanes, primary);
    assert.equal(world.heightAt(start + 112, 3), 2340 + Math.min(cycle, 6) * 130);
    assert.equal(world.sample(start + 112, primary[0]).offset, 660 + Math.min(cycle, 3) * 40);
    assert.equal(world.heightAt(start + 212, 3), -(600 + cycle % 3 * 150));
    const rewards = [];
    const walls = [];
    for (let phase = 0; phase < 240; phase += 1) {
      const segment = world.decorateSegment(emptySegment(start + phase));
      segment.lanes.forEach((type, lane) => {
        if (type === 'FUEL') rewards.push(phase);
        if (type.startsWith('WALL_')) walls.push(phase);
        if (type === 'TRIPLE') assert.deepEqual([phase, lane], cycle % 2 === 0 ? [114, primary[0]] : [127, island]);
      });
    }
    assert.deepEqual(rewards, [78, 96, 120, 121, 132]);
    assert.deepEqual(walls, [82, 94, 118]);
  }
});

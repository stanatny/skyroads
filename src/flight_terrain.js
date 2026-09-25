'use strict';

// 三维航道高程与物理共享同一确定性采样；单位沿用原游戏世界高度。
(function attachFlightTerrain(scope) {
  const dimensions = scope.Skyroads && scope.Skyroads.flightDimensions
    || (typeof require === 'function' ? require('./flight_dimensions') : null);
  const BASE_TUNING = Object.freeze({
    start: 48,
    period: 240,
    branchStart: 72,
    branchTop: 96,
    branchDrop: 144,
    safeStart: 16,
    safeEnd: 240,
    landingEnd: 184,
    bridgeGapLength: 2,
    islandLaunch: 112,
    islandGapStart: 114,
    islandStart: 116,
    islandEnd: 136,
    islandLanding: 138,
    islandLandingEnd: 160,
    playerHalfWidth: 0.14,
    terrainSideHalfWidth: dimensions.terrainSideHalfWidth,
    gunHeight: 100,
  });

  /** createForRun 接收无符号整数种子，返回独立且不可变的本局地形 API；零种子保留原始关卡。 */
  function createForRun(value = 0) {
    const seed = Number(value) >>> 0;
    const TUNING = Object.freeze({ ...BASE_TUNING,
      start: seed === 0 ? BASE_TUNING.start : BASE_TUNING.start + hash(seed, 0, 1) % 33 });
    const layouts = new Map();

    // 布局只由种子和周期推导。有限缓存仅省去重复构造，任意顺序采样或折跃不会改变地图。
    function layoutAt(cycle) {
      if (layouts.has(cycle)) return layouts.get(cycle);
      const legacy = seed === 0;
      const choose = (salt, size) => hash(seed, cycle, salt) % size;
      const primaryLeft = legacy ? cycle % 2 === 0 : choose(2, 2) === 0;
      const branch = primaryLeft ? [0, 1] : [5, 6];
      const secondary = primaryLeft ? [5, 6] : [0, 1];
      const islandLane = primaryLeft ? 6 : 0;
      const combatLane = primaryLeft ? 2 : 4;
      const peak = (2340 + Math.min(cycle, 6) * 130) * (legacy ? 1 : 0.94 + choose(3, 4) * 0.02);
      const branchRise = legacy ? 660 + Math.min(cycle, 3) * 40 : 660 + choose(4, 4) * 40;
      const secondaryRise = 360 + (legacy ? cycle % 3 : choose(5, 3)) * 60;
      const valleyDepth = 600 + (legacy ? cycle % 3 : choose(6, 3)) * 150;
      const profile = legacy ? 'ridge' : profileForCycle(cycle);
      const profilePoints = pointsForProfile(profile, peak, valleyDepth);
      const islandEnabled = legacy || choose(20, 3) !== 0;
      const bridgeGapPhases = Object.freeze([108, 126]
        .filter((phase, index) => legacy || choose(21 + index, 2) === 0));
      const obstacles = [
        { phase: legacy ? 82 : 80 + choose(7, 5), lane: combatLane, type: 'WALL_LOW' },
        { phase: legacy ? 94 : 92 + choose(8, 6), lane: combatLane, type: 'WALL_MEDIUM' },
        { phase: legacy ? 118 : 116 + choose(9, 7), lane: combatLane, type: 'WALL_HIGH' },
      ];
      const onIsland = islandEnabled && (legacy ? cycle % 2 === 1 : choose(10, 2) === 1);
      const rewards = [
        { phase: legacy ? 78 : 76 + choose(11, 5), lane: secondary[1], type: 'FUEL' },
        { phase: legacy ? 96 : 96 + choose(12, 7), lane: branch[0], type: 'FUEL' },
        { phase: legacy ? 120 : 118 + choose(13, 6), lane: branch[0], type: 'FUEL' },
        { phase: legacy ? 121 : 120 + choose(14, 5), lane: islandEnabled ? islandLane : branch[1], type: 'FUEL' },
        { phase: legacy ? 132 : 132 + choose(15, 8), lane: branch[1], type: 'FUEL' },
        { phase: onIsland ? (legacy ? 127 : 126 + choose(16, 6)) : (legacy ? 114 : 112 + choose(17, 5)),
          lane: onIsland ? islandLane : branch[0], type: 'TRIPLE' },
      ];
      const layout = Object.freeze({ primaryLeft, peak, branchRise, secondaryRise, valleyDepth,
        profile, profilePoints, islandEnabled, bridgeGapPhases,
        obstacles: Object.freeze(obstacles.map(Object.freeze)), rewards: Object.freeze(rewards.map(Object.freeze)) });
      if (layouts.size >= 64) layouts.delete(layouts.keys().next().value);
      layouts.set(cycle, layout);
      return layout;
    }

    // 每四周期包含全部四种主路结构，组内顺序由种子决定；跳读远处也不消耗生成器随机流。
    function profileForCycle(cycle) {
      const profiles = ['ridge', 'canyon', 'double_peak', 'long_plateau'];
      const group = Math.floor(cycle / profiles.length);
      for (let index = profiles.length - 1; index > 0; index -= 1) {
        const other = hash(seed, group, 30 + index) % (index + 1);
        [profiles[index], profiles[other]] = [profiles[other], profiles[index]];
      }
      return profiles[cycle % profiles.length];
    }

    // 所有蓝图在 96～132 保留水平高台，兼容虫洞二跳助跑、断桥与浮岛入口。
    function pointsForProfile(profile, peak, depth) {
      let points;
      if (profile === 'canyon') {
        points = [[0, 0], [16, -depth], [32, 0], [88, peak], [132, peak], [176, 0], [240, 0]];
      } else if (profile === 'double_peak') {
        points = [[0, 0], [40, peak * 0.9], [64, peak * 0.55], [96, peak],
          [132, peak], [176, 0], [212, -depth], [240, 0]];
      } else if (profile === 'long_plateau') {
        points = [[0, 0], [16, 0], [96, peak], [156, peak], [208, 0], [240, 0]];
      } else {
        points = [[0, 0], [16, 0], [56, peak], [132, peak], [176, 0], [184, 0], [212, -depth], [240, 0]];
      }
      return Object.freeze(points.map(Object.freeze));
    }

    function sampleProfile(phase, points) {
      for (let index = 0; index < points.length - 1; index += 1) {
        const [start, from] = points[index];
        const [end, to] = points[index + 1];
        if (phase < start || phase >= end) continue;
        const ramp = smoothRamp((phase - start) / (end - start));
        const delta = to - from;
        // 转折点坡率为零，但区段类型取决于两端高度，避免临界点标签反复跳变。
        const kind = delta > 0 ? 'ramp_up' : delta < 0 ? 'ramp_down' : from === 0 ? 'flat' : 'plateau';
        return { height: from + delta * ramp.height,
          slope: ramp.slope === 0 ? 0 : delta * ramp.slope / (end - start), kind };
      }
      return { height: 0, slope: 0, kind: 'flat' };
    }

    function sampleBase(phase, layout) {
      if (seed !== 0) return sampleProfile(phase, layout.profilePoints);
      // 零种子沿用原算式，保留旧关卡和物理夹具的所有边界行为。
      const peak = layout.peak;
      let baseHeight = 0;
      let slope = 0;
      let kind = 'flat';
      if (phase >= 16 && phase < 56) {
        const ramp = smoothRamp((phase - 16) / 40);
        baseHeight = peak * ramp.height;
        slope = peak * ramp.slope / 40;
        kind = 'ramp_up';
      } else if (phase >= 56 && phase < 132) {
        baseHeight = peak;
        kind = 'plateau';
      } else if (phase >= 132 && phase < 176) {
        const ramp = smoothRamp((phase - 132) / 44);
        baseHeight = peak * (1 - ramp.height);
        slope = -peak * ramp.slope / 44;
        kind = 'ramp_down';
      }
      if (phase >= 184) {
        const depth = layout.valleyDepth;
        const descending = phase < 212;
        const ramp = smoothRamp((phase - (descending ? 184 : 212)) / 28);
        baseHeight = -depth * (descending ? ramp.height : 1 - ramp.height);
        slope = depth * ramp.slope / 28 * (descending ? -1 : 1);
        kind = descending ? 'ramp_down' : 'ramp_up';
      }
      return { height: baseHeight, slope, kind };
    }

    /** sample 采样位置与车道的高程、坡率和层级；返回值只依赖本局种子、位置与车道。 */
    function sample(position, lane = 3) {
      const p = Math.max(0, Number(position) || 0);
      if (p < TUNING.start) return { height: 0, baseHeight: 0, offset: 0, slope: 0, kind: 'flat', raised: false };
      const cycle = Math.floor((p - TUNING.start) / TUNING.period);
      const phase = (p - TUNING.start) % TUNING.period;
      const layout = layoutAt(cycle);
      const base = sampleBase(phase, layout);
      const baseHeight = base.height;
      let slope = base.slope;
      let kind = base.kind;
      const supportLane = laneIndex(lane);
      const branchLane = layout.primaryLeft ? supportLane <= 1 : supportLane >= 5;
      let offset = 0;
      if (branchLane && phase >= TUNING.branchStart && phase < TUNING.branchDrop) {
        // 主高坡整体抬升，横向可跳的台差仍限制在一次正常跳跃内。
        const rise = layout.branchRise;
        const ramp = smoothRamp((phase - TUNING.branchStart) / (TUNING.branchTop - TUNING.branchStart));
        offset = rise * ramp.height;
        slope += rise * ramp.slope / (TUNING.branchTop - TUNING.branchStart);
        kind = phase < TUNING.branchTop ? 'ramp_up' : 'terrace';
      }
      // 对侧较低的支路错开入口和出口，形成可选择的双层路线；独立缓坡不要求横撞高台。
      const secondaryLane = layout.primaryLeft ? supportLane >= 5 : supportLane <= 1;
      if (secondaryLane && phase >= 42 && phase < 112) {
        const rise = layout.secondaryRise;
        const descending = phase >= 84;
        const span = descending ? 28 : 30;
        const ramp = smoothRamp((phase - (descending ? 84 : 42)) / span);
        offset = rise * (descending ? 1 - ramp.height : ramp.height);
        slope += rise * ramp.slope / span * (descending ? -1 : 1);
        kind = descending ? 'ramp_down' : phase < 72 ? 'ramp_up' : 'terrace';
      }
      const islandLane = layout.primaryLeft ? 6 : 0;
      if (layout.islandEnabled && supportLane === islandLane && phase >= TUNING.islandStart && phase < TUNING.islandEnd) {
        kind = 'floating_island';
      }
      return { height: baseHeight + offset, baseHeight, offset, slope, kind, raised: offset > 0 };
    }

    /** heightAt 返回指定连续纵向位置和支撑车道的地面高度。 */
    function heightAt(position, lane = 3) {
      return sample(position, lane).height;
    }

    /** sampleTile 返回路块近端、远端高程；断层远端取左极限，不跨空隙补成斜坡。 */
    function sampleTile(index, lane = 3) {
      const near = sample(index, lane);
      const far = sample(index + 1 - 1e-7, lane);
      const next = sample(index + 1, lane);
      return {
        nearHeight: near.height,
        farHeight: far.height,
        kind: near.raised ? near.kind : far.raised ? far.kind : near.kind,
        raised: near.raised || far.raised,
        dropAtEnd: far.height - next.height > 1,
      };
    }

    /**
     * transition 计算一个物理子步进入新地面后的相对跳高，不修改输入。
     * 贴地沿纵向缓坡前进；空中保留绝对高度；横切高台检查船体边缘；离开台阶自由下落。
     */
    function transition({ previousPosition, position, previousLane, lane, groundHeight,
      playerY, playerVY, jumpsUsed = 0, invincible = false, wasGrounded }) {
      const oldGround = Number.isFinite(groundHeight) ? groundHeight : heightAt(previousPosition, previousLane);
      const nextGround = heightAt(position, lane);
      const oldLane = laneIndex(previousLane);
      const newLane = laneIndex(lane);
      const grounded = wasGrounded === undefined ? playerY <= 0.001 && playerVY <= 0 : wasGrounded;
      const crossedBoundary = Math.floor(previousPosition) !== Math.floor(position);
      const drop = (crossedBoundary && sampleTile(Math.floor(previousPosition), oldLane).dropAtEnd)
        || (oldLane !== newLane && nextGround < heightAt(position, previousLane) - 1);
      const followsSlope = grounded && oldLane === newLane && !drop;
      const absoluteY = followsSlope ? nextGround : oldGround + playerY;

      // 只检查正在接近的台边：离开高台时，船尾仍覆盖原高台不应被误判为迎面碰撞。
      const direction = Math.sign(lane - previousLane);
      let blockedLane = lane;
      if (!invincible && direction !== 0) {
        const low = Math.min(previousLane, lane) - TUNING.terrainSideHalfWidth;
        const high = Math.max(previousLane, lane) + TUNING.terrainSideHalfWidth;
        const previousSurfaceHere = heightAt(position, previousLane);
        for (let candidate = 0; candidate < 7; candidate += 1) {
          if (candidate === oldLane || (candidate - previousLane) * direction <= 0
            || candidate + 0.5 < low || candidate - 0.5 > high) continue;
          const edgeHeight = heightAt(position, candidate);
          if (edgeHeight <= previousSurfaceHere + 1 || absoluteY >= edgeHeight - 0.001) continue;
          const edge = candidate - direction * (0.5 + TUNING.terrainSideHalfWidth + 1e-6);
          blockedLane = direction > 0 ? Math.min(blockedLane, edge)
            : Math.max(blockedLane, edge);
        }
        if (blockedLane !== lane) {
          // 被台边挡住后继续纵向飞行；使用同一采样完成所在坡面上的落地与高度更新。
          const stopped = transition({ previousPosition, position, previousLane, lane: blockedLane,
            groundHeight, playerY, playerVY, jumpsUsed, invincible: true, wasGrounded });
          return { ...stopped, lane: blockedLane, blocked: true };
        }
      }

      const relative = invincible && grounded && nextGround > absoluteY ? 0 : absoluteY - nextGround;
      const falling = grounded && relative > 0.001 && !followsSlope;
      const landed = relative < 0 || (relative <= 0 && playerVY <= 0);
      return {
        groundHeight: nextGround,
        playerY: Math.max(0, relative),
        playerVY: landed ? 0 : playerVY,
        jumpsUsed: landed ? 0 : falling ? Math.max(1, jumpsUsed) : jumpsUsed,
        blocked: false,
        falling,
      };
    }

    /** routeAt 返回路线分区和可通过车道，供生成器、关卡验证和预览诊断共用。 */
    function routeAt(position) {
      const cycle = Math.floor((position - TUNING.start) / TUNING.period);
      const phase = (position - TUNING.start) % TUNING.period;
      if (cycle < 0 || phase < TUNING.safeStart) return null;
      const layout = layoutAt(cycle);
      const branchLanes = layout.primaryLeft ? [0, 1] : [5, 6];
      const secondaryLanes = layout.primaryLeft ? [5, 6] : [0, 1];
      const base = sampleBase(phase, layout);
      const section = seed === 0
        ? (phase < 72 ? 'split_climb' : phase < 144 ? 'broken_bridge' : phase < 184 ? 'landing' : 'valley')
        : base.height < 0 ? 'valley' : base.kind;
      // 分支入口与断层落地保留横移余量，其余区间保留一条低层中心通道。
      const safeLanes = phase < 72 || (phase >= 144 && phase < 184) || phase >= 228
        ? [0, 1, 2, 3, 4, 5, 6]
        : phase < 144 ? [3, ...branchLanes, ...(phase < 112 ? secondaryLanes : [])] : [3];
      let gapLane = null;
      if (layout.bridgeGapPhases.includes(108) && phase >= 108 && phase < 110) gapLane = branchLanes[0];
      if (layout.bridgeGapPhases.includes(126) && phase >= 126 && phase < 128) gapLane = branchLanes[1];
      // 外侧浮岛前后各断两格、内侧整段留空；另一侧即航道边界，四周均无连接桥面。
      const islandLane = layout.primaryLeft ? 6 : 0;
      const islandSideLane = layout.primaryLeft ? 5 : 1;
      const gapLanes = gapLane === null ? [] : [gapLane];
      let islandStage = null;
      if (layout.islandEnabled && phase >= TUNING.islandLaunch && phase < TUNING.islandLandingEnd) {
        islandStage = phase < TUNING.islandGapStart ? 'launch'
          : phase < TUNING.islandStart ? 'entry_gap'
            : phase < TUNING.islandEnd ? 'island'
              : phase < TUNING.islandLanding ? 'exit_gap' : 'landing';
        if (!safeLanes.includes(islandLane)) safeLanes.push(islandLane);
        if (phase >= TUNING.islandGapStart && phase < TUNING.islandLanding) gapLanes.push(islandSideLane);
        if (islandStage === 'entry_gap' || islandStage === 'exit_gap') gapLanes.push(islandLane);
      }
      return { cycle, phase, layout, section, branchLanes, secondaryLanes, gapLane, gapLanes,
        islandLane, islandSideLane, islandStage,
        safeLanes: safeLanes.filter((lane) => !gapLanes.includes(lane)) };
    }

    /** dronePatrolLanes 接收路段和可选起点车道，返回避开安全通道、障碍与道具的同层巡逻车道。 */
    function dronePatrolLanes(segment, fromLane) {
      const safeLanes = new Set(routeAt(segment.index)?.safeLanes || []);
      return segment.lanes.flatMap((type, lane) => {
        if (type !== 'ROAD' || safeLanes.has(lane)) return [];
        if (Number.isFinite(fromLane)
          && Math.abs(heightAt(segment.index, lane) - heightAt(segment.index, fromLane)) > 1) return [];
        return [lane];
      });
    }

    /** decorateSegment 将双层支路、交错断桥及谷地组合到原生成器，同时保留连续绕行路线。 */
    function decorateSegment(segment) {
      const route = routeAt(segment.index);
      if (!route) return segment;
      const { cycle, phase, layout, branchLanes, gapLanes, islandLane } = route;
      const safeLanes = new Set(route.safeLanes);
      const lanes = segment.lanes.map((type, lane) => safeLanes.has(lane)
        && (type === 'GAP' || type.startsWith('WALL_')) ? 'ROAD' : type);
      // 两条高架道交错断开，每次仅缺两段；相邻桥面始终连续，可跳过或提前换道。
      for (const lane of gapLanes) lanes[lane] = 'GAP';
      // 挑战墙只在非安全侧道的小窗口变换位置，不侵入高架、中心绕行或浮岛缺口。
      for (const obstacle of layout.obstacles) {
        if (phase === obstacle.phase) lanes[obstacle.lane] = obstacle.type;
      }
      // 每周期仍只有五枚额外晶体及一次变身候选，变身间距由外层生成器统一限制。
      for (const reward of layout.rewards) {
        if (phase === reward.phase) lanes[reward.lane] = reward.type;
      }
      // 零种子保留旧夹具的空奖励槽位行为；随机局不擦除原生成器在其他位置的补给。
      if (seed === 0 && phase === 114 && cycle % 2 === 1) lanes[branchLanes[0]] = 'ROAD';
      if (seed === 0 && phase === 127 && cycle % 2 === 0) lanes[islandLane] = 'ROAD';
      const patrolLanes = new Set(dronePatrolLanes({ ...segment, lanes }));
      return {
        ...segment,
        lanes,
        // 无人机保留在合法挑战车道，后续巡逻沿用同一约束；切换三维时也排除正在闯入安全道的敌机。
        enemies: segment.enemies ? segment.enemies.filter((enemy) => {
          if (enemy.type !== 'drone') return enemy.type === 'turret'
            && !safeLanes.has(Math.round(enemy.lane)) && !gapLanes.includes(Math.round(enemy.lane));
          const fromLane = Number.isFinite(enemy.fromLane) ? enemy.fromLane : enemy.lane;
          const toLane = enemy.state === 'move' || enemy.state === 'warn' ? enemy.toLane : fromLane;
          return patrolLanes.has(fromLane) && patrolLanes.has(toLane);
        }) : segment.enemies,
      };
    }

    function smoothRamp(value) {
      const t = Math.max(0, Math.min(1, value));
      return { height: t * t * (3 - 2 * t), slope: t > 0 && t < 1 ? 6 * t * (1 - t) : 0 };
    }

    function laneIndex(lane) {
      return Math.max(0, Math.min(6, Math.floor((Number(lane) || 0) + 0.5)));
    }

    return Object.freeze({ seed, TUNING, createForRun, sample, heightAt, sampleTile, transition, routeAt, dronePatrolLanes, decorateSegment });
  }

  // 独立整数混合不会消耗游戏或特效的随机数，也不受地形查询次数影响。
  function hash(seed, cycle, salt) {
    let value = (seed ^ Math.imul(cycle + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  }

  const api = createForRun(0);
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightTerrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

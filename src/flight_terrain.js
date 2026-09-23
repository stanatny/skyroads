'use strict';

// 三维航道高程与物理共享同一确定性采样；单位沿用原游戏世界高度。
(function attachFlightTerrain(scope) {
  const dimensions = scope.Skyroads && scope.Skyroads.flightDimensions
    || (typeof require === 'function' ? require('./flight_dimensions') : null);
  const TUNING = Object.freeze({
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

  /** sample 采样位置与车道的高程、坡率和层级；返回值不依赖游戏状态或随机数。 */
  function sample(position, lane = 3) {
    const p = Math.max(0, Number(position) || 0);
    if (p < TUNING.start) return { height: 0, baseHeight: 0, offset: 0, slope: 0, kind: 'flat', raised: false };
    const cycle = Math.floor((p - TUNING.start) / TUNING.period);
    const phase = (p - TUNING.start) % TUNING.period;
    const peak = 2340 + Math.min(cycle, 6) * 130;
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
    // 主高架之后进入连续谷地，三种深度交替，末端以零坡率接回下一段。
    if (phase >= 184) {
      const depth = 600 + cycle % 3 * 150;
      const descending = phase < 212;
      const ramp = smoothRamp((phase - (descending ? 184 : 212)) / 28);
      baseHeight = -depth * (descending ? ramp.height : 1 - ramp.height);
      slope = depth * ramp.slope / 28 * (descending ? -1 : 1);
      kind = descending ? 'ramp_down' : 'ramp_up';
    }
    const supportLane = laneIndex(lane);
    const branchLane = cycle % 2 === 0 ? supportLane <= 1 : supportLane >= 5;
    let offset = 0;
    if (branchLane && phase >= TUNING.branchStart && phase < TUNING.branchDrop) {
      // 主高坡整体抬升，横向可跳的台差仍限制在一次正常跳跃内。
      const rise = 660 + Math.min(cycle, 3) * 40;
      const ramp = smoothRamp((phase - TUNING.branchStart) / (TUNING.branchTop - TUNING.branchStart));
      offset = rise * ramp.height;
      slope += rise * ramp.slope / (TUNING.branchTop - TUNING.branchStart);
      kind = phase < TUNING.branchTop ? 'ramp_up' : 'terrace';
    }
    // 对侧较低的支路错开入口和出口，形成可选择的双层路线；独立缓坡不要求横撞高台。
    const secondaryLane = cycle % 2 === 0 ? supportLane >= 5 : supportLane <= 1;
    if (secondaryLane && phase >= 42 && phase < 112) {
      const rise = 360 + cycle % 3 * 60;
      const descending = phase >= 84;
      const span = descending ? 28 : 30;
      const ramp = smoothRamp((phase - (descending ? 84 : 42)) / span);
      offset = rise * (descending ? 1 - ramp.height : ramp.height);
      slope += rise * ramp.slope / span * (descending ? -1 : 1);
      kind = descending ? 'ramp_down' : phase < 72 ? 'ramp_up' : 'terrace';
    }
    const islandLane = cycle % 2 === 0 ? 6 : 0;
    if (supportLane === islandLane && phase >= TUNING.islandStart && phase < TUNING.islandEnd) {
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
    const branchLanes = cycle % 2 === 0 ? [0, 1] : [5, 6];
    const secondaryLanes = cycle % 2 === 0 ? [5, 6] : [0, 1];
    const section = phase < 72 ? 'split_climb' : phase < 144 ? 'broken_bridge'
      : phase < 184 ? 'landing' : 'valley';
    // 分支入口与断层落地保留横移余量，其余区间保留一条低层中心通道。
    const safeLanes = phase < 72 || (phase >= 144 && phase < 184) || phase >= 228
      ? [0, 1, 2, 3, 4, 5, 6]
      : phase < 144 ? [3, ...branchLanes, ...(phase < 112 ? secondaryLanes : [])] : [3];
    let gapLane = null;
    if (phase >= 108 && phase < 110) gapLane = branchLanes[0];
    if (phase >= 126 && phase < 128) gapLane = branchLanes[1];
    // 外侧浮岛前后各断两格、内侧整段留空；另一侧即航道边界，四周均无连接桥面。
    const islandLane = cycle % 2 === 0 ? 6 : 0;
    const islandSideLane = cycle % 2 === 0 ? 5 : 1;
    const gapLanes = gapLane === null ? [] : [gapLane];
    let islandStage = null;
    if (phase >= TUNING.islandLaunch && phase < TUNING.islandLandingEnd) {
      islandStage = phase < TUNING.islandGapStart ? 'launch'
        : phase < TUNING.islandStart ? 'entry_gap'
          : phase < TUNING.islandEnd ? 'island'
            : phase < TUNING.islandLanding ? 'exit_gap' : 'landing';
      if (!safeLanes.includes(islandLane)) safeLanes.push(islandLane);
      if (phase >= TUNING.islandGapStart && phase < TUNING.islandLanding) gapLanes.push(islandSideLane);
      if (islandStage === 'entry_gap' || islandStage === 'exit_gap') gapLanes.push(islandLane);
    }
    return { cycle, phase, section, branchLanes, secondaryLanes, gapLane, gapLanes,
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
    const { cycle, phase, branchLanes, secondaryLanes, gapLane, gapLanes, islandLane } = route;
    const safeLanes = new Set(route.safeLanes);
    const lanes = segment.lanes.map((type, lane) => safeLanes.has(lane)
      && (type === 'GAP' || type.startsWith('WALL_')) ? 'ROAD' : type);
    // 两条高架道交错断开，每次仅缺两段；相邻桥面始终连续，可跳过或提前换道。
    for (const lane of gapLanes) lanes[lane] = 'GAP';
    // 中层侧道按低障碍、装甲墙、防御塔递进；玩家可用跃升或导弹开路。
    const combatLane = route.cycle % 2 === 0 ? 2 : 4;
    if (phase === 82) lanes[combatLane] = 'WALL_LOW';
    if (phase === 94) lanes[combatLane] = 'WALL_MEDIUM';
    if (phase === 118) lanes[combatLane] = 'WALL_HIGH';
    // 挑战支路减少连续补给；每轮仍保留高架、次级支路与浮岛上的五枚晶体。
    if (phase >= 96 && phase < 144 && phase % 24 === 0) {
      const rewardLane = gapLane === branchLanes[0] ? branchLanes[1] : branchLanes[0];
      lanes[rewardLane] = 'FUEL';
    }
    // 固定变身奖励每轮只出现一次，高架与浮岛轮流承载；空轮的位置恢复路面。
    if (phase === 114) lanes[branchLanes[0]] = cycle % 2 === 0 ? 'TRIPLE' : 'ROAD';
    if (phase === 132) lanes[branchLanes[1]] = 'FUEL';
    if (phase === 78) lanes[secondaryLanes[1]] = 'FUEL';
    // 奖励留在可落地的岛面中段，入口、出口和侧边缺口没有道具或敌人。
    if (phase === 121) lanes[islandLane] = 'FUEL';
    if (phase === 127) lanes[islandLane] = cycle % 2 === 1 ? 'TRIPLE' : 'ROAD';
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

  const api = Object.freeze({ TUNING, sample, heightAt, sampleTile, transition, routeAt, dronePatrolLanes, decorateSegment });
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightTerrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

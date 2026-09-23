'use strict';

// 虫洞调度与入口判定共用世界坐标，不读取或修改玩家、燃料及渲染状态。
(function attachWormhole(scope) {
  const TUNING = Object.freeze({
    distanceMeters: 6000,
    duration: 2.4,
    graceDuration: 2,
    announceMeters: 1000,
    firstCycle: 4,
    entryPhase: 128,
    entryHeight: 1550,
    halfWidth: 0.34,
    halfHeight: 240,
    captureLanePadding: 0.08,
    captureHeightPadding: 60,
    runwaySegments: 16,
    safeExitMeters: 600,
    captureEnd: 0.25,
    tearEnd: 0.45,
    tunnelEnd: 2.05,
  });

  /** nextGate 返回指定进度之后的首个入口；进度为路段单位，height 为绝对世界高度。 */
  function nextGate(afterPosition, terrain = defaultTerrain()) {
    if (!Number.isFinite(afterPosition) || !terrain || !terrain.TUNING
      || typeof terrain.routeAt !== 'function' || typeof terrain.heightAt !== 'function') return null;
    const { start, period } = terrain.TUNING;
    if (!Number.isFinite(start) || !Number.isFinite(period) || period <= 0) return null;
    // 每十三个地形周期安排两次机会，间隔依次为六／七周期，折跃后仍需正常飞行 8.4～10.8 公里。
    const first = start + TUNING.firstCycle * period + TUNING.entryPhase;
    let pair = Math.max(0, Math.floor((afterPosition - first) / (period * 13)));
    let cycle = TUNING.firstCycle + pair * 13;
    let segment = start + cycle * period + TUNING.entryPhase;
    if (segment <= afterPosition) {
      cycle += 6;
      segment = start + cycle * period + TUNING.entryPhase;
    }
    if (segment <= afterPosition) {
      pair += 1;
      cycle = TUNING.firstCycle + pair * 13;
      segment = start + cycle * period + TUNING.entryPhase;
    }
    // 超出整数精度后的坐标不能可靠地区分前后，不生成无法完成的入口。
    if (!Number.isSafeInteger(segment) || segment <= afterPosition) return null;
    const route = terrain.routeAt(segment);
    const lane = route && route.branchLanes && route.branchLanes[0];
    if (!Number.isFinite(lane)) return null;
    const groundHeight = terrain.heightAt(segment, lane);
    if (!Number.isFinite(groundHeight)) return null;
    return {
      id: `wormhole:${cycle}`,
      cycle,
      segment,
      lane,
      groundHeight,
      height: groundHeight + TUNING.entryHeight,
      halfWidth: TUNING.halfWidth,
      halfHeight: TUNING.halfHeight,
    };
  }

  /** intersectsGate 对前后 {position, lane, height} 扫掠，返回是否正向穿过带擦边容错的入口椭圆。 */
  function intersectsGate(gate, from, to) {
    if (!gate || !pointIsFinite(from) || !pointIsFinite(to)
      || ![gate.segment, gate.lane, gate.height, gate.halfWidth, gate.halfHeight].every(Number.isFinite)
      || gate.halfWidth <= 0 || gate.halfHeight <= 0
      || to.position <= from.position
      || from.position > gate.segment || to.position < gate.segment) return false;
    // 只在入口平面插值，不把后方空间或整个模型包围盒当成可吸附的触发区。
    const t = (gate.segment - from.position) / (to.position - from.position);
    const lane = from.lane + (to.lane - from.lane) * t;
    const height = from.height + (to.height - from.height) * t;
    // 门体保持原尺寸，仅扩大飞船支点的捕获椭圆，让翼尖擦过发光边缘时也可进入。
    const x = (lane - gate.lane) / (gate.halfWidth + TUNING.captureLanePadding);
    const y = (height - gate.height) / (gate.halfHeight + TUNING.captureHeightPadding);
    // 容错仍受椭圆边界限制，不放宽到邻道、矩形角点或已经飞过的入口。
    return x * x + y * y <= 1 + 1e-12;
  }

  /** stage 将演出秒数映射为阶段、总体进度、阶段进度与特效强度；不会推进计时。 */
  function stage(elapsed) {
    const time = Math.max(0, Math.min(TUNING.duration, Number.isFinite(elapsed) ? elapsed : 0));
    let phase = 'capture';
    let start = 0;
    let end = TUNING.captureEnd;
    if (time >= TUNING.duration) {
      return { phase: 'complete', progress: 1, phaseProgress: 1, strength: 0, done: true };
    }
    if (time >= TUNING.tunnelEnd) {
      phase = 'exit'; start = TUNING.tunnelEnd; end = TUNING.duration;
    } else if (time >= TUNING.tearEnd) {
      phase = 'tunnel'; start = TUNING.tearEnd; end = TUNING.tunnelEnd;
    } else if (time >= TUNING.captureEnd) {
      phase = 'tear'; start = TUNING.captureEnd; end = TUNING.tearEnd;
    }
    const phaseProgress = (time - start) / (end - start);
    const easing = phaseProgress * phaseProgress * (3 - 2 * phaseProgress);
    const strength = phase === 'capture' ? easing * 0.2
      : phase === 'tear' ? 0.2 + easing * 0.8
        : phase === 'exit' ? 1 - easing : 1;
    return { phase, progress: time / TUNING.duration, phaseProgress, strength, done: false };
  }

  function pointIsFinite(point) {
    return Boolean(point) && [point.position, point.lane, point.height].every(Number.isFinite);
  }

  function defaultTerrain() {
    return scope.Skyroads && scope.Skyroads.flightTerrain
      || (typeof require === 'function' ? require('./flight_terrain') : null);
  }

  const api = Object.freeze({ TUNING, nextGate, intersectsGate, stage });
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.wormhole = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

'use strict';

// ============================================================
// Tutorial System — v1.2.0 新手引导
// ============================================================
// 首次进入游戏时显示操作提示。
// 引导阶段：变道 → 跳跃 → 滑翔 → 射击 → 燃料爆发
// 每个提示在玩家执行对应操作后消失，进入下一阶段。
// 全部完成后设置 localStorage 标记，不再显示。
// 保底：TUTORIAL_TIME_CAP 秒未完成也自动结束（不再按热身区位置截断 ——
// 五个阶段最少需要 ~15 秒，而热身区 24 段 ~3 秒就跑完了，曾导致只看到第 1 阶段）。
// 教学模式是练习场：教学期间无敌 + 燃料锁定满格 + 限速（见 game.js），
// 让玩家在零压力环境下熟悉操作；超时结束不标记"已看过"，下次任务仍会自动引导。

globalThis.Skyroads = globalThis.Skyroads || {};

(function attachTutorial(root) {
  // v1.3.1：引导内容升级（燃料爆发 70%/40% 等新操作），存储键版本化为 _v2 ——
  // 老玩家下一次任务也会自动收到一次完整新手引导，完成后才不再显示
  const TUTORIAL_STORAGE_KEY = 'skyroads_tutorial_seen_v2';
  const TUTORIAL_TIME_CAP = 90; // 教学保底时长（秒）：超时自动结束并标记已看过
  const TUTORIAL_PHASES = Object.freeze([
    { id: 'move',    hintKey: 'tutorial.move',    trigger: 'laneChange' },
    { id: 'jump',    hintKey: 'tutorial.jump',    trigger: 'jump' },
    { id: 'glide',   hintKey: 'tutorial.glide',   trigger: 'glide' },
    { id: 'shoot',   hintKey: 'tutorial.shoot',   trigger: 'shoot' },
    { id: 'fuelBurst', hintKey: 'tutorial.fuelBurst', trigger: 'fuelBurst' },
  ]);

  function hasSeenTutorial(storage) {
    try {
      return storage && storage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
    } catch (_) {
      return true; // 存储不可用则默认已看过，避免阻塞
    }
  }

  function markTutorialSeen(storage) {
    try {
      if (storage) storage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch (_) {}
  }

  function createTutorialState() {
    return {
      active: false,
      phaseIndex: 0,
      phases: TUTORIAL_PHASES,
      laneChanged: false,
      jumped: false,
      glided: false,
      shot: false,
      fuelBursted: false,
      displayTimer: 0,      // 当前提示已显示时长（秒）
      minDisplayTime: 2.5,  // 最少显示 2.5 秒（防止误触跳过）
      fadeOut: 0,           // 0=正常, >0=渐隐中
      timeAlive: 0,         // 教学已进行总时长（秒，超时 TUTORIAL_TIME_CAP 自动结束）
    };
  }

  function startTutorial(tutorial, storage, { force = false } = {}) {
    if (!force && hasSeenTutorial(storage)) return false;
    tutorial.active = true;
    tutorial.phaseIndex = 0;
    tutorial.laneChanged = false;
    tutorial.jumped = false;
    tutorial.glided = false;
    tutorial.shot = false;
    tutorial.fuelBursted = false;
    tutorial.displayTimer = 0;
    tutorial.fadeOut = 0;
    tutorial.timeAlive = 0;
    return true;
  }

  function endTutorial(tutorial, storage, { markSeen = true } = {}) {
    tutorial.active = false;
    if (markSeen) markTutorialSeen(storage);
  }

  function currentPhase(tutorial) {
    if (!tutorial.active || tutorial.phaseIndex >= tutorial.phases.length) return null;
    return tutorial.phases[tutorial.phaseIndex];
  }

  function advancePhase(tutorial, storage) {
    tutorial.phaseIndex += 1;
    tutorial.displayTimer = 0;
    tutorial.fadeOut = 0;
    if (tutorial.phaseIndex >= tutorial.phases.length) {
      endTutorial(tutorial, storage);
    }
  }

  function updateTutorial(tutorial, dt, {
    position,
    playerY,
    playerVY,
    fuel,
    fuelBurstMin,
    storage,
  }) {
    if (!tutorial.active) return;
    // 保底：超过 TUTORIAL_TIME_CAP 秒未完成自动结束（dt 只来自 PLAYING 子步，暂停不计时）；
    // 超时不标记"已看过" —— 没学完的话下次任务仍会自动引导，主菜单按钮也可随时强制进入
    tutorial.timeAlive += dt;
    if (tutorial.timeAlive >= TUTORIAL_TIME_CAP) {
      endTutorial(tutorial, storage, { markSeen: false });
      return;
    }
    tutorial.displayTimer += dt;

    const phase = currentPhase(tutorial);
    if (!phase) return;

    // 检查当前阶段是否完成
    let complete = false;
    switch (phase.trigger) {
      case 'laneChange':
        complete = tutorial.laneChanged;
        break;
      case 'jump':
        complete = tutorial.jumped;
        break;
      case 'glide':
        complete = tutorial.glided;
        break;
      case 'shoot':
        complete = tutorial.shot;
        break;
      case 'fuelBurst':
        // 燃料爆发教程：只要燃料≥70%且在地面上即可视为“已了解”，不需要真的触发
        complete = tutorial.fuelBursted || (fuel >= fuelBurstMin && playerY <= 0 && playerVY <= 0);
        break;
    }
    if (complete && tutorial.displayTimer >= tutorial.minDisplayTime && tutorial.fadeOut === 0) {
      tutorial.fadeOut = 0.35; // 开始渐隐
    }
    if (tutorial.fadeOut > 0) {
      tutorial.fadeOut -= dt;
      if (tutorial.fadeOut <= 0) {
        advancePhase(tutorial, storage);
      }
    }
  }

  function renderTutorial(ctx, tutorial, state) {
    if (!tutorial.active) return;
    const phase = currentPhase(tutorial);
    if (!phase || !state.translator) return;

    const text = state.translator.t(phase.hintKey);
    if (!text) return;

    const w = state.width;
    const h = state.height;
    const cx = w / 2;
    const cy = h * 0.72; // 屏幕下方提示

    let alpha = 0.92;
    if (tutorial.fadeOut > 0) {
      alpha = 0.92 * (tutorial.fadeOut / 0.35);
    }
    // 入场微动画：前 0.4 秒从下方滑入
    const entryProgress = Math.min(1, tutorial.displayTimer / 0.4);
    const offsetY = (1 - entryProgress) * 20;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 背景面板（进度标签 + 提示文字两行）
    const padding = 18;
    const progressText = state.translator.t('tutorial.progress', {
      current: tutorial.phaseIndex + 1,
      total: tutorial.phases.length,
    });
    ctx.font = 'bold 16px Orbitron, monospace';
    const metrics = ctx.measureText(text);
    ctx.font = '10px Orbitron, monospace';
    const progressMetrics = ctx.measureText(progressText);
    const panelW = Math.max(metrics.width, progressMetrics.width) + padding * 2;
    const panelH = 56;
    const panelX = cx - panelW / 2;
    const panelY = cy - panelH / 2 + offsetY;

    ctx.fillStyle = 'rgba(5,16,30,0.85)';
    ctx.beginPath();
    ctx.moveTo(panelX + 8, panelY);
    ctx.lineTo(panelX + panelW, panelY);
    ctx.lineTo(panelX + panelW, panelY + panelH - 8);
    ctx.lineTo(panelX + panelW - 8, panelY + panelH);
    ctx.lineTo(panelX, panelY + panelH);
    ctx.lineTo(panelX, panelY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(93,231,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 进度标签（教学 n/5）
    ctx.fillStyle = '#5de7ff';
    ctx.font = '10px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (progressText) ctx.fillText(progressText, cx, panelY + 14);

    // 提示文字
    ctx.fillStyle = '#e9fbff';
    ctx.font = 'bold 16px Orbitron, monospace';
    ctx.fillText(text, cx, panelY + 36);

    // 阶段指示器（小圆点）
    const dotRadius = 3;
    const dotGap = 10;
    const totalDots = tutorial.phases.length;
    const dotsWidth = totalDots * dotGap - dotGap;
    let dotX = cx - dotsWidth / 2;
    for (let i = 0; i < totalDots; i++) {
      ctx.fillStyle = i === tutorial.phaseIndex
        ? 'rgba(93,231,255,0.95)'
        : (i < tutorial.phaseIndex ? 'rgba(93,231,255,0.35)' : 'rgba(120,140,160,0.25)');
      ctx.beginPath();
      ctx.arc(dotX, panelY + panelH + 10, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      dotX += dotGap;
    }

    ctx.restore();
  }

  const api = Object.freeze({
    TUTORIAL_STORAGE_KEY,
    TUTORIAL_TIME_CAP,
    TUTORIAL_PHASES,
    hasSeenTutorial,
    markTutorialSeen,
    createTutorialState,
    startTutorial,
    endTutorial,
    currentPhase,
    advancePhase,
    updateTutorial,
    renderTutorial,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.tutorial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));

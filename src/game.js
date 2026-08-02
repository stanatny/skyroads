'use strict';

globalThis.Skyroads = globalThis.Skyroads || {};

const {
  HITBOX,
  createMovementState,
  resetMovement,
  pressDirection,
  releaseDirection,
  requestDiscreteLaneChange,
  advanceMovement,
  clearHeldDirections,
  directionForCode,
  shouldHandleGameInput,
  intervalsOverlap,
  sweptPointDistance,
  sweptIntervalsOverlap,
  laneTileContaining,
  hitboxHalfWidthForEnemy,
  findIntersectedWallLane,
} = globalThis.Skyroads.input;

// ============================================================
// 1. 常量配置 CONFIG —— 所有魔法数字集中在此，附数值推导注释
// ============================================================
const CONFIG = {
  // ---- 世界几何 ----
  SEGMENT_LENGTH: 50,          // 单个 segment 的 z 长度（世界单位）
  ROAD_WIDTH: 5040,            // 跑道总宽度（世界单位，7 车道合计）
                               //   车道宽 = 5040/7 = 720，与 5 车道版相同，变道手感不变
  LANES: 7,                    // 车道数（索引 0..6，中间车道为 3）

  // ---- 相机 / 投影（相机固定在玩家身后，随之滚动）----
  // 投影模型：scale = CAMERA_DEPTH / zRel，zRel = 目标点到相机的距离。
  // 相机位于玩家后方 CAMERA_BACK 世界单位、跑道上空 CAMERA_HEIGHT 处，
  // 因此玩家（zRel = CAMERA_BACK）永远渲染在屏幕上固定位置，
  // 且玩家当前所在 segment 的远端恰好位于飞船正下方 —— 所见即所判。
  //
  // 七车道视野约束（硬性，验收项，第三轮推导）：
  //   最外侧车道中心 |worldX| = ((LANES-1)/2) × (ROAD_WIDTH/LANES) = 3×720 = 2160
  //   玩家深度处 scale = CAMERA_DEPTH/CAMERA_BACK = 0.05/130 ≈ 3.85e-4
  //   屏幕偏移 = 3.85e-4 × 2160 × (w/2) ≈ 0.831 × (w/2) ≤ 0.85 × (w/2) ✓
  //   —— 飞船开到最边上仍完整可见。
  //   近处路沿：3.85e-4 × 2520 ≈ 0.97 × (w/2)，路沿恰好收在屏内（7 车道判读优先）
  //   远处（RENDER_DISTANCE 末端 zRel≈6130）：scale≈8.2e-6，
  //   路面半宽收窄至 0.02 × (w/2) ≈ 地平线，纵深感强 ✓
  //   飞船半翼展 150 ≤ 0.4 × 车道宽 720 = 288 ✓（船模适配车道）
  CAMERA_HEIGHT: 2340,         // 相机离跑道高度（世界单位）
                               //   飞船处路面 screenY = 0.35h + 3.85e-4×2340×(h/2) ≈ 0.80h
  CAMERA_DEPTH: 0.05,          // 投影焦距系数（推导见上）
  CAMERA_BACK: 130,            // 相机在玩家身后的距离（= 2.6 个 segment）
  HORIZON_RATIO: 0.35,         // 地平线在屏幕高度上的比例
  RENDER_DISTANCE: 120,        // 渲染前方多少个 segment

  // ---- 速度与加速（第四轮：加速过程再放慢）----
  INITIAL_SPEED: 8,            // 初始速度（segment/秒）= 满速的 33%，起步平缓
  MAX_SPEED: 24,               // 最大速度（segment/秒）
  ACCEL: 0.4,                  // 线性加速度（segment/秒²）
                               //   满速时间 = (24-8)/0.4 = 40 秒（7 → 29 → 40 秒，第三轮再放缓）
  DISTANCE_PER_SEGMENT: 10,    // HUD 距离换算：1 segment = 10 米

  // ---- 变道 ----
  LANE_SWITCH_TIME: 0.18,      // 变道耗时（秒）
  // 满速下变 1 条车道的位移 = 24 * 0.18 = 4.32 个 segment（生成器据此留反应距离）

  // ---- 跳跃与高度判定（数值必须互相匹配）----
  //   单跳顶点 = JUMP_VELOCITY² / (2·GRAVITY)
  //            = 7500² / (2·32000) = 879 世界单位
  //   二段跳上限 = 2 × 879 = 1758（第一段顶点触发第二段时的理论最大高度）
  //   滞空时间（单跳） = 2·JUMP_VELOCITY / GRAVITY = 0.469 秒
  //   跨越距离 = 速度 × 0.469：满速 24 → 11.2 段；初速 10 → 4.7 段
  // 判定规则：
  //   WALL_LOW ：playerY > 600 则安全越过（879 > 600，单跳可过 ✓）
  //   WALL_HIGH：2000 > 二段跳上限 1758（余量 1758×1.1 = 1934 ≤ 2000 ✓），
  //              双跳也够不到顶，碰到即死，必须变道躲避
  //   GAP      ：playerY ≥ GAP_SAFE_HEIGHT (200) 则不坠落（落地时 playerY→0，必须落在路面）
  JUMP_VELOCITY: 7500,         // 跳跃初速度（世界单位/秒，两段跳共用同一初速）
  GRAVITY: 32000,              // 重力（世界单位/秒²）
  MAX_JUMPS: 2,                // 最大跳跃段数（落地重置）；二段跳仅为容错与技巧空间，
                               //   可解性仍按单跳推导（见生成器 airReach 注释）
  WALL_LOW_HEIGHT: 600,        // 矮墙高度（世界单位，渲染与碰撞共用）
  WALL_HIGH_HEIGHT: 2000,      // 高塔高度（世界单位，渲染与碰撞共用；推导见上）
  GAP_SAFE_HEIGHT: 200,        // 跳跃高度 ≥ 此值可安全掠过缺口
  FUEL_BLOCK_HEIGHT: 450,      // 燃料晶体悬浮基准高度（渲染用，叠加 sin 浮动）
  FUEL_BOB_AMPLITUDE: 90,      // 燃料晶体上下浮动幅度（世界单位）
  FUEL_COLLECT_HEIGHT: 600,    // 跳跃低于此高度才能吃到晶体（跳太高会错过）

  // ---- 飞船造型 ----
  SHIP_HALF_SPAN: 150,         // 半翼展（世界单位）≤ 0.4 × 车道宽 720 = 288 ✓

  // ---- 燃料 ----
  FUEL_MAX: 100,
  FUEL_DRAIN_RATE: 4.5,        // 每秒消耗 → 满燃料可飞 100/4.5 ≈ 22.2 秒
  FUEL_PICKUP: 18,             // 每个晶体补充 → 约 4 秒航程（第六轮 30→18：燃料不再泛滥）

  // ---- 赛道生成（可解性参数，详见第 4 节注释）----
  WARMUP_SEGMENTS: 24,         // 起跑热身区：全 ROAD（偶有燃料），放缓后略加长
  REACTION_SEGS: 8,            // 障碍簇/窄桥之间的全路面缓冲段数
                               //   推导：满速 24 段/秒 × 变道 0.18 秒 = 4.32 段/次变道，
                               //   8 段 ≈ 1.85 倍单次变道行程；核心保障仍是
                               //   "相邻簇保证车道差 ≤ 1"，缓冲段给出充裕反应窗口
  MAX_GAP_RUN: 3,              // 连续全缺口段数上限
                               //   推导：全缺口在 segment ≥ 100 解锁（此时 speed≈12.6，
                               //   滞空可跨 ≈5.9 段 ≫ 3 ✓）
  FULL_GAP_MIN_INDEX: 100,     // 全缺口挑战在 segment 100 之后才出现
                               //   推导（ACCEL 0.4 重算）：到达 100 段时 t≈10s，
                               //   speed ≈ 8+0.4×10 = 12 段/秒，滞空 0.469s 可跨
                               //   ≈5.6 段 ≫ MAX_GAP_RUN 3 ✓ 故维持 100 不变
  FUEL_FORCE_EVERY: 75,        // 最多间隔多少段强制在"保证车道"放燃料（第六轮 55→75）
                               //   推导：75 段 ÷ 最低 8 段/秒 ≈ 9.4 秒 < 22.2 秒续航 ✓ 不会死局
  TRACK_INITIAL_SEGMENTS: 400, // 开局预生成段数
  TRACK_KEEP_AHEAD: 200,       // 运行时保持前方至少多少段

  // ---- 窄桥（需求 5：独木桥挑战）----
  BRIDGE_MIN_INDEX: 100,       // 窄桥在 segment 100 之后才出现（玩家已有变道熟练度）

  // ---- 奖励道具（需求 6；第四轮：无敌护盾 → 闪电超级加速）----
  BOOST_DURATION: 5,           // 超级加速秒数：期间无敌穿透（撞墙/过缺口不伤）+ 速度锁定
  BOOST_SPEED: 36,             // 超级加速速度 = 1.5 × MAX_SPEED 24
                               //   穿段校验：36 段/秒 × 最长帧 0.05s = 1.8 段/帧，
                               //   子步扫掠（≤0.5 段/子步，见第 7 节）逐段覆盖 ✓ 不漏判
  BOOST_WARN_TIME: 1.5,        // BOOST 到期预警窗口（秒）：最后 1.5s 内 HUD 条变红急促
                               //   闪烁 + 3 声渐高 beep（1.5/1.0/0.5s 三档阈值）+
                               //   屏幕边缘青色脉冲光晕收缩 + 船体光环同步闪烁
  // 超级形态（青白星 → 空中王者）：旧 MULTI 连击倍率系统废弃，第三轮再升级为
  // "一波大增强"的限时变身 —— 吃星后 TRIPLE_DURATION(20) 秒内：
  //   ① 掌握三段跳且滑翔滞空更长（第三段顶点 3×879=2637 > 高塔 2000/炮塔 1900，
  //      奖励期可越障是特性，与闪电无敌穿透同理）；
  //   ② 普通子弹强化：任意高度直接摧毁建筑（矮墙/高塔 → 路面）；
  //   ③ 导弹强化：命中后清除以命中点为中心 SUPER_MISSILE_RADIUS(±1) 段 ×
  //      全部车道的整片建筑与敌人；
  //   ④ 船体变身：金白能量装甲 + 顶部光刃 + 金色光环（见 renderPlayer）。
  // 到期前 TRIPLE_WARN_TIME(3) 秒进入预警：HUD 条急促闪烁 + 3 声渐高 beep
  // （3/2/1s 三档阈值）+ 船体金色光环同步闪烁。
  TRIPLE_DURATION: 20,         // 超级形态持续秒数
  TRIPLE_GLIDE_FACTOR: 0.045,  // 奖励期滑翔重力系数（基准 0.08 → 滞空 ≈0.7s 提升到 ≈1.0s）
  TRIPLE_WARN_TIME: 3,         // 超级形态到期预警窗口（秒，3/2/1s 三档 beep）
  SUPER_MISSILE_RADIUS: 1,     // 超级形态导弹范围清除半径（段）：命中段 ±1 × 全车道
  SLOW_FACTOR: 0.6,            // 减速道具：速度立即 × 0.6（不低于 INITIAL_SPEED），之后按 ACCEL 重爬
  PICKUP_MIN_GAP: 40,          // 道具最小间隔段数；到期后每次布置机会 20% 概率出现
                               //   → 期望间隔 ≈ 40 + 1/0.2 ≈ 45~50 段一枚（四种按序轮换）
                               //   轮换 BOOST→SLOW→TRIPLE→MAGNET：每种期望间隔 ≈ 180~200 段

  // ---- 燃料玩法深化（二段跳耗油 + 按住滑翔）----
  DOUBLEJUMP_FUEL: 3,          // 二段跳一次性扣 3 燃料（第一跳免费）—— 跃升推进器烧油
  GLIDE_GRAVITY_FACTOR: 0.08,  // 滑翔时重力 ×0.08（机翼展开 + 滑翔喷口，滞空 ≈3.5× 自由落体）
                               //   推导：自顶点 879 自由落体 t=√(2×879/32000)=0.234s；
                               //   滑翔 t=√(2×879/(32000×0.13))≈0.65s → 滞空 ≈2.8 倍
  GLIDE_DRAIN: 9,              // 滑翔额外耗油 9/秒（维持不变：滞空变长本身就是燃料成本
                               //   —— 0.65s 滑翔 ≈ 5.9 额外燃料，强度提升由时长买单，
                               //   不再加 drain；油尽/松键立即退出滑翔）

  // ---- 磁铁（第六轮新奖励；第七轮加大范围 + 飞行晶体动画）----
  MAGNET_DURATION: 8,          // 磁铁持续秒数
  MAGNET_RANGE: 3,             // 吸附车道半径：±3 车道内的燃料自动飞来（无视高度；7 车道几乎全幅）
  MAGNET_SEG_AHEAD: 2,         // 吸附纵深：当前段 + 前方 2 段

  // ---- 战斗系统（K 跳/按住滑翔 · J 点按子弹 / 按住 3 秒蓄力导弹）----
  // 敌人是挂在 segment 上的独立实体（seg.enemies），不是 LANE_TYPE ——
  //   不占障碍名额、不参与车道类型不变量；可解性红线：
  //   敌人绝不刷在当段保证车道（簇内避开 clusterLane、缓冲避开 safeLane），
  //   因此"沿保证车道前进"永远是无敌安全解，敌人只是高风险高收益的遭遇战。
  // 第六轮：L 键与弹药系统拆除 —— 导弹改为 J 蓄力 CHARGE_TIME(3)s 松手发射，
  //   无弹药概念（蓄力时间就是成本），操作键位收敛到 J/K 两个。
  CHARGE_TIME: 3,              // J 蓄力满所需秒数；未满松手 = 普通子弹
  BULLET_COOLDOWN: 0.22,       // 子弹射速上限（秒/发）；子弹无限
  BULLET_SPEED: 40,            // 弹速 = 玩家速度 + 40 段/秒（对地）
                               //   穿段校验：最快 36+40 = 76 段/秒 × 最长帧 0.05s = 3.8 段/帧，
                               //   子步数按"玩家位移与弹道位移的最大值"切分（见第 7 节），
                               //   每子步 ≤0.5 段 ✓ 弹道不漏判
  MAX_BULLETS: 12,             // 同屏子弹上限
  MAX_MISSILE_SHOTS: 4,        // 同屏飞行中导弹上限
  ENEMY_MIN_INDEX: 80,         // segment ≥ 80 才出现敌人（热身与新手期无战斗压力）
  ENEMY_KILL_SCORE: 20,        // 击毁奖励 +20m（固定值，原连击倍率系统已废弃）
  DRONE_HEIGHT: 500,           // 无人机机体贴底高度：500 < 单跳顶点 879 ✓ 可跳过/可击落
  TURRET_HEIGHT: 1900,         // 重炮塔高度：1900 > 二段跳上限 2×879=1758（余量 8%）→ 跳不过，必须变道、击毁或导弹清除
  // 无人机换道状态机（rest → warn → move）：
  DRONE_WARN_TIME: 0.6,        // 换道预警秒数：机体急促闪烁 + 原地抖动 + 向目标侧倾斜，
                               //   车道位置保持不动 —— 推导：满速 24 段/秒下玩家有 ≥0.6s
                               //   反应窗口，≈ 变道耗时 0.18s 的 3.3 倍 ✓ 足以预判规避
  DRONE_MOVE_TIME: 0.4,        // 换道移动秒数：车道位置平滑插值滑到相邻车道（不再跳变），
                               //   渲染与碰撞共用同一连续位置（与玩家 movement 状态同源）
};

// 中间车道索引（玩家出生车道）：LANES=5 → 2
function midLane() { return Math.floor(CONFIG.LANES / 2); }

// ============================================================
// 2. 游戏状态 STATE
// ============================================================
const STATE = {
  mode: 'MENU',                // 'MENU' | 'PLAYING' | 'GAMEOVER'
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  // 玩家
  position: 0,                 // 所在位置（segment 为单位，浮点）
  speed: 0,
  movement: createMovementState(midLane()), // 唯一横向真值：连续车道位置 + 按住/分段状态
  playerY: 0,                  // 跳跃高度（世界单位）
  playerVY: 0,
  jumpsUsed: 0,                // 已用跳跃段数（0..MAX_JUMPS，落地重置）
  jumpBurst: 0,                // 二段跳跃升推进器爆发剩余时间（秒，>0 时画蓝白焰团）
  trail: [],                   // 船尾短寿命尾迹粒子（渲染侧生成，updateEffects 推进）
  recoil: 0,                   // 二段跳后坐动感 1→0（船体瞬间下沉再上冲）
  // 道具效果
  boostT: 0,                   // 超级加速剩余时间（秒，>0 期间无敌穿透 + 速度锁定 BOOST_SPEED）
  boostPrevSpeed: 0,           // 吃闪电前的速度（>0 表示待恢复，BOOST 结束后恢复到此速度）
  tripleT: 0,                  // 超级形态剩余时间（秒，>0 期间三段跳+长滑翔+武器强化+船体变身）
  tripleWarnStage: 0,          // 超级形态到期预警 beep 已发档位（0..3，吃星/开局重置）
  superFx: 0,                  // 变身特效计时（秒，0.9→0：金色冲击波+大字+爆发粒子）
  magnetT: 0,                  // 磁铁剩余时间（秒，>0 期间 ±MAGNET_RANGE 车道燃料自动吸附）
  magnetPulls: [],             // 磁铁吸附中的飞行燃料晶体 [{ x, y, t, dur }]（屏幕空间，朝船体收敛）
  // 滑翔（按住跳跃键 + 下落中 + 有燃料）
  gliding: false,
  fuelFlash: 0,                // 高耗油警示（秒）：二段跳扣燃料时置 0.6，HUD 燃料条变橙提示
  // 战斗（第六轮：J 点按子弹 / 按住 CHARGE_TIME(3)s 蓄力导弹，无弹药概念）
  chargeT: 0,                  // J 蓄力进度（秒，0..CHARGE_TIME；松手时判子弹/导弹）
  chargeStage: 0,              // 蓄力提示音已发档位（0..3：1s/2s tick + 满蓄 ding）
  shots: [],                   // 飞行中的子弹/导弹 { kind, seg, lanePosition }（发射瞬间连续位置）
  bulletCD: 0,                 // 子弹冷却剩余秒数
  boostWarnStage: 0,           // BOOST 预警已响到第几声（0..3，防重发）
  // 燃料/计分
  fuel: CONFIG.FUEL_MAX,
  distanceMeters: 0,
  enemyKills: 0,
  score: 0,
  elapsedMs: 0,
  runId: null,
  finalResult: null,
  deathReason: null,
  storage: null,
  translator: null,
  leaderboard: null,
  leaderboardSnapshot: null,
  ui: null,
  uiController: null,
  audioController: null,
  audioMixKey: null,
  visualAssets: null,
  visualAssetsReady: Promise.resolve(null),
  // 赛道
  track: [],
  gen: null,                   // 生成器内部状态（见第 4 节）
  // 死亡特效
  flash: 0,                    // 死亡闪屏强度 1→0
  particles: [],               // 爆炸粒子（含长条碎片 shard）
  shake: 0,                    // 屏幕震动强度 1→0
  shockwave: null,             // 死亡冲击波圆环 { x, y, r, alpha }
  // 时间
  lastTime: 0,
  time: 0,                     // 全局时钟（任何模式下都累加），驱动物体动画
};

// ============================================================
// 3. 输入处理 Input（键盘 + 触屏）
// ============================================================
const KEYS = {};

function targetInsideAppUi(target) {
  return !!(target && typeof target.closest === 'function' && target.closest('#app-ui'));
}

function modalOpen() {
  return !!document.querySelector('#app-ui [role="dialog"][aria-modal="true"]:not([hidden])');
}

function gameInputDescriptor(e, mode = STATE.mode) {
  return {
    mode,
    targetInsideAppUi: targetInsideAppUi(e && e.target),
    modalOpen: modalOpen(),
  };
}

function clearMovementInput() {
  clearHeldDirections(STATE.movement);
}

window.addEventListener('keydown', (e) => {
  const focusAvailable = shouldHandleGameInput(gameInputDescriptor(e, 'PLAYING'));
  if (!focusAvailable) {
    clearMovementInput();
    return;
  }

  // 全部游戏键都 preventDefault：macOS 对未处理的按键按住不放会发"滴滴滴"系统提示音
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter',
       'w','W','a','A','s','S','d','D','j','J','k','K','l','L','m','M'].includes(e.key)
      || directionForCode(e.code) !== 0) e.preventDefault();

  const direction = directionForCode(e.code);
  if (direction !== 0 && STATE.mode === 'PLAYING') {
    const alreadyHeld = direction === -1 ? STATE.movement.heldLeft : STATE.movement.heldRight;
    if (alreadyHeld) return;
    const result = pressDirection(STATE.movement, direction);
    if (result.started || result.reversed) sfxLane();
    return;
  }

  if (KEYS[e.key]) return;   // 抑制按键重复
  KEYS[e.key] = true;

  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }   // 全局静音切换

  if (STATE.mode === 'MENU') {
    if (e.key === ' ' || e.key === 'Enter') startGame();
    return;
  }
  if (STATE.mode === 'GAMEOVER') {
    if (e.key === ' ' || e.key === 'Enter') startGame();
    else if (e.key === 'Escape') gotoMenu();
    return;
  }
  if (!shouldHandleGameInput(gameInputDescriptor(e))) return;
  switch (e.key) {
    case ' ':
    case 'ArrowUp':
    case 'w': case 'W':
    case 'k': case 'K':
      tryJump(); break;
    case 'j': case 'J':
      // 开始蓄力（0.001 标记"已按下"，松手时判定：满 3s 导弹 / 未满子弹）
      STATE.chargeT = 0.001;
      STATE.chargeStage = 0;
      break;
  }
});
window.addEventListener('keyup', (e) => {
  KEYS[e.key] = false;
  const direction = directionForCode(e.code);
  if (direction !== 0) {
    const result = releaseDirection(STATE.movement, direction);
    if (STATE.mode === 'PLAYING' && result.reversed) sfxLane();
    return;
  }
  // J 松手发射：蓄满 CHARGE_TIME(3)s → 蓄力导弹；未满 → 普通子弹
  if ((e.key === 'j' || e.key === 'J') && STATE.mode === 'PLAYING' && STATE.chargeT > 0) {
    if (shouldHandleGameInput(gameInputDescriptor(e))) {
      if (STATE.chargeT >= CONFIG.CHARGE_TIME) fireMissile();
      else fireBullet();
    }
    STATE.chargeT = 0;
    STATE.chargeStage = 0;
  }
});
window.addEventListener('blur', clearMovementInput);
if (typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearMovementInput();
  });
  document.addEventListener('focusin', (e) => {
    if (targetInsideAppUi(e.target)) clearMovementInput();
  });
}

// ---- 触屏：左右滑变道，点按跳跃；菜单/结束屏点按开始 ----
let touchStart = null;
window.addEventListener('touchstart', (e) => {
  if (targetInsideAppUi(e.target) || modalOpen()) {
    touchStart = null;
    return;
  }
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  if (STATE.mode !== 'PLAYING') e.preventDefault();
}, { passive: false });
window.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  if (targetInsideAppUi(e.target) || modalOpen()) {
    touchStart = null;
    return;
  }
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const dt = performance.now() - touchStart.time;
  touchStart = null;
  if (STATE.mode === 'MENU' || STATE.mode === 'GAMEOVER') {
    if (dt < 500 && Math.abs(dx) < 24 && Math.abs(dy) < 24) startGame();
    return;
  }
  if (STATE.mode !== 'PLAYING') return;
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
    trySwitchLane(dx > 0 ? 1 : -1);         // 左右滑变道
  } else if (dt < 300 && Math.abs(dy) < 30) {
    tryJump();                              // 点按跳跃
  }
}, { passive: true });

function trySwitchLane(dir) {
  const result = requestDiscreteLaneChange(STATE.movement, dir);
  if (result.started) sfxLane();           // 轻 whoosh
}

function tryJump() {
  if (STATE.playerY <= 0 && STATE.playerVY <= 0 && STATE.jumpsUsed === 0) {
    // 第一段：离地起跳（免费）
    STATE.playerVY = CONFIG.JUMP_VELOCITY;
    STATE.playerY = 0.01;
    STATE.jumpsUsed = 1;
    sfxJump();
  } else if (STATE.jumpsUsed > 0 && STATE.jumpsUsed < (STATE.tripleT > 0 ? 3 : CONFIG.MAX_JUMPS)) {
    // 第二/第三段：空中跃升推进器点火，垂直速度重置为起跳初速。
    // 三段跳为青白星限时奖励（TRIPLE_DURATION 秒）；第三段顶点 3×879=2637 >
    // 高塔 2000 / 炮塔 1900，奖励期可越障是特性（与闪电无敌穿透同理）。
    // 第三段与第二段同样扣 DOUBLEJUMP_FUEL(3) 燃料
    STATE.fuel = Math.max(0, STATE.fuel - CONFIG.DOUBLEJUMP_FUEL);
    STATE.fuelFlash = 0.6;     // HUD 燃料条短暂变橙：提示"正在加速耗油"
    STATE.playerVY = CONFIG.JUMP_VELOCITY;
    STATE.jumpsUsed++;
    STATE.jumpBurst = 0.28;    // 推进器爆发特效时长（秒）
    STATE.recoil = 1;          // 后坐动感：船体瞬间下沉再上冲（渲染侧衰减）
    sfxDoubleJump();
    // 一圈小火花（短寿命粒子，允许随机；沿圆周均匀散开）
    const bp = project(playerWorldX(), STATE.playerY, CONFIG.CAMERA_BACK);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const v = 160 + Math.random() * 220;
      STATE.particles.push({
        x: bp.x, y: bp.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.25 + Math.random() * 0.2, maxLife: 0.45,
        color: Math.random() < 0.5 ? '#ffaa55' : '#ffffff',
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }
}

// 跳跃键是否按住（滑翔判定用；KEYS 表 keydown/keyup 维护按住状态，重复按键已抑制）
function jumpHeld() {
  return !!(KEYS[' '] || KEYS['ArrowUp'] || KEYS['w'] || KEYS['W'] || KEYS['k'] || KEYS['K']);
}

// ---- 开火：J 点按子弹（无限，冷却 0.22s）/ 按住 3 秒蓄力导弹（松手发射）----
// 弹体在 updatePhysics 子步扫掠内推进（与玩家同帧同子步），杜绝高速穿段漏判。
function fireBullet() {
  if (STATE.mode !== 'PLAYING') return;
  if (STATE.bulletCD > 0) return;
  let n = 0;
  for (const s of STATE.shots) if (s.kind === 'bullet') n++;
  if (n >= CONFIG.MAX_BULLETS) return;              // 同屏上限
  STATE.bulletCD = CONFIG.BULLET_COOLDOWN;
  // 弹道携带发射瞬间高度 y（地面 = 0，空中 = playerY）：跳得高打得远
  STATE.shots.push({
    kind: 'bullet',
    seg: STATE.position + 0.8,
    lanePosition: STATE.movement.lanePosition,
    y: STATE.playerY,
  });
  sfxShoot();
}

// 蓄力导弹（J 按住蓄满 CHARGE_TIME(3)s 松手发射）：无弹药概念，蓄力时间就是成本
function fireMissile() {
  if (STATE.mode !== 'PLAYING') return;
  let n = 0;
  for (const s of STATE.shots) if (s.kind === 'missile') n++;
  if (n >= CONFIG.MAX_MISSILE_SHOTS) return;
  STATE.shots.push({
    kind: 'missile',
    seg: STATE.position + 0.8,
    lanePosition: STATE.movement.lanePosition,
    y: STATE.playerY,
  });
  sfxMissile();
}

// ============================================================
// 4. 赛道生成 Track —— 保证可解性的生成器（7 车道泛化版）
// ============================================================
// 可解性保证（核心思路：始终维护一条"保证车道" safeLane）：
//
// ① 热身区：前 WARMUP_SEGMENTS 段全 ROAD（偶有燃料）。
//
// ② 障碍簇（cluster）：生成 1~3 段障碍行，簇内 clusterLane 永远保持
//    ROAD/FUEL，其余车道随机布置 WALL_LOW（可跳过）/ WALL_HIGH（必须变道）/
//    GAP / ROAD —— 障碍密度与高塔占比随难度提升。玩家只要提前变道到
//    clusterLane 即可安全通过，且簇内无需再变道。
//
// ③ 可达性：新簇的 clusterLane 与当前 safeLane 的车道差 ≤ 1；
//    两簇之间强制插入 REACTION_SEGS(8) 段全路面缓冲 —— 满速变 1 条
//    车道只需 4.32 段 < 8 段，相邻挑战的"可通行解"必然可达。
//
// ④ 全缺口跳跃挑战：偶发连续 1~MAX_GAP_RUN(3) 段 7 车道全 GAP，
//    必须跳跃通过。只在 segment ≥ FULL_GAP_MIN_INDEX(100) 后出现
//    （此时 speed ≈ 12.6 段/秒，滞空 0.469s 可跨 ≈5.9 段 ≫ 3 段），
//    且跳跃中允许变道（滞空 0.469s / 0.18s = 2.6，空中最多完成 2 次变道，
//    可达范围为起跳车道 ±2），因此紧随其后的着陆段设为全 ROAD，且新
//    保证车道限制在起跳前保证车道的 ±2 范围内 —— 落地点必有安全车道。
//    单车道 GAP 则可靠变道规避（其余车道为 ROAD），跳跃只是备选。
//
// ⑤ 燃料不死局：每在"保证车道"上距离上次燃料超过 FUEL_FORCE_EVERY(75)
//    段，强制放置一枚晶体。55 段 ÷ 最低 8 段/秒 ≈ 6.9 秒 ≪ 满燃料
//    续航 22.2 秒，正常操作下补充速率 ≥ 消耗速率。
//
// ⑥ 窄桥（独木桥）：偶发连续 2~5 段，仅桥车道为路面、其余 6 车道全 GAP，
//    玩家像走悬崖独木桥。红线：桥车道与前一 safeLane 差 ≤ 1（可达链），
//    桥结束后 safeLane = 桥车道（差 0），前后均按 REACTION_SEGS 缓冲；
//    高难度时桥车道偏向边缘（还原"跳上最边上的格子"体验）。
const LANE_TYPE = {
  ROAD: 'ROAD',
  GAP: 'GAP',
  WALL_LOW: 'WALL_LOW',     // 矮墙：红色能量屏障，跳跃可越过
  WALL_HIGH: 'WALL_HIGH',   // 高塔：暗红高塔，跳不过去，必须变道
  FUEL: 'FUEL',
  // 奖励道具：只出现在 ROAD 车道上，属于"可安全碾压的路面"，
  // 不占障碍名额、不影响可解性（碰撞时拾取并退化为 ROAD）
  BOOST: 'BOOST',           // 黄色闪电：5 秒超级加速（无敌穿透 + 速度锁定 36）
  SLOW: 'SLOW',             // 紫色沙漏：速度立即 ×0.6
  TRIPLE: 'TRIPLE',          // 青白星：超级形态 20s（三段跳+长滑翔+武器强化+变身）
  MAGNET: 'MAGNET',          // 红白马蹄磁铁：MAGNET_DURATION(8)s 吸附 ±2 车道燃料
};

// 全部车道索引 [0..LANES-1]（消除任何针对 3 车道的硬编码）
function laneIndices() {
  const a = [];
  for (let i = 0; i < CONFIG.LANES; i++) a.push(i);
  return a;
}

function newGenState() {
  return {
    safeLane: midLane(),     // 当前保证车道（必然可通行）
    cooldown: 0,             // 距下一挑战还剩多少缓冲段
    clusterLeft: 0,          // 当前障碍簇还剩几段
    clusterLane: midLane(),  // 当前簇的保证车道
    gapRun: 0,               // 已连续全缺口的段数（0 = 不在全缺口中）
    bridgeLeft: 0,           // 当前窄桥还剩几段（0 = 不在窄桥中）
    bridgeLane: midLane(),   // 窄桥的桥车道
    sinceFuel: 0,            // 距上次放置燃料的段数
    sincePickup: 0,          // 距上次放置道具的段数
    pickupCycle: 0,          // 道具轮换指针（BOOST→SLOW→TRIPLE→AMMO 循环）
  };
}

function difficultyAt(index) {
  // 难度爬升再放缓（除数 800 → 1600 → 2000）：segment 2024 才达到满难度
  return Math.max(0, Math.min(1, (index - CONFIG.WARMUP_SEGMENTS) / 2000));
}

function placeFuel(lanes, lane) {
  if (lanes[lane] === LANE_TYPE.ROAD) lanes[lane] = LANE_TYPE.FUEL;
}

// 簇内非保证车道的随机填充：WALL_LOW / WALL_HIGH / GAP / ROAD
// 障碍密度与高塔占比随难度 d 提升（低难度多为可跳过的矮墙）
function fillClusterLanes(lanes, clusterLane, d) {
  for (let lane = 0; lane < CONFIG.LANES; lane++) {
    if (lane === clusterLane) continue;
    const r = Math.random();
    if (r < 0.30 + 0.35 * d) {                  // 墙的总概率
      const highRatio = 0.15 + 0.45 * d;        // 其中高塔占比
      lanes[lane] = Math.random() < highRatio ? LANE_TYPE.WALL_HIGH : LANE_TYPE.WALL_LOW;
    } else if (r < 0.45 + 0.45 * d) {           // GAP 概率 = 0.15 + 0.10d
      lanes[lane] = LANE_TYPE.GAP;
    }
    // 否则保持 ROAD
  }
}

// 生成单个 segment，依据生成器状态推进状态机
function generateSegment(index, gen) {
  const lanes = new Array(CONFIG.LANES).fill(LANE_TYPE.ROAD);
  const d = difficultyAt(index);

  // ① 热身区
  if (index < CONFIG.WARMUP_SEGMENTS) {
    if (index > 5 && Math.random() < 0.15) {
      lanes[Math.floor(Math.random() * CONFIG.LANES)] = LANE_TYPE.FUEL;
      gen.sinceFuel = 0;
    }
    return { index, lanes };
  }

  // ④a 全缺口挑战进行中：继续或着陆
  if (gen.gapRun > 0) {
    if (gen.gapRun < CONFIG.MAX_GAP_RUN && Math.random() < 0.5) {
      gen.gapRun++;
      return { index, lanes: new Array(CONFIG.LANES).fill(LANE_TYPE.GAP) };
    }
    // 着陆段：全 ROAD + 送一枚燃料（奖励 + 保证续航）
    gen.gapRun = 0;
    // 新保证车道必须限制在起跳前 safeLane 的 ±2 范围内（5 车道死局修复）。
    //   推导：滞空时间 = 2×JUMP_VELOCITY/GRAVITY = 0.469s，
    //   变道 0.18s/次 → 0.469/0.18 = 2.6 次，向下取整 = 空中最多完成 2 次变道，
    //   即空中可达范围 = 起跳车道 ±2。3 车道时 ±2 恰好覆盖全部车道，
    //   故旧代码"任意车道皆可"成立；5 车道时若玩家在最边车道（0/4）起跳，
    //   空中最多变 ±2 道，够不到对侧 —— 随机到 ±2 之外即死局，故必须 clamp。
    //   注：公式按单跳滞空 0.469s 推导 —— 可解性红线：赛道必须单跳即可解，
    //   二段跳（MAX_JUMPS=2）只是容错与技巧空间，绝不作为通关必要条件。
    //   7 车道时最边车道（0/6）起跳同样够不到对侧，clamp 依然必需。
    const airReach = Math.floor((2 * CONFIG.JUMP_VELOCITY / CONFIG.GRAVITY) / CONFIG.LANE_SWITCH_TIME); // = 2
    const reachLo = Math.max(0, gen.safeLane - airReach);
    const reachHi = Math.min(CONFIG.LANES - 1, gen.safeLane + airReach);
    gen.safeLane = reachLo + Math.floor(Math.random() * (reachHi - reachLo + 1));
    gen.cooldown = CONFIG.REACTION_SEGS;
    lanes[gen.safeLane] = LANE_TYPE.FUEL;
    gen.sinceFuel = 0;
    maybePlacePickup(lanes, gen, index);
    return { index, lanes };
  }

  // ⑥a 窄桥进行中：仅桥车道为路面，其余车道全 GAP（悬崖边的独木桥）
  if (gen.bridgeLeft > 0) {
    for (let lane = 0; lane < CONFIG.LANES; lane++) {
      if (lane !== gen.bridgeLane) lanes[lane] = LANE_TYPE.GAP;
    }
    gen.bridgeLeft--;
    if (gen.bridgeLeft === 0) gen.cooldown = CONFIG.REACTION_SEGS;  // 桥后缓冲
    maybePlaceFuel(lanes, gen, gen.bridgeLane);
    maybePlacePickup(lanes, gen, index);
    return { index, lanes };
  }

  // ② 障碍簇进行中：clusterLane 保持畅通
  if (gen.clusterLeft > 0) {
    fillClusterLanes(lanes, gen.clusterLane, d);
    gen.clusterLeft--;
    if (gen.clusterLeft === 0) {
      gen.safeLane = gen.clusterLane;
      gen.cooldown = CONFIG.REACTION_SEGS;
    }
    maybePlaceFuel(lanes, gen, gen.clusterLane);
    maybePlacePickup(lanes, gen, index);
    const segC = { index, lanes };
    const enC = maybePlaceEnemy(lanes, gen, index, d, gen.clusterLane);  // 避开簇保证车道
    if (enC) segC.enemies = [enC];
    return segC;
  }

  // ③ 缓冲段：全路面，偶有可规避的单车道缺口/墙（不堵保证车道）
  if (gen.cooldown > 0) {
    gen.cooldown--;
    if (Math.random() < 0.10 + 0.10 * d) {
      const others = laneIndices().filter(l => l !== gen.safeLane);
      const lane = others[Math.floor(Math.random() * others.length)];
      if (Math.random() < 0.5) {
        lanes[lane] = LANE_TYPE.GAP;
      } else {
        // 高难度下缓冲段也偶见高塔（单车道，变道即可规避）
        lanes[lane] = (d > 0.5 && Math.random() < 0.35) ? LANE_TYPE.WALL_HIGH : LANE_TYPE.WALL_LOW;
      }
    }
    maybePlaceFuel(lanes, gen, gen.safeLane);
    maybePlacePickup(lanes, gen, index);
    const segB = { index, lanes };
    const enB = maybePlaceEnemy(lanes, gen, index, d, gen.safeLane);  // 避开缓冲保证车道
    if (enB) segB.enemies = [enB];
    return segB;
  }

  // ③→② 缓冲结束，开启新挑战
  if (index >= CONFIG.FULL_GAP_MIN_INDEX && d > 0.15 && Math.random() < 0.10 + 0.12 * d) {
    // ④b 全缺口跳跃挑战（前一段是缓冲路面，玩家有起跳反应窗口）
    gen.gapRun = 1;
    return { index, lanes: new Array(CONFIG.LANES).fill(LANE_TYPE.GAP) };
  }
  // ⑥b 窄桥挑战：2~5 段独木桥（仅桥车道为路面，其余全 GAP）。
  //   红线：桥车道与当前 safeLane 差 ≤ 1（可达链）；桥只会在缓冲结束后出现，
  //   故桥前有完整 REACTION_SEGS 缓冲，桥后由 ⑥a 收尾时强制缓冲。
  //   高难度时偏向边缘车道（还原"跳上最边上的格子"的体验）。
  if (index >= CONFIG.BRIDGE_MIN_INDEX && d > 0.25 && Math.random() < 0.08 + 0.08 * d) {
    let opts = [gen.safeLane - 1, gen.safeLane, gen.safeLane + 1]
      .filter(l => l >= 0 && l < CONFIG.LANES);
    if (d > 0.45 && Math.random() < 0.6) {
      const edgeDir = gen.safeLane >= midLane() ? 1 : -1;
      const toward = opts.filter(l => (l - gen.safeLane) === edgeDir || l === gen.safeLane);
      if (toward.length > 0) opts = toward;
    }
    gen.bridgeLane = opts[Math.floor(Math.random() * opts.length)];
    gen.safeLane = gen.bridgeLane;              // 桥车道即新保证车道（差 ≤ 1 ✓）
    gen.bridgeLeft = 2 + Math.floor(Math.random() * 4);   // 2~5 段
    for (let lane = 0; lane < CONFIG.LANES; lane++) {
      if (lane !== gen.bridgeLane) lanes[lane] = LANE_TYPE.GAP;
    }
    gen.bridgeLeft--;
    if (gen.bridgeLeft === 0) gen.cooldown = CONFIG.REACTION_SEGS;
    maybePlaceFuel(lanes, gen, gen.bridgeLane);
    maybePlacePickup(lanes, gen, index);
    return { index, lanes };
  }
  // 新障碍簇：保证车道与当前车道差 ≤ 1（③可达性）
  const options = [gen.safeLane - 1, gen.safeLane, gen.safeLane + 1]
    .filter(l => l >= 0 && l < CONFIG.LANES);
  gen.clusterLane = options[Math.floor(Math.random() * options.length)];
  gen.clusterLeft = 1 + (Math.random() < 0.3 + 0.4 * d ? 1 : 0)
                      + (d > 0.6 && Math.random() < 0.3 ? 1 : 0); // 1~3 段
  fillClusterLanes(lanes, gen.clusterLane, d);
  gen.clusterLeft--;
  if (gen.clusterLeft === 0) {
    gen.safeLane = gen.clusterLane;
    gen.cooldown = CONFIG.REACTION_SEGS;
  }
  maybePlaceFuel(lanes, gen, gen.clusterLane);
  maybePlacePickup(lanes, gen, index);
  const segN = { index, lanes };
  const enN = maybePlaceEnemy(lanes, gen, index, d, gen.clusterLane);  // 避开簇保证车道
  if (enN) segN.enemies = [enN];
  return segN;
}

// ⑤ 燃料布置：在保证车道上优先；随机补充（第六轮概率 0.10→0.06，燃料不再泛滥）
function maybePlaceFuel(lanes, gen, guaranteedLane) {
  gen.sinceFuel++;
  if (gen.sinceFuel >= CONFIG.FUEL_FORCE_EVERY) {
    placeFuel(lanes, guaranteedLane);
    gen.sinceFuel = 0;
    return;
  }
  if (Math.random() < 0.06) {
    const ground = laneIndices().filter(l => lanes[l] === LANE_TYPE.ROAD);
    if (ground.length > 0) {
      lanes[ground[Math.floor(Math.random() * ground.length)]] = LANE_TYPE.FUEL;
      gen.sinceFuel = 0;
    }
  }
}

// 道具布置：平均 40~60 段一枚（PICKUP_MIN_GAP=40 到期后每次机会 20% 概率，
// 期望 ≈ 45~50 段），四种按 BOOST→SLOW→TRIPLE→MAGNET 顺序轮换（轮换保证均匀出现，
// 每种期望间隔 ≈ 180~200 段）。
// 只放在纯 ROAD 车道上 —— 道具是"可安全碾压的路面"，不占障碍名额、不影响可解性。
function maybePlacePickup(lanes, gen, index) {
  if (index < CONFIG.WARMUP_SEGMENTS) return;
  gen.sincePickup++;
  if (gen.sincePickup < CONFIG.PICKUP_MIN_GAP) return;
  if (Math.random() >= 0.2) return;
  const ground = laneIndices().filter(l => lanes[l] === LANE_TYPE.ROAD);
  if (ground.length === 0) return;
  const kinds = [LANE_TYPE.BOOST, LANE_TYPE.SLOW, LANE_TYPE.TRIPLE, LANE_TYPE.MAGNET];
  const kind = kinds[gen.pickupCycle % kinds.length];
  gen.pickupCycle++;
  lanes[ground[Math.floor(Math.random() * ground.length)]] = kind;
  gen.sincePickup = 0;
}

// ---- 敌人布置（战斗系统）----
// 只在障碍簇段与缓冲段调用；红线：绝不放在当段保证车道上
// （簇段避开 clusterLane，缓冲段避开 safeLane）—— "沿保证车道前进"永远安全。
// 只放在纯 ROAD 车道（不与墙/缺口/道具叠放），每段最多 1 个；
// segment ≥ ENEMY_MIN_INDEX(80) 才出现，概率 0.06 + 0.10×难度 随难度爬升。
// drone：轻量悬浮机（紫/橙，旋转桨叶），高度 500 < 单跳 879，可跳过也可击落，
//   换道走状态机 rest→warn(0.6s 预警闪烁/抖动/倾斜，车道不动)→move(0.4s 平滑滑到
//   相邻车道)，渲染与碰撞共用 enemyLane() 同一连续位置，所见即所判；
// turret：重型炮塔（暗紫），高度 1900 > 二段跳 1758，跳不过，炮管追踪玩家方向，
//   只能变道躲避、击毁或用导弹清除 —— 高难度（d>0.3）才混编出现。
function maybePlaceEnemy(lanes, gen, index, d, guaranteedLane) {
  if (index < CONFIG.ENEMY_MIN_INDEX) return null;
  if (Math.random() >= 0.06 + 0.10 * d) return null;
  const spots = laneIndices().filter(l => l !== guaranteedLane && lanes[l] === LANE_TYPE.ROAD);
  if (spots.length === 0) return null;
  const lane = spots[Math.floor(Math.random() * spots.length)];
  if (d > 0.3 && Math.random() < 0.35) {
    return { type: 'turret', lane: lane, phase: Math.random() * Math.PI * 2 };
  }
  return {
    type: 'drone', lane: lane, phase: Math.random() * Math.PI * 2,
    // 换道状态机：rest（停留 restT 秒）→ warn（预警，车道不动）→ move（平滑滑向 toLane）
    state: 'rest', fromLane: lane, toLane: lane,
    moveT: 1, warnT: 0, restT: 1 + Math.random() * 2.5,
  };
}

function buildTrack() {
  STATE.gen = newGenState();
  const track = [];
  for (let i = 0; i < CONFIG.TRACK_INITIAL_SEGMENTS; i++) {
    track.push(generateSegment(i, STATE.gen));
  }
  return track;
}

// 动态扩展赛道：玩家接近尾部时追加（无限）
function extendTrack() {
  while (STATE.track.length < STATE.position + CONFIG.TRACK_KEEP_AHEAD) {
    STATE.track.push(generateSegment(STATE.track.length, STATE.gen));
  }
}

// ============================================================
// 5. 伪 3D 渲染 Render
// ============================================================
// 唯一投影函数：跑道、障碍块、燃料、飞船、阴影全部共用。
// 相机固定在玩家身后 CAMERA_BACK 处（随 position 滚动），
// 因此玩家 zRel 恒为 CAMERA_BACK，飞船与其当前 segment 在屏幕上重叠。
function project(worldX, worldY, zRel) {
  if (zRel < 8) return { x: 0, y: 0, scale: 0, visible: false };
  const scale = CONFIG.CAMERA_DEPTH / zRel;
  const w = STATE.width, h = STATE.height;
  const horizon = h * CONFIG.HORIZON_RATIO;
  return {
    x: w / 2 + scale * worldX * (w / 2),
    y: horizon + scale * (CONFIG.CAMERA_HEIGHT - worldY) * (h / 2),
    scale: scale,
    visible: true,
  };
}

// segment 边界（segment 单位 k）到相机的距离（世界单位）
function zRelOf(k) {
  return (k - STATE.position) * CONFIG.SEGMENT_LENGTH + CONFIG.CAMERA_BACK;
}

// 车道中心 worldX
function laneCenterX(lane) {
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  return (lane - (CONFIG.LANES - 1) / 2) * laneWidth;
}

// 玩家当前 worldX（含变道插值）—— 渲染与碰撞共用同一插值来源
function playerWorldX() {
  return laneCenterX(STATE.movement.lanePosition);
}

// 颜色明暗调整
function shade(color, factor) {
  const r = Math.min(255, Math.round(parseInt(color.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(color.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(color.slice(5, 7), 16) * factor));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// 四边形路径（调用方自行 fill/stroke/clip）
function quad(ctx, p1, p2, p3, p4) {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
}

// 渲染跑道：从远到近（画家算法）
function renderTrack(ctx) {
  const track = STATE.track;
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  const startIdx = Math.floor(STATE.position) + CONFIG.RENDER_DISTANCE;
  const endIdx = Math.floor(STATE.position) - 1;   // 含玩家当前段与其后 1 段

  // 第一遍：路面梯形
  for (let i = startIdx; i >= endIdx; i--) {
    if (i < 0 || i >= track.length) continue;
    const seg = track[i];
    const zNear = zRelOf(i), zFar = zRelOf(i + 1);
    if (zFar < 8) continue;

    const baseDark = (Math.floor(i / 3) % 2 === 0) ? '#3a3a55' : '#34344e';
    for (let lane = 0; lane < CONFIG.LANES; lane++) {
      const type = seg.lanes[lane];
      const xL = -halfRoad + lane * laneWidth;
      const xR = xL + laneWidth;
      const p1 = project(xL, 0, zNear);
      const p2 = project(xR, 0, zNear);
      const p3 = project(xR, 0, zFar);
      const p4 = project(xL, 0, zFar);
      if (!p3.visible) continue;
      if (type === LANE_TYPE.GAP) {
        // 缺口：深渊 + 醒目的红色警示描边（随全局时钟脉冲）+ 指向深渊的箭头纹
        if (!p1.visible) continue;
        ctx.fillStyle = '#05050d';
        quad(ctx, p1, p2, p3, p4); ctx.fill();
        const pulse = 0.45 + 0.35 * Math.sin(STATE.time * 4 + i * 0.8);
        ctx.strokeStyle = 'rgba(255,60,70,' + pulse.toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        // 箭头纹（▼ 指向缺口深处，相位与描边同步）
        ctx.fillStyle = 'rgba(255,80,90,' + (pulse * 0.9).toFixed(3) + ')';
        for (const f of [0.25, 0.5, 0.75]) {
          const ex = p1.x + (p2.x - p1.x) * f;   // 近边缘点
          const ey = p1.y + (p2.y - p1.y) * f;
          const fx = p4.x + (p3.x - p4.x) * f;   // 对应远边缘点
          const fy = p4.y + (p3.y - p4.y) * f;
          const s = Math.max(3, (p2.x - p1.x) * 0.06);
          const tx = ex + (fx - ex) * 0.35, ty = ey + (fy - ey) * 0.35;
          ctx.beginPath();
          ctx.moveTo(ex - s, ey); ctx.lineTo(ex + s, ey); ctx.lineTo(tx, ty);
          ctx.closePath(); ctx.fill();
        }
        // 深渊余烬：暗红光点缓慢上升（由近缘飘向深处），
        // 横向位置与相位均为 (segIndex, lane, k) 的确定性哈希，不用随机数
        for (let k = 0; k < 5; k++) {
          const hA = Math.sin(i * 127.1 + lane * 311.7 + k * 74.7) * 43758.5453;
          const hB = Math.sin(i * 269.5 + lane * 183.3 + k * 41.9) * 28001.8384;
          const fxE = hA - Math.floor(hA);             // 横向位置 0..1
          const phE = hB - Math.floor(hB);             // 上升相位 0..1
          const cyc = (STATE.time * 0.25 + phE) % 1;   // 上升循环：0 近缘 → 1 深处
          const nx = p1.x + (p2.x - p1.x) * fxE;       // 近缘对应点
          const ny = p1.y + (p2.y - p1.y) * fxE;
          const dx = p4.x + (p3.x - p4.x) * fxE;       // 深处对应点
          const dy = p4.y + (p3.y - p4.y) * fxE;
          const emx = nx + (dx - nx) * cyc;
          const emy = ny + (dy - ny) * cyc;
          const emA = Math.sin(cyc * Math.PI) * 0.55;  // 两端淡入淡出
          const emS = Math.max(1, (p2.x - p1.x) * 0.018 * (1 - cyc * 0.5));
          ctx.fillStyle = 'rgba(255,95,60,' + emA.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(emx, emy, emS, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      if (!p1.visible) continue;
      ctx.fillStyle = baseDark;
      quad(ctx, p1, p2, p3, p4); ctx.fill();
      // 车道分隔线
      if (lane > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }
    }

    // 横向跑道边线（增强纵深感）
    if (i % 4 === 0) {
      const nearLeft = project(-halfRoad, 0, zNear);
      const nearRight = project(halfRoad, 0, zNear);
      if (nearLeft.visible) {
        ctx.strokeStyle = 'rgba(120,200,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nearLeft.x, nearLeft.y);
        ctx.lineTo(nearRight.x, nearRight.y);
        ctx.stroke();
      }
    }
  }

  // 第二遍：WALL_LOW / WALL_HIGH / FUEL / 道具 / 敌人 立体物（从远到近）
  for (let i = startIdx; i >= endIdx; i--) {
    if (i < 0 || i >= track.length) continue;
    const seg = track[i];
    const zNear = zRelOf(i), zFar = zRelOf(i + 1);
    if (zFar < 8) continue;
    for (let lane = 0; lane < CONFIG.LANES; lane++) {
      const type = seg.lanes[lane];
      if (type === LANE_TYPE.WALL_LOW) {
        renderWallLow(ctx, lane, i, zNear, zFar);
      } else if (type === LANE_TYPE.WALL_HIGH) {
        renderWallHigh(ctx, lane, i, zNear, zFar);
      } else if (type === LANE_TYPE.FUEL) {
        renderFuel(ctx, lane, i, zNear, zFar);
      } else if (type === LANE_TYPE.BOOST || type === LANE_TYPE.SLOW || type === LANE_TYPE.TRIPLE || type === LANE_TYPE.MAGNET) {
        renderPickup(ctx, type, lane, i, zNear, zFar);
      }
    }
    // 敌人（独立实体，不占 LANE_TYPE）：与障碍同遍按深度排序渲染
    if (seg.enemies) {
      for (const e of seg.enemies) renderEnemy(ctx, e, i, zNear, zFar);
    }
  }
}

// 奖励道具渲染：悬浮在路面上低空的发光图标
// 黄/青白锯齿闪电 = 超级加速；紫色沙漏 = 减速；青白星形 = 超级形态；红白马蹄磁铁 = 燃料吸附
// 动画全部由 STATE.time + (segIndex, lane) 相位驱动，无每帧随机
function renderPickup(ctx, type, lane, segIndex, zNear, zFar) {
  const cx = laneCenterX(lane);
  const zMid = (zNear + zFar) / 2;
  const phase = segIndex * 1.1 + lane * 0.9;
  const y = 160 + Math.sin(STATE.time * 2.6 + phase) * 60;   // 低空上下浮动
  const p = project(cx, y, zMid);
  if (!p.visible) return;
  const u = p.scale * STATE.width / 2;
  const R = Math.max(2, 110 * u);
  const spin = STATE.time * 2 + phase;

  if (type === LANE_TYPE.BOOST) {
    // 黄/青白色光晕（呼吸）
    const pulse = 0.75 + 0.25 * Math.sin(STATE.time * 4 + phase);
    const glow = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R * 2.4);
    glow.addColorStop(0, 'rgba(255,240,130,' + (0.5 * pulse).toFixed(3) + ')');
    glow.addColorStop(0.6, 'rgba(150,230,255,' + (0.25 * pulse).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(150,230,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.4, 0, Math.PI * 2); ctx.fill();
    // 锯齿闪电本体（经典 Z 形，整体轻微摆动 —— 确定性相位）
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(STATE.time * 3 + phase) * 0.18);
    const bolt = [
      [-0.10, -1.00], [0.55, -0.10], [0.12, -0.10],
      [0.30, 1.00], [-0.50, 0.10], [-0.12, 0.10],
    ];
    ctx.beginPath();
    for (let k = 0; k < bolt.length; k++) {
      const vx = bolt[k][0] * R, vy = bolt[k][1] * R;
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    const boltGrad = ctx.createLinearGradient(0, -R, 0, R);
    boltGrad.addColorStop(0, '#fff8d0');
    boltGrad.addColorStop(0.5, '#ffe95a');
    boltGrad.addColorStop(1, '#ffb830');
    ctx.fillStyle = boltGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,250,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 电弧抖动：2 条小电弧绕本体，折点按 sin 哈希确定性抖动（禁随机）
    for (let k = 0; k < 2; k++) {
      const arcA = 0.35 + 0.35 * Math.sin(STATE.time * 11 + phase + k * 2.4);
      ctx.strokeStyle = 'rgba(170,235,255,' + arcA.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.beginPath();
      let ax = -0.1 * R, ay = -R;
      ctx.moveTo(ax, ay);
      for (let s2 = 1; s2 <= 4; s2++) {
        const f = s2 / 4;
        const jx = Math.sin(STATE.time * 13 + phase + k * 2.4 + s2 * 1.7) * 0.22 * R;
        ctx.lineTo(-0.1 * R + (0.4 * R) * f + jx, -R + 2 * R * f);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (type === LANE_TYPE.SLOW) {
    // 紫色光晕 + 外环
    const glow = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R * 2.2);
    glow.addColorStop(0, 'rgba(190,110,255,0.42)');
    glow.addColorStop(1, 'rgba(190,110,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.2, 0, Math.PI * 2); ctx.fill();
    const ringA = 0.5 + 0.4 * Math.sin(STATE.time * 3 + phase);
    ctx.strokeStyle = 'rgba(210,150,255,' + ringA.toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.25, 0, Math.PI * 2); ctx.stroke();
    // 沙漏：上下对顶三角
    ctx.fillStyle = 'rgba(200,130,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 0.6 * R, p.y - 0.85 * R); ctx.lineTo(p.x + 0.6 * R, p.y - 0.85 * R);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 0.6 * R, p.y + 0.85 * R); ctx.lineTo(p.x + 0.6 * R, p.y + 0.85 * R);
    ctx.closePath(); ctx.fill();
    // 沙粒：中线亮点自上而下循环（确定性）
    const drip = (STATE.time * 0.8 + phase) % 1;
    ctx.fillStyle = '#f0ddff';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 0.7 * R + drip * 1.4 * R, Math.max(1, R * 0.09), 0, Math.PI * 2);
    ctx.fill();
  } else if (type === LANE_TYPE.TRIPLE) {
    // TRIPLE：青白色星形 + ×3 字样（限时三段跳奖励，与黄闪电区分色系）
    const glow = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R * 2.2);
    glow.addColorStop(0, 'rgba(120,240,255,0.45)');
    glow.addColorStop(1, 'rgba(120,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = spin * 0.6 + k * Math.PI / 5 - Math.PI / 2;
      const rr = (k % 2 === 0) ? R : R * 0.45;
      const vx = p.x + Math.cos(a) * rr, vy = p.y + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fillStyle = '#8fefff';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (R > 10) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0a5a66';
      ctx.font = 'bold ' + Math.round(R * 0.62) + 'px monospace';
      ctx.fillText('×3', p.x, p.y + R * 0.22);
      ctx.restore();
    }
  } else {
    // MAGNET：红白马蹄磁铁（U 形铁芯 + 白色磁极帽），红光晕 + 青色吸附火花
    const glow = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R * 2.0);
    glow.addColorStop(0, 'rgba(255,110,110,0.40)');
    glow.addColorStop(1, 'rgba(255,110,110,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(STATE.time * 2.2 + phase) * 0.10);   // 轻微摆动（确定性）
    // U 形铁芯（两腿 + 顶部半圆，开口朝下）
    ctx.strokeStyle = '#d8384a';
    ctx.lineWidth = Math.max(2, R * 0.34);
    ctx.beginPath();
    ctx.moveTo(-0.55 * R, 0.72 * R);
    ctx.lineTo(-0.55 * R, 0.05 * R);
    ctx.arc(0, 0.05 * R, 0.55 * R, Math.PI, 2 * Math.PI, false);
    ctx.lineTo(0.55 * R, 0.72 * R);
    ctx.stroke();
    // 白色磁极帽（两腿下端）
    ctx.fillStyle = '#eef2f8';
    ctx.fillRect(-0.55 * R - R * 0.19, 0.52 * R, R * 0.38, R * 0.24);
    ctx.fillRect(0.55 * R - R * 0.19, 0.52 * R, R * 0.38, R * 0.24);
    // 磁极间青色吸附火花（3 颗循环下飘，确定性相位）
    ctx.fillStyle = '#7fe8ff';
    for (let k = 0; k < 3; k++) {
      const drip = (STATE.time * 0.9 + phase + k / 3) % 1;
      ctx.beginPath();
      ctx.arc((k - 1) * R * 0.28, R * (0.15 + drip * 0.55), Math.max(1, R * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---- 敌人渲染（与 checkCollisions / advanceShots 共用 enemyLane() 连续位置）----
// drone：紫/橙悬浮圆盘 + 4 叶旋转桨 + 悬浮 bob（高度 500，可跳过/空中射击击落）
//   预警期（warn）：红/白急促闪烁 + 原地小幅抖动 + 向目标车道倾斜（预告移动方向）
//   移动期（move）：平滑滑向相邻车道（enemyLane 插值）+ 侧倾
// turret：暗紫重型炮塔（高度 1900，跳不过）+ 炮管朝玩家方向倾转 + 警示灯
function renderEnemy(ctx, e, segIndex, zNear, zFar) {
  const lane = enemyLane(e);
  const cx = laneCenterX(lane);
  const zMid = (zNear + zFar) / 2;
  if (e.type === 'drone') {
    const warn = e.state === 'warn';
    const moving = e.state === 'move';
    const tiltDir = (warn || moving) ? Math.sign(e.toLane - e.fromLane) : 0;
    const bob = Math.sin(STATE.time * 2.2 + e.phase) * 40;
    const yC = 300 + bob;                          // 圆盘中心高度（顶部 ≈ 500）
    // 地面投影
    const g = project(cx, 0, zMid);
    if (g.visible) {
      const gu = g.scale * STATE.width / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 150 * gu, 38 * gu, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = project(cx, yC, zMid);
    if (!p.visible) return;
    const u = p.scale * STATE.width / 2;
    const R = Math.max(2, 190 * u);
    // 预警原地抖动（确定性高频 sin 小幅偏移，禁随机）
    const jx = warn ? Math.sin(STATE.time * 47 + e.phase) * 0.06 * R : 0;
    const jy = warn ? Math.sin(STATE.time * 39 + e.phase * 1.7) * 0.04 * R : 0;
    ctx.save();
    ctx.translate(p.x + jx, p.y + jy);
    ctx.rotate(tiltDir * (warn ? 0.30 : 0.18));    // 向目标车道方向倾斜
    // 旋转桨叶（4 叶，ang = time×18 + phase，确定性高速旋转）
    const ang = STATE.time * 18 + e.phase;
    ctx.strokeStyle = 'rgba(220,200,255,0.75)';
    ctx.lineWidth = Math.max(1, R * 0.09);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = ang + k * Math.PI / 2;
      ctx.moveTo(0, -R * 0.42);
      ctx.lineTo(Math.cos(a) * R * 1.25, -R * 0.42 + Math.sin(a) * R * 0.30);
    }
    ctx.stroke();
    // 桨毂
    ctx.fillStyle = '#3a2a5a';
    ctx.beginPath(); ctx.arc(0, -R * 0.42, R * 0.16, 0, Math.PI * 2); ctx.fill();
    // 圆盘机体（紫色金属渐变）
    const hull = ctx.createLinearGradient(0, -R * 0.5, 0, R * 0.5);
    hull.addColorStop(0, '#a06ae0');
    hull.addColorStop(0.55, '#6a3aa8');
    hull.addColorStop(1, '#3a1f66');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,210,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 橙色能量核心（呼吸辉光）
    const coreA = 0.6 + 0.4 * Math.sin(STATE.time * 5 + e.phase);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    core.addColorStop(0, 'rgba(255,170,70,' + (0.95 * coreA).toFixed(3) + ')');
    core.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
    // 预警闪烁：红光罩 + 白闪描边（sin×20 急促闪烁，一眼可读"它要动了"）
    if (warn) {
      const fl = 0.5 + 0.5 * Math.sin(STATE.time * 20 + e.phase);
      ctx.fillStyle = 'rgba(255,50,55,' + (0.40 * fl).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,245,245,' + (0.9 * fl).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, R * 0.06);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.05, R * 0.47, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // turret：暗紫重型炮塔（收分柱体 + 顶部炮座 + 追踪炮管 + 警示灯）
    const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
    const halfRoad = CONFIG.ROAD_WIDTH / 2;
    const inB = laneWidth * 0.16, inT = laneWidth * 0.30;
    const xLb = -halfRoad + lane * laneWidth + inB;
    const xRb = -halfRoad + (lane + 1) * laneWidth - inB;
    const xLt = -halfRoad + lane * laneWidth + inT;
    const xRt = -halfRoad + (lane + 1) * laneWidth - inT;
    const H = CONFIG.TURRET_HEIGHT;
    const b1 = project(xLb, 0, zNear), b2 = project(xRb, 0, zNear);
    const t1 = project(xLt, H, zNear), t2 = project(xRt, H, zNear);
    const t3 = project(xRt, H, zFar),  t4 = project(xLt, H, zFar);
    const b3 = project(xRb, 0, zFar),  b4 = project(xLb, 0, zFar);
    if (!b1.visible || !t1.visible || !t3.visible) return;
    if (b3.visible) {                              // 侧面（深暗紫）
      ctx.fillStyle = '#1c0f2e';
      quad(ctx, b2, b3, t3, t2); ctx.fill();
      quad(ctx, b1, b4, t4, t1); ctx.fill();
    }
    ctx.fillStyle = '#4a2a6a';                     // 顶面
    quad(ctx, t1, t2, t3, t4); ctx.fill();
    ctx.fillStyle = '#2e1a4a';                     // 正面（暗紫梯形）
    quad(ctx, b1, b2, t2, t1); ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,200,0.55)';     // 装甲棱线
    ctx.lineWidth = Math.max(1, (b2.x - b1.x) * 0.03);
    ctx.beginPath();
    for (const f of [0.3, 0.7]) {
      ctx.moveTo(b1.x + (b2.x - b1.x) * f, b1.y + (b2.y - b1.y) * f);
      ctx.lineTo(t1.x + (t2.x - t1.x) * f, t1.y + (t2.y - t1.y) * f);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,120,240,0.6)';     // 外轮廓亮边
    ctx.lineWidth = 1.5;
    quad(ctx, b1, b2, t2, t1); ctx.stroke();
    // 炮管：自塔顶炮座朝玩家车道方向倾转（追踪感）
    const xm = (xLt + xRt) / 2;
    const mount = project(xm, H, zNear);
    if (mount.visible) {
      const mu = mount.scale * STATE.width / 2;
      const dir = Math.sign(playerWorldX() - cx) || 1;
      const tilt = dir * 0.55;                     // 朝玩家侧倾
      const bl = 340 * mu;                         // 炮管长
      ctx.strokeStyle = '#120a20';
      ctx.lineWidth = Math.max(2, 70 * mu);
      ctx.beginPath();
      ctx.moveTo(mount.x, mount.y);
      ctx.lineTo(mount.x + Math.sin(tilt) * bl, mount.y - Math.cos(tilt) * bl * 0.5);
      ctx.stroke();
      ctx.strokeStyle = '#5a3a80';
      ctx.lineWidth = Math.max(1, 40 * mu);
      ctx.beginPath();
      ctx.moveTo(mount.x, mount.y);
      ctx.lineTo(mount.x + Math.sin(tilt) * bl, mount.y - Math.cos(tilt) * bl * 0.5);
      ctx.stroke();
      // 炮口警示灯（急促红闪 = 危险）
      const blink = 0.5 + 0.5 * Math.sin(STATE.time * 9 + e.phase);
      const mx = mount.x + Math.sin(tilt) * bl, my = mount.y - Math.cos(tilt) * bl * 0.5;
      ctx.fillStyle = 'rgba(255,60,70,' + (0.35 + 0.6 * blink).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(mx, my, Math.max(1.5, 40 * mu), 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---- 弹道渲染：子弹 = 青白曳光短束；导弹 = 小型火箭 + 橙焰 + 尾烟 ----
// 弹道画在携带高度 sh.y（= 发射瞬间 playerY）上 —— 与命中判定同一高度来源
function renderShots(ctx) {
  for (const sh of STATE.shots) {
    const zRel = (sh.seg - STATE.position) * CONFIG.SEGMENT_LENGTH + CONFIG.CAMERA_BACK;
    if (zRel < 9) continue;
    const zTail = zRel + CONFIG.SEGMENT_LENGTH * 0.7;      // 尾迹滞后 0.7 段
    const wx = laneCenterX(sh.lanePosition);
    if (sh.kind === 'bullet') {
      const pH = project(wx, sh.y, zRel);
      const pT = project(wx, sh.y, zTail);
      if (!pH.visible) continue;
      // 曳光：尾部淡 → 头部亮的短线束
      const grad = ctx.createLinearGradient(pT.x, pT.y, pH.x, pH.y);
      grad.addColorStop(0, 'rgba(120,230,255,0)');
      grad.addColorStop(1, 'rgba(230,250,255,0.95)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1.5, pH.scale * 26 * STATE.width / 2);
      ctx.beginPath();
      ctx.moveTo(pT.x, pT.y); ctx.lineTo(pH.x, pH.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pH.x, pH.y, Math.max(1.5, pH.scale * 20 * STATE.width / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pH = project(wx, sh.y, zRel);
      const pT = project(wx, sh.y, zTail * 1.15);
      if (!pH.visible) continue;
      const u = pH.scale * STATE.width / 2;
      const R = Math.max(2, 60 * u);
      // 尾烟（尾部径向渐变灰团）
      if (pT.visible) {
        const smoke = ctx.createRadialGradient(pT.x, pT.y, 0, pT.x, pT.y, R * 2.2);
        smoke.addColorStop(0, 'rgba(200,200,210,0.35)');
        smoke.addColorStop(1, 'rgba(200,200,210,0)');
        ctx.fillStyle = smoke;
        ctx.beginPath(); ctx.arc(pT.x, pT.y, R * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // 尾焰
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(pH.x - R * 0.35, pH.y + R * 0.4);
      ctx.lineTo(pH.x, pH.y + R * (1.2 + Math.random() * 0.5));   // 尾焰允许随机抖动
      ctx.lineTo(pH.x + R * 0.35, pH.y + R * 0.4);
      ctx.closePath(); ctx.fill();
      // 弹体（军绿金属 + 铜头）
      const bg = ctx.createLinearGradient(pH.x, pH.y - R, pH.x, pH.y + R * 0.5);
      bg.addColorStop(0, '#e8b34a');
      bg.addColorStop(0.35, '#7a8a52');
      bg.addColorStop(1, '#3c4a26');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(pH.x, pH.y - R * 1.1);
      ctx.lineTo(pH.x - R * 0.42, pH.y + R * 0.4);
      ctx.lineTo(pH.x + R * 0.42, pH.y + R * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(240,240,220,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// 矮墙（可跳过）：两侧金属立柱 + 中间红色能量场
// 立柱：分面着色 + 铆钉 + 缩小版黄色警示条纹 + 顶部状态灯；
// 能量场：半透明红 + 随 STATE.time 水平流动的竖直扫描线 + 远端淡影（深度感）。
// 视觉语义：红 = 危险；低矮轮廓暗示"跳得过去"。
// 碰撞判定不变：整个车道宽都算墙（能量场同样是实体屏障，语义合理）。
function renderWallLow(ctx, lane, segIndex, zNear, zFar) {
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const xL = -halfRoad + lane * laneWidth + laneWidth * 0.10;
  const xR = -halfRoad + (lane + 1) * laneWidth - laneWidth * 0.10;
  const pw = laneWidth * 0.16;                   // 单侧立柱宽度
  const xLP = xL + pw, xRP = xR - pw;            // 能量场左右边界（立柱内缘）
  const H = CONFIG.WALL_LOW_HEIGHT;              // 与碰撞判定共用

  // ---- 能量场（先画，半透明，立柱之后会被立柱压住边缘）----
  const fb1 = project(xLP, 0, zNear), fb2 = project(xRP, 0, zNear);
  const ft1 = project(xLP, H, zNear), ft2 = project(xRP, H, zNear);
  const fb4 = project(xLP, 0, zFar),  fb3 = project(xRP, 0, zFar);
  const ft4 = project(xLP, H, zFar),  ft3 = project(xRP, H, zFar);
  if (fb1.visible && ft1.visible) {
    // 远端淡影（能量场纵深）
    if (ft3.visible) {
      ctx.fillStyle = 'rgba(255,45,65,0.10)';
      quad(ctx, fb4, fb3, ft3, ft4); ctx.fill();
    }
    // 近端主场
    ctx.fillStyle = 'rgba(255,45,65,0.26)';
    quad(ctx, fb1, fb2, ft2, ft1); ctx.fill();
    // 竖直扫描线：随时间水平流动（相位按 segment/车道错开，确定性）
    ctx.save();
    quad(ctx, fb1, fb2, ft2, ft1); ctx.clip();
    for (let k = 0; k < 3; k++) {
      const fxS = (STATE.time * 0.55 + segIndex * 0.37 + lane * 0.21 + k * 0.333) % 1;
      const bx = fb1.x + (fb2.x - fb1.x) * fxS;
      const by = fb1.y + (fb2.y - fb1.y) * fxS;
      const tx = ft1.x + (ft2.x - ft1.x) * fxS;
      const ty = ft1.y + (ft2.y - ft1.y) * fxS;
      ctx.strokeStyle = 'rgba(255,120,140,' + (0.30 + 0.30 * Math.sin(fxS * Math.PI)).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, (fb2.x - fb1.x) * 0.02);
      ctx.beginPath();
      ctx.moveTo(bx, by); ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    // 能量场上下辉光边
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,80,100,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fb1.x, fb1.y); ctx.lineTo(fb2.x, fb2.y);
    ctx.moveTo(ft1.x, ft1.y); ctx.lineTo(ft2.x, ft2.y);
    ctx.stroke();
  }

  // ---- 两侧金属立柱 ----
  const blink = 0.5 + 0.5 * Math.sin(STATE.time * 6 + segIndex * 1.1 + lane * 2.3);
  for (const pair of [[xL, xLP], [xRP, xR]]) {
    const px0 = pair[0], px1 = pair[1];
    const b1 = project(px0, 0, zNear), b2 = project(px1, 0, zNear);
    const b4 = project(px0, 0, zFar),  b3 = project(px1, 0, zFar);
    const t1 = project(px0, H, zNear), t2 = project(px1, H, zNear);
    const t4 = project(px0, H, zFar),  t3 = project(px1, H, zFar);
    if (!b1.visible || !t1.visible || !t3.visible) continue;
    // 侧面（暗面）
    if (b3.visible) {
      ctx.fillStyle = '#272c3c';
      quad(ctx, b2, b3, t3, t2); ctx.fill();
      quad(ctx, b1, b4, t4, t1); ctx.fill();
    }
    // 顶面（亮面）
    ctx.fillStyle = '#6a7288';
    quad(ctx, t1, t2, t3, t4); ctx.fill();
    // 正面（金属深灰）
    ctx.fillStyle = '#454b5e';
    quad(ctx, b1, b2, t2, t1); ctx.fill();
    // 正面下半部：缩小版黄色警示条纹（保留原警示元素）
    ctx.save();
    quad(ctx, b1, b2, t2, t1); ctx.clip();
    const minX = Math.min(b1.x, t1.x), maxX = Math.max(b2.x, t2.x);
    const maxY = Math.max(b1.y, b2.y);
    const bandH = (maxY - Math.min(t1.y, t2.y)) * 0.38;
    const step = Math.max(5, (maxX - minX) / 2.5);
    ctx.strokeStyle = 'rgba(255,206,64,0.8)';
    ctx.lineWidth = step * 0.4;
    ctx.beginPath();
    for (let x = minX - bandH; x < maxX + bandH; x += step) {
      ctx.moveTo(x, maxY + 2);
      ctx.lineTo(x + bandH, maxY - bandH);
    }
    ctx.stroke();
    ctx.restore();
    // 铆钉（3 颗，确定性位置）
    ctx.fillStyle = '#9aa2b8';
    for (const fyR of [0.28, 0.55, 0.82]) {
      const rx = (b1.x + (t1.x - b1.x) * fyR) * 0.5 + (b2.x + (t2.x - b2.x) * fyR) * 0.5;
      const ry = (b1.y + (t1.y - b1.y) * fyR) * 0.5 + (b2.y + (t2.y - b2.y) * fyR) * 0.5;
      ctx.beginPath();
      ctx.arc(rx, ry, Math.max(1, (b2.x - b1.x) * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
    // 顶部状态灯（随全局时钟闪烁，相位错开）
    const lxp = (t1.x + t2.x) / 2, lyp = (t1.y + t2.y) / 2;
    const lr = Math.max(1.5, (t2.x - t1.x) * 0.18);
    ctx.fillStyle = 'rgba(255,40,60,' + (0.30 * blink).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(lxp, lyp, lr * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,130,' + (0.45 + 0.55 * blink).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(lxp, lyp, lr, 0, Math.PI * 2); ctx.fill();
  }
}

// 高塔（不可跳过，必须变道）：暗红高塔 —— 收分轮廓 + 垂直棱线/肋骨 + 塔顶脉冲灯
// 视觉语义：暗深红 + 逼近地平线的高度 + 与矮墙截然不同的轮廓 = "这个跳不过去"
function renderWallHigh(ctx, lane, segIndex, zNear, zFar) {
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const inB = laneWidth * 0.10, inT = laneWidth * 0.26;  // 底部/顶部内缩（收分造型）
  const xLb = -halfRoad + lane * laneWidth + inB;
  const xRb = -halfRoad + (lane + 1) * laneWidth - inB;
  const xLt = -halfRoad + lane * laneWidth + inT;
  const xRt = -halfRoad + (lane + 1) * laneWidth - inT;
  const H = CONFIG.WALL_HIGH_HEIGHT;   // 与碰撞判定共用（1500 > 跳跃顶点 879）
  const b1 = project(xLb, 0, zNear), b2 = project(xRb, 0, zNear);
  const b4 = project(xLb, 0, zFar),  b3 = project(xRb, 0, zFar);
  const t1 = project(xLt, H, zNear), t2 = project(xRt, H, zNear);
  const t4 = project(xLt, H, zFar),  t3 = project(xRt, H, zFar);
  if (!b1.visible || !t1.visible || !t3.visible) return;
  // 侧面（深暗红）
  if (b3.visible) {
    ctx.fillStyle = '#2e060d';
    quad(ctx, b2, b3, t3, t2); ctx.fill();
    quad(ctx, b1, b4, t4, t1); ctx.fill();
  }
  // 顶面
  ctx.fillStyle = '#7a1420';
  quad(ctx, t1, t2, t3, t4); ctx.fill();
  // 正面（暗红梯形）
  ctx.fillStyle = '#4d0a16';
  quad(ctx, b1, b2, t2, t1); ctx.fill();
  // 垂直棱线/肋骨纹理
  ctx.strokeStyle = 'rgba(160,40,55,0.8)';
  ctx.lineWidth = Math.max(1, (b2.x - b1.x) * 0.03);
  ctx.beginPath();
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.moveTo(b1.x + (b2.x - b1.x) * f, b1.y + (b2.y - b1.y) * f);
    ctx.lineTo(t1.x + (t2.x - t1.x) * f, t1.y + (t2.y - t1.y) * f);
  }
  ctx.stroke();
  // 外轮廓亮边（强化剪影，与矮墙区分）
  ctx.strokeStyle = 'rgba(200,50,64,0.65)';
  ctx.lineWidth = 1.5;
  quad(ctx, b1, b2, t2, t1); ctx.stroke();
  // 侧缘灯带：沿两条前棱的宽发光描边，缓慢呼吸
  const edgeGlow = 0.30 + 0.20 * Math.sin(STATE.time * 2.4 + segIndex * 0.7);
  ctx.strokeStyle = 'rgba(255,70,90,' + edgeGlow.toFixed(3) + ')';
  ctx.lineWidth = Math.max(2, (b2.x - b1.x) * 0.05);
  ctx.beginPath();
  ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y);
  ctx.moveTo(b2.x, b2.y); ctx.lineTo(t2.x, t2.y);
  ctx.stroke();
  // 塔身灯点阵列：8 行 × 3 列小窗灯，明暗随时间错相闪烁（确定性相位）
  const faceW = b2.x - b1.x;
  if (faceW > 14) {                    // 远处塔太窄时省略，省性能
    for (let r = 0; r < 8; r++) {
      const fyW = (r + 0.6) / 8.6;
      for (let c = 0; c < 3; c++) {
        const fxW = (c + 0.5) / 3;
        const wx = (b1.x + (b2.x - b1.x) * fxW) + ((t1.x + (t2.x - t1.x) * fxW) - (b1.x + (b2.x - b1.x) * fxW)) * fyW;
        const wy = (b1.y + (b2.y - b1.y) * fxW) + ((t1.y + (t2.y - t1.y) * fxW) - (b1.y + (b2.y - b1.y) * fxW)) * fyW;
        const lit = 0.5 + 0.5 * Math.sin(STATE.time * 2 + segIndex * 0.7 + r * 1.3 + c * 2.1);
        ctx.fillStyle = 'rgba(255,140,90,' + (0.15 + 0.55 * lit).toFixed(3) + ')';
        const ww = Math.max(1, faceW * 0.05), wh = Math.max(1, (b1.y - t1.y) * 0.018);
        ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
      }
    }
  }
  // 扫描光：一道亮带沿塔身上下往复
  const scanF = 0.5 + 0.5 * Math.sin(STATE.time * 1.6 + segIndex * 0.5);
  const sx1 = b1.x + (t1.x - b1.x) * scanF, sy1 = b1.y + (t1.y - b1.y) * scanF;
  const sx2 = b2.x + (t2.x - b2.x) * scanF, sy2 = b2.y + (t2.y - b2.y) * scanF;
  ctx.strokeStyle = 'rgba(255,120,130,0.45)';
  ctx.lineWidth = Math.max(1.5, (b1.y - t1.y) * 0.012);
  ctx.beginPath();
  ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
  ctx.stroke();
  // 顶部尖塔/天线 + 急促闪烁的顶端信标
  const xm = (xLt + xRt) / 2;
  const ab = project(xm, H, zNear);
  const at = project(xm, H + 260, zNear);
  if (ab.visible && at.visible) {
    ctx.strokeStyle = '#8a4a52';
    ctx.lineWidth = Math.max(1, (t2.x - t1.x) * 0.08);
    ctx.beginPath();
    ctx.moveTo(ab.x, ab.y); ctx.lineTo(at.x, at.y);
    ctx.stroke();
    const tipBlink = 0.5 + 0.5 * Math.sin(STATE.time * 8 + segIndex * 1.3);
    ctx.fillStyle = 'rgba(255,90,105,' + (0.35 + 0.6 * tipBlink).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(at.x, at.y, Math.max(1.5, (t2.x - t1.x) * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }
  // 塔顶警示灯：缓慢脉冲（区别于矮墙的急促闪烁）
  const pulse = 0.5 + 0.5 * Math.sin(STATE.time * 3 + segIndex * 0.9 + lane * 1.7);
  const bx = (t1.x + t2.x) / 2, by = (t1.y + t2.y) / 2;
  const r = Math.max(1.5, (t2.x - t1.x) * 0.16);
  ctx.fillStyle = 'rgba(255,50,70,' + (0.25 * pulse).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(bx, by, r * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,90,105,' + (0.35 + 0.5 * pulse).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
}

// 燃料宝物：悬浮发光晶体 —— 上下浮动（sin 相位）+ 2D 旋转近似 + 青色渐变光晕 + 白色高光
// 视觉语义：青色 + 发光 + 悬浮动感 = "可以吃的好东西"，与红色危险物形成强对比
function renderFuel(ctx, lane, segIndex, zNear, zFar) {
  const cx = laneCenterX(lane);
  const zMid = (zNear + zFar) / 2;
  // 相位由 segment/车道索引决定 —— 确定性的，不用 Math.random() 每帧跳变
  const phase = segIndex * 1.3 + lane * 0.7;
  const y = CONFIG.FUEL_BLOCK_HEIGHT + Math.sin(STATE.time * 2.2 + phase) * CONFIG.FUEL_BOB_AMPLITUDE;
  // 地面投影（悬浮感，随高度变淡变小）
  const g = project(cx, 0, zMid);
  if (g.visible) {
    const gu = g.scale * STATE.width / 2;
    const hr = Math.max(0.3, 1 - y / 1500);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.30 * hr).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 110 * gu * hr, 28 * gu * hr, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = project(cx, y, zMid);
  if (!p.visible) return;
  const ux = p.scale * STATE.width / 2;
  const uy = p.scale * STATE.height / 2;
  const R = Math.max(2, 120 * ux);               // 晶体半宽（世界 120）
  const Ry = Math.max(2, 165 * uy);              // 晶体半高
  // 接地光柱：晶体下方淡青色锥形光束（宽度随悬浮高度呼吸）
  if (g.visible) {
    const beamA = 0.20 * (1 - (y - CONFIG.FUEL_BLOCK_HEIGHT + CONFIG.FUEL_BOB_AMPLITUDE) / (2 * CONFIG.FUEL_BOB_AMPLITUDE) * 0.5);
    const beamGrad = ctx.createLinearGradient(g.x, g.y, p.x, p.y);
    beamGrad.addColorStop(0, 'rgba(70,255,220,' + beamA.toFixed(3) + ')');
    beamGrad.addColorStop(1, 'rgba(70,255,220,0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(g.x - R * 0.55, g.y);
    ctx.lineTo(g.x + R * 0.55, g.y);
    ctx.lineTo(p.x + R * 0.22, p.y + Ry * 0.5);
    ctx.lineTo(p.x - R * 0.22, p.y + Ry * 0.5);
    ctx.closePath(); ctx.fill();
  }
  // 径向渐变光晕
  const glow = ctx.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R * 2.6);
  glow.addColorStop(0, 'rgba(70,255,220,0.40)');
  glow.addColorStop(1, 'rgba(70,255,220,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.6, 0, Math.PI * 2); ctx.fill();
  // 旋转晶体：六角形交替半径，近似 2D 旋转的刻面宝石
  const ang = STATE.time * 1.6 + phase;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = ang + k * Math.PI / 3;
    const rr = (k % 2 === 0) ? 1 : 0.62;
    const vx = p.x + Math.cos(a) * R * rr;
    const vy = p.y + Math.sin(a) * Ry * rr;
    if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(p.x - R, p.y - Ry, p.x + R, p.y + Ry);
  grad.addColorStop(0, '#0e8f78');
  grad.addColorStop(0.5, '#2fe8c0');
  grad.addColorStop(1, '#8ffff0');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(225,255,248,0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 白色高光
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(p.x - R * 0.28, p.y - Ry * 0.32, R * 0.16, Ry * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 内核高光：中心小型径向辉点（能量核心感）
  const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 0.55);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.4, 'rgba(180,255,240,0.55)');
  core.addColorStop(1, 'rgba(180,255,240,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.55, 0, Math.PI * 2); ctx.fill();
  // 环绕火花：4 个小火花按确定性相位绕晶体椭圆公转（禁随机）
  for (let k = 0; k < 4; k++) {
    const a = STATE.time * 3 + phase + k * Math.PI / 2;
    const spx = p.x + Math.cos(a) * R * 1.55;
    const spy = p.y + Math.sin(a) * Ry * 0.75;
    const sr = Math.max(1, R * 0.09);
    const sparkA = 0.45 + 0.45 * Math.sin(a * 2);
    ctx.fillStyle = 'rgba(191,255,242,' + (sparkA * 0.35).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(spx, spy, sr * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(230,255,250,' + sparkA.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(spx, spy, sr, 0, Math.PI * 2); ctx.fill();
  }
}

// ============================================================
// 5b. 玩家飞船渲染 —— 与跑道共用 project()，放在玩家当前 z 处
// ============================================================
function renderPlayer(ctx) {
  if (STATE.mode === 'GAMEOVER') return;   // 死亡后由爆炸粒子替代
  const px = playerWorldX();
  // 阴影（贴地投影，随跳跃高度变淡变小）
  const sh = project(px, 0, CONFIG.CAMERA_BACK);
  if (sh.visible) {
    const su = sh.scale * STATE.width / 2;
    const hRatio = Math.max(0.25, 1 - STATE.playerY / 1200);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.45 * hRatio).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, 170 * su * hRatio, 45 * su * hRatio, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 飞船本体：屏幕位置由 project() 计算（zRel = CAMERA_BACK，即玩家当前段）
  // —— 投影一致性是"所见即所判"的根基，此处调用方式不可更改
  const p = project(px, STATE.playerY, CONFIG.CAMERA_BACK);
  if (!p.visible) return;
  const cx = p.x, cy = p.y;
  const shipLayout = globalThis.Skyroads.presentation.fallbackShipLayout(
    STATE.width, STATE.height, cx, cy,
  );
  const W2 = shipLayout.halfWidth;
  const H = shipLayout.height;

  // ---- 船尾尾迹粒子：短寿命，允许随机；在渲染侧生成，updateEffects 推进 ----
  // 超级加速期间：额外喷出青白"速度线"残影（更长、更快、更亮）
  if (STATE.mode === 'PLAYING') {
    STATE.trail.push({
      x: cx + (Math.random() - 0.5) * 0.6 * W2,
      y: cy + (0.2 + Math.random() * 0.15) * H,
      vx: (Math.random() - 0.5) * 30,
      vy: 60 + Math.random() * 70,
      life: 0.26 + Math.random() * 0.16,
      maxLife: 0.42,
      size: 1 + Math.random() * 2.5,
      streak: false,
    });
    if (STATE.boostT > 0) {
      for (let k = 0; k < 3; k++) {
        STATE.trail.push({
          x: cx + (Math.random() - 0.5) * 1.4 * W2,
          y: cy + (0.1 + Math.random() * 0.3) * H,
          vx: (Math.random() - 0.5) * 20,
          vy: 320 + Math.random() * 260,          // 高速向后拖
          life: 0.14 + Math.random() * 0.12,
          maxLife: 0.26,
          size: 1 + Math.random() * 1.5,
          streak: true,                            // 渲染为纵向速度线
        });
      }
    }
    if (STATE.tripleT > 0) {
      // 超级形态：金色能量火花沿船体向后飘散（变身期的身份标识）
      for (let k = 0; k < 2; k++) {
        STATE.trail.push({
          x: cx + (Math.random() - 0.5) * 1.6 * W2,
          y: cy + (Math.random() - 0.5) * 0.8 * H,
          vx: (Math.random() - 0.5) * 40,
          vy: 80 + Math.random() * 120,
          life: 0.22 + Math.random() * 0.14,
          maxLife: 0.36,
          size: 1 + Math.random() * 2,
          streak: false,
          gold: true,
        });
      }
    }
    if (STATE.trail.length > 110) STATE.trail.splice(0, STATE.trail.length - 110);
  }
  for (const pt of STATE.trail) {
    const a = Math.max(0, pt.life / pt.maxLife);
    if (pt.streak) {
      ctx.strokeStyle = 'rgba(190,240,255,' + (a * 0.65).toFixed(3) + ')';
      ctx.lineWidth = pt.size;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y + 8 + pt.size * 4);
      ctx.stroke();
    } else {
      ctx.fillStyle = pt.gold
        ? 'rgba(255,215,120,' + (a * 0.6).toFixed(3) + ')'
        : 'rgba(120,220,255,' + (a * 0.45).toFixed(3) + ')';
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
  }

  // ---- 姿态（全部由游戏状态确定性驱动，船体轮廓不随机）----
  // 变道倾斜（bank/roll）：由当前分段方向与已缓动进度派生，不参与碰撞。
  const movementDirection = Math.sign(STATE.movement.segmentTarget - STATE.movement.segmentStart);
  const movementDistance = STATE.movement.segmentTarget - STATE.movement.segmentStart;
  const easedMovementProgress = movementDistance === 0
    ? 1
    : (STATE.movement.lanePosition - STATE.movement.segmentStart) / movementDistance;
  const bank = STATE.movement.segmentActive
    ? movementDirection * Math.sin(easedMovementProgress * Math.PI) * 0.22
    : 0;
  // 上仰（pitch）：由垂直速度驱动 —— 起跳瞬间上仰最大，顶点归零，下落时压头
  // 滑翔时机体拉平（noseLift ×0.3），配合机翼展开 ×1.15、尾焰 ×0.5（见下方绘制）
  const pitch = Math.max(-1, Math.min(1, STATE.playerVY / CONFIG.JUMP_VELOCITY));
  const noseLift = pitch * 0.22 * H * (STATE.gliding ? 0.3 : 1);   // 机头额外抬升量
  const noseY = -H - noseLift;

  // 后坐动感：二段跳瞬间船体下沉再回弹（recoil 1→0，sin 半波包络，轻微不遮挡判读）
  const cyR = cy + Math.sin(STATE.recoil * Math.PI) * 0.14 * H;
  // 透视朝向（第六轮反馈）：赛道有近大远小的透视，飞船却永远正面同比例 → 违和。
  // 按车道偏移给船体加 yaw 偏转（机头朝消失点，每车道 ≈2.6°，边缘 ≈8°）+
  // 轻微水平剪切（配合地面倾斜感）；变道插值期间平滑过渡
  const laneFNow = STATE.movement.lanePosition;
  const laneOff = laneFNow - (CONFIG.LANES - 1) / 2;      // ±3
  ctx.save();
  ctx.translate(cx, cyR);
  ctx.rotate(bank - laneOff * 0.045);
  ctx.transform(1, 0, laneOff * 0.030, 1, 0, 0);          // 剪切：x 随 y 偏移

  const presentation = globalThis.Skyroads.presentation;
  const energized = STATE.boostT > 0 || STATE.tripleT > 0 || STATE.playerY > 0 || STATE.jumpBurst > 0;
  const visualPlan = presentation.playerVisualLayerPlan(STATE.visualAssets, {
    energized,
    chargeActive: STATE.chargeT > 0 && STATE.mode === 'PLAYING',
    boostActive: STATE.boostT > 0,
    superActive: STATE.tripleT > 0,
  });
  const shipFrame = visualPlan.shipFrame;
  const spanK = STATE.gliding ? 1.15 : 1;
  if (shipFrame) {
    const frameRect = presentation.computeShipDrawRect(STATE.width, STATE.height, 4 / 3);
    ctx.drawImage(
      shipFrame,
      -frameRect.width / 2,
      -frameRect.height * 0.75,
      frameRect.width,
      frameRect.height,
    );
  } else {

  // ---- 跃升推进器爆发（二段跳触发：醒目的橙红大焰团 + 白芯，短寿命）----
  if (STATE.jumpBurst > 0) {
    const br = STATE.jumpBurst / 0.28;                 // 1 → 0 衰减
    // 外层橙红大焰团
    ctx.fillStyle = 'rgba(255,90,40,' + (0.72 * br).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(-0.5 * W2, 0.15 * H);
    ctx.lineTo(0, 0.15 * H + (0.4 + 1.5 * br) * H * (0.9 + Math.random() * 0.2));
    ctx.lineTo(0.5 * W2, 0.15 * H);
    ctx.closePath(); ctx.fill();
    // 中层亮橙
    ctx.fillStyle = 'rgba(255,150,60,' + (0.80 * br).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(-0.3 * W2, 0.15 * H);
    ctx.lineTo(0, 0.15 * H + (0.3 + 1.0 * br) * H);
    ctx.lineTo(0.3 * W2, 0.15 * H);
    ctx.closePath(); ctx.fill();
    // 内层白芯
    ctx.fillStyle = 'rgba(255,255,255,' + (0.88 * br).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(-0.14 * W2, 0.15 * H);
    ctx.lineTo(0, 0.15 * H + (0.2 + 0.55 * br) * H);
    ctx.lineTo(0.14 * W2, 0.15 * H);
    ctx.closePath(); ctx.fill();
  }

  // ---- 滑翔姿态参数：机翼展开 ×1.15、尾焰收小 ×0.5、机体拉平（noseLift 已 ×0.3）----
  const flameK = STATE.gliding ? 0.5 : 1;

  // ---- 双引擎舱 + 双主尾焰（橙色主引擎；超级加速期间尾焰拉长变大）----
  const boostFlame = (STATE.boostT > 0 ? 2.0 : 1) * flameK;   // 加速尾焰倍率
  for (const s of [-1, 1]) {
    const exX = s * 0.42 * W2;
    const fl = (0.40 + Math.random() * 0.22) * H * boostFlame;   // 尾焰允许随机抖动
    ctx.fillStyle = STATE.boostT > 0 ? '#ffaa33' : '#ff8833';
    ctx.beginPath();
    ctx.moveTo(exX - 0.12 * W2, 0.18 * H);
    ctx.lineTo(exX, 0.18 * H + fl);
    ctx.lineTo(exX + 0.12 * W2, 0.18 * H);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd9a0';                         // 内焰
    ctx.beginPath();
    ctx.moveTo(exX - 0.06 * W2, 0.18 * H);
    ctx.lineTo(exX, 0.18 * H + fl * 0.55);
    ctx.lineTo(exX + 0.06 * W2, 0.18 * H);
    ctx.closePath(); ctx.fill();
    // 引擎舱体（金属纵向渐变装甲）
    const nacG = ctx.createLinearGradient(exX, -0.08 * H, exX, 0.22 * H);
    nacG.addColorStop(0, '#525c7e');
    nacG.addColorStop(0.55, '#2e3550');
    nacG.addColorStop(1, '#181e30');
    ctx.fillStyle = nacG;
    ctx.beginPath();
    ctx.moveTo(exX - 0.13 * W2, -0.05 * H);
    ctx.lineTo(exX - 0.15 * W2, 0.20 * H);
    ctx.lineTo(exX + 0.15 * W2, 0.20 * H);
    ctx.lineTo(exX + 0.13 * W2, -0.05 * H);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(127,223,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 舱体面板刻线
    ctx.strokeStyle = 'rgba(10,14,26,0.55)';
    ctx.lineWidth = Math.max(1, 0.010 * H);
    ctx.beginPath();
    ctx.moveTo(exX - 0.135 * W2, 0.06 * H);
    ctx.lineTo(exX + 0.135 * W2, 0.06 * H);
    ctx.stroke();
    // 喷口金属环（ellipse 亮描边）+ 内部径向橙辉（引擎内燃光）
    ctx.strokeStyle = '#9aa4c0';
    ctx.lineWidth = Math.max(1.2, 0.022 * H);
    ctx.beginPath();
    ctx.ellipse(exX, 0.20 * H, 0.15 * W2, 0.045 * H, 0, 0, Math.PI * 2);
    ctx.stroke();
    const nozGlow = ctx.createRadialGradient(exX, 0.20 * H, 0, exX, 0.20 * H, 0.13 * W2);
    nozGlow.addColorStop(0, 'rgba(255,190,110,0.85)');
    nozGlow.addColorStop(0.6, 'rgba(255,120,50,0.35)');
    nozGlow.addColorStop(1, 'rgba(255,120,50,0)');
    ctx.fillStyle = nozGlow;
    ctx.beginPath();
    ctx.ellipse(exX, 0.20 * H, 0.13 * W2, 0.038 * H, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- 主机翼（金属纵向渐变 + 面板刻线 + 前缘铆钉 + 翼尖航行灯）----
  const wingG = ctx.createLinearGradient(0, noseY, 0, 0.30 * H);
  wingG.addColorStop(0, '#3c445f');
  wingG.addColorStop(0.6, '#252b40');
  wingG.addColorStop(1, '#161b2c');
  ctx.fillStyle = wingG;
  ctx.beginPath();
  ctx.moveTo(0, noseY);                         // 机头
  ctx.lineTo(-W2 * spanK, 0.18 * H);            // 左翼尖（滑翔 ×1.15）
  ctx.lineTo(-0.62 * W2 * spanK, 0.10 * H);     // 左翼后缘凹口
  ctx.lineTo(-0.30 * W2, 0.30 * H);
  ctx.lineTo(0.30 * W2, 0.30 * H);
  ctx.lineTo(0.62 * W2 * spanK, 0.10 * H);
  ctx.lineTo(W2 * spanK, 0.18 * H);             // 右翼尖
  ctx.closePath(); ctx.fill();
  // 翼上面板刻线（2 条/侧，自机头附近向后缘发散）
  ctx.strokeStyle = 'rgba(10,14,26,0.6)';
  ctx.lineWidth = Math.max(1, 0.012 * H);
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 0.10 * W2, noseY * 0.55);
    ctx.lineTo(s * 0.52 * W2 * spanK, 0.13 * H);
    ctx.moveTo(s * 0.22 * W2, noseY * 0.25);
    ctx.lineTo(s * 0.80 * W2 * spanK, 0.15 * H);
  }
  ctx.stroke();
  // 翼前缘亮色描边
  ctx.strokeStyle = 'rgba(127,223,255,0.8)';
  ctx.lineWidth = Math.max(1, 0.02 * H);
  ctx.beginPath();
  ctx.moveTo(0, noseY); ctx.lineTo(-W2 * spanK, 0.18 * H);
  ctx.moveTo(0, noseY); ctx.lineTo(W2 * spanK, 0.18 * H);
  ctx.stroke();
  // 前缘铆钉（4 颗/侧，沿前缘确定性均布）
  ctx.fillStyle = '#aab4cf';
  for (const s of [-1, 1]) {
    for (let k = 1; k <= 4; k++) {
      const f = k / 5;
      ctx.beginPath();
      ctx.arc(s * f * W2 * spanK * 0.96, noseY + (0.18 * H - noseY) * f, Math.max(1, 0.012 * H), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 翼尖航行灯（左红右绿，确定性错相闪烁；滑翔时随翼展外移）
  const nav = 0.5 + 0.5 * Math.sin(STATE.time * 5);
  ctx.fillStyle = 'rgba(255,70,70,' + (0.4 + 0.6 * nav).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(-0.97 * W2 * spanK, 0.17 * H, Math.max(1.5, 0.05 * W2), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(90,255,140,' + (0.4 + 0.6 * (1 - nav)).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(0.97 * W2 * spanK, 0.17 * H, Math.max(1.5, 0.05 * W2), 0, Math.PI * 2); ctx.fill();

  // ---- 机身双层装甲板（下暗上亮，叠出装甲厚度）----
  const armorLow = ctx.createLinearGradient(-0.34 * W2, 0, 0.34 * W2, 0);
  armorLow.addColorStop(0, '#5b6580');
  armorLow.addColorStop(0.5, '#454e6a');
  armorLow.addColorStop(1, '#525b78');
  ctx.fillStyle = armorLow;
  ctx.beginPath();
  ctx.moveTo(0, noseY * 0.92);
  ctx.lineTo(-0.34 * W2, 0.06 * H);
  ctx.lineTo(-0.26 * W2, 0.34 * H);
  ctx.lineTo(0.26 * W2, 0.34 * H);
  ctx.lineTo(0.34 * W2, 0.06 * H);
  ctx.closePath(); ctx.fill();
  // 上层主装甲（金属横向渐变，中央高光）
  const bodyGrad = ctx.createLinearGradient(-0.3 * W2, 0, 0.3 * W2, 0);
  bodyGrad.addColorStop(0, '#8a93ad');
  bodyGrad.addColorStop(0.5, '#eef1f8');
  bodyGrad.addColorStop(1, '#7a839c');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(0, noseY);
  ctx.lineTo(-0.30 * W2, 0.05 * H);
  ctx.lineTo(-0.22 * W2, 0.32 * H);
  ctx.lineTo(0.22 * W2, 0.32 * H);
  ctx.lineTo(0.30 * W2, 0.05 * H);
  ctx.closePath(); ctx.fill();
  // 机身横向面板刻线（2 条）
  ctx.strokeStyle = 'rgba(40,48,70,0.55)';
  ctx.lineWidth = Math.max(1, 0.012 * H);
  ctx.beginPath();
  ctx.moveTo(-0.27 * W2, 0.12 * H); ctx.lineTo(0.27 * W2, 0.12 * H);
  ctx.moveTo(-0.235 * W2, 0.24 * H); ctx.lineTo(0.235 * W2, 0.24 * H);
  ctx.stroke();
  // 机身中脊线
  ctx.strokeStyle = 'rgba(40,48,70,0.85)';
  ctx.lineWidth = Math.max(1, 0.015 * H);
  ctx.beginPath();
  ctx.moveTo(0, noseY + 0.05 * H);
  ctx.lineTo(0, 0.30 * H);
  ctx.stroke();
  // 装甲铆钉（沿两腰 3 颗/侧）
  ctx.fillStyle = '#c6cede';
  for (const s of [-1, 1]) {
    for (const fy of [0.14, 0.22, 0.30]) {
      const fx = s * (0.30 - fy * 0.28) * W2;
      ctx.beginPath();
      ctx.arc(fx, fy * H, Math.max(1, 0.010 * H), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 两侧进气口（深色梯形 + 内描边）----
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#141a2c';
    ctx.beginPath();
    ctx.moveTo(s * 0.20 * W2, 0.04 * H);
    ctx.lineTo(s * 0.30 * W2, 0.10 * H);
    ctx.lineTo(s * 0.26 * W2, 0.26 * H);
    ctx.lineTo(s * 0.18 * W2, 0.22 * H);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(127,223,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- 座舱后垂尾（小三角翼，暗金属 + 青边）----
  ctx.fillStyle = '#2c3450';
  ctx.beginPath();
  ctx.moveTo(0, 0.0 * H);
  ctx.lineTo(-0.07 * W2, 0.30 * H);
  ctx.lineTo(0.07 * W2, 0.30 * H);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(127,223,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-0.07 * W2, 0.30 * H); ctx.lineTo(0, 0.0 * H); ctx.lineTo(0.07 * W2, 0.30 * H);
  ctx.stroke();

  // ---- 座舱三层玻璃（外层渐变 + 内层深色 + 双高光弧）----
  const canopyGrad = ctx.createLinearGradient(0, -0.55 * H - noseLift, 0, -0.05 * H);
  canopyGrad.addColorStop(0, '#bfe8ff');
  canopyGrad.addColorStop(0.4, '#3aa0ff');
  canopyGrad.addColorStop(1, '#0a2a55');
  ctx.fillStyle = canopyGrad;
  ctx.beginPath();
  ctx.moveTo(0, -0.55 * H - noseLift * 0.8);
  ctx.lineTo(-0.16 * W2, -0.05 * H);
  ctx.lineTo(0.16 * W2, -0.05 * H);
  ctx.closePath(); ctx.fill();
  // 内层深色玻璃（层次纵深）
  const innerG = ctx.createLinearGradient(0, -0.44 * H - noseLift * 0.7, 0, -0.07 * H);
  innerG.addColorStop(0, 'rgba(20,60,120,0.55)');
  innerG.addColorStop(1, 'rgba(6,20,46,0.75)');
  ctx.fillStyle = innerG;
  ctx.beginPath();
  ctx.moveTo(0, -0.44 * H - noseLift * 0.7);
  ctx.lineTo(-0.115 * W2, -0.07 * H);
  ctx.lineTo(0.115 * W2, -0.07 * H);
  ctx.closePath(); ctx.fill();
  // 双高光弧
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, 0.012 * H);
  ctx.beginPath();
  ctx.moveTo(-0.02 * W2, -0.48 * H - noseLift * 0.8);
  ctx.lineTo(-0.10 * W2, -0.12 * H);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.40)';
  ctx.beginPath();
  ctx.moveTo(0.05 * W2, -0.40 * H - noseLift * 0.65);
  ctx.lineTo(0.10 * W2, -0.16 * H);
  ctx.stroke();

  // ---- 青色能量饰条（2 条流动虚线，相位由 STATE.time 驱动，确定性）----
  ctx.save();
  ctx.setLineDash([Math.max(2, 0.07 * H), Math.max(2, 0.05 * H)]);
  ctx.lineDashOffset = -STATE.time * 0.45 * H;
  ctx.strokeStyle = 'rgba(90,240,255,0.85)';
  ctx.lineWidth = Math.max(1.2, 0.020 * H);
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 0.19 * W2, 0.28 * H);
    ctx.lineTo(s * 0.10 * W2, -0.30 * H - noseLift * 0.4);
  }
  ctx.stroke();
  ctx.restore();

  // ---- 滑翔喷口（滑翔期间两翼下持续喷出橙黄火焰，与主引擎尾焰区分：
  //      位置更靠翼展外侧、焰型短宽、高频抖动；松键/落地/油尽即熄）----
  if (STATE.gliding) {
    for (const s of [-1, 1]) {
      const tx = s * 0.72 * W2 * spanK;
      // 小喷口（暗金属短管）
      ctx.fillStyle = '#2a3048';
      ctx.beginPath();
      ctx.moveTo(tx - 0.07 * W2, 0.10 * H);
      ctx.lineTo(tx - 0.08 * W2, 0.20 * H);
      ctx.lineTo(tx + 0.08 * W2, 0.20 * H);
      ctx.lineTo(tx + 0.07 * W2, 0.10 * H);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,110,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 橙黄喷焰（外光晕 + 外橙内黄白长焰，焰长高频抖动 —— 短寿命随机允许）
      // 注：7 车道相机下整船仅 ~70px 宽，喷焰必须放大加亮才能被看见（教训：按船体比例的 0.3H 焰长只有几像素）
      const fl2 = (0.55 + Math.random() * 0.35) * H;
      // 外光晕
      ctx.fillStyle = 'rgba(255,140,46,0.30)';
      ctx.beginPath();
      ctx.moveTo(tx - 0.20 * W2, 0.16 * H);
      ctx.lineTo(tx, 0.16 * H + fl2 * 1.25);
      ctx.lineTo(tx + 0.20 * W2, 0.16 * H);
      ctx.closePath(); ctx.fill();
      // 主焰（外橙）
      ctx.fillStyle = '#ff8c2e';
      ctx.beginPath();
      ctx.moveTo(tx - 0.14 * W2, 0.20 * H);
      ctx.lineTo(tx, 0.20 * H + fl2);
      ctx.lineTo(tx + 0.14 * W2, 0.20 * H);
      ctx.closePath(); ctx.fill();
      // 内焰（黄白芯）
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(tx - 0.07 * W2, 0.20 * H);
      ctx.lineTo(tx, 0.20 * H + fl2 * 0.6);
      ctx.lineTo(tx + 0.07 * W2, 0.20 * H);
      ctx.closePath(); ctx.fill();
    }
  }
  }

  // ---- 超级形态变身：金白能量装甲（顶部双光刃 + 金色翼缘辉光 + 金座舱 +
  //      金色流动能量中脊）。预警期（tripleT < TRIPLE_WARN_TIME）与光环同频
  //      time×10 急促闪烁；常驻期 time×6 慢脉冲，一眼可辨"我是超级形态" ----
  if (visualPlan.layers.includes('super-surface')) {
    const sWarn = STATE.tripleT < CONFIG.TRIPLE_WARN_TIME;
    const sF = sWarn ? (0.55 + 0.45 * Math.sin(STATE.time * 10)) : (0.85 + 0.15 * Math.sin(STATE.time * 6));
    // 顶部双光刃（能量鳍，自座舱后方向斜上方展开，金色半透明）
    for (const s of [-1, 1]) {
      ctx.fillStyle = 'rgba(255,214,110,' + (0.55 * sF).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(s * 0.06 * W2, -0.28 * H);
      ctx.lineTo(s * 0.30 * W2, -0.86 * H - noseLift * 0.5);
      ctx.lineTo(s * 0.16 * W2, -0.24 * H);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,200,' + (0.85 * sF).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, 0.014 * H);
      ctx.stroke();
    }
    // 金色翼缘辉光（沿两翼前缘叠一层金色描边）
    ctx.strokeStyle = 'rgba(255,214,110,' + (0.9 * sF).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, 0.03 * H);
    ctx.beginPath();
    ctx.moveTo(0, noseY); ctx.lineTo(-W2 * spanK, 0.18 * H);
    ctx.moveTo(0, noseY); ctx.lineTo(W2 * spanK, 0.18 * H);
    ctx.stroke();
    // 金色座舱罩（覆盖原蓝色玻璃，同形状）
    ctx.fillStyle = 'rgba(255,226,140,' + (0.38 * sF).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, -0.55 * H - noseLift * 0.8);
    ctx.lineTo(-0.16 * W2, -0.05 * H);
    ctx.lineTo(0.16 * W2, -0.05 * H);
    ctx.closePath(); ctx.fill();
    // 机身金色能量中脊（流动虚线，与青色饰条同机制但更亮更快）
    ctx.save();
    ctx.setLineDash([Math.max(2, 0.06 * H), Math.max(2, 0.04 * H)]);
    ctx.lineDashOffset = -STATE.time * 0.7 * H;
    ctx.strokeStyle = 'rgba(255,236,170,' + (0.95 * sF).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, 0.024 * H);
    ctx.beginPath();
    ctx.moveTo(0, 0.30 * H);
    ctx.lineTo(0, noseY + 0.05 * H);
    ctx.stroke();
    ctx.restore();
    // 船体金色能量洗（沿机翼轮廓叠一层半透明金，整船"镀"上变身色）
    ctx.fillStyle = 'rgba(255,205,95,' + (0.13 * sF).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, noseY);
    ctx.lineTo(-W2 * spanK, 0.18 * H);
    ctx.lineTo(-0.62 * W2 * spanK, 0.10 * H);
    ctx.lineTo(-0.30 * W2, 0.30 * H);
    ctx.lineTo(0.30 * W2, 0.30 * H);
    ctx.lineTo(0.62 * W2 * spanK, 0.10 * H);
    ctx.lineTo(W2 * spanK, 0.18 * H);
    ctx.closePath(); ctx.fill();
    // 三颗轨道能量球（绕船体椭圆轨道旋转，确定性相位，随船体倾斜）
    for (let k = 0; k < 3; k++) {
      const oa = STATE.time * 2.4 + k * (Math.PI * 2 / 3);
      const ox = Math.cos(oa) * 1.25 * W2;
      const oy = Math.sin(oa) * 0.75 * H - 0.15 * H;
      const orad = Math.max(2, 0.05 * H);
      const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, orad * 3);
      og.addColorStop(0, 'rgba(255,240,190,' + (0.9 * sF).toFixed(3) + ')');
      og.addColorStop(0.4, 'rgba(255,205,95,' + (0.5 * sF).toFixed(3) + ')');
      og.addColorStop(1, 'rgba(255,205,95,0)');
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(ox, oy, orad * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,220,' + (0.95 * sF).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, orad, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- J 蓄力能量场（第六轮反馈：原效果太浅，全面加强）----
  // 机头前方能量球显著长大（0.35H → 1.2H）+ 白亮核心（>30%）+ 折线电弧（>40%）
  // + 满蓄金色旋转虚线环 —— 不看 HUD 也能明确感知蓄力进度
  if (visualPlan.layers.includes('charge')) {
    const cf = Math.min(1, STATE.chargeT / CONFIG.CHARGE_TIME);
    const full = cf >= 1;
    const cxE = 0, cyE = noseY * 0.55;
    const cr = (0.35 + 0.85 * cf) * H * (full ? (1 + 0.15 * Math.sin(STATE.time * 12)) : 1);
    // 外层能量光晕
    const cg = ctx.createRadialGradient(cxE, cyE, 0, cxE, cyE, cr);
    if (full) {
      cg.addColorStop(0, 'rgba(255,244,200,0.95)');
      cg.addColorStop(0.45, 'rgba(255,205,95,0.65)');
    } else {
      cg.addColorStop(0, 'rgba(255,190,110,' + (0.45 + 0.40 * cf).toFixed(3) + ')');
      cg.addColorStop(0.45, 'rgba(255,140,46,' + (0.35 * cf).toFixed(3) + ')');
    }
    cg.addColorStop(1, 'rgba(255,140,46,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cxE, cyE, cr, 0, Math.PI * 2); ctx.fill();
    // 白亮核心（蓄力 >30% 出现，越满越亮越大）
    if (cf > 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.6 * cf).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cxE, cyE, Math.max(1.5, cr * 0.18), 0, Math.PI * 2); ctx.fill();
    }
    // 折线电弧（蓄力 >40%：3 条火花自能量球向外跳，短寿命随机允许）
    if (cf > 0.4) {
      ctx.strokeStyle = 'rgba(255,224,150,' + (0.5 + 0.4 * cf).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, 0.012 * H);
      for (let k = 0; k < 3; k++) {
        const a0 = Math.random() * Math.PI * 2;
        const r0 = cr * 0.55, r1 = cr * (1.0 + Math.random() * 0.5);
        const midA = a0 + (Math.random() - 0.5) * 0.9;
        ctx.beginPath();
        ctx.moveTo(cxE + Math.cos(a0) * r0, cyE + Math.sin(a0) * r0);
        ctx.lineTo(cxE + Math.cos(midA) * (r0 + r1) / 2, cyE + Math.sin(midA) * (r0 + r1) / 2);
        ctx.lineTo(cxE + Math.cos(a0 + (Math.random() - 0.5) * 0.6) * r1, cyE + Math.sin(a0) * r1);
        ctx.stroke();
      }
    }
    // 满蓄：金色旋转虚线环（time×12 脉冲 + 旋转流动）
    if (full) {
      ctx.save();
      ctx.setLineDash([Math.max(2, 0.05 * H), Math.max(2, 0.04 * H)]);
      ctx.lineDashOffset = -STATE.time * 0.5 * H;
      ctx.strokeStyle = 'rgba(255,236,170,' + (0.7 + 0.3 * Math.sin(STATE.time * 12)).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, 0.02 * H);
      ctx.beginPath(); ctx.arc(cxE, cyE, cr * 1.15, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();

  // ---- 超级加速光环：青白色速度场光罩（剩余 < BOOST_WARN_TIME 时急促闪烁，
  //      与屏幕边缘预警光晕同频 time×8，节奏对齐）----
  if (visualPlan.layers.includes('boost-aura')) {
    const fading = STATE.boostT < CONFIG.BOOST_WARN_TIME ? (0.5 + 0.5 * Math.sin(STATE.time * 8)) : 1;
    const br2 = Math.max(W2, H) * 1.55;
    const pulse = (0.9 + 0.1 * Math.sin(STATE.time * 8)) * fading;
    const aura = ctx.createRadialGradient(cx, cy, br2 * 0.55, cx, cy, br2);
    aura.addColorStop(0, 'rgba(150,230,255,0)');
    aura.addColorStop(0.8, 'rgba(150,230,255,' + (0.18 * pulse).toFixed(3) + ')');
    aura.addColorStop(1, 'rgba(255,245,180,' + (0.55 * pulse).toFixed(3) + ')');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, br2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- 超级形态金色光环：脉冲能量场光罩（预警期与 HUD 条/船体同频 time×10
  //      急促闪烁；与 BOOST 青白光环可叠加，色温截然不同）----
  if (visualPlan.layers.includes('super-aura')) {
    const fading = STATE.tripleT < CONFIG.TRIPLE_WARN_TIME ? (0.5 + 0.5 * Math.sin(STATE.time * 10)) : 1;
    const ar = Math.max(W2, H) * 1.75;
    const pulse = (0.9 + 0.1 * Math.sin(STATE.time * 6)) * fading;
    const aura2 = ctx.createRadialGradient(cx, cyR, ar * 0.5, cx, cyR, ar);
    aura2.addColorStop(0, 'rgba(255,214,110,0)');
    aura2.addColorStop(0.75, 'rgba(255,214,110,' + (0.22 * pulse).toFixed(3) + ')');
    aura2.addColorStop(1, 'rgba(255,240,190,' + (0.60 * pulse).toFixed(3) + ')');
    ctx.fillStyle = aura2;
    ctx.beginPath();
    ctx.arc(cx, cyR, ar, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// 6. 背景 Background —— 星空 / 星云 / 行星 / 流星 / 地平线剪影
// ============================================================
// 三层视差星层：drift = 每 segment 的视差漂移像素系数（近层亮且快，远层暗且慢）
const STAR_LAYERS = (function () {
  const layers = [
    { n: 90, bMin: 0.15, bMax: 0.38, rMax: 1.0, drift: 1.5 },   // 远层：暗、慢
    { n: 80, bMin: 0.32, bMax: 0.62, rMax: 1.4, drift: 4 },     // 中层
    { n: 50, bMin: 0.58, bMax: 1.00, rMax: 1.9, drift: 9 },     // 近层：亮、快
  ];
  let seed = 12345;
  function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  return layers.map(L => {
    const stars = [];
    for (let i = 0; i < L.n; i++) {
      stars.push({ x: rand(), y: rand(), r: rand() * (L.rMax - 0.3) + 0.3, b: rand() * (L.bMax - L.bMin) + L.bMin });
    }
    return { drift: L.drift, stars };
  });
})();

// 地平线山脉剪影轮廓（固定种子，确定性）
const SILHOUETTE = (function () {
  let seed = 777;
  function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  const peaks = [];
  for (let i = 0; i <= 26; i++) peaks.push(0.25 + rand() * 0.75);
  return peaks;
})();

function renderBackground(ctx) {
  const w = STATE.width, h = STATE.height;
  const horizon = h * CONFIG.HORIZON_RATIO;   // 与投影地平线一致
  // 天空渐变
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(0.30, '#1a1a4e');
  grad.addColorStop(0.35, '#10081a');
  grad.addColorStop(1, '#000005');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // 星云色块（2 团低透明度径向渐变，固定位置）
  const nebulae = [
    { x: 0.20, y: 0.10, r: 0.32, c: 'rgba(96,64,168,0.16)' },
    { x: 0.62, y: 0.22, r: 0.26, c: 'rgba(32,124,148,0.13)' },
  ];
  for (const nb of nebulae) {
    const ng = ctx.createRadialGradient(nb.x * w, nb.y * h, 0, nb.x * w, nb.y * h, nb.r * w);
    ng.addColorStop(0, nb.c);
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, w, horizon);
  }
  // 大行星（右上天空）+ 光晕 + 行星环
  const pxX = 0.80 * w, pxY = 0.11 * h, pr = 0.055 * h;
  const halo = ctx.createRadialGradient(pxX, pxY, pr * 0.5, pxX, pxY, pr * 2.2);
  halo.addColorStop(0, 'rgba(255,190,130,0.28)');
  halo.addColorStop(1, 'rgba(255,190,130,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(pxX, pxY, pr * 2.2, 0, Math.PI * 2); ctx.fill();
  const pg = ctx.createLinearGradient(pxX - pr, pxY - pr, pxX + pr, pxY + pr);
  pg.addColorStop(0, '#e8a86a');
  pg.addColorStop(0.55, '#b06a3f');
  pg.addColorStop(1, '#5a2f22');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(pxX, pxY, pr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(240,210,170,0.45)';
  ctx.lineWidth = Math.max(1, pr * 0.10);
  ctx.beginPath();
  ctx.ellipse(pxX, pxY + pr * 0.15, pr * 1.7, pr * 0.42, -0.25, 0, Math.PI * 2);
  ctx.stroke();
  // 三层视差星层（随里程漂移，循环回绕）
  for (const layer of STAR_LAYERS) {
    const off = (STATE.position * layer.drift) % w;
    ctx.fillStyle = '#ffffff';
    for (const s of layer.stars) {
      const sx = (((s.x * w - off) % w) + w) % w;
      ctx.globalAlpha = s.b;
      ctx.beginPath();
      ctx.arc(sx, s.y * horizon, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // 流星：确定性周期划过（2 颗不同相位/轨迹，约 7s / 10.7s 一颗）
  for (let k = 0; k < 2; k++) {
    const cyc = (STATE.time / (7 + k * 3.7) + k * 0.53) % 1;
    if (cyc > 0.10) continue;
    const f = cyc / 0.10;                                  // 0→1 划过过程
    const mx = (0.15 + 0.3 * k + f * 0.35) * w;
    const my = (0.05 + 0.06 * k + f * 0.16) * horizon;
    const tail = 0.05 * w;
    ctx.strokeStyle = 'rgba(220,235,255,' + (Math.sin(f * Math.PI) * 0.8).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - tail, my - tail * 0.45);
    ctx.lineTo(mx, my);
    ctx.stroke();
  }
  // 地平线剪影：远山 + 空间站小塔（视差慢速移动，两份循环拼接）
  const silW = w * 1.5;
  const silOff = (STATE.position * 6) % silW;
  for (const rep of [0, 1]) {
    const baseX = rep * silW - silOff;
    const N = SILHOUETTE.length;
    const step = silW / (N - 1);
    ctx.fillStyle = '#0c0618';
    ctx.beginPath();
    ctx.moveTo(baseX, horizon + 2);
    for (let i = 0; i < N; i++) {
      ctx.lineTo(baseX + i * step, horizon - SILHOUETTE[i] * 0.085 * h);
    }
    ctx.lineTo(baseX + silW, horizon + 2);
    ctx.closePath();
    ctx.fill();
    // 空间站小塔（2 座/份）+ 确定性闪烁灯
    for (const ti of [7, 18]) {
      const tx = baseX + ti * step;
      const ty = horizon - SILHOUETTE[ti] * 0.085 * h;
      const th = 0.045 * h;
      ctx.fillStyle = '#161028';
      ctx.fillRect(tx - 3, ty - th, 6, th);
      const bl = 0.5 + 0.5 * Math.sin(STATE.time * 3 + ti + rep * 2);
      ctx.fillStyle = 'rgba(255,120,120,' + (0.3 + 0.6 * bl).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(tx, ty - th - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 跑道两侧装饰灯柱（纯装饰，不参与碰撞）：每 6 段一对，
// 随 position 向后飞驰增强速度感；灯光颜色交替、确定性闪烁
function renderSideDecor(ctx) {
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const startIdx = Math.floor(STATE.position) + CONFIG.RENDER_DISTANCE;
  const endIdx = Math.floor(STATE.position);
  for (let i = startIdx; i >= endIdx; i--) {
    if (i < 0 || i % 6 !== 0) continue;
    const z = zRelOf(i);
    if (z < 12) continue;
    const warm = (Math.floor(i / 6) % 2 === 1);
    for (const s of [-1, 1]) {
      const base = project(s * (halfRoad + 350), 0, z);
      const top = project(s * (halfRoad + 350), 260, z);
      if (!base.visible || !top.visible) continue;
      const lw = Math.max(1, Math.min(3, top.scale * 14 * STATE.width / 2));
      ctx.strokeStyle = 'rgba(90,100,140,0.7)';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y);
      ctx.stroke();
      const blink = 0.5 + 0.5 * Math.sin(STATE.time * 4 + i * 0.9 + s);
      const a = 0.30 + 0.55 * blink;
      ctx.fillStyle = warm
        ? 'rgba(255,180,90,' + a.toFixed(3) + ')'
        : 'rgba(120,220,255,' + a.toFixed(3) + ')';
      const r = Math.max(1, Math.min(7, top.scale * 50 * STATE.width / 2));
      ctx.beginPath();
      ctx.arc(top.x, top.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ============================================================
// 7. 物理与碰撞 Physics —— 子步扫掠，杜绝高速穿段漏判
// ============================================================
function updatePhysics(dt) {
  // J 蓄力累积：按住期间 1s/2s 提示 tick（音调渐高），满 CHARGE_TIME(3)s 就绪 ding；
  // 松手判定在 keyup（满蓄导弹 / 未满子弹），这里只负责进度与提示
  if (KEYS['j'] || KEYS['J']) {
    if (STATE.chargeT > 0 && STATE.chargeT < CONFIG.CHARGE_TIME) {
      STATE.chargeT = Math.min(CONFIG.CHARGE_TIME, STATE.chargeT + dt);
      const cst = STATE.chargeT >= CONFIG.CHARGE_TIME ? 3 : (STATE.chargeT >= 2 ? 2 : (STATE.chargeT >= 1 ? 1 : 0));
      if (cst > STATE.chargeStage) {
        STATE.chargeStage = cst;
        if (cst === 3) sfxChargeReady(); else sfxChargeTick(cst);
      }
    }
  }
  // 平滑加速：初速 8 = 满速 33%，ACCEL 0.4 → (24-8)/0.4 = 40 秒到满速。
  // BOOST 超级加速期间：速度锁定 BOOST_SPEED(36)；
  // 到期后恢复到吃闪电前的速度（boostPrevSpeed），再继续按 ACCEL 正常爬升。
  if (STATE.boostT > 0) {
    STATE.speed = CONFIG.BOOST_SPEED;
  } else {
    if (STATE.boostPrevSpeed > 0) {          // BOOST 刚结束：恢复加速前速度
      STATE.speed = STATE.boostPrevSpeed;
      STATE.boostPrevSpeed = 0;
    }
    STATE.speed = Math.min(CONFIG.MAX_SPEED, STATE.speed + CONFIG.ACCEL * dt);
  }

  // 扫掠：一帧移动距离按 ≤ 0.5 segment 切分子步，
  // 每个子步推进后做一次碰撞检测 —— 一帧跨越多段时逐段覆盖。
  // 子步数按"玩家位移与弹道位移的最大值"切分：弹速 = 玩家 + BULLET_SPEED(40)，
  // 最快 36+40 = 76 段/秒，若只按玩家速度切分，低速时子弹一子步可跨 3 段穿判。
  const maxV = STATE.speed + (STATE.shots.length > 0 ? CONFIG.BULLET_SPEED : 0);
  const steps = Math.max(1, Math.ceil((maxV * dt) / 0.5));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const movementStep = advanceMovement(STATE.movement, sdt * 1000);
    const previousLanePosition = movementStep.previousLanePosition;
    const currentLanePosition = movementStep.lanePosition;

    STATE.position += STATE.speed * sdt;
    STATE.distanceMeters += STATE.speed * sdt * CONFIG.DISTANCE_PER_SEGMENT;

    // 跳跃物理（含滑翔：空中 + 按住跳跃键 + 下落中 + 有燃料）
    if (STATE.playerY > 0 || STATE.playerVY > 0) {
      STATE.gliding = STATE.playerY > 0 && STATE.playerVY < 0 && jumpHeld() && STATE.fuel > 0;
      // 三段跳奖励期滑翔重力系数更小（TRIPLE_GLIDE_FACTOR 0.045 vs 基准 0.08），滞空更久
      const g = STATE.gliding
        ? CONFIG.GRAVITY * (STATE.tripleT > 0 ? CONFIG.TRIPLE_GLIDE_FACTOR : CONFIG.GLIDE_GRAVITY_FACTOR)
        : CONFIG.GRAVITY;
      STATE.playerVY -= g * sdt;
      STATE.playerY += STATE.playerVY * sdt;
      if (STATE.gliding) {
        // 滑翔额外耗油 GLIDE_DRAIN(9)/秒：滑翔 1s ≈ 9 燃料 = 2s 基础消耗
        STATE.fuel = Math.max(0, STATE.fuel - CONFIG.GLIDE_DRAIN * sdt);
      }
      if (STATE.playerY <= 0) { STATE.playerY = 0; STATE.playerVY = 0; STATE.jumpsUsed = 0; STATE.gliding = false; }  // 落地重置
    } else {
      STATE.gliding = false;
    }

    // 燃料消耗与计时；道具效果倒计时
    STATE.fuel = Math.max(0, STATE.fuel - CONFIG.FUEL_DRAIN_RATE * sdt);
    STATE.elapsedMs += sdt * 1000;
    if (STATE.boostT > 0) STATE.boostT = Math.max(0, STATE.boostT - sdt);
    if (STATE.tripleT > 0) {
      STATE.tripleT = Math.max(0, STATE.tripleT - sdt);
      if (STATE.tripleT === 0) superPowerDownFx();   // 自然到期：熄火特效 + 下行音
    }
    // BOOST 到期预警：最后 BOOST_WARN_TIME(1.5)s 内 3 声渐高 beep
    // （1.5 / 1.0 / 0.5s 三档阈值，boostWarnStage 防重发；吃闪电/开局时重置）
    if (STATE.boostT > 0 && STATE.boostT <= CONFIG.BOOST_WARN_TIME) {
      const stage = STATE.boostT > 1.0 ? 1 : (STATE.boostT > 0.5 ? 2 : 3);
      if (stage > STATE.boostWarnStage) {
        STATE.boostWarnStage = stage;
        sfxBoostWarn(stage);
      }
    }
    // 超级形态到期预警：最后 TRIPLE_WARN_TIME(3)s 内 3 声渐高 beep
    // （3 / 2 / 1s 三档阈值，tripleWarnStage 防重发；吃星/开局时重置）
    if (STATE.tripleT > 0 && STATE.tripleT <= CONFIG.TRIPLE_WARN_TIME) {
      const tStage = STATE.tripleT > 2.0 ? 1 : (STATE.tripleT > 1.0 ? 2 : 3);
      if (tStage > STATE.tripleWarnStage) {
        STATE.tripleWarnStage = tStage;
        sfxTripleWarn(tStage);
      }
    }
    if (STATE.bulletCD > 0) STATE.bulletCD = Math.max(0, STATE.bulletCD - sdt);

    updateEnemies(sdt);         // 无人机换道状态机（预警/平滑移动）
    advanceShots(sdt);          // 弹道推进 + 命中判定（同子步扫掠）
    extendTrack();
    checkCollisions(previousLanePosition, currentLanePosition);
    // 磁铁吸附：magnetT > 0 期间，当前段与前方 MAGNET_SEG_AHEAD(2) 段
    // ±MAGNET_RANGE(3) 车道内的燃料自动飞来（无视高度）——
    // 燃料立即入账，同时生成飞行晶体动画实体（updateEffects 推进、renderEffects 绘制）
    if (STATE.magnetT > 0) {
      const mBase = Math.floor(STATE.position);
      for (let mi = mBase; mi <= mBase + CONFIG.MAGNET_SEG_AHEAD && mi < STATE.track.length; mi++) {
        const mSeg = STATE.track[mi];
        if (!mSeg) continue;
        for (let ml = 0; ml < CONFIG.LANES; ml++) {
          if (mSeg.lanes[ml] !== LANE_TYPE.FUEL) continue;
          if (Math.abs(ml - currentLanePosition) > CONFIG.MAGNET_RANGE) continue;
          pickupFuel(mSeg, ml);
          const zRel = (mi - STATE.position) * CONFIG.SEGMENT_LENGTH + CONFIG.CAMERA_BACK;
          const fp = project(laneCenterX(ml), 300, Math.max(9, zRel));
          if (fp.visible) STATE.magnetPulls.push({ x: fp.x, y: fp.y, t: 0, dur: 0.35 });
        }
      }
      STATE.magnetT = Math.max(0, STATE.magnetT - sdt);
    }
    if (STATE.mode !== 'PLAYING') return;   // 已死亡，中止本帧
  }
}

// 敌人当前连续车道位置（浮点；turret 固定，drone 由换道状态机驱动）
// —— 渲染、玩家接触判定、弹道命中共用同一插值来源，所见即所判
// （与玩家 movement 同源思路：warn 期停在 fromLane，
//   move 期 fromLane → toLane 平滑插值，碰撞比较用 ±0.5 车道容差）
function enemyLane(e) {
  if (e.type !== 'drone' || e.state === undefined) return e.lane;
  if (e.state === 'move') {
    const t = Math.min(1, e.moveT);
    const k = t * t * (3 - 2 * t);              // smoothstep 缓动
    return e.fromLane + (e.toLane - e.fromLane) * k;
  }
  return e.fromLane;                            // rest / warn：停在原车道
}

// 无人机换道状态机推进（每子步；只更新视距范围内的段）：
//   rest：停留 restT（1~3.5s 随机）→ 选相邻目标车道进入 warn
//   warn：DRONE_WARN_TIME(0.6)s 预警，车道位置不动（渲染闪烁/抖动/倾斜）
//   move：DRONE_MOVE_TIME(0.4)s 平滑滑到目标车道 → 回到 rest
function updateEnemies(sdt) {
  const lo = Math.max(0, Math.floor(STATE.position) - 2);
  const hi = Math.floor(STATE.position) + CONFIG.RENDER_DISTANCE;
  for (let i = lo; i <= hi && i < STATE.track.length; i++) {
    const seg = STATE.track[i];
    if (!seg.enemies) continue;
    for (const e of seg.enemies) {
      if (e.type !== 'drone') continue;
      if (e.state === 'rest') {
        e.restT -= sdt;
        if (e.restT <= 0) {
          // 选相邻目标车道（不出界；贴边时只能向内）
          let dir = Math.random() < 0.5 ? -1 : 1;
          if (e.fromLane + dir < 0 || e.fromLane + dir >= CONFIG.LANES) dir = -dir;
          e.toLane = e.fromLane + dir;
          e.warnT = CONFIG.DRONE_WARN_TIME;
          e.state = 'warn';
        }
      } else if (e.state === 'warn') {
        e.warnT -= sdt;
        if (e.warnT <= 0) { e.moveT = 0; e.state = 'move'; }
      } else if (e.state === 'move') {
        e.moveT += sdt / CONFIG.DRONE_MOVE_TIME;
        if (e.moveT >= 1) {
          e.fromLane = e.toLane;
          e.moveT = 1;
          e.restT = 1 + Math.random() * 2.5;
          e.state = 'rest';
        }
      }
    }
  }
}

// 弹道推进：子弹/导弹每子步前进 (玩家速度 + BULLET_SPEED) × sdt ≤ 0.5 段，
// 命中同车道前方最先遇到的实体：敌人 → 击毁；墙 → 子弹湮灭 / 导弹清除为 ROAD。
// 命中判定（弹道 y = 发射瞬间 playerY，飞行中保持）：
//   敌人（无人机/炮塔）：近炸引信，任意高度命中 —— 伪 3D 透视下高度门会让
//     地面子弹视觉上"命中却没反应"，故不按高度过滤；
//   矮墙 600：子弹 y ≤ 600 撞墙湮灭；y > 600 越过矮墙继续飞（跳跃射击的战术价值）；
//   高塔 2000：挡一切子弹；导弹照旧命中即清除一切（爆炸逻辑不变）。
function advanceShots(sdt) {
  if (STATE.shots.length === 0) return;
  const v = (STATE.speed + CONFIG.BULLET_SPEED) * sdt;
  for (let si = STATE.shots.length - 1; si >= 0; si--) {
    const sh = STATE.shots[si];
    sh.seg += v;
    if (sh.seg > STATE.position + CONFIG.RENDER_DISTANCE) {   // 飞出视距回收
      STATE.shots.splice(si, 1);
      continue;
    }
    const seg = STATE.track[Math.floor(sh.seg)];
    if (!seg) continue;
    let hit = false;
    if (seg.enemies && seg.enemies.length > 0) {
      for (let ei = seg.enemies.length - 1; ei >= 0; ei--) {
        const e = seg.enemies[ei];
        if (!intervalsOverlap(
          sh.lanePosition,
          HITBOX.projectileHalfWidth,
          enemyLane(e),
          hitboxHalfWidthForEnemy(e.type),
        )) continue;
        // 无人机近炸引信：不按高度过滤 —— 伪 3D 透视下地面子弹视觉上"命中"无人机，
        // 高度门会造成"打中了却没反应"的困惑（高度规则只保留给墙体，见下方）
        seg.enemies.splice(ei, 1);
        killEnemy(e, sh.seg);
        hit = true;
        break;
      }
    }
    if (!hit) {
      const wallLane = findIntersectedWallLane(seg.lanes, sh.lanePosition);
      const t = wallLane === null ? null : seg.lanes[wallLane];
      if (t === LANE_TYPE.WALL_LOW || t === LANE_TYPE.WALL_HIGH) {
        // 超级形态武器强化：
        //   导弹 → 范围清除命中段 ±SUPER_MISSILE_RADIUS × 全车道的建筑与敌人；
        //   子弹 → 任意高度直接摧毁建筑（不再湮灭、不再被高塔挡）
        if (sh.kind === 'missile' && STATE.tripleT > 0) {
          hit = true;
          superMissileBlast(sh.seg);
        } else if (sh.kind === 'bullet' && STATE.tripleT > 0) {
          hit = true;
          seg.lanes[wallLane] = LANE_TYPE.ROAD;
          buildingBurstFx(wallLane, sh.seg, t === LANE_TYPE.WALL_HIGH ? 500 : 300);
          sfxWallDown();
        } else {
          // 子弹高度规则：y > 矮墙 600 可越过矮墙；高塔 2000 挡一切子弹；导弹不清高度
          const bulletBlocked = sh.kind === 'missile'
            || t === LANE_TYPE.WALL_HIGH
            || sh.y <= CONFIG.WALL_LOW_HEIGHT;
          if (bulletBlocked) {
            hit = true;
            if (sh.kind === 'missile') {
              seg.lanes[wallLane] = LANE_TYPE.ROAD;      // 导弹清障：墙（含高塔）→ 路面
              shotBurstFx(wallLane, sh.seg, t === LANE_TYPE.WALL_HIGH ? 420 : 260, true);
              sfxEnemyDown();
            } else {
              shotBurstFx(wallLane, sh.seg, 240, false); // 子弹撞墙湮灭小火花
            }
          }
        }
      }
    }
    if (hit) STATE.shots.splice(si, 1);
  }
}

// 击毁敌人：只累积击毁数；竞争得分在首次进入 GAMEOVER 时统一结算。
function killEnemy(e, segF) {
  STATE.enemyKills += 1;
  const h = e.type === 'drone' ? 320 : 900;
  shotBurstFx(enemyLane(e), segF, h, true);
  sfxEnemyDown();
}

// 命中点爆花粒子（短寿命，允许随机；屏幕位置由 project() 实时计算）
function shotBurstFx(lane, segF, height, big) {
  const zRel = (segF - STATE.position) * CONFIG.SEGMENT_LENGTH + CONFIG.CAMERA_BACK;
  const p = project(laneCenterX(lane), height, Math.max(9, zRel));
  if (!p.visible) return;
  const n = big ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * (big ? 260 : 140);
    STATE.particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
      life: 0.3 + Math.random() * 0.3, maxLife: 0.6,
      color: Math.random() < 0.5 ? '#ffb060' : '#ffe9c0',
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

// 建筑摧毁大爆花：比 shotBurstFx(big) 更猛 —— 22 颗粒含红色能量碎块与
// 深灰装甲碎片（shard 长条翻滚），并附加轻微震屏
function buildingBurstFx(lane, segF, height) {
  const zRel = (segF - STATE.position) * CONFIG.SEGMENT_LENGTH + CONFIG.CAMERA_BACK;
  const p = project(laneCenterX(lane), height, Math.max(9, zRel));
  if (!p.visible) return;
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 380;
    const shard = Math.random() < 0.4;
    STATE.particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120,
      life: 0.35 + Math.random() * 0.45, maxLife: 0.8,
      color: shard
        ? (Math.random() < 0.5 ? '#3a3f52' : '#ff4d5e')   // 装甲深灰 / 能量红
        : (Math.random() < 0.5 ? '#ffb060' : '#fff3d0'),   // 爆炸橙白
      size: 2 + Math.random() * 3.5,
      shard, ang: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 14,
      len: 4 + Math.random() * 8,
    });
  }
  STATE.shake = Math.max(STATE.shake, 0.22);
}

// 超级形态导弹：以命中段为中心 ±SUPER_MISSILE_RADIUS(1) 段 × 全车道
// 清除整片建筑与敌人（敌人照给击杀分），大爆花 + 强震屏（弱于死亡的 1.0）
function superMissileBlast(segF) {
  const c = Math.floor(segF);
  let cleared = 0;
  for (let i = c - CONFIG.SUPER_MISSILE_RADIUS; i <= c + CONFIG.SUPER_MISSILE_RADIUS; i++) {
    const s = STATE.track[i];
    if (!s) continue;
    for (let l = 0; l < CONFIG.LANES; l++) {
      if (s.lanes[l] === LANE_TYPE.WALL_LOW || s.lanes[l] === LANE_TYPE.WALL_HIGH) {
        const h = s.lanes[l] === LANE_TYPE.WALL_HIGH ? 500 : 300;
        s.lanes[l] = LANE_TYPE.ROAD;
        buildingBurstFx(l, i, h);
        cleared++;
      }
    }
    if (s.enemies && s.enemies.length > 0) {
      for (const e of s.enemies) killEnemy(e, i);
      s.enemies = null;
      cleared++;
    }
  }
  if (cleared > 0) {
    STATE.shake = Math.max(STATE.shake, 0.55);
    sfxBigBlast();
  }
}

// 超级形态自然到期：18 颗金色能量余烬自船体向上升腾散去 + 轻微白闪 +
// 下行熄火音 —— "变回普通形态"的明确视听反馈（吃星/重开不走此路径）
function superPowerDownFx() {
  const p = project(playerWorldX(), STATE.playerY, CONFIG.CAMERA_BACK);
  if (p.visible) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      STATE.particles.push({
        x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(a) * 40, vy: -120 - Math.random() * 140,   // 向上升腾
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        color: Math.random() < 0.5 ? '#ffd76a' : '#fff3d0',
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }
  STATE.flash = Math.max(STATE.flash, 0.25);   // 轻微白闪（能量退散）
  sfxPowerDown();
}

function pickupFuel(seg, laneIdx) {
  seg.lanes[laneIdx] = LANE_TYPE.ROAD;
  STATE.fuel = Math.min(CONFIG.FUEL_MAX, STATE.fuel + CONFIG.FUEL_PICKUP);
  sfxFuel();
}

function collectPickup(seg, lane, type) {
  if (type === LANE_TYPE.FUEL) {
    if (STATE.playerY > CONFIG.FUEL_COLLECT_HEIGHT) return false;
    pickupFuel(seg, lane);
  } else if (type === LANE_TYPE.BOOST) {
    seg.lanes[lane] = LANE_TYPE.ROAD;
    if (STATE.boostT <= 0) STATE.boostPrevSpeed = STATE.speed;
    STATE.boostT = CONFIG.BOOST_DURATION;
    STATE.boostWarnStage = 0;
    sfxBoost();
  } else if (type === LANE_TYPE.SLOW) {
    seg.lanes[lane] = LANE_TYPE.ROAD;
    STATE.speed = Math.max(CONFIG.INITIAL_SPEED, STATE.speed * CONFIG.SLOW_FACTOR);
    sfxSlow();
  } else if (type === LANE_TYPE.TRIPLE) {
    seg.lanes[lane] = LANE_TYPE.ROAD;
    STATE.tripleT = CONFIG.TRIPLE_DURATION;
    STATE.tripleWarnStage = 0;
    STATE.superFx = 0.9;
    STATE.flash = Math.max(STATE.flash, 0.6);
    const sp = project(playerWorldX(), STATE.playerY, CONFIG.CAMERA_BACK);
    if (sp.visible) {
      STATE.shockwave = { x: sp.x, y: sp.y, r: 10, alpha: 0.9, gold: true };
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 140 + Math.random() * 320;
        STATE.particles.push({
          x: sp.x, y: sp.y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100,
          life: 0.35 + Math.random() * 0.35, maxLife: 0.7,
          color: Math.random() < 0.5 ? '#ffd76a' : '#fff3d0',
          size: 2 + Math.random() * 3,
        });
      }
    }
    sfxTriple();
  } else if (type === LANE_TYPE.MAGNET) {
    seg.lanes[lane] = LANE_TYPE.ROAD;
    STATE.magnetT = CONFIG.MAGNET_DURATION;
    sfxMagnet();
  } else {
    return false;
  }
  return true;
}

// 每个子步的碰撞检测（高度判定与渲染共用同一组 CONFIG 高度值）
function checkCollisions(previousLanePosition, currentLanePosition) {
  if (STATE.fuel <= 0) { die('fuel'); return; }
  const seg = STATE.track[Math.floor(STATE.position)];
  if (!seg) return;
  const invincible = STATE.boostT > 0;

  for (let lane = 0; lane < CONFIG.LANES; lane++) {
    const type = seg.lanes[lane];
    if (!sweptIntervalsOverlap(previousLanePosition, currentLanePosition, 0.14, lane, 0.42)) continue;
    if (type === LANE_TYPE.WALL_LOW
      && !invincible
      && STATE.playerY <= CONFIG.WALL_LOW_HEIGHT) { die('wall'); return; }
    if (type === LANE_TYPE.WALL_HIGH
      && !invincible
      && STATE.playerY <= CONFIG.WALL_HIGH_HEIGHT) { die('wall'); return; }
  }

  const supportLane = laneTileContaining(currentLanePosition);
  if (seg.lanes[supportLane] === LANE_TYPE.GAP
    && !invincible
    && STATE.playerY < CONFIG.GAP_SAFE_HEIGHT) { die('gap'); return; }

  for (let lane = 0; lane < CONFIG.LANES; lane++) {
    if (sweptPointDistance(previousLanePosition, currentLanePosition, lane) > 0.38) continue;
    if (collectPickup(seg, lane, seg.lanes[lane])) break;
  }

  if (!invincible && seg.enemies) {
    for (const e of seg.enemies) {
      if (!sweptIntervalsOverlap(
        previousLanePosition,
        currentLanePosition,
        0.14,
        enemyLane(e),
        hitboxHalfWidthForEnemy(e.type),
      )) continue;
      const h = e.type === 'drone' ? CONFIG.DRONE_HEIGHT : CONFIG.TURRET_HEIGHT;
      if (STATE.playerY <= h) { die('enemy'); return; }
    }
  }
}

// ============================================================
// 8. 状态机 GameState + 死亡特效
// ============================================================
function currentLeaderboardSnapshot() {
  if (STATE.leaderboardSnapshot) return STATE.leaderboardSnapshot;
  return {
    profile: { playerId: 'local', name: 'Nova' },
    entries: [],
    legacyBest: null,
    persistenceWarning: false,
  };
}

function refreshPresentation() {
  const presentation = globalThis.Skyroads.presentation;
  if (!presentation || !STATE.ui || !STATE.translator) return;
  const audioState = adaptiveAudioState();
  presentation.renderCommandCenter(STATE.ui, {
    translator: STATE.translator,
    snapshot: currentLeaderboardSnapshot(),
    mode: STATE.mode,
    finalResult: STATE.finalResult,
    deathReason: STATE.deathReason,
    audioMuted: audioState.musicMuted && audioState.sfxMuted,
    musicMuted: audioState.musicMuted,
    sfxMuted: audioState.sfxMuted,
    audioStatus: audioState.status,
    audioFormat: audioState.format,
    audioDecoded: audioState.decoded,
  });
}

function focusPrimarySurface() {
  const presentation = globalThis.Skyroads.presentation;
  if (!presentation || typeof presentation.focusPrimaryForMode !== 'function') return;
  presentation.focusPrimaryForMode({
    canvas: STATE.canvas,
    startButton: STATE.ui && STATE.ui.startButton,
    restartButton: STATE.ui && STATE.ui.restartButton,
  }, STATE.mode);
}

function resetRunResult() {
  STATE.distanceMeters = 0;
  STATE.enemyKills = 0;
  STATE.score = 0;
  STATE.elapsedMs = 0;
  STATE.runId = STATE.leaderboard && typeof STATE.leaderboard.createRunId === 'function'
    ? STATE.leaderboard.createRunId()
    : `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  STATE.finalResult = null;
}

function finalizeCurrentRun() {
  if (STATE.finalResult) return STATE.finalResult;
  const presentation = globalThis.Skyroads.presentation;
  if (STATE.leaderboard && presentation && typeof presentation.finalizeRunOnce === 'function') {
    const result = presentation.finalizeRunOnce(STATE, STATE.leaderboard);
    STATE.leaderboardSnapshot = result.snapshot;
    return result;
  }
  const leaderboardApi = globalThis.Skyroads.leaderboard;
  STATE.score = leaderboardApi && typeof leaderboardApi.calculateScore === 'function'
    ? leaderboardApi.calculateScore(STATE)
    : Math.floor(STATE.distanceMeters) + Math.floor(STATE.enemyKills) * CONFIG.ENEMY_KILL_SCORE;
  STATE.finalResult = {
    id: STATE.runId,
    score: STATE.score,
    distanceMeters: STATE.distanceMeters,
    enemyKills: STATE.enemyKills,
    elapsedMs: STATE.elapsedMs,
    qualified: false,
    rank: null,
    cutoff: null,
    entry: null,
    newLocalBest: false,
  };
  return STATE.finalResult;
}

function resetGame() {
  STATE.position = 0;
  STATE.speed = CONFIG.INITIAL_SPEED;      // 起步即有速度感
  resetMovement(STATE.movement, midLane());
  STATE.playerY = 0;
  STATE.playerVY = 0;
  STATE.jumpsUsed = 0;
  STATE.jumpBurst = 0;
  STATE.trail = [];
  STATE.recoil = 0;
  STATE.boostT = 0;
  STATE.boostPrevSpeed = 0;
  STATE.tripleT = 0;
  STATE.tripleWarnStage = 0;
  STATE.superFx = 0;
  STATE.magnetT = 0;
  STATE.magnetPulls = [];
  STATE.gliding = false;
  STATE.fuelFlash = 0;
  STATE.chargeT = 0;
  STATE.chargeStage = 0;
  STATE.shots = [];
  STATE.bulletCD = 0;
  STATE.boostWarnStage = 0;
  STATE.fuel = CONFIG.FUEL_MAX;
  resetRunResult();
  STATE.deathReason = null;
  STATE.flash = 0;
  STATE.particles = [];
  STATE.shake = 0;
  STATE.shockwave = null;
  STATE.track = buildTrack();
}

function startGame() {
  audioInit();                 // 首次有效手势：创建/resume 音效 AudioContext
  if (STATE.audioController) {
    STATE.audioController.unlock().then(refreshPresentation).catch(function () { refreshPresentation(); });
  }
  if (STATE.uiController) STATE.uiController.closeDialog(undefined, { restoreFocus: false });
  resetGame();
  STATE.mode = 'PLAYING';
  syncAdaptiveAudio(true);
  refreshPresentation();
  focusPrimarySurface();
}

function gotoMenu() {
  clearMovementInput();
  if (STATE.uiController) STATE.uiController.closeDialog(undefined, { restoreFocus: false });
  STATE.mode = 'MENU';
  syncAdaptiveAudio(true);
  refreshPresentation();
  focusPrimarySurface();
}

function die(reason) {
  if (STATE.mode !== 'PLAYING') return;
  clearMovementInput();
  STATE.mode = 'GAMEOVER';
  syncAdaptiveAudio(true);
  STATE.deathReason = reason;
  finalizeCurrentRun();
  refreshPresentation();
  focusPrimarySurface();
  sfxDeath();
  STATE.gliding = false;                 // 停止滑翔（喷火轰鸣随之停止）
  // 死亡反馈：闪屏 + 屏幕震动 + 大爆炸粒子 + 冲击波圆环（在玩家屏幕位置）
  STATE.flash = 1;
  STATE.shake = 1;                     // 震动强度 1→0（updateEffects 衰减）
  const p = project(playerWorldX(), STATE.playerY, CONFIG.CAMERA_BACK);
  STATE.shockwave = { x: p.x, y: p.y, r: 6, alpha: 0.9 };
  const colors = { wall: '#ff5566', gap: '#77aaff', fuel: '#ffcc33', enemy: '#cc88ff' };
  const c = colors[reason] || '#ffffff';
  for (let i = 0; i < 48; i++) {       // 数量↑：48 颗，30% 为长条碎片
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 420;
    const shard = Math.random() < 0.3;
    STATE.particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120,
      life: 0.7 + Math.random() * 0.5,
      maxLife: 1.2,
      color: Math.random() < 0.6 ? c : '#ffffff',
      size: 2 + Math.random() * 4,
      shard: shard,                            // 长条碎片：旋转渲染
      ang: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      len: 6 + Math.random() * 16,
    });
  }
}

// 特效更新（任何模式下都推进，便于 GAMEOVER 屏播放）
function updateEffects(dt) {
  if (STATE.flash > 0) STATE.flash = Math.max(0, STATE.flash - dt * 2.2);
  if (STATE.jumpBurst > 0) STATE.jumpBurst = Math.max(0, STATE.jumpBurst - dt);   // 推进器爆发衰减
  if (STATE.shake > 0) STATE.shake = Math.max(0, STATE.shake - dt * 1.6);         // 震动衰减
  if (STATE.recoil > 0) STATE.recoil = Math.max(0, STATE.recoil - dt * 4);        // 后坐回弹
  if (STATE.fuelFlash > 0) STATE.fuelFlash = Math.max(0, STATE.fuelFlash - dt);   // 高耗油警示衰减
  if (STATE.superFx > 0) STATE.superFx = Math.max(0, STATE.superFx - dt);         // 变身特效衰减
  if (STATE.shockwave) {                                 // 冲击波扩散
    STATE.shockwave.r += 720 * dt;
    STATE.shockwave.alpha -= dt * 1.4;
    if (STATE.shockwave.alpha <= 0) STATE.shockwave = null;
  }
  for (const pt of STATE.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 500 * dt;                     // 粒子受"重力"下坠
    if (pt.shard) pt.ang += pt.spin * dt;  // 碎片翻滚
    pt.life -= dt;
  }
  STATE.particles = STATE.particles.filter(pt => pt.life > 0);
  // 船尾尾迹：缓慢下飘（屏幕下方 = 船尾后方），渐隐消亡
  for (const pt of STATE.trail) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  STATE.trail = STATE.trail.filter(pt => pt.life > 0);
  // 磁铁飞行晶体：朝船体屏幕位置加速收敛（指数趋近 + 线性计时兜底）
  if (STATE.magnetPulls.length > 0) {
    const tp = project(playerWorldX(), STATE.playerY, CONFIG.CAMERA_BACK);
    for (const pl of STATE.magnetPulls) {
      pl.t += dt / pl.dur;
      const k = Math.min(1, pl.t);
      pl.x += (tp.x - pl.x) * (0.12 + 0.5 * k);
      pl.y += (tp.y - pl.y) * (0.12 + 0.5 * k);
    }
    STATE.magnetPulls = STATE.magnetPulls.filter(pl => pl.t < 1);
  }
  syncGlideAudio();   // 滑翔喷火轰鸣：滑翔中起，松键/油尽/死亡/离局即停
}

function renderEffects(ctx) {
  for (const pt of STATE.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    if (pt.shard) {
      // 长条碎片：按当前翻滚角渲染
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.ang);
      ctx.fillRect(-pt.len / 2, -pt.size / 2, pt.len, pt.size);
      ctx.restore();
    } else {
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
  }
  ctx.globalAlpha = 1;
  // 磁铁吸附中的飞行燃料晶体（青色菱形 + 光晕，朝船体汇聚）
  for (const pl of STATE.magnetPulls) {
    ctx.globalAlpha = Math.max(0, 1 - pl.t * 0.3);
    const mg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, 14);
    mg.addColorStop(0, 'rgba(160,240,255,0.85)');
    mg.addColorStop(1, 'rgba(160,240,255,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(pl.x, pl.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bdf3ff';
    ctx.beginPath();
    ctx.moveTo(pl.x, pl.y - 6); ctx.lineTo(pl.x + 4.5, pl.y);
    ctx.lineTo(pl.x, pl.y + 6); ctx.lineTo(pl.x - 4.5, pl.y);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 冲击波扩散圆环（金色 = 超级形态变身；桃色 = 死亡）
  if (STATE.shockwave) {
    ctx.globalAlpha = Math.max(0, STATE.shockwave.alpha);
    ctx.strokeStyle = STATE.shockwave.gold ? '#ffe9a0' : '#ffd9c0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(STATE.shockwave.x, STATE.shockwave.y, STATE.shockwave.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // ---- BOOST 到期预警：屏幕边缘青色脉冲光晕，随剩余时间收缩（与船体光环同频 time×8）----
  if (STATE.mode === 'PLAYING' && STATE.boostT > 0 && STATE.boostT < CONFIG.BOOST_WARN_TIME) {
    const f = STATE.boostT / CONFIG.BOOST_WARN_TIME;         // 1 → 0（越接近到期越小）
    const pulse = 0.5 + 0.5 * Math.sin(STATE.time * 8);
    const a = (0.10 + 0.30 * (1 - f)) * pulse;               // 越接近到期越强
    const wE = (0.03 + 0.09 * f) * STATE.width;              // 光晕宽度随剩余时间收缩
    const hE = (0.03 + 0.09 * f) * STATE.height;
    const W = STATE.width, Hh = STATE.height;
    const cA = 'rgba(120,230,255,' + a.toFixed(3) + ')';
    const c0 = 'rgba(120,230,255,0)';
    let g = ctx.createLinearGradient(0, 0, 0, hE);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hE);
    g = ctx.createLinearGradient(0, Hh, 0, Hh - hE);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, Hh - hE, W, hE);
    g = ctx.createLinearGradient(0, 0, wE, 0);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, wE, Hh);
    g = ctx.createLinearGradient(W, 0, W - wE, 0);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(W - wE, 0, wE, Hh);
  }
  // ---- 超级形态到期预警：屏幕边缘金红脉冲光晕，随剩余时间收缩
  //      （time×10 比 BOOST 的 ×8 更急促，色调金红以示区别）----
  if (STATE.mode === 'PLAYING' && STATE.tripleT > 0 && STATE.tripleT < CONFIG.TRIPLE_WARN_TIME) {
    const f = STATE.tripleT / CONFIG.TRIPLE_WARN_TIME;   // 1 → 0（越接近到期越小）
    const pulse = 0.5 + 0.5 * Math.sin(STATE.time * 10);
    const a = (0.12 + 0.32 * (1 - f)) * pulse;           // 越接近到期越强
    const wE = (0.04 + 0.10 * f) * STATE.width;          // 光晕宽度随剩余时间收缩
    const hE = (0.04 + 0.10 * f) * STATE.height;
    const W = STATE.width, Hh = STATE.height;
    const cA = 'rgba(255,170,60,' + a.toFixed(3) + ')';
    const c0 = 'rgba(255,170,60,0)';
    let g = ctx.createLinearGradient(0, 0, 0, hE);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hE);
    g = ctx.createLinearGradient(0, Hh, 0, Hh - hE);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, Hh - hE, W, hE);
    g = ctx.createLinearGradient(0, 0, wE, 0);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, wE, Hh);
    g = ctx.createLinearGradient(W, 0, W - wE, 0);
    g.addColorStop(0, cA); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(W - wE, 0, wE, Hh);
  }
  // ---- 变身大字："★ 超级形态 ★"（superFx 0.9s 内轻微放大 + 后半段渐隐，金色辉光）----
  if (STATE.superFx > 0 && STATE.mode === 'PLAYING') {
    const a = Math.min(1, STATE.superFx / 0.45);
    const grow = 1 + (0.9 - STATE.superFx) * 0.35;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + Math.round(46 * grow) + 'px monospace';
    ctx.shadowColor = 'rgba(255,190,80,0.9)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffe9a0';
    ctx.fillText(STATE.translator ? STATE.translator.t('effect.superForm') : '', STATE.width / 2, STATE.height * 0.30);
    ctx.restore();
    ctx.textAlign = 'left';
  }
  if (STATE.flash > 0) {
    const colors = { wall: '255,60,70', gap: '120,160,255', fuel: '255,200,60', enemy: '200,130,255' };
    ctx.fillStyle = 'rgba(' + (colors[STATE.deathReason] || '255,255,255') + ',' + (STATE.flash * 0.55).toFixed(3) + ')';
    ctx.fillRect(0, 0, STATE.width, STATE.height);
  }
}

// ============================================================
// 9. UI (HUD / Menu / GameOver)
// ============================================================
function uiText(id, values) {
  return STATE.translator ? STATE.translator.t(id, values) : '';
}

function uiNumber(value, options) {
  return STATE.translator ? STATE.translator.formatNumber(value, options) : String(value);
}

function uiSeconds(milliseconds) {
  return uiNumber(Math.max(0, milliseconds) / 1000, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'short',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function renderHUD(ctx) {
  // 燃料条
  const fx = 20, fy = 20, fw = 200, fh = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(fx, fy, fw, fh);
  const ratio = STATE.fuel / CONFIG.FUEL_MAX;
  // 高耗油警示：滑翔中或刚二段跳（fuelFlash>0）燃料条变橙色脉冲，提示"正在加速耗油"
  const burning = STATE.gliding || STATE.fuelFlash > 0;
  if (burning) {
    const pulse = 0.75 + 0.25 * Math.sin(STATE.time * 12);
    ctx.fillStyle = 'rgba(255,153,51,' + pulse.toFixed(3) + ')';
  } else {
    ctx.fillStyle = ratio > 0.3 ? '#33cc66' : (ratio > 0.15 ? '#ffcc33' : '#cc3333');
  }
  ctx.fillRect(fx, fy, fw * ratio, fh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(uiText('hud.fuel'), fx + 4, fy + 14);

  // 剩余跳跃段数：菱形引擎指示灯（用掉一段熄一个）；
  // 三段跳奖励期亮起第三颗金色灯，奖励结束自动恢复两颗
  const maxJ = STATE.tripleT > 0 ? 3 : CONFIG.MAX_JUMPS;
  for (let k = 0; k < maxJ; k++) {
    const dx = fx + 12 + k * 20, dy = fy + fh + 14;
    const lit = k < (maxJ - STATE.jumpsUsed);
    ctx.fillStyle = lit ? (k >= CONFIG.MAX_JUMPS ? '#ffd76a' : '#7fdfff') : 'rgba(120,130,150,0.30)';
    ctx.beginPath();
    ctx.moveTo(dx, dy - 6); ctx.lineTo(dx + 6, dy);
    ctx.lineTo(dx, dy + 6); ctx.lineTo(dx - 6, dy);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#89a';
  ctx.font = '10px monospace';
  ctx.fillText(uiText('hud.jump'), fx + 44, fy + fh + 18);

  // 道具效果剩余时间条（闪电青 / 超级形态金 / 磁铁青）
  let ey = fy + fh + 30;
  // J 蓄力槽（常驻：避免频繁点射时槽位忽隐忽现——第六轮反馈。
  // 空槽暗灰提示"J 按住蓄力"；蓄力中橙色填充；满蓄金色闪烁"导弹就绪"）
  {
    const full = STATE.chargeT >= CONFIG.CHARGE_TIME;
    const charging = STATE.chargeT > 0;
    const blinkOn = !full || Math.sin(STATE.time * 12) > -0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(fx, ey, fw, 10);
    if (charging) {
      ctx.fillStyle = full ? '#ffd76a' : '#ff9a55';
      if (blinkOn) ctx.fillRect(fx, ey, fw * (STATE.chargeT / CONFIG.CHARGE_TIME), 10);
    }
    ctx.strokeStyle = charging ? (full ? '#ffd76a' : '#ff9a55') : 'rgba(140,150,170,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, ey, fw, 10);
    ctx.fillStyle = charging ? (full ? '#ffd76a' : '#ff9a55') : 'rgba(140,150,170,0.75)';
    ctx.font = '10px monospace';
    const chargePercent = Math.round(Math.min(1, STATE.chargeT / CONFIG.CHARGE_TIME) * 100);
    ctx.fillText(full
      ? uiText('status.chargeReady')
      : (charging ? uiText('status.charging', { percent: uiNumber(chargePercent) }) : uiText('status.chargeIdle')), fx + fw + 8, ey + 9);
    ey += 16;
  }
  if (STATE.boostT > 0) {
    const warn = STATE.boostT < CONFIG.BOOST_WARN_TIME;      // 到期预警：红 + 急促闪烁
    const blinkOn = !warn || Math.sin(STATE.time * 10) > -0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(fx, ey, fw, 10);
    ctx.fillStyle = warn ? '#ff4444' : '#7fe8ff';
    if (blinkOn) ctx.fillRect(fx, ey, fw * (STATE.boostT / CONFIG.BOOST_DURATION), 10);
    ctx.strokeStyle = warn ? '#ff6666' : '#7fe8ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, ey, fw, 10);
    // 闪电小图标 + 剩余时间
    ctx.fillStyle = warn ? '#ff8888' : '#ffe95a';
    ctx.beginPath();
    ctx.moveTo(fx + fw + 12, ey - 1);
    ctx.lineTo(fx + fw + 18, ey + 4);
    ctx.lineTo(fx + fw + 14.5, ey + 4);
    ctx.lineTo(fx + fw + 17, ey + 11);
    ctx.lineTo(fx + fw + 10, ey + 5.5);
    ctx.lineTo(fx + fw + 13.5, ey + 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.font = '10px monospace';
    ctx.fillText(uiText(warn ? 'status.boostWarning' : 'status.boost', {
      seconds: uiNumber(STATE.boostT, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    }), fx + fw + 20, ey + 9);
    ey += 16;
  }
  if (STATE.tripleT > 0) {
    // 超级形态条：金色常驻；预警期变橙红急促闪烁（time×10，与船体/光环同频）
    const warn = STATE.tripleT < CONFIG.TRIPLE_WARN_TIME;
    const blinkOn = !warn || Math.sin(STATE.time * 10) > -0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(fx, ey, fw, 10);
    ctx.fillStyle = warn ? '#ff5533' : '#ffd76a';
    if (blinkOn) ctx.fillRect(fx, ey, fw * (STATE.tripleT / CONFIG.TRIPLE_DURATION), 10);
    ctx.strokeStyle = warn ? '#ff7755' : '#ffd76a';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, ey, fw, 10);
    // 星星小图标 + 剩余时间
    ctx.fillStyle = warn ? '#ff9988' : '#ffe9a0';
    ctx.beginPath();
    const starCx = fx + fw + 15, starCy = ey + 5, starR = 6;
    for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5 - Math.PI / 2;
      const rr = (k % 2 === 0) ? starR : starR * 0.45;
      const vx = starCx + Math.cos(a) * rr, vy = starCy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.font = '10px monospace';
    ctx.fillText(uiText(warn ? 'status.superWarning' : 'status.super', {
      seconds: uiNumber(STATE.tripleT, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    }), fx + fw + 24, ey + 9);
    ey += 16;
  }
  if (STATE.magnetT > 0) {
    // 磁铁条：青色常驻 + U 形小图标
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(fx, ey, fw, 10);
    ctx.fillStyle = '#7fe8ff';
    ctx.fillRect(fx, ey, fw * (STATE.magnetT / CONFIG.MAGNET_DURATION), 10);
    ctx.strokeStyle = '#7fe8ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, ey, fw, 10);
    ctx.strokeStyle = '#ff8a8a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(fx + fw + 11, ey + 8);
    ctx.lineTo(fx + fw + 11, ey + 4);
    ctx.arc(fx + fw + 15, ey + 4, 4, Math.PI, 2 * Math.PI, false);
    ctx.lineTo(fx + fw + 19, ey + 8);
    ctx.stroke();
    ctx.fillStyle = '#7fe8ff';
    ctx.font = '10px monospace';
    ctx.fillText(uiText('status.magnet', {
      seconds: uiNumber(STATE.magnetT, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    }), fx + fw + 24, ey + 9);
    ey += 16;
  }
  // 静音状态指示
  ctx.fillStyle = '#89a';
  ctx.font = '10px monospace';
  const audioState = adaptiveAudioState();
  ctx.fillText(uiText(audioState.musicMuted && audioState.sfxMuted ? 'hud.musicOff' : 'hud.musicOn'), fx, ey + 12);

  // 距离/速度/时间/最佳/操作提示
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9fe';
  ctx.font = '16px monospace';
  const leaderboardApi = globalThis.Skyroads.leaderboard;
  const liveScore = leaderboardApi && typeof leaderboardApi.calculateScore === 'function'
    ? leaderboardApi.calculateScore(STATE) : STATE.score;
  const entries = currentLeaderboardSnapshot().entries;
  const localBest = entries.length > 0 ? entries[0].score : 0;
  const hudLayout = globalThis.Skyroads.presentation.computeHudLayout(STATE.width, STATE.height);
  const hudX = hudLayout.rightX;
  const hudY = hudLayout.rightTop;
  const hudLine = hudLayout.lineHeight;
  ctx.fillText(`${uiText('hud.distance')} ${uiNumber(Math.floor(STATE.distanceMeters), { style: 'unit', unit: 'meter', unitDisplay: 'short' })}`, hudX, hudY);
  ctx.fillText(`${uiText('hud.score')} ${uiNumber(liveScore)}`, hudX, hudY + hudLine);
  ctx.fillText(`${uiText('hud.speed')} ${uiNumber(STATE.speed, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`, hudX, hudY + hudLine * 2);
  ctx.fillText(`${uiText('hud.elapsed')} ${uiSeconds(STATE.elapsedMs)}`, hudX, hudY + hudLine * 3);
  ctx.fillText(`${uiText('hud.localBest')} ${uiNumber(localBest)}`, hudX, hudY + hudLine * 4);
  ctx.fillStyle = '#c9a26a';
  ctx.fillText(uiText('hud.shootHint'), hudX, hudY + hudLine * 5);
  ctx.textAlign = 'left';

  // （连击倍率大字已随 MULTI 系统移除；三段跳奖励以左侧青色倒计时条呈现）
}

function renderMenu(ctx) {
  ctx.fillStyle = 'rgba(2,6,17,0.52)';
  ctx.fillRect(0, 0, STATE.width, STATE.height);
}

function renderGameOver(ctx) {
  ctx.fillStyle = 'rgba(22,2,10,0.46)';
  ctx.fillRect(0, 0, STATE.width, STATE.height);
}

// ============================================================
// 9b. 音频 Audio —— 自适应三轨音乐 + 程序化回退与音效
// ============================================================
// 防御策略：AudioContext 不存在 / 创建失败 / 被自动播放策略拦截时，
// 全部静默降级 —— 游戏照常运行，绝不抛异常中断游戏。
// AudioContext 在首次有效手势（startGame 按键/触屏）时创建并 resume。
const AUDIO = {
  ctx: null,        // AudioContext 实例（未创建 = 无声模式）
  master: null,     // 主增益节点（静音开关作用于此）
  muted: false,     // M 键总静音镜像；具体音乐/音效偏好由 audioController 保存
  bgmTimer: null,
  bgmStep: 0,
  nextNoteTime: 0,
  glideNodes: null, // 滑翔喷火轰鸣节点组 { src, lfo, lfo2, gain }（非 null = 播放中）
};

function audioInit() {
  try {
    if (AUDIO.ctx) {
      if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume().catch(function () {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                                  // 环境不支持 → 静默降级
    AUDIO.ctx = new AC();
    AUDIO.master = AUDIO.ctx.createGain();
    AUDIO.master.gain.value = AUDIO.muted ? 0 : 0.45; // 主音量适中
    AUDIO.master.connect(AUDIO.ctx.destination);
  } catch (e) {
    AUDIO.ctx = null;                                 // 创建失败 → 无声模式
  }
}

function startProceduralMusic() {
  audioInit();
  if (!AUDIO.ctx || AUDIO.bgmTimer) return;
  AUDIO.nextNoteTime = AUDIO.ctx.currentTime + 0.1;
  AUDIO.bgmTimer = setInterval(bgmScheduler, 40);
}

function adaptiveAudioState() {
  if (STATE.audioController && typeof STATE.audioController.getState === 'function') {
    return STATE.audioController.getState();
  }
  return { status: 'unavailable', format: 'procedural', decoded: false, musicMuted: AUDIO.muted, sfxMuted: AUDIO.muted, storageAvailable: false, error: null };
}

function audioIsMusicMuted() { return Boolean(adaptiveAudioState().musicMuted); }
function audioIsSfxMuted() { return Boolean(adaptiveAudioState().sfxMuted); }

function syncLegacyAudioMuteState() {
  const current = adaptiveAudioState();
  AUDIO.muted = Boolean(current.musicMuted && current.sfxMuted);
  try {
    if (AUDIO.master) AUDIO.master.gain.value = AUDIO.muted ? 0 : 0.45;
  } catch (e) {}
  return AUDIO.muted;
}

function syncAdaptiveAudio(force = false) {
  if (!STATE.audioController) return;
  const speedRatio = CONFIG.MAX_SPEED > 0 ? STATE.speed / CONFIG.MAX_SPEED : 0;
  const danger = STATE.mode === 'PLAYING' && STATE.fuel <= CONFIG.FUEL_MAX * 0.2;
  const boost = STATE.mode === 'PLAYING' && STATE.boostT > 0;
  const key = `${STATE.mode}|${speedRatio >= 0.75}|${danger}|${boost}`;
  if (!force && key === STATE.audioMixKey) return;
  STATE.audioMixKey = key;
  STATE.audioController.setGameState({ mode: STATE.mode, speedRatio, danger, boost });
}

function toggleMute() {
  const current = adaptiveAudioState();
  const nextMuted = !(current.musicMuted && current.sfxMuted);
  if (STATE.audioController) {
    STATE.audioController.setMusicMuted(nextMuted);
    STATE.audioController.setSfxMuted(nextMuted);
  } else AUDIO.muted = nextMuted;
  syncLegacyAudioMuteState();
  refreshPresentation();
}

// ---- 芯片音乐 BGM：三层（低音线 + 琶音 + 打击乐），明快进行 C–G–Am–F ----
// 8 分音符步进，BPM=138（由 104 提速，更欢快），4 小节 × 8 步 = 32 步无缝循环；
// 调度器每 40ms 把未来 0.15s 内的音符排入时间轴 → 循环无接缝。
// 打击乐层：kick 每拍（0/4 步，低频正弦骤降），hat 奇数步（高通短噪声）——音量克制。
const BGM_BPM = 138;
const BGM_CHORDS = [
  { bass: 130.81, arp: [261.63, 329.63, 392.00, 523.25] },   // C  （明亮起手）
  { bass: 98.00,  arp: [196.00, 246.94, 293.66, 392.00] },   // G
  { bass: 110.00, arp: [220.00, 261.63, 329.63, 440.00] },   // Am
  { bass: 87.31,  arp: [174.61, 220.00, 261.63, 349.23] },   // F
];
const BGM_ARP_PATTERN = [0, 2, 1, 3, 0, 2, 1, 3];   // 每小节 8 步，更有推进感的走向

function bgmPlayNote(freq, time, dur, type, vol) {
  try {
    const osc = AUDIO.ctx.createOscillator();
    const g = AUDIO.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g);
    g.connect(AUDIO.master);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  } catch (e) {}
}

// 打击乐（BGM 节拍层）：kick = 低频正弦骤降；hat = 高通短噪声
function bgmPlayPerc(time, kind, vol) {
  try {
    if (kind === 'kick') {
      const osc = AUDIO.ctx.createOscillator();
      const g = AUDIO.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.09);
      g.gain.setValueAtTime(vol, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.10);
      osc.connect(g);
      g.connect(AUDIO.master);
      osc.start(time);
      osc.stop(time + 0.12);
    } else {
      // hat：复用音效的噪声缓冲，高通滤波 + 极短包络
      if (!noiseBuffer) {
        noiseBuffer = AUDIO.ctx.createBuffer(1, Math.floor(AUDIO.ctx.sampleRate * 0.5), AUDIO.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = AUDIO.ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const flt = AUDIO.ctx.createBiquadFilter();
      flt.type = 'highpass';
      flt.frequency.value = 7000;
      const g = AUDIO.ctx.createGain();
      g.gain.setValueAtTime(vol, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
      src.connect(flt);
      flt.connect(g);
      g.connect(AUDIO.master);
      src.start(time);
      src.stop(time + 0.05);
    }
  } catch (e) {}
}

function bgmScheduler() {
  try {
    if (!AUDIO.ctx) return;
    const muted = audioIsMusicMuted();
    const audioApi = globalThis.Skyroads.audio;
    if (audioApi && typeof audioApi.keepProceduralTimelineCurrent === 'function') {
      AUDIO.nextNoteTime = audioApi.keepProceduralTimelineCurrent({
        muted,
        currentTime: AUDIO.ctx.currentTime,
        nextNoteTime: AUDIO.nextNoteTime,
      });
    } else if (muted) {
      AUDIO.nextNoteTime = AUDIO.ctx.currentTime + 0.1;
    }
    if (muted) return;
    const stepDur = 60 / BGM_BPM / 2;               // 8 分音符时长
    while (AUDIO.nextNoteTime < AUDIO.ctx.currentTime + 0.15) {
      const step = AUDIO.bgmStep % 32;
      const chord = BGM_CHORDS[Math.floor(step / 8)];
      // 低音线：每小节第 0、4 步（triangle 波，厚实太空感）
      if (step % 4 === 0) {
        bgmPlayNote(chord.bass, AUDIO.nextNoteTime, stepDur * 1.8, 'triangle', 0.20);
      }
      // 琶音层：每步（square 波，芯片感；音量压低不吵）
      bgmPlayNote(chord.arp[BGM_ARP_PATTERN[step % 8]], AUDIO.nextNoteTime, stepDur * 0.9, 'square', 0.06);
      // 打击乐层：kick 每拍（0/4 步），hat 奇数步（音量克制）
      if (step % 4 === 0) bgmPlayPerc(AUDIO.nextNoteTime, 'kick', 0.15);
      else if (step % 2 === 1) bgmPlayPerc(AUDIO.nextNoteTime, 'hat', 0.04);
      AUDIO.nextNoteTime += stepDur;
      AUDIO.bgmStep++;
    }
  } catch (e) {}
}

// ---- 音效：扫频音 + 噪声爆发，全部 try/catch + 静音/未初始化防御 ----
function sfxSweep(f0, f1, dur, type, vol, delay) {
  try {
    if (!AUDIO.ctx || audioIsSfxMuted()) return;
    const t0 = AUDIO.ctx.currentTime + (delay || 0);
    const osc = AUDIO.ctx.createOscillator();
    const g = AUDIO.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(AUDIO.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch (e) {}
}

let noiseBuffer = null;
function sfxNoise(dur, vol, lowpass) {
  try {
    if (!AUDIO.ctx || audioIsSfxMuted()) return;
    if (!noiseBuffer) {
      noiseBuffer = AUDIO.ctx.createBuffer(1, Math.floor(AUDIO.ctx.sampleRate * 0.5), AUDIO.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = AUDIO.ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const flt = AUDIO.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = lowpass;
    const g = AUDIO.ctx.createGain();
    const t0 = AUDIO.ctx.currentTime;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(AUDIO.master);
    src.start(t0);
    src.stop(t0 + dur);
  } catch (e) {}
}

function sfxJump()       { sfxSweep(300, 620, 0.14, 'square', 0.16); }                       // 跳跃：上扬
function sfxDoubleJump() { sfxSweep(420, 980, 0.16, 'square', 0.18);                         // 二段跳：更高扬 + 尾音
                           sfxSweep(840, 1560, 0.12, 'square', 0.10, 0.04); }
function sfxLane()       { sfxSweep(760, 320, 0.09, 'triangle', 0.10); }                     // 变道：轻 whoosh
function sfxFuel()       { sfxSweep(880, 880, 0.08, 'sine', 0.16);                           // 燃料：清脆双音叮
                           sfxSweep(1320, 1320, 0.10, 'sine', 0.14, 0.07); }
function sfxBoost()      { sfxNoise(0.09, 0.15, 5200);                                       // 闪电加速：电流 zapp
                           sfxSweep(1200, 1800, 0.10, 'square', 0.08, 0.02);
                           sfxSweep(180, 820, 0.40, 'sawtooth', 0.16, 0.05); }                 //   + 上扬轰鸣
function sfxSlow()       { sfxSweep(560, 190, 0.32, 'sawtooth', 0.11); }                     // 减速：下坠滑音
function sfxTriple()     { sfxSweep(220, 1400, 0.45, 'sawtooth', 0.14);                        // 超级形态变身：上扬充能
                           sfxNoise(0.20, 0.10, 4200);                                         //   + 能量迸发噪声
                           sfxSweep(660, 660, 0.07, 'square', 0.13, 0.30);                     //   + 清亮三音收尾
                           sfxSweep(880, 880, 0.07, 'square', 0.13, 0.37);
                           sfxSweep(1320, 1320, 0.16, 'square', 0.13, 0.44); }
function sfxPowerDown()  { sfxSweep(880, 160, 0.45, 'sawtooth', 0.14);                         // 超级形态结束：下行熄火
                           sfxSweep(440, 110, 0.40, 'triangle', 0.10, 0.06); }
function sfxDeath()      { sfxNoise(0.5, 0.35, 900);                                         // 死亡：噪声爆 + 低频轰
                           sfxSweep(160, 38, 0.5, 'sine', 0.30); }
// ---- 战斗与预警音效 ----
function sfxShoot()      { sfxSweep(1500, 520, 0.07, 'square', 0.09); }                      // 子弹：短促激光 pew
function sfxChargeTick(st){ const f = [0, 520, 700][st] || 520;                              // 蓄力中段 tick（1s/2s 渐高）
                           sfxSweep(f, f, 0.06, 'square', 0.10); }
function sfxChargeReady(){ sfxSweep(990, 990, 0.09, 'square', 0.16);                         // 蓄力满：清亮就绪双音 ding
                           sfxSweep(1480, 1480, 0.14, 'square', 0.14, 0.08); }
function sfxMissile()    { sfxNoise(0.22, 0.11, 2400);                                       // 导弹：发射呼啸 + 上扬
                           sfxSweep(280, 860, 0.22, 'sawtooth', 0.10); }
function sfxMagnet()     { sfxSweep(300, 900, 0.22, 'sine', 0.13);                             // 磁铁：上扬吸附嗡鸣 + 颤音
                           sfxSweep(450, 1250, 0.18, 'sine', 0.09, 0.10); }
function sfxEnemyDown()  { sfxNoise(0.22, 0.20, 1500);                                       // 击毁/清障：小爆炸
                           sfxSweep(380, 85, 0.20, 'sawtooth', 0.13); }
function sfxWallDown()   { sfxNoise(0.30, 0.22, 1100);                                       // 建筑摧毁：碎裂轰鸣
                           sfxSweep(300, 60, 0.28, 'sawtooth', 0.14); }
function sfxBigBlast()   { sfxNoise(0.55, 0.30, 800);                                        // 超级导弹：大范围爆炸
                           sfxSweep(140, 32, 0.55, 'sine', 0.30);
                           sfxSweep(520, 90, 0.40, 'sawtooth', 0.12, 0.08); }
function sfxBoostWarn(st){ const f = [990, 990, 1180, 1480][st] || 990;                      // BOOST 预警：3 声渐高 beep
                           sfxSweep(f, f, 0.09, 'square', 0.14); }
function sfxTripleWarn(st){ const f = [780, 780, 940, 1180][st] || 780;                      // 超级形态预警：3 声渐高 beep（音色区别于 BOOST）
                           sfxSweep(f, f, 0.10, 'triangle', 0.15); }

// ---- 滑翔喷火轰鸣：纯宽带低通噪声（无振荡器——振荡器谐波会听成"电子报错"）
//      + 双层无公倍数慢 LFO 模拟气流不规则涌动，音量 ≈0.07，随滑翔状态淡入淡出；全 try/catch 防御 ----
function syncGlideAudio() {
  try {
    const want = STATE.mode === 'PLAYING' && STATE.gliding && !audioIsSfxMuted();
    if (want && !AUDIO.glideNodes && AUDIO.ctx) {
      if (!noiseBuffer) {
        // 2 秒长缓冲：避免短循环的周期脉冲感（"滴滴滴"听感来源之一）
        noiseBuffer = AUDIO.ctx.createBuffer(1, Math.floor(AUDIO.ctx.sampleRate * 2.0), AUDIO.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const t0 = AUDIO.ctx.currentTime;
      // 火焰喷射 = 宽带低通噪声（无振荡器！）：柔和连续的气流轰鸣。
      // 教训：锯齿波/方波振荡器的谐波会带出"电子蜂鸣/系统报错"感，火焰声不该有音高。
      const src = AUDIO.ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const flt = AUDIO.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 360;
      flt.Q.value = 0.4;
      // 很慢很轻的双层起伏：模拟火焰气流的不规则涌动（非周期性蜂鸣）
      const lfo = AUDIO.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.1;
      const lfoGain = AUDIO.ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain);
      lfoGain.connect(flt.frequency);
      const lfo2 = AUDIO.ctx.createOscillator();
      lfo2.type = 'sine';
      lfo2.frequency.value = 3.7;                    // 与 1.1Hz 无公倍数 → 叠加出不重复涌动
      const lfo2Gain = AUDIO.ctx.createGain();
      lfo2Gain.gain.value = 50;
      lfo2.connect(lfo2Gain);
      lfo2Gain.connect(flt.frequency);
      // 主增益（淡入淡出作用点，音量 ≈0.07）
      const g = AUDIO.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.15);   // 淡入防爆音
      src.connect(flt);
      flt.connect(g);
      g.connect(AUDIO.master);
      src.start(t0);
      lfo.start(t0);
      lfo2.start(t0);
      AUDIO.glideNodes = { src: src, lfo: lfo, lfo2: lfo2, gain: g };
    } else if (!want && AUDIO.glideNodes) {
      const nd = AUDIO.glideNodes;
      AUDIO.glideNodes = null;
      try {
        nd.gain.gain.exponentialRampToValueAtTime(0.0001, AUDIO.ctx.currentTime + 0.10);  // 淡出
        const tStop = AUDIO.ctx.currentTime + 0.12;
        nd.src.stop(tStop);
        nd.lfo.stop(tStop);
        nd.lfo2.stop(tStop);
      } catch (e2) {
        try { nd.src.stop(); } catch (e3) {}
        try { nd.lfo.stop(); } catch (e4) {}
        try { nd.lfo2.stop(); } catch (e5) {}
      }
    }
  } catch (e) {}
}

// ============================================================
// 10. 主循环
// ============================================================
function loop(now) {
  if (!STATE.lastTime) STATE.lastTime = now;
  const dt = Math.min((now - STATE.lastTime) / 1000, 0.05);
  STATE.lastTime = now;
  STATE.time += dt;            // 全局时钟：驱动警报灯/晶体浮动/警示脉冲等动画

  if (STATE.mode === 'PLAYING') updatePhysics(dt);
  syncAdaptiveAudio();
  updateEffects(dt);
  render();
  requestAnimationFrame(loop);
}

function render() {
  const ctx = STATE.ctx;
  ctx.save();
  // 屏幕震动：强度二次方衰减（重击感强、收尾快），随机偏移仅限特效帧
  if (STATE.shake > 0) {
    const s = STATE.shake * STATE.shake;
    ctx.translate((Math.random() - 0.5) * 22 * s, (Math.random() - 0.5) * 16 * s);
  }
  renderBackground(ctx);
  renderTrack(ctx);
  renderSideDecor(ctx);
  renderShots(ctx);
  renderPlayer(ctx);
  renderEffects(ctx);
  ctx.restore();
  if (STATE.mode === 'PLAYING') renderHUD(ctx);
  if (STATE.mode === 'MENU') renderMenu(ctx);
  if (STATE.mode === 'GAMEOVER') renderGameOver(ctx);
}

// ============================================================
// 11. 启动
// ============================================================
function applyLocale(locale) {
  const i18n = globalThis.Skyroads.i18n;
  if (!i18n) return;
  STATE.translator = i18n.createTranslator(locale);
  document.documentElement.lang = STATE.translator.locale;
  document.title = STATE.translator.t('app.documentTitle');
  const description = document.querySelector('meta[name="description"]');
  if (description && typeof description.setAttribute === 'function') {
    description.setAttribute('content', STATE.translator.t('meta.description'));
  }
  if (STATE.canvas && typeof STATE.canvas.setAttribute === 'function') {
    STATE.canvas.setAttribute('aria-label', STATE.translator.t('canvas.label'));
  }
  refreshPresentation();
}

function installDiagnostics() {
  const presentation = globalThis.Skyroads.presentation;
  const safeSnapshot = () => {
    const leaderboardSnapshot = currentLeaderboardSnapshot();
    let overlays = null;
    try { overlays = presentation ? presentation.overlayForMode(STATE.mode) : null; } catch (_) {}
    return Object.freeze({
      initialized: Boolean(STATE.canvas && STATE.ctx),
      scripts: Object.freeze({
        i18n: Boolean(globalThis.Skyroads.i18n),
        leaderboard: Boolean(globalThis.Skyroads.leaderboard),
        presentation: Boolean(presentation),
        input: Boolean(globalThis.Skyroads.input),
        audio: Boolean(globalThis.Skyroads.audio),
        game: true,
      }),
      locale: STATE.translator ? STATE.translator.locale : null,
      mode: STATE.mode,
      canvas: Object.freeze({ width: STATE.width, height: STATE.height, dpr: STATE.dpr }),
      overlays: overlays ? Object.freeze({ ...overlays }) : null,
      leaderboard: Object.freeze({
        entryCount: Array.isArray(leaderboardSnapshot.entries) ? leaderboardSnapshot.entries.length : 0,
        persistenceAvailable: !leaderboardSnapshot.persistenceWarning,
      }),
      visualAssets: STATE.visualAssets ? Object.freeze({
        shipFramesReady: STATE.visualAssets.shipFramesReady,
        fallbackRequired: STATE.visualAssets.fallbackRequired,
        timedOut: STATE.visualAssets.timedOut,
        loadedCount: STATE.visualAssets.loadedCount,
        failedCount: STATE.visualAssets.failedCount,
      }) : null,
      audio: Object.freeze({ ...adaptiveAudioState() }),
    });
  };
  const audioReady = STATE.audioController && STATE.audioController.ready
    ? STATE.audioController.ready
    : Promise.resolve(null);
  const diagnostics = Object.freeze({
    snapshot: safeSnapshot,
    ready: Promise.all([Promise.resolve(STATE.visualAssetsReady), audioReady]).then(safeSnapshot),
  });
  try {
    Object.defineProperty(globalThis.Skyroads, 'diagnostics', {
      value: diagnostics,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  } catch (_) {
    globalThis.Skyroads.diagnostics = diagnostics;
  }
}

function init() {
  const i18n = globalThis.Skyroads.i18n;
  STATE.canvas = document.getElementById('game');
  let localeStorage = null;
  try { localeStorage = globalThis.localStorage; } catch (_) {}
  STATE.storage = localeStorage;
  const savedLocale = i18n.readLocalePreference(localeStorage);
  applyLocale(i18n.resolveLocale({ savedLocale, languages: navigator.languages, language: navigator.language }));

  const leaderboardApi = globalThis.Skyroads.leaderboard;
  if (leaderboardApi && typeof leaderboardApi.createLeaderboard === 'function') {
    STATE.leaderboard = leaderboardApi.createLeaderboard({ storage: localeStorage });
    STATE.leaderboardSnapshot = STATE.leaderboard.initialize();
  }
  resetRunResult();

  const audioApi = globalThis.Skyroads.audio;
  if (audioApi && typeof audioApi.createAudioController === 'function') {
    let audioProbe = null;
    try { audioProbe = typeof document.createElement === 'function' ? document.createElement('audio') : null; } catch (_) {}
    const canPlayType = (mime) => audioProbe && typeof audioProbe.canPlayType === 'function' ? audioProbe.canPlayType(mime) : '';
    let fetchImpl = null;
    try { if (typeof globalThis.fetch === 'function') fetchImpl = globalThis.fetch.bind(globalThis); } catch (_) {}
    STATE.audioController = audioApi.createAudioController({
      AudioContextClass: window.AudioContext || window.webkitAudioContext || null,
      fetchImpl,
      storage: localeStorage,
      canPlayType,
      proceduralFallback: startProceduralMusic,
    });
    syncLegacyAudioMuteState();
    syncAdaptiveAudio(true);
  }

  const presentation = globalThis.Skyroads.presentation;
  if (presentation && typeof presentation.preloadVisualAssets === 'function') {
    STATE.visualAssetsReady = presentation.preloadVisualAssets({ timeoutMs: 5000 }).then((result) => {
      STATE.visualAssets = result;
      return result;
    });
  }
  const appUi = document.getElementById('app-ui');
  if (presentation && STATE.leaderboard && appUi) {
    STATE.ui = presentation.createCommandCenter({
      documentObject: document,
      elements: {
        canvas: STATE.canvas,
        appUi,
        utilityControls: document.getElementById('utility-controls'),
        titleScreen: document.getElementById('title-screen'),
        gameOverScreen: document.getElementById('game-over-screen'),
        leaderboardDialog: document.getElementById('leaderboard-dialog'),
        renameDialog: document.getElementById('rename-dialog'),
        persistenceWarning: document.getElementById('persistence-warning'),
        ariaStatus: document.getElementById('aria-status'),
      },
    });
    STATE.uiController = presentation.bindOverlayActions({
      documentObject: document,
      elements: STATE.ui,
      actions: {
        getMode: () => STATE.mode,
        start: startGame,
        menu: gotoMenu,
        getPlayerName: () => currentLeaderboardSnapshot().profile.name,
        beforeLeaderboard() {
          STATE.leaderboardSnapshot = STATE.leaderboard.getSnapshot();
          refreshPresentation();
        },
        rename(rawName) {
          const mutation = STATE.leaderboard.renamePlayer(rawName);
          STATE.leaderboardSnapshot = mutation.snapshot;
          if (STATE.ui && STATE.ui.ariaStatus) {
            STATE.ui.ariaStatus.textContent = `${STATE.translator.t('rename.label')}: ${mutation.snapshot.profile.name}`;
          }
          refreshPresentation();
        },
        nameInput(value) {
          presentation.updateNameCount(STATE.ui, STATE.translator, value);
        },
        language() {
          const locale = STATE.translator.locale === 'zh-CN' ? 'en' : 'zh-CN';
          i18n.writeLocalePreference(localeStorage, locale);
          applyLocale(locale);
        },
        music() {
          if (!STATE.audioController) return;
          const current = STATE.audioController.getState();
          STATE.audioController.setMusicMuted(!current.musicMuted);
          syncLegacyAudioMuteState();
          refreshPresentation();
        },
        sfx() {
          if (!STATE.audioController) return;
          const current = STATE.audioController.getState();
          STATE.audioController.setSfxMuted(!current.sfxMuted);
          syncLegacyAudioMuteState();
          refreshPresentation();
        },
      },
    });
    refreshPresentation();
    focusPrimarySurface();
    if (STATE.leaderboardSnapshot.legacyBest != null) STATE.leaderboard.acknowledgeLegacyBest();
  }

  if (appUi && typeof globalThis.MutationObserver === 'function') {
    const overlayObserver = new globalThis.MutationObserver(() => {
      if (modalOpen()) clearMovementInput();
    });
    overlayObserver.observe(appUi, {
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'aria-modal'],
    });
  }
  STATE.ctx = STATE.canvas.getContext('2d');
  function resize() {
    const metrics = presentation
      ? presentation.canvasMetrics(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
      : { cssWidth: window.innerWidth, cssHeight: window.innerHeight, pixelWidth: window.innerWidth, pixelHeight: window.innerHeight, dpr: 1 };
    STATE.width = metrics.cssWidth;
    STATE.height = metrics.cssHeight;
    STATE.dpr = metrics.dpr;
    STATE.canvas.width = metrics.pixelWidth;
    STATE.canvas.height = metrics.pixelHeight;
    if (STATE.canvas.style) {
      STATE.canvas.style.width = `${metrics.cssWidth}px`;
      STATE.canvas.style.height = `${metrics.cssHeight}px`;
    }
    if (STATE.ctx && typeof STATE.ctx.setTransform === 'function') {
      STATE.ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    }
  }
  window.addEventListener('resize', resize);
  resize();
  STATE.gen = newGenState();
  STATE.track = buildTrack();
  installDiagnostics();
  requestAnimationFrame(loop);
}
init();

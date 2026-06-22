# 太空跳跳车 (SkyRoads) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一款单文件 HTML 伪 3D 第一人称太空跑酷游戏，三种死亡条件、燃料系统、计分与最佳记录。

**Architecture:** 单个 `index.html` 内嵌 CSS + JS。JS 按职责分区：常量配置、输入、赛道生成、伪 3D 渲染、物理碰撞、状态机、主循环、UI。使用 `requestAnimationFrame` 主循环，Canvas 2D 透视投影渲染。

**Tech Stack:** 原生 HTML5 Canvas 2D + JavaScript (ES2015+)。零依赖、零构建、浏览器打开即玩。

**测试策略:** 浏览器游戏无 node 单测框架。每个任务通过浏览器手动验证（打开 `index.html`，按任务描述检查行为），并在任务中给出明确的"验证标准"和键盘操作步骤。可使用 `python3 -m http.server` 起本地服务器避免 file:// 限制。

---

## 文件结构

仅一个交付文件 + 辅助说明：

```
/Users/stan/Developer/Local/SkyRoads/
├── index.html                    # 唯一交付文件：游戏全部代码
└── docs/superpowers/
    ├── specs/                    # 设计文档（已存在）
    └── plans/                    # 本计划文档（已存在）
```

`index.html` 内部 JS 分区（用注释分隔，保持单文件）：

```
<script>
  // ===== 1. 常量配置 CONFIG =====
  // ===== 2. 游戏状态 STATE =====
  // ===== 3. 输入处理 Input =====
  // ===== 4. 赛道生成 Track =====
  // ===== 5. 伪 3D 渲染 Render =====
  // ===== 6. 背景星空 Background =====
  // ===== 7. 物理与碰撞 Physics =====
  // ===== 8. 状态机 GameState =====
  // ===== 9. UI (HUD / GameOver / Menu) =====
  // ===== 10. 主循环 loop =====
  // ===== 11. 启动 =====
</script>
```

---

## Task 1: 骨架 — HTML + Canvas + 主循环 + 配置

**Files:**
- Create: `index.html`

**目标:** 建立可运行的骨架：全屏 Canvas、固定时间步主循环、屏幕上显示当前 FPS 以验证循环工作。

- [ ] **Step 1: 创建 index.html 骨架**

完整内容如下（含 CONFIG 配置块、Canvas、主循环、FPS 显示）。CONFIG 常量集中在此，后续任务直接引用 `CONFIG.xxx`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>太空跳跳车 SkyRoads</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
  body { display: flex; align-items: center; justify-content: center; font-family: 'Courier New', monospace; }
  #game { display: block; background: #000018; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
'use strict';

// ===== 1. 常量配置 CONFIG =====
const CONFIG = {
  // 渲染
  RENDER_DISTANCE: 200,        // 渲染多少个 segment（前方）
  SEGMENT_LENGTH: 50,          // 单个 segment 的 z 长度（世界单位）
  ROAD_WIDTH: 2200,            // 跑道总宽度（世界单位，3 车道合计）
  LANES: 3,                    // 车道数
  CAMERA_HEIGHT: 1200,         // 相机离跑道高度
  CAMERA_DEPTH: 0.84,          // 相机焦距倒数相关，影响视野
  // 物理
  INITIAL_SPEED: 0,            // 初始速度（segment/秒）
  MAX_SPEED: 24,               // 最大速度（segment/秒）
  ACCEL: 1.8,                  // 自动加速度（segment/秒²）
  LANE_SWITCH_TIME: 0.18,      // 变道耗时（秒）
  JUMP_VELOCITY: 9000,         // 跳跃初速度（世界单位/秒）
  GRAVITY: 24000,              // 重力（世界单位/秒²）
  // 燃料
  FUEL_MAX: 100,
  FUEL_DRAIN_RATE: 4.5,        // 每秒消耗
  FUEL_PICKUP: 30,             // 每个胶囊补充
  // 赛道生成
  TRACK_INITIAL_SEGMENTS: 600,
};

// ===== 2. 游戏状态 STATE =====
const STATE = {
  mode: 'MENU',                // 'MENU' | 'PLAYING' | 'GAMEOVER'
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  // 玩家
  position: 0,                 // 世界 z 位置（沿跑道前进方向，递增）
  speed: 0,                    // 当前速度（segment/秒）
  lane: 1,                     // 当前车道索引（0=左,1=中,2=右）
  laneFrom: 1,                 // 变道起始车道
  laneTo: 1,                   // 变道目标车道
  laneT: 1,                    // 变道插值进度 0..1（1=完成）
  playerY: 0,                  // 玩家离跑道高度（跳跃用）
  playerVY: 0,                 // 玩家垂直速度
  // 燃料/计分
  fuel: CONFIG.FUEL_MAX,
  distance: 0,                 // 累计前进距离（米）
  elapsed: 0,                  // 本局用时（秒）
  best: 0,                     // 最佳距离（localStorage）
  // 赛道
  track: [],                   // segment 数组
  // 时间
  lastTime: 0,
  fps: 0,
  fpsAccum: 0,
  fpsFrames: 0,
};

// ===== 10. 主循环 =====
function loop(now) {
  if (!STATE.lastTime) STATE.lastTime = now;
  const dt = Math.min((now - STATE.lastTime) / 1000, 0.05); // 限制单帧最大 50ms
  STATE.lastTime = now;

  // FPS 统计
  STATE.fpsAccum += dt;
  STATE.fpsFrames++;
  if (STATE.fpsAccum >= 0.5) {
    STATE.fps = Math.round(STATE.fpsFrames / STATE.fpsAccum);
    STATE.fpsAccum = 0;
    STATE.fpsFrames = 0;
  }

  update(dt);
  render();
  requestAnimationFrame(loop);
}

// 占位：update/render 后续任务实现
function update(dt) {}
function render() {
  const ctx = STATE.ctx;
  ctx.fillStyle = '#000018';
  ctx.fillRect(0, 0, STATE.width, STATE.height);
  // 临时 FPS 显示
  ctx.fillStyle = '#0f0';
  ctx.font = '16px monospace';
  ctx.fillText('FPS: ' + STATE.fps + '  mode=' + STATE.mode, 12, 22);
}

// ===== 11. 启动 =====
function init() {
  STATE.canvas = document.getElementById('game');
  STATE.ctx = STATE.canvas.getContext('2d');
  function resize() {
    STATE.width = STATE.canvas.width = window.innerWidth;
    STATE.height = STATE.canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  STATE.best = parseFloat(localStorage.getItem('skyroads_best') || '0') || 0;
  requestAnimationFrame(loop);
}
init();
</script>
</body>
</html>
```

- [ ] **Step 2: 浏览器验证骨架**

起本地服务器并打开（新终端）：

```bash
cd /Users/stan/Developer/Local/SkyRoads && python3 -m http.server 8000
```

浏览器访问 `http://localhost:8000/`。

**验证标准:** 屏幕全屏深蓝色背景，左上角显示 `FPS: 60 mode=MENU`，FPS 数值稳定在 55-60。调整窗口大小 Canvas 自适应。

- [ ] **Step 3: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 游戏骨架 - Canvas + 主循环 + CONFIG/STATE

- 全屏 Canvas 自适应窗口
- requestAnimationFrame 固定时间步主循环
- FPS 统计显示
- CONFIG/STATE 集中配置"
```

---

## Task 2: 背景星空渲染

**Files:**
- Modify: `index.html`（在 render 函数之前插入 Background 区，并在 render 中调用）

**目标:** 渲染深空渐变背景 + 星点，为太空氛围打底。星空随玩家前进而有轻微视差（不动也行，v1 简化为静止星点 + 渐变）。

- [ ] **Step 1: 在 // ===== 10. 主循环 ===== 之前插入 Background 区**

在 `function loop(now)` 这一行之前插入：

```javascript
// ===== 6. 背景星空 Background =====
const STARS = (function () {
  const arr = [];
  // 用确定性种子生成固定星点（避免每帧随机闪烁）
  let seed = 12345;
  function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  for (let i = 0; i < 220; i++) {
    arr.push({
      x: rand(),       // 0..1 屏幕比例
      y: rand() * 0.7, // 偏上方（地平线在上 1/3）
      r: rand() * 1.4 + 0.3,
      b: rand() * 0.6 + 0.4, // 亮度
    });
  }
  return arr;
})();

function renderBackground(ctx) {
  const w = STATE.width, h = STATE.height;
  // 垂直渐变：顶部深蓝紫 -> 地平线偏亮 -> 底部深
  const horizon = h * 0.42;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(0.42, '#1a1a4e');
  grad.addColorStop(0.42, '#10081a');
  grad.addColorStop(1, '#000005');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // 星点（只画地平线以上）
  for (const s of STARS) {
    ctx.globalAlpha = s.b;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * horizon, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: 在 render() 中调用背景渲染**

将 render 函数替换为：

```javascript
function render() {
  const ctx = STATE.ctx;
  renderBackground(ctx);
  // FPS 调试（后续任务会移除）
  ctx.fillStyle = '#0f0';
  ctx.font = '14px monospace';
  ctx.fillText('FPS: ' + STATE.fps + '  mode=' + STATE.mode, 12, 22);
}
```

- [ ] **Step 3: 浏览器验证**

刷新页面。

**验证标准:** 上半屏深蓝紫渐变 + 白色星点，下半屏过渡到深黑。星点固定不闪烁。地平线约在屏幕 42% 高度处有明显色调分界（伪 3D 跑道将画在此线以下）。

- [ ] **Step 4: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 背景星空渲染 - 渐变 + 固定星点"
```

---

## Task 3: 赛道数据结构与生成器

**Files:**
- Modify: `index.html`

**目标:** 定义 segment 数据结构，实现赛道生成器。生成器保证可解性约束（见 spec）。本任务不渲染，先在 console 验证数据正确。

**Segment 结构定义（后续所有任务共用）：**

```
segment = {
  index: number,              // 该段在 track 中的下标
  lanes: [type, type, type],  // 3 个车道的类型
}
type ∈ {'ROAD', 'GAP', 'WALL', 'FUEL'}
```

- [ ] **Step 1: 在 Background 区之前插入 Track 区**

在 `// ===== 6. 背景星空 Background =====` 这一行之前插入：

```javascript
// ===== 4. 赛道生成 Track =====
const LANE_TYPE = { ROAD: 'ROAD', GAP: 'GAP', WALL: 'WALL', FUEL: 'FUEL' };

// 生成单个 segment：依据前一段 + 难度，保证可解性
function generateSegment(index, prev) {
  const lanes = [LANE_TYPE.ROAD, LANE_TYPE.ROAD, LANE_TYPE.ROAD];
  // 起跑前 20 段全 ROAD，给玩家热身
  if (index < 20) {
    // 偶尔放燃料
    if (index > 5 && Math.random() < 0.15) {
      lanes[Math.floor(Math.random() * 3)] = LANE_TYPE.FUEL;
    }
    return { index, lanes };
  }

  // 难度随距离缓慢上升
  const difficulty = Math.min(1, (index - 20) / 600);

  // 如果上一段有 WALL，本段强制全 ROAD（反应间隔，避免连续封锁）
  if (prev && prev.lanes.some(t => t === LANE_TYPE.WALL)) {
    if (Math.random() < 0.2) {
      const i = Math.floor(Math.random() * 3);
      lanes[i] = LANE_TYPE.FUEL;
    }
    return { index, lanes };
  }

  const r = Math.random();
  if (r < 0.18) {
    // 障碍段：随机 1 条车道（难度高时最多 2 条）放 WALL，至少留 1 条非墙
    const wallCount = (difficulty > 0.5 && Math.random() < 0.3) ? 2 : 1;
    const idxs = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (let i = 0; i < wallCount; i++) lanes[idxs[i]] = LANE_TYPE.WALL;
  } else if (r < 0.32) {
    // 缺口段：1-2 条车道放 GAP，至少留 1 条 ROAD/FUEL
    const gapCount = (difficulty > 0.6 && Math.random() < 0.4) ? 2 : 1;
    const idxs = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (let i = 0; i < gapCount; i++) lanes[idxs[i]] = LANE_TYPE.GAP;
  } else if (r < 0.45) {
    // 燃料段：随机 1 条车道放 FUEL
    lanes[Math.floor(Math.random() * 3)] = LANE_TYPE.FUEL;
  }
  // 其余（r >= 0.45）全 ROAD
  return { index, lanes };
}

// 初始化整条赛道
function buildTrack() {
  const track = [];
  for (let i = 0; i < CONFIG.TRACK_INITIAL_SEGMENTS; i++) {
    track.push(generateSegment(i, track[i - 1]));
  }
  return track;
}

// 动态扩展赛道：玩家接近尾部时追加（保持无限）
function extendTrack() {
  while (STATE.track.length < STATE.position + CONFIG.RENDER_DISTANCE + 50) {
    const i = STATE.track.length;
    STATE.track.push(generateSegment(i, STATE.track[i - 1]));
  }
}
```

- [ ] **Step 2: 在 init() 中初始化赛道 + console 验证钩子**

修改 init()，在 `STATE.best = ...` 这一行之后、`requestAnimationFrame(loop)` 之前插入：

```javascript
  STATE.track = buildTrack();
  // console 验证：打印前 40 段
  console.log('track[0..40]:', STATE.track.slice(0, 40).map(s => s.lanes.join('|')));
  // 可解性自检：无 segment 是 3 个全 WALL 或 3 个全 GAP（除 ROAD/FUEL 外全死）
  console.log('可解性自检:',
    STATE.track.every(s =>
      s.lanes.some(t => t === LANE_TYPE.ROAD || t === LANE_TYPE.FUEL)
    ));
```

- [ ] **Step 3: 浏览器验证**

刷新页面，打开 DevTools Console（F12）。

**验证标准:**
1. Console 打印 `track[0..40]:`，前 20 项多为 `ROAD|ROAD|ROAD`（偶有 FUEL）。
2. Console 打印 `可解性自检: true`（每个 segment 至少有一条 ROAD/FUEL 车道）。
3. 多次刷新，可解性自检始终为 true。

- [ ] **Step 4: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 赛道数据结构 + 程序化生成器（含可解性约束）

- segment: {index, lanes:[type,type,type]}
- generateSegment 保证每段至少 1 条 ROAD/FUEL
- WALL 段后强制 ROAD 段（反应间隔）
- buildTrack/extendTrack 无限扩展"
```

---

## Task 4: 伪 3D 透视投影 + 跑道渲染

**Files:**
- Modify: `index.html`

**目标:** 实现透视投影函数，把 segment 投影到屏幕；从远到近渲染跑道梯形（画家算法），每条车道上色区分。本任务后应能看到一条静止的伪 3D 跑道伸向地平线。

**投影数学：**
```
对世界点 (worldX, worldY=hight above road, z=距相机距离):
  scale = CAMERA_DEPTH / z
  screenX = width/2 + scale * worldX * width/2
  screenY = height/2 - scale * (worldY - CAMERA_HEIGHT) * height/2   // 注意相机抬高的处理
```
为简化，相机位于 `(0, CAMERA_HEIGHT, position)`，看向 +z。worldX 是相对跑道中心线的横向偏移。

- [ ] **Step 1: 在 Track 区之后、Background 区之前插入 Render 区**

在 `// ===== 6. 背景星空 Background =====` 这一行之前插入：

```javascript
// ===== 5. 伪 3D 渲染 Render =====

// 投影：世界坐标 -> 屏幕坐标
// worldX: 相对跑道中心横向偏移（正右负左）
// worldY: 距跑道表面高度（正上）
// zRel: 距相机的 z 距离（正值，前方）
// 返回 {x, y, scale, visible}
function project(worldX, worldY, zRel) {
  if (zRel <= 1) return { x: 0, y: 0, scale: 0, visible: false };
  const scale = CONFIG.CAMERA_DEPTH / zRel;
  const w = STATE.width, h = STATE.height;
  const screenX = w / 2 + scale * worldX * w / 2;
  // 相机在 CAMERA_HEIGHT 高度，y 向上为正；屏幕 y 向下为正
  const screenY = h / 2 - scale * (worldY - CONFIG.CAMERA_HEIGHT) * h / 2;
  return { x: screenX, y: screenY, scale: scale, visible: true };
}

// 车道中心 worldX：lane 0/1/2 -> 横向位置
function laneCenterX(lane) {
  // 跑道宽 ROAD_WIDTH，3 车道，车道中心
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  return (lane - (CONFIG.LANES - 1) / 2) * laneWidth;
}

// 渲染跑道：从远到近画每个 segment 的 3 条车道梯形
function renderTrack(ctx) {
  const track = STATE.track;
  const basePos = STATE.position;                 // 玩家世界 z
  const segLen = CONFIG.SEGMENT_LENGTH;
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;

  // 计算玩家当前实际所在 worldX（含变道插值）
  const playerX = playerWorldX();

  // 从最远 segment 往近画
  const startIdx = Math.floor(basePos) + CONFIG.RENDER_DISTANCE;
  const endIdx = Math.floor(basePos);
  let prevProjected = null; // 上一段（更远）的投影点

  for (let i = startIdx; i >= endIdx; i--) {
    if (i < 0 || i >= track.length) continue;
    const seg = track[i];
    // z 距相机：segment 起点 z 减玩家 z
    const zNear = (i - basePos) * segLen;          // 近边
    const zFar = (i + 1 - basePos) * segLen;       // 远边
    if (zNear <= 1) continue;                      // 在相机后面，跳过

    // 近边/远边的 4 个角点（相对玩家 worldX 偏移需加上 playerX）
    // 跑道左边界 = -halfRoad + playerX, 右边界 = halfRoad + playerX
    const nearLeft = project(-halfRoad, 0, zNear);
    const nearRight = project(halfRoad, 0, zNear);
    const farLeft = project(-halfRoad, 0, zFar);
    const farRight = project(halfRoad, 0, zFar);

    // 3 条车道分别上色
    for (let lane = 0; lane < CONFIG.LANES; lane++) {
      const type = seg.lanes[lane];
      const color = colorForType(type, i);
      // 车道梯形 4 角
      const nl = lane - 2;          // 车道左边界相对跑道中心的 lane 偏移
      // 直接用横向比例计算 4 角的 worldX
      const xL_near = -halfRoad + lane * laneWidth;
      const xR_near = -halfRoad + (lane + 1) * laneWidth;
      const p1 = project(xL_near, 0, zNear);
      const p2 = project(xR_near, 0, zNear);
      const p3 = project(xR_near, 0, zFar);
      const p4 = project(xL_near, 0, zFar);
      if (!p1.visible || !p3.visible) continue;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
      // 车道分隔线（除最左车道）
      if (lane > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }
    }

    // 缺口段：把 GAP 车道擦成透明（用背景色重绘或直接画"虚空"黑）
    // 已通过 colorForType 返回深色处理；WALL/FUEL 在后续任务画立体

    // segment 间隔的横向跑道边线（每隔几段画亮线，增强纵深感）
    if (i % 4 === 0) {
      ctx.strokeStyle = 'rgba(120,200,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nearLeft.x, nearLeft.y);
      ctx.lineTo(nearRight.x, nearRight.y);
      ctx.stroke();
    }
  }

  // WALL（障碍块）与 FUEL（胶囊）的立体渲染：第二遍从远到近画
  for (let i = startIdx; i >= endIdx; i--) {
    if (i < 0 || i >= track.length) continue;
    const seg = track[i];
    const zNear = (i - basePos) * segLen;
    const zFar = (i + 1 - basePos) * segLen;
    if (zNear <= 1) continue;
    for (let lane = 0; lane < CONFIG.LANES; lane++) {
      const type = seg.lanes[lane];
      if (type === LANE_TYPE.WALL) {
        renderBlock(ctx, lane, zNear, zFar, '#aa2233', 700);
      } else if (type === LANE_TYPE.FUEL) {
        renderBlock(ctx, lane, zNear, zFar, '#22ddaa', 500);
      }
    }
  }
}

// 立方块（WALL 或 FUEL 胶囊）：画一个有高度的盒子顶面+正面
function renderBlock(ctx, lane, zNear, zFar, color, height) {
  const laneWidth = CONFIG.ROAD_WIDTH / CONFIG.LANES;
  const halfRoad = CONFIG.ROAD_WIDTH / 2;
  const xL = -halfRoad + lane * laneWidth + laneWidth * 0.1;
  const xR = -halfRoad + (lane + 1) * laneWidth - laneWidth * 0.1;
  // 底面 4 角（贴跑道）
  const b1 = project(xL, 0, zNear);
  const b2 = project(xR, 0, zNear);
  const b3 = project(xR, 0, zFar);
  const b4 = project(xL, 0, zFar);
  // 顶面 4 角
  const t1 = project(xL, height, zNear);
  const t2 = project(xR, height, zNear);
  const t3 = project(xR, height, zFar);
  const t4 = project(xL, height, zFar);
  if (!b1.visible || !t1.visible) return;
  // 正面（近边朝玩家的面）
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
  ctx.closePath(); ctx.fill();
  // 顶面
  ctx.fillStyle = shade(color, 1.3);
  ctx.beginPath();
  ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y);
  ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
  ctx.closePath(); ctx.fill();
}

// 颜色辅助
function colorForType(type, index) {
  // 跑道深浅交替，增强段落感
  const baseDark = (Math.floor(index / 3) % 2 === 0) ? '#3a3a55' : '#34344e';
  switch (type) {
    case LANE_TYPE.ROAD: return baseDark;
    case LANE_TYPE.FUEL: return baseDark;   // 燃料胶囊单独立体绘制，地面仍为 ROAD 色
    case LANE_TYPE.GAP:  return '#05050d';  // 缺口=虚空黑
    case LANE_TYPE.WALL: return baseDark;   // 墙单独立体绘制，地面仍为 ROAD 色
    default: return baseDark;
  }
}

// 颜色明暗调整（简单系数）：color 形如 '#rrggbb'
function shade(color, factor) {
  const r = Math.min(255, Math.round(parseInt(color.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(color.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(color.slice(5, 7), 16) * factor));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// 玩家当前 worldX（含变道插值）
function playerWorldX() {
  const from = laneCenterX(STATE.laneFrom);
  const to = laneCenterX(STATE.laneTo);
  return from + (to - from) * STATE.laneT;
}
```

- [ ] **Step 2: 在 render() 中调用 renderTrack**

将 render 函数替换为：

```javascript
function render() {
  const ctx = STATE.ctx;
  renderBackground(ctx);
  renderTrack(ctx);
  // FPS 调试
  ctx.fillStyle = '#0f0';
  ctx.font = '14px monospace';
  ctx.fillText('FPS: ' + STATE.fps + '  mode=' + STATE.mode + '  pos=' + STATE.position.toFixed(1), 12, 22);
}
```

- [ ] **Step 3: 浏览器验证（静止跑道）**

刷新页面。此时玩家未移动（speed=0, position=0），应看到静止的跑道。

**验证标准:**
1. 跑道从屏幕中央（地平线）向下方两侧扩展成梯形，明显的透视纵深感。
2. 看到 3 条车道由车道分隔线分开。
3. 远处偶见红色 WALL 块（带顶面）和青绿色 FUEL 胶囊块立在车道上。
4. 部分车道段是深黑色（GAP 缺口）。
5. 跑道左右两侧有横向亮线增强段落感。

- [ ] **Step 4: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 伪 3D 透视投影 + 跑道渲染

- project() 世界->屏幕透视投影
- renderTrack 画家算法从远到近绘制 segment
- 3 车道按类型上色（ROAD/GAP/FUEL/WALL）
- 立体障碍块与燃料胶囊
- 跑道边线增强纵深感"
```

---

## Task 5: 玩家飞船渲染

**Files:**
- Modify: `index.html`

**目标:** 在屏幕中下方绘制玩家的飞船。飞船随变道左右移动、随跳跃抬高。飞船固定在屏幕底部偏上位置（不随 position 缩放），用简单几何形状画出。

- [ ] **Step 1: 在 Render 区末尾（playerWorldX 函数之后）追加飞船渲染**

```javascript
// ===== 5b. 玩家飞船渲染 =====
function renderPlayer(ctx) {
  // 飞船屏幕位置：横向跟随变道（用插值决定偏移比例），底部固定
  const laneOffset = (STATE.lane - 1) + ((STATE.laneTo - STATE.laneFrom) * (STATE.laneT - 1));
  // 注：laneFrom->laneTo 插值，laneT=1 时停在 laneTo
  const fromLaneX = (STATE.laneFrom - 1);
  const toLaneX = (STATE.laneTo - 1);
  const laneX = fromLaneX + (toLaneX - fromLaneX) * STATE.laneT;
  // 屏幕横向：以中心为基准，每车道偏移 ~12% 宽
  const cx = STATE.width / 2 + laneX * STATE.width * 0.12;
  // 跳跃抬高：playerY 投影成屏幕像素（简化：直接按比例）
  const cy = STATE.height * 0.78 - STATE.playerY * 0.02;

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, STATE.height * 0.82, 40, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // 飞船主体（楔形）
  ctx.fillStyle = '#e8e8f0';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 30);        // 顶
  ctx.lineTo(cx - 38, cy + 18);   // 左下
  ctx.lineTo(cx - 14, cy + 10);
  ctx.lineTo(cx - 14, cy + 22);
  ctx.lineTo(cx + 14, cy + 22);
  ctx.lineTo(cx + 14, cy + 10);
  ctx.lineTo(cx + 38, cy + 18);   // 右下
  ctx.closePath();
  ctx.fill();
  // 驾驶舱（蓝玻璃）
  ctx.fillStyle = '#3aa0ff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx - 12, cy + 2);
  ctx.lineTo(cx + 12, cy + 2);
  ctx.closePath();
  ctx.fill();
  // 引擎尾焰
  ctx.fillStyle = '#ff8833';
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + 22);
  ctx.lineTo(cx, cy + 22 + 16 + Math.random() * 8);
  ctx.lineTo(cx + 10, cy + 22);
  ctx.closePath();
  ctx.fill();
}
```

- [ ] **Step 2: 在 render() 中调用 renderPlayer**

将 render 函数更新为（renderTrack 之后加 renderPlayer）：

```javascript
function render() {
  const ctx = STATE.ctx;
  renderBackground(ctx);
  renderTrack(ctx);
  renderPlayer(ctx);
  ctx.fillStyle = '#0f0';
  ctx.font = '14px monospace';
  ctx.fillText('FPS: ' + STATE.fps + '  mode=' + STATE.mode + '  pos=' + STATE.position.toFixed(1), 12, 22);
}
```

- [ ] **Step 3: 浏览器验证**

刷新页面。

**验证标准:**
1. 屏幕中下方出现白色楔形飞船，带蓝色驾驶舱和橙色尾焰。
2. 飞船下方有椭圆阴影。
3. 尾焰有随机抖动（"燃烧"感）。
4. 飞船位于中央车道（laneX=0 → 屏幕正中）。

- [ ] **Step 4: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 玩家飞船渲染（楔形+驾驶舱+尾焰+阴影）"
```

---

## Task 6: 输入处理 + 变道 + 跳跃

**Files:**
- Modify: `index.html`

**目标:** 实现键盘输入：←/→/A/D 变道（离散切换 + 插值），空格跳跃。在 update() 中推进变道插值和跳跃物理。

- [ ] **Step 1: 在 Track 区之前插入 Input 区**

在 `// ===== 4. 赛道生成 Track =====` 这一行之前插入：

```javascript
// ===== 3. 输入处理 Input =====
const KEYS = {};
window.addEventListener('keydown', (e) => {
  // 阻止空格/方向键滚屏
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  if (KEYS[e.key]) return;   // 抑制按键重复
  KEYS[e.key] = true;

  if (STATE.mode !== 'PLAYING') return;
  switch (e.key) {
    case 'ArrowLeft':
    case 'a': case 'A':
      trySwitchLane(-1); break;
    case 'ArrowRight':
    case 'd': case 'D':
      trySwitchLane(1); break;
    case ' ':
    case 'ArrowUp':
    case 'w': case 'W':
      tryJump(); break;
  }
});
window.addEventListener('keyup', (e) => { KEYS[e.key] = false; });

function trySwitchLane(dir) {
  // 仅在当前变道完成时接受新变道
  if (STATE.laneT < 1) return;
  const target = STATE.lane + dir;
  if (target < 0 || target >= CONFIG.LANES) return;
  STATE.laneFrom = STATE.lane;
  STATE.laneTo = target;
  STATE.lane = target;
  STATE.laneT = 0;
}

function tryJump() {
  // 仅在地面（playerY==0）时可跳
  if (STATE.playerY <= 0 && STATE.playerVY <= 0) {
    STATE.playerVY = CONFIG.JUMP_VELOCITY;
    STATE.playerY = 0.01; // 触发起跳
  }
}
```

- [ ] **Step 2: 在主循环之前插入 Physics 区**

在 `// ===== 10. 主循环 =====` 这一行之前插入：

```javascript
// ===== 7. 物理与碰撞 Physics =====
function updatePhysics(dt) {
  // 前进
  STATE.speed = Math.min(CONFIG.MAX_SPEED, STATE.speed + CONFIG.ACCEL * dt);
  STATE.position += STATE.speed * dt;
  STATE.distance += STATE.speed * dt * 10;   // 距离米数（任意比例）

  // 变道插值
  if (STATE.laneT < 1) {
    STATE.laneT = Math.min(1, STATE.laneT + dt / CONFIG.LANE_SWITCH_TIME);
  }

  // 跳跃物理
  if (STATE.playerY > 0 || STATE.playerVY > 0) {
    STATE.playerVY -= CONFIG.GRAVITY * dt;
    STATE.playerY += STATE.playerVY * dt;
    if (STATE.playerY <= 0) {
      STATE.playerY = 0;
      STATE.playerVY = 0;
    }
  }

  // 燃料消耗
  STATE.fuel = Math.max(0, STATE.fuel - CONFIG.FUEL_DRAIN_RATE * dt);
  STATE.elapsed += dt;

  // 动态扩展赛道
  extendTrack();
}
```

- [ ] **Step 3: 让 update() 在 PLAYING 时推进物理**

将 update 函数替换为：

```javascript
function update(dt) {
  if (STATE.mode === 'PLAYING') {
    updatePhysics(dt);
  }
}
```

- [ ] **Step 4: 浏览器验证（需要先能进入 PLAYING）**

由于状态机还没做，临时在 init() 末尾把 mode 设为 'PLAYING' 以测试输入。在 init() 中 `requestAnimationFrame(loop);` 之前临时插入：

```javascript
  STATE.mode = 'PLAYING';   // 临时：Task 8 改为正式状态机
  STATE.speed = 8;          // 临时初始速度便于测试
```

刷新页面。

**验证标准:**
1. 跑道自动向前滚动（速度递增直到上限）。
2. 按 ←/→ 或 A/D，飞船平滑左右切换车道（约 0.18 秒过渡）。
3. 按空格，飞船跳起再落下（抛物线），落地恢复。
4. 持续按住按键不会重复触发（需松开再按）。
5. 在左/右边界再按同方向键无效。

- [ ] **Step 5: 移除临时调试代码**

删除 Step 4 加的两行临时代码（`STATE.mode = 'PLAYING';` 和 `STATE.speed = 8;`）。

- [ ] **Step 6: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 输入处理 + 变道插值 + 跳跃物理

- 键盘 ←→AD 变道（离散+插值），空格/W/↑跳跃
- updatePhysics: 前进加速、变道、跳跃抛物线、燃料消耗
- 抑制按键重复"
```

---

## Task 7: 碰撞检测 + 三种死亡条件

**Files:**
- Modify: `index.html`

**目标:** 检测玩家当前 segment + 车道的类型，实现：GAP（未跳）→ 坠落死、WALL → 撞墙死、FUEL → 拾取补燃料、燃料耗尽 → 死。死亡触发 `die(reason)`，本任务先 console 打印 + 切换 mode，UI 在 Task 9 实现。

**碰撞规则：** 玩家位于 `segment[floor(position)]`（玩家占据的当前段），其当前车道（用插值后的近似车道 `round(laneX)+1`）类型决定结果。GAP 只有当 playerY 低于某阈值（未跳起来）时才坠落。

- [ ] **Step 1: 在 Physics 区 updatePhysics 函数之前插入碰撞检测**

```javascript
// 玩家当前实际车道索引（0..2），基于插值四舍五入
function currentLaneIndex() {
  const fromLaneX = STATE.laneFrom;
  const toLaneX = STATE.laneTo;
  const laneF = fromLaneX + (toLaneX - fromLaneX) * STATE.laneT;
  return Math.max(0, Math.min(CONFIG.LANES - 1, Math.round(laneF)));
}

// 死亡处理（Task 9 会扩展为完整 GameOver UI）
function die(reason) {
  if (STATE.mode !== 'PLAYING') return;
  STATE.mode = 'GAMEOVER';
  STATE.deathReason = reason;
  // 更新最佳记录
  if (STATE.distance > STATE.best) {
    STATE.best = STATE.distance;
    localStorage.setItem('skyroads_best', String(STATE.best));
  }
  console.log('GAME OVER:', reason, 'distance=', STATE.distance);
}

// 拾取燃料：把该 segment 该车道从 FUEL 降级为 ROAD
function pickupFuel(seg, laneIdx) {
  seg.lanes[laneIdx] = LANE_TYPE.ROAD;
  STATE.fuel = Math.min(CONFIG.FUEL_MAX, STATE.fuel + CONFIG.FUEL_PICKUP);
}

// 每帧碰撞检测
function checkCollisions() {
  // 燃料耗尽
  if (STATE.fuel <= 0) {
    die('fuel'); return;
  }
  const segIdx = Math.floor(STATE.position);
  const seg = STATE.track[segIdx];
  if (!seg) return;
  const laneIdx = currentLaneIndex();
  const type = seg.lanes[laneIdx];

  if (type === LANE_TYPE.WALL) {
    die('wall'); return;
  }
  if (type === LANE_TYPE.FUEL) {
    pickupFuel(seg, laneIdx);
    return;
  }
  if (type === LANE_TYPE.GAP) {
    // 跳跃中（playerY 足够高）则安全通过；否则坠落
    if (STATE.playerY < 200) {
      die('gap'); return;
    }
  }
}
```

- [ ] **Step 2: 在 updatePhysics 末尾（extendTrack 之后）调用碰撞**

在 updatePhysics 函数的最后（`extendTrack();` 之后）追加：

```javascript
  checkCollisions();
```

- [ ] **Step 3: 浏览器验证**

临时在 init() 中加 `STATE.mode = 'PLAYING';`（与 Task 6 相同的临时调试）。刷新页面。

**验证标准:**
1. 让飞船进入 GAP 车道（未跳）→ Console 输出 `GAME OVER: gap`，画面冻结（mode=GAMEOVER）。
2. 进入 WALL 车道 → Console 输出 `GAME OVER: wall`。
3. 进入 FUEL 车道 → 燃料补充（需配合 Task 9 HUD 验证，本步先 console）：在 checkCollisions 的 pickupFuel 后加临时 `console.log('fuel picked', STATE.fuel);`，进 FUEL 段应看到燃料数增加。
4. 不拾取任何燃料，等约 22 秒（FUEL_MAX/drain = 100/4.5）→ Console 输出 `GAME OVER: fuel`。

验证后移除所有临时调试代码（`STATE.mode='PLAYING'`、临时 console.log）。

- [ ] **Step 4: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 碰撞检测 + 三种死亡条件

- checkCollisions: 按 segment+lane 判定
- GAP 未跳(高度<200)坠落死
- WALL 撞墙死
- FUEL 拾取补燃料（段降级为 ROAD）
- 燃料耗尽死
- die() 更新最佳记录到 localStorage"
```

---

## Task 8: 游戏状态机 + 重置 + 临时键盘切换

**Files:**
- Modify: `index.html`

**目标:** 实现 MENU / PLAYING / GAMEOVER 正式切换。MENU 屏按空格开始；GAMEOVER 屏按空格重开、按 Esc 回 MENU。resetGame() 重置所有玩家状态。

- [ ] **Step 1: 在 Physics 区之后插入 GameState 区**

在 `// ===== 10. 主循环 =====` 这一行之前插入：

```javascript
// ===== 8. 状态机 GameState =====
function resetGame() {
  STATE.position = 0;
  STATE.speed = 0;
  STATE.lane = 1;
  STATE.laneFrom = 1;
  STATE.laneTo = 1;
  STATE.laneT = 1;
  STATE.playerY = 0;
  STATE.playerVY = 0;
  STATE.fuel = CONFIG.FUEL_MAX;
  STATE.distance = 0;
  STATE.elapsed = 0;
  STATE.deathReason = null;
  STATE.track = buildTrack();
}

function startGame() {
  resetGame();
  STATE.mode = 'PLAYING';
}

function gotoMenu() {
  STATE.mode = 'MENU';
}

function gotoGameOver() {
  STATE.mode = 'GAMEOVER';
}
```

- [ ] **Step 2: 扩展输入处理：MENU/GAMEOVER 屏按键**

修改 keydown 监听器（在 Task 6 的 switch 之前插入全局按键处理）。将原有 keydown 监听器中 `if (STATE.mode !== 'PLAYING') return;` 这一行替换为：

```javascript
  // 菜单/结束屏按键
  if (STATE.mode === 'MENU') {
    if (e.key === ' ' || e.key === 'Enter') { startGame(); }
    return;
  }
  if (STATE.mode === 'GAMEOVER') {
    if (e.key === ' ' || e.key === 'Enter') { startGame(); }
    else if (e.key === 'Escape') { gotoMenu(); }
    return;
  }
```

（即替换掉原来的 `if (STATE.mode !== 'PLAYING') return;`）

- [ ] **Step 3: 让 die() 使用 gotoGameOver**

修改 Task 7 的 die() 函数：把 `STATE.mode = 'GAMEOVER';` 改为 `gotoGameOver();`

- [ ] **Step 4: 从 init() 移除任何 mode 调试代码**

确认 init() 中没有设置 `STATE.mode` 的临时代码（应为默认 'MENU'）。

- [ ] **Step 5: 浏览器验证**

刷新页面（应在 MENU 状态）。

**验证标准:**
1. 进入 MENU 屏（mode=MENU，画面静止显示跑道+飞船）。
2. 按空格 → 进入 PLAYING，跑道开始滚动。
3. 撞死 → 进入 GAMEOVER，画面冻结。
4. 按空格 → 重开（PLAYING，状态重置）。
5. 死后按 Esc → 回 MENU。

（UI 提示文字在 Task 9 完善；本步通过 FPS 调试行能看到 mode 切换）

- [ ] **Step 6: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: 游戏状态机 MENU/PLAYING/GAMEOVER

- resetGame/startGame/gotoMenu/gotoGameOver
- MENU: 空格/Enter 开始
- GAMEOVER: 空格/Enter 重开, Esc 回菜单
- die() 走 gotoGameOver"
```

---

## Task 9: UI — HUD（燃料/速度/距离）+ 菜单屏 + GameOver 屏

**Files:**
- Modify: `index.html`

**目标:** 绘制 HUD（左上燃料条、距离/速度/时间数值）、标题菜单屏（标题 + 开始提示）、GameOver 屏（死亡原因、本局成绩、最佳记录、重开提示）。

- [ ] **Step 1: 在 Render 区之前（背景之前）插入 UI 区**

在 `// ===== 6. 背景星空 Background =====` 这一行之前插入：

```javascript
// ===== 9. UI (HUD / Menu / GameOver) =====
function renderHUD(ctx) {
  // 燃料条（左上）
  const fx = 20, fy = 20, fw = 200, fh = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(fx, fy, fw, fh);
  const ratio = STATE.fuel / CONFIG.FUEL_MAX;
  ctx.fillStyle = ratio > 0.3 ? '#33cc66' : (ratio > 0.15 ? '#ffcc33' : '#cc3333');
  ctx.fillRect(fx, fy, fw * ratio, fh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText('FUEL', fx + 4, fy + 14);

  // 距离/速度/时间（右上）
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9fe';
  ctx.font = '16px monospace';
  ctx.fillText('距离 ' + Math.floor(STATE.distance) + ' m', STATE.width - 16, 24);
  ctx.fillText('速度 ' + STATE.speed.toFixed(1), STATE.width - 16, 44);
  ctx.fillText('用时 ' + STATE.elapsed.toFixed(1) + ' s', STATE.width - 16, 64);
  ctx.fillText('最佳 ' + Math.floor(STATE.best) + ' m', STATE.width - 16, 84);
  ctx.textAlign = 'left';
}

function renderMenu(ctx) {
  // 半透明遮罩
  ctx.fillStyle = 'rgba(5,5,20,0.55)';
  ctx.fillRect(0, 0, STATE.width, STATE.height);
  const cx = STATE.width / 2, cy = STATE.height / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7fdfff';
  ctx.font = 'bold 64px monospace';
  ctx.fillText('太空跳跳车', cx, cy - 60);
  ctx.font = '24px monospace';
  ctx.fillStyle = '#aef';
  ctx.fillText('SKYROADS', cx, cy - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '20px monospace';
  ctx.fillText('按 空格 开始', cx, cy + 40);
  ctx.fillStyle = '#89a';
  ctx.font = '14px monospace';
  ctx.fillText('← → 变道    空格 跳跃', cx, cy + 80);
  if (STATE.best > 0) {
    ctx.fillText('最佳记录: ' + Math.floor(STATE.best) + ' m', cx, cy + 110);
  }
  ctx.textAlign = 'left';
}

function renderGameOver(ctx) {
  ctx.fillStyle = 'rgba(40,0,0,0.55)';
  ctx.fillRect(0, 0, STATE.width, STATE.height);
  const cx = STATE.width / 2, cy = STATE.height / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6677';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('GAME OVER', cx, cy - 70);

  const reasons = { wall: '撞上障碍物', gap: '坠入虚空', fuel: '燃料耗尽' };
  ctx.fillStyle = '#fcc';
  ctx.font = '22px monospace';
  ctx.fillText(reasons[STATE.deathReason] || '坠毁', cx, cy - 30);

  ctx.fillStyle = '#fff';
  ctx.font = '22px monospace';
  ctx.fillText('距离 ' + Math.floor(STATE.distance) + ' m', cx, cy + 10);
  ctx.fillText('用时 ' + STATE.elapsed.toFixed(1) + ' s', cx, cy + 40);
  ctx.fillStyle = STATE.distance >= STATE.best ? '#ffcc33' : '#9fe';
  ctx.fillText('最佳 ' + Math.floor(STATE.best) + ' m' + (STATE.distance >= STATE.best ? '  ★ 新纪录!' : ''), cx, cy + 70);

  ctx.fillStyle = '#aef';
  ctx.font = '18px monospace';
  ctx.fillText('按 空格 重新开始    按 Esc 回主菜单', cx, cy + 120);
  ctx.textAlign = 'left';
}
```

- [ ] **Step 2: 在 render() 中按状态调用 UI**

将 render 函数更新为：

```javascript
function render() {
  const ctx = STATE.ctx;
  renderBackground(ctx);
  renderTrack(ctx);
  renderPlayer(ctx);
  if (STATE.mode === 'PLAYING') renderHUD(ctx);
  if (STATE.mode === 'MENU') renderMenu(ctx);
  if (STATE.mode === 'GAMEOVER') renderGameOver(ctx);
}
```

（移除 FPS 调试行，或保留为可选）。

- [ ] **Step 3: 浏览器验证**

刷新页面。

**验证标准:**
1. MENU 屏：半透明遮罩 + "太空跳跳车 SKYROADS" 标题 + "按 空格 开始" + 操作说明。
2. 按空格进入游戏后，左上有绿/黄/红燃料条，右上有距离/速度/用时/最佳。
3. 撞死后进入 GAMEOVER 屏：红色遮罩 + 死亡原因（撞墙/坠落/燃料）+ 成绩 + 最佳（破纪录有金色 ★）。
4. 跑一局，捡 FUEL，燃料条应增长。
5. 重开后所有数值重置。

- [ ] **Step 4: 提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add index.html
git commit -m "feat: UI - HUD(燃料/速度/距离) + 菜单屏 + GameOver 屏

- 燃料条随余量变色（绿/黄/红）
- 菜单标题与操作提示
- GameOver 显示死因/成绩/最佳记录（破纪录标记）"
```

---

## Task 10: README + 最终验证 + 收尾提交

**Files:**
- Create: `README.md`
- Modify: `index.html`（可选小打磨）

**目标:** 写一份简洁的 README 说明玩法和运行方式；做一次完整的端到端验证，确认 spec 的所有成功标准达成；最终提交。

- [ ] **Step 1: 创建 README.md**

```markdown
# 太空跳跳车 SkyRoads

一款致敬经典 SkyRoads 的太空跑酷网页游戏。单文件 HTML，浏览器打开即玩。

## 运行

直接用浏览器打开 `index.html` 即可。

或用本地服务器（推荐，避免 file:// 限制）：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000/
```

## 玩法

- **目标**: 在无限延伸的太空跑道上尽可能跑远。
- **操作**:
  - `←/→` 或 `A/D`: 左右变道（3 条车道）
  - `空格` / `W` / `↑`: 跳跃（跨过缺口）
  - `空格` / `Enter`: 开始 / 重开
  - `Esc`: 回主菜单
- **死亡条件**:
  - 坠入虚空（缺口未跳跃）
  - 撞上障碍物（红色方块）
  - 燃料耗尽
- **燃料**: 跑道上的青绿色胶囊可补充燃料。
- **记录**: 最佳距离自动保存到浏览器本地存储。

## 技术栈

原生 HTML5 Canvas 2D + JavaScript。零依赖、零构建。

## 设计文档

见 `docs/superpowers/specs/`。
```

- [ ] **Step 2: 端到端验证（对照 spec 成功标准）**

在浏览器中完整跑一遍，逐项确认：

1. ✅ 浏览器打开 `index.html` 即可游玩，无需安装任何依赖。
2. ✅ 三种死亡条件（掉落/撞墙/燃料耗尽）都能正确触发并进入 Game Over。
3. ✅ 伪 3D 渲染流畅（目标 60 FPS），有明显的太空纵深感。
4. ✅ 赛道无限生成且永远可解（不会出现必死组合）—— 通过多次长跑验证。
5. ✅ 燃料、距离、最佳记录系统正常工作（破纪录显示 ★）。
6. ✅ 键盘操作响应灵敏，跳跃和变道手感自然。

如发现问题，回退到对应任务修复。

- [ ] **Step 3: 最终提交**

```bash
cd /Users/stan/Developer/Local/SkyRoads
git add README.md index.html
git commit -m "docs: README + v1 完成

太空跳跳车 SkyRoads v1 上线：
- 伪 3D 第一人称太空跑酷
- 三种死亡条件 + 燃料系统 + 最佳记录
- 单文件 HTML 零依赖"
```

---

## Self-Review 自检结果

**1. Spec 覆盖:**
- ✅ 单文件 HTML + Canvas + 原生 JS → Task 1
- ✅ 第一人称伪 3D 透视投影 → Task 4
- ✅ 操作（变道/跳跃/自动加速）→ Task 6
- ✅ 三种死亡条件 → Task 7
- ✅ 燃料系统（消耗/拾取）→ Task 7 + HUD Task 9
- ✅ 计分/最佳记录 localStorage → Task 7 die() + HUD Task 9
- ✅ 赛道程序化生成 + 可解性约束 → Task 3
- ✅ 背景星空太空氛围 → Task 2
- ✅ 状态机 MENU/PLAYING/GAMEOVER → Task 8
- ✅ 不做项（无音效/无触屏/无换挡/无分段）→ 全程未引入

**2. Placeholder 扫描:** 无 TODO/TBD，每个代码步骤都有完整可运行代码。

**3. 类型一致性检查:**
- `STATE.lane/laneFrom/laneTo/laneT` 在 Task 1 定义，Task 5/6/7 一致使用
- `LANE_TYPE.ROAD/GAP/WALL/FUEL` 在 Task 3 定义，Task 4/7 一致
- `project(worldX, worldY, zRel)` 签名 Task 4 定义，renderBlock 一致调用
- `segment = {index, lanes}` 结构 Task 3 定义，全程一致
- `CONFIG.SEGMENT_LENGTH/ROAD_WIDTH/LANES/CAMERA_HEIGHT` Task 1 定义，Task 4/5 一致

无矛盾。

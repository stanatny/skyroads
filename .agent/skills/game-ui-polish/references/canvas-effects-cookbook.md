# Canvas 特效代码模式速查（提炼自太空跳跳车多轮实战迭代）

所有模式均为 Canvas 2D + 原生 JS，零依赖，可直接改名套用。坐标约定：船体系以船体中心为原点，`W2`=半船宽、`H`=船高，尺寸一律用 `H` 的倍数表达，保证缩放自适应。

## 目录

1. [粒子爆发（命中爆花 / 建筑大爆花）](#1-粒子爆发)
2. [冲击波扩散环](#2-冲击波扩散环)
3. [增益光环（radial gradient 脉冲 + 预警期高频闪烁）](#3-增益光环)
4. [屏幕边缘预警光晕（四边渐变、宽度随剩余时间收缩）](#4-屏幕边缘预警光晕)
5. [蓄力能量场（能量球 + 白芯 + 电弧 + 满蓄金环）](#5-蓄力能量场)
6. [磁铁吸附飞行实体](#6-磁铁吸附飞行实体)
7. [船体装甲细节（渐变/刻线/铆钉/航行灯/流动虚线饰条）](#7-船体装甲细节)
8. [透视偏转（yaw + 剪切随车道偏移）](#8-透视偏转)
9. [程序化音效基元（sweep / 噪声 / 持续轰鸣）](#9-程序化音效基元)

---

## 1. 粒子爆发

要点：粒子是**短寿命实体，允许随机**；生成时用投影函数把世界坐标换成屏幕坐标；`life/maxLife` 驱动透明度衰减。

```js
// 命中点爆花（index.html shotBurstFx）
function burstFx(lane, segF, height, big) {
  const p = project(laneCenterX(lane), height, zRel);   // 世界→屏幕
  if (!p.visible) return;
  const n = big ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * (big ? 260 : 140);
    STATE.particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,    // -60 给一点上飘
      life: 0.3 + Math.random() * 0.3, maxLife: 0.6,
      color: Math.random() < 0.5 ? '#ffb060' : '#ffe9c0',
      size: 1.5 + Math.random() * 2.5,
    });
  }
}
```

升级版（建筑摧毁）：22 颗粒子，40% 是"长条碎片"——带 `shard/ang/spin/len` 字段，渲染时 `translate+rotate+fillRect` 画翻滚长条，配色混入装甲深灰 `#3a3f52` 与能量红 `#ff4d5e`，并附 `STATE.shake = Math.max(STATE.shake, 0.22)` 轻微震屏。

渲染循环通用写法：

```js
for (const pt of STATE.particles) {
  ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
  ctx.fillStyle = pt.color;
  ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
}
ctx.globalAlpha = 1;
```

## 2. 冲击波扩散环

状态里存一个对象，update 扩散、render 画环，alpha 耗尽即销毁。用 `gold` 标志复用同一套代码服务两种语义（金=变身 / 桃=死亡）。

```js
// 触发：STATE.shockwave = { x, y, r: 6, alpha: 0.9, gold: true };
// update：
STATE.shockwave.r += 720 * dt;
STATE.shockwave.alpha -= dt * 1.4;
if (STATE.shockwave.alpha <= 0) STATE.shockwave = null;
// render：
ctx.globalAlpha = Math.max(0, STATE.shockwave.alpha);
ctx.strokeStyle = STATE.shockwave.gold ? '#ffe9a0' : '#ffd9c0';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.arc(STATE.shockwave.x, STATE.shockwave.y, STATE.shockwave.r, 0, Math.PI * 2);
ctx.stroke();
ctx.globalAlpha = 1;
```

## 3. 增益光环

船体外罩一层 radial gradient 光罩。常态低频脉冲（time×6~8）；**进入到期预警后，频率拉高一档并与屏幕边缘光晕同频**——多通道同频闪烁是"快结束了"的最强信号。

```js
if (STATE.boostT > 0) {
  const fading = STATE.boostT < WARN_TIME
    ? (0.5 + 0.5 * Math.sin(STATE.time * 8))   // 预警期：急促闪烁
    : 1;
  const br = Math.max(W2, H) * 1.55;
  const g = ctx.createRadialGradient(0, 0, br * 0.3, 0, 0, br);
  g.addColorStop(0, 'rgba(160,240,255,0)');
  g.addColorStop(0.75, `rgba(120,230,255,${0.18 * fading})`);
  g.addColorStop(1, `rgba(120,230,255,${0.42 * fading})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill();
}
```

## 4. 屏幕边缘预警光晕

限时增益快到期时，屏幕四边出现脉冲光晕，**宽度随剩余时间收缩、透明度随剩余时间增强**。与船体光环、HUD 条闪烁同频（time×8），三处节奏对齐。

```js
if (STATE.boostT > 0 && STATE.boostT < WARN_TIME) {
  const f = STATE.boostT / WARN_TIME;                  // 1 → 0
  const pulse = 0.5 + 0.5 * Math.sin(STATE.time * 8);
  const a = (0.10 + 0.30 * (1 - f)) * pulse;           // 越接近到期越强
  const wE = (0.03 + 0.09 * f) * STATE.width;          // 宽度随剩余时间收缩
  // 左/右/上/下四条 linear gradient，从 rgba(120,230,255,a) 渐变到透明
  const lg = ctx.createLinearGradient(0, 0, wE, 0);
  lg.addColorStop(0, `rgba(120,230,255,${a.toFixed(3)})`);
  lg.addColorStop(1, 'rgba(120,230,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, wE, STATE.height);
  // …右/上/下同理（右：从 width-wE 起；上/下用纵向渐变）
}
```

配套音效：最后 3 秒分档 beep（3/2/1s 三档音调渐高），用 `stage` 计数防同一秒重发。

## 5. 蓄力能量场

反面教材的修正：第一版蓄力效果太浅，用户"频繁点击时 HUD 槽忽隐忽现、船上看不出蓄力"。修正后——**HUD 槽常驻**；船上能量球随进度显著长大，分四档递进，不看 HUD 也能感知。

```js
if (STATE.chargeT > 0) {
  const cf = Math.min(1, STATE.chargeT / CHARGE_TIME);
  const full = cf >= 1;
  const cxE = 0, cyE = noseY * 0.55;                       // 机头前方
  // ① 能量球：0.35H → 1.2H，满蓄时叠加 time×12 呼吸
  const cr = (0.35 + 0.85 * cf) * H * (full ? (1 + 0.15 * Math.sin(STATE.time * 12)) : 1);
  const cg = ctx.createRadialGradient(cxE, cyE, 0, cxE, cyE, cr);
  if (full) { cg.addColorStop(0, 'rgba(255,244,200,0.95)'); cg.addColorStop(0.45, 'rgba(255,205,95,0.65)'); }
  else      { cg.addColorStop(0, `rgba(255,190,110,${0.45 + 0.40 * cf})`); cg.addColorStop(0.45, `rgba(255,140,46,${0.35 * cf})`); }
  cg.addColorStop(1, 'rgba(255,140,46,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cxE, cyE, cr, 0, Math.PI * 2); ctx.fill();
  // ② 白亮核心（>30% 出现，越满越亮）
  if (cf > 0.3) { /* 白色小圆 alpha = 0.35 + 0.6*cf，半径 cr*0.18 */ }
  // ③ 折线电弧（>40%：3 条火花向外跳，两点间插一个抖动中点；短寿命随机允许）
  if (cf > 0.4) {
    for (let k = 0; k < 3; k++) {
      const a0 = Math.random() * Math.PI * 2;
      // moveTo(cos(a0)*r0) → lineTo(中点偏移) → lineTo(外端) → stroke
    }
  }
  // ④ 满蓄：金色旋转虚线环（setLineDash + lineDashOffset 随 time 流动）
  if (full) {
    ctx.setLineDash([0.05 * H, 0.04 * H]);
    ctx.lineDashOffset = -STATE.time * 0.5 * H;
    ctx.strokeStyle = `rgba(255,236,170,${0.7 + 0.3 * Math.sin(STATE.time * 12)})`;
    ctx.beginPath(); ctx.arc(cxE, cyE, cr * 1.15, 0, Math.PI * 2); ctx.stroke();
  }
}
```

音效配套：1s/2s tick 渐高 + 满蓄双音 ding（见 §9 `sfxChargeReady`）。

## 6. 磁铁吸附飞行实体

反面教材的修正：只在原地冒粒子，用户看不出"吸过来"。修正后——拾取瞬间把被吸物的**屏幕坐标**记为飞行实体，update 里指数趋近船体，渲染成带光晕的晶体，0.35s 消亡。过程肉眼可见，吸附感才成立。

```js
// 拾取时：STATE.magnetPulls.push({ x: fp.x, y: fp.y, t: 0, dur: 0.35 });  // fp = 被吸物当前屏幕位置
// update（指数趋近 + 线性计时兜底）：
const tp = project(playerWorldX(), STATE.playerY, CAMERA_BACK);   // 船体屏幕位置
for (const pl of STATE.magnetPulls) {
  pl.t += dt / pl.dur;
  const k = Math.min(1, pl.t);
  pl.x += (tp.x - pl.x) * (0.12 + 0.5 * k);   // 越接近目标收敛越快
  pl.y += (tp.y - pl.y) * (0.12 + 0.5 * k);
}
STATE.magnetPulls = STATE.magnetPulls.filter(pl => pl.t < 1);
// render（青色菱形 + radial 光晕）：
for (const pl of STATE.magnetPulls) {
  ctx.globalAlpha = Math.max(0, 1 - pl.t * 0.3);
  const mg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, 14);
  mg.addColorStop(0, 'rgba(160,240,255,0.85)');
  mg.addColorStop(1, 'rgba(160,240,255,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(pl.x, pl.y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bdf3ff';   // 菱形本体：上下 6px、左右 4.5px 四点连线
  // moveTo(x, y-6) → lineTo(x+4.5, y) → lineTo(x, y+6) → lineTo(x-4.5, y) → fill
}
ctx.globalAlpha = 1;
```

## 7. 船体装甲细节

摆脱"简笔画玩具感"的五件套，全部确定性驱动：

```js
// ① 金属渐变：纵向（机翼）或横向（装甲板）三段色，亮→中→暗
const wingG = ctx.createLinearGradient(0, noseY, 0, 0.30 * H);
wingG.addColorStop(0, '#3c445f'); wingG.addColorStop(0.6, '#252b40'); wingG.addColorStop(1, '#161b2c');

// ② 面板刻线：暗色细线（rgba(10,14,26,0.6)），自机头向后缘发散，2 条/侧
ctx.strokeStyle = 'rgba(10,14,26,0.6)';
ctx.lineWidth = Math.max(1, 0.012 * H);

// ③ 铆钉：沿前缘确定性均布（k/5 插值），禁止随机
ctx.fillStyle = '#aab4cf';
for (const s of [-1, 1]) for (let k = 1; k <= 4; k++) {
  const f = k / 5;
  ctx.beginPath();
  ctx.arc(s * f * W2 * 0.96, noseY + (0.18 * H - noseY) * f, Math.max(1, 0.012 * H), 0, Math.PI * 2);
  ctx.fill();
}

// ④ 翼尖航行灯：左红右绿，错相闪烁（一个 sin、一个 1-sin）
const nav = 0.5 + 0.5 * Math.sin(STATE.time * 5);
// 左：rgba(255,70,70, 0.4+0.6*nav)；右：rgba(90,255,140, 0.4+0.6*(1-nav))

// ⑤ 流动能量饰条：setLineDash + lineDashOffset 随 time 平移 → "能量在管内流动"
ctx.setLineDash([0.07 * H, 0.05 * H]);
ctx.lineDashOffset = -STATE.time * 0.45 * H;
ctx.strokeStyle = 'rgba(90,240,255,0.85)';
// 用完记得 ctx.restore() 或 setLineDash([])，避免污染后续描边
```

另：双层装甲板（下暗上亮两块多边形错位叠放）能叠出装甲厚度；二段跳瞬间用 `sin(recoil*π)` 半波包络做船体下沉回弹的后坐动感。

## 8. 透视偏转

问题：赛道有近大远小的透视，飞船却永远正面同比例 → 违和。修法：按车道偏移给船体加 yaw 旋转 + 水平剪切，变道插值期间平滑过渡。**只改渲染，判定仍用车道号**，符合"所见即所判"（判定本就是离散车道）。

```js
const laneFNow = STATE.laneFrom + (STATE.laneTo - STATE.laneFrom) * STATE.laneT;
const laneOff = laneFNow - (CONFIG.LANES - 1) / 2;      // 7 车道 → ±3
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(bank - laneOff * 0.045);                     // 每车道 ≈2.6°，边缘 ≈8°
ctx.transform(1, 0, laneOff * 0.030, 1, 0, 0);          // 剪切：x 随 y 偏移，配合地面倾斜感
// …画船体…
ctx.restore();
```

## 9. 程序化音效基元

Web Audio 零音频文件。两个基元函数 + 组合配方：

```js
// 基元① 滑音（跳跃/充能/叮声）：指数扫频 + 快速起音 + 指数淡出
function sfxSweep(f0, f1, dur, type, vol, delay) {
  const t0 = AUDIO.ctx.currentTime + (delay || 0);
  const osc = AUDIO.ctx.createOscillator();
  const g = AUDIO.ctx.createGain();
  osc.type = type;                                              // square/triangle/sine/sawtooth
  osc.frequency.setValueAtTime(Math.max(1, f0), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);              // 15ms 起音防爆音
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(AUDIO.master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

// 基元② 噪声（爆炸/喷火）：共享噪声缓冲 + 低通滤波
let noiseBuffer = null;
function sfxNoise(dur, vol, lowpass) {
  if (!noiseBuffer) { /* 生成 0.5s 白噪声缓冲，全局复用 */ }
  const src = AUDIO.ctx.createBufferSource(); src.buffer = noiseBuffer;
  const flt = AUDIO.ctx.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.value = lowpass;          // 越低越闷（爆炸 900~1500，电流 5200）
  // gain: setValueAtTime(vol) → exponentialRamp(0.001, t0+dur)
}
```

实战配方（注释为语义）：

| 事件 | 配方 |
|---|---|
| 跳跃 | `sfxSweep(300, 620, 0.14, 'square', 0.16)` 上扬 |
| 二段跳 | `sfxSweep(420, 980, …)` + 0.04s 延迟 `sfxSweep(840, 1560, …)` 更高扬尾音 |
| 死亡 | `sfxNoise(0.5, 0.35, 900)` + `sfxSweep(160, 38, 0.5, 'sine', 0.30)` 低频轰 |
| 变身 | `sfxSweep(220, 1400, 0.45, 'sawtooth', …)` 充能 + 噪声迸发 + 三音收尾（660/880/1320 依次 delay） |
| 变身结束 | `sfxSweep(880, 160, 0.45, 'sawtooth', …)` 下行熄火——"恢复"必须有声音 |
| 满蓄 ding | `sfxSweep(990, 990, 0.09, 'square', 0.16)` + 0.08s 后 `(1480, 1480, 0.14)` |

**持续轰鸣（滑翔喷火）的教训**：火焰/气流声**不要用振荡器**——锯齿波/方波的谐波会听成"电子蜂鸣/系统报错"。正解是纯噪声低通 + 双层 LFO 调制滤波频率：

```js
// syncGlideAudio：滑翔中启动，松键/油尽/死亡即停
const src = AUDIO.ctx.createBufferSource();
src.buffer = noiseBuffer;          // 注意：持续音用 2 秒长缓冲，短循环会有周期脉冲感（"滴滴滴"）
src.loop = true;
const flt = AUDIO.ctx.createBiquadFilter();
flt.type = 'lowpass'; flt.frequency.value = 360; flt.Q.value = 0.4;
// 双层 LFO：1.1Hz(±90Hz) + 3.7Hz，无公倍数 → 叠加出不重复的气流涌动
const lfo = AUDIO.ctx.createOscillator(); lfo.frequency.value = 1.1;
const lfoGain = AUDIO.ctx.createGain(); lfoGain.gain.value = 90;
lfo.connect(lfoGain); lfoGain.connect(flt.frequency);
// lfo2 = 3.7Hz 同理
```

**macOS 按键杂音**：按住键时系统会发"滴滴滴"提示音，对全部游戏键位 `e.preventDefault()` 消除。

---

以上每段都标注了语义与反面教训。套用时先改配色进入项目的视觉语义表，再调尺寸系数。

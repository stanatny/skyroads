# Canvas Effects Cookbook (distilled from real SkyRoads iteration rounds)

All patterns are Canvas 2D + vanilla JS, zero dependencies, ready to rename and adapt. Coordinate convention: ship-local space with the hull center as origin; `W2` = half ship width, `H` = ship height. All sizes are expressed as multiples of `H` so everything scales.

## Contents

1. [Particle bursts (hit sparks / building explosion)](#1-particle-bursts)
2. [Shockwave ring](#2-shockwave-ring)
3. [Buff aura (radial-gradient pulse + high-frequency warning blink)](#3-buff-aura)
4. [Screen-edge warning glow (four gradients, width shrinks as time runs out)](#4-screen-edge-warning-glow)
5. [Charge energy field (energy ball + white core + arcs + full-charge gold ring)](#5-charge-energy-field)
6. [Magnet-pull flight entities](#6-magnet-pull-flight-entities)
7. [Ship armor detailing (gradients / seams / rivets / nav lights / flowing dashed trims)](#7-ship-armor-detailing)
8. [Perspective deflection (yaw + shear by lane offset)](#8-perspective-deflection)
9. [Procedural audio primitives (sweep / noise / sustained rumble)](#9-procedural-audio-primitives)

---

## 1. Particle bursts

Key points: particles are **short-lived entities and may randomize**; convert world coordinates to screen coordinates with the projection function at spawn time; `life/maxLife` drives the alpha fade.

```js
// Hit-point sparks (from index.html shotBurstFx)
function burstFx(lane, segF, height, big) {
  const p = project(laneCenterX(lane), height, zRel);   // world → screen
  if (!p.visible) return;
  const n = big ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * (big ? 260 : 140);
    STATE.particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,    // -60 adds a slight upward drift
      life: 0.3 + Math.random() * 0.3, maxLife: 0.6,
      color: Math.random() < 0.5 ? '#ffb060' : '#ffe9c0',
      size: 1.5 + Math.random() * 2.5,
    });
  }
}
```

Upgraded variant (building destruction): 22 particles, 40% are "shard strips" — carry `shard/ang/spin/len` fields and render with `translate+rotate+fillRect` as tumbling strips; mix armor dark gray `#3a3f52` and energy red `#ff4d5e` into the palette, plus `STATE.shake = Math.max(STATE.shake, 0.22)` for a light screen shake.

Generic render loop:

```js
for (const pt of STATE.particles) {
  ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
  ctx.fillStyle = pt.color;
  ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
}
ctx.globalAlpha = 1;
```

## 2. Shockwave ring

Store one object in state; update expands it, render strokes the ring, despawn when alpha runs out. A `gold` flag lets one code path serve two semantics (gold = transformation / peach = death).

```js
// Trigger: STATE.shockwave = { x, y, r: 6, alpha: 0.9, gold: true };
// update:
STATE.shockwave.r += 720 * dt;
STATE.shockwave.alpha -= dt * 1.4;
if (STATE.shockwave.alpha <= 0) STATE.shockwave = null;
// render:
ctx.globalAlpha = Math.max(0, STATE.shockwave.alpha);
ctx.strokeStyle = STATE.shockwave.gold ? '#ffe9a0' : '#ffd9c0';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.arc(STATE.shockwave.x, STATE.shockwave.y, STATE.shockwave.r, 0, Math.PI * 2);
ctx.stroke();
ctx.globalAlpha = 1;
```

## 3. Buff aura

A radial-gradient dome over the ship. Normal state pulses slowly (time×6~8); **in the expiry-warning window, raise the frequency one notch and sync it with the screen-edge glow** — multi-channel blinking at the same frequency is the strongest "about to end" signal.

```js
if (STATE.boostT > 0) {
  const fading = STATE.boostT < WARN_TIME
    ? (0.5 + 0.5 * Math.sin(STATE.time * 8))   // warning window: rapid blink
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

## 4. Screen-edge warning glow

When a timed buff nears expiry, a pulsing glow appears on all four screen edges — **its width shrinks as time runs out while its alpha grows**. Keep it in sync (time×8) with the hull aura and HUD bar blink so all three beat together.

```js
if (STATE.boostT > 0 && STATE.boostT < WARN_TIME) {
  const f = STATE.boostT / WARN_TIME;                  // 1 → 0
  const pulse = 0.5 + 0.5 * Math.sin(STATE.time * 8);
  const a = (0.10 + 0.30 * (1 - f)) * pulse;           // stronger near expiry
  const wE = (0.03 + 0.09 * f) * STATE.width;          // width shrinks with time left
  // Four linear gradients (left/right/top/bottom), rgba(120,230,255,a) → transparent
  const lg = ctx.createLinearGradient(0, 0, wE, 0);
  lg.addColorStop(0, `rgba(120,230,255,${a.toFixed(3)})`);
  lg.addColorStop(1, 'rgba(120,230,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, wE, STATE.height);
  // …right/top/bottom follow the same pattern (right starts at width-wE;
  // top/bottom use vertical gradients)
}
```

Paired audio: tiered beeps over the last 3 seconds (3/2/1 s tiers, pitch rising), with a `stage` counter so the same tier never fires twice.

## 5. Charge energy field

Fix for a real anti-pattern: the first version was too subtle — "the HUD meter flickers in and out with rapid clicks, and you can't see the charge on the ship". The fix: **the HUD meter stays visible permanently**; the on-ship energy ball grows dramatically with progress, in four tiers, readable without glancing at the HUD.

```js
if (STATE.chargeT > 0) {
  const cf = Math.min(1, STATE.chargeT / CHARGE_TIME);
  const full = cf >= 1;
  const cxE = 0, cyE = noseY * 0.55;                       // ahead of the nose
  // ① Energy ball: 0.35H → 1.2H, plus a time×12 breathing pulse when full
  const cr = (0.35 + 0.85 * cf) * H * (full ? (1 + 0.15 * Math.sin(STATE.time * 12)) : 1);
  const cg = ctx.createRadialGradient(cxE, cyE, 0, cxE, cyE, cr);
  if (full) { cg.addColorStop(0, 'rgba(255,244,200,0.95)'); cg.addColorStop(0.45, 'rgba(255,205,95,0.65)'); }
  else      { cg.addColorStop(0, `rgba(255,190,110,${0.45 + 0.40 * cf})`); cg.addColorStop(0.45, `rgba(255,140,46,${0.35 * cf})`); }
  cg.addColorStop(1, 'rgba(255,140,46,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cxE, cyE, cr, 0, Math.PI * 2); ctx.fill();
  // ② White-hot core (appears past 30%, brighter and larger as charge grows)
  if (cf > 0.3) { /* small white circle, alpha = 0.35 + 0.6*cf, radius cr*0.18 */ }
  // ③ Zigzag arcs (past 40%: 3 sparks leaping outward, midpoint jittered; short-lived random OK)
  if (cf > 0.4) {
    for (let k = 0; k < 3; k++) {
      const a0 = Math.random() * Math.PI * 2;
      // moveTo(cos(a0)*r0) → lineTo(jittered midpoint) → lineTo(outer end) → stroke
    }
  }
  // ④ Full charge: rotating dashed gold ring (setLineDash + lineDashOffset flowing with time)
  if (full) {
    ctx.setLineDash([0.05 * H, 0.04 * H]);
    ctx.lineDashOffset = -STATE.time * 0.5 * H;
    ctx.strokeStyle = `rgba(255,236,170,${0.7 + 0.3 * Math.sin(STATE.time * 12)})`;
    ctx.beginPath(); ctx.arc(cxE, cyE, cr * 1.15, 0, Math.PI * 2); ctx.stroke();
  }
}
```

Paired audio: 1 s / 2 s rising ticks + a full-charge two-tone ding (see `sfxChargeReady` in §9).

## 6. Magnet-pull flight entities

Fix for a real anti-pattern: particles puffing in place don't read as "sucked toward you". The fix: on pickup, record the item's **screen coordinates** as a flight entity; update exponentially eases it toward the hull; render it as a glowing crystal; despawn after 0.35 s. The visible flight is what sells the attraction.

```js
// On pickup: STATE.magnetPulls.push({ x: fp.x, y: fp.y, t: 0, dur: 0.35 });  // fp = item's current screen pos
// update (exponential easing + linear timer as backstop):
const tp = project(playerWorldX(), STATE.playerY, CAMERA_BACK);   // hull screen position
for (const pl of STATE.magnetPulls) {
  pl.t += dt / pl.dur;
  const k = Math.min(1, pl.t);
  pl.x += (tp.x - pl.x) * (0.12 + 0.5 * k);   // converges faster as it nears the target
  pl.y += (tp.y - pl.y) * (0.12 + 0.5 * k);
}
STATE.magnetPulls = STATE.magnetPulls.filter(pl => pl.t < 1);
// render (cyan diamond + radial glow):
for (const pl of STATE.magnetPulls) {
  ctx.globalAlpha = Math.max(0, 1 - pl.t * 0.3);
  const mg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, 14);
  mg.addColorStop(0, 'rgba(160,240,255,0.85)');
  mg.addColorStop(1, 'rgba(160,240,255,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(pl.x, pl.y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bdf3ff';   // diamond body: four points, ±6px vertical, ±4.5px horizontal
  // moveTo(x, y-6) → lineTo(x+4.5, y) → lineTo(x, y+6) → lineTo(x-4.5, y) → fill
}
ctx.globalAlpha = 1;
```

## 7. Ship armor detailing

The five-piece set that kills the "stick-figure toy" look — all deterministically driven:

```js
// ① Metal gradients: vertical (wings) or horizontal (armor plates), three stops, light→mid→dark
const wingG = ctx.createLinearGradient(0, noseY, 0, 0.30 * H);
wingG.addColorStop(0, '#3c445f'); wingG.addColorStop(0.6, '#252b40'); wingG.addColorStop(1, '#161b2c');

// ② Panel seams: dark thin lines (rgba(10,14,26,0.6)) fanning from nose toward trailing edge, 2 per side
ctx.strokeStyle = 'rgba(10,14,26,0.6)';
ctx.lineWidth = Math.max(1, 0.012 * H);

// ③ Rivets: deterministically distributed along the leading edge (k/5 interpolation), never random
ctx.fillStyle = '#aab4cf';
for (const s of [-1, 1]) for (let k = 1; k <= 4; k++) {
  const f = k / 5;
  ctx.beginPath();
  ctx.arc(s * f * W2 * 0.96, noseY + (0.18 * H - noseY) * f, Math.max(1, 0.012 * H), 0, Math.PI * 2);
  ctx.fill();
}

// ④ Wingtip navigation lights: red left, green right, anti-phase blinking (one sin, one 1-sin)
const nav = 0.5 + 0.5 * Math.sin(STATE.time * 5);
// left: rgba(255,70,70, 0.4+0.6*nav); right: rgba(90,255,140, 0.4+0.6*(1-nav))

// ⑤ Flowing energy trims: setLineDash + lineDashOffset sliding with time → "energy flowing in a tube"
ctx.setLineDash([0.07 * H, 0.05 * H]);
ctx.lineDashOffset = -STATE.time * 0.45 * H;
ctx.strokeStyle = 'rgba(90,240,255,0.85)';
// remember ctx.restore() or setLineDash([]) afterwards so later strokes aren't polluted
```

Extras: double-layer armor plates (two offset polygons, dark below and light above) stack into visible armor thickness; on double-jump, a `sin(recoil*π)` half-wave envelope dips and rebounds the hull for recoil.

## 8. Perspective deflection

Problem: the road has near-big-far-small perspective while the ship stays front-facing at constant scale → jarring. Fix: add yaw rotation + horizontal shear proportional to lane offset, smoothly interpolated during lane changes. **Rendering only — judgment still uses the discrete lane index**, honoring "what you see is what judges you" (judgment is lane-discrete anyway).

```js
const laneFNow = STATE.laneFrom + (STATE.laneTo - STATE.laneFrom) * STATE.laneT;
const laneOff = laneFNow - (CONFIG.LANES - 1) / 2;      // 7 lanes → ±3
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(bank - laneOff * 0.045);                     // ≈2.6° per lane, ≈8° at the edge
ctx.transform(1, 0, laneOff * 0.030, 1, 0, 0);          // shear: x shifts with y, matching road tilt
// …draw the ship…
ctx.restore();
```

## 9. Procedural audio primitives

Web Audio, zero audio files. Two primitive functions plus composed recipes:

```js
// Primitive ① Sweep (jumps/charges/dings): exponential frequency ramp + fast attack + exponential release
function sfxSweep(f0, f1, dur, type, vol, delay) {
  const t0 = AUDIO.ctx.currentTime + (delay || 0);
  const osc = AUDIO.ctx.createOscillator();
  const g = AUDIO.ctx.createGain();
  osc.type = type;                                              // square/triangle/sine/sawtooth
  osc.frequency.setValueAtTime(Math.max(1, f0), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);              // 15 ms attack prevents clicks
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(AUDIO.master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

// Primitive ② Noise (explosions/thrusters): shared noise buffer + lowpass filter
let noiseBuffer = null;
function sfxNoise(dur, vol, lowpass) {
  if (!noiseBuffer) { /* fill a 0.5 s white-noise buffer once, reuse globally */ }
  const src = AUDIO.ctx.createBufferSource(); src.buffer = noiseBuffer;
  const flt = AUDIO.ctx.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.value = lowpass;          // lower = duller (explosion 900~1500, zap 5200)
  // gain: setValueAtTime(vol) → exponentialRamp(0.001, t0+dur)
}
```

Battle-tested recipes (comments give the semantics):

| Event | Recipe |
|---|---|
| Jump | `sfxSweep(300, 620, 0.14, 'square', 0.16)` rising |
| Double jump | `sfxSweep(420, 980, …)` + delayed `sfxSweep(840, 1560, …)` at 0.04 s — higher rising tail |
| Death | `sfxNoise(0.5, 0.35, 900)` + `sfxSweep(160, 38, 0.5, 'sine', 0.30)` low thud |
| Transform | `sfxSweep(220, 1400, 0.45, 'sawtooth', …)` charge-up + noise burst + three-note finish (660/880/1320 with staggered delays) |
| Transform end | `sfxSweep(880, 160, 0.45, 'sawtooth', …)` descending power-down — "back to normal" must be audible |
| Full-charge ding | `sfxSweep(990, 990, 0.09, 'square', 0.16)` + `(1480, 1480, 0.14)` 0.08 s later |

**Lesson on sustained rumbles (glide thruster)**: never use oscillators for flame/airflow sounds — sawtooth/square harmonics read as "electronic beeping / system error". The correct build is pure lowpassed noise + dual LFOs modulating the filter frequency:

```js
// syncGlideAudio: starts while gliding, stops on release / empty fuel / death
const src = AUDIO.ctx.createBufferSource();
src.buffer = noiseBuffer;          // note: use a 2-second buffer for sustained loops; short loops pulse audibly (the "beep-beep" artifact)
src.loop = true;
const flt = AUDIO.ctx.createBiquadFilter();
flt.type = 'lowpass'; flt.frequency.value = 360; flt.Q.value = 0.4;
// Dual LFOs: 1.1 Hz (±90 Hz) + 3.7 Hz — no common multiple → non-repeating airflow surging
const lfo = AUDIO.ctx.createOscillator(); lfo.frequency.value = 1.1;
const lfoGain = AUDIO.ctx.createGain(); lfoGain.gain.value = 90;
lfo.connect(lfoGain); lfoGain.connect(flt.frequency);
// lfo2 = 3.7 Hz, same pattern
```

**macOS key-hold noise**: holding a key triggers the system beep; call `e.preventDefault()` for every game key to silence it.

---

Every section carries its semantics and its anti-pattern lesson. When adapting: first remap colors into the project's visual-semantics table, then tune the size coefficients.

# Nebula Cruise Vector Thruster Feedback Design

## 1. Context

The current game already has the correct gameplay states:

- ordinary jump;
- fuel-consuming second jump;
- super-form third jump;
- hold-to-glide while descending;
- BOOST flight.

It also has partial feedback:

- second and third jumps both set `jumpBurst = 0.28`;
- both use the same central orange burst and the same `sfxDoubleJump()`;
- glide selects the thrust ship frame;
- glide already owns a procedural continuous low-pass-noise audio graph;
- ordinary and BOOST flight already draw twin engine flames and trail particles.

The missing piece is a coherent state language. The current glide rendering multiplies flame length by `0.5`, so sustained lift looks weaker than ordinary flight even though it continuously consumes fuel. The third jump is mechanically special but visually and sonically almost identical to the second jump.

The existing central jump burst and wing-mounted glide nozzles are also inside the procedural-hull fallback branch. They are absent when the preferred ship PNG loads. The replacement feedback must therefore live in a shared layer used by both loaded and fallback ship rendering.

The approved visual comparison uses the same real game projection, ship center, height, dimensions, and scene for all three states:

1. second jump — short orange/cyan twin ignition;
2. third jump — longer gold/cyan ignition with gold-white arcs;
3. glide — stable sustained cyan-white vector jets.

This specification changes feedback only. It does not change movement or challenge balance.

## 2. Player Outcome

Without reading the HUD, the player should understand:

- **second jump:** a second airborne engine ignition just occurred;
- **third jump:** the super-form bonus ignition just occurred;
- **glide:** the engines are continuously spending fuel to sustain descent;
- **release or fuel depletion:** sustained thrust has ended.

The visual and audio state must agree within the same simulation frame.

## 3. Goals

- Make second- and third-jump ignition visibly different.
- Make glide display continuous thrust for its complete active duration.
- Make glide audio start, sustain, and stop with the actual `STATE.gliding` lifecycle.
- Reuse the existing procedural Canvas and Web Audio architecture.
- Preserve the loaded ship image and procedural ship fallback.
- Preserve the player silhouette, projected center, lane position, and collision.
- Keep feedback legible with reduced motion enabled.
- Keep SFX mute, pause, blur, hidden-page, game-over, and menu transitions authoritative.
- Add no external asset or runtime dependency.
- Deliver a real-browser preview and screenshots before any commit or push.

## 4. Non-goals

- No change to `JUMP_VELOCITY`, `GRAVITY`, `MAX_JUMPS`, `DOUBLEJUMP_FUEL`, `GLIDE_GRAVITY_FACTOR`, `TRIPLE_GLIDE_FACTOR`, `GLIDE_DRAIN`, or fuel rules.
- No change to when a second jump, third jump, or glide is accepted.
- No new hover, dash, rocket, afterburner, or free-flight mechanic.
- No change to player collision, lane movement, speed, scoring, track generation, or obstacle clearance.
- No replacement ship PNG and no rerender of existing ship assets.
- No external sound file, audio package, or new license.
- No change to music stems or adaptive music mixing.
- No commit, push, PR update, merge, tag, or release before user acceptance.

## 5. Unified Thruster State

### 5.1 State vocabulary

The renderer and audio system consume the same state descriptor:

```text
ThrusterFeedback {
  mode: normal | double | triple | glide | boost
  burstProgress: 0...1
  sustained: boolean
  boostActive: boolean
  superPowered: boolean
  reducedMotion: boolean
}
```

Priority is:

```text
triple burst
double burst
boost
glide
normal
```

A burst may temporarily overlay sustained glide when the player triggers another permitted jump. The burst identity wins for its short ignition layer; the sustained glide layer resumes only when physics later returns to a descending glide state.

When BOOST and glide overlap, BOOST owns the visual jet length and trail density so it remains the strongest speed state. `sustained` remains true while `STATE.gliding` is true, so glide fuel/audio lifecycle remains coupled to physics even when the BOOST visual identity wins.

### 5.2 State storage

`STATE.jumpBurst` remains the remaining burst time.

Add:

```text
STATE.jumpBurstTier = 0 | 2 | 3
```

Rules:

- first jump leaves `jumpBurstTier = 0`;
- accepted second jump sets tier `2` and duration `0.30 s`;
- accepted super-form third jump sets tier `3` and duration `0.36 s`;
- rejected jump changes neither field;
- when `jumpBurst` reaches zero, tier resets to `0`;
- `resetGame()`, `gotoMenu()`, and `die()` clear both fields through one focused feedback reset;
- pause freezes an active burst with the Canvas frame and does not advance its timer;
- input cleanup stops glide/audio but does not invent or retrigger a burst.

The tier is visual/audio state only and does not affect physics.

## 6. Visual Contract

### 6.1 Shared geometry

Every thruster layer uses the existing projected player point and ship layout:

```text
playerPoint = project(playerWorldX(), STATE.playerY, CAMERA_BACK)
shipLayout = presentation.fallbackShipLayout(
  viewportWidth,
  viewportHeight,
  playerPoint.x,
  playerPoint.y
)
```

Thruster geometry is relative to the transformed ship coordinate system already used by `renderPlayer`.

The two engine centers remain:

```text
engineX = ±0.42 * halfWidth
engineY = 0.19 * shipHeight
```

No thruster layer may translate the ship, alter its draw rectangle, or change collision.

### 6.2 Layer order

Within the transformed player coordinate system:

1. sustained jet glow and long exhaust;
2. ship image or procedural hull;
3. short jump-burst core and ignition arcs;
4. existing charge, BOOST, and super-form overlays;
5. navigation lights and foreground details.

The sustained exhaust begins behind the hull. The short ignition core may overlap the nozzle area but must not cover the cockpit or wing silhouette.

The shared sustained and burst helpers execute outside the `shipFrame` versus procedural-hull branch. The retired central burst and wing-mounted glide flames are removed from the procedural branch so fallback art does not draw duplicate feedback.

### 6.3 Second jump

Second-jump ignition lasts exactly `0.30 s`.

It draws two nozzle-aligned jets:

- outer orange-red: `rgba(255, 101, 46, peakAlpha)`;
- middle cyan-white: `rgba(100, 217, 255, peakAlpha)`;
- white core: `rgba(255, 255, 255, peakAlpha)`;
- one incomplete cyan shock arc.

At peak intensity:

- exhaust length is `1.36 * shipHeight`;
- outer half-width at the nozzle is at most `0.15 * halfWidth`;
- white core length is `0.50` of the outer exhaust;
- the shock arc radius is at most `0.75 * halfWidth`.

Opacity follows a fast attack and slower decay:

```text
attack: first 15% of duration
decay: remaining 85%
```

The effect must be readable but remain below the total visual area of the ship hull.

### 6.4 Third jump

Third-jump ignition lasts exactly `0.36 s`.

It uses:

- outer gold-orange: `rgba(255, 190, 72, peakAlpha)`;
- middle cyan-white: `rgba(102, 226, 255, peakAlpha)`;
- white core;
- a wider incomplete gold-white shock arc;
- two short gold-white angular energy strokes.

At peak intensity:

- exhaust length is `1.78 * shipHeight`;
- arc radius is at most `0.92 * halfWidth`;
- the angular energy strokes remain below `1.05 * shipHeight` behind the nozzles;
- the effect remains inside a box no wider than `2.15 * halfWidth`.

Third jump must remain distinguishable from second jump in grayscale through its longer exhaust, wider arc, and extra angular strokes.

### 6.5 Glide

Glide draws continuous twin vector jets for every frame where:

```text
STATE.mode === PLAYING
STATE.gliding === true
STATE.fuel > 0
```

The glide jets use:

- outer cyan-blue: `rgba(55, 188, 255, 0.74)`;
- middle cyan-white: `rgba(91, 232, 255, 0.92)`;
- white core;
- low-alpha cyan bloom;
- two thin outer airflow lines per engine.

Length:

```text
ordinary glide: 1.35...1.55 * shipHeight
super-form glide: 1.48...1.68 * shipHeight
```

The range is driven by a small deterministic breathing phase, not frame-random jitter.

Glide no longer applies the retired `flameK = 0.5` reduction.

The jet:

- starts on the first rendered frame after physics sets `STATE.gliding = true`;
- remains visible while the state is true;
- disappears on the first rendered frame after release, fuel depletion, landing, pause, blur, hidden page, menu, or death clears glide;
- never remains as a stale persistent object in `STATE.trail`.

### 6.6 Ordinary and BOOST flight

Ordinary flight keeps its existing compact orange engine flames.

BOOST keeps its existing longer high-speed identity and remains stronger than ordinary glide in total trail length and speed-line density.

The new glide jets must not make ordinary glide look faster than BOOST.

### 6.7 Trail behavior

Normal motion may add a restrained glide trail:

- at most two new particles per rendered frame;
- cyan-white, short-lived, and aligned behind the two nozzles;
- lower speed and shorter life than BOOST streaks;
- capped by the existing global trail limit.

Reduced motion creates no new glide trail particles.

The continuous jet silhouette itself remains visible under reduced motion.

## 7. Reduced Motion

Reduced motion preserves critical feedback:

- second-jump twin ignition silhouette;
- third-jump longer silhouette and extra strokes;
- continuous glide twin jets;
- distinct state colors and lengths.

Reduced motion removes or freezes:

- random flame-length jitter;
- breathing;
- arc precession;
- new trail particles;
- spark-ring particles from second and third jump.

Burst duration is unchanged so feedback timing remains coupled to the accepted action.

## 8. Audio Contract

### 8.1 Second jump

Second jump keeps a short procedural ignition:

- primary upward sweep;
- short high-frequency confirmation tail;
- one low-volume broadband ignition transient.

The complete sound remains below `0.30 s`.

### 8.2 Third jump

Third jump uses a distinct `sfxTripleJump()`:

- the second-jump upward sweep remains as the action cue;
- add a lower-frequency thrust impact;
- add a short gold-energy confirmation tone;
- complete sound remains below `0.40 s`.

It must remain distinguishable from the super-form pickup sound and from BOOST.

### 8.3 Glide start

The transition from no glide to active glide emits one short broadband ignition transient:

```text
duration <= 0.10 s
low-pass <= 1,800 Hz
peak gain <= 0.07
```

The transient fires once per glide entry, not every update frame.

### 8.4 Glide sustain

Reuse the existing non-pitched broadband-noise design, but split one looping
source into two audible bands. The previous single `420 Hz / 0.085` low-pass
branch had an effective gain of only about `0.038` after the shared `0.45`
master and lacked the mid-frequency fire/air contour needed to remain audible
under music.

Use a dedicated `glideNoiseBuffer`, separate from one-shot `noiseBuffer`, so an earlier SFX cannot force glide to loop a short 0.5-second buffer.

The sustained graph contains:

- looping two-second mono noise source;
- low-pass rumble filter and gain;
- band-pass fire/hiss filter and gain;
- two slow filter-frequency LFOs;
- both branches connected to the existing SFX/master chain.

Ordinary glide targets:

```text
rumble low-pass base: 520 Hz
rumble gain: 0.125
fire band-pass center: 1,450 Hz
fire gain: 0.065
fade in: 0.12 s
```

Super-form glide targets:

```text
rumble low-pass base: 650 Hz
rumble gain: 0.140
fire band-pass center: 1,750 Hz
fire gain: 0.075
fade in: 0.12 s
```

The two bands reuse the same noise source so they remain one coherent engine
sound rather than two unrelated loops. If super form starts or ends during an
existing glide, both filter frequencies and both gains ramp to the new values
without rebuilding the graph.

### 8.5 Glide stop

Stop conditions remain authoritative:

- jump key released;
- fuel reaches zero;
- landing;
- pause;
- blur;
- hidden page;
- modal/input ownership cleanup;
- game over;
- menu;
- SFX mute.

Stop behavior:

```text
fade out: 0.12 s
node stop: 0.12 s after stop request
```

All audio methods retain `try/catch` degradation. Unsupported or blocked Web Audio produces silence without affecting gameplay.

### 8.6 BOOST sustain

BOOST reuses the same two-band propulsion graph. The pickup's existing
`sfxBoost()` remains the one-shot electrical ignition cue; it is not looped.

Continuous propulsion priority is:

```text
BOOST
super-form glide
ordinary glide
off
```

BOOST targets:

```text
rumble low-pass base: 820 Hz
rumble gain: 0.175
fire band-pass center: 2,200 Hz
fire gain: 0.095
```

When BOOST and glide overlap, one BOOST graph plays. When BOOST ends while
glide remains active, the same source ramps down to the appropriate glide mode.
When BOOST ends without glide, both branches fade out over `0.12 s`.

Blur, hidden-page, modal/input ownership loss, pause, menu, game over, and SFX
mute remain authoritative even while `boostT > 0`; the graph must not restart
until the page and Canvas regain gameplay audio ownership.

## 9. Rendering Architecture

Introduce pure feedback derivation:

```text
thrusterFeedbackState({
  gliding,
  jumpBurst,
  jumpBurstTier,
  boostActive,
  superActive,
  reducedMotion
})
```

It returns a frozen descriptor consumed by:

- `renderPlayer`;
- jump ignition audio dispatch;
- glide sustain parameter updates;
- tests and browser diagnostics.

Introduce focused Canvas helpers:

```text
drawSustainedThrusterJets(ctx, geometry, feedback)
drawJumpIgnitionBurst(ctx, geometry, feedback)
drawThrusterTrail(ctx, geometry, feedback)
```

The helpers receive ship-relative geometry. They do not read or mutate collision, track, or input state.

Audio remains in the existing game audio section:

```text
sfxDoubleJump()
sfxTripleJump()
syncPropulsionAudio()
```

## 10. Failure Handling

- Missing loaded ship images continue to use the procedural ship and the same shared thruster layers.
- `presentation.js` remains a required classic-script dependency; this pass does not add a second ship-layout implementation.
- Missing Web Audio or a rejected `AudioContext` leaves visuals and gameplay intact.
- SFX mute prevents ignition and sustained glide audio without hiding visual state.
- Audio node creation failure clears partial glide nodes and allows a later glide entry to retry.
- Repeated `syncGlideAudio()` calls do not duplicate active glide graphs.
- A rejected second or third jump produces no burst state, particles, or audio.

## 11. Automated Acceptance

### 11.1 State and physics

Tests assert:

- accepted second jump sets tier `2`, duration `0.30`, consumes exactly 3 fuel, and preserves existing velocity;
- accepted super third jump sets tier `3`, duration `0.36`, consumes exactly 3 fuel, and preserves existing velocity;
- first jump and rejected jumps do not set a burst tier;
- burst tier clears when duration expires;
- reset/menu/game-over cleanup clears burst state;
- glide gating, gravity, fuel drain, and landing reset remain unchanged.

### 11.2 Canvas

The real renderer harness asserts:

- second jump emits two nozzle-aligned exhaust paths and one incomplete arc;
- third jump is longer and emits the extra angular strokes;
- glide emits two sustained cyan-white jets for every active frame;
- glide no longer reduces flame length to 50%;
- release and fuel depletion remove sustained jets;
- loaded and fallback ship paths use equivalent feedback geometry;
- BOOST remains visually stronger than ordinary glide;
- reduced motion retains stable jets and suppresses trail/random jitter;
- Canvas save/restore prevents style, transform, line-cap, or alpha leakage.

### 11.3 Audio

The fake Web Audio harness asserts:

- second and third jumps call distinct sound recipes;
- glide entry creates exactly one sustain graph and one ignition transient;
- repeated sync calls reuse the graph;
- ordinary/super glide ramp to the approved filter/gain values;
- a dedicated two-second glide buffer is used;
- release, fuel depletion, pause, blur, hidden page, menu, game over, and mute stop all three active source/LFO nodes;
- fade values and stop times match the contract;
- unsupported or throwing Web Audio does not escape an exception.

### 11.4 Regression

Existing tests continue to protect:

- all jump apex and clearance math;
- three-jump super gating;
- fuel costs and drain;
- glide gravity factors;
- pause/input cleanup;
- reduced-motion behavior;
- ship asset fallback;
- HUD, music, collision, obstacles, leaderboard, and persistence.

## 12. Visual and Audio Acceptance

Real-browser review covers:

- second jump at center and edge lanes;
- third jump during super form;
- ordinary glide;
- super-form glide;
- glide entry and exit;
- fuel-depletion exit;
- normal and reduced motion;
- loaded and fallback ship art;
- 960×600, 1280×800, 1920×1080, and wide viewport.

Acceptance requires:

- all three approved concept states remain immediately distinguishable;
- sustained glide fire remains visible for the complete active state;
- exhaust does not obscure the player silhouette or important road hazards;
- audio has no electronic error-beep character;
- glide sound is audible but remains below warning, weapon, and pickup cues;
- no browser exception or required-resource failure appears;
- captures come from the actual game projection and renderer.

## 13. Delivery

1. Implement with red-green-refactor.
2. Run focused player, input, audio, reduced-motion, and gameplay tests.
3. Run the complete Linux platform-independent suite.
4. Verify served files match the workspace.
5. Capture real-browser screenshots plus deterministic audio-graph diagnostics.
6. Keep the current development preview URL unchanged.
7. Ask the user to play and approve the result.
8. Do not commit or push until the user explicitly authorizes final integration.

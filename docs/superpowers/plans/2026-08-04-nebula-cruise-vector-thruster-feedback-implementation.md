# Nebula Cruise Vector Thruster Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add distinct second-jump, third-jump, and sustained-glide thruster feedback with synchronized procedural audio while preserving all movement, fuel, collision, and balance rules.

**Architecture:** Add pure feedback-state derivation to the existing presentation module, which already owns player visual planning. Keep accepted-action state, Canvas rendering, and Web Audio orchestration in `src/game.js`; move thruster effects outside the loaded-image versus procedural-hull branch so both art paths share identical feedback.

**Tech Stack:** Classic browser JavaScript, Canvas 2D, Web Audio API, Node.js built-in test runner, Chromium DevTools Protocol.

## Global Constraints

- Work only in the public target GitHub repository.
- Do not use internal repositories, documents, packages, services, data, or assets.
- Preserve every jump, glide, fuel, speed, collision, obstacle, scoring, persistence, and input rule.
- Second-jump burst duration is exactly `0.30 s`; third-jump burst duration is exactly `0.36 s`.
- Glide jets remain visible for the complete authoritative `STATE.gliding` state.
- Loaded ship PNG and procedural fallback use the same shared sustained and burst layers.
- BOOST remains visually stronger than ordinary glide.
- Use deterministic Canvas breathing; no per-frame random jet length.
- Reduced motion preserves state silhouettes and suppresses new trail/jitter.
- Use the existing Web Audio graph and a dedicated two-second glide noise buffer.
- Add no runtime dependency and no external audio or image asset.
- Keep the current development preview URL unchanged.
- Do not commit or push until the user explicitly authorizes final integration.

---

### Task 1: Pure Thruster Feedback State and Jump Tier Lifecycle

**Files:**
- Modify: `src/presentation.js`
- Modify: `tests/presentation.test.js`
- Modify: `src/game.js`
- Modify: `tests/input.test.js`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- Produce `presentation.thrusterFeedbackState(options)`.
- Add `STATE.jumpBurstTier`.
- Add `resetThrusterFeedback()`.

- [ ] Write RED tests for pure mode priority and deeply frozen descriptors:
  - third burst > second burst > BOOST > glide > normal;
  - `sustained` mirrors glide even when BOOST owns visual mode;
  - second/third progress normalizes against `0.30/0.36`;
  - reduced-motion flag is preserved.
- [ ] Run `node --test tests/presentation.test.js` and verify failure because the function is absent.
- [ ] Implement the minimal pure function and export it.
- [ ] Run presentation tests and verify GREEN.
- [ ] Add RED gameplay tests:
  - first jump leaves tier `0`;
  - second jump sets tier `2`, burst `0.30`, fuel `-3`;
  - super third jump sets tier `3`, burst `0.36`, fuel `-3`;
  - rejected jump changes neither field;
  - burst expiry resets tier;
  - restart/menu/game-over clear both fields.
- [ ] Run focused input/UI tests and verify RED.
- [ ] Implement tier assignment, expiry, and focused reset without changing physics.
- [ ] Run focused tests and verify GREEN.
- [ ] Run `npm run check` and `git diff --check`.

---

### Task 2: Shared Canvas Vector Jets

**Files:**
- Modify: `src/game.js`
- Modify: `tests/player-render.test.js`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- Add `drawSustainedThrusterJets(ctx, geometry, feedback)`.
- Add `drawJumpIgnitionBurst(ctx, geometry, feedback)`.
- Add `appendGlideTrail(geometry, feedback)`.

- [ ] Upgrade the player render harness to record paths, colors, gradients, transforms, line caps, and save/restore.
- [ ] Write RED tests for:
  - two second-jump exhaust paths plus one incomplete arc;
  - longer third-jump exhaust plus two angular strokes;
  - two sustained cyan-white glide jets;
  - loaded and fallback ship paths emit equivalent feedback geometry;
  - BOOST visual mode is stronger than glide;
  - release/fuel depletion removes sustained jets;
  - reduced motion keeps stable silhouettes and creates no new trail;
  - Canvas state does not leak.
- [ ] Run `node --test tests/player-render.test.js tests/game-audio-ui.test.js` and verify RED.
- [ ] Remove retired central burst and fallback-only wing glide flames.
- [ ] Draw sustained jets before the hull branch and burst overlays after it.
- [ ] Replace `flameK = 0.5` glide reduction with pure feedback geometry.
- [ ] Add restrained normal-motion glide trail under the existing global cap.
- [ ] Run focused renderer tests and verify GREEN.
- [ ] Capture deterministic 1280×800 second/third/glide screenshots for local comparison.

---

### Task 3: Distinct Jump and Sustained Glide Audio

**Files:**
- Modify: `src/game.js`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- Keep `sfxDoubleJump()`.
- Add `sfxTripleJump()`.
- Replace `syncGlideAudio()` with unified `syncPropulsionAudio()`.
- Add module-local `glideNoiseBuffer`.

- [ ] Upgrade fake Web Audio to record buffers, sources, oscillators, filters, gains, ramps, starts, and stops.
- [ ] Write RED tests for:
  - second and third jump use distinct recipes;
  - glide entry creates one graph and one ignition transient;
  - repeated sync reuses the graph;
  - glide buffer is two seconds and separate from one-shot noise;
  - ordinary glide uses a `520 Hz / 0.125` rumble branch and a
    `1,450 Hz / 0.065` fire branch;
  - super glide ramps those branches to `650 Hz / 0.140` and
    `1,750 Hz / 0.075` without rebuilding;
  - one looping source feeds both branches;
  - BOOST alone starts the graph at `820 Hz / 0.175` rumble and
    `2,200 Hz / 0.095` fire;
  - BOOST overrides glide without creating a second source;
  - BOOST expiry during glide ramps the same source back to glide parameters;
  - blur, hidden page, modal focus, pause, menu, game over, and SFX mute keep
    BOOST sustain stopped until gameplay audio ownership returns;
  - stop fades both gains to `0.0001` over `0.12 s` and stops three active
    nodes at `0.12 s`;
  - mute, pause, blur, hidden page, menu, game over, release, fuel depletion, and landing stop audio;
  - throwing/unsupported audio degrades silently.
- [ ] Run `node --test tests/game-audio-ui.test.js` and verify RED.
- [ ] Implement the distinct jump recipes.
- [ ] Split one-shot and glide noise buffers.
- [ ] Add one-time glide-entry transient and live ordinary/super parameter ramps.
- [ ] Preserve existing stop/cleanup authority and partial-node cleanup.
- [ ] Run audio/UI tests and verify GREEN.

---

### Task 4: Full Verification and Deployed Review

**Files:**
- Create outside Git: `/tmp/skyroads-thruster-final-*.png`
- Create outside Git: `/tmp/skyroads-thruster-audio-verification.json`

- [ ] Run focused state, player, audio, input, reduced-motion, and physics tests.
- [ ] Run the complete Linux platform-independent suite including all existing event-horizon tests.
- [ ] Verify semantic PNG hashes remain unchanged.
- [ ] Verify served `src/presentation.js` and `src/game.js` match the workspace.
- [ ] Capture real-browser second jump, third jump, ordinary glide, super glide, BOOST+glide, reduced-motion, loaded, and fallback cases at target viewports.
- [ ] Record real audio-graph diagnostics from the browser where Web Audio is available.
- [ ] Inspect that jets do not cover the ship or hazards and that state differences survive grayscale.
- [ ] Reconfirm no internal source marker, commit, or push.
- [ ] Send preview URL, screenshots, exact tests, browser diagnostics, and Git boundary for user acceptance.

---
name: game-ui-polish
description: Visual and UI polish workflow for games. Trigger when the user asks to improve a game's look, add effects, make visuals "cooler/more detailed/more visible", design HUD and state feedback, generate game assets with AI (icons/textures/sprites), or reuse assets from the web. Applies to Canvas 2D / web games and to visual iteration in other game stacks. Covers visual-semantic design, procedural drawing detail, particle and screen effects, full-lifecycle feedback for buffs/charges/warnings, AI asset and external-module sourcing, and headless acceptance testing.
---

# Game UI Visual Polish

## Core principles

1. **What you see is what judges you**: rendering and collision must share the same projection/coordinates. If a visual change alters how an entity's position or size is presented, first confirm the hit logic reads the same values — otherwise players "die for no reason".
2. **Visual semantics first**: establish and obey a global color-semantics table (e.g. red = danger, cyan = resource, gold = timed buff, purple = enemy). Add new elements to the table before drawing them. Coexisting buffs are distinguished by color temperature (cyan-white vs gold) so they never blur together.
3. **State changes must be obvious at a glance**: every timed buff / charge / debuff lands on four channels at once — **entity appearance, HUD timer, screen-level effect, dedicated sound**. Ship only one or two and users will report "I can't feel it".
4. **Deterministic-effects discipline**: entity silhouettes and judgment-relevant animation are driven deterministically by clock/phase (`time + segIndex` phase), never per-frame random; short-lived particles (bursts, trails, arcs) may randomize.

## Workflow

### 1. Diagnose before drawing
Ask "what's wrong" first: visuals decoupled from hit detection? Perspective mismatch (the road has near-big-far-small depth while entities stay front-facing at constant scale)? Missing state feedback? Color-semantic conflicts? Write the diagnosis into the plan before editing.

### 2. Pick one of three asset routes
- **Procedural Canvas drawing** (default): gradient armor, panel seams, rivets, navigation lights, highlight arcs, flowing dashed energy trims. Zero dependencies, animatable, stylistically uniform. Preferred for 2D geometric-style games.
- **AI-generated assets**: static assets such as icons, splash screens, textures. Place generated files under `app/` or `assets/` and wire them into the build script (in-repo example: `app/build.sh` packs `AppIcon.png` into an icns via `sips` + `iconutil`). Always verify generated images with `ReadMediaFile`; compress first if over 10 MB.
- **Web modules / asset libraries**: only when procedural and AI generation both fall short. Keep provenance and license evidence; prefer integration with no build step (CDN / single file).

### 3. Full-lifecycle feedback template (buffs / transformations)
- **On acquisition**: screen flash + shockwave ring + burst particles + center-screen text scaling in + rising charge-up sound.
- **While active**: entity appearance change (plating color / energy blades / orbiting orbs / pulsing aura) + HUD countdown bar + sustained sound or trail.
- **Expiry warning** (final N seconds): escalating beeps in tiers (3/2/1 s tiers + a stage counter to prevent re-firing) + HUD bar color change with rapid blinking + pulsing screen-edge glow that shrinks as time runs out + entity effects blinking in sync. Warning frequency must exceed the normal pulse (e.g. ×10 vs ×6).
- **On expiry**: embers rising and dissipating + light flash + descending power-down sound — "back to normal" needs explicit feedback; it must not vanish silently.

### 4. Charge / power-up mechanics
- The meter is **always visible** (dark gray when empty); never let it flicker in and out with input. Or at minimum only appear past a charge threshold.
- The on-entity charge effect must grow **significantly** with progress (reference: energy ball 0.35→1.2× ship height + white-hot core + zigzag arcs + full-charge rotating gold ring) so users feel it without looking at the HUD.
- Tiered audio cues (1 s / 2 s rising ticks + full-charge ding); releasing the key resolves output by progress.

### 5. Pickup / magnet mechanics
- Give pulled items a **visible flight animation** (spawn a flying entity, render it accelerating toward the target, despawn after 0.3–0.4 s). Don't just puff particles in place — the "flying toward you" motion is what makes attraction readable.

### 6. Sound as feedback
Procedural Web Audio synthesis suffices (zero audio files): sweeps for jumps/charges, noise + lowpass for explosions/fire, square vs triangle timbres to distinguish warnings. Sustained sounds like glide thrusters use pure noise + LFO — oscillator harmonics read as "electronic error beeping". The macOS key-hold system beep is removed by calling `preventDefault` on all game keys.

## Acceptance (mandatory)

- After every round of edits, extract the `<script>` and run `node --check`.
- Write a **headless acceptance script** (stub canvas/AudioContext/localStorage/requestAnimationFrame, eval the game source, drive assertions): state-machine transitions, numeric thresholds (e.g. charge caps at 3 s, magnet range boundaries ±1), render smoke tests (run every new visual branch once to catch exceptions), 20 random-bot smoke games. **Capture the real event handlers and dispatch synthetic key events** to cover the true input path.
- Don't trust self-checks or subagent reports — the assertions must pass independently before the work counts as done.

## Code-pattern quick reference

Ready-to-adapt Canvas code patterns for particle bursts, shockwaves, auras, warning edge glows, charge energy fields, magnet flight entities, gradient ship armor, and more: see [references/canvas-effects-cookbook.md](references/canvas-effects-cookbook.md). Distilled from real iteration rounds on the SkyRoads hopper-car game.

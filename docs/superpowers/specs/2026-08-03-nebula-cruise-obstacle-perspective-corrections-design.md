# Nebula Cruise Obstacle and Perspective Corrections Design

**Date:** 2026-08-03

**Status:** Approved

**Delivery target:** Update the open `feat/stellar-command-polish` pull request against `main`; do not merge it

## 1. Context

The V1.1 Orbital Defense art pass is present on the feature branch, but playtesting exposed four related defects:

1. low barriers look too short because the runtime maps each complete transparent atlas frame to the collision box instead of mapping the visible model;
2. the obstacle vocabulary has only 600-unit and 2,000-unit heights, so it cannot visually or mechanically distinguish one-jump, two-jump, and super-form three-jump routes;
3. upright sprites on near edge lanes use a view clamped to ±30 degrees and one fixed render-camera pitch, although the road camera can require approximately 55–86 degrees of yaw and 53–86 degrees of pitch;
4. `Space` and `Enter` do not restart reliably after game over when the primary restart button owns focus.

The user approved a speed-banded obstacle system that always preserves an ordinary safe lane. The user also approved four distinct building families, yaw-by-pitch view atlases, and a modestly larger drone silhouette.

This document supersedes the obstacle-height, generation, atlas-layout, and view-selection constraints in the earlier rhythm/world-art specifications where they conflict. The established Orbital Defense palette, Kenney CC0 source policy, deterministic offline rendering, fallback behavior, local-only runtime, and V1.1 delivery process remain in force.

## 2. Goals

- Make visible obstacle size agree with collision height and ground position.
- Establish readable one-jump, two-jump, and super-form three-jump building tiers.
- Add low continuous runs whose primary solution is one jump plus the existing hold-to-glide action, while accepting a well-timed second jump as an advanced alternative.
- Add medium continuous runs that require two jumps followed by the existing hold-to-glide action at the intended nominal speed.
- Preserve at least one ordinary safe lane through every newly added building or corridor challenge, without changing the existing all-lane gap challenge.
- Make near left/right lane structures reveal the correct side and top instead of reading as front-facing billboards.
- Increase the drone's visible body modestly while preserving its gameplay hitbox, height, movement, and direction cues.
- Make `Space` and `Enter` restart reliably without allowing shortcuts to fire while editing text or using another dialog control.
- Update English and Simplified Chinese player guidance for the new obstacle language and glide expectation.
- Deliver automated evidence, a real browser screenshot, and a playable local build before pushing the branch update.

## 3. Non-goals

- No WebGL/Three.js conversion, runtime model loading, or remote runtime assets.
- No new ground-slide or crouch mechanic. “Glide” means the existing airborne behavior activated by holding a jump key while descending and while fuel remains.
- No tunnel ceiling or rule that disables the player's ordinary second jump over a low run.
- No mandatory two-jump, three-jump, or glide gate across every lane.
- No continuous high-rise run in this pass; long runs use only the one-jump and two-jump heights.
- No change to jump velocity, gravity, fuel cost, glide gravity factors, player speed curve, boost invulnerability, score, leaderboard, persistence, music, or player ship art.
- No change to existing enemy collision widths or heights.
- No merge of pull request #1 without the user's normal review flow.

## 4. Approved Gameplay Vocabulary

The physics constants remain `JUMP_VELOCITY = 7,500` and `GRAVITY = 32,000`. The theoretical apex added by each ideally timed jump is:

```text
7,500² / (2 × 32,000) = 878.90625 world units
```

The resulting obstacle tiers are:

| Family | Collision height | Required route action | Visual language |
|---|---:|---|---|
| Low barrier | 600 | One ordinary jump | Broad low armor, one cyan height band |
| Medium defense structure | 1,250 | Two ordinary jumps | Independent mid-rise silhouette, two cyan height bands |
| High command structure | 2,000 | Three jumps during super form | Tall skyline silhouette, two cyan bands plus one gold super beacon |
| Low continuous defense corridor | 600 | One jump plus glide is the primary solution; a well-timed second jump is also valid | Connected start marker, repeatable low body modules, continuous conduit/light line, end cap |
| Medium continuous defense corridor | 1,250 | Two jumps, then hold the jump key to glide | Connected start marker, repeatable medium body modules, continuous conduit/light line, end cap |

These heights preserve clear margins:

- `600 < 878.90625`: one jump clears a low barrier;
- `878.90625 < 1,250 < 1,757.8125`: one jump cannot clear a medium structure and two jumps can;
- `1,757.8125 < 2,000 < 2,636.71875`: ordinary play cannot clear a high structure, while the super-form third jump can.

Collision remains strict at the boundary: `playerY <= obstacleHeight` collides; only a height greater than the threshold clears it.

All five rows in the table describe skill routes, not solvability requirements. A newly added building or corridor challenge may occupy one or more non-safe lanes, but the generator must retain at least one traversable safe lane (`ROAD`, `FUEL`, or a non-hazard pickup) that requires no special power-up or advanced jump. This guarantee is scoped to the new building/corridor system; the existing intentional all-lane gap challenge remains unchanged.

The new medium collision type is `WALL_MEDIUM`. Ordinary bullets pass only when their stored flight height is greater than the struck building's tier height: 600 for low and 1,250 for medium. High structures continue to block ordinary bullets at every attainable ordinary firing height. Ordinary missiles clear the struck tile, while existing super-form bullet and area-missile rules apply to all three wall types.

## 5. Speed-banded Continuous Runs

### 5.1 Existing glide behavior

No new movement verb is needed. While the player is airborne, descending, holding any jump key, and has fuel, ordinary glide changes effective gravity to `32,000 × 0.08`; super form uses `32,000 × 0.045`. The player continues advancing automatically at `STATE.speed`.

For exact obstacle-height clearance, the ordinary no-glide and glide windows are:

| Height | No-glide time above threshold | Glide time above threshold |
|---:|---:|---:|
| 600 after one jump | 0.264 s | 0.599 s |
| 1,250 after an ideally timed second jump | 0.356 s | 0.808 s |

The outdated formula comment beside `GLIDE_GRAVITY_FACTOR` must be corrected to use `0.08`; this documentation-only correction does not change physics.

An ordinary second jump can keep the player above 600 for approximately 0.733 seconds without gliding, longer than the 0.599-second one-jump glide window. Therefore a low run cannot strictly require glide without adding an artificial ceiling or disabling the second jump. The approved behavior keeps both solutions: one jump plus glide is the signposted route, and a well-timed second jump is a valid advanced substitute. A medium run can strictly require glide because both ordinary jumps have already been consumed before the player reaches 1,250.

### 5.2 Nominal-speed calculation

Track generation remains deterministic and ahead-of-player. It therefore uses nominal speed derived from the unchanged acceleration curve, rather than transient runtime BOOST or SLOW state:

```text
nominalSpeed(index) = min(24, sqrt(64 + 0.8 × index)) segments/second
```

Continuous runs unlock at segment 100, where nominal speed is approximately 12 segments/second. For the signposted route at a height with no-glide window `Tfree` and glide window `Tglide`:

```text
minimumLength = ceil(nominalSpeed × Tfree) + 1
maximumSafeLength = floor(nominalSpeed × Tglide) - 1
```

The generator selects either `minimumLength` or `minimumLength + 1`, capped at `maximumSafeLength`. This creates small variation while avoiding a perfect-timing requirement. For low runs, the bounds compare one jump without glide against one jump with glide and intentionally do not prohibit the legal second-jump substitute. For medium runs, the bounds compare the complete two-jump trajectory without glide against the same trajectory followed by glide, so glide is strictly required on that route.

Reference values are:

| Nominal speed | Low primary-route range | Selected low length | Medium strict-glide range | Selected medium length |
|---:|---:|---:|---:|---:|
| 12 | 5–6 | 5 or 6 | 6–8 | 6 or 7 |
| 16 | 6–8 | 6 or 7 | 7–11 | 7 or 8 |
| 20 | 7–10 | 7 or 8 | 9–15 | 9 or 10 |
| 24 | 8–13 | 8 or 9 | 10–18 | 10 or 11 |

A transient SLOW state may make a skill route harder, and BOOST makes it harmless through existing invulnerability. Neither can create a dead end because the ordinary safe lane remains open.

### 5.3 Generator state and safety

The generator gains explicit run state: `runLane`, `runType`, `runLeft`, `runLength`, and `runIndex`. Every segment in one run uses the same lane and underlying collision type. Rendering metadata marks the first, repeated, and final module positions without replacing lane collision strings.

The following invariants are mandatory:

- a run never occupies `safeLane`;
- one run never changes lane or height mid-run;
- run tiles do not also contain a gap, pickup, or enemy;
- low and medium runs receive at least 10 clear same-lane approach segments and 10 clear same-lane landing segments;
- a medium short structure has at least 10 clear same-lane approach segments;
- a high structure offered as a super-form aerial route has at least 15 clear same-lane approach segments;
- a high structure is always avoidable without super form;
- the existing challenge cooldown and safe-lane reachability rules remain valid around the stronger per-family clear zones.

The module phase is cosmetic metadata only. Collision reads the unchanged lane type for low/high and the new medium lane type, so missing art cannot affect the course solution.

Run connectivity is derived from adjacent surviving tiles with the same run identifier. Destroying one corridor tile creates a real opening and immediately turns the neighboring visible modules into an end cap and a start cap; no connector may point into an empty tile.

## 6. Building Module System

The existing models must not be stretched into every tier. The deterministic offline renderer creates distinct 3D recipes from the already approved official Kenney CC0 Space Kit and Modular Space Kit sources:

- low: two re-authored broad barrier/gate variants normalized to 648 world units wide and 600 high;
- medium: two new pylon/defense-building variants normalized to 648 wide and 1,250 high;
- high: two re-authored reactor/tower variants normalized to 648 wide and 2,000 high;
- corridor: one low and one medium repeatable module whose floor plinth, side armor, top conduit, and light strip join continuously across adjacent segments.

Corridor entry and exit caps are projected world-space geometry joined to the repeatable body. This avoids six separate cap atlases while still producing a visible beginning, continuous middle, and clean ending. An illuminated forward chevron on the approach identifies hold-to-glide without locale-specific text.

All low, medium, high, and corridor building modules remain 648 world units wide, or 90% of the 720-unit lane. This pass changes visible height and module identity, not lateral collision reach. Opaque armor fills the declared world envelope; transparent effects may extend outside it but do not alter collision.

The Orbital Defense material language remains warm-white armor, graphite joints, cool steel, cyan environmental energy, restrained orange safety lamps, and gold only for the super-form third-tier beacon.

## 7. Perspective-correct Multi-view Rendering

### 7.1 Root cause

The current atlas has yaw views only at `[-30, -20, -10, 0, 10, 20, 30]` and one offline camera pitch of approximately 21.7 degrees. A near outer-lane object can require 76–86 degrees of yaw, while near structures require approximately 55–80 degrees of pitch. Clamping those values makes the sprite reveal the wrong side and too little of its top.

Mapping a complete 512×512 frame also allows transparent padding to shrink the visible object and move its apparent contact point away from the road.

### 7.2 View atlas contract

Every upright or airborne asset uses a 7-by-3 view matrix:

```text
yaw:   -80, -55, -30, 0, 30, 55, 80 degrees
pitch:  20,  55,  80 degrees
```

Each frame is 320×320. One asset atlas is a 2,240×960 transparent PNG, arranged with yaw across columns and pitch across rows. Atlas metadata records the view angles, model world bounds, per-frame alpha source rectangle, projected world-origin anchor, and pixels-per-world-unit scale.

The renderer normalizes each model to its declared world envelope before rendering. It records the projected origin instead of assuming that the bottom of the transparent frame is the ground. Changing transparent padding must therefore have zero effect on apparent size or placement.

### 7.3 Runtime selection

For each object, `src/world-art.js` computes:

- yaw from `atan2(worldX, zRel)`;
- pitch from the road camera to the visual center of the object's normalized world bounds;
- the two neighboring yaw views and two neighboring pitch views;
- bilinear weights for at most four frame draws.

All contributing frames share one projected world-origin anchor and one scale. Exact view matches draw once; one-axis interpolation draws twice; two-axis interpolation draws at most four times. Values outside the view matrix clamp at ±80 degrees yaw and 20/80 degrees pitch.

Ground shadows, turret barrels, direction markers, collision, and projectile origins remain projected from world coordinates. The image atlas cannot redefine gameplay geometry.

Gaps remain projected road-plane openings rather than upright billboards. Their edge trim follows the four projected lane/segment corners and is not routed through yaw/pitch sprite selection.

### 7.4 Perspective acceptance points

- `worldX = 2,160`, `zRel = 155` selects the +80-degree boundary instead of +30 degrees;
- a 2,000-unit structure at `zRel = 505` produces approximately 69 degrees of pitch and blends the 55/80-degree rows;
- the left and right edge lanes reveal opposite, symmetric sides;
- changing an atlas frame's transparent padding does not change the visible world size;
- the model world origin lands within one device pixel of its projected anchor;
- no abrupt pop is visible while an object moves between lanes or approaches the camera.

## 8. Drone Scale and Direction Readability

Both existing drone variants are re-rendered through the same yaw/pitch and origin-anchor pipeline. Their normalized opaque body width becomes 432 world units, exactly 60% of one lane and approximately 14% wider than the current intended 380-unit draw box. At 1,280×800 and `zRel = 505`, the center-lane opaque body must be at least 27 CSS pixels wide.

The model is vertically normalized so its rest-state visible top agrees with `DRONE_HEIGHT = 500`; the existing ±40-unit cosmetic bob remains. The following gameplay values remain unchanged:

- collision height `500`;
- collision half-width `0.22` lane;
- rest/warn/move state timing;
- continuous lane interpolation shared by rendering, projectiles, and collision;
- bank direction, destination chevron, and projected landing marker;
- reduced-motion behavior.

The size increase must not cover the destination marker or hide the direction chevron. At the same depth, the drone remains smaller than a lane-width building and does not obscure an adjacent safe lane.

## 9. Reliable Start and Restart Shortcuts

The current failure occurs because game over focuses the primary restart button, then the global handler prevents the button's native `Space` click and rejects the event as originating inside `#app-ui` before it reaches the game-over mode command.

The corrected input order is:

1. reject repeated keydown;
2. reject text inputs, contenteditable targets, and open dialogs;
3. recognize `Enter`/`Space` as a menu/game-over mode command when the target is outside app UI or is the current primary start/restart button;
4. prevent the native button activation only after accepting that mode command;
5. apply the existing gameplay focus gate to movement, jump, and fire actions.

Other focused buttons retain native keyboard behavior. `Space` and `Enter` must never start or restart while the player is editing a name or using the leaderboard/rename dialog. The visible `Enter / Space` keycap and `aria-keyshortcuts` metadata remain accurate.

## 10. Guidance and Localization

English and Simplified Chinese remain the only supported locales, selected by the existing browser-language policy.

The command-center guidance and both README files must explain:

- one light band means one jump;
- two bands mean two jumps;
- the gold third beacon means super-form three-jump clearance;
- a forward-lit continuous corridor means jump, then hold the jump key while descending to glide;
- every advanced route has an ordinary bypass lane.

The jump control line is expanded in both catalogs to include hold-to-glide behavior. Physical key labels remain locale-independent. Visual obstacle cues remain iconographic and require no translated text inside the game canvas.

## 11. Component Boundaries and Failure Handling

- `src/obstacles.js` owns pure jump-envelope, nominal-speed, continuous-run-length, and module-phase helpers. It has no DOM, rendering, audio, or storage dependency.
- `src/world-art.js` owns atlas metadata, yaw/pitch selection, source rectangles, origin anchors, and draw-plan construction. It has no gameplay-generation authority.
- `src/game.js` owns the generator state, lane contents, collision integration, input mode handling, and drawing orchestration.
- `tools/render-world-assets.swift` and `tools/world-assets.json` own deterministic model recipes, normalization, camera views, framing metadata, and atlas output.

Every atlas remains optional independently. A missing, undecodable, or malformed preferred atlas falls back only that category to a procedural renderer with the correct 600, 1,250, or 2,000 visual height. A missing corridor atlas falls back to a connected projected plinth plus repeated procedural bodies. Art failure never changes collision or safe-lane generation.

The twelve upright/airborne atlases must remain at most 3 MiB each and at most 30 MiB combined on disk. Their combined decoded RGBA budget is at most 112 MiB. Sub-one-pixel and offscreen destinations remain culled. No runtime URL may reference Kenney or another external host.

## 12. Verification

### 12.1 Automated tests

Automated coverage must include:

- exact one/two/three-jump apex values and the unchanged fuel cost of second/third jumps;
- collision at `600`, `1,250`, and `2,000`, including equality-fails and epsilon-above-clears boundaries;
- ordinary third-jump rejection and super-form third-jump acceptance;
- glide activation only while descending, held, and fueled, with unchanged 0.08/0.045 factors;
- run-length calculations at nominal speeds 12, 16, 20, and 24;
- proof that selected low-run lengths fail with only one jump and no glide, clear with one jump plus glide, and may also clear with a well-timed second jump;
- proof that selected medium-run lengths fail under every ordinary no-glide two-jump trajectory and clear with two jumps followed by glide;
- run lane/type continuity, start/middle/end phases, approach/landing clear zones, and safe-lane preservation;
- no gap, pickup, or enemy overlap inside a run;
- low/medium bullet-height behavior, ordinary missile clearing, super bullet clearing, and super area-missile clearing for the new wall type;
- corridor cap recomputation after one or more tiles are destroyed;
- high structures never make a no-super course unsolvable;
- high-speed swept collision across every continuous-run segment;
- yaw/pitch boundary selection, four-frame weight normalization, and symmetric edge-lane views;
- source-rectangle padding independence and ≤1-device-pixel origin-anchor error;
- normalized obstacle visible bounds matching 648×600, 648×1,250, and 648×2,000 world envelopes;
- drone opaque width 432, center-lane `zRel = 505` readability, unchanged hitbox/height, and preserved warn/move cues;
- deterministic double rendering, exact source/license identity, output hashes, alpha correctness, size budgets, independent fallback, and package completeness;
- focused start/restart button activation with `Space` and `Enter`, plus dialog, editing, repeated-key, and unrelated-button suppression.

### 12.2 Manual acceptance

Manual browser review covers 1,280×800 and 1,920×1,080 at normal and maximum speed, with at least these scenes:

1. a near low barrier cleared by one jump;
2. a medium structure cleared by two jumps;
3. a high structure blocked in ordinary mode and cleared with a super-form third jump;
4. a low continuous run cleared by the signposted one-jump-plus-glide route and by the accepted well-timed second-jump alternative;
5. a medium continuous run that cannot be cleared by two jumps alone and is cleared by two jumps followed by glide;
6. center and both outer lanes at near, middle, and far depths;
7. a drone performing rest, warn, and move states;
8. game over with the restart button focused, followed by successful `Space` restart.

Acceptance requires correct side/top exposure on edge lanes, substantial but lane-contained buildings, readable height tiers, a visibly larger but non-dominating drone, no ground-anchor drift, no view popping, and no discrepancy between visible and collision height.

A real gameplay screenshot must be captured from the implemented browser build; the brainstorming diagram cannot be used as implementation evidence. The user receives that screenshot and a local playable URL before any new commits are pushed to pull request #1.

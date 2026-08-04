# Nebula Cruise Heavy Swarm Drone Design

## 1. Context

The current drone gameplay is already correct:

- two deterministic cosmetic variants;
- a fixed `500` world-unit obstacle height;
- a `0.22`-lane collision half-width;
- a `0.6 s` stationary warning phase;
- a `0.4 s` continuous lane-change phase;
- banking toward the destination lane;
- a white direction chevron;
- a red projected target-lane ring;
- deterministic reduced-motion behavior.

The current semantic drone atlases use large areas of light pink and muted
red-violet. Against the purple nebula and horizon, the enemy body loses
separation. The existing rounded speeder silhouettes also feel less aggressive
than the updated player ship, structures, event horizon, and thruster effects.

The user selected concept **C — Heavy Swarm Drone**. The approved concept uses:

- a central armored body;
- two suspended side weapon or engine pods;
- outer attack prongs;
- a large hostile core;
- graphite-black armor;
- concentrated crimson and deep berry-red energy;
- the existing white chevron and red target ring.

This design replaces drone presentation only. It does not change gameplay.

## 2. Player Outcome

At speed, the player should read the new drone in this order:

1. a dark, wide hostile silhouette distinct from the nebula;
2. a concentrated red hostile core and energy seams;
3. the preserved white direction chevron;
4. the preserved red target-lane ring;
5. the bank direction before lane movement begins.

The drone must look more dangerous without becoming visually larger than its
existing world envelope or obscuring the road and nearby obstacles.

## 3. Goals

- Replace the primary drone presentation with a new Heavy Swarm family.
- Remove light pink as the dominant visible drone material.
- Preserve panel depth through graphite, steel, and near-black armor values.
- Reserve saturated crimson and deep berry-red for the core, seams, and lights.
- Give Scout and Striker clearly related but distinct silhouettes.
- Preserve every existing movement, collision, warning, and destruction rule.
- Keep warning cues independent from the hull artwork.
- Keep reduced-motion behavior deterministic.
- Use no new external runtime asset or dependency.
- Keep the existing licensed drone atlases as a safe visual fallback.
- Deliver real-browser rest, warning, movement, and outer-lane evidence before
  any commit or push.

## 4. Non-goals

- No change to `DRONE_HEIGHT`, `DRONE_WARN_TIME`, or `DRONE_MOVE_TIME`.
- No change to `HITBOX.droneHalfWidth`.
- No change to spawn frequency, safe-lane rules, enemy scoring, shooting, or
  collision.
- No change to `enemyLane()` interpolation or stable variant selection.
- No change to the target chevron, target-lane ring, or their world projection.
- No change to drone shadow placement or bob amplitude.
- No redesign of turrets, buildings, gaps, player ship, HUD, or background.
- No new projectile, weapon, attack, health, or boss behavior.
- No new third-party model, texture, image, audio, package, or service.
- No removal of the existing Kenney provenance or fallback atlases.
- No commit, push, PR update, merge, tag, or release before user acceptance.

## 5. Architecture

### 5.1 Pure visual descriptor

Add a classic/CommonJS module:

```text
src/drone-visual.js
```

It exports a pure function:

```text
heavySwarmDroneDescriptor({
  variant,
  state,
  direction,
  warningPulse,
  reducedMotion
})
```

The returned object is deeply frozen and contains normalized geometry only:

- armor polygons;
- recessed pod polygons;
- attack-prong polygons;
- core and warning-light circles;
- energy-seam paths;
- material role names;
- conservative normalized bounds.

It contains no Canvas context, DOM object, image, mutable game state, random
value, gameplay constant, or screen coordinate.

### 5.2 Runtime renderer

`src/game.js` consumes the descriptor through one focused
`drawHeavySwarmDrone()` helper.

The helper receives:

- the existing projected drone world rectangle;
- the existing bobbed projected origin;
- the existing bank rotation;
- the deterministic warning pulse;
- the selected Scout or Striker descriptor.

The helper draws the hull in normalized local coordinates. The same world
rectangle remains the authority for:

- screen size;
- culling;
- target-chevron anchoring;
- target-ring relationship;
- lane envelope.

### 5.3 Fallback chain

The primary path is:

```text
Heavy Swarm vector module
```

If `Skyroads.droneVisual` is absent or returns no valid descriptor, the game
uses the current chain unchanged:

```text
existing semantic drone atlas
existing procedural drone fallback
```

The current `drone-scout.png` and `drone-striker.png` semantic atlases remain
packaged, preloaded, licensed, and available for fallback. No new atlas render
is required on Linux, and no macOS SceneKit output is claimed.

### 5.4 Script order and diagnostics

`index.html` loads `src/drone-visual.js` after scene style and world art but
before `src/game.js`.

Diagnostics add:

```text
scripts.droneVisual = true | false
```

The runtime remains playable when the module is unavailable because the
existing atlas path remains valid.

## 6. Visual Family

### 6.1 Shared Heavy Swarm language

Both variants share:

- a central faceted armored body;
- two visually suspended side pods;
- two outer attack prongs;
- one central hostile core;
- two warning lights;
- mirrored energy seams;
- narrow cool-steel edge highlights;
- no large light-pink body panel.

The silhouette remains horizontally biased so the enemy reads as airborne.

The full hull stays inside the existing `432 × 360` world envelope:

```text
world width: 432
world height: 360
base Y: 140
```

No path may extend outside the conservative projected bounds returned to the
direction-cue renderer.

### 6.2 Scout

Scout is the compact member of the family:

- narrower central body;
- smaller side pods;
- shorter attack prongs;
- smaller hostile core;
- more negative space between body and pods;
- one energy seam per side.

Its silhouette should feel lighter and more agile without changing speed,
movement timing, hitbox, or spawn logic.

### 6.3 Striker

Striker is the heavy member:

- thicker central armor;
- wider side pods;
- longer lower attack prongs;
- larger hostile core;
- recessed weapon apertures;
- two energy seams per side.

It may fill more of the existing world envelope than Scout, but it must not
exceed that envelope or imply a larger collision box.

## 7. Color Contract

The dominant drone material becomes graphite armor rather than pink.

Add drone-specific semantic tokens under a nested hostile drone family:

```text
hostile.drone.armorShadow:    #070a10
hostile.drone.armorMid:       #171d26
hostile.drone.armorHighlight: #8f9baa
hostile.drone.podRecess:      #0b0f16
hostile.drone.energy:         #c70f48
hostile.drone.core:           #ff315f
hostile.drone.warningLight:   #ff3b4f
```

Existing independent warning cues remain:

```text
target ring: #ff4f63
chevron:     #fff4f7
```

Rules:

- graphite and near-black occupy most visible hull area;
- cool-steel highlight appears only on selected outer edges;
- deep berry-red energy seams remain narrow;
- the bright crimson core is concentrated in the center;
- light pink is not used as a body fill;
- no cyan or player gold appears on the drone;
- the core and warning lights remain visible against both the upper background
  and horizon background;
- the silhouette remains readable in grayscale through shape, value, and pod
  separation rather than saturation alone.

The existing flat `hostile.shadow`, `hostile.mid`, `hostile.signal`,
`hostile.warning`, and `hostile.cue` tokens remain unchanged. Turret and
procedural fallback colors therefore remain unchanged.

## 8. State Presentation

### 8.1 Rest

Rest uses:

- deterministic vertical bob from the existing simulation time;
- stable armor and energy seams;
- a restrained core pulse;
- no target ring or direction chevron.

### 8.2 Warning

Warning preserves the current contract:

- drone lane position does not move for `0.6 s`;
- hull banks toward `toLane`;
- deterministic warning flash overlays the hull;
- white chevron points toward `toLane`;
- red ring remains centered on the projected target lane;
- warning lights brighten;
- reduced motion freezes decorative pulse and bob but preserves bank, chevron,
  ring, and static warning intensity.

The hull flash may brighten seams and warning lights, but it must not turn the
whole armor body pink.

### 8.3 Move

Move preserves:

- `0.4 s` continuous `enemyLane()` interpolation;
- the same bank direction;
- the same collision position;
- no target ring or chevron after warning ends;
- stable variant identity throughout the transition.

### 8.4 Missing module or rendering failure

The current semantic atlas path renders the selected stable variant. If that
atlas is also unavailable, the current procedural fallback remains the final
defense.

No failure in visual presentation may stop gameplay or alter collision.

## 9. Draw Order

Per drone:

1. existing projected ground shadow;
2. Heavy Swarm hull armor;
3. recessed pods and apertures;
4. energy seams and central core;
5. warning-light overlay;
6. independent white direction chevron;
7. independent red target-lane ring.

The hull does not draw over the direction cue after the cue is emitted.

## 10. Testing

### 10.1 Pure module tests

Add `tests/drone-visual.test.js` covering:

- Scout and Striker descriptors are deeply frozen;
- both variants stay inside normalized bounds;
- Scout and Striker geometry is different;
- both use the Heavy Swarm family material roles;
- neither uses light-pink body materials;
- warning descriptors preserve direction and reduced-motion state;
- malformed inputs fall back to a safe Scout rest descriptor.

### 10.2 Scene-style tests

Extend `tests/scene-style.test.js`:

- exact drone armor and energy tokens;
- deep-freeze contract;
- drone core differs from player gold, structure orange, gap warnings, and
  background colors;
- cool armor highlight and crimson signals retain adequate value separation
  from both background layers.

### 10.3 Renderer tests

Extend `tests/world-render.test.js`:

- primary drone rendering uses the Heavy Swarm module;
- Scout and Striker emit different armor paths;
- both stay inside the existing projected `432 × 360` envelope;
- warning bank direction remains correct;
- chevron and target ring remain independent;
- movement still reports lane `2.5`, height `500`, hitbox `0.22`, warning
  `0.6`, and move `0.4`;
- reduced motion freezes decorative pulse and bob without removing cues;
- missing module falls back to the existing atlas;
- missing module and atlas fall back to the procedural drone.

### 10.4 Static and diagnostics tests

Update static script-order and browser-diagnostic tests for
`src/drone-visual.js`.

### 10.5 Regression

Run:

- focused drone visual, world renderer, input, scene-style, static-app, and
  game diagnostics tests;
- the complete Linux platform-independent suite;
- semantic asset hash checks to prove existing fallback atlases did not change;
- JavaScript syntax checks;
- `git diff --check`.

macOS SceneKit, `sips`, `afinfo`, WKWebView, universal-binary, and signature
checks remain a separate Mac-capable verification boundary.

## 11. Real-Browser Acceptance

Capture real Chromium evidence at `1280 × 800` for:

- Scout rest;
- Scout warning left and right;
- Scout mid-move;
- Striker rest;
- Striker warning;
- center lane and outer lane;
- reduced motion;
- missing-module atlas fallback.

Acceptance requires:

- the dominant hull is graphite rather than light pink;
- the drone separates from the purple horizon immediately;
- Scout and Striker read as one family but different weights;
- the Heavy Swarm silhouette stays inside one drone world envelope;
- the white chevron and red target ring remain unobscured;
- bank direction matches target direction;
- nearby road, buildings, player ship, and gaps remain readable;
- the design remains recognizable in grayscale;
- browser console and failed local-resource counts are zero.

## 12. Delivery Boundary

The preview remains at the current development URL:

```text
<preview-url>
```

The user reviews the implemented Heavy Swarm pass before any commit or push.
After approval, the drone work joins the existing uncommitted polish set for
final review, commit preparation, and explicit push authorization for PR #1.

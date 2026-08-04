# Nebula Cruise Perceptual Camera and HUD Design

**Date:** 2026-08-04

**Status:** Approved

**Branch:** `feat/stellar-command-polish`

**Delivery target:** Update pull request #1 after playable review; do not merge it

## 1. Context

The current V1.1 branch has a deterministic 2.5D Canvas renderer, thirteen local world atlases, collision-aligned anchors, and automated yaw/pitch tests. A real 1280 x 800 gameplay review still exposed a perceptual failure: near edge-lane buildings look tilted or laid onto the road instead of standing on it.

The failure is caused by the view-selection contract rather than one malformed asset. Runtime yaw uses lateral and forward distance, but runtime pitch uses forward distance alone:

```text
yaw = atan2(worldX, zRel)
pitch = atan2(cameraY - visualCenterY, zRel)
```

For a near outer-lane high structure at `worldX = 2160`, `zRel = 505`, `cameraY = 2340`, and `visualCenterY = 1000`, this selects approximately 76.8 degrees of yaw and 69.4 degrees of pitch. Pitch should use the horizontal radial distance from camera to object:

```text
horizontalDistance = hypot(worldX, zRel)
pitch = atan2(cameraY - visualCenterY, horizontalDistance)
```

That produces approximately 31.1 degrees. The existing calculation overstates the pitch by approximately 38.2 degrees. Center-lane objects do not expose the error because their radial and forward distances are equal.

The current HUD also keeps too many surfaces visible during play: fuel, jump count, an idle missile-charge bar, audio state, distance, score, speed, elapsed time, local best, a fire hint, and three utility buttons. This competes with the forward hazard-reading area and makes the screen feel like a debug overlay rather than a cockpit instrument.

## 2. Approved Direction

Use a perception-first 2.5D correction rather than converting the game to WebGL or Three.js.

The visual direction is **Clean Sci-Fi Holo**:

- dark blue-black structures instead of neutral gray;
- ice-white primary information;
- cyan as the main active accent;
- gold, amber, red, and green reserved for gameplay semantics;
- hairline geometry, chamfered corners, restrained glow, and no rounded cards;
- gameplay HUD motion limited to state communication;
- presentation screens may retain stronger command-center framing.

The implementation reuses the existing Canvas renderer, gameplay rules, world atlases, procedural fallbacks, DOM command center, localization, storage, audio, and macOS wrapper.

## 3. Goals

- Make grounded buildings appear upright and attached to the road in center and edge lanes.
- Make near outer-lane pitch depend on true three-dimensional camera distance.
- Prevent grounded buildings from becoming near-profile slivers at the outer lanes.
- Preserve broad view angles for airborne drones because their bank and movement direction are gameplay cues.
- Strengthen road depth through material, lane-line, atmospheric, and ground-contact hierarchy.
- Reduce permanent in-game HUD information to the values needed for immediate decisions.
- Move utility and historical information out of the active-play view.
- Preserve the existing command-center identity while making gameplay feel calmer and more intentional.
- Add automated contracts that fail on the old perceptual camera calculation.
- Deliver real-browser screenshots and a playable development-machine URL before pushing the PR update.

## 4. Non-goals

- No WebGL, Three.js, runtime model loading, or new build system.
- No new world assets or license sources.
- No rerender of the committed atlas PNGs in this pass.
- No change to track generation, lane count, difficulty, speed, scoring, collision, jumping, gliding, shooting, power-up behavior, leaderboard, storage, music content, localization scope, or release version.
- No change to the command-center information architecture beyond moving gameplay-only utilities out of active play.
- No merge, tag, GitHub Release, or production Pages claim before user review.

## 5. Perceptual Camera Contract

### 5.1 Radial pitch

`selectViewBlend` computes:

```text
horizontalDistance = max(1, hypot(worldX, zRel))
pitchAngle = atan2(cameraY - visualCenterY, horizontalDistance)
```

The visual center remains:

```text
visualCenterY = objectY + (worldBounds.minY + worldBounds.maxY) / 2
```

This keeps center-lane results unchanged while reducing excessive top exposure toward the road edges.

### 5.2 View profiles

The renderer supports explicit view profiles:

| Profile | Yaw range | Pitch calculation | Use |
| --- | ---: | --- | --- |
| `grounded` | lane offsets 0/±1/±2/±3 request 0/±6/±12/±18 degrees near the player; current atlases render the frontal yaw column | radial pitch for diagnostics; stable middle pitch row for rendering | walls, structures, corridors, turrets |
| `airborne` | -80 to +80 degrees | radial | drones |

The atlas still contains all seven yaw columns and all three pitch rows. Grounded yaw intent is perception-first rather than the raw camera-to-object azimuth:

```text
groundedYaw = laneOffset * 6 degrees * min(1, 1200 / zRel)
```

This keeps the center lane frontal, requests only 6 degrees for the first lane from center, and caps the outer lane intent at 18 degrees. Beyond 1,200 world units, every grounded yaw intent gradually converges toward zero.

The current atlas yaw samples jump directly from 0 to 30 degrees. Blending those two silhouettes enlarges and softens foreground structures, while choosing the 30-degree sample makes the outer lanes visibly over-rotated. Until exact small-angle source frames are rendered, every grounded draw plan therefore uses the fully opaque frontal yaw column. The lane position, footprint, and apparent perspective still come from the real projected world coordinates; no per-lane screen translation or collision change is introduced.

The profile is selected by gameplay orchestration, not inferred from atlas names. `buildSpriteDrawPlan` receives `viewProfile`, and `uprightAtlasPlacement` carries it from `src/game.js`.

### 5.3 Grounded clarity and size continuity

Grounded structures do not cross-fade atlas views at any depth:

- select the frontal yaw column and middle pitch row;
- draw exactly one frame at alpha 1;
- apply the same rule before, at, and after `zRel = 1,200`;
- airborne drones retain continuous blending at all depths because their movement and bank are animation cues.

This removes the old threshold where distant pitch blending abruptly switched to one foreground row. It avoids semi-transparent double contours and prevents a structure from shrinking as it approaches the player because differently cropped pitch rows no longer exchange weight. Grounded width and height therefore change only through continuous perspective scale. This does not invent detail absent from the source atlas; foreground crops may still be enlarged, but they remain a single coherent silhouette.

### 5.4 Grounding

Grounded structures retain the existing projected world-origin anchor. Their visual grounding is reinforced with:

- a dark projected footprint inside the lane;
- a narrow cyan environmental contact light;
- distance-aware alpha so the contact treatment does not become a bright stripe at the horizon;
- existing projected corridor plinths and conduits;
- procedural fallbacks using the same collision envelope and ground contact.

The atlas never changes collision geometry.

## 6. Scene Composition

### 6.1 Road

Replace the flat gray road treatment with a three-layer deck:

1. deep navy base panels;
2. subtle alternating segment values for speed and depth;
3. restrained cyan lane seams that are strongest near the player and fade toward the horizon.

The center forward-reading area remains free of decorative decals. Gap geometry and collision remain unchanged.

### 6.2 Atmospheric depth

World elements use depth hierarchy:

- near: full contrast and normal saturation;
- middle: slightly reduced contrast;
- far: lower alpha and cooler color contribution.

This hierarchy applies to road seams, side markers, structure contact light, and procedural scenery. It must not hide hazard silhouettes or warning cues.

### 6.3 Background and frame

The background retains the nebula, stars, mountains, and planet. The active-play screen no longer uses a complete decorative command frame. The world may extend to the viewport edge; critical HUD content stays within a five-percent safe area.

The title, pause, game-over, leaderboard, and rename surfaces retain the command-center frame.

## 7. HUD Information Architecture

### 7.1 Persistent during play

Left cluster:

- fuel bar;
- remaining jump pips.

Right cluster:

- score as the dominant number;
- distance as the secondary value;
- speed as a small tertiary value.

The clusters use translucent blue-black backplates, hairline cyan borders, tabular numerals, and text shadow or outline for readability.

### 7.2 Contextual during play

- Missile charge appears only while charging or while fully charged.
- BOOST appears only while active.
- Super form appears only while active.
- Magnet appears only while active.
- Expiry warnings use semantic amber or red without repurposing the cyan accent.

Contextual elements appear immediately or within 150 ms and leave within 300 ms. Reduced motion removes travel and pulse while preserving state.

### 7.3 Removed from active play

- local best;
- elapsed time;
- static fire/charge instruction;
- music/SFX state text;
- language, music, and SFX utility buttons.

Local best and elapsed time remain available in results. Controls and utilities remain in menu or pause contexts. No data or feature is deleted.

### 7.4 Safe area

HUD layout uses a five-percent inset with minimum and maximum pixel bounds:

```text
safeInset = clamp(20, min(width, height) * 0.05, 64)
```

This replaces exact 20 px and 16 px edge placement. The 960 x 600 minimum viewport remains supported.

## 8. Component Boundaries

- `src/world-art.js`
  - owns radial pitch, view profiles, axis clamping, and draw-plan metadata;
  - remains free of DOM, gameplay generation, and storage.
- `src/presentation.js`
  - owns pure HUD layout and visibility planning;
  - returns safe-area coordinates and persistent/contextual content decisions.
- `src/game.js`
  - selects grounded or airborne profiles;
  - orchestrates world drawing, road composition, contact treatments, and HUD Canvas rendering;
  - does not move gameplay state into presentation helpers.
- `styles/game.css`
  - hides utility controls during active play through mode state;
  - retains semantic DOM, focus, reduced motion, and command-center styling.
- `tests/world-art.test.js`
  - locks radial pitch and profile clamping.
- `tests/world-render.test.js`
  - locks grounded versus airborne view selection and projected contact drawing.
- `tests/presentation.test.js`
  - locks safe-area HUD layout and contextual visibility.
- `tests/game-audio-ui.test.js`
  - locks active-play utility visibility and HUD orchestration.

## 9. Failure Handling

- Missing or malformed world atlases continue to fall back per category.
- A missing `viewProfile` defaults to `airborne` compatibility behavior so existing call sites cannot silently lose frames during migration; all production grounded call sites must pass `grounded`.
- Invalid viewport dimensions use the existing finite-dimension fallback.
- Reduced-motion mode preserves all critical state and removes decorative pulse or travel.
- Browser audio failure remains independent from visual rendering.

## 10. Automated Acceptance

Required tests include:

- center-lane pitch remains unchanged;
- near outer-lane high structure pitch is approximately 31.1 degrees rather than 69.4 degrees;
- left and right radial pitch remain symmetric;
- grounded lane offsets 0/±1/±2/±3 request 0/±6/±12/±18 degrees at near depth;
- every grounded lane and depth draws exactly one fully opaque frontal-yaw, middle-pitch frame;
- grounded low, medium, and high structures grow monotonically while crossing the former `zRel = 1,200` boundary;
- adjacent 25-unit depth samples around that boundary change height by no more than four percent;
- airborne objects retain continuous blending at near depth;
- airborne yaw can still select -80/+80;
- grounded wall, corridor, and turret calls use `grounded`;
- drone calls use `airborne`;
- world-origin anchors remain invariant;
- HUD safe inset is five percent within the 20 to 64 px bounds;
- persistent HUD contains fuel, jumps, score, distance, and speed;
- idle charge, inactive power-ups, local best, elapsed time, audio state, and control hint are absent;
- active charge and power-up states appear;
- active play hides language/music/SFX utility controls while menu and pause keep them available;
- resuming from pause restores Canvas focus and removes hidden utility buttons from the Tab order;
- a held lane key waits 220 ms before repeat movement and uses 110 ms for each repeated lane;
- holding A or D for 180 ms moves exactly one lane;
- 960 x 600 HUD clusters do not overlap.

## 11. Browser Acceptance

Test at 960 x 600, 1280 x 800, and 1920 x 1080:

- center, inner, and outer lanes at near, middle, and far distance;
- low, medium, and high structures;
- corridor start, middle, end, and destroyed split;
- turret and drone rest/warn/move;
- normal and reduced motion;
- English and Chinese;
- menu, playing, paused, and game-over modes.

Acceptance requires:

- no grounded structure reads as a card laid onto the road;
- outer-lane structures retain readable front and side mass;
- contact points do not drift or float;
- road seams converge cleanly without dominating hazards;
- the player ship and forward threat area remain unobscured;
- the active HUD communicates immediate state without looking like a debug overlay;
- all thirteen atlases load with no fallback in the review capture;
- no browser console or network errors.

## 12. Delivery

1. Implement using red-green-refactor.
2. Run focused and platform-independent full checks on the Linux remote.
3. Capture before/after 1280 x 800 gameplay evidence.
4. Keep the current development preview URL unchanged.
5. Ask the user to play and approve the result.
6. During visual tuning, keep all source changes, tests, screenshots, and preview updates local to the Remote workspace. Do not run `git push`; PR #1 must remain at `c92e4ff` unless the user explicitly authorizes a push.
7. After approval and explicit push authorization, commit the reviewed implementation if it is not already committed, push `feat/stellar-command-polish`, and confirm PR #1 points to the new head.
8. Leave macOS-specific SceneKit, `sips`, `afinfo`, WKWebView, universal, and signature evidence for a Mac-capable environment before merge.

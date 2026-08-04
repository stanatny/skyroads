# Nebula Cruise Dangerous Event Horizon Gap Design

## 1. Context

The current gap renderer correctly preserves missing-road geometry and collision, but its purple-black gradient, orange diagonal grid, five purple depth lines, moving embers, and repeated atlas rim make the opening read as a decorated floor tile. Playtest feedback rejects that appearance.

The approved replacement is **B — Dangerous Event Horizon** from the real-game comparison captured on 2026-08-04. It uses a black core, restrained cyan-blue accretion light, sparse violet fringe, and broken red-orange warning lights.

The comparison used the same `project()` output and the same four opening corners for the current treatment and both candidates. The selected direction therefore changes visual composition only. It does not redefine where road exists.

This specification supersedes only the gap color and cue contract in:

- `2026-08-04-nebula-cruise-semantic-spectrum-gameplay-art-design.md`;
- `2026-08-04-nebula-cruise-semantic-spectrum-gameplay-art-implementation.md`.

The approved semantic palette for the player, structures, hostiles, road, background, and HUD remains unchanged. Camera, collision, generation, input, audio, persistence, packaging, and release constraints also remain unchanged.

## 2. Player Outcome

At gameplay speed, a gap must read in this order:

1. the road surface is physically absent;
2. the opening is lethal and must be avoided or jumped;
3. the opening contains a dangerous spatial anomaly;
4. the anomaly is not a collectible, doorway, or traversable portal.

The event horizon may provide spectacle, but it must remain visually subordinate to the player ship and immediate obstacle silhouettes.

## 3. Approved Direction

The event horizon consists of five layers:

1. **Exact missing-deck mask** — the union of projected `GAP` cells.
2. **Near-black well** — a low-value field that removes every road seam and deck mark inside the opening.
3. **Black core** — one elliptical core per connected gap region.
4. **Incomplete accretion treatment** — asymmetric cyan-blue arcs with a restrained violet fringe.
5. **Hazard boundary** — broken red-orange warning lights on the player-facing edge plus thin cold fracture light on exposed side edges.

The renderer does not draw a complete circular ring, a doorway frame, an inward arrow, or a bright central destination. Those cues would imply that the player should enter it.

## 4. Goals

- Replace the purple grid treatment with the approved event-horizon language.
- Make adjacent gap cells read as one connected missing-road region.
- Preserve exact lane, segment, bridge, and collision geometry.
- Keep the gap legible in color and grayscale.
- Preserve a clear danger cue when reduced motion is enabled.
- Keep all rendering deterministic and local.
- Avoid new runtime dependencies, remote assets, or license obligations.
- Deliver a real-browser preview and screenshots before any commit or push.

## 5. Non-goals

- No change to `LANE_TYPE.GAP`, `GAP_SAFE_HEIGHT`, track generation, gap-run length, bridge generation, physics, collision, jumping, gliding, speed, score, or difficulty.
- No WebGL, shader package, Three.js, offscreen worker, or new npm dependency.
- No new external image, model, video, font, or audio asset.
- No redesign of the road, buildings, drones, player ship, HUD, or background.
- No generic portal gameplay, teleportation, suction force, damage-over-time zone, or new interaction state.
- No per-cell random animation.
- No commit, push, PR update, merge, release, or tag before user acceptance.

## 6. Connected Gap Region Contract

### 6.1 Cell topology

Before drawing gaps, the visible track window is converted into connected regions.

Each `GAP` cell is identified by:

```text
cell = (segmentIndex, laneIndex)
```

Cells are connected only through four-neighbor adjacency:

```text
(segment - 1, lane)
(segment + 1, lane)
(segment, lane - 1)
(segment, lane + 1)
```

Diagonal contact alone does not merge two regions.

### 6.2 Region behavior

Every connected component produces exactly one event-horizon descriptor:

```text
GapRegion {
  id
  cells
  exposedEdges
  nearestSegment
  farthestSegment
  minimumLane
  maximumLane
}
```

The identifier is deterministic and derives from the component's smallest `(segmentIndex, laneIndex)` pair.

Expected topology:

- one isolated gap cell produces one narrow event horizon;
- adjacent gap lanes in one segment produce one wider event horizon;
- consecutive gap segments in one lane produce one longer event horizon;
- a full seven-lane, three-segment gap run produces one large event horizon;
- a narrow bridge produces two regions, one on each side of the surviving bridge;
- an L-shaped connected opening remains one region;
- diagonally touching openings remain separate.

This prevents seven small black holes from appearing across a full-width gap and prevents one portal from repeating on every segment of a gap run.

### 6.3 Exposed boundary

An edge is exposed only when its neighboring cell is outside the region.

Internal boundaries between connected `GAP` cells are never stroked, decorated, or used as warning-light anchors.

Boundary roles are:

- **player-facing edge** — broken red-orange hazard lights;
- **left and right exposed edges** — thin cold fracture light;
- **far exposed edge** — low-alpha cold rim, weaker than the near edge;
- **internal edge** — no draw event.

For a cell at `(segmentIndex, laneIndex)`, the player-facing edge is the edge at `zRelOf(segmentIndex)`, which projects lower on screen than the same cell's far edge. The far edge is at `zRelOf(segmentIndex + 1)`. Left and right retain their world-lane orientation regardless of screen slope.

## 7. Projection and Geometry Contract

Every gap cell retains the existing authoritative projection:

```text
xLeft  = -ROAD_WIDTH / 2 + lane * laneWidth
xRight = xLeft + laneWidth
zNear  = zRelOf(segmentIndex)
zFar   = zRelOf(segmentIndex + 1)
corners = project(xLeft/xRight, 0, zNear/zFar)
```

The exact projected cell quadrilaterals form the event horizon's clipping mask. A connected region may share one gradient and one core, but it may not replace the union with a freehand rectangle, ellipse, or screen-space approximation.

The renderer must satisfy:

- every projected `GAP` cell is completely covered by the region mask;
- no non-gap pixel outside the projected union is covered;
- bridge cells remain visually and geometrically intact;
- region grouping changes no point used by collision;
- resizing or device-pixel-ratio changes recompute projection normally;
- no arbitrary per-lane translation or scale is introduced.

## 8. Visual Contract

### 8.1 Palette

The gap tokens become:

| Role | Token | Purpose |
| --- | --- | --- |
| well | `#03040a` | removes road material inside the opening |
| core | `#000005` | unmistakable missing-space center |
| inner ring | `#5de8ff` | restrained cyan event-horizon light |
| middle ring | `#6091ff` | blue depth transition |
| fringe | `#a05dff` | sparse violet outer anomaly |
| side fracture | `rgba(93, 232, 255, 0.60)` | exposed physical edge |
| warning primary | `#ff6b4d` | lethal near-edge marker |
| warning secondary | `#ffb24c` | alternating near-edge marker |

The player-facing warning colors retain at least `4.5:1` contrast against both road deck values. The selected values measure:

| Warning | Against deck A `#222a34` | Against deck B `#28323d` |
| --- | ---: | ---: |
| `#ff6b4d` | `5.15:1` | `4.62:1` |
| `#ffb24c` | `8.09:1` | `7.26:1` |

The cyan ring is allowed to exceed these contrast values because it is clipped inside missing road and is not used as the sole danger cue. The violet fringe may fall below `4.5:1`; it is decorative only.

### 8.2 Core

Each connected region draws exactly one black core.

The core:

- is elliptical because road projection compresses depth;
- is centered inside the projected union, not at an arbitrary lane center;
- occupies approximately 35% to 48% of the region's projected width;
- occupies approximately 24% to 38% of the region's projected depth;
- never becomes brighter than the surrounding well;
- never contains a destination marker, icon, or readable interior object.

For highly irregular regions, the core is clipped by the exact union. It may be partially occluded by surviving road geometry, but it may not spill onto that road.

### 8.3 Accretion treatment

The accretion treatment uses two or three incomplete arcs.

The arcs:

- do not form a closed circle;
- use different start and end angles;
- remain inside the exact gap-region clip;
- peak below the player ship's brightest identity value;
- use cyan-blue as the dominant light and violet only as an outer fringe;
- become thinner and dimmer with scene depth.

The region also supports up to five sparse energy filaments that curve toward the core. Filaments are environmental texture, not directional arrows.

### 8.4 Hazard boundary

The player-facing exposed edge receives alternating red-orange dash segments.

Dash rules:

- dashes cover no more than 55% of the available edge length;
- gaps between dashes remain visible;
- line caps are rounded;
- the treatment follows every exposed near boundary of an irregular region;
- the treatment does not create a complete frame around the opening.

Side edges receive a thin cyan fracture line. The far edge is lower alpha so it cannot read as a second near boundary.

### 8.5 Removed cues

The following current cues are removed:

- orange diagonal interior grid lines;
- five purple cross-depth lines;
- purple-black tiled floor appearance;
- per-cell inward ember points;
- repeated `gap-edge` atlas modules around every cell.

The committed `gap-edge` asset and manifest entry remain available for compatibility and provenance in this polish pass, but runtime event-horizon rendering does not depend on or draw it. A later release may remove the unused asset through a separate audited asset migration.

## 9. Motion Contract

Normal motion may animate:

- a slow phase drift across the incomplete arcs;
- subtle arc-angle precession;
- deterministic energy filaments contracting toward the core.

Motion is derived only from:

```text
visualAnimationTime()
region.id
```

`Math.random()` is forbidden during rendering.

Reduced motion freezes:

- arc phase;
- arc precession;
- filament travel.

Reduced motion preserves:

- exact missing-deck mask;
- black well and core;
- incomplete ring silhouettes;
- side fracture lines;
- red-orange near-edge warning dashes.

No critical danger information depends on animation.

## 10. Rendering Architecture

### 10.1 Pure topology helper

`src/game.js` gains a pure region collector or consumes an equivalent pure helper:

```text
collectVisibleGapRegions(track, startIndex, endIndex, laneCount)
```

It owns only topology and exposed-edge classification. It does not draw, mutate track state, or perform collision.

### 10.2 Track rendering order

`renderTrack` uses this order:

1. collect visible connected gap regions;
2. draw every non-gap road tile and ordinary road seam;
3. draw connected event-horizon regions, clipped to their exact cell unions;
4. draw region hazard boundaries;
5. draw walls, pickups, and enemies through the existing second pass.

Drawing gaps after ordinary deck lines ensures no lane seam or cross-road depth line remains visible inside missing road.

### 10.3 Canvas responsibilities

The region renderer owns:

- construction of one clip path from all projected cells;
- projected region bounds;
- core and arc gradients;
- deterministic motion phase;
- exposed-edge strokes.

It does not own:

- track generation;
- safe-lane selection;
- physics;
- collision;
- player state;
- world-atlas preload policy.

## 11. Failure Handling

- Missing `scene-style.js` uses a local fallback with the same event-horizon roles.
- Missing or failed `gap-edge` image loading does not alter the procedural event horizon.
- An empty visible gap set performs no extra drawing.
- An invalid or out-of-range track cell is ignored rather than projected.
- A region whose projected cells are all invisible emits no draw calls.
- If a gradient cannot be created, the exact union still receives the near-black well, black core, side fracture, and warning dashes.
- Renderer failure never changes collision or converts a `GAP` cell into road.

## 12. Automated Acceptance

### 12.1 Topology

Tests cover:

- one isolated cell gives one region;
- contiguous horizontal cells give one region;
- contiguous longitudinal cells give one region;
- a full seven-lane, three-segment run gives one region;
- a narrow bridge gives exactly two side regions;
- an L-shaped opening remains connected;
- diagonal-only contact remains separate;
- internal boundaries are absent from `exposedEdges`;
- output order and IDs are deterministic.

### 12.2 Runtime rendering

The real Canvas harness verifies:

- every event-horizon clip contains the exact projected cell quadrilaterals;
- no old diagonal-grid or five-depth-line events remain;
- one connected region emits one black core;
- no `gapEdge` `drawImage` call is required;
- loaded and missing `gapEdge` states produce equivalent gap geometry and cues;
- near exposed edges emit alternating red-orange dashes;
- internal boundaries emit no warning dashes or fracture lines;
- side and far edges use the approved hierarchy;
- normal motion changes decorative arc/filament phase deterministically;
- reduced motion freezes decoration without removing danger cues;
- render-time `Math.random()` calls remain zero;
- bridge and full-gap projected geometry remains authoritative.

### 12.3 Regression

Existing tests continue to protect:

- `GAP_SAFE_HEIGHT`;
- full-gap run bounds;
- bridge generation and support;
- swept collision;
- lane count;
- track solvability;
- semantic scene roles;
- player, structure, hostile, HUD, and input behavior.

## 13. Visual Acceptance

Real-browser review covers:

- isolated center-lane gap;
- adjacent multi-lane gap;
- L-shaped opening;
- two-sided narrow bridge;
- full seven-lane gap;
- one-, two-, and three-segment longitudinal gap runs;
- 960×600, 1280×800, 1920×1080, and the user's wide viewport;
- normal and reduced motion;
- color and grayscale captures.

Acceptance requires:

- the road is visibly absent before the opening reaches the player;
- one connected region reads as one anomaly rather than tiled portals;
- a narrow bridge remains visually intact between two side anomalies;
- the black core never spills onto road;
- warning dashes communicate danger rather than entry;
- the anomaly does not outshine or obscure the player ship;
- the result does not resemble a traversable doorway;
- no browser exception, failed required resource, or category fallback appears;
- screenshots use the actual running game, not a hand-positioned mockup.

## 14. Delivery

1. Implement with red-green-refactor.
2. Run focused topology, world-render, scene-style, obstacle, and collision tests.
3. Run the complete Linux platform-independent suite.
4. Verify the served files match the workspace.
5. Capture real-browser comparison and gameplay screenshots.
6. Keep the current development preview URL unchanged.
7. Ask the user to play and approve the result.
8. Do not commit or push until the user explicitly authorizes the final integration step.

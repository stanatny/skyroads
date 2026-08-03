# Nebula Cruise Orbital Defense World Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace all nine hostile-world atlases with the approved Kenney-based Orbital Defense style, make barriers visibly occupy their lane, and preserve every gameplay, perspective, fallback, and movement-telegraph contract.

**Architecture:** Keep the existing Canvas 2D runtime and deterministic seven-yaw atlas API. Extend the offline SceneKit renderer with source-aware white/graphite/cyan/orange materials and category-specific canonical framing, then regenerate the same nine runtime paths from two audited Kenney CC0 packages. Runtime code changes only the cosmetic width of low and high wall sprites; collision and generation remain untouched.

**Tech Stack:** HTML5 Canvas 2D, classic JavaScript, Node 22 node:test, Swift/SceneKit/AppKit, transparent PNG atlases, GitHub Pages, macOS WKWebView.

## Global Constraints

- Work only in '/Users/stan/Developer/GitHub/skyroads/.worktrees/stellar-command-polish' on 'feat/stellar-command-polish'; update PR #1 but never merge it.
- Use strict red-green-refactor for every new behavior. Observe the named RED failure before editing production code.
- Preserve all current uncommitted music and deep-gap work. Checkpoint it in isolated commits before editing shared tests; never overwrite or fold it into the Orbital Defense asset commit.
- Preserve the existing seven lanes, 720 world units per lane, obstacle generation, safe-lane rules, collision widths/heights, score, difficulty, drone warn/move durations (0.6/0.4 seconds), leaderboard, storage, pause, keyboard shortcuts, i18n, and player rendering.
- Use only the official free CC0 Kenney Space Kit and Modular Space Kit archives. Source archives and extracted models remain outside Git.
- Keep the nine current runtime paths, manifest keys, seven 512×512 yaw frames, independent per-atlas fallback, transparent padding, zero RGB under alpha zero, 2 MiB per-atlas limit, and 18 MiB total limit.
- Use warm-white armor, graphite joints, cyan energy, and restrained orange safety accents. Red/magenta remains only for the existing hostile movement warning layer.
- A low or high wall sprite uses 648 visual world units, exactly 90% of one lane. Gameplay still treats the complete lane as occupied.
- Keep 'drawTurretWeapon()' as the authoritative aiming barrel and muzzle. Kenney turret source nodes named 'turret' are recursively hidden so the atlas contains only the base/body.
- Keep 'drawDroneDirectionCues()', bottom-center banking, 'enemyLane()', and reduced-motion behavior unchanged.
- Preserve the uncommitted projected deep-gap opening in 'src/game.js'; the new 'gap-edge' remains a repeatable rim module around that opening.
- The generated direction mockup is reference-only and must never be copied into runtime assets.
- User approval of a real local build and real gameplay screenshot is required before pushing the final update to PR #1.

---

### Task 0: Checkpoint the Existing Rhythm and Deep-gap Work

**Files:**
- Commit as audio change: 'assets/audio/nebula-cruise-atmosphere.mp3', 'assets/audio/nebula-cruise-atmosphere.ogg', 'assets/audio/nebula-cruise-drive.mp3', 'assets/audio/nebula-cruise-drive.ogg', 'assets/audio/nebula-cruise-overdrive.mp3', 'assets/audio/nebula-cruise-overdrive.ogg', 'assets/audio/source/nebula-cruise-score.json', 'docs/assets/audio-generation.md', 'src/audio.js', 'tests/assets.test.js', 'tests/audio.test.js', 'tests/game-audio-ui.test.js', 'tests/music-generator.test.js', 'tools/generate-music.js'
- Commit as gap change: 'src/game.js', 'tests/world-render.test.js'

**Interfaces:**
- Produces a clean task boundary so later edits to 'tests/assets.test.js' and 'tests/world-render.test.js' cannot accidentally mix prior work with the new world-art change.
- Does not change any file content in this task.

- [ ] **Step 1: Verify the existing audio work**

Run:

~~~bash
node --test tests/music-generator.test.js tests/audio.test.js tests/game-audio-ui.test.js tests/assets.test.js
npm run check
~~~

Expected: PASS with the current 144 BPM score, synchronized local formats, and current runtime mix.

- [ ] **Step 2: Commit only the existing audio work**

~~~bash
git add assets/audio/nebula-cruise-atmosphere.mp3 assets/audio/nebula-cruise-atmosphere.ogg \
  assets/audio/nebula-cruise-drive.mp3 assets/audio/nebula-cruise-drive.ogg \
  assets/audio/nebula-cruise-overdrive.mp3 assets/audio/nebula-cruise-overdrive.ogg \
  assets/audio/source/nebula-cruise-score.json docs/assets/audio-generation.md src/audio.js \
  tests/assets.test.js tests/audio.test.js tests/game-audio-ui.test.js \
  tests/music-generator.test.js tools/generate-music.js
git commit -m "feat: accelerate nebula cruise score"
~~~

Expected: 'src/game.js' and 'tests/world-render.test.js' remain modified and unstaged.

- [ ] **Step 3: Verify and commit only the deep-gap work**

Run:

~~~bash
node --test tests/world-render.test.js
npm run check
git add src/game.js tests/world-render.test.js
git commit -m "feat: deepen orbital abyss"
~~~

Expected: PASS and 'git status --short' contains only the new design and plan documents before Task 1 begins.

---

### Task 1: Make Wall Art Occupy Ninety Percent of a Lane

**Files:**
- Modify: 'tests/world-art.test.js'
- Modify: 'tests/world-render.test.js'
- Modify: 'tests/assets.test.js'
- Modify: 'src/world-art.js'
- Modify: 'tools/world-assets.json'

**Interfaces:**
- Produces 'WORLD_GEOMETRY.wallLow.worldWidth === 648' and 'WORLD_GEOMETRY.wallHigh.worldWidth === 648'.
- Collision widths and 'CONFIG.WALL_LOW_HEIGHT'/'CONFIG.WALL_HIGH_HEIGHT' remain unchanged.

- [ ] **Step 1: Write failing world-width assertions**

Change the expected geometry in 'tests/world-art.test.js' and the manifest geometry assertion in 'tests/assets.test.js' to:

~~~js
{
  drone: { worldWidth: 380, worldHeight: 360, baseY: 140 },
  turret: { worldWidth: 489.6, worldHeight: 1900, baseY: 0 },
  wallLow: { worldWidth: 648, worldHeight: 600, baseY: 0 },
  wallHigh: { worldWidth: 648, worldHeight: 2000, baseY: 0 },
}
~~~

In the existing loaded-wall test in 'tests/world-render.test.js', replace the literal width expectation with:

~~~js
assert.ok(Math.abs(calls[0].args[6] - scale * 648 * 960 / 2) < 1e-10);
~~~

This test catches a regression that would make the art narrower than the approved 90% lane presentation.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/world-art.test.js tests/world-render.test.js tests/assets.test.js
~~~

Expected: FAIL because runtime and render-manifest geometry still use 576.

- [ ] **Step 3: Implement the cosmetic width**

Change only 'wallLow.worldWidth' and 'wallHigh.worldWidth' from 576 to 648 in both 'src/world-art.js' and 'tools/world-assets.json'. Do not change 'CONFIG', generation, collision, or height values.

- [ ] **Step 4: Run GREEN**

Run:

~~~bash
node --test tests/world-art.test.js tests/world-render.test.js tests/assets.test.js
npm run check
~~~

Expected: PASS; wall draw destinations widen while every collision and fallback test stays green.

- [ ] **Step 5: Commit**

~~~bash
git add src/world-art.js tools/world-assets.json tests/world-art.test.js tests/world-render.test.js tests/assets.test.js
git commit -m "fix: enlarge orbital defense obstacles"
~~~

---

### Task 2: Render and License the Kenney Orbital Defense Atlases

**Files:**
- Modify: 'tools/render-world-assets.swift'
- Modify: 'tools/world-assets.json'
- Replace: 'assets/world/drone-scout.png'
- Replace: 'assets/world/drone-striker.png'
- Replace: 'assets/world/turret-sentry.png'
- Replace: 'assets/world/turret-heavy.png'
- Replace: 'assets/world/barrier-rail.png'
- Replace: 'assets/world/barrier-crate.png'
- Replace: 'assets/world/structure-reactor.png'
- Replace: 'assets/world/structure-tower.png'
- Replace: 'assets/world/gap-edge.png'
- Create: 'licenses/Kenney-Space-Kit-CC0.txt'
- Create: 'licenses/Kenney-Modular-Space-Kit-CC0.txt'
- Delete: 'licenses/Quaternius-Sci-Fi-Essentials-CC0.txt'
- Delete: 'licenses/KayKit-Space-Base-Bits-CC0.txt'
- Modify: 'docs/assets/world-art.md'
- Modify: 'THIRD_PARTY_NOTICES.md'
- Modify: 'tests/assets.test.js'
- Modify: 'tests/release-contracts.test.js'

**Interfaces:**
- Preserves all nine runtime atlas IDs and paths.
- Adds a manifest 'framing' map consumed only by the offline renderer:

~~~json
{
  "drone":   { "targetWidthRatio": 0.72, "targetHeightRatio": 0.64, "bottomPadding": 48 },
  "turret":  { "targetWidthRatio": 0.76, "targetHeightRatio": 0.86, "bottomPadding": 36 },
  "wallLow": { "targetWidthRatio": 0.86, "targetHeightRatio": 0.58, "bottomPadding": 36 },
  "wallHigh":{ "targetWidthRatio": 0.78, "targetHeightRatio": 0.88, "bottomPadding": 28 },
  "gap":     { "targetWidthRatio": 0.88, "targetHeightRatio": 0.56, "bottomPadding": 32 }
}
~~~

- Canonical framing computes one union opaque bound across all seven raw yaw frames, then applies one shared scale, horizontal center, and bottom anchor to every frame. Per-frame auto-cropping is forbidden because it creates visible size jitter.

- [ ] **Step 1: Write failing source, license, recipe, and framing tests**

Update the world-manifest test in 'tests/assets.test.js' to require these exact upstream records:

~~~js
[
  {
    id: 'kenney-space-kit',
    archiveFilename: 'kenney_space-kit.zip',
    archiveSha256: 'd5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9',
    licenseCommitted: 'licenses/Kenney-Space-Kit-CC0.txt',
    licenseSha256: 'bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7',
  },
  {
    id: 'kenney-modular-space-kit',
    archiveFilename: 'kenney_modular-space-kit_1.0.zip',
    archiveSha256: 'f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc',
    licenseCommitted: 'licenses/Kenney-Modular-Space-Kit-CC0.txt',
    licenseSha256: '38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb',
  },
]
~~~

Require 'downloadDate' to be '2026-08-03', 'license' to be 'Creative Commons CC0 1.0 Universal', and the two official pages:

- 'https://kenney.nl/assets/space-kit'
- 'https://kenney.nl/assets/modular-space-kit'

Require the exact model/material mapping below. All paths are relative to the temporary extracted source root:

| Atlas | Components |
|---|---|
| 'drone-scout' | 'space-kit/Models/OBJ format/craft_speederA.obj' + matching MTL, textures [] |
| 'drone-striker' | 'space-kit/Models/OBJ format/craft_speederD.obj' + matching MTL, textures [] |
| 'turret-sentry' | 'space-kit/Models/OBJ format/turret_single.obj' + matching MTL, textures [], hideNodes ['turret'] |
| 'turret-heavy' | 'space-kit/Models/OBJ format/turret_double.obj' + matching MTL, textures [], hideNodes ['turret'] |
| 'barrier-rail' | two 'space-kit/Models/OBJ format/barrels_rail.obj' components at scale 0.72 and X translations -0.44/+0.44 |
| 'barrier-crate' | 'modular-space-kit/Models/OBJ format/gate-lasers.obj' + matching MTL + 'Models/OBJ format/Textures/colormap.png' |
| 'structure-reactor' | 'space-kit/Models/OBJ format/machine_generatorLarge.obj' + matching MTL, textures [] |
| 'structure-tower' | two 'modular-space-kit/Models/OBJ format/room-large.obj' components: base identity, upper scale 0.92 translated to Y 0.82; both use colormap.png |
| 'gap-edge' | 'space-kit/Models/OBJ format/terrain_sideCliff.obj' + matching MTL, textures [] |

Extend the test-side PNG alpha scan so every frame reports 'minX', 'maxX', 'minY', 'maxY', 'opaqueWidth', and 'opaqueHeight'. Require:

~~~js
const minimumOpaqueExtent = {
  drone: { width: 280, height: 170 },
  turret: { width: 260, height: 300 },
  wallLow: { width: 392, height: 150 },
  wallHigh: { width: 240, height: 400 },
  gap: { width: 384, height: 120 },
};
~~~

Every frame must keep at least 12 transparent pixels on left, right, and top; its bottom opaque pixel must remain between Y 440 and Y 488. These assertions catch the specific tiny-dot failure while leaving room for different yaw silhouettes.

Update 'tests/release-contracts.test.js' so the verbatim license list removes the retired Quaternius Sci-Fi Essentials and KayKit Space Base Bits files and includes the two new Kenney license copies.

- [ ] **Step 2: Run RED**

Run:

~~~bash
node --test tests/assets.test.js tests/release-contracts.test.js
~~~

Expected: FAIL on old source families, missing Kenney licenses, missing framing schema, old PNG hashes, and insufficient old-frame opaque bounds.

- [ ] **Step 3: Acquire and verify both official archives outside Git**

Create a temporary work directory and resolve downloads only through the two official Kenney pages. Reject any resolved archive whose filename or SHA-256 differs from the exact values above.

~~~bash
ORBITAL_WORK_DIR="$(mktemp -d "\${TMPDIR:-/tmp}/nebula-orbital-defense.XXXXXX")"
mkdir -p "$ORBITAL_WORK_DIR/downloads" "$ORBITAL_WORK_DIR/extracted/space-kit" \
  "$ORBITAL_WORK_DIR/extracted/modular-space-kit" "$ORBITAL_WORK_DIR/render-a" \
  "$ORBITAL_WORK_DIR/render-b"

# Follow each official page's free-download link and save only these two files.
# https://kenney.nl/assets/space-kit
# https://kenney.nl/assets/modular-space-kit
shasum -a 256 "$ORBITAL_WORK_DIR/downloads/kenney_space-kit.zip" \
  "$ORBITAL_WORK_DIR/downloads/kenney_modular-space-kit_1.0.zip"
unzip -q "$ORBITAL_WORK_DIR/downloads/kenney_space-kit.zip" \
  -d "$ORBITAL_WORK_DIR/extracted/space-kit"
unzip -q "$ORBITAL_WORK_DIR/downloads/kenney_modular-space-kit_1.0.zip" \
  -d "$ORBITAL_WORK_DIR/extracted/modular-space-kit"
~~~

Copy 'License.txt' byte-for-byte from each extracted archive to its declared repository path and verify the two license hashes before continuing.

- [ ] **Step 4: Implement the source-aware Orbital Defense renderer**

Add 'FramingContract' to the manifest decoder and validate the exact five-category framing map. Keep the existing nine-ID, source-path, hash, alpha, size, and determinism validation.

For solid-color Space Kit MTL materials, inspect the source diffuse color. Map dark source luminance below 0.32 to graphite '#253044', saturated orange source hues to safety orange '#f09245', and the remaining panels to warm white '#e9eff6'. For the Modular Space Kit colormap, preserve the texture and apply neutral white multiplication. Use physically based lighting with metalness 0.24 and roughness 0.38.

Replace the violet/red generated seam treatment with:

- cyan seam '#68e8ff';
- cyan environmental status light '#58e7ff';
- restrained orange hazard light '#ff8a42'.

Keep warning red/magenta out of the atlas; the runtime cue layer already owns that semantic color.

Retain recursive 'hideNodes' matching and require that both turret recipes actually find and hide a node named 'turret'. A requested hide node that matches zero imported nodes is a renderer error, preventing a static barrel from silently entering the atlas.

After safe raw rendering, compute alpha bounds using alpha >= 16. Build one union bound across all seven frames, derive one uniform scale from the asset category's target width/height ratios, then place every frame with the same horizontal center and bottom padding. Downsample into the existing 512×512 premultiplied output and clear RGB wherever alpha is zero.

- [ ] **Step 5: Update the manifest with audited source hashes**

Set manifest version to 2, add the exact 'framing' map, replace the upstream list and all nine recipes with the table above, and list the SHA-256 of every referenced OBJ, MTL, colormap, and license path. 'sourceHashes' must exactly equal the unique referenced input paths; no unused source is permitted.

- [ ] **Step 6: Render twice and prove determinism**

~~~bash
swift tools/render-world-assets.swift --manifest tools/world-assets.json \
  --source-root "$ORBITAL_WORK_DIR/extracted" --output "$ORBITAL_WORK_DIR/render-a"
swift tools/render-world-assets.swift --manifest tools/world-assets.json \
  --source-root "$ORBITAL_WORK_DIR/extracted" --output "$ORBITAL_WORK_DIR/render-b"
for atlas in drone-scout drone-striker turret-sentry turret-heavy barrier-rail \
  barrier-crate structure-reactor structure-tower gap-edge; do
  cmp "$ORBITAL_WORK_DIR/render-a/$atlas.png" "$ORBITAL_WORK_DIR/render-b/$atlas.png"
done
shasum -a 256 "$ORBITAL_WORK_DIR/render-a"/*.png
~~~

Expected: all nine comparisons exit 0, each output is at most 2 MiB, and the combined size is at most 18 MiB.

- [ ] **Step 7: Inspect the contact sheet before replacing runtime files**

Build a temporary contact sheet from all seven frames of all nine render-a atlases. Inspect at original resolution and reject:

- clipped geometry or less than 12 transparent pixels on required edges;
- frame-to-frame scale or bottom-anchor jitter;
- a low barrier that does not read as one continuous lane obstacle;
- a high structure that reads as a stretched small prop;
- a turret atlas that still contains the hidden static barrel;
- a gap module that cannot tile cleanly;
- purple base materials or dominant red lighting.

The accepted sheet must visibly match the approved warm-white/graphite/cyan/orange direction.

- [ ] **Step 8: Freeze provenance and replace the nine atlases**

Update 'docs/assets/world-art.md', 'THIRD_PARTY_NOTICES.md', and the literal hashes in 'tests/assets.test.js' with:

- the two official source pages;
- archive filenames and hashes;
- exact model/material/texture paths and hashes;
- exact license paths and hashes;
- renderer hash;
- all nine output hashes and sizes;
- the canonical framing algorithm and values;
- the double-render reproduction commands.

Remove only the two retired world-art license files. Keep 'licenses/Quaternius-Ultimate-Spaceships-CC0.txt' because the player ship still uses it.

Copy only the nine accepted render-a PNGs into 'assets/world/'.

- [ ] **Step 9: Run GREEN**

Run:

~~~bash
node --test tests/assets.test.js tests/release-contracts.test.js tests/world-art.test.js \
  tests/world-render.test.js tests/presentation.test.js tests/game-audio-ui.test.js
npm test
npm run check
~~~

Expected: PASS with exact Kenney provenance, canonical opaque bounds, all fallback tests, and unchanged movement cues.

- [ ] **Step 10: Commit**

~~~bash
git add tools/render-world-assets.swift tools/world-assets.json assets/world \
  licenses/Kenney-Space-Kit-CC0.txt licenses/Kenney-Modular-Space-Kit-CC0.txt \
  licenses/Quaternius-Sci-Fi-Essentials-CC0.txt licenses/KayKit-Space-Base-Bits-CC0.txt \
  docs/assets/world-art.md THIRD_PARTY_NOTICES.md tests/assets.test.js \
  tests/release-contracts.test.js
git commit -m "assets: adopt orbital defense world art"
~~~

Confirm 'git status --short' contains no ZIP, extracted model, temporary render, or contact-sheet file.

---

### Task 3: Real-browser Visual Gate and Local Review

**Files:**
- Modify only if an observed bug requires a new RED test first: 'src/game.js', 'src/world-art.js', 'tests/world-render.test.js', 'tests/world-art.test.js'
- Do not commit screenshots or temporary review artifacts.

**Interfaces:**
- Produces a real local gameplay link and a 1280×800 capture for user approval.
- Does not push or merge PR #1.

- [ ] **Step 1: Run complete web and packaged-app verification**

~~~bash
npm test
npm run check
bash tests/app-signature-smoke.sh
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
~~~

Expected: every command exits 0.

- [ ] **Step 2: Start the local static build**

Run the repository's existing local static-server command on an available loopback port. Open the exact served URL in the in-app browser and confirm diagnostics report all nine preferred world atlases loaded with no world fallback.

- [ ] **Step 3: Exercise the approved visual cases**

At 1280×800, play until the review set contains:

- a near low barrier occupying most of one lane;
- a high structure with substantial height and a clear lane footprint;
- a turret with a separately aimed runtime barrel;
- a drone in warn and move states, banking toward its target while the chevron and landing marker agree;
- a visible deep gap with tiled Orbital Defense rim pieces.

Also temporarily simulate one missing atlas through the existing test/dev harness and confirm only that object falls back procedurally.

- [ ] **Step 4: Capture and inspect real gameplay**

Save one or more real browser screenshots outside the repository. Compare them with the approved B direction for palette, scale, readability, perspective, and obstacle weight. Do not claim the direction mockup itself as implementation evidence.

If a defect is found, add a failing behavioral or asset-bound test that reproduces it, observe RED, make the minimal fix, run the focused test GREEN, and rerun Step 1. Purely subjective palette tuning is performed in the offline renderer and followed by deterministic re-render, hash, provenance, and asset-test updates.

- [ ] **Step 5: Hand the local build to the user**

Provide the loopback URL and the real screenshot. Ask for approval of the actual game build. Do not push the branch while approval is pending.

- [ ] **Step 6: Update PR #1 only after approval**

After explicit approval:

~~~bash
git status --short
git log --oneline --decorate -12
git push origin feat/stellar-command-polish
~~~

Update PR #1's description with the Kenney CC0 sources, all five replaced world categories, larger lane-readable barriers, preserved drone direction cues, and the verification commands. Do not merge.

---

## Plan Self-review

- Spec coverage: all five requested world categories, perspective, drone movement indication, obstacle sizing, CC0 provenance, real preview, local review, and PR handling have explicit tasks.
- Placeholder scan: every source, model, path, hash, palette value, geometry value, framing target, test command, and acceptance bound is specified.
- Interface consistency: runtime atlas IDs remain unchanged; both runtime and offline geometry use 648 for low/high wall width; manifest version 2 is consumed only by the updated offline renderer; turret source node 'turret' is hidden while 'drawTurretWeapon()' remains authoritative.

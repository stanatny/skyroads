# Nebula Cruise Rhythm and World Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the open V1.1 pull request with a faster, joyful-but-tense adaptive score; polished perspective-aware hostile world art; a blue-violet mission action; and visible bilingual keyboard hints, while preserving every gameplay and local-data rule.

**Architecture:** Keep the existing Canvas 2D, static-hosting, and packaged `file://` architecture. Music remains three synchronized deterministic offline-rendered stems selected as one complete OGG or MP3 set. New CC0 models are downloaded only into a validated temporary directory and rendered offline into local seven-view PNG atlases; a new pure `src/world-art.js` module selects adjacent atlas views, while `src/game.js` owns projected placement and retains the procedural renderer as an independent per-category fallback. HTML overlays continue to own mission controls and accessibility metadata.

**Tech Stack:** HTML5 Canvas 2D, plain classic JavaScript, CSS, Node 22 `node:test`, Web Audio, Swift/SceneKit, OGG Vorbis, MP3, macOS Cocoa/WKWebView, GitHub Pages, GitHub Actions.

## Global Constraints

- Work only in `/Users/stan/Developer/GitHub/skyroads/.worktrees/stellar-command-polish` on `feat/stellar-command-polish`; update PR #1 but do not merge it.
- Use strict red-green-refactor for each behavior. Run the stated RED command and observe the stated failure before editing production code.
- Keep commits small and green. Do not mix audio binaries, world-art binaries, and unrelated code in one commit.
- Do not change lane count, generation probabilities, safe-lane rules, collision widths/heights, score, difficulty, enemy movement, leaderboard, storage keys, or persistence schemas.
- Keep the drone `warn` and `move` durations at `0.6` and `0.4` seconds. Rendering, shooting, and collision must continue to consume the same continuous value returned by `enemyLane()`.
- Retain the current `Enter` / `Space` start-and-restart behavior, `Escape` game-over return behavior, repeat suppression, text-input guard, and modal guard.
- Keep runtime code free of remote URLs. Source archives/models and temporary WAV/encoder files never enter Git.
- Use only the free CC0 editions of Quaternius Sci-Fi Essentials Kit and KayKit Space Base Bits. Commit the exact license copies, source metadata, derived atlases, renderer, and provenance.
- World atlases are optional independently. One corrupt or absent atlas falls back only its own category or variant; it never blocks play or discards successfully loaded categories.
- Music loading remains all-or-nothing by format: OGG first, MP3 second, existing 138 BPM procedural music last. Audio failure never blocks play.
- Support only `en` and `zh-CN`; every new visible phrase must exist in both catalogs. Physical key labels remain `Enter`, `Space`, and `Esc` in both languages.
- Respect `prefers-reduced-motion`: freeze cosmetic animation and pulsing, but keep static direction, target-lane, and hazard cues.
- Keep browser, GitHub Pages, and the packaged macOS `file://` build behavior aligned.
- User listening and visual approval are release gates. Automated checks do not replace them.
- Pause/resume is explicitly outside this plan, matching the approved specification. Do not document or claim a `P` shortcut until the separate pause work has landed and passed its own review.

---

## File Map

```text
index.html                                      add world-art classic script before game.js
styles/game.css                                mission gradient, keycaps, responsive/reduced-motion rules
src/i18n.js                                    bilingual shortcut labels and feature copy
src/presentation.js                            mission DOM, world preload, diagnostics, per-atlas resolution
src/audio.js                                   exact adaptive mix/filter/bus targets
src/world-art.js                               atlas metadata, yaw blending, frame rectangles, draw planning
src/game.js                                    projected world-art integration and procedural fallbacks
app/main.swift                                 native smoke requires world-art script and preferred atlases
assets/audio/source/nebula-cruise-score.json   128 BPM / 32-bar deterministic score contract
assets/audio/nebula-cruise-*.ogg               synchronized preferred stems
assets/audio/nebula-cruise-*.mp3               synchronized compatibility stems
assets/world/*.png                             nine local seven-view transparent atlases
licenses/Quaternius-Sci-Fi-Essentials-CC0.txt exact upstream license copy
licenses/KayKit-Space-Base-Bits-CC0.txt        exact upstream license copy
tools/generate-music.js                        rhythm-forward deterministic PCM renderer and metrics
tools/render-world-assets.swift                deterministic SceneKit multi-view renderer
tools/world-assets.json                        source-relative model selection and render recipes
docs/assets/audio-generation.md                updated render, encode, measurement, audition procedure
docs/assets/world-art.md                       source, license, camera, palette, hashes, reproduction
THIRD_PARTY_NOTICES.md                         exact shipped asset provenance
README.md                                      English V1.1 presentation/control notes
README.zh-CN.md                                equivalent Chinese V1.1 notes
tests/music-generator.test.js                  tempo, duration, determinism, pulse, headroom
tests/audio.test.js                            state mix, cutoff, ramp, complete-format fallback
tests/world-art.test.js                        pure atlas/view/draw-plan contracts
tests/world-render.test.js                     real game render integration and telegraphs
tests/presentation.test.js                     mission controls, i18n rendering, ARIA, focus
tests/assets.test.js                           asset graph, PNG geometry/alpha/hashes/provenance
tests/static-app.test.js                       world-art script ordering and zero remote dependencies
tests/game-audio-ui.test.js                    shortcut guards and runtime diagnostics
tests/release-contracts.test.js                six exact upstream license copies remain verbatim
tests/app-resources-smoke.sh                    packaged asset parity
tests/app-wkwebview-smoke.sh                    real local-file decode/load smoke
```

## Exact Interfaces and Data Contracts

`src/world-art.js` attaches one frozen CommonJS/browser API at `globalThis.Skyroads.worldArt`:

```js
const YAW_DEGREES = Object.freeze([-30, -20, -10, 0, 10, 20, 30]);
// WORLD_GEOMETRY is also exported by this module with the exact values below.

const WORLD_ATLAS_MANIFEST = Object.freeze({
  droneScout: { path: './assets/world/drone-scout.png', category: 'drone', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
  droneStriker: { path: './assets/world/drone-striker.png', category: 'drone', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
  turretSentry: { path: './assets/world/turret-sentry.png', category: 'turret', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
  turretHeavy: { path: './assets/world/turret-heavy.png', category: 'turret', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
  barrierRail: { path: './assets/world/barrier-rail.png', category: 'wallLow', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
  barrierCrate: { path: './assets/world/barrier-crate.png', category: 'wallLow', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
  structureReactor: { path: './assets/world/structure-reactor.png', category: 'wallHigh', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
  structureTower: { path: './assets/world/structure-tower.png', category: 'wallHigh', variant: 1, frames: 7, frameWidth: 512, frameHeight: 512 },
  gapEdge: { path: './assets/world/gap-edge.png', category: 'gap', variant: 0, frames: 7, frameWidth: 512, frameHeight: 512 },
});

selectYawBlend({ worldX, zRel })
// -> Object.freeze({ angle, lowerIndex, upperIndex, mix })

atlasFrameRect(metadata, frameIndex)
// -> Object.freeze({ sx, sy: 0, sw: 512, sh: 512 })

buildSpriteDrawPlan({ metadata, worldX, zRel, destination, alpha = 1 })
// -> frozen { lower, upper, mix, destination, alpha }; lower/upper contain source rectangles.

worldSpriteDrawRect({ projectPoint, worldX, zRel, worldWidth, worldHeight, baseY = 0 })
// -> frozen { x, y, width, height }, derived from projected left/right/base/top points.

variantKey(category, segmentIndex, stableLaneKey)
// -> deterministic manifest key; enemies keep their immutable spawn-lane key across rest/warn/move.
```

`src/presentation.js` extends `preloadVisualAssets()` without changing `fallbackRequired`:

```js
result.assets.world[atlasKey] // { path, loaded, element }
result.world                 // { loaded: [...keys], fallback: [...keys], categoryReady: { drone, turret, wallLow, wallHigh, gap } }
result.fallbackRequired      // still means preferred player-ship frames unavailable
resolveWorldAtlas(result, atlasKey) // Image element or null
```

`tools/generate-music.js` continues to export `exactFrameCount`, `renderScore`, `writeStereoWav`, and `defaultOutputDirectory`, and adds pure metrics used by tests:

```js
measurePeak(stem) // number in [0, 1]
measurePulse(stem, sampleRate, bpm) // { earlyPulseRatio, transientRms, sustainedRms }
measureIntenseMixPeak(stems, { atmosphere, drive, overdrive, busGain }) // number
```

The committed score is exactly `128 BPM`, `4/4`, `32 bars`, `44100 Hz`, `2646000` frames, with peak targets `0.68 / 0.72 / 0.66`. Runtime mixes are exactly:

```js
menu/game over: { atmosphere: 1.00, drive: 0.00, overdrive: 0.00, cutoff: 4200 }
normal play:    { atmosphere: 0.72, drive: 0.92, overdrive: 0.18, cutoff: 8000 }
intense play:   { atmosphere: 0.68, drive: 1.00, overdrive: 0.78, cutoff: 14000 }
music bus: 0.55
ramp: 0.3 seconds
```

The runtime atlases are exactly `3584 x 512` PNGs: seven `512 x 512` frames ordered `-30, -20, -10, 0, 10, 20, 30` degrees from left to right. Each has transparent padding on all four outer edges and zero RGB wherever alpha is zero.

Preferred sprite geometry is fixed in world units and never inferred from PNG padding:

```js
const WORLD_GEOMETRY = Object.freeze({
  drone: Object.freeze({ worldWidth: 380, worldHeight: 360, baseY: 140 }),
  turret: Object.freeze({ worldWidth: 489.6, worldHeight: 1900, baseY: 0 }),
  wallLow: Object.freeze({ worldWidth: 576, worldHeight: 600, baseY: 0 }),
  wallHigh: Object.freeze({ worldWidth: 576, worldHeight: 2000, baseY: 0 }),
});
```

`489.6` is `0.68 * 720` lane units and `576` is `0.8 * 720`, matching the current projected bases. Drones add the existing deterministic `±40` world-unit bob to `baseY` only when decorative motion is enabled. Upright obstacles keep the existing projected `zNear/zFar` ground footprint and place the sprite at `zMid`; the footprint, not transparent artwork, communicates the collision segment.

Performance budgets are part of acceptance: each compressed atlas is at most 2 MiB and all nine total at most 18 MiB; decoded RGBA memory is recorded as approximately 63 MiB; destinations below one CSS pixel or outside the viewport are culled before `drawImage`; exact yaw boundaries use one draw call; maximum-density 960x600 and 1280x800 runs must remain at or below 1.15 times the pre-change p95 Canvas render time and below 25 ms p95 over 30 seconds on the same machine.

---

### Task 1: Mission Actions, Shortcut Hints, and Removal of the Yellow Frame

**Files:**
- Modify: `src/i18n.js`
- Modify: `src/presentation.js`
- Modify: `styles/game.css`
- Modify: `tests/i18n.test.js`
- Modify: `tests/presentation.test.js`
- Modify: `tests/assets.test.js`
- Modify: `THIRD_PARTY_NOTICES.md`
- Delete: `assets/ui/button-frame-gold.png`

**Interfaces:**
- Produces `.mission-action`, `.shortcut-hint`, `.keycap`, `aria-keyshortcuts="Enter Space"`, and `aria-keyshortcuts="Escape"`.
- Keeps `.primary-action` as the dark-glass/cyan dialog action used by rename/save.

- [ ] **Step 1: Add failing bilingual and DOM assertions**

Add catalog assertions for `shortcut.startRestart` and `shortcut.returnMenu`, then assert that `createCommandCenter()` creates visible keycap spans without concatenating shortcut text into the translated action label:

```js
assert.equal(createTranslator('en').t('shortcut.startRestart'), 'Enter / Space');
assert.equal(createTranslator('zh-CN').t('shortcut.returnMenu'), 'Esc');
assert.match(ui.startButton.className, /mission-action/);
assert.equal(ui.startButton.getAttribute('aria-keyshortcuts'), 'Enter Space');
assert.equal(ui.restartButton.getAttribute('aria-keyshortcuts'), 'Enter Space');
assert.equal(ui.menuButton.getAttribute('aria-keyshortcuts'), 'Escape');
assert.equal(ui.startButton.children[1].className, 'shortcut-hint');
assert.equal(ui.startButton.children[1].children[0].textContent, 'Enter');
assert.equal(ui.startButton.children[1].children[2].textContent, 'Space');
```

Update the asset test so the selected UI list is only panel and meter, the preloader count drops by one before world atlases are added, and both the CSS and notices must not mention `button-frame-gold.png`.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/i18n.test.js tests/presentation.test.js tests/assets.test.js
```

Expected: FAIL because the shortcut translations, DOM children, ARIA metadata, mission modifier, and gold-frame removal do not exist.

- [ ] **Step 3: Implement the minimal accessible mission controls**

Add `makeActionContent(documentObject, button, label, shortcut)` in `src/presentation.js`. It replaces button children with a label span and a shortcut span. Use it from `renderCommandCenter()` for start, restart, and return-menu, so changing locale updates both visible label and hint. The start and restart buttons use `primary-action mission-action`; the menu button remains `secondary-action` with the `Esc` hint.

```js
function makeActionContent(documentObject, button, label, shortcut) {
  const labelNode = makeElement(documentObject, 'span', { className: 'action-label' });
  const hintNode = makeElement(documentObject, 'span', { className: 'shortcut-hint' });
  const keys = String(shortcut).split(' / ');
  labelNode.textContent = label;
  const keycaps = [];
  keys.forEach((key, index) => {
    if (index > 0) {
      const separator = makeElement(documentObject, 'span', { className: 'key-separator' });
      separator.textContent = ' / ';
      keycaps.push(separator);
    }
    const keycap = makeElement(documentObject, 'kbd', { className: 'keycap' });
    keycap.textContent = key;
    keycaps.push(keycap);
  });
  hintNode.replaceChildren(...keycaps);
  button.replaceChildren(labelNode, hintNode);
}

ui.startButton.setAttribute('aria-keyshortcuts', 'Enter Space');
ui.restartButton.setAttribute('aria-keyshortcuts', 'Enter Space');
ui.menuButton.setAttribute('aria-keyshortcuts', 'Escape');
makeActionContent(documentObject, ui.startButton, translator.t('menu.start'), translator.t('shortcut.startRestart'));
makeActionContent(documentObject, ui.restartButton, translator.t('result.restart'), translator.t('shortcut.startRestart'));
makeActionContent(documentObject, ui.menuButton, translator.t('result.menu'), translator.t('shortcut.returnMenu'));
```

Use the exact approved CSS:

```css
.mission-action {
  border-color: #7797ff;
  color: #f5f8ff;
  background: linear-gradient(110deg, #203e94, #5845b7);
  box-shadow: inset 0 0 1rem rgba(119, 151, 255, 0.2), 0 0 1rem rgba(88, 69, 183, 0.22);
}
.mission-action:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 3px;
  box-shadow: 0 0 0 1px var(--space-0), 0 0 18px rgba(93, 231, 255, 0.38);
}
.mission-action:disabled { color: #aeb9d8; background: linear-gradient(110deg, #182858, #352d68); opacity: 0.72; }
```

Add darker/lighter hover and active gradients without yellow. Keep `.primary-action` dark glass/cyan for rename/save. Add a test-side WCAG contrast helper and assert `#f5f8ff` against both gradient endpoints is at least `4.5:1`. Hide only `.shortcut-hint` under `@media (pointer: coarse) and (max-width: 639px)`; do not remove ARIA metadata.

Remove the manifest entry, CSS URL, selected-source notice line, test hash entry, and binary file.

- [ ] **Step 4: Run GREEN and shortcut regression tests**

Run:

```bash
node --test tests/i18n.test.js tests/presentation.test.js tests/assets.test.js tests/game-audio-ui.test.js
npm run check
```

Expected: PASS; existing repeat, text-input, dialog, `Enter`/`Space`, and `Escape` behavior remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.js src/presentation.js styles/game.css tests/i18n.test.js tests/presentation.test.js tests/assets.test.js THIRD_PARTY_NOTICES.md assets/ui/button-frame-gold.png
git commit -m "feat: refine mission actions and shortcut hints"
```

---

### Task 2: Lock the 128 BPM Score Contract and Rhythm Metrics

**Files:**
- Modify: `assets/audio/source/nebula-cruise-score.json`
- Modify: `tools/generate-music.js`
- Modify: `tests/music-generator.test.js`

**Interfaces:**
- Preserves deterministic stereo stem rendering and adds `measurePeak`, `measurePulse`, and `measureIntenseMixPeak`.
- Produces exactly `2,646,000` samples per channel per stem.

- [ ] **Step 1: Write the failing score and pulse tests**

Assert the exact contract and deterministic output:

```js
assert.equal(score.bpm, 128);
assert.equal(score.bars, 32);
assert.equal(exactFrameCount(score), 2646000);
assert.deepEqual(score.normalization, { atmosphere: 0.68, drive: 0.72, overdrive: 0.66 });

const first = renderScore(score);
const second = renderScore(score);
assert.deepEqual(first.drive.left, second.drive.left);
assert.equal(measurePeak(first.atmosphere).toFixed(2), '0.68');
assert.equal(measurePeak(first.drive).toFixed(2), '0.72');
assert.equal(measurePeak(first.overdrive).toFixed(2), '0.66');
const pulse = measurePulse(first.drive, score.sampleRate, score.bpm);
assert.ok(pulse.earlyPulseRatio >= 1.35);
assert.ok(pulse.transientRms > pulse.sustainedRms);
assert.ok(measureIntenseMixPeak(first, {
  atmosphere: 0.68, drive: 1, overdrive: 0.78, busGain: 0.55,
}) <= 0.95);
```

The early-pulse window covers the first two seconds and compares beat-centered transient windows with inter-beat windows. Keep the formula in the test and implementation explicit so the guardrail measures rhythm rather than total loudness.

- [ ] **Step 2: Run RED**

Run: `node --test tests/music-generator.test.js`

Expected: FAIL on 112 BPM / 3,024,000 frames and missing metric exports.

- [ ] **Step 3: Rewrite the deterministic arrangement**

Set the score to 128 BPM, retain E minor, and revise the renderer so:

- `atmosphere` uses shorter pad attack/release and the identifying motif;
- `drive` supplies a kick on every beat with syncopated bass, backbeat, eighth-note high pattern, and restrained sixteenth pickups from bar 1;
- `overdrive` adds sixteenth-note arp, denser percussion, and a tension counter-line;
- normalization reads the exact per-stem targets from the score rather than hard-coding one shared value;
- the existing 20 ms edge safety fade remains.

Implement metrics as pure array scans; they must not mutate stems or depend on codecs.

Use this exact score shape:

```json
{
  "title": "Nebula Cruise",
  "bpm": 128,
  "beatsPerBar": 4,
  "bars": 32,
  "sampleRate": 44100,
  "key": "E minor",
  "progression": ["Em(add9)", "Cmaj7", "G", "D", "Em", "C", "Am7", "B7"],
  "normalization": { "atmosphere": 0.68, "drive": 0.72, "overdrive": 0.66 },
  "seed": 1312965196
}
```

The renderer uses explicit beat grids and score-owned normalization:

```js
const EIGHTH_GRID = Object.freeze([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
const SIXTEENTH_PICKUPS = Object.freeze([0.75, 1.75, 2.75, 3.75]);

for (const beatOffset of EIGHTH_GRID) {
  const start = barStart + beatOffset * beat;
  const note = chord[Math.round(beatOffset * 2) % chord.length] - 12;
  addTone(drive, sampleRate, start, beat * 0.38, note, 0.12, {
    pan: beatOffset % 1 === 0 ? -0.08 : 0.08,
    attack: 0.006,
    release: 0.08,
    brightness: 0.28,
  });
  if (beatOffset % 1 === 0) addKick(drive, sampleRate, start, beatOffset === 0 ? 0.24 : 0.17);
  if (beatOffset === 1 || beatOffset === 3) addNoiseHit(drive, sampleRate, start, 0.14, 0.13, driveRandom, 0.08);
}
for (const beatOffset of SIXTEENTH_PICKUPS) {
  addNoiseHit(drive, sampleRate, barStart + beatOffset * beat, 0.03, 0.024, driveRandom);
}

return {
  atmosphere: normalize(atmosphere, score.normalization.atmosphere),
  drive: normalize(drive, score.normalization.drive),
  overdrive: normalize(overdrive, score.normalization.overdrive),
};
```

Implement `measurePulse()` with fixed 35 ms beat-centered transient windows and equally sized inter-beat windows over the first two seconds; `earlyPulseRatio` is transient RMS divided by inter-beat RMS. `measureIntenseMixPeak()` scans both channels and applies stem gains plus bus gain sample-by-sample.

- [ ] **Step 4: Run GREEN and deterministic rerender check**

Run twice into two validated temporary directories and compare WAV hashes:

```bash
node --test tests/music-generator.test.js
AUDIO_WORK_A="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-audio-a.XXXXXX")"
AUDIO_WORK_B="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-audio-b.XXXXXX")"
node tools/generate-music.js assets/audio/source/nebula-cruise-score.json "$AUDIO_WORK_A"
node tools/generate-music.js assets/audio/source/nebula-cruise-score.json "$AUDIO_WORK_B"
shasum -a 256 "$AUDIO_WORK_A"/*.wav "$AUDIO_WORK_B"/*.wav
```

Expected: PASS; corresponding stem hashes match and each renderer result reports `2646000` frames.

- [ ] **Step 5: Commit source contract only**

```bash
git add assets/audio/source/nebula-cruise-score.json tools/generate-music.js tests/music-generator.test.js
git commit -m "feat: compose rhythm-forward adaptive score"
```

Do not commit WAV intermediates.

---

### Task 3: Update Adaptive Playback Without Breaking Format Fallback

**Files:**
- Modify: `src/audio.js`
- Modify: `tests/audio.test.js`
- Modify: `tests/game-audio-ui.test.js`

**Interfaces:**
- `mixForGameState({ mode, speedRatio, danger, boost })` returns exact stem targets and cutoff.
- All parameter transitions retain the current 300 ms scheduling ramp.

- [ ] **Step 1: Write failing state-table and bus tests**

Assert exact menu, normal, and intense states, including normal-play overdrive `0.18`, the `8000` Hz normal cutoff, `0.55` music bus, and unchanged `14000` Hz intense cutoff. Retain tests that OGG is chosen only if all three OGG stems decode and otherwise a complete MP3 set is used.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/audio.test.js tests/game-audio-ui.test.js
```

Expected: FAIL because normal overdrive is zero, the cruise cutoff is 4200 Hz, and the bus is 0.72.

- [ ] **Step 3: Implement the exact mix table**

Centralize `MUSIC_BUS_GAIN = 0.55`, `MIX_RAMP_SECONDS = 0.3`, and the three frozen state targets in `src/audio.js`. Keep the existing intense predicate (`speedRatio >= 0.75 || danger || boost`) and complete-format selection. Do not add a fourth playback state or hysteresis in this pass.

```js
const MUSIC_BUS_GAIN = 0.55;
const MIX_RAMP_SECONDS = 0.3;
const MUSIC_MIX = Object.freeze({
  menu: Object.freeze({ atmosphere: 1, drive: 0, overdrive: 0, cutoff: 4200 }),
  normal: Object.freeze({ atmosphere: 0.72, drive: 0.92, overdrive: 0.18, cutoff: 8000 }),
  intense: Object.freeze({ atmosphere: 0.68, drive: 1, overdrive: 0.78, cutoff: 14000 }),
});

function mixForGameState(state = {}) {
  if (state.mode !== 'PLAYING') return MUSIC_MIX.menu;
  const speedRatio = Number.isFinite(Number(state.speedRatio)) ? Number(state.speedRatio) : 0;
  return speedRatio >= 0.75 || Boolean(state.boost) || Boolean(state.danger)
    ? MUSIC_MIX.intense : MUSIC_MIX.normal;
}
```

`rampMix()` uses `mix.cutoff` instead of duplicating the intense predicate, and graph setup initializes `musicBus.gain.value = MUSIC_BUS_GAIN` and `masterFilter.frequency.value = initialMix.cutoff`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/audio.test.js tests/game-audio-ui.test.js
npm run check
```

Expected: PASS; menu remains atmosphere-only, normal play gains an immediate pulse, and intense transitions still use the same scheduled ramp.

- [ ] **Step 5: Commit**

```bash
git add src/audio.js tests/audio.test.js tests/game-audio-ui.test.js
git commit -m "feat: energize adaptive music transitions"
```

---

### Task 4: Encode, Verify, Document, and Audition the New Music

**Files:**
- Modify: `assets/audio/nebula-cruise-atmosphere.ogg`
- Modify: `assets/audio/nebula-cruise-drive.ogg`
- Modify: `assets/audio/nebula-cruise-overdrive.ogg`
- Modify: `assets/audio/nebula-cruise-atmosphere.mp3`
- Modify: `assets/audio/nebula-cruise-drive.mp3`
- Modify: `assets/audio/nebula-cruise-overdrive.mp3`
- Modify: `docs/assets/audio-generation.md`
- Modify: `tests/assets.test.js`

**Interfaces:**
- Produces two complete synchronized three-stem sets from one deterministic WAV render.
- Documents exact encoder package/version, output hashes, measured durations, and listening checklist.

- [ ] **Step 1: Produce temporary expected outputs and update the failing binary contract**

Render and encode all six candidates into a validated temporary directory using the Task 2 generator and the encoding commands below, without replacing the committed assets. Record their SHA-256 values. Change `tests/assets.test.js` to require those six exact hashes from the repository paths and verify via `afinfo` that OGG siblings agree within 1 ms and MP3 siblings agree within 1 ms. Assert the audio document contains `128 BPM`, `2646000`, each candidate output hash, the pinned encoder, and the two-loop audition procedure.

- [ ] **Step 2: Run RED**

Run: `node --test tests/assets.test.js`

Expected: FAIL because the committed files and documentation still describe the 112 BPM render.

- [ ] **Step 3: Render and encode from one temporary source set**

Use the exact temporary candidate set from Step 1; do not render a second source set. Try the documented macOS system conversion first; if it returns the recorded `fmt?` error, use only `@ffmpeg-installer/darwin-arm64@4.1.5`, verify npm tarball SHA-1 `b7b5c262dd96d1aea4807514e1cdcf6e11f82743`, and encode OGG quality 5 plus MP3 192 kbps. Copy the six verified candidates over the repository assets only after their hashes match the Step 1 expectations. Never install or commit a package dependency.

```bash
AUDIO_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-audio.XXXXXX")"
WAV_DIR="$AUDIO_WORK_DIR/wav"
CANDIDATE_DIR="$AUDIO_WORK_DIR/candidate"
mkdir -p "$WAV_DIR" "$CANDIDATE_DIR"
node tools/generate-music.js assets/audio/source/nebula-cruise-score.json "$WAV_DIR"
npm pack @ffmpeg-installer/darwin-arm64@4.1.5 --pack-destination "$AUDIO_WORK_DIR"
FFMPEG_TARBALL="$AUDIO_WORK_DIR/ffmpeg-installer-darwin-arm64-4.1.5.tgz"
printf '%s  %s\n' 'b7b5c262dd96d1aea4807514e1cdcf6e11f82743' "$FFMPEG_TARBALL" | shasum -a 1 -c -
FFMPEG_PACKAGE_DIR="$AUDIO_WORK_DIR/ffmpeg-installer"
mkdir -p "$FFMPEG_PACKAGE_DIR"
tar -xzf "$FFMPEG_TARBALL" -C "$FFMPEG_PACKAGE_DIR" --strip-components=1
FFMPEG_BIN="$FFMPEG_PACKAGE_DIR/ffmpeg"
for stem in atmosphere drive overdrive; do
  "$FFMPEG_BIN" -hide_banner -loglevel error -y -i "$WAV_DIR/$stem.wav" -c:a libvorbis -q:a 5 "$CANDIDATE_DIR/nebula-cruise-$stem.ogg"
  "$FFMPEG_BIN" -hide_banner -loglevel error -y -i "$WAV_DIR/$stem.wav" -c:a libmp3lame -b:a 192k "$CANDIDATE_DIR/nebula-cruise-$stem.mp3"
done
shasum -a 256 "$CANDIDATE_DIR"/*
```

Update `docs/assets/audio-generation.md` with exact 60-second source-frame data, actual codec durations, output hashes, headroom result, and safe temporary-directory cleanup guard.

- [ ] **Step 4: Run technical GREEN**

Run:

```bash
node --test tests/music-generator.test.js tests/audio.test.js tests/assets.test.js
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
```

Expected: PASS; the packaged `file://` app decodes at least one complete format and reports adaptive audio ready.

- [ ] **Step 5: Present the audition gate**

Serve the worktree over HTTP and provide:

- the directly playable rendered candidate;
- the game URL for menu → normal → intense comparison;
- instructions to trigger BOOST or play until speed ratio reaches 0.75.

User acceptance requires a clear pulse within two seconds, a joyful/fast/slightly-tense feel, an obvious smooth intensity lift, audible SFX, and no seam over two loops. If one musical revision is requested, revise the score/generator, repeat Tasks 2–4 RED/GREEN checks, replace all six outputs, and update exact hashes before proceeding.

- [ ] **Step 6: Commit only after audition approval**

```bash
git add assets/audio docs/assets/audio-generation.md tests/assets.test.js
git commit -m "assets: ship approved rhythm-forward soundtrack"
```

---

### Task 5: Add the Pure World-art Atlas and Perspective Contract

**Files:**
- Create: `src/world-art.js`
- Create: `tests/world-art.test.js`
- Modify: `index.html`
- Modify: `tests/static-app.test.js`

**Interfaces:**
- Implements the exact frozen API and atlas manifest defined above.
- Does not import or mutate gameplay state.

- [ ] **Step 1: Write failing pure tests**

Cover:

```js
assert.deepEqual(YAW_DEGREES, [-30, -20, -10, 0, 10, 20, 30]);
assert.deepEqual(selectYawBlend({ worldX: 0, zRel: 6000 }), {
  angle: 0, lowerIndex: 3, upperIndex: 3, mix: 0,
});
assert.ok(selectYawBlend({ worldX: -2160, zRel: 2000 }).angle < 0);
assert.ok(selectYawBlend({ worldX: 2160, zRel: 2000 }).angle > 0);
assert.equal(selectYawBlend({ worldX: 2160, zRel: 12000 }).angle
  < selectYawBlend({ worldX: 2160, zRel: 2000 }).angle, true);
assert.deepEqual(atlasFrameRect(WORLD_ATLAS_MANIFEST.droneScout, 6), {
  sx: 3072, sy: 0, sw: 512, sh: 512,
});
```

Also test clamping at ±30 degrees, exact interpolation at ±5/±15/±25, frozen outputs, deterministic `variantKey()`, identical bottom-center destinations for both blend frames, and invalid input fallback to center view.

Test `worldSpriteDrawRect()` with a deterministic projection stub at 960x600 and 1280x800, near/far depths, all three lane regions, and every fixed geometry entry. Assert the drone base/top preserve `140 + bob` through `500 + bob`, wall/turret base remains on projected ground, no negative size is returned, and transparent padding never changes the projected collision footprint. Assert one immutable drone `stableLaneKey` selects the same variant through rest, warn, and move even after `fromLane` changes.

Assert `index.html` loads `src/world-art.js` after `presentation.js` and before `game.js` as a classic deferred script.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/world-art.test.js tests/static-app.test.js
```

Expected: FAIL because the module and script reference do not exist.

- [ ] **Step 3: Implement the minimal pure module**

Compute viewing angle with `atan2(worldX, max(1, zRel)) * 180 / Math.PI`, clamp to ±30, find its enclosing 10-degree interval, and return an exact zero-mix single frame on a yaw boundary. `buildSpriteDrawPlan()` must use one destination rectangle for both source frames so cross-fading cannot move the anchor.

```js
function selectYawBlend({ worldX = 0, zRel = 1 } = {}) {
  const x = Number.isFinite(Number(worldX)) ? Number(worldX) : 0;
  const depth = Math.max(1, Number.isFinite(Number(zRel)) ? Number(zRel) : 1);
  const angle = Math.max(-30, Math.min(30, Math.atan2(x, depth) * 180 / Math.PI));
  const exact = (angle + 30) / 10;
  const lowerIndex = Math.max(0, Math.min(6, Math.floor(exact)));
  const upperIndex = Math.max(0, Math.min(6, Math.ceil(exact)));
  const mix = lowerIndex === upperIndex ? 0 : exact - lowerIndex;
  return Object.freeze({ angle, lowerIndex, upperIndex, mix });
}

function atlasFrameRect(metadata, frameIndex) {
  const index = Math.max(0, Math.min(metadata.frames - 1, Math.trunc(frameIndex)));
  return Object.freeze({ sx: index * metadata.frameWidth, sy: 0, sw: metadata.frameWidth, sh: metadata.frameHeight });
}

function buildSpriteDrawPlan({ metadata, worldX, zRel, destination, alpha = 1 }) {
  const blend = selectYawBlend({ worldX, zRel });
  const frozenDestination = Object.freeze({
    x: Number(destination.x), y: Number(destination.y),
    width: Math.max(0, Number(destination.width)), height: Math.max(0, Number(destination.height)),
  });
  return Object.freeze({
    lower: atlasFrameRect(metadata, blend.lowerIndex),
    upper: atlasFrameRect(metadata, blend.upperIndex),
    mix: blend.mix,
    destination: frozenDestination,
    alpha: Math.max(0, Math.min(1, Number(alpha) || 0)),
  });
}

function worldSpriteDrawRect({ projectPoint, worldX, zRel, worldWidth, worldHeight, baseY = 0 }) {
  const left = projectPoint(worldX - worldWidth / 2, baseY, zRel);
  const right = projectPoint(worldX + worldWidth / 2, baseY, zRel);
  const bottom = projectPoint(worldX, baseY, zRel);
  const top = projectPoint(worldX, baseY + worldHeight, zRel);
  const width = Math.abs(right.x - left.x);
  const height = Math.abs(bottom.y - top.y);
  return Object.freeze({ x: bottom.x - width / 2, y: bottom.y - height, width, height });
}

const VARIANT_KEYS = Object.freeze({
  drone: Object.freeze(['droneScout', 'droneStriker']),
  turret: Object.freeze(['turretSentry', 'turretHeavy']),
  wallLow: Object.freeze(['barrierRail', 'barrierCrate']),
  wallHigh: Object.freeze(['structureReactor', 'structureTower']),
  gap: Object.freeze(['gapEdge']),
});

function variantKey(category, segmentIndex, stableLaneKey) {
  const keys = VARIANT_KEYS[category] || [];
  if (keys.length === 0) return null;
  const segment = Number.isInteger(segmentIndex) ? segmentIndex : 0;
  const lane = Number.isInteger(stableLaneKey) ? stableLaneKey : 0;
  return keys[Math.abs(segment * 31 + lane * 17 + category.length) % keys.length];
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/world-art.test.js tests/static-app.test.js
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add src/world-art.js tests/world-art.test.js index.html tests/static-app.test.js
git commit -m "feat: add perspective world atlas contract"
```

---

### Task 6: Acquire, Render, Verify, and Document the CC0 World Atlases

**Files:**
- Create: `tools/render-world-assets.swift`
- Create: `tools/world-assets.json`
- Create: `assets/world/drone-scout.png`
- Create: `assets/world/drone-striker.png`
- Create: `assets/world/turret-sentry.png`
- Create: `assets/world/turret-heavy.png`
- Create: `assets/world/barrier-rail.png`
- Create: `assets/world/barrier-crate.png`
- Create: `assets/world/structure-reactor.png`
- Create: `assets/world/structure-tower.png`
- Create: `assets/world/gap-edge.png`
- Create: `licenses/Quaternius-Sci-Fi-Essentials-CC0.txt`
- Create: `licenses/KayKit-Space-Base-Bits-CC0.txt`
- Create: `docs/assets/world-art.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `tests/assets.test.js`
- Modify: `tests/release-contracts.test.js`

**Interfaces:**
- `swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-a"`
- The tool prints sorted JSON containing renderer SHA-256, source hashes, and output hashes and exits nonzero for missing sources, wrong atlas geometry, nontransparent borders, or hidden RGB.

- [ ] **Step 1: Add failing renderer, world-asset, and provenance contracts**

Require the exact renderer CLI, manifest schema, atlas IDs, `3584 x 512` geometry contract, border-alpha validator, and rejection of absolute/network/source-edition paths. Assert the two official URLs, CC0, expected free archive filenames, yaw order, and reproduction command. At this RED stage, do not require output hashes that cannot exist before the renderer.

Update `tests/release-contracts.test.js` so the exact verbatim-license list contains six paths (the existing four plus the two new CC0 copies); this initially fails because the new files are absent.

- [ ] **Step 2: Run RED**

Run: `node --test tests/assets.test.js`

Expected: FAIL because the atlases, renderer, license copies, and provenance do not exist.

- [ ] **Step 3: Acquire and audit free archives outside the repository**

Create `WORLD_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-world.XXXXXX")"`. Download only from:

- `https://quaternius.com/packs/scifiessentialskit.html`
- `https://kaylousberg.itch.io/space-base-bits`

Record the resolved free archive filenames and SHA-256 values before extraction. Reject any paid/source-edition archive. Extract under `WORLD_WORK_DIR`, inventory all OBJ/MTL/texture/license files, and select the smallest coherent set that satisfies the nine committed recipes. `tools/world-assets.json` records the actual upstream relative paths and SHA-256 values; selection never relies on an undocumented filename guess.

Use the current official free upload IDs verified on 2026-08-03: Quaternius Standard `12009762` and KayKit Free `8609688`. Resolve a fresh short-lived download URL through itch.io instead of committing it:

```bash
WORLD_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-world.XXXXXX")"
mkdir -p "$WORLD_WORK_DIR/downloads" "$WORLD_WORK_DIR/extracted"

fetch_itch_free() {
  host="$1"; game_slug="$2"; upload_id="$3"; output_path="$4"; state_prefix="$5"
  cookie_file="$WORLD_WORK_DIR/$state_prefix.cookies"
  curl -sS -c "$cookie_file" -X POST "https://$host/$game_slug/download_url" \
    -H 'Content-Type: application/x-www-form-urlencoded' --data 'upload_id=0' \
    > "$WORLD_WORK_DIR/$state_prefix-page.json"
  download_page="$(jq -r '.url' "$WORLD_WORK_DIR/$state_prefix-page.json")"
  curl -sS -b "$cookie_file" -c "$cookie_file" "$download_page" \
    > "$WORLD_WORK_DIR/$state_prefix-page.html"
  csrf="$(rg -o 'name="csrf_token" value="[^"]+' "$WORLD_WORK_DIR/$state_prefix-page.html" | sed 's/.*value="//')"
  curl -sS -b "$cookie_file" -e "$download_page" -X POST \
    "https://$host/$game_slug/file/$upload_id?source=game_download" \
    --data-urlencode "csrf_token=$csrf" > "$WORLD_WORK_DIR/$state_prefix-file.json"
  signed_url="$(jq -r '.url' "$WORLD_WORK_DIR/$state_prefix-file.json")"
  curl -fL "$signed_url" -o "$output_path"
}

fetch_itch_free quaternius.itch.io sci-fi-essentials-kit 12009762 \
  "$WORLD_WORK_DIR/downloads/Sci-Fi Essentials Kit[Standard].zip" quaternius
fetch_itch_free kaylousberg.itch.io space-base-bits 8609688 \
  "$WORLD_WORK_DIR/downloads/KayKit_Space_Base_Bits_1.0_FREE.zip" kaykit
shasum -a 256 "$WORLD_WORK_DIR/downloads"/*.zip
unzip -q "$WORLD_WORK_DIR/downloads/Sci-Fi Essentials Kit[Standard].zip" -d "$WORLD_WORK_DIR/extracted/quaternius"
unzip -q "$WORLD_WORK_DIR/downloads/KayKit_Space_Base_Bits_1.0_FREE.zip" -d "$WORLD_WORK_DIR/extracted/kaykit"
find "$WORLD_WORK_DIR/extracted" -type f | LC_ALL=C sort > "$WORLD_WORK_DIR/source-inventory.txt"
```

The expected current archive hashes are Quaternius Standard `a08346d538aa39fbea9fa492e03620d1860fc6214eedd62a4f5db373ac6fca01` and KayKit Free `4f8d3e2e90a74d9a0d5262e9e09daccac320f1bcfbe4fa2837559a8ad7b98c17`. The exact license copies are `quaternius/License_Standard.txt` with SHA-256 `2687fba65dca7bbd2f9ab2fb7a8c51dd0c7c8e9acd7579415612bec43f68b3f5` and `kaykit/KayKit_Space_Base_Bits_1.0_FREE/License.txt` with SHA-256 `ab3bfedd06f2149bd9a3b78294c2797e039cdcf254979a8a4c83973a9900ea91`.

If itch.io replaces either upload, stop when the displayed free filename does not match the two names above; re-resolve the free upload ID from the official download page and record the changed ID, filename, date, and hash in provenance before continuing.

Use Quaternius for both drones, both turrets, and the compact low barrier; use KayKit for the second low barrier, both tall structures, and gap-edge kit. If a chosen model is composed from multiple upstream parts, list every part and transform in the recipe. Copy the exact upstream CC0 text files byte-for-byte into the two declared license paths, then record their SHA-256 values in both notices and tests before any derived output is accepted.

- [ ] **Step 4: Implement deterministic offline rendering**

Load OBJ/MTL/texture sources with SceneKit. Normalize by visible bounding box, place the object on a common ground anchor, and render seven orthographic yaw views at `-30,-20,-10,0,10,20,30` with one fixed camera pitch. Turret recipes render the armored base/body without baking a fixed aiming barrel; the projected runtime barrel remains a separate state-readable layer. Apply deep navy structural material, violet/magenta hostile seams, cyan rim light, and red hostile lights. Composite all seven `512 x 512` transparent frames horizontally, premultiply correctly, then clear RGB under alpha zero.

The renderer contains the exact `WORLD_GEOMETRY` category dimensions so sprite appearance can be scaled from existing world constants without changing collision geometry. It accepts no network URL and no absolute path in the committed manifest. The `gap-edge` output is a seven-view atlas of one short modular deck-edge unit, not a full opening texture; runtime repeats small modules along projected boundaries.

The audited Standard/Free archives provide these exact nine source recipes:

| Runtime atlas | Exact source components | Exact texture set |
|---|---|---|
| `drone-scout` | `quaternius/OBJ/Enemy_EyeDrone.obj` + `.mtl` | `quaternius/Textures/T_Enemies_{BaseColor,Emissive,Normal,ORM}.png` |
| `drone-striker` | `quaternius/OBJ/Enemy_QuadShell.obj` + `.mtl` | same Quaternius enemy texture set |
| `turret-sentry` | `quaternius/OBJ/Prop_Crate_Large.obj` base + `quaternius/OBJ/Prop_SatelliteDish.obj` mount, with their `.mtl` files | `T_Props_Crates_{BaseColor,Normal,ORM}.png` plus `T_Trim_01_{BaseColor,Normal,ORM}.png`, `T_Trim_02_{BaseColor,Normal,ORM}.png`, and `T_Trim_03_{Dark,Normal,ORM}.png` under `quaternius/Textures/` |
| `turret-heavy` | `quaternius/OBJ/Prop_Barrel2_Closed.obj` base + `quaternius/OBJ/Prop_Mine.obj` mount, with their `.mtl` files | `quaternius/Textures/T_Props_Batch1_{BaseColor,Normal,ORM}.png` and `T_Props_Batch2_{BaseColor,Emissive,Normal,ORM}.png` |
| `barrier-rail` | `quaternius/OBJ/Prop_Crate_Tarp_Large.obj` + `.mtl` | Quaternius crate texture set above |
| `barrier-crate` | `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/containers_B.obj` + `.mtl` | `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/spacebits_texture.png` |
| `structure-reactor` | `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/drill_structure.obj` + `.mtl` | same KayKit OBJ atlas |
| `structure-tower` | `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/structure_tall.obj` + `.mtl` | same KayKit OBJ atlas |
| `gap-edge` | `kaykit/KayKit_Space_Base_Bits_1.0_FREE/Assets/obj/terrain_low.obj` + `.mtl` | same KayKit OBJ atlas |

The committed manifest uses `components` so composite turret bodies remain reproducible. Translations are measured in each normalized component's height before the final combined normalization:

```json
{
  "version": 1,
  "frame": { "width": 512, "height": 512, "yawDegrees": [-30, -20, -10, 0, 10, 20, 30] },
  "assets": [
    {
      "id": "drone-scout",
      "sourceFamily": "quaternius-sci-fi-essentials-standard",
      "category": "drone",
      "components": [{
        "model": "quaternius/OBJ/Enemy_EyeDrone.obj",
        "material": "quaternius/OBJ/Enemy_EyeDrone.mtl",
        "textures": [
          "quaternius/Textures/T_Enemies_BaseColor.png",
          "quaternius/Textures/T_Enemies_Emissive.png",
          "quaternius/Textures/T_Enemies_Normal.png",
          "quaternius/Textures/T_Enemies_ORM.png"
        ],
        "scale": 1.0,
        "rotationDegrees": [0, 0, 0],
        "translation": [0, 0, 0]
      }],
      "hideNodes": []
    }
  ]
}
```

The remaining eight entries use the exact table paths. Their single components use identity transforms. `turret-sentry` places its normalized dish component at scale `0.62`, rotation `[-12, 0, 0]`, translation `[0, 0.72, 0]` above the identity crate base; `turret-heavy` places its mine component at scale `0.74`, rotation `[0, 0, 0]`, translation `[0, 0.68, 0]` above the identity barrel base. The runtime projected barrel supplies aim direction, so these source mounts remain body detail rather than a baked weapon direction.

- [ ] **Step 5: Render twice to temporary outputs and prove determinism**

Run:

```bash
mkdir -p "$WORLD_WORK_DIR/render-a" "$WORLD_WORK_DIR/render-b"
swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-a"
swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-b"
for atlas in drone-scout drone-striker turret-sentry turret-heavy barrier-rail barrier-crate structure-reactor structure-tower gap-edge; do
  cmp "$WORLD_WORK_DIR/render-a/$atlas.png" "$WORLD_WORK_DIR/render-b/$atlas.png"
done
shasum -a 256 "$WORLD_WORK_DIR/render-a"/*.png
```

Expected: every `cmp` exits 0. Record compressed per-atlas/total sizes and reject the render if any atlas exceeds 2 MiB or the total exceeds 18 MiB.

- [ ] **Step 6: Inspect all frames, freeze hashes, and make the repository paths GREEN**

Create one contact sheet from the nine atlases and inspect at original resolution. Reject clipped geometry, opaque backgrounds, inconsistent ground anchors, materially different lighting, unclear silhouettes, excessive glow, or visual extents that imply a wider collision footprint.

After visual inspection, add the nine literal output hashes plus both archive/source/license hashes to `tests/assets.test.js`, `docs/assets/world-art.md`, and `THIRD_PARTY_NOTICES.md`. Run `node --test tests/assets.test.js tests/release-contracts.test.js` and observe RED because `assets/world/` is still absent. Then copy only `render-a/*.png` into `assets/world/` and run:

```bash
node --test tests/assets.test.js tests/world-art.test.js tests/release-contracts.test.js
npm run check
```

Expected: PASS; every literal hash agrees across file, test, provenance, and notices.

- [ ] **Step 7: Commit source records, renderer, and binary outputs together**

```bash
git add tools/render-world-assets.swift tools/world-assets.json assets/world licenses docs/assets/world-art.md THIRD_PARTY_NOTICES.md tests/assets.test.js tests/release-contracts.test.js
git commit -m "assets: add licensed hostile world atlases"
```

Confirm `git status --short` contains no archive, extracted model, `.app`, contact sheet, or temporary render.

---

### Task 7: Preload World Atlases With Independent Fallback Diagnostics

**Files:**
- Modify: `src/presentation.js`
- Modify: `src/game.js`
- Modify: `app/main.swift`
- Modify: `tests/assets.test.js`
- Modify: `tests/presentation.test.js`
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/app-resources-smoke.sh`
- Modify: `tests/app-wkwebview-smoke.sh`

**Interfaces:**
- Extends the preload result with `assets.world`, `world.loaded`, `world.fallback`, and `world.categoryReady`.
- Adds `resolveWorldAtlas(visualAssets, atlasKey)`; preserves `fallbackRequired` as player-ship-only.

- [ ] **Step 1: Write failing preload/fallback tests**

Use fake images to prove:

- all nine world atlas paths are queued;
- all-success reports nine loaded atlas keys and every category ready;
- one failed drone variant leaves the second drone loaded and other categories ready;
- a fully failed category reports only that category unavailable;
- timeout settles every pending image;
- `fallbackRequired` remains false when ship frames load even if all world atlases fail;
- the returned nested structures are frozen;
- fixed preload totals reflect two ship + two UI + six icons + nine world + one font assets.
- release diagnostics report `scripts.worldArt === true`, all nine preferred atlas keys loaded, `world.fallback` empty, and all five `categoryReady` values true.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/assets.test.js tests/presentation.test.js tests/game-audio-ui.test.js
```

Expected: FAIL because `world` is absent from states, queues, result, and diagnostics.

- [ ] **Step 3: Implement category-scoped loading**

Import atlas metadata from `root.Skyroads.worldArt` in the browser and CommonJS `require('./world-art.js')` in tests without introducing ES modules. Queue every atlas through the existing image loader. Derive category readiness from at least one loaded variant for `drone`, `turret`, `wallLow`, and `wallHigh`, and the single `gapEdge` atlas for `gap`.

Expose loaded/fallback keys in stable manifest order. Add them to the existing diagnostic snapshot without changing existing audio or player fallback fields.

```js
const worldArt = root.Skyroads && root.Skyroads.worldArt;
const worldManifest = worldArt ? worldArt.WORLD_ATLAS_MANIFEST : {};
const states = { ship: {}, ui: {}, icons: {}, world: {}, font: {} };
for (const [key, metadata] of Object.entries(worldManifest)) queueImage('world', key, metadata.path);

const worldKeys = Object.keys(worldManifest);
const loaded = worldKeys.filter((key) => assets.world[key].loaded);
const fallback = worldKeys.filter((key) => !assets.world[key].loaded);
const categoryReady = Object.freeze(Object.fromEntries(
  ['drone', 'turret', 'wallLow', 'wallHigh', 'gap'].map((category) => [
    category,
    worldKeys.some((key) => worldManifest[key].category === category && assets.world[key].loaded),
  ]),
));
```

Add `worldArt: Boolean(globalThis.Skyroads.worldArt)` to diagnostic scripts and expose the frozen `world` result under `diagnostics.visualAssets.world`. Extend `app/main.swift` and `tests/app-wkwebview-smoke.sh` to require `worldArt`, nine loaded keys, zero preferred fallbacks, and every category ready. Add `src/world-art.js` plus all nine atlas paths to the explicit resource-smoke inventory; recursive `assets/` comparison remains the final package-parity check.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/assets.test.js tests/presentation.test.js tests/game-audio-ui.test.js
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
```

- [ ] **Step 5: Commit**

```bash
git add src/presentation.js src/game.js app/main.swift tests/assets.test.js tests/presentation.test.js tests/game-audio-ui.test.js tests/app-resources-smoke.sh tests/app-wkwebview-smoke.sh
git commit -m "feat: preload world art with scoped fallbacks"
```

---

### Task 8: Render Drones and Turrets With Perspective and Direction Telegraphs

**Files:**
- Create: `tests/world-render.test.js`
- Modify: `src/game.js`
- Modify: `tests/player-render.test.js`
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/input.test.js`

**Interfaces:**
- `drawEnemy()` selects the deterministic category variant and calls a shared bottom-center atlas renderer when available.
- Existing procedural drone/turret functions remain callable fallbacks.
- Direction cues are projected independently from sprite artwork.

- [ ] **Step 1: Write failing real-render tests**

Execute the real game source in the existing VM/Canvas harness and record `drawImage()` source/destination arguments. Cover loaded and missing atlases, left/center/right positions, near/far depth, variant determinism, and depth-sort preservation.

For a drone in `warn`, assert all three cues: bank sign equals move direction, chevron points toward `toLane`, and landing marker is anchored at the projected `toLane` while `enemyLane()` remains `fromLane`. For `move`, assert sprite position follows `enemyLane()`. In reduced motion, assert bob/pulse time freezes while bank, chevron, and marker still draw. Assert `visualVariant` is assigned from segment index plus immutable spawn lane and remains unchanged across rest → warn → move → rest.

Retain exact hitbox assertions:

```js
assert.equal(hitboxHalfWidthForEnemy('drone'), 0.22);
assert.equal(hitboxHalfWidthForEnemy('turret'), 0.26);
```

and exact `0.6 / 0.4` state timing assertions.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/world-render.test.js tests/player-render.test.js tests/game-audio-ui.test.js tests/input.test.js
```

Expected: FAIL because enemies never draw atlas images and no projected destination marker exists.

- [ ] **Step 3: Integrate loaded enemy atlases**

Factor the current procedural enemy bodies into named fallback functions without altering their draw order. Add a shared `drawWorldAtlasSprite()` that consumes `buildSpriteDrawPlan()`, clips alpha to `[0,1]`, draws the lower frame at `1-mix`, the upper frame at `mix`, restores Canvas state, and returns `false` if any required image/metadata is unavailable.

Use `CONFIG.DRONE_HEIGHT`, `CONFIG.TURRET_HEIGHT`, and the exact `WORLD_GEOMETRY` table with `worldSpriteDrawRect()`. Drones use `zMid`, `baseY = 140 + bob`, and height `360`; turrets use `zMid`, ground base, height `CONFIG.TURRET_HEIGHT`, and keep their existing `zNear/zFar` ground footprint. Keep shadow, warning, separately drawn turret barrel aim, muzzle, projectile origin, and collision debug in projected world space. The drone art may bank visually but its bottom-center anchor and collision lane remain authoritative.

```js
const destination = worldArt.worldSpriteDrawRect({
  projectPoint: project,
  worldX: cx,
  zRel: zMid,
  worldWidth: geometry.worldWidth,
  worldHeight: geometry.worldHeight,
  baseY: geometry.baseY + bob,
});
drawWorldAtlasSprite(ctx, atlasKey, { worldX: cx, zRel: zMid, destination, alpha: 1 });

function drawWorldAtlasSprite(ctx, atlasKey, placement) {
  const worldArt = globalThis.Skyroads.worldArt;
  const presentation = globalThis.Skyroads.presentation;
  const metadata = worldArt.WORLD_ATLAS_MANIFEST[atlasKey];
  const image = presentation.resolveWorldAtlas(STATE.visualAssets, atlasKey);
  if (!metadata || !image) return false;
  const plan = worldArt.buildSpriteDrawPlan({ metadata, ...placement });
  ctx.save();
  try {
    ctx.globalAlpha = Math.max(0, Math.min(1, plan.alpha * (1 - plan.mix)));
    ctx.drawImage(image, plan.lower.sx, plan.lower.sy, plan.lower.sw, plan.lower.sh,
      plan.destination.x, plan.destination.y, plan.destination.width, plan.destination.height);
    if (plan.mix > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, plan.alpha * plan.mix));
      ctx.drawImage(image, plan.upper.sx, plan.upper.sy, plan.upper.sw, plan.upper.sh,
        plan.destination.x, plan.destination.y, plan.destination.width, plan.destination.height);
    }
  } finally {
    ctx.restore();
  }
  return true;
}
```

`drawEnemy()` computes `lane = enemyLane(e)` once, uses it for projected placement and cue geometry, and calls `drawProceduralDrone()` or `drawProceduralTurret()` only when the atlas draw returns `false`.

At enemy creation, set `visualVariant: worldArt.variantKey(type, index, lane)` once; rendering never derives a variant from mutable `fromLane`, `toLane`, or `enemyLane()`. Cull a destination that is outside the viewport or below one CSS pixel, and skip the upper `drawImage()` entirely when `mix === 0`.

- [ ] **Step 4: Run GREEN and gameplay-geometry regression**

Run:

```bash
node --test tests/world-render.test.js tests/player-render.test.js tests/game-audio-ui.test.js tests/input.test.js
npm run check
```

Expected: PASS; loaded sprites and category fallbacks share behavior and geometry.

- [ ] **Step 5: Commit**

```bash
git add src/game.js tests/world-render.test.js tests/player-render.test.js tests/game-audio-ui.test.js tests/input.test.js
git commit -m "feat: render perspective hostile units"
```

---

### Task 9: Render Low Barriers, High Structures, Gap Edges, and Harmonized Pickups

**Files:**
- Modify: `src/game.js`
- Modify: `tests/world-render.test.js`
- Modify: `tests/game-audio-ui.test.js`
- Modify: `tests/input.test.js`

**Interfaces:**
- `WALL_LOW` and `WALL_HIGH` use deterministic variant atlases with existing projected widths/heights.
- `GAP` retains its exact projected quadrilateral and receives source-derived edge decoration only.
- Fuel/reward symbols keep existing silhouettes and behavior.

- [ ] **Step 1: Add failing per-category render and geometry tests**

Assert loaded/fallback rendering for all low/high variants, proper yaw change by lane/depth, deterministic cosmetic choice without additional `Math.random()` calls, and correct depth order.

For gaps, capture the four existing projected opening corners before and after decoration and assert exact equality. Cover one-lane gaps, bridge runs, and full-width gaps. Preserve collision thresholds `600`, `2000`, and gap-safe height `200`, generation constants, safe-lane invariants, and projectile destruction behavior.

Add draw-style assertions that fuel and BOOST/SLOW/TRIPLE/MAGNET still use their current icon shapes but share navy metal rims, cyan environment reflection, and semantic glow colors.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/world-render.test.js tests/game-audio-ui.test.js tests/input.test.js
```

Expected: FAIL because barriers/structures/gaps still use only the old procedural presentation.

- [ ] **Step 3: Integrate upright obstacles and projected gap edges**

Use the same bottom-center atlas path for walls, scaled from `CONFIG.WALL_LOW_HEIGHT` and `CONFIG.WALL_HIGH_HEIGHT`. Retain existing procedural functions as per-category fallback and keep particles/destruction effects above the base sprite.

Keep the void and the four projected gap corners authoritative. Do not try to affine-warp one square frame into a perspective trapezoid. Split each of the four projected boundaries into short screen-space intervals of at most 48 CSS pixels; for each interval, select the modular `gap-edge` view, interpolate scale from its two endpoints, and draw one rotated/scaled edge unit along the boundary tangent. Leave the stretchable void/depth/ember treatment procedural. Never replace the support quadrilateral with a screen-aligned sprite.

Update only pickup gradients/rims/glows; do not change icon silhouette, collision radius, duration, spawn, or color meaning.

```js
const gapCorners = Object.freeze({
  nearLeft: project(x0, 0, zNear),
  nearRight: project(x1, 0, zNear),
  farLeft: project(x0, 0, zFar),
  farRight: project(x1, 0, zFar),
});
drawProceduralGapVoid(ctx, gapCorners);
if (!drawTessellatedGapEdges(ctx, gapCorners, 'gapEdge', 48)) drawProceduralGapEdges(ctx, gapCorners);
```

`drawTessellatedGapEdges()` draws independent short units along near, far, left, and right edges, restores the Canvas transform in `finally`, and never returns or writes collision data. Tests assert no module crosses into the supported road polygon, adjoining modules overlap by at most one CSS pixel to avoid seams, and bridge/full-gap edges stay inside the Canvas.

- [ ] **Step 4: Run GREEN and full game-logic regression**

Run:

```bash
node --test tests/world-render.test.js tests/game-audio-ui.test.js tests/input.test.js
npm test
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add src/game.js tests/world-render.test.js tests/game-audio-ui.test.js tests/input.test.js
git commit -m "feat: polish perspective hazards and structures"
```

---

### Task 10: Document the V1.1 Presentation and Bilingual Controls

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `tests/static-app.test.js`

**Interfaces:**
- English remains the default README; each README links to the other at the top.
- Both describe the same V1.1 polish features, discoverable start/restart/return shortcuts, local-only ranking, adaptive score, and licensed local assets. Pause remains absent because it is outside this approved pass.

- [ ] **Step 1: Add failing documentation parity assertions**

Extend the static test to require both README files to name `V1.1`, `Enter`, `Space`, `Esc`, the local Top 15 limitation, and `THIRD_PARTY_NOTICES.md`, while retaining their reciprocal language links. Assert neither new section claims a `P` pause shortcut.

- [ ] **Step 2: Run RED**

Run: `node --test tests/static-app.test.js`

Expected: FAIL because the new presentation pass and visible shortcuts are not yet documented in both languages.

- [ ] **Step 3: Update equivalent human-facing documentation**

Add a compact V1.1 section in each language covering:

- held movement and all keyboard/touch shortcuts;
- `Enter`/`Space` start/restart and `Esc` return;
- local-only Top 15 and remembered player name;
- automatic Chinese/English selection and manual switch;
- faster adaptive music and locally packaged CC0 world art;
- browser/local run and macOS build commands;
- third-party notice link and asset-license boundary.

Review the two documents manually for meaning parity; do not machine-translate one into unchecked prose.

Use these exact section headings so the parity test is stable:

```markdown
## V1.1 — Rhythm and World Polish
## Controls
## Local Top 15
## Language
## Assets and licenses
```

```markdown
## V1.1 — 节奏与场景优化
## 操作方式
## 本机 Top 15
## 语言
## 素材与许可
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/static-app.test.js
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md tests/static-app.test.js
git commit -m "docs: describe V1.1 rhythm and world polish"
```

---

### Task 11: Full Verification, Real Screenshot, Playable Review, and PR Update

**Files:**
- Modify only files required by defects found during verification.
- Update this plan’s checkboxes as tasks land.

**Interfaces:**
- Produces a clean pushed PR branch, a directly playable local URL, approved audio, and a real `1280 x 800` game screenshot.
- Does not merge PR #1 or claim production GitHub Pages is updated before merge/deploy.

- [ ] **Step 1: Run the complete automated suite**

From the repository root:

```bash
npm test
npm run check
bash tests/app-universal-smoke.sh
bash tests/app-signature-smoke.sh
bash tests/app-resources-smoke.sh
bash tests/app-wkwebview-smoke.sh
git diff --check main...HEAD
```

Expected: every command exits 0; no preferred audio/world asset is missing in the packaged smoke result.

- [ ] **Step 2: Run browser and packaged-app QA**

Test `en` and `zh-CN` at `960x600`, `1280x800`, `1440x900`, and `1920x1080`, normal and reduced motion. Cover:

- pointer, touch, held movement, reverse, jump, and shoot/charge;
- `Enter`/`Space` start/restart and `Esc` return, including held-key repeat, input focus, and open dialogs;
- drone left/right warning and movement at low and maximum speed;
- turret, low wall, high wall, one-lane gap, bridge, and full-gap views across left/center/right lanes and near/far depth;
- visible-clearance agreement with collisions and projectiles;
- normal and intense music, SFX clarity, mute persistence, complete-format fallback;
- local Top 15, remembered name, locale persistence, storage failure fallback;
- network-offline browser reload and packaged `file://` launch.

Before and after the world-art integration, record `performance.now()` around Canvas `render()` for a fixed 30-second maximum-density deterministic scene at 960x600 and 1280x800. Sort the samples and report p50/p95. Acceptance requires candidate p95 at or below `min(25 ms, baseline p95 * 1.15)`, a single atlas draw on exact yaw boundaries, no draw for sub-one-pixel/offscreen destinations, every compressed atlas at most 2 MiB, and all nine at most 18 MiB.

- [ ] **Step 3: Capture the required real screenshot**

Use the actual running game, not a mockup or concept. Capture `1280 x 800` during PLAYING with the player ship, one warning/moving drone, one hostile structure, a visible gap or low barrier, and the HUD all on screen. Verify that the screenshot shows perspective variation and no fallback procedural enemy. Save the review image outside runtime assets under `docs/review/v1.1-world-polish-1280x800.png` only if the repository’s documentation should retain it; otherwise keep it as a temporary review artifact and do not commit it.

- [ ] **Step 4: Present final user gates**

Provide the user:

1. directly playable approved candidate music;
2. the live local game URL;
3. the real gameplay screenshot;
4. a short list of the two official CC0 source families and the local/offline rendering approach.

Wait for explicit confirmation that music pacing, enemy/building/trap appearance, drone direction readability, and mission-button color are acceptable. If any visual tuning is requested, keep geometry fixed, revise only render palette/camera/composition or draw scaling, update hashes/docs/tests, and repeat the relevant RED/GREEN and manual checks.

- [ ] **Step 5: Request independent review and fix findings**

Use `superpowers:requesting-code-review`. Review the complete diff against the approved design, prioritizing gameplay invariants, rendering state restoration, deterministic asset choice, independent fallbacks, accessibility, codec compatibility, licensing, and package completeness. Apply accepted findings test-first and rerun the full suite.

- [ ] **Step 6: Verify branch hygiene**

```bash
git status --short --branch
git log --oneline main..HEAD
git diff --stat main...HEAD
git ls-files | rg '(\.zip$|\.wav$|\.app/|\.superpowers/brainstorm|node_modules)'
```

Expected: clean status; no downloaded source archive/model, WAV, app bundle, visual-companion state, dependency directory, token, or unrelated file is tracked.

- [ ] **Step 7: Push the existing PR branch**

Use `superpowers:verification-before-completion`, then:

```bash
git push origin feat/stellar-command-polish
```

Confirm PR #1 points to the pushed head and summarize exact test/smoke results, user approvals, music parameters, CC0 sources, fallbacks, and remaining fact that production GitHub Pages updates only after the user merges/deploys `main`.

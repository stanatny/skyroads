# Skyroads “Stellar Command” Polish — Design Specification

**Date:** 2026-08-02  
**Status:** Ready for user review  
**Branch:** `feat/stellar-command-polish`  
**Product name:** 星云巡航 / Nebula Cruise

## 1. Purpose

This release upgrades the existing Canvas game into a more polished sci-fi arcade experience without replacing its core gameplay or adding a backend. It focuses on five player-visible improvements:

1. A refined “interstellar command center” presentation.
2. Responsive hold-to-move controls.
3. A persistent local Top 15 leaderboard with remembered player identity.
4. Chinese and English localization.
5. A new original cinematic synthwave soundtrack.

The implementation remains a static web game that works on GitHub Pages and inside the existing macOS `WKWebView` wrapper.

## 2. Goals and non-goals

### Goals

- Preserve the current game loop, seven-lane course, enemies, pickups, weapons, and progression.
- Make the game feel substantially more finished through coherent art direction, animation, sound, and interface hierarchy.
- Let a tap move one lane and a held key continue across lanes with the approved responsive timing.
- Keep a reliable Top 15 leaderboard on the current browser/device.
- Automatically select Chinese for Chinese-language systems and English otherwise, while allowing a manual override.
- Keep all runtime assets in the repository so the game works without third-party hotlinks.
- Continue to build and sign the universal macOS application.

### Non-goals

- Online or cross-device leaderboards.
- Accounts, authentication, databases, analytics, or a server component.
- Additional languages beyond Simplified Chinese and English.
- A framework migration or a rewrite of the game engine.
- Direct use of copyrighted franchise character names or art.
- Mobile touch controls in this release unless required to preserve current behavior.

## 3. Product and visual direction

### 3.1 Identity

- Chinese title: **星云巡航**
- English title: **Nebula Cruise**
- Visual theme: a premium interstellar command center viewed through a forward flight display.
- Core palette:
  - Deep navy/black for space and structural panels.
  - Cyan for navigation, energy, and standard status.
  - Gold for achievements, score, and important actions.
  - Magenta/red only for danger, damage, and critical warnings.

The interface should feel precise and cinematic, not crowded. The road and hazards remain the highest-contrast gameplay layer; decorative UI must never obscure them.

### 3.2 Screen composition

The current full-screen Canvas remains the gameplay surface. The visual hierarchy becomes:

1. Procedural deep-space background with layered stars, subtle nebula haze, and restrained parallax.
2. Road and world geometry, enhanced with emissive edge lighting and clearer depth cues.
3. Player ship, enemies, obstacles, pickups, and effects.
4. Compact command-center HUD around the safe edges.
5. HTML overlays for start, pause, settings/language, game over, and leaderboard flows.

HTML is preferred for menus and text-heavy overlays because it provides sharper text, accessible controls, easier localization, and reliable input fields. The active game continues to render in Canvas.

### 3.3 Player ship

The current placeholder-looking ship will be replaced by a render derived from a CC0 3D model. The preferred source is Quaternius’ **Ultimate Spaceships** pack. The selected model will be recolored and lit to match the cyan/gold command-center palette, then rendered from the actual game camera angle into transparent, optimized 2D assets.

- Target on-screen ship width: approximately **7–9% of the game viewport** at the reference aspect ratio.
- The ship’s visible glow must not enlarge its collision box.
- Include at least a neutral frame and an energized/thrust frame; additional banking frames may be added if they stay lightweight.
- Export WebP or PNG with transparent background. Choose the smallest format that preserves clean alpha edges in supported browsers.
- If the image fails to load, draw the existing procedural ship as a fallback.

### 3.4 UI assets and typography

Approved sources:

- Kenney **UI Pack: Sci-Fi** (CC0) for selected panels, corners, buttons, and progress-bar elements.
- Phosphor Icons (MIT) for a small consistent set of status/action icons.
- Orbitron (SIL OFL 1.1) for Latin headings and numerical HUD readouts.
- System sans-serif fonts for Chinese text and general body copy.

Only required files are copied into the repository. There are no runtime CDN dependencies. All third-party assets, licenses, source links, and modifications are recorded in `THIRD_PARTY_NOTICES.md`.

### 3.5 Motion and effects

- Menu: slow background drift, gentle panel scan, and restrained title glow.
- Gameplay: speed lines and road illumination scale with speed.
- Lane change: ship banks slightly toward movement, then eases back to neutral.
- Pickups and score events: short, local feedback; avoid persistent screen-filling particles.
- Critical fuel/damage: warning pulse and color change, but no high-frequency flashing.
- Respect `prefers-reduced-motion` by reducing nonessential parallax, panel scans, and large pulses. Gameplay motion itself remains intact.

## 4. Asset layout and loading

Add the following repository structure:

```text
assets/
  audio/
  fonts/
  ship/
  ui/
```

Assets are loaded once during the title/loading state. Each optional visual or audio asset has a programmatic fallback so a failed file cannot make the game unplayable.

The macOS build script must copy `index.html` and the complete `assets/` directory into the application resources. GitHub Pages continues to serve the same repository-relative paths.

## 5. Responsive movement design

### 5.1 Approved feel

The selected profile is **Responsive / 灵敏**:

- Tap: immediately move exactly one lane.
- One-lane travel time: **145 ms**.
- Hold delay: after **140 ms** from the initial key press, continuous movement becomes eligible.
- Continued movement cadence: **85 ms per additional lane** while the direction remains held.
- Release during a lane change: finish the current lane change, then stop; discard future queued movement.

These values are defaults stored together as named tuning constants so they can be adjusted after playtesting.

### 5.2 Input model

The movement state tracks:

```text
lanePosition       continuous position in lane units
segmentStart       continuous position at the start of the active segment
segmentTarget      integer target lane
segmentElapsed     elapsed time for the active segment
segmentDuration    duration for this segment
heldLeft/heldRight key state
activeDirection    -1, 0, or +1; last pressed direction wins
pressedAt          time the active direction was pressed
repeatEligibleAt   time continuous movement may begin
```

Rules:

1. On the initial `keydown`, request the adjacent lane immediately.
2. Browser-generated key repeat is ignored; the game loop controls repetition.
3. Once the key has been held for 140 ms, begin each next lane as soon as the current target is reached, using 85 ms for subsequent segments.
4. Releasing the active direction clears further repetition but does not snap or interrupt the active segment.
5. If the opposite direction is pressed while moving, it becomes the active direction and the next segment heads back smoothly from the current/next completed lane. Position never jumps.
6. If both directions are held, the most recently pressed direction wins. Releasing it returns control to the still-held direction.
7. At lane 0 or lane 6, further movement in that direction is ignored without replaying move feedback.
8. `blur`, `visibilitychange`, pause, restart, and game-over events clear all held-key state.
9. Use `KeyboardEvent.code` for `ArrowLeft`, `KeyA`, `ArrowRight`, and `KeyD` so letter case and keyboard layout do not affect controls.

### 5.3 Rendering and easing

The ship is drawn from the same continuous `lanePosition` used by collision detection. Each segment uses a short smoothstep/ease-in-out interpolation to avoid mechanical snapping, while total duration still matches the tuning constants.

Banking is a visual transform derived from movement velocity. It must not change the logical collision box.

### 5.4 Continuous collision

The current midpoint lane rounding is removed. Collision uses a continuous player hitbox centered on `lanePosition`.

- Initial horizontal half-width: **0.14 lane**.
- Solid obstacles and enemies collide when their lateral interval overlaps the player interval.
- The collision check uses the swept interval from the previous to current player position, preventing a low frame rate from skipping a hazard during a fast lane change.
- Pickups use a slightly forgiving center-distance test so a visual near-hit is collected.
- Gaps use the player’s continuous footprint rather than switching lanes at the midpoint.
- Rendered debug mode can display the player hitbox, `lanePosition`, and current target during development, but is disabled in production.

The goal is consistent feedback: any visible ship overlap that looks dangerous should be dangerous, and visible clearance should be safe.

## 6. Local Top 15 leaderboard

### 6.1 User experience

- On the first visit, create a safe original space-themed default name, such as Nova, Orion, Vega, Luna, Atlas, Echo, Comet, Cosmo, Lyra, or Zenith, optionally followed by a short number when needed.
- Remember that name on the device.
- Every completed run that qualifies is saved automatically with the current name. The player is not prompted on every run.
- Game-over and leaderboard screens expose an optional **Rename / 改名** action.
- Renaming changes the current profile and updates historical entries belonging to the same local player ID.
- Show the best 15 local runs and highlight the newest entry.
- If a run does not enter the Top 15, still show its score and the cutoff needed to qualify.

The labels must clearly say **Local Top 15 / 本机 Top 15** so players do not mistake it for an online global ranking.

### 6.2 Score model

Separate values that are currently conflated:

- `distanceMeters`: distance travelled only.
- `score`: the competitive total, including distance-derived points and approved bonuses such as enemy defeats.
- `elapsedMs`: run duration used only as a final tie-breaker.

Sort order:

1. Higher `score` first.
2. Higher `distanceMeters` first.
3. Lower `elapsedMs` first.
4. Earlier `createdAt` first for complete determinism.

### 6.3 Storage schema

Use a versioned JSON document in `localStorage`:

```json
{
  "version": 1,
  "profile": {
    "playerId": "local-generated-id",
    "name": "Nova"
  },
  "entries": [
    {
      "id": "run-generated-id",
      "playerId": "local-generated-id",
      "name": "Nova",
      "score": 12340,
      "distanceMeters": 8042,
      "elapsedMs": 93210,
      "createdAt": "2026-08-02T12:00:00.000Z"
    }
  ]
}
```

Use separate keys for the active document and last-known-good backup. All reads are parsed and validated field by field. Invalid entries are discarded, strings are length-limited, numeric values must be finite and nonnegative, and only the best 15 valid entries are kept.

Write sequence:

1. Serialize the validated next document.
2. Save the current valid document as backup.
3. Save the next active document.
4. Read it back and validate it.
5. If storage is unavailable or quota/security errors occur, continue with an in-memory leaderboard for the current session and show a subtle localized persistence warning.

Name input is trimmed, control characters are removed, and the visible length is limited to 16 Unicode characters. Empty input restores/keeps a generated default.

## 7. Localization

### 7.1 Locale selection

Support two application locales:

- `zh-CN`
- `en`

Resolution order:

1. A saved manual language choice.
2. The first Chinese locale found in `navigator.languages` or `navigator.language` (`zh-*` maps to `zh-CN`).
3. English for every non-Chinese system.

A visible `中文 / EN` control allows manual switching. Changing it updates the active UI immediately and persists the choice.

### 7.2 Implementation

- Centralize all player-facing strings in a message dictionary; do not scatter language conditionals through drawing code.
- Use stable message IDs with interpolation helpers for dynamic values.
- Use `Intl.NumberFormat` and `Intl.DateTimeFormat` for localized values.
- Update `<html lang>`, document title, accessibility labels, form placeholders, Canvas text, and browser metadata after a language change.
- Font stacks must handle both languages without layout overlap. Orbitron is limited to suitable Latin/numeric display text.
- Missing translations fall back to English in development and are caught by tests.

### 7.3 Repository documentation

- `README.md` becomes the default English README.
- Add `README.zh-CN.md` as the Chinese version.
- Put a prominent reciprocal language link at the top of both files.
- Keep screenshots, controls, build steps, and feature lists equivalent across both versions.

GitHub does not automatically switch README files based on the viewer’s language, so the explicit links are the reliable solution.

## 8. Audio direction

### 8.1 Music

The approved style is **星云巡航 / cinematic synthwave**: energetic, melodic, and futuristic without becoming harsh.

- Compose an original seamless loop between **45 and 75 seconds**.
- Target approximately **112 BPM**, subject to musical adjustment during composition.
- Use layered synth pads, a warm bass pulse, restrained electronic drums, and a memorable but non-intrusive lead motif.
- Intensity follows gameplay state:
  - Title/start: atmospheric pad and motif.
  - Cruise: add bass and light drums.
  - High speed/danger: add arpeggio, brighter filter, or percussion layer.
- Transitions occur on musical boundaries or through short gain ramps so layers do not click.
- Export OGG as the primary source and MP3 as a compatibility fallback.
- The existing procedural music remains available as a last-resort fallback if both files fail.

The track must be original or created from clearly redistributable tools/sounds. Any third-party samples must have a repository-compatible license and be documented.

### 8.2 Playback behavior

- Browser autoplay restrictions are respected: audio starts only after a player gesture.
- Music and sound mute settings persist locally.
- Pause/game-over lowers or transitions music instead of abruptly restarting the loop.
- Audio loading failures never block the game.

## 9. Accessibility and controls

- Menus and dialogs use semantic HTML controls with visible focus states.
- All actions remain keyboard accessible.
- The name dialog has a real label, length feedback, Enter to save, and Escape to cancel.
- Color is not the only warning signal; icons/text accompany fuel and danger states.
- UI contrast should meet WCAG AA where practical for menus and essential HUD text.
- Reduced-motion preference is honored for decorative motion.

## 10. Architecture and file boundaries

The project remains deliberately lightweight. The large inline script may be divided into small plain-JavaScript modules if doing so reduces risk and enables testing, but there is no framework or build-chain requirement.

Recommended boundaries:

```text
index.html                 application shell, Canvas, semantic overlays
src/i18n.js                locale resolution and messages
src/leaderboard.js         schema validation, sorting, persistence, profile
src/input.js               held-key state and lane movement controller
src/audio.js               music loading, unlocking, state-driven layers
src/game.js                existing game loop and rendering integration
styles/game.css            interface and overlay styling
```

If modules are introduced, all paths must work as static files on GitHub Pages and when loaded from the macOS app’s local resource URL. The macOS build copies `src/`, `styles/`, and `assets/` as well as `index.html`.

Pure logic is separated from browser APIs where practical so movement, locale selection, leaderboard sorting, validation, and migration can be tested deterministically.

## 11. Failure handling and compatibility

- A missing ship image falls back to the current Canvas ship.
- A missing font falls back to system fonts.
- Missing music falls back to procedural audio; if audio is unavailable, gameplay remains silent and functional.
- Invalid or unavailable local storage falls back to a validated backup, then a fresh document, then in-memory storage.
- Unknown saved locale values are ignored and normal locale detection runs.
- Asset-loading status must never leave the title screen permanently blocked; required game logic starts after a timeout with fallbacks.
- The project supports current evergreen desktop browsers and the macOS wrapper’s WebKit version.

## 12. Testing strategy

Implementation follows test-driven development for extractable logic.

### Automated tests

- Movement:
  - tap moves exactly one lane;
  - hold timing at 139/140 ms;
  - repeat segments use 85 ms;
  - release finishes only the current segment;
  - opposite direction and simultaneous keys behave predictably;
  - edge clamping and focus loss clear input;
  - swept collision covers the whole lateral path.
- Leaderboard:
  - schema validation and recovery;
  - Top 15 truncation and deterministic tie-breakers;
  - qualifying/nonqualifying runs;
  - rename updates only the local player’s history;
  - unsafe/empty/overlong names are normalized;
  - storage exception fallback.
- Localization:
  - saved preference wins;
  - any `zh-*` locale maps to Chinese;
  - non-Chinese locale maps to English;
  - every message ID exists in both languages.
- Packaging:
  - existing universal-binary and signature smoke tests;
  - app bundle contains all required HTML, source, style, font, image, and audio resources.

### Manual/visual checks

- Compare title, gameplay, pause, game-over, and leaderboard at common desktop aspect ratios.
- Verify the ship appears at the approved 7–9% width and does not look detached from the scene lighting.
- Verify HUD never covers hazards or essential road information.
- Playtest tap, short hold, long hold, reversal, and edge behavior at low and high frame rates.
- Confirm Chinese and English layouts, name editing, persistence after reload, mute persistence, and reduced-motion behavior.
- Run both GitHub Pages-style HTTP hosting and the macOS application.

## 13. Delivery sequence

1. Establish testable module boundaries and a browser smoke-test harness.
2. Implement localization and bilingual README structure.
3. Implement the movement controller and continuous collision changes.
4. Implement player profile and local Top 15.
5. Add the command-center HTML/CSS/Canvas visual system.
6. Select, render, optimize, license, and integrate the ship/UI/font assets.
7. Compose, export, and integrate the new soundtrack and dynamic playback.
8. Update macOS resource packaging.
9. Run automated tests, manual gameplay checks, visual review, and code review.
10. Push `feat/stellar-command-polish` and open a pull request against `main` for the user to merge.

## 14. Acceptance criteria

The release is ready for a pull request when:

- The polished command-center presentation is visibly coherent in both languages.
- The player ship is refined, smaller, and sourced under a compatible documented license.
- Tap and hold controls match the approved responsive timing and collision remains visually fair.
- A valid local Top 15 survives reloads, remembers the player name, and allows optional rename.
- Chinese systems default to Chinese; other systems default to English; manual choice persists.
- English and Chinese READMEs cross-link and describe the same release.
- The original soundtrack loops cleanly, reacts to game intensity, and handles autoplay/mute correctly.
- The web version and universal signed macOS build pass their automated checks.
- No third-party runtime hotlinks, undocumented assets, or backend dependencies are introduced.


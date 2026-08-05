# Charge HUD Stability and V1.1.1 Patch Design

## Summary

Nebula Cruise V1.1.1 will prevent quick `J` taps from making the contextual HUD stack jump, shorten missile charging from 3 seconds to 1.5 seconds, and publish the change as a patch release based on the latest merged `main`.

The approved player-facing direction is:

- Keep the contextual status order fixed as BOOST, super form, magnet, then missile charge.
- Do not show the missile-charge status for holds shorter than 0.5 seconds.
- Show the missile-charge status at the bottom of the active status stack once the hold reaches 0.5 seconds.
- Preserve ordinary tap fire, charged missile release, super-form weapon effects, collision, scoring, and all unrelated gameplay.

## Root Cause

`renderHUD()` currently inserts the charge instrument before every timed power-up instrument as soon as `chargeT` becomes positive. A quick `J` tap therefore inserts one 30-pixel panel plus spacing at the top of the contextual stack and removes it on release. BOOST, super-form, and magnet panels move down and back up even though their own states did not change.

The charge visibility contract also treats every positive `chargeT` as meaningful HUD information. Keyboard press handling initializes `chargeT` immediately, so ordinary tap fire produces a brief panel flash.

## Gameplay Contract

### Charge timing

- `CHARGE_TIME` becomes exactly `1.5` seconds.
- Releasing `J` before 1.5 seconds fires an ordinary bullet under the existing cooldown and projectile limits.
- Releasing `J` at or after 1.5 seconds fires a missile under the existing missile limit.
- Holding beyond 1.5 seconds remains clamped at the ready state.
- Charge accumulation remains simulation-time based and keeps the existing pause, blur, visibility, dialog, restart, menu, and game-over cancellation behavior.

### Audio timing

The two intermediate charge ticks retain their relative pacing:

- First tick: `CHARGE_TIME / 3`, exactly 0.5 seconds.
- Second tick: `CHARGE_TIME * 2 / 3`, exactly 1.0 second.
- Ready cue: `CHARGE_TIME`, exactly 1.5 seconds.

No new sound source or asset is introduced.

## HUD Contract

### Visibility

- The missile-charge status is hidden while `chargeT < 0.5`.
- It becomes visible when `chargeT >= 0.5`.
- A ready charge remains visible until release or an existing input-cancellation path clears it.
- The player-ship charge effect continues to start immediately on press; only the contextual HUD panel is delayed. This preserves immediate input feedback without flashing the status stack.

### Ordering

Visible contextual instruments are rendered in this exact order:

1. BOOST
2. Super form
3. Magnet
4. Missile charge

The missile-charge instrument is therefore always the final item. Showing or hiding it never changes the position of an already-visible power-up instrument.

When no power-up instrument is active, the delayed charge instrument occupies the first contextual slot below the fuel panel.

### Progress

- The displayed percentage and bar continue to represent `chargeT / CHARGE_TIME`.
- At the 0.5-second reveal threshold, the initial visible progress is 25%.
- The ready state remains localized through the existing `status.chargeReady` key.
- No new copy, color, animation, panel asset, or persistent setting is required.

## Architecture

`src/presentation.js` remains the pure policy boundary for contextual HUD visibility. Its `hudVisibilityPlan()` input will receive numeric charge progress plus the reveal delay, rather than an already-collapsed `charging` boolean. This makes the 0.5-second threshold independently testable.

`src/game.js` remains responsible for gameplay timing and Canvas integration:

- Configuration owns the 1.5-second total and 0.5-second HUD reveal delay.
- Physics derives audio stages from proportional thresholds.
- `renderHUD()` asks the presentation policy whether charge is visible and renders charge after all timed power-ups.

No dependency, build step, storage schema, asset, or browser permission changes.

## Version Contract

The canonical patch version is `1.1.1`:

- Runtime semver and HTML metadata: `1.1.1`
- Display badge: `V1.1`
- Git tag and GitHub release: `v1.1.1`
- macOS short version: `1.1.1`
- macOS bundle build: `3`
- Release archive: `Nebula-Cruise-macOS-v1.1.1.zip`

V1.1.1 gets its own bilingual release notes. Existing V1.1.0 notes remain historical and unchanged.

## Files

Expected runtime and policy changes:

- `src/game.js`
- `src/presentation.js`

Expected focused tests:

- `tests/presentation.test.js`
- `tests/game-audio-ui.test.js`
- `tests/input.test.js`

Expected patch-version surfaces:

- `package.json`
- `src/version.js`
- `index.html`
- `app/Info.plist`
- `README.md`
- `README.zh-CN.md`
- `docs/releases/v1.1.1.md`
- `tests/release-contracts.test.js`
- `tests/static-app.test.js`
- `tests/app-resources-smoke.sh`
- `tests/app-wkwebview-smoke.sh`

The exact implementation plan may remove a listed test file if inspection shows that another existing harness provides the same real-behavior coverage without duplication.

## Verification

### Expected-red automated coverage

- A 0.49-second charge does not expose the contextual charge instrument.
- A 0.50-second charge exposes it.
- With BOOST, super form, magnet, and charge active together, text coordinates prove that charge is below every power-up status.
- A quick press and release still fires one ordinary bullet without displaying charge.
- A hold just below 1.5 seconds fires an ordinary bullet.
- A hold reaching 1.5 seconds fires a missile.
- Charge audio stages advance at one-third, two-thirds, and full progress.
- All runtime, HTML, package, macOS, documentation, tag, and archive version forms agree on V1.1.1.

### Fresh checks

- Focused Node tests for presentation, input, game UI/audio, static shell, and release contracts.
- `npm run check`.
- Linux-compatible full suite with all non-macOS tests passing; the known macOS-only checks remain separately identified.
- Real-browser keyboard verification at minimum and typical viewports:
  - Repeated quick `J` taps do not flash the charge panel.
  - Active BOOST and super-form panels do not move during quick taps or delayed charge reveal.
  - Holding `J` reveals charge at the bottom after 0.5 seconds.
  - Releasing before and after 1.5 seconds produces bullet and missile behavior respectively.
  - English and Chinese status labels remain readable.

### Release order

1. Push the review branch and open or update a pull request.
2. Merge the reviewed pull request.
3. Verify the cache-busted and plain GitHub Pages URLs serve the merged commit and V1.1.1 behavior.
4. Tag the verified merged commit as `v1.1.1`.
5. Publish the GitHub release to trigger the macOS workflow.
6. Verify the uploaded archive name, package version/build, universal architectures, signature policy, bundled resources, download, and checksum.

Do not tag or publish if the pull request is unmerged, Pages is stale, browser behavior is unverified, or required macOS release evidence fails.

## Non-Goals

- No weapon damage, projectile, cooldown, collision, scoring, pickup, difficulty, movement, fuel, jump, glide, BOOST, super-form, or magnet behavior changes.
- No HUD redesign, permanent charge instrument, new animation, new UI setting, or new asset.
- No persistence or leaderboard schema change.
- No direct commit to `main`.

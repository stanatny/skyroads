# Nebula Cruise Pause Feature — Design Specification

**Date:** 2026-08-03
**Status:** Awaiting written-spec confirmation
**Branch:** `feat/stellar-command-polish`
**Base:** `12829e2`

## 1. Purpose

Add a keyboard pause flow to Nebula Cruise without changing the existing movement, scoring, ranking, localization, asset, or packaging contracts. During a mission, pressing `P` pauses the game; pressing `P` again resumes it.

The feature must be explained in the in-game controls and in both repository README files. It lands on the current feature branch before the branch is proposed as a pull request against `main`.

## 2. State model

The game mode becomes:

```text
MENU | PLAYING | PAUSED | GAMEOVER
```

Only these transitions are added:

```text
PLAYING --P--> PAUSED
PAUSED  --P--> PLAYING
```

`P` has no effect in `MENU` or `GAMEOVER`. Pause state is not saved across reloads, app launches, or new missions. Starting, restarting, returning to the command center, and dying continue to enter their existing modes directly.

## 3. Input behavior

- Use `KeyboardEvent.code === 'KeyP'`, consistent with the existing physical-key input model.
- Recognize `P` only after the existing text-editing and open-dialog guards. Typing a name or using an open leaderboard/rename dialog must never pause or resume the game.
- Treat `P` as a global non-editing game shortcut so it still works when Canvas or a non-editing command-center utility button owns focus.
- Call `preventDefault()` for recognized `P` input and ignore `event.repeat`; holding the key must toggle at most once until keyup.
- Entering and leaving pause clears every held gameplay input. Movement repetition stops, glide stops, and an in-progress `J` charge is cancelled without firing a bullet or missile.
- Pressing movement, jump, fire, Enter, or Space while paused must not mutate gameplay. `M` and the visible music/SFX/language utilities retain their existing behavior.
- Blur and hidden-page handling continue to clear held input but do not automatically pause; pause remains an explicit player action.

## 4. Simulation and rendering

While `STATE.mode === 'PAUSED'`:

- Do not advance position, distance, run elapsed time, fuel, player physics, enemies, projectiles, collisions, pickups, power-up timers, charge, cooldowns, particles, shockwaves, screen shake, or the Canvas animation clock.
- Continue the `requestAnimationFrame` loop so the page remains responsive and can receive the next `P`, language switch, or audio setting change.
- Render the already-computed world as a static frame underneath the pause overlay.
- On resume, discard paused wall-clock time. The first resumed gameplay frame has zero simulation delta, so a background-throttled tab cannot jump forward.
- Existing `MENU` and `GAMEOVER` rendering/effect behavior remains unchanged.

## 5. Pause presentation and accessibility

Add a third semantic HTML mode panel alongside the title and game-over panels.

English:

```text
GAME PAUSED
Press P to resume
```

Chinese:

```text
游戏已暂停
按 P 继续
```

The pause panel:

- is visible only in `PAUSED`;
- is localized immediately when the language is switched while paused;
- uses an accessible heading and polite status announcement;
- contains no required mouse action and does not trap focus;
- never steals focus: normal gameplay focus remains on the Canvas, while focus on an existing utility control is preserved;
- uses the existing command-center panel visual language and respects `prefers-reduced-motion`;
- does not hide or disable the existing language, music, or SFX utility controls.

The title-screen control list gains a fifth localized item:

```text
Pause / resume: P
暂停 / 继续：P
```

The added line must fit without overflow at the supported 960 × 600 minimum viewport in both locales.

## 6. Audio behavior

The approved pause mix is the existing non-playing adaptive mix:

```text
atmosphere = 1
drive = 0
overdrive = 0
```

On pause:

- adaptive music fades to atmosphere only using the existing 300 ms transition;
- legacy/procedural music and game SFX use the existing legacy master bus and are silenced, because the procedural fallback has no separable atmosphere stem;
- glide audio is stopped by the complete input reset;
- the player's music and SFX mute preferences are not changed or rewritten.

On resume:

- adaptive music returns to the mix derived from current speed, danger, and BOOST state;
- the legacy master bus returns only if it was audible before pause and current mute preferences allow it;
- no paused sound effect is replayed.

Language and audio utility controls remain usable while paused.

## 7. Localization and documentation

Add matching `zh-CN` and `en` catalog keys for:

- pause title;
- resume hint;
- title-screen pause control description.

Update the keyboard controls tables in `README.md` and `README.zh-CN.md` with the same pause/resume behavior. The English README remains the default landing page and both files remain equivalent in scope.

## 8. Diagnostics and packaging

- `Skyroads.diagnostics` may report `mode: 'PAUSED'` and a pause-overlay flag.
- The static HTTP version and packaged `file://` WKWebView version must behave identically.
- No new dependency, backend, asset, permission, storage key, or macOS entitlement is introduced.
- The hidden macOS smoke remains nonpersistent and may continue to start in `PLAYING`; it does not need to synthesize a pause.

## 9. Test and acceptance contract

Use strict red-green-refactor. Required automated coverage includes:

- presentation mode mapping and focus for `PAUSED`;
- English/Chinese catalog parity and rendered pause/control text;
- `P` toggles only `PLAYING ↔ PAUSED`, ignores repeat, and is suppressed in text fields and dialogs;
- pause entry clears movement, glide, and charge without firing;
- simulation time, world state, effects, cooldowns, and power-up timers remain unchanged across paused frames;
- resume discards paused wall-clock time;
- adaptive audio chooses atmosphere-only for `PAUSED`, legacy audio is silenced/restored without changing preferences;
- language and audio utilities continue to work while paused;
- the fifth control item fits at 960 × 600 in both locales.

Before completion, run the full Node suite, syntax check, Git diff check, four macOS smoke scripts, real browser pause/resume interaction in both locales, and direct packaged `--smoke-test`. Request an independent code/design review, resolve findings, then push the updated feature branch and create the PR against `main`.

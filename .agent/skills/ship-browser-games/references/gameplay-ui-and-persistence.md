# Gameplay, UI, and Persistence

Load this reference when work affects game state, timing, input, collision, Canvas rendering, semantic UI, localization, accessibility, or browser-local data.

## Model State and Time Explicitly

- Define named states, legal transitions, transition owners, and invariants. Test each accepted and rejected transition, including restart, pause, game over, menu, visibility loss, and disposal when relevant.
- Separate real time from simulation time. Derive movement, cooldowns, animation, spawning, and collision from bounded frame deltas or fixed steps so results do not depend on 30, 60, or 120 Hz rendering.
- Freeze or advance each subsystem deliberately while paused or hidden; never infer a complete freeze from one stopped counter.

## Own Input Deliberately

- Map each action to the states and element that own it. Gate gameplay shortcuts while an editable field, IME composition, dialog, or unrelated focused control owns the event.
- Treat browser `repeat` as a transport signal, not game timing. Model press, hold threshold, repeat cadence, release, opposite-direction arbitration, and cancellation explicitly.
- Clear held keys, movement latches, charge, and transient gestures on blur, visibility loss, pause transitions, restart, and teardown. Prevent default browser behavior only for keys the current game state consumes.
- Keep pointer and keyboard paths behaviorally equivalent. Preserve logical focus; overlays that are not interactive must not steal it.

## Keep Rendering and Collision Continuous

- Use the same continuous world or lane coordinate for visual movement and collision. Do not round one path while interpolating the other.
- Use swept or interval checks when an entity can cross a hazard between frames. Test exact boundaries, large frame deltas, simultaneous transitions, and depth ordering.
- Separate player-visible art bounds from gameplay hitboxes. Verify projected size, anchor, perspective, clipping, and hit feedback at near/far and center/edge positions.

## Divide Canvas and DOM Responsibilities

- Use Canvas for fast-changing world graphics and effects. Use semantic DOM for localized headings, buttons, forms, dialogs, results, settings, and assistive descriptions.
- Keep hidden overlays non-focusable and non-clickable; set visibility, pointer events, focus restoration, and the active primary action together.
- Respect reduced motion by removing nonessential parallax, shake, pulsing, and transition travel without changing game timing or hiding required cues.

## Keep Transient HUD Stable

- Give a transient instrument an explicit reveal threshold and removal rule. Do not insert a status panel for every tap when immediate feedback already exists on the player object.
- Keep contextual instruments in a stable semantic order. Lower-priority information appears after higher-priority state instead of shifting unrelated instruments.
- Assert the coordinates of existing instruments before and after a transient appears. Correct text alone does not prove that the HUD stopped reflowing.
- Preserve immediate player-object feedback when the HUD panel is deliberately delayed.

## Preserve Fairness While Changing Presentation

- Compare visual directions with the same camera, scale, background, gameplay state, and information density.
- Keep collision bounds, visible art bounds, warning cues, direction cues, escape routes, and solution vocabulary separate and explicit.
- A new preferred renderer may replace the visual path, but missing preferred art must retain equivalent danger, target, direction, and readiness cues.

## Preserve Locale and Text Safety

- Keep catalog keys and meaning at parity across supported locales; test every key, placeholder, control hint, result, and error path.
- Detect the initial locale conservatively, persist explicit choice, and retain an accessible manual switch.
- Handle IME composition before shortcuts or submission. Validate user-visible names by grapheme-aware limits where available, normalize consistently, and never split surrogate pairs or combining sequences.
- Check the minimum viewport in every supported locale for clipping, overlap, focus order, and readable contrast.

## Make Local Persistence Recoverable

- Store a schema-versioned document under versioned keys; keep product version, data-schema version, and storage-key version separate.
- Validate document shape, types, ranges, string lengths, identifiers, timestamps, and sort/tie-break rules on every read. Bound collection size and discard only invalid records when safe.
- Write a backup of the last valid document, write the primary, read it back, and verify it before declaring success. Recover primary from backup when possible.
- Catch unavailable, quota, security, serialization, and corruption failures. Continue with a validated in-memory store and explain local-only durability without pretending persistence succeeded.
- Test first run, upgrade, corrupted primary, valid backup, both invalid, failed writes, read-back mismatch, reload, clear-data behavior, and privacy wording.

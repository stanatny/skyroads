# Scope and Design Gates

Load this reference when classifying a browser-game request, comparing experience directions, freezing scope, seeking approval, or reviewing a file-level plan.

## Establish the Baseline

Answer only the questions that affect the requested work:

- What branch, commit, dirty files, local launch path, and automated checks define the starting point?
- Which browsers, minimum viewports, input methods, locales, reduced-motion settings, `file://` paths, WebViews, and packages are supported?
- Which player data and preferences already persist, and what compatibility or recovery promises exist?
- Which Canvas, DOM, audio, asset, packaging, deployment, and version surfaces can the change touch?
- What evidence is already available, and what must be gathered in a real environment?

## Classify the Work

- **S:** one isolated tuning or copy change, such as shortening a lane-shift duration or correcting one label. Require a focused contract, focused tests, and a proportional visual or interaction check.
- **M:** a feature crossing gameplay, UI, input, storage, or audio, such as pause state or a local leaderboard. Require an approved design, file/interface plan, TDD, integration checks, and browser evidence.
- **L:** visual/audio production, third-party licensing, WebView packaging, public deployment, or release. Require full design and plan gates, provenance and reproducibility, the environment matrix, independent review, and production proof.

Escalate when implementation discovers a higher-risk surface. Never downgrade because the diff is short.

## Compare Experience Directions

For subjective controls, art, UI, or music, present two or three materially different directions. Show the player-visible result, measurable differences, tradeoffs, affected scope, and a representative preview or playable sample. Ask for approval before producing final assets or committing to deep integration; do not treat a schematic mood board as final-game proof.

Translate feedback into contracts, for example:

- “Tap movement is slow” → initial lane travel time, hold delay, repeat cadence, easing, frame-rate behavior, and no unrelated control changes.
- “The drone is too small” → projected size at representative depths, hitbox relationship, edge-lane perspective, and direction-cue legibility.
- “Music is too calm” → tempo, rhythmic density, tension curve, transition timing, loop seam, and two-loop listening acceptance.

## Freeze Boundaries

Record goals and non-goals plus platform, browser, viewport, input, language, persistence, schema, copyright, accessibility, fallback, packaging, version, deployment, and release boundaries. State how missing assets, blocked autoplay, failed storage, lost focus, unsupported codecs, and offline or direct-file execution should degrade.

Implementation must not silently broaden scope. Pause for approval before adding a backend, dependency, permission, build step, new storage contract, unsupported language, third-party source, platform target, or release action.

## Approve Design and Plan

For M and L work, require an approved design that maps player outcomes to state, input, timing, collision, rendering, DOM semantics, audio, assets, localization, accessibility, persistence, fallbacks, and acceptance evidence as applicable.

Review the implementation plan for exact files, public interfaces, ordering dependencies, red-green steps, focused and full commands, browser/package evidence, review gates, deployment sequence, and stop conditions. Reject vague tasks such as “polish UI” that do not say what contract changes or how success is observed.

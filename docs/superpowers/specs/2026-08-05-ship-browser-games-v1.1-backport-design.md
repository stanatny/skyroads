# Ship Browser Games V1.1 Experience Backport Design

## Summary

Update the repository-owned `ship-browser-games` Skill so future work can reuse the final Nebula Cruise V1.1 and V1.1.1 lessons without treating project parameters as universal game-development rules.

The backport complements the Botmux-wide `game-development-lifecycle` Skill:

- the Botmux Skill owns cross-engine discussion, optioning, development, playtest, shipping, and retrospective gates;
- this repository Skill owns static browser-game implementation, packaging, release proof, and the Nebula Cruise case study;
- the Skyroads case study owns project-specific numbers, artifacts, and lessons.

## Current Problems

### Stale case-study contract

`references/skyroads-case-study.md` still states the earlier continuous-movement timing `145 / 140 / 85 ms`. Final code and tests use:

- tap lane duration: `145 ms`;
- repeat eligibility: `220 ms`;
- held repeat lane duration: `110 ms`.

An agent following the case study would reintroduce obsolete behavior.

### Incomplete V1.1 delivery map

The case study points to the original command-center, pause, release, media, runtime, and packaging artifacts, but not the later V1.1 work:

- obstacle and perspective corrections;
- Semantic Spectrum;
- dangerous event-horizon gaps;
- Heavy Swarm drones;
- perceptual camera and HUD;
- vector thruster feedback and shared propulsion audio;
- V1.1.1 charge HUD patch.

### Missing reusable lessons

The general references cover test layers, asset provenance, input cleanup, and release order, but do not yet state several lessons proven by V1.1:

- subjective visual directions should be compared under the same camera, scale, background, and information density;
- preferred assets and procedural fallbacks must preserve gameplay feedback semantics;
- sustained sound graphs need one owner, explicit priority, smooth parameter changes, and one lifecycle gate;
- transient HUD instruments need a reveal threshold and stable ordering so tap actions do not reflow unrelated state;
- browser automation must wait for observable readiness rather than a fixed delay;
- platform-independent and platform-only test groups should be reported separately;
- merge, deployment, tag, Release, and downloadable artifact are distinct production states.

## Scope

### Modify

- `.agent/skills/ship-browser-games/SKILL.md`
- `.agent/skills/ship-browser-games/references/gameplay-ui-and-persistence.md`
- `.agent/skills/ship-browser-games/references/assets-audio-and-licensing.md`
- `.agent/skills/ship-browser-games/references/testing-and-environment-matrix.md`
- `.agent/skills/ship-browser-games/references/release-and-production-proof.md`
- `.agent/skills/ship-browser-games/references/skyroads-case-study.md`

### Create

- `.agent/skills/ship-browser-games/scripts/verify-static-deploy.mjs`
- `.agent/skills/ship-browser-games/tests/skill-contracts.test.mjs`
- `.agent/skills/ship-browser-games/tests/verify-static-deploy.test.mjs`

### Non-goals

- No gameplay, asset, package, version, deployment, or release change.
- No V1.1.1 tag or GitHub Release creation.
- No copy of the Botmux-wide Skill into this repository.
- No requirement that future games use Canvas, Node, GitHub Pages, or macOS.
- No project parameter in the reusable references unless it is clearly labeled as a Skyroads case-study value.

## Skill Updates

### Core Skill routing

Keep `SKILL.md` concise. Add:

- a note that cross-engine product workflow may be supplied by `game-development-lifecycle` when available;
- a rule that repository-specific contracts override general examples;
- routing to the updated references for option comparison, transient HUD, sustained audio, readiness, platform test splits, and production state.

Do not make the repository Skill depend on Botmux. It must remain self-contained for GitHub users.

### Gameplay, UI, and persistence

Add two reusable browser-game patterns:

1. **Stable transient HUD**
   - define reveal and removal thresholds;
   - keep contextual instruments in a stable semantic order;
   - assert existing instrument coordinates do not change when a lower-priority transient appears;
   - keep immediate feedback on the player object when the status panel itself is intentionally delayed.

2. **Fair visual upgrades**
   - keep gameplay collision and art bounds separate;
   - preserve warnings, direction cues, escape routes, and solution vocabulary when changing art;
   - compare visual candidates under equivalent scene conditions.

### Assets, audio, and licensing

Add:

- preferred resource and fallback paths must expose equivalent player-facing cues;
- a sustained audio graph should have one owner and one priority table;
- overlapping states should retarget a shared graph rather than stack loops;
- stop and restore behavior should share one ownership predicate covering pause, blur, hidden state, modal focus, mute, menu, game over, teardown, and active state.

### Testing and environment matrix

Add:

- wait for condition-based readiness such as a diagnostics object or target engine scene-ready signal;
- fixed sleeps are diagnostic aids, not readiness proof;
- separate cross-platform suites from target-platform-only suites in commands and reporting;
- real browser or target-runtime validation must use actual input paths and inspect console/runtime errors;
- visual comparisons should keep camera, viewport, background, scale, state, and motion policy constant.

### Release and production proof

Name the five states explicitly:

1. merge;
2. production deployment;
3. semantic tag;
4. Release publication;
5. downloadable artifact or store/package verification.

Add a warning against updating stable README release links before the tag/Release exists, unless the project intentionally accepts that temporary gap.

Require both cache-busted and ordinary canonical URL verification after the cache window.

## Skyroads Case Study Update

### Design map

Add links to the final V1.1 specifications and plans:

- rhythm and world polish;
- orbital defense world art;
- obstacle and perspective corrections;
- Semantic Spectrum;
- event horizon;
- Heavy Swarm;
- perceptual camera and HUD;
- vector thrusters and propulsion audio;
- V1.1.1 charge HUD patch.

### Final project parameters

Correct continuous movement to:

- `145 ms` initial lane;
- `220 ms` held delay;
- `110 ms` repeated lane.

Record project-specific examples without promoting them to universal values:

- obstacle heights `600 / 1,250 / 2,000`;
- drone warn/move `0.6 / 0.4 s`;
- charge HUD reveal `0.5 s`;
- final missile charge `1.5 s`;
- Pages cache `max-age=600`.

### Final project lessons

Add concise examples:

- Semantic Spectrum separated player, structure, hostile, and gap roles without changing geometry.
- Event horizon replaced tiled gap decoration while preserving exact support and exposed-edge warnings.
- Heavy Swarm became the primary visual path while retaining atlas and procedural fallbacks.
- Loaded and procedural ships share vector-thruster feedback.
- BOOST, super glide, ordinary glide, and off share one sustained graph and priority.
- Charge HUD delay plus bottom ordering prevents tap-fire reflow.
- Pages freshness requires file hashes and live input behavior, not only HTTP 200.

## Deterministic Deployment Verification Tool

Create `scripts/verify-static-deploy.mjs`.

Inputs:

```bash
node verify-static-deploy.mjs \
  --root <checkout> \
  --ref <git-ref> \
  --base-url <https-url> \
  --file <path> [--file <path> ...] \
  [--cache-bust <value>] \
  [--timeout-ms <milliseconds>] \
  [--json]
```

Behavior:

1. Resolve every requested file from `git show <ref>:<path>`.
2. Fetch the corresponding online file with a cache-bust query when requested.
3. Compute local and remote SHA-256.
4. Report HTTP status, byte count, both hashes, and match status.
5. Exit nonzero when any file is unavailable or mismatched.
6. Never mutate the checkout.
7. Avoid third-party dependencies.

The tool proves static bytes only. Its output must state that real gameplay, console, service worker, authentication, backend, or runtime behavior needs separate validation.

## Verification

### Skill contract tests

`skill-contracts.test.mjs` must verify:

- `SKILL.md` frontmatter remains valid;
- references named by `SKILL.md` exist;
- the Skyroads case study contains `145 / 220 / 110 ms` and does not contain the stale `140 / 85 ms` contract;
- the case study links every final V1.1 artifact family;
- references describe stable transient HUD, shared sustained audio ownership, condition-based readiness, split platform suites, and five production states;
- no Botmux home path, private URL, development-machine IP, or absolute workspace path enters the public Skill.

### Deployment tool tests

Use a temporary Git repository and local HTTP server:

- matching file returns exit zero and equal hashes;
- mismatched file returns nonzero;
- missing file returns nonzero;
- JSON output is parseable and states the static-only evidence boundary;
- query-string cache busting preserves file path;
- paths with spaces are handled safely;
- the tool does not modify the source repository.

### Existing repository checks

Run:

- focused new Node tests;
- `npm run check`;
- the Linux-compatible test suite;
- existing release and static application tests;
- `botmux skills validate` is not required because this is a repository Skill, but the standard skill validator may be used directly.

## PR Boundary

Create the branch from the latest `origin/main`.

The PR contains only:

- the design specification;
- repository Skill and reference updates;
- the deterministic deployment verifier;
- focused tests.

Do not include V1.1.1 release actions, tags, generated game assets, or product code.

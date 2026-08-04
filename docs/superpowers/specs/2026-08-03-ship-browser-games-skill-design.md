# Ship Browser Games — Repository Skill Design Specification

**Date:** 2026-08-03
**Status:** Approved for implementation
**Branch:** `feat/stellar-command-polish`
**Release scope:** Nebula Cruise V1.1

## 1. Purpose

Distill the reusable lessons from the Nebula Cruise polish release into a repository-level Codex Skill that can guide future static browser-game work from discovery through production proof.

The Skill is intentionally broader than Skyroads, but narrower than general game development. It targets browser games built around Canvas, DOM, Web Audio, local browser storage, static hosting, and optional desktop WebView packaging. A separate Skyroads case-study reference maps the general workflow back to this repository without making the core Skill project-specific.

## 2. Location and version-control contract

Create the Skill at:

```text
.agent/skills/ship-browser-games/
```

The singular `.agent` path is deliberate. The current user-level Git ignore file excludes `.agents/` but does not exclude `.agent/`; nevertheless, repository tracking is a hard release requirement rather than an incidental result of today's ignore configuration.

Implementation must therefore:

1. add explicit repository `.gitignore` exceptions for `.agent/skills/ship-browser-games/**` and its parent directories;
2. stage the complete Skill with `git add -f` even when the files appear normally trackable;
3. verify every required Skill file with `git ls-files --error-unmatch` after staging and after commit;
4. verify the commit's file list contains the Skill and its references;
5. treat a missing or untracked Skill as a V1.1 release blocker.

The Skill is part of the existing `feat/stellar-command-polish` branch and the same future pull request as V1.1. No separate branch or pull request is created for it.

## 3. Trigger and scope

Use the Skill when designing, implementing, polishing, testing, packaging, or releasing a static browser game, especially when the work crosses two or more of these areas:

- gameplay state, input, movement, timing, or collision;
- Canvas rendering and semantic DOM UI;
- visual direction, third-party assets, or derived artwork;
- music, sound effects, Web Audio, or synchronized adaptive stems;
- localization, accessibility, or responsive layout;
- reliable client-side persistence;
- static web deployment or WebView packaging;
- versioning, pull requests, public deployment, tags, or releases.

Do not use it as the primary workflow for server-authoritative multiplayer games, native engine projects, backend-heavy economies, or platform-store submissions. Those cases require different infrastructure and release controls.

## 4. Complexity routing

The Skill starts by classifying the requested change so small tasks do not inherit the full ceremony of a release-scale polish project.

| Level | Typical work | Required depth |
| --- | --- | --- |
| S | One isolated tuning or copy change | Baseline, focused contract, focused tests, proportional visual check |
| M | A feature crossing gameplay, UI, input, storage, or audio | Approved design, file-level plan, TDD, integration and browser checks |
| L | Visual/audio production, licensing, packaging, or public release | Full design and implementation gates, provenance, environment matrix, independent review, production proof |

Escalate the level when a new risk appears. Do not reduce verification merely because implementation happens to be short.

## 5. Core workflow

The concise `SKILL.md` routes the agent through the following workflow:

1. **Establish the baseline.** Confirm the active branch, dirty files, supported runtimes, local run path, automated checks, release surfaces, and existing user data.
2. **Translate feedback into player outcomes.** Convert subjective feedback such as “more responsive” or “less fake” into testable timing, scale, layout, audio, or interaction targets.
3. **Compare experience directions.** For visual, control, or audio choices, present two or three concrete alternatives and obtain user approval before producing final assets or deep implementation.
4. **Freeze boundaries.** Record goals, non-goals, platforms, languages, persistence scope, licensing limits, compatibility requirements, and failure behavior.
5. **Write the design contract.** Cover state, input, collision, UI, audio, assets, localization, accessibility, persistence, fallback behavior, and acceptance evidence as applicable.
6. **Write an executable plan.** Map files and interfaces; split work into small red-green-refactor tasks with focused and full verification.
7. **Implement in risk order.** Prefer pure logic and test seams before Canvas, DOM, browser APIs, binary assets, packaging, and release metadata.
8. **Preserve provenance and reproducibility.** Use official sources, record licenses and hashes, self-host runtime assets, document transformations, and retain programmatic fallbacks.
9. **Validate in layers.** Run logic tests, static/resource checks, browser interaction and viewport matrices, failure-mode checks, and any real packaged runtime checks.
10. **Close the release loop.** Keep version surfaces consistent, create the pull request, verify the production deployment by exact commit and behavior, then tag and publish from the merged branch.

The Skill must distinguish automated evidence, manual evidence, and production evidence. One category never implies another.

## 6. Skill package structure

Create only the resources needed for the initial reusable version:

```text
.agent/skills/ship-browser-games/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    ├── scope-and-design-gates.md
    ├── gameplay-ui-and-persistence.md
    ├── assets-audio-and-licensing.md
    ├── testing-and-environment-matrix.md
    ├── release-and-production-proof.md
    └── skyroads-case-study.md
```

Do not add a redundant README, changelog, installation guide, copied design specification, or project-specific automation script. The first version favors durable checklists and evidence contracts; generic scripts should be added only after a second project proves their inputs and directory conventions are stable.

## 7. Reference routing

`SKILL.md` remains concise and loads references only when their topic is in scope:

- `scope-and-design-gates.md` — complexity classification, discovery questions, alternatives, goals/non-goals, approval gates, and plan quality.
- `gameplay-ui-and-persistence.md` — state machines, input ownership, frame-rate independence, continuous collision, Canvas/DOM boundaries, localization, accessibility, and reliable local storage.
- `assets-audio-and-licensing.md` — official-source research, license review, self-hosting, hashes, derived assets, deterministic rendering, adaptive music, playback restrictions, and fallbacks.
- `testing-and-environment-matrix.md` — TDD, viewports, locales, input methods, reduced motion, HTTP versus `file://`, storage/audio failure paths, and packaged-runtime checks.
- `release-and-production-proof.md` — version contracts, commit hygiene, pull requests, deployment SHA checks, post-merge tags, release artifacts, and rollback-safe failure behavior.
- `skyroads-case-study.md` — concise repository-specific map to the committed specifications, plans, asset recipes, tests, and known risks. It links to those files instead of reproducing them.

## 8. Metadata and invocation

Add `agents/openai.yaml` with:

- a human-readable display name;
- a 25–64 character summary;
- a short default prompt that explicitly invokes `$ship-browser-games`;
- implicit invocation enabled because the repository uses this Skill as its default guide for relevant browser-game work.

The Skill frontmatter name is exactly `ship-browser-games`. Its description states both what it handles and the situations that should trigger it.

## 9. Validation and forward testing

The package is complete only after all of the following pass:

1. the official `skill-creator` quick validator;
2. frontmatter and `agents/openai.yaml` metadata checks;
3. link/path review for every repository-specific reference;
4. `git diff --check`;
5. forced Git staging and index verification;
6. at least three minimal-context forward tests using user-like prompts:
   - a small gameplay feel adjustment that should select level S;
   - an audio and licensed-asset polish request that should select level L and load the asset/audio reference;
   - a release request that should require merged-commit production proof before tagging.

Forward-test reviewers receive the raw Skill artifact and prompt, not an explanation of the expected answer. Findings that expose unclear routing or missing safety gates must be fixed and retested.

## 10. V1.1 and handoff integration

The repository Skill joins the already approved V1.1 pause and release work on `feat/stellar-command-polish`. The V1.1 implementation plan must be amended so the Skill, its tracking contract, validation, and handoff are visible release tasks rather than undocumented side work.

After the Skill is validated, create a lightweight handoff document in an operating-system temporary directory. It must:

- identify the workspace, branch, HEAD, remote difference, and lack of an existing pull request;
- link to the approved pause design, release design, V1.1 implementation plan, and this Skill design;
- state that pause/version implementation has not started;
- record the active local preview URL and that the public Pages site still serves the old release;
- direct the next session to the new repository Skill;
- highlight future music, enemy-building, and UI work, including licensing, collision/render alignment, audio-loop, viewport, localization, and WebView risks;
- list suggested supporting skills without duplicating their contents;
- avoid secrets, authentication material, pasted diffs, and repeated specifications.

The handoff file itself remains outside the repository, as required by the handoff workflow.

## 11. Acceptance criteria

- `.agent/skills/ship-browser-games/` exists with the approved package structure.
- The Skill is reusable for static browser games and retains a clearly separated Skyroads adapter.
- Complexity routing prevents small tasks from triggering an unnecessarily large release process.
- The workflow covers experience design, gameplay, UI, persistence, third-party assets, music, localization, accessibility, testing, packaging, deployment, and releases.
- The official validator and all forward tests pass.
- The complete Skill is present in the Git index and in a V1.1 branch commit despite ignore configuration.
- The V1.1 plan references this work.
- A concise temporary handoff document points a future session to the Skill and current approved plans.

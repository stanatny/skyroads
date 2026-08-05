# Ship Browser Games V1.1 Backport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backport final V1.1/V1.1.1 browser-game lessons into the repository Skill and add a deterministic static-deployment verifier.

**Architecture:** Extend the existing small reference files instead of bloating `SKILL.md`. Keep project values in `skyroads-case-study.md`; keep reusable browser-game rules in domain references; implement static byte verification as a zero-dependency Node script with isolated tests.

**Tech Stack:** Markdown Agent Skill, Node.js built-ins and test runner, Git, local HTTP server.

## Global Constraints

- Branch starts at merge commit `96b83e8970cd5661f93ed980dfecf849b60a174c`.
- No gameplay, assets, product version, tag, Release, or deployment changes.
- Repository Skill remains usable without Botmux.
- Correct final movement values are `145 / 220 / 110 ms`.
- Project values belong only in `skyroads-case-study.md`.
- Public files contain no private domains, development-machine IPs, or absolute workspace paths.
- Every commit ends with exactly one `Co-authored-by: TRAE CLI <noreply@bytedance.com>` trailer.

---

### Task 1: Skill Contract RED

**Files:**
- Create: `.agent/skills/ship-browser-games/tests/skill-contracts.test.mjs`

**Interfaces:**
- Consumes: Skill Markdown files.
- Produces: assertions for final case-study values, artifact links, reusable patterns, and public-source safety.

- [ ] Require:
  - `145 / 220 / 110 ms`;
  - absence of the stale `140 / 85 ms` sentence;
  - links for Semantic Spectrum, event horizon, Heavy Swarm, perceptual HUD, vector thrusters, and charge HUD patch;
  - transient HUD stability, sustained-audio ownership, equivalent fallback cues, condition-based readiness, platform-suite separation, and five shipping states;
  - no private paths or domains.
- [ ] Run `node --test .agent/skills/ship-browser-games/tests/skill-contracts.test.mjs`.
- [ ] Verify RED against current Skill content.

### Task 2: Reference and Case-Study Update

**Files:**
- Modify: `.agent/skills/ship-browser-games/SKILL.md`
- Modify: `.agent/skills/ship-browser-games/references/gameplay-ui-and-persistence.md`
- Modify: `.agent/skills/ship-browser-games/references/assets-audio-and-licensing.md`
- Modify: `.agent/skills/ship-browser-games/references/testing-and-environment-matrix.md`
- Modify: `.agent/skills/ship-browser-games/references/release-and-production-proof.md`
- Modify: `.agent/skills/ship-browser-games/references/skyroads-case-study.md`

**Interfaces:**
- Consumes: approved backport design and current repository evidence.
- Produces: corrected project case study and reusable browser-game practices.

- [ ] Add the approved guidance without duplicating the cross-engine Skill.
- [ ] Correct movement values and add all final V1.1 artifact links.
- [ ] Keep `SKILL.md` concise and references one level deep.
- [ ] Run the contract test and repository syntax checks.
- [ ] Verify GREEN.

### Task 3: Static Deployment Verifier RED/GREEN

**Files:**
- Create: `.agent/skills/ship-browser-games/scripts/verify-static-deploy.mjs`
- Create: `.agent/skills/ship-browser-games/tests/verify-static-deploy.test.mjs`

**Interfaces:**
- CLI inputs: `--root`, `--ref`, `--base-url`, repeated `--file`, optional `--cache-bust`, `--timeout-ms`, `--json`.
- Output: per-file HTTP status, size, local hash, remote hash, match; process exit nonzero on unavailable/mismatch.

- [ ] Write tests using a temporary Git repository and local HTTP server.
- [ ] Verify RED because the script is absent.
- [ ] Implement argument parsing, `git show`, `fetch`, SHA-256, JSON/text output, timeout, and static-only evidence note with Node built-ins.
- [ ] Verify matching, mismatch, missing, cache-bust, spaces, parseability, and no checkout mutation.
- [ ] Run both Skill test files and verify GREEN.

### Task 4: Repository Verification and PR

**Files:**
- Verify all changed Skill, spec, plan, script, and test files.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: clean review branch and PR creation link.

- [ ] Run:
  - both new Skill tests;
  - `npm run check`;
  - Linux-compatible Node suites;
  - existing release/static tests;
  - skill validator;
  - `git diff --check`;
  - private-reference scan.
- [ ] Test `verify-static-deploy.mjs` against the production Pages URL and `origin/main` for a small file list without modifying the checkout.
- [ ] Commit focused changes with the required trailer.
- [ ] Push `docs/game-development-skill-retrospective`.
- [ ] Verify remote SHA equals local SHA.
- [ ] Create or provide a prefilled PR against `main`; do not merge.

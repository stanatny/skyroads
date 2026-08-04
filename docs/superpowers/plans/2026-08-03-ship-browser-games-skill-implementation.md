# Ship Browser Games Repository Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tracked, reusable `$ship-browser-games` repository Skill and a temporary handoff that preserve the Nebula Cruise browser-game delivery workflow.

**Architecture:** Keep the reusable workflow in a concise `SKILL.md`, route detailed topic guidance into six references, and isolate repository-specific facts in a Skyroads case study. Make tracking explicit through repository ignore exceptions, forced staging, index assertions, the official validator, and minimal-context forward tests.

**Tech Stack:** Markdown, YAML, Git, Codex Skill Creator scripts, Python 3.14 with PyYAML, GitHub, and the existing Skyroads design/test/release artifacts.

## Global Constraints

- Create the Skill only at `.agent/skills/ship-browser-games/`; do not use `.agents/`.
- Treat the Skill as a Nebula Cruise V1.1 release artifact on `feat/stellar-command-polish`.
- Keep `SKILL.md` below 500 lines and load detailed references progressively.
- Add no runtime dependency, generated asset, copied specification, generic automation script, README, install guide, or changelog.
- Use the required `init_skill.py` scaffold before editing Skill files.
- Explicitly unignore the Skill, stage it with `git add -f`, and prove every file is present in the Git index and commit.
- Keep the handoff in an operating-system temporary directory, never in the repository.
- Do not include secrets, authentication material, personal data, pasted diffs, or duplicated specifications.

## File Structure

**Create**

- `.agent/skills/ship-browser-games/SKILL.md` — trigger, complexity routing, core workflow, stop gates, and reference routing.
- `.agent/skills/ship-browser-games/agents/openai.yaml` — UI metadata and invocation policy.
- `.agent/skills/ship-browser-games/references/scope-and-design-gates.md` — discovery, S/M/L classification, approval, and planning gates.
- `.agent/skills/ship-browser-games/references/gameplay-ui-and-persistence.md` — state, input, collision, Canvas/DOM, i18n, accessibility, and storage.
- `.agent/skills/ship-browser-games/references/assets-audio-and-licensing.md` — sources, provenance, derived art, music, playback, and fallbacks.
- `.agent/skills/ship-browser-games/references/testing-and-environment-matrix.md` — automated, browser, failure-mode, and packaged-runtime evidence.
- `.agent/skills/ship-browser-games/references/release-and-production-proof.md` — version, PR, deployment SHA, tag, release, and failure rules.
- `.agent/skills/ship-browser-games/references/skyroads-case-study.md` — links and lessons from committed repository artifacts.
- `docs/superpowers/plans/2026-08-03-ship-browser-games-skill-implementation.md` — this plan.
- A temporary `skyroads-v1.1-handoff.md` under a validated `mktemp -d` directory.

**Modify**

- `.gitignore` — explicit exceptions for the repository Skill.
- `docs/superpowers/plans/2026-08-03-nebula-cruise-v1.1-implementation.md` — add the Skill as a V1.1 prerequisite and release blocker.

---

### Task 1: Scaffold the tracked Skill and write its core workflow

**Files:**
- Create: `.agent/skills/ship-browser-games/SKILL.md`
- Create: `.agent/skills/ship-browser-games/agents/openai.yaml`
- Create: `.agent/skills/ship-browser-games/references/`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `$ship-browser-games`, complexity levels `S | M | L`, and progressive reference routes.
- Consumes: `docs/superpowers/specs/2026-08-03-ship-browser-games-skill-design.md`.

- [ ] **Step 1: Run the required initializer**

```bash
SKILL_CREATOR_ROOT="${CODEX_SKILL_CREATOR_ROOT:-$HOME/.codex/skills/.system/skill-creator}"
python3 "$SKILL_CREATOR_ROOT/scripts/init_skill.py" \
  ship-browser-games \
  --path .agent/skills \
  --resources references \
  --interface 'display_name=Ship Browser Games' \
  --interface 'short_description=Design, build, verify, and release browser games' \
  --interface 'default_prompt=Use $ship-browser-games to plan and ship this browser-game change with proportional design, testing, and release evidence.'
```

Expected: the initializer creates `SKILL.md`, `agents/openai.yaml`, and `references/` without example placeholders.

- [ ] **Step 2: Make repository tracking explicit**

Append this exact block to `.gitignore`:

```gitignore
# Repository Codex Skill is a V1.1 release artifact.
!.agent/
!.agent/skills/
!.agent/skills/ship-browser-games/
!.agent/skills/ship-browser-games/**
```

- [ ] **Step 3: Replace the generated `SKILL.md` template**

Use frontmatter name `ship-browser-games`. The description must trigger on browser-game design, implementation, polish, assets/audio, localization, persistence, packaging, and release work. The body must contain these exact sections:

```text
Overview
Classify Before Expanding Scope
Establish the Baseline
Turn Feedback Into Contracts
Design and Plan Before Large Changes
Implement in Risk Order
Require Layered Evidence
Close the Release Loop
Reference Routing
Stop Conditions
```

State that S work receives focused checks, M work requires an approved design and file-level plan, and L work also requires provenance, real environment checks, independent review, and production proof. State explicitly that automated, manual, packaged-runtime, and production evidence are not interchangeable.

- [ ] **Step 4: Finalize metadata**

Ensure `agents/openai.yaml` contains only:

```yaml
interface:
  display_name: "Ship Browser Games"
  short_description: "Design, build, verify, and release browser games"
  default_prompt: "Use $ship-browser-games to plan and ship this browser-game change with proportional design, testing, and release evidence."

policy:
  allow_implicit_invocation: true
```

- [ ] **Step 5: Confirm the core contains no scaffold text**

Run:

```bash
rg -n 'TODO|TBD|Structuring This Skill|Example Asset|api_reference' .agent/skills/ship-browser-games
```

Expected: no output and exit status 1.

### Task 2: Add the reusable design, gameplay, asset, and audio references

**Files:**
- Create: `.agent/skills/ship-browser-games/references/scope-and-design-gates.md`
- Create: `.agent/skills/ship-browser-games/references/gameplay-ui-and-persistence.md`
- Create: `.agent/skills/ship-browser-games/references/assets-audio-and-licensing.md`

**Interfaces:**
- Produces: concrete checklists loaded by `SKILL.md` for design, gameplay, UI, persistence, visual assets, and audio.
- Consumes: the S/M/L classification and workflow from Task 1.

- [ ] **Step 1: Write `scope-and-design-gates.md`**

Include: baseline questions; S/M/L classification examples; two-or-three-direction comparison rules; player-language-to-measurable-contract examples; goals/non-goals; platform, language, data, copyright, accessibility, fallback, and release boundaries; design approval; file/interface plan review; and the rule that implementation cannot silently broaden scope.

- [ ] **Step 2: Write `gameplay-ui-and-persistence.md`**

Include: explicit state machines; input ownership and editable/dialog gates; browser repeat and lost-focus cleanup; frame-rate-independent timing; continuous render/collision coordinates and swept checks; Canvas for world graphics versus DOM for localized interactive UI; focus and pointer-event rules; reduced motion; locale parity and IME/grapheme safety; schema-versioned local storage; field validation, bounded data, primary/backup/read-back recovery, and in-memory fallback.

- [ ] **Step 3: Write `assets-audio-and-licensing.md`**

Include: official-source-first research; license compatibility before download; smallest used subset; local runtime hosting; source URL/revision/license/hash/modification records; derived-output recipes; transparent-edge, scale, hitbox, performance, and fallback checks; deterministic music sources; synchronized stem duration/start/transition contracts; OGG/MP3 or platform-appropriate fallback; autoplay, `file://`, timeout, cleanup, visibility, mute-preference, and loop-seam tests; and at least two full human listening loops before audio approval.

- [ ] **Step 4: Verify reference routing**

Every reference must say when to load it. `SKILL.md` must link each file using a relative `references/...` path and must not duplicate its full checklists.

### Task 3: Add testing and production-release evidence references

**Files:**
- Create: `.agent/skills/ship-browser-games/references/testing-and-environment-matrix.md`
- Create: `.agent/skills/ship-browser-games/references/release-and-production-proof.md`

**Interfaces:**
- Produces: an evidence matrix and a safe merge/deploy/tag/release sequence.
- Consumes: runtime and risk surfaces identified by Tasks 1–2.

- [ ] **Step 1: Write `testing-and-environment-matrix.md`**

Define evidence layers for pure logic, syntax/static graph, assets and licenses, Canvas/DOM integration, real browser interaction, viewport/locale/input/reduced-motion combinations, storage/audio/asset failures, HTTP, direct-file or WebView runtime, packaging resources, architecture/signature, and independent review. Require expected-red proof before minimal implementation for behavior changes and fresh final runs before completion claims.

- [ ] **Step 2: Write `release-and-production-proof.md`**

Define one canonical semantic version and derived display/tag forms; distinguish product, data-schema, and package build versions; require a clean branch and reviewed PR; merge before production verification; match the deployed commit SHA and canonical URL; verify visible behavior and assets with cache busting; tag only the verified merged commit; avoid force-updating public tags; verify downloadable artifacts and checksums; and report authentication or deployment failures without claiming release completion.

- [ ] **Step 3: Check cross-reference completeness**

Run:

```bash
for ref in \
  scope-and-design-gates \
  gameplay-ui-and-persistence \
  assets-audio-and-licensing \
  testing-and-environment-matrix \
  release-and-production-proof; do
  test -f ".agent/skills/ship-browser-games/references/${ref}.md"
  rg -q "references/${ref}\.md" .agent/skills/ship-browser-games/SKILL.md
done
```

Expected: exit status 0.

### Task 4: Add the Skyroads adapter and bind the Skill into V1.1

**Files:**
- Create: `.agent/skills/ship-browser-games/references/skyroads-case-study.md`
- Modify: `docs/superpowers/plans/2026-08-03-nebula-cruise-v1.1-implementation.md`

**Interfaces:**
- Produces: repository-specific routing without contaminating the reusable workflow.
- Consumes: committed Skyroads specs, plans, asset recipes, notices, tests, and release workflow.

- [ ] **Step 1: Write `skyroads-case-study.md`**

Link, without copying, the command-center polish design and plan, pause design, V1.1 release design and plan, audio-generation recipe, ship-render recipe, third-party notices, license directory, relevant `src/` boundaries, Node tests, macOS smoke scripts, and release workflow. Record the concrete lessons: 145/140/85 ms control contracts; continuous render/collision coordinates; local Top 15 recovery; classic scripts for HTTP and `file://`; synchronized three-stem audio; asset provenance; 960×600 bilingual acceptance; and exact-SHA Pages proof.

- [ ] **Step 2: Add a V1.1 Skill prerequisite**

Add a global constraint and a `Task 0` to the V1.1 implementation plan. `Task 0` must require: execution of this Skill plan, successful official validation, successful forward tests, `git ls-files` proof for every Skill file, a commit containing the complete Skill, and creation of the temporary handoff. State that failure blocks the V1.1 PR.

- [ ] **Step 3: Verify every case-study path**

Extract every backticked repository path from the case study and manually confirm it exists. Then run:

```bash
rg -n 'docs/superpowers|docs/assets|THIRD_PARTY_NOTICES|tests/|src/|release-macos' \
  .agent/skills/ship-browser-games/references/skyroads-case-study.md
```

Expected: each required evidence family appears at least once.

### Task 5: Validate, forward-test, force-track, and commit the Skill

**Files:**
- Modify only files with findings from validation or forward tests.

**Interfaces:**
- Produces: validated and Git-tracked Skill evidence.
- Consumes: complete package from Tasks 1–4.

- [ ] **Step 1: Run structural and formatting validation**

```bash
SKILL_CREATOR_ROOT="${CODEX_SKILL_CREATOR_ROOT:-$HOME/.codex/skills/.system/skill-creator}"
/opt/homebrew/bin/python3.14 \
  "$SKILL_CREATOR_ROOT/scripts/quick_validate.py" \
  .agent/skills/ship-browser-games
git diff --check
```

Expected: `Skill is valid!` and no diff errors.

- [ ] **Step 2: Run three minimal-context forward tests**

Give separate fresh reviewers the raw Skill package and exactly one prompt each:

1. `The ship shifts too slowly when I tap left. Make it feel quicker without changing anything else.`
2. `Replace the enemy towers and HUD with free visual assets, rewrite the adaptive music, and prepare the macOS release.`
3. `V1.2 is done. Publish it on GitHub Pages and tag the release.`

Accept only if prompt 1 stays level S and avoids unrelated release work; prompt 2 selects level L and requires licensing, reproducibility, audio listening, browser, and packaged-runtime evidence; prompt 3 refuses to tag before the merged deployment SHA and playable production behavior are verified.

- [ ] **Step 3: Fix and rerun any failed case**

Change only the ambiguous routing or missing gate identified by the reviewer, rerun the official validator, and repeat that exact prompt with a fresh reviewer until it passes.

- [ ] **Step 4: Force the package into the Git index**

```bash
git add .gitignore docs/superpowers/plans/2026-08-03-nebula-cruise-v1.1-implementation.md
git add -f .agent/skills/ship-browser-games
find .agent/skills/ship-browser-games -type f -print0 | \
  while IFS= read -r -d '' file; do git ls-files --error-unmatch "$file" >/dev/null; done
git diff --cached --check
```

Expected: every file resolves through `git ls-files`; the staged diff has no whitespace error.

- [ ] **Step 5: Commit and prove the commit contains the Skill**

```bash
git commit -m "docs: add browser game delivery skill"
git show --name-only --format= HEAD | rg '^\.agent/skills/ship-browser-games/'
git status --short --branch
```

Expected: the commit lists `SKILL.md`, `agents/openai.yaml`, and all six references; no Skill file remains untracked.

### Task 6: Create the temporary handoff and final evidence snapshot

**Files:**
- Create outside repository: `<mktemp result>/skyroads-v1.1-handoff.md`

**Interfaces:**
- Produces: one local handoff path for the next session.
- Consumes: final Skill path, current Git facts, approved plans, preview state, and public deployment state.

- [ ] **Step 1: Allocate a safe temporary directory**

```bash
mktemp -d "${TMPDIR:-/tmp}/skyroads-v1.1-handoff.XXXXXX"
```

Record the exact printed directory; do not derive a deletion target from an unresolved variable.

- [ ] **Step 2: Create the handoff with `apply_patch`**

Write `skyroads-v1.1-handoff.md` inside that exact directory. Include: objective; workspace/branch/HEAD/remote delta; no existing PR; completed design and plan links; unimplemented pause/version state; Skill location and invocation; local preview URL; old public Pages state; recommended next action; future music, enemy-building, and UI risks; suggested skills; and evidence still required. Do not paste specs, plans, diffs, tokens, cookies, or credentials.

- [ ] **Step 3: Verify the handoff and final repository state**

```bash
test -s '<exact-temp-directory>/skyroads-v1.1-handoff.md'
rg -n 'ship-browser-games|music|enemy|UI|PR|Pages|Suggested skills' \
  '<exact-temp-directory>/skyroads-v1.1-handoff.md'
git status --short --branch
git log -6 --oneline
```

Expected: the handoff contains every continuation topic, the repository has no unexpected files, and the Skill commit is present on `feat/stellar-command-polish`.

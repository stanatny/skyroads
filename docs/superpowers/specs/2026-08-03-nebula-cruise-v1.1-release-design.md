# Nebula Cruise V1.1 Release — Design Specification

**Date:** 2026-08-03
**Status:** Awaiting written-spec confirmation
**Branch:** `feat/stellar-command-polish`
**Base release:** `v1.0.0`
**Target release:** `v1.1.0`

## 1. Purpose and scope

Package the command-center polish and approved pause feature as Nebula Cruise V1.1, submit the feature branch as a pull request against `main`, and publish the formal GitHub release only after that pull request has been merged.

V1.1 includes the work already present on the feature branch plus the pause behavior defined in `2026-08-03-nebula-cruise-pause-design.md`. This release design adds a consistent product-version contract, a restrained in-game version badge, bilingual release documentation, and safeguards against publishing a mismatched tag or macOS build.

## 2. Version identity

Use these identifiers consistently:

| Surface | Value |
| --- | --- |
| Product version | `1.1.0` |
| In-game display | `V1.1` |
| Git tag | `v1.1.0` |
| GitHub Release name | `星云巡航 V1.1 / Nebula Cruise V1.1` |
| macOS short version | `1.1.0` |
| macOS build number | `2` |

The lowercase `v1.1.0` tag follows the existing `v1.0.0` repository convention. The shorter uppercase `V1.1` is presentation text only.

The leaderboard document field `version: 1` and versioned local-storage keys describe the persisted data schema, not the product release. They remain unchanged so existing local records continue to load.

## 3. Version contract

`package.json` is the canonical machine-readable product version and gains `"version": "1.1.0"`.

Add a small browser-compatible release module that exposes the full semantic version and derives the display label `V1.1`. It loads before presentation code and performs no network request, storage write, or runtime environment detection.

Add `<meta name="application-version" content="1.1.0">` to the HTML shell so the deployed build can be checked without depending only on visible text. The release-contract test treats this metadata as another required representation of the canonical package version.

Because the static web game and macOS property list are consumed without a JavaScript build step, the product version is represented in more than one file. A release-contract test must compare the browser release module, `package.json`, `app/Info.plist`, each README's declared current-version line, and the expected display label. This keeps direct `index.html` usage while preventing silent version drift.

The GitHub release workflow must verify that its release tag is exactly `v${package.version}` before it runs the macOS build and upload steps. A mismatch fails the workflow without publishing a wrongly named asset.

## 4. In-game presentation and accessibility

Show one non-interactive `V1.1` badge on the command-center title panel only. Place it on the first row opposite `INTERSTELLAR COMMAND` / `星际指挥中心`, so it does not add panel height or compete with the title.

The badge:

- uses a semantic `<small>` or `<span>` rather than a button;
- is not focusable and is not an `aria-live` region;
- receives a localized accessible label: `Version 1.1` in English and `版本 1.1` in Chinese;
- follows the existing cyan command-center visual language;
- is absent from the active-game HUD, game-over panel, dialogs, and Canvas drawing code;
- remains readable without overlap or scrolling at the supported 960 × 600 minimum viewport, including the fifth pause-control line.

The browser document title and macOS window title remain product-name only.

## 5. Pause integration and localization

V1.1 must include the formal `PAUSED` game state, `P` pause/resume behavior, frozen simulation, pause audio mix, semantic pause overlay, focus behavior, and input clearing specified in `2026-08-03-nebula-cruise-pause-design.md`.

Add matching English and Chinese catalog entries for:

- pause title and resume hint;
- pause/resume control description;
- accessible version label.

Language changes while paused immediately refresh the pause overlay and version accessibility text. Product version numbers themselves are not translated.

## 6. Repository and release documentation

Update `README.md` and `README.zh-CN.md` in parallel:

- identify this code line as version `1.1.0`;
- add pause/resume to the controls table;
- include pause, continuous movement, bilingual UI, local Top 15, adaptive music, and command-center polish in the V1.1 feature summary;
- preserve the English README as the default landing page and the reciprocal language links.

Prepare bilingual GitHub Release notes summarizing player-visible changes, keyboard controls, the local-only nature of the Top 15, and the macOS download. Release notes must not claim cross-device ranking, online storage, or support outside the tested browser and macOS scope.

## 7. Public web deployment

The canonical playable web address remains:

```text
https://stanatny.github.io/skyroads/
```

The pre-release audit confirmed that this address returns HTTP 200 and that GitHub Pages currently deploys the `main` branch. It also confirmed that the deployed commit is still `dec52a9` from `v1.0.0`, serving the old single-file “太空跳跳车 SkyRoads” page. A reachable URL alone therefore does not satisfy the V1.1 release contract.

After the pull request is merged:

- wait for a successful `github-pages` deployment whose `sha` equals the merged V1.1 commit and whose `ref` is `main`;
- require the deployment environment URL to equal the canonical address above;
- fetch the canonical page with a release cache-busting query and verify HTTP 200, application-version metadata `1.1.0`, the modular V1.1 resource shell, and no legacy single-file title;
- open the public URL in a real browser and verify the visible `V1.1` badge, English/Chinese switching, mission start, `P` pause/resume, and required static assets;
- refresh the plain canonical URL after the GitHub Pages cache window and confirm it also serves V1.1 without a query parameter.

The README “Play online / 在线游玩” link continues to point to this canonical address. A separate preview deployment, custom domain, backend, or alternate production URL is out of scope.

If the Pages deployment fails, points at a different commit, serves missing assets, or still renders the old title, V1.1 is not released even if the GitHub Release and macOS archive succeed.

## 8. Delivery sequence

1. Implement pause and the version contract on `feat/stellar-command-polish` using strict red-green-refactor.
2. Run the complete automated, browser, and packaged-app verification suite.
3. Commit and push the feature branch.
4. Create a pull request against `main` with a bilingual-aware summary and verification evidence.
5. Keep the feature worktree for review fixes; do not tag the feature branch.
6. After the user merges the pull request, wait for GitHub Pages and verify that the canonical URL runs the merged V1.1 commit.
7. Create `v1.1.0` from that same merged `main` commit.
8. Publish `星云巡航 V1.1 / Nebula Cruise V1.1` as a GitHub Release, triggering the existing macOS build workflow.
9. Verify the release workflow, uploaded macOS archive, archive checksum, and the still-live playable web version.

If GitHub authentication is unavailable in the working environment, pushing the feature branch and producing the exact pull-request/release links and text are still valid local completion steps; publishing waits for an authenticated user session. Authentication must never be bypassed or stored in the repository.

## 9. Failure behavior

- A version mismatch fails automated checks before a pull request is considered ready.
- A release-tag mismatch fails the release workflow before packaging or upload.
- A pause implementation failure cannot be excluded from V1.1 merely to publish sooner; it must be fixed or the release must wait.
- A failed GitHub workflow leaves the tag and source history intact for diagnosis; do not overwrite a public tag or force-push to repair it.
- A successful Pages status for the wrong commit is treated as a failed production verification.
- No product-version value is stored in player preferences or leaderboard data, so version changes cannot erase local records.

## 10. Test and acceptance contract

Required automated coverage includes:

- all pause tests and acceptance checks from the pause specification;
- version-module parsing and `V1.1` display derivation;
- one non-interactive title-panel version node with correct English and Chinese accessible labels;
- product-version agreement across browser code, `package.json`, `Info.plist`, and both README files;
- HTML application-version metadata agreement with `package.json`;
- macOS short version `1.1.0` and build number `2` in the built app;
- release-workflow rejection of a tag that differs from `v1.1.0`;
- 960 × 600 title-panel fit in both locales with the pause control and version badge.

Before the pull request is created, run the full Node suite, JavaScript syntax checks, Git diff checks, four macOS smoke scripts, direct packaged `--smoke-test`, and real-browser interaction for pause/resume, language switching, audio utilities, and the version badge. Request an independent code/design review and resolve its findings.

The release is complete only after the merged commit is tagged, the canonical GitHub Pages address serves and can play the merged V1.1 build, the release workflow succeeds, and the macOS archive is downloadable from the published GitHub Release.

---
name: ship-browser-games
description: Design, implement, polish, test, package, and release static browser games built with Canvas, DOM, Web Audio, and local browser storage. Use for browser-game gameplay, input, timing, collision, UI, visual assets, music or sound, localization, accessibility, client-side persistence, static hosting, desktop WebView packaging, versioning, pull requests, deployments, tags, and releases. Do not use as the primary workflow for server-authoritative multiplayer, native-engine projects, backend-heavy economies, or platform-store submissions.
---

# Ship Browser Games

## Overview

Ship static browser-game changes with effort proportional to their risk. Preserve player experience, local data, asset provenance, runtime compatibility, and release truth across Canvas, semantic DOM, Web Audio, static hosting, and optional desktop WebView packages.

Use a different primary workflow for server-authoritative multiplayer, native-engine projects, backend-heavy economies, or platform-store submissions; those products require infrastructure and release controls beyond this Skill.

When a cross-engine game-development lifecycle Skill is available, use it for discussion, option selection, stage gates, and retrospective structure. This repository Skill remains self-contained and owns static-browser implementation and release evidence. Repository-specific contracts override generic examples.

## Classify Before Expanding Scope

Classify the request before planning or editing, and escalate when a new risk appears:

- **S — isolated:** Tune one behavior or copy surface without adding a runtime, data, asset, packaging, or release surface. Establish the baseline, define one focused contract, run focused tests, and perform a proportional visual or interaction check. Do not add unrelated release work.
- **M — integrated:** Cross gameplay, UI, input, persistence, or audio boundaries. Require an approved design, a file-and-interface-level implementation plan, expected-red coverage for behavior changes, integration checks, and real-browser evidence.
- **L — production:** Produce or replace visual/audio assets, introduce licensing or provenance duties, package a WebView application, or publish a public release. Also require reproducible sources, the full environment matrix, independent review, and production proof.

Read [scope and design gates](references/scope-and-design-gates.md) whenever classification, experience alternatives, acceptance contracts, or scope boundaries need more detail.

## Establish the Baseline

Before changing files, inspect the active branch and dirty worktree, supported browsers and packaged runtimes, launch paths, existing tests, release automation, version surfaces, and persisted user data. Record the current commit and preserve unrelated work. Confirm whether HTTP, direct `file://`, and WebView execution are contractual rather than assuming browser success covers them.

## Turn Feedback Into Contracts

Translate player language such as “quicker,” “more visible,” or “less calm” into measurable timing, geometry, contrast, pacing, transition, or fallback targets. Preserve the requested outcome and explicit non-goals. For subjective visual, control, or audio work, compare two or three concrete directions and obtain approval before deep production.

## Design and Plan Before Large Changes

Keep S work focused. For M and L work, obtain approval for a design that covers every affected state, interface, failure path, and acceptance surface, then write an executable file-level plan with red-green tasks and verification commands. Do not silently broaden the implementation beyond the approved boundaries.

## Implement in Risk Order

Build testable pure logic and seams first, then gameplay state and persistence, Canvas/DOM integration, browser APIs, binary assets, packaged-runtime wiring, and release metadata. Preserve classic-script or build-free constraints when they are part of the supported runtime. Keep deterministic fallbacks for optional visual and audio resources.

Read [gameplay, UI, and persistence](references/gameplay-ui-and-persistence.md) when state, input, collision, Canvas/DOM, localization, accessibility, or local storage is in scope. Read [assets, audio, and licensing](references/assets-audio-and-licensing.md) before sourcing, generating, transforming, or shipping visual or audio material.

## Require Layered Evidence

Require expected-red proof before the minimal implementation of a behavior change, then run fresh focused and full checks after the final edit. Match evidence to every affected surface: logic, static resource graph, integration, real browser, failure modes, packaging, and independent review.

Automated, manual, packaged-runtime, and production evidence are not interchangeable. A passing unit suite does not prove browser interaction; a browser preview does not prove `file://` or WebView packaging; a successful deployment job does not prove that the canonical public URL serves the intended commit and playable assets.

Read the [testing and environment matrix](references/testing-and-environment-matrix.md) when choosing or reviewing evidence.

## Close the Release Loop

Derive every display, package, tag, and release form from one canonical product version while keeping schema and package-build versions distinct. Require a reviewed, clean pull request, merge before production verification, prove the canonical deployment serves the exact merged commit and visible behavior, then tag that verified commit and verify release artifacts.

Read [release and production proof](references/release-and-production-proof.md) for any version, PR, deployment, tag, or downloadable release task.

For static deployments, use `scripts/verify-static-deploy.mjs` to compare selected online files byte-for-byte with a Git ref. Treat that result as static evidence only; still verify real gameplay and runtime errors separately.

## Reference Routing

- Load [scope and design gates](references/scope-and-design-gates.md) for baseline discovery, S/M/L routing, alternatives, approvals, or plan review.
- Load [gameplay, UI, and persistence](references/gameplay-ui-and-persistence.md) for state machines, controls, collision, DOM/Canvas ownership, localization, accessibility, or browser storage.
- Load [assets, audio, and licensing](references/assets-audio-and-licensing.md) for external sources, derived artwork, adaptive music, sustained effect ownership, codecs, playback restrictions, provenance, or equivalent fallbacks.
- Load the [testing and environment matrix](references/testing-and-environment-matrix.md) to define evidence across logic, browsers, viewports, condition-based readiness, failures, platform-specific suites, direct-file/WebView, and packages.
- Load [release and production proof](references/release-and-production-proof.md) for version contracts, PRs, Pages/static deployment, the five shipping states, tags, artifacts, and release failure handling.
- Load the [Skyroads case study](references/skyroads-case-study.md) only when working in this repository or when a concrete example of these contracts would clarify another static browser game.

## Stop Conditions

Stop and request direction when a material choice would exceed approved scope, change supported platforms or data behavior, or choose among unapproved experience directions. Do not ship an asset with unknown or incompatible licensing, migrate persisted data without validation and recovery, overwrite unrelated work, or claim completion when required evidence cannot run. Do not tag or announce a release when authentication fails, the deployment SHA differs, the canonical URL is stale, playable behavior is unverified, or packaged artifacts are missing.

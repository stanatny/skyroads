# Testing and Environment Matrix

Load this reference when planning evidence, implementing behavior, reviewing completion claims, or changing any browser, packaged-runtime, asset, storage, audio, locale, or release surface.

## Build Evidence in Layers

| Layer | Required evidence |
| --- | --- |
| Pure logic | State transitions, timing thresholds, interpolation, collision boundaries, scoring, validation, ordering, and recovery invariants. |
| Syntax and static graph | Parse/check commands, script order, module/global contracts, referenced resources, locale keys, metadata, and version agreement. |
| Assets and licenses | Source/license presence, hashes, dimensions, budgets, recipes, transparency, fallbacks, and notices. |
| Canvas and DOM integration | Shared coordinates, draw ordering, anchors, overlay visibility, focus, pointer events, semantic labels, and localized content. |
| Real browser | Actual keyboard/pointer flows, hold/repeat/release, blur, pause/restart, autoplay, resize, reload, and console/network errors. |
| Failure modes | Missing/malformed/slow assets, unsupported codec, rejected autoplay, storage denial/quota/corruption, lost focus, and offline behavior. |
| Packaged runtime | Direct `file://` or WebView loading, bundled resources, permissions, architecture, code signature, persistence, audio decode, and clean launch. |
| Production | Canonical URL, cache-busted commit identity, visible playable behavior, asset delivery, artifact download, checksum, and release metadata. |
| Independent review | Spec compliance, code quality, visual/audio acceptance, release-order safety, and unresolved findings. |

## Require Red-Green Evidence

Before implementing a behavior change, add or identify a focused test that fails for the expected contract reason. Record the failure, make the smallest implementation change, rerun it green, then refactor without changing behavior. Exempt documentation-only or otherwise untestable changes explicitly; do not invent meaningless tests.

Run fresh focused checks after each relevant edit and fresh full checks after the final edit. Never reuse stale output as completion evidence.

## Cover the Runtime Matrix

Select combinations from actual supported boundaries rather than an arbitrary browser list:

- minimum, typical, and wide viewports;
- every supported locale, long translated strings, IME entry, keyboard, pointer, and held-key behavior;
- normal and reduced motion, visible and backgrounded pages, muted and unmuted sessions;
- clean, existing, corrupted, unavailable, and quota-limited storage;
- complete, partial, missing, malformed, delayed, and unsupported art/audio resources;
- local HTTP, deployed HTTPS, and any contractual direct-file or WebView path;
- debug and release packages, required architectures, signatures, and resource manifests.

Capture reproducible commands plus the tested commit. For visual proof, capture representative gameplay rather than only menus or isolated sprites. For audio, combine automated synchronization/format checks with real playback and at least the required listening duration.

## Gate Completion

Do not substitute one layer for another. If a required target cannot run, report the exact missing evidence and stop the corresponding completion or release claim. Resolve independent-review findings or record an explicit approved disposition before merge.

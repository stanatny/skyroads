# Skyroads Case Study

Load this reference only when working in the Skyroads repository or when a concrete Nebula Cruise example helps apply the reusable browser-game workflow. Follow the linked artifacts as the source of truth; do not copy their full contracts into new plans.

## Design and Delivery Map

- Command-center polish: [`docs/superpowers/specs/2026-08-02-skyroads-stellar-command-polish-design.md`](../../../../docs/superpowers/specs/2026-08-02-skyroads-stellar-command-polish-design.md) and [`docs/superpowers/plans/2026-08-02-skyroads-stellar-command-polish-implementation.md`](../../../../docs/superpowers/plans/2026-08-02-skyroads-stellar-command-polish-implementation.md).
- Pause and V1.1 release: [`docs/superpowers/specs/2026-08-03-nebula-cruise-pause-design.md`](../../../../docs/superpowers/specs/2026-08-03-nebula-cruise-pause-design.md), [`docs/superpowers/specs/2026-08-03-nebula-cruise-v1.1-release-design.md`](../../../../docs/superpowers/specs/2026-08-03-nebula-cruise-v1.1-release-design.md), and [`docs/superpowers/plans/2026-08-03-nebula-cruise-v1.1-implementation.md`](../../../../docs/superpowers/plans/2026-08-03-nebula-cruise-v1.1-implementation.md).
- Reproducible media recipes: [`docs/assets/audio-generation.md`](../../../../docs/assets/audio-generation.md), [`docs/assets/ship-render.md`](../../../../docs/assets/ship-render.md), and [`docs/assets/world-art.md`](../../../../docs/assets/world-art.md).
- Provenance: [`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) and [`licenses/`](../../../../licenses/).
- Runtime boundaries: [`src/game.js`](../../../../src/game.js), [`src/input.js`](../../../../src/input.js), [`src/obstacles.js`](../../../../src/obstacles.js), [`src/world-art.js`](../../../../src/world-art.js), [`src/presentation.js`](../../../../src/presentation.js), [`src/i18n.js`](../../../../src/i18n.js), [`src/leaderboard.js`](../../../../src/leaderboard.js), and [`src/audio.js`](../../../../src/audio.js).
- Focused Node evidence: [`tests/input.test.js`](../../../../tests/input.test.js), [`tests/leaderboard.test.js`](../../../../tests/leaderboard.test.js), [`tests/audio.test.js`](../../../../tests/audio.test.js), [`tests/game-audio-ui.test.js`](../../../../tests/game-audio-ui.test.js), [`tests/assets.test.js`](../../../../tests/assets.test.js), and [`tests/static-app.test.js`](../../../../tests/static-app.test.js).
- Packaged-runtime evidence: [`tests/app-resources-smoke.sh`](../../../../tests/app-resources-smoke.sh), [`tests/app-wkwebview-smoke.sh`](../../../../tests/app-wkwebview-smoke.sh), [`tests/app-universal-smoke.sh`](../../../../tests/app-universal-smoke.sh), and [`tests/app-signature-smoke.sh`](../../../../tests/app-signature-smoke.sh).
- Release automation: [`.github/workflows/release-macos.yml`](../../../../.github/workflows/release-macos.yml).

## Reusable Lessons

- Turn “responsive” into exact input contracts: 145 ms initial lane travel, 140 ms hold eligibility, and 85 ms repeated lane travel. Carry frame-delta remainder across segments.
- Render and collide from the same continuous lane coordinate; never visually interpolate while collision rounds to a different lane.
- Keep the Top 15 explicitly local, schema-validated, bounded, and recoverable through primary/backup/read-back storage with an in-memory fallback.
- Preserve classic-script ordering and repository-relative resources so the same build works over HTTP and the contractual `file://` WebView path.
- Render deterministic, synchronized `atmosphere`, `drive`, and `overdrive` stems with identical length and start time; verify encoded fallbacks and listen through at least two loops.
- Record official sources, license text, source and output hashes, transformation recipes, atlas geometry, budgets, and procedural fallbacks for every shipped asset family.
- Treat 960 × 600 in both English and Chinese as a real acceptance surface for overlays, controls, version labels, focus, and legibility.
- Prove GitHub Pages serves and can play the exact merged SHA before tagging; a green deployment for a stale commit is a release failure.

# Release and Production Proof

Load this reference for any product-version, package-build, pull-request, deployment, tag, GitHub Pages/static hosting, downloadable artifact, or public release work.

## Define the Version Contract

- Choose one canonical semantic product version and derive human display, metadata, Git tag, and release title forms from it.
- Keep product version, persisted-data schema version, storage-key version, and desktop package build number distinct. Change each only for its own compatibility contract.
- Add automated agreement checks across browser metadata, runtime diagnostics, package manifests, workflow inputs, documentation, tag validation, and release notes.

## Prepare a Reviewable Branch

- Confirm the intended base, feature branch, remote delta, and existing dirty files. Preserve unrelated changes.
- Run fresh focused, full, browser, failure-mode, and packaged-runtime evidence required by the affected surfaces.
- Require a reviewed pull request and a clean, reproducible commit set. Do not create a public tag from an unmerged feature branch.

## Merge, Verify, Then Tag

1. Merge the reviewed pull request through the approved repository flow.
2. Resolve the exact merged commit SHA; do not assume it equals the feature tip.
3. Wait for the production deployment associated with that SHA.
4. Open a cache-busted canonical URL and verify commit/version diagnostics, visible UI, controls, gameplay, localization, and required assets. Then verify the plain canonical URL after its cache window.
5. Treat a successful deployment job for a different SHA, stale cached page, missing resource, old title, or unplayable game as failed production verification.
6. Create the semantic tag only on the verified merged commit. Never force-update a public tag to repair sequencing.
7. Publish release notes and build artifacts from that tag. Verify archive name, package version/build, architectures, signature policy, bundled resources, download, and checksum.

## Handle Failure Truthfully

If authentication, permissions, CI, Pages/static deployment, cache invalidation, packaging, signing, upload, or artifact verification fails, report the exact completed and incomplete stages. Leave the release untagged when production proof has not passed, and never claim release completion because a URL is reachable or a workflow is green in isolation.

Record the branch, PR, merge SHA, deployment identity, canonical URL, verification time, tag target, release URL, artifact checksum, and any remaining manual evidence. Prefer retrying an idempotent failed stage over rewriting history.

# Assets, Audio, and Licensing

Load this reference before researching, downloading, generating, transforming, integrating, or approving visual assets, UI packs, fonts, icons, music, or sound effects.

## Research and License Before Download

- Start with the creator's official site or repository. Record the exact source URL, asset or package revision, retrieval date, license name, license text or canonical URL, source archive hash, selected-file hashes, and attribution requirements.
- Confirm commercial, redistribution, modification, font embedding, and packaged-app compatibility before download. Reject unclear, incompatible, or source-only permissions.
- Import the smallest used subset and host runtime files locally. Do not depend on hotlinked assets, CDN availability, or a network connection unless the approved product scope requires it.
- Keep notices and license files with the repository. Record every crop, recolor, composite, render, compression, conversion, and rename.

## Make Derived Visuals Reproducible

- Preserve a deterministic recipe with tool/runtime versions, source hashes, inputs, parameters, output dimensions, and output hashes. Keep temporary source archives outside the repository unless redistribution is required and approved.
- Inspect transparent edges, premultiplied-alpha halos, anchor/origin, projected scale, perspective, lane/depth variants, hitbox alignment, occlusion, and contrast against real gameplay.
- Measure encoded size, decoded memory, draw count, load time, and failure behavior. Freeze budgets with tests where practical.
- Retain a procedural or bundled fallback that communicates the same gameplay category and danger. Test missing, malformed, partial, slow, and unsupported resources.

## Build and Approve Audio as a System

- Prefer deterministic score or render sources. Record tempo, meter, key structural events, seed, duration, sample rate, channel layout, generator/tool versions, source hash, encoded hashes, and the exact regeneration command.
- For adaptive music, give all stems identical duration, sample count, loop boundary, format choice, and common start timestamp. Define state-to-mix rules and schedule transitions on an audio timeline; never start independently decoded elements and assume synchronization.
- Provide OGG/MP3 pairs or the platform-appropriate fallback. Select one complete supported format for the stem set before loading; do not mix formats within a synchronized run.
- Handle autoplay rejection, suspended contexts, `file://` restrictions, decode/load timeout, partial stem failure, visibility changes, pause transitions, restart, cleanup, mute preference, and seamless looping. Preserve programmatic or single-stem fallback behavior.
- Verify levels, headroom, transition clicks, loop seams, fatigue, and state pacing on real target runtimes. Require at least two uninterrupted full human listening loops before approving music.

## Own Sustained Feedback Once

- Give each sustained sound family a single owner and an explicit priority table. Overlapping gameplay states retarget one shared graph instead of stacking independent loops.
- Smoothly change filter, gain, pitch, or mix parameters when priority changes. Rebuilding the graph is a fallback, not the normal transition path.
- Use one ownership predicate for pause, blur, hidden pages, modal focus, mute, menu, game over, restart, teardown, and active gameplay. Stop and restore from that predicate rather than scattering lifecycle patches.
- Preferred audio or visual resources and their procedural fallback must preserve equivalent player-facing cues even when their fidelity differs.

## Evidence to Retain

Keep source/license records, deterministic recipes, hash and dimension checks, runtime fallback tests, browser screenshots at representative depths/viewports, and listening notes. A valid license does not prove visual fit; a deterministic render does not prove collision alignment; passing decode tests do not replace human listening.

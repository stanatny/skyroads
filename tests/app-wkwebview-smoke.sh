#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash app/build.sh
OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT

set +e
"Nebula Cruise.app/Contents/MacOS/SkyRoads" --smoke-test >"$OUTPUT"
APP_STATUS=$?
set -e

node - "$OUTPUT" "$APP_STATUS" <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8').trim();
const appStatus = Number(process.argv[3]);
let diagnostic;
try { diagnostic = JSON.parse(text); } catch (error) {
  throw new Error(`smoke output must be exactly one JSON object: ${error.message}\n${text}`);
}
if (!diagnostic || Array.isArray(diagnostic) || typeof diagnostic !== 'object') {
  throw new Error('smoke output must be a JSON object');
}
if (appStatus !== 0 || diagnostic.ok !== true) throw new Error(`WKWebView smoke failed (exit ${appStatus}): ${text}`);
if (diagnostic.diagnostics?.initialized !== true) throw new Error('game did not initialize');
for (const script of ['version', 'i18n', 'leaderboard', 'presentation', 'worldArt', 'sceneStyle', 'droneVisual', 'input', 'obstacles', 'gapRegions', 'audio', 'game']) {
  if (diagnostic.diagnostics?.scripts?.[script] !== true) throw new Error(`classic script missing: ${script}`);
}
if (diagnostic.diagnostics?.version?.semver !== '1.1.1') throw new Error('V1.1.1 product diagnostics unavailable');
if (diagnostic.diagnostics?.visualAssets?.shipFramesReady !== true) throw new Error('ship frames did not load');
const world = diagnostic.diagnostics?.visualAssets?.world;
if (!world) throw new Error('world atlas diagnostics unavailable');
const expectedWorldAtlases = ['droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail',
  'barrierCrate', 'structurePylon', 'structureBastion', 'structureReactor', 'structureTower',
  'corridorLow', 'corridorMedium', 'gapEdge'];
if (world.loaded?.length !== expectedWorldAtlases.length || !expectedWorldAtlases.every((atlas) => world.loaded.includes(atlas))) {
  throw new Error('not every preferred world atlas loaded');
}
if (world.fallback?.length !== 0) throw new Error('world atlas fallback was unexpectedly required');
for (const category of ['drone', 'turret', 'wallLow', 'wallMedium', 'wallHigh', 'corridorLow', 'corridorMedium', 'gap']) {
  if (world.categoryReady?.[category] !== true) throw new Error(`world atlas category unavailable: ${category}`);
}
if (diagnostic.diagnostics?.audio?.status !== 'ready' || diagnostic.diagnostics?.audio?.decoded !== true) {
  throw new Error('no complete three-stem audio format decoded');
}
if (!['ogg', 'mp3'].includes(diagnostic.diagnostics?.audio?.format)) throw new Error('decoded audio format missing');
if (diagnostic.cssLoaded !== true) throw new Error('CSS did not load');
if (diagnostic.orbitronLoaded !== true) throw new Error('Orbitron did not load');
NODE

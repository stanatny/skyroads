#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash app/build.sh
OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT

set +e
"星云巡航 Nebula Cruise.app/Contents/MacOS/SkyRoads" --smoke-test >"$OUTPUT"
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
for (const script of ['i18n', 'leaderboard', 'presentation', 'input', 'audio', 'game']) {
  if (diagnostic.diagnostics?.scripts?.[script] !== true) throw new Error(`classic script missing: ${script}`);
}
if (diagnostic.diagnostics?.visualAssets?.shipFramesReady !== true) throw new Error('ship frames did not load');
if (diagnostic.diagnostics?.audio?.status !== 'ready' || diagnostic.diagnostics?.audio?.decoded !== true) {
  throw new Error('no complete three-stem audio format decoded');
}
if (!['ogg', 'mp3'].includes(diagnostic.diagnostics?.audio?.format)) throw new Error('decoded audio format missing');
if (diagnostic.cssLoaded !== true) throw new Error('CSS did not load');
if (diagnostic.orbitronLoaded !== true) throw new Error('Orbitron did not load');
NODE

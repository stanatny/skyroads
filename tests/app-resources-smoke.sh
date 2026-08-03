#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP="Nebula Cruise.app"
bash app/build.sh

required=(
  "index.html"
  "src/version.js"
  "src/i18n.js"
  "src/input.js"
  "src/leaderboard.js"
  "src/presentation.js"
  "src/world-art.js"
  "src/audio.js"
  "src/game.js"
  "styles/game.css"
  "assets/ship/player-neutral.png"
  "assets/ship/player-thrust.png"
  "assets/world/drone-scout.png"
  "assets/world/drone-striker.png"
  "assets/world/turret-sentry.png"
  "assets/world/turret-heavy.png"
  "assets/world/barrier-rail.png"
  "assets/world/barrier-crate.png"
  "assets/world/structure-reactor.png"
  "assets/world/structure-tower.png"
  "assets/world/gap-edge.png"
  "assets/fonts/Orbitron-Medium.ttf"
  "assets/audio/nebula-cruise-atmosphere.ogg"
  "assets/audio/nebula-cruise-drive.ogg"
  "assets/audio/nebula-cruise-overdrive.ogg"
  "THIRD_PARTY_NOTICES.md"
  "licenses"
)

for resource in "${required[@]}"; do
  test -e "$APP/Contents/Resources/$resource" || {
    echo "missing bundled resource: $resource" >&2
    exit 1
  }
done

test "$(plutil -extract CFBundleDisplayName raw "$APP/Contents/Info.plist")" = "星云巡航 Nebula Cruise"
test "$(plutil -extract CFBundleName raw "$APP/Contents/Info.plist")" = "星云巡航 Nebula Cruise"
test "$(plutil -extract CFBundleIdentifier raw "$APP/Contents/Info.plist")" = "com.skyroads.jumpcar"
test "$(plutil -extract CFBundleExecutable raw "$APP/Contents/Info.plist")" = "SkyRoads"
test "$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")" = "1.1.0"
test "$(plutil -extract CFBundleVersion raw "$APP/Contents/Info.plist")" = "2"
cmp index.html "$APP/Contents/Resources/index.html"
diff -qr src "$APP/Contents/Resources/src"
diff -qr styles "$APP/Contents/Resources/styles"
diff -qr assets "$APP/Contents/Resources/assets"
diff -qr licenses "$APP/Contents/Resources/licenses"
cmp THIRD_PARTY_NOTICES.md "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"

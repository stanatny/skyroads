#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash app/build.sh
lipo "太空跳跳车.app/Contents/MacOS/SkyRoads" -verify_arch arm64 x86_64

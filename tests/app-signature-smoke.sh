#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash app/build.sh
codesign --verify --deep --strict --verbose=2 "Nebula Cruise.app"

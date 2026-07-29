#!/bin/bash
# 太空跳跳车 SkyRoads — Mac APP 构建脚本
# 用法: bash app/build.sh
# 产物: 工作区根目录的 太空跳跳车.app（WKWebView 原生壳，几 MB，零依赖）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/太空跳跳车.app"
BUNDLE_MACOS="$APP/Contents/MacOS"
BUNDLE_RES="$APP/Contents/Resources"
DEPLOYMENT_TARGET=12.0

echo "==> 编译 Swift 壳"
rm -rf "$APP"
mkdir -p "$BUNDLE_MACOS" "$BUNDLE_RES"

BUILD_TMP="$(mktemp -d)"
trap 'rm -rf "$BUILD_TMP"' EXIT

swiftc -O -target "arm64-apple-macosx$DEPLOYMENT_TARGET" \
  -o "$BUILD_TMP/SkyRoads-arm64" "$ROOT/app/main.swift"
swiftc -O -target "x86_64-apple-macosx$DEPLOYMENT_TARGET" \
  -o "$BUILD_TMP/SkyRoads-x86_64" "$ROOT/app/main.swift"
lipo -create \
  "$BUILD_TMP/SkyRoads-arm64" \
  "$BUILD_TMP/SkyRoads-x86_64" \
  -output "$BUNDLE_MACOS/SkyRoads"

echo "==> 拷贝游戏本体与元数据"
cp "$ROOT/index.html" "$BUNDLE_RES/index.html"
cp "$ROOT/app/Info.plist" "$APP/Contents/Info.plist"

# 图标（可选）：有 AppIcon.png 则生成 icns
if [ -f "$ROOT/app/AppIcon.png" ] && command -v iconutil >/dev/null; then
  echo "==> 生成图标"
  ICONSET="$ROOT/app/AppIcon.iconset"
  rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$ROOT/app/AppIcon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z $double $double "$ROOT/app/AppIcon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$BUNDLE_RES/AppIcon.icns"
  rm -rf "$ICONSET"
fi

echo "==> 签名应用包"
codesign --force --sign - "$APP"

echo "==> 完成: $APP"
echo "    双击或 open \"$APP\" 即可运行"

#!/usr/bin/env bash
set -euo pipefail

# Build Solen Wallet for Linux (AppImage + .deb)
#
# Prerequisites (Ubuntu/Debian):
#   sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
#     file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
#
# Output:
#   src-tauri/target/release/bundle/appimage/solen-wallet_*.AppImage
#   src-tauri/target/release/bundle/deb/solen-wallet_*.deb

cd "$(dirname "$0")/.."

echo "==> Installing frontend dependencies..."
npm ci

echo "==> Building Solen Wallet for Linux..."
npm run bundle

echo ""
echo "==> Build complete. Packages:"
find src-tauri/target/release/bundle -name "*.AppImage" -o -name "*.deb" 2>/dev/null | while read f; do
  echo "    $(basename "$f") ($(du -h "$f" | cut -f1))"
done

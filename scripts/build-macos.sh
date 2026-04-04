#!/usr/bin/env bash
set -euo pipefail

# Build Solen Wallet for macOS (.dmg)
#
# Prerequisites:
#   - Xcode command line tools: xcode-select --install
#   - Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
#   - Node.js 18+
#
# For Apple Silicon (M1/M2/M3):
#   rustup target add aarch64-apple-darwin
#
# For Intel:
#   rustup target add x86_64-apple-darwin
#
# Output:
#   src-tauri/target/release/bundle/dmg/Solen Wallet_*.dmg

cd "$(dirname "$0")/.."

echo "==> Installing frontend dependencies..."
npm ci

echo "==> Building Solen Wallet for macOS..."
npm run bundle

echo ""
echo "==> Build complete. Packages:"
find src-tauri/target/release/bundle -name "*.dmg" 2>/dev/null | while read f; do
  echo "    $(basename "$f") ($(du -h "$f" | cut -f1))"
done

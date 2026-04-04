#!/usr/bin/env bash
set -euo pipefail

# Build Solen Wallet for Windows (NSIS installer)
#
# Prerequisites:
#   - Rust: https://rustup.rs
#   - Node.js 18+
#   - NSIS: https://nsis.sourceforge.io (or via chocolatey: choco install nsis)
#   - WebView2: pre-installed on Windows 10/11
#
# Cross-compiling from Linux:
#   rustup target add x86_64-pc-windows-msvc
#   (requires MSVC linker — easier to build on Windows directly)
#
# Output:
#   src-tauri/target/release/bundle/nsis/Solen Wallet_*-setup.exe

cd "$(dirname "$0")/.."

echo "==> Installing frontend dependencies..."
npm ci

echo "==> Building Solen Wallet for Windows..."
npm run bundle

echo ""
echo "==> Build complete. Packages:"
find src-tauri/target/release/bundle -name "*.exe" 2>/dev/null | while read f; do
  echo "    $(basename "$f") ($(du -h "$f" | cut -f1))"
done

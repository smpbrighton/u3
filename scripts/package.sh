#!/usr/bin/env bash
set +x
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"

pnpm exec tsx scripts/build-engine.ts
bash scripts/check-engine-key.sh src-tauri/resources/engine.mjs
bash scripts/build-whisper.sh
pnpm exec tsx scripts/fetch-resources.ts
pnpm tauri build --config src-tauri/tauri.bundle.conf.json "$@"

APP="${CARGO_TARGET_DIR:-$HERE/src-tauri/target}/release/bundle/macos/U3.app"
bash scripts/check-engine-key.sh "$APP"

#!/usr/bin/env bash
set +x
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"

pnpm exec tsx scripts/build-engine.ts
bash scripts/check-engine-key.sh src-tauri/resources/engine.mjs
bash scripts/build-whisper.sh
case $(uname -s) in
  Darwin) PLATFORM=darwin; bash scripts/build-tts.sh ;;
  MSYS*|MINGW*) PLATFORM=win32 ;;
  *) echo "지원하지 않는 패키징 플랫폼입니다" >&2; exit 1 ;;
esac
pnpm exec tsx scripts/fetch-resources.ts
if [[ "$PLATFORM" == darwin ]]; then
  pnpm tauri build --config src-tauri/tauri.bundle.conf.json "$@"
else
  # tauri.windows.conf.json은 자동 병합한다. Mac bundle config를 뒤에서 덮지 않는다.
  pnpm tauri build "$@"
fi

if [[ "$PLATFORM" == darwin ]]; then
APP="${CARGO_TARGET_DIR:-$HERE/src-tauri/target}/release/bundle/macos/U3.app"
bash scripts/check-engine-key.sh "$APP"
else
  bash scripts/check-engine-key.sh src-tauri/resources
fi

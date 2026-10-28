#!/usr/bin/env bash
# publish-prompts.sh [--dry-run]
set +x
set +a
set -euo pipefail
umask 077
export TMPDIR=/Volumes/X31/.cache/u3/tmp
export CARGO_HOME=/Volumes/X31/.cache/cargo
export U3_BUILD_CACHE=/Volumes/X31/.cache/u3/build
export HOMEBREW_CACHE=/Volumes/X31/.cache/homebrew

HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"
exec pnpm exec tsx scripts/publish-prompts.ts "$@"

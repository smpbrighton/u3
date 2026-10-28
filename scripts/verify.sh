#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == Darwin ]]; then
  echo 'Windows native 시험 미실행: Mac 검증입니다.'
elif [[ "${U3_WINDOWS_NATIVE:-0}" != 1 ]]; then
  echo 'Windows native 시험 미실행: U3_WINDOWS_NATIVE=1이 필요합니다.'
fi
pnpm typecheck
if [[ "$(uname -s)" == Darwin ]]; then
  pnpm test
else
  # Mac native 계약은 Windows native suite가 대신 검증한다. 공통 API·편집·보안 시험은 유지한다.
  pnpm test --exclude tests/engine/process.test.ts --exclude tests/engine/tts.test.ts \
    --exclude tests/server/tts.test.ts --exclude tests/server/jev-key.test.ts \
    --exclude tests/server/jev-key-win.test.ts --exclude tests/server/codex-models.test.ts
fi
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm smoke
echo '✓ verify passed'

#!/usr/bin/env bash
set -euo pipefail

pnpm typecheck
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
echo '✓ verify passed'

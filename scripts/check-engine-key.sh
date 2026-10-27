#!/usr/bin/env bash
set +x
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
node "$HERE/check-engine-key.mjs" "$@"

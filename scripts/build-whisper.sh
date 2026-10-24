#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${U3_BUILD_CACHE:-$HOME/Library/Caches/u3-build}"
SOURCE="$CACHE/whisper.cpp-1.9.5"
ARCHIVE="$CACHE/whisper.cpp-v1.9.5.tar.gz"
BUILD="$CACHE/whisper-build"

mkdir -p "$CACHE"
if [[ ! -f "$SOURCE/CMakeLists.txt" ]]; then
  curl -fL "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz" -o "$ARCHIVE"
  mkdir -p "$SOURCE"
  tar -xzf "$ARCHIVE" --strip-components=1 -C "$SOURCE"
fi

cmake -S "$SOURCE" -B "$BUILD" \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON
cmake --build "$BUILD" --config Release --target whisper-cli -j "$(sysctl -n hw.ncpu)"

BIN="$BUILD/bin/whisper-cli"
file "$BIN"
otool -L "$BIN"
if otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/System/Library/|/usr/lib/)' | grep -q .; then
  echo "whisper-cli has a non-system dylib dependency" >&2
  exit 1
fi

mkdir -p "$ROOT/src-tauri/resources/bin"
install -m 755 "$BIN" "$ROOT/src-tauri/resources/bin/whisper-cli"
mkdir -p "$ROOT/src-tauri/binaries"
install -m 755 "$BIN" "$ROOT/src-tauri/binaries/whisper-cli-aarch64-apple-darwin"

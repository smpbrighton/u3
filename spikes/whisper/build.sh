#!/usr/bin/env bash
set -euo pipefail

CACHE="/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper"
SOURCE="$CACHE/whisper.cpp-1.9.5"
BUILD="$CACHE/build"

cmake -S "$SOURCE" -B "$BUILD" \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON
cmake --build "$BUILD" --config Release --target whisper-cli -j "$(sysctl -n hw.ncpu)"

BIN="$BUILD/bin/whisper-cli"
file "$BIN"
otool -L "$BIN"

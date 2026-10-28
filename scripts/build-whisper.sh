#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${U3_BUILD_CACHE:-$HOME/Library/Caches/u3-build}"
SOURCE="$CACHE/whisper.cpp-1.9.5"
ARCHIVE="$CACHE/whisper.cpp-v1.9.5.tar.gz"
BUILD="$CACHE/whisper-build"

case $(uname -s) in
  Darwin) PLATFORM=darwin; TARGET=aarch64-apple-darwin ;;
  MSYS*|MINGW*) PLATFORM=win32; TARGET=x86_64-pc-windows-msvc; BUILD="$CACHE/whisper-build-windows" ;;
  *) echo '지원하지 않는 Whisper 빌드 플랫폼입니다' >&2; exit 1 ;;
esac
mkdir -p "$CACHE"
if [[ ! -f "$ARCHIVE" ]]; then
  curl -fL "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz" -o "$ARCHIVE"
fi
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"); if(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex")!=="ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720") { console.error("Whisper archive SHA-256 오류"); process.exit(1); }' "$ARCHIVE"
if [[ ! -f "$SOURCE/CMakeLists.txt" ]]; then
  mkdir -p "$SOURCE"
  # Git Bash 의 GNU tar 는 "D:/..." 의 콜론을 원격 호스트로 해석한다. --force-local 로 로컬 경로로 고정한다.
  TAR_LOCAL=()
  if tar --version 2>/dev/null | grep -q "GNU tar"; then TAR_LOCAL=(--force-local); fi
  tar "${TAR_LOCAL[@]}" -xzf "$ARCHIVE" --strip-components=1 -C "$SOURCE"
fi
if [[ "$PLATFORM" == darwin ]]; then
  cmake -S "$SOURCE" -B "$BUILD" -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON
  cmake --build "$BUILD" --config Release --target whisper-cli -j "$(sysctl -n hw.ncpu)"
  BIN="$BUILD/bin/whisper-cli"
  file "$BIN"
  otool -L "$BIN"
  if otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/System/Library/|/usr/lib/)' | grep -q .; then
    echo "whisper-cli has a non-system dylib dependency" >&2
    exit 1
  fi
  NAME=whisper-cli
else
  # runner 이미지의 Visual Studio 버전이 바뀌어도 되게 generator 를 고정하지 않는다(CMake 기본값 = 설치된 최신 VS).
  cmake -S "$SOURCE" -B "$BUILD" -A x64 \
    -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_NATIVE=OFF \
    -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF
  cmake --build "$BUILD" --config Release --target whisper-cli --parallel
  BIN="$BUILD/bin/Release/whisper-cli.exe"
  NAME=whisper-cli.exe
fi
mkdir -p "$ROOT/src-tauri/resources/bin" "$ROOT/src-tauri/binaries"
cp "$BIN" "$ROOT/src-tauri/resources/bin/$NAME"
cp "$BIN" "$ROOT/src-tauri/binaries/whisper-cli-$TARGET${NAME#whisper-cli}"
chmod 755 "$ROOT/src-tauri/resources/bin/$NAME" "$ROOT/src-tauri/binaries/whisper-cli-$TARGET${NAME#whisper-cli}"

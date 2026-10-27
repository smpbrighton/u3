#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${U3_BUILD_CACHE:?U3_BUILD_CACHE를 X31 경로로 지정하세요}"
[[ "$CACHE" = /* ]] || { echo 'U3_BUILD_CACHE는 절대 경로여야 합니다' >&2; exit 1; }
BUILD="$CACHE/u3-tts"
mkdir -p "$BUILD" "$CACHE/swift-module-cache" "$CACHE/clang-module-cache"
export SWIFT_MODULECACHE_PATH="$CACHE/swift-module-cache"
export CLANG_MODULE_CACHE_PATH="$CACHE/clang-module-cache"
export XDG_CACHE_HOME="$CACHE/xdg-cache"

xcrun metal --version
SWIFT=(swift build --package-path "$ROOT/native/u3-tts"
  --scratch-path "$BUILD" --cache-path "$CACHE/swiftpm"
  --config-path "$CACHE/swiftpm-config" --security-path "$CACHE/swiftpm-security"
  --build-system native --force-resolved-versions -c release --product u3-tts)
"${SWIFT[@]}"
BIN_DIR="$("${SWIFT[@]}" --show-bin-path)"
BIN="$BIN_DIR/u3-tts"

# SwiftPM CLI는 Metal shader를 컴파일하지 않는다. 동일 checkout의 CMake target을 쓴다.
MLX="$BUILD/checkouts/mlx-swift/Source/Cmlx/mlx"
cmake -S "$MLX" -B "$BUILD/metal" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
  -DMLX_BUILD_TESTS=OFF -DMLX_BUILD_EXAMPLES=OFF -DMLX_BUILD_BENCHMARKS=OFF \
  -DMLX_BUILD_PYTHON_BINDINGS=OFF -DMLX_METAL_JIT=ON -DBUILD_SHARED_LIBS=OFF
# Metal 27은 이 매크로만 미리 정의하고 thread_scope_system은 제공하지 않는다.
# MLX 0.29.1의 원래 fallback 선언이 동작하도록 fence만 먼저 컴파일한다.
xcrun -sdk macosx metal -Wall -Wextra -fno-fast-math -Wno-c++17-extensions \
  -mmacosx-version-min=15.0 -U__METAL_MEMORY_SCOPE_SYSTEM__ \
  -c "$MLX/mlx/backend/metal/kernels/fence.metal" \
  -o "$BUILD/metal/mlx/backend/metal/kernels/fence.air"
cmake --build "$BUILD/metal" --target mlx-metallib -j "$(sysctl -n hw.ncpu)"
METALLIB="$BUILD/metal/mlx/backend/metal/kernels/mlx.metallib"
[[ -s "$METALLIB" ]] || { echo "metallib가 없습니다: $METALLIB" >&2; exit 1; }

file "$BIN"
otool -L "$BIN"
if otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/System/Library/|/usr/lib/)' | grep -q .; then
  echo 'u3-tts has a non-system dylib dependency' >&2
  exit 1
fi

mkdir -p "$ROOT/src-tauri/binaries" "$ROOT/src-tauri/resources/tts"
install -m 755 "$BIN" "$ROOT/src-tauri/binaries/u3-tts-aarch64-apple-darwin"
install -m 644 "$METALLIB" "$ROOT/src-tauri/resources/tts/default.metallib"
echo "✓ u3-tts built: $BIN"

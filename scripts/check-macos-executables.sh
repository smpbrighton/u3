#!/usr/bin/env bash
# 셸 스크립트의 xattr 서명은 업데이터 tar.gz에 남지 않는다. Contents/MacOS에는 Mach-O만 허용한다.
set -euo pipefail
APP=${1:?usage: check-macos-executables.sh <U3.app>}
MACOS="$APP/Contents/MacOS"
[[ -d "$MACOS" && -f "$MACOS/u3" ]] || { echo 'Contents/MacOS/u3 실행 파일이 없습니다' >&2; exit 1; }
while IFS= read -r -d '' executable; do
  kind=$(file -b "$executable")
  if [[ "$kind" != Mach-O* ]]; then
    echo "Contents/MacOS에 Mach-O가 아닌 파일이 있습니다: $executable" >&2
    exit 1
  fi
done < <(find "$MACOS" ! -type d -print0)

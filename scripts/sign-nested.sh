#!/bin/bash
# 앱 안의 Mach-O 를 Developer ID + hardened runtime 으로 안쪽부터 서명하고 마지막에 앱을 다시 서명한다.
#   sign-nested.sh <U3.app> <서명 identity>
# Tauri 는 Resources 안의 node·chrome·ffmpeg·.node·.dylib 를 서명하지 않는다. 공증은 모든 실행 파일이 hardened runtime 이어야 받는다.
# 실행 파일(node·chrome-headless-shell·ffmpeg·whisper-cli 등)에는 JIT entitlements(entitlements-engine.plist)를 준다.
set -euo pipefail
APP=${1:?usage: sign-nested.sh <U3.app> <identity>}
ID=${2:?usage: sign-nested.sh <U3.app> <identity>}
HERE=$(cd "$(dirname "$0")/.." && pwd)
bash "$HERE/scripts/check-macos-executables.sh" "$APP"
ENGINE_ENT="$HERE/src-tauri/entitlements-engine.plist"
APP_ENT="$HERE/src-tauri/entitlements.plist"
MAIN="$APP/Contents/MacOS/u3"
count=0
# 깊은 경로부터 서명한다(라이브러리가 실행 파일보다 먼저).
while IFS= read -r file; do
  [[ "$file" == "$MAIN" ]] && continue
  kind=$(file -b "$file")
  [[ "$kind" == Mach-O* ]] || continue
  if [[ "$kind" == *executable* ]]; then
    codesign --force --timestamp --options runtime --entitlements "$ENGINE_ENT" --sign "$ID" "$file"
  else
    codesign --force --timestamp --options runtime --sign "$ID" "$file"
  fi
  count=$((count + 1))
done < <(find "$APP/Contents" -type f | awk -F/ '{ print NF "	" $0 }' | sort -t$'	' -k1,1nr | cut -f2-)
codesign --force --timestamp --options runtime --entitlements "$APP_ENT" --sign "$ID" "$APP"
codesign --verify --deep --strict "$APP"
echo "signed $count nested Mach-O and $APP"

#!/usr/bin/env bash
# compositor 바이너리(remotion·ffmpeg·ffprobe·libav*.dylib)는 서로를 맨 이름(libavutil.dylib)으로 참조한다.
# hardened runtime 은 상대 경로 로드를 거부하므로 설치 이름을 @loader_path/<이름> 으로 다시 쓴다.
#   fix-dylib-paths.sh <dir>          맨 이름 참조를 고치고 ad-hoc 으로 다시 서명한다.
#   fix-dylib-paths.sh --check <dir>  바꾸지 않고 맨 이름 참조가 남아 있으면 종료 코드 1.
set -euo pipefail
MODE=fix
if [[ "${1:-}" == "--check" ]]; then MODE=check; shift; fi
DIR=${1:?usage: fix-dylib-paths.sh [--check] <dir>}
[[ -d "$DIR" ]] || { echo "디렉터리가 없습니다: $DIR" >&2; exit 1; }

bare_dependencies() {
  otool -L "$1" | tail -n +2 | awk '{ print $1 }' | grep -v -e '^/' -e '^@' || true
}

status=0
changed=0
while IFS= read -r file; do
  kind=$(file -b "$file")
  [[ "$kind" == Mach-O* ]] || continue
  name=$(basename "$file")
  bare=$(bare_dependencies "$file")
  own_id=""
  if [[ "$kind" == *"dynamically linked shared library"* ]]; then
    own_id=$(otool -D "$file" | tail -n +2 | tail -n 1)
  fi
  if [[ "$MODE" == check ]]; then
    if [[ -n "$bare" ]]; then echo "맨 이름 dylib 참조가 남아 있습니다: $name → $(echo "$bare" | tr '\n' ' ')" >&2; status=1; fi
    if [[ -n "$own_id" && "$own_id" != /* && "$own_id" != @* ]]; then echo "dylib 설치 이름이 맨 이름입니다: $name ($own_id)" >&2; status=1; fi
    continue
  fi
  args=()
  while IFS= read -r dep; do
    [[ -n "$dep" ]] || continue
    args+=(-change "$dep" "@loader_path/$dep")
  done <<< "$bare"
  if [[ -n "$own_id" && "$own_id" != /* && "$own_id" != @* ]]; then args+=(-id "@loader_path/$name"); fi
  [[ ${#args[@]} -gt 0 ]] || continue
  install_name_tool "${args[@]}" "$file" 2> >(grep -v "invalidate the code signature" >&2 || true)
  codesign --force --sign - "$file" 2>/dev/null
  changed=$((changed + 1))
done < <(find "$DIR" -maxdepth 1 -type f)

if [[ "$MODE" == check ]]; then
  [[ $status -eq 0 ]] && echo "dylib 설치 이름 검사 통과: $DIR"
  exit $status
fi
echo "dylib 설치 이름을 고쳤습니다: $changed 개 ($DIR)"

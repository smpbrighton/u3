#!/usr/bin/env bash
# release.sh [--mac-only] <버전> [--dry-run] [--signature-file <공개 .sig>] [--output-dir <X31 경로>]
# dry-run은 제공한 서명으로 fragment(또는 --mac-only latest.json)를 만든다. 실제 릴리스는 깨끗한 main에서 실행한다.
set +x
set +a
set -euo pipefail
umask 077
export TMPDIR=/Volumes/X31/.cache/u3/tmp
export CARGO_HOME=/Volumes/X31/.cache/cargo
export U3_BUILD_CACHE=/Volumes/X31/.cache/u3/build
export HOMEBREW_CACHE=/Volumes/X31/.cache/homebrew
export npm_config_cache=/Volumes/X31/.cache/npm

HERE=$(cd "$(dirname "$0")/.." && pwd)
MAC_ONLY=0
if [[ "${1:-}" == --mac-only ]]; then MAC_ONLY=1; shift; fi
VERSION=${1:?usage: release.sh <버전> [--dry-run] [--signature-file <file>] [--output-dir <dir>]}
shift
DRY_RUN=0
SIGNATURE_FILE=
OUT="$U3_BUILD_CACHE/releases/$VERSION"
IDENTITY='Developer ID Application: BRIGHTON AI HOLDINGS PTY LTD (47RAD569PH)'
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --mac-only) MAC_ONLY=1; shift ;;
    --signature-file) SIGNATURE_FILE=${2:?서명 파일 경로가 필요합니다}; shift 2 ;;
    --output-dir) OUT=${2:?출력 경로가 필요합니다}; shift 2 ;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 1 ;;
  esac
done

# 경로와 버전은 파일을 쓰거나 외부 도구를 부르기 전에 검사한다.
python3 -I - "$VERSION" "$HERE" "$OUT" "$TMPDIR" "$CARGO_HOME" "$U3_BUILD_CACHE" "$HOMEBREW_CACHE" <<'PY'
import pathlib, re, sys
if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', sys.argv[1]):
    sys.exit('버전은 접두사 없는 정식 버전이어야 합니다. 예: 0.2.1')
volume = pathlib.Path('/Volumes/X31').resolve()
for value in sys.argv[2:]:
    if not pathlib.Path(value).resolve().is_relative_to(volume):
        sys.exit('레포·산출물·캐시·임시 경로는 X31 안에 있어야 합니다')
PY

write_metadata() {
  python3 -I - "$VERSION" "$SIGNATURE_FILE" "$OUT" "$1" "${COMMIT_SHA:-0000000000000000000000000000000000000000}" "$DRY_RUN" <<'PY'
import base64, datetime, hashlib, json, pathlib, re, sys
version, sigfile, out, mode, commit, dry_run = sys.argv[1:]
try:
    signature = pathlib.Path(sigfile).read_text().strip()
    lines = base64.b64decode(signature, validate=True).decode('utf-8').splitlines()
    if len(lines) != 4 or not lines[0].startswith('untrusted comment:') or not lines[2].startswith('trusted comment:'):
        raise ValueError('minisign 형식 오류')
    packet = base64.b64decode(lines[1], validate=True)
    if len(packet) != 74 or packet[:2] not in (b'Ed', b'ED') or len(base64.b64decode(lines[3], validate=True)) != 64:
        raise ValueError('minisign 서명 길이 오류')
    signed = re.search(r'\tversion:([^\t\r\n]+)', lines[2])
    if signed is None or signed[1] != version:
        raise ValueError('서명된 버전이 릴리스 버전과 다릅니다')
except (OSError, ValueError, UnicodeError) as error:
    sys.exit(f'업데이터 서명 파일을 확인하세요: {error}')
url = f'https://github.com/smpbrighton/u3/releases/download/v{version}/U3.app.tar.gz'
manifest = {
    'version': version,
    'notes': f'U3 {version}',
    'pub_date': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'platforms': {'darwin-aarch64': {'url': url, 'signature': signature}},
}
destination = pathlib.Path(out)
destination.mkdir(parents=True, exist_ok=True)
if mode == 'latest':
    (destination / 'latest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
else:
    names = ['U3.app.tar.gz', 'U3.app.tar.gz.sig', f'U3-{version}-arm64.dmg']
    assets = {name: hashlib.sha256((destination / name).read_bytes()).hexdigest() for name in names} if dry_run != '1' else {}
    fragment = {'version': version, 'commit': commit, 'platform': 'darwin-aarch64', 'asset': 'U3.app.tar.gz', 'signature': signature, 'assets': assets}
    if dry_run == '1': fragment['dryRun'] = True
    (destination / 'darwin.fragment.json').write_text(json.dumps(fragment, ensure_ascii=False, indent=2) + '\n')
PY
}

if [[ "$DRY_RUN" == 1 ]]; then
  SIGNATURE_FILE=${SIGNATURE_FILE:-$OUT/U3.app.tar.gz.sig}
  if [[ "$MAC_ONLY" == 1 ]]; then write_metadata latest; else write_metadata fragment; fi
  echo "✓ dry-run passed: $OUT"
  exit 0
fi

[[ -z "$SIGNATURE_FILE" ]] || { echo '--signature-file은 --dry-run에서만 사용합니다' >&2; exit 1; }
cd "$HERE"
export CARGO_TARGET_DIR="$HERE/src-tauri/target"
[[ $(git branch --show-current) == main ]] || { echo '실제 릴리스는 main에서 실행하세요' >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo '변경·미추적 파일을 먼저 정리하세요' >&2; exit 1; }
case $(git remote get-url origin) in
  https://github.com/smpbrighton/u3|https://github.com/smpbrighton/u3.git|git@github.com:smpbrighton/u3.git) ;;
  *) echo 'origin이 smpbrighton/u3가 아닙니다' >&2; exit 1 ;;
esac
git fetch origin main --tags
[[ $(git rev-parse HEAD) == $(git rev-parse origin/main) ]] || { echo 'main과 origin/main이 다릅니다' >&2; exit 1; }
if git show-ref --verify --quiet "refs/tags/v$VERSION"; then
  echo "이미 있는 태그입니다: v$VERSION" >&2; exit 1
fi
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'macOS Apple Silicon에서 실행하세요' >&2; exit 1; }
for tool in pnpm cargo codesign xcrun ditto tar hdiutil gh; do command -v "$tool" >/dev/null; done
[[ ! -e "$OUT/U3.app.tar.gz" && ! -e "$OUT/latest.json" ]] || { echo '기존 릴리스 산출물이 있습니다. 다른 --output-dir을 선택하세요' >&2; exit 1; }
mkdir -p "$TMPDIR" "$OUT"
STAGE=
trap 'if [[ -n "$STAGE" ]]; then rm -rf "$STAGE"; fi' EXIT
unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD TAURI_SIGNING_PRIVATE_KEY_PATH

python3 -I - "$VERSION" <<'PY'
import json, pathlib, re, sys
version = sys.argv[1]
package = pathlib.Path('package.json')
conf = pathlib.Path('src-tauri/tauri.conf.json')
cargo = pathlib.Path('src-tauri/Cargo.toml')
lock = pathlib.Path('src-tauri/Cargo.lock')
pj, tj = json.loads(package.read_text()), json.loads(conf.read_text())
ct, cl = cargo.read_text(), lock.read_text()
old = pj['version']
cargo_version = re.search(r'(?ms)^\[package\]\n[^\[]*?^version = "([^"]+)"', ct)
locked_version = re.search(r'\[\[package\]\]\nname = "u3"\nversion = "([^"]+)"', cl)
if cargo_version is None or locked_version is None or tj['version'] != old or cargo_version[1] != old or locked_version[1] != old:
    sys.exit('버전 파일이 서로 다릅니다')
if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', old) or tuple(map(int, version.split('.'))) <= tuple(map(int, old.split('.'))):
    sys.exit('현재 버전보다 새 정식 버전을 지정하세요')
ct, count = re.subn(r'(?m)^(version = ")' + re.escape(old) + r'("\s*)$', lambda m: m[1] + version + m[2], ct, count=1)
if count != 1: sys.exit('Cargo.toml의 버전을 찾지 못했습니다')
cl, count = re.subn(r'(\[\[package\]\]\nname = "u3"\nversion = ")' + re.escape(old) + r'(")', lambda m: m[1] + version + m[2], cl, count=1)
if count != 1: sys.exit('Cargo.lock의 버전을 찾지 못했습니다')
pj['version'] = tj['version'] = version
package.write_text(json.dumps(pj, ensure_ascii=False, indent=2) + '\n')
conf.write_text(json.dumps(tj, ensure_ascii=False, indent=2) + '\n')
cargo.write_text(ct)
lock.write_text(cl)
PY

git diff --check
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "release $VERSION"
COMMIT_SHA=$(git rev-parse HEAD)
git push origin main

if [[ ! -d node_modules ]]; then pnpm install --frozen-lockfile --store-dir /Volumes/X31/.cache/pnpm/store; fi
pnpm verify
# Tauri는 앱만 패키징한다. 중첩 파일을 모두 서명한 뒤 앱을 서명한다.
pnpm package --config src-tauri/tauri.release.conf.json --bundles app --no-sign
APP="$CARGO_TARGET_DIR/release/bundle/macos/U3.app"
[[ -d "$APP" ]] || { echo "앱을 찾지 못했습니다: $APP" >&2; exit 1; }
bash scripts/check-engine-key.sh "$APP"
python3 -I - "$APP/Contents/Info.plist" "$VERSION" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as f: info = plistlib.load(f)
if info['CFBundleShortVersionString'] != sys.argv[2]: sys.exit('빌드된 앱 버전이 다릅니다')
PY
bash scripts/check-macos-executables.sh "$APP"
bash scripts/sign-nested.sh "$APP" "$IDENTITY"

notarize() {
  local file=$1 log=$2
  xcrun notarytool submit "$file" --keychain-profile nova-notary --wait --output-format json > "$log"
  python3 -I - "$log" <<'PY'
import json, sys
with open(sys.argv[1]) as f: result = json.load(f)
if result.get('status') != 'Accepted': sys.exit('공증이 Accepted가 아닙니다. notarytool 로그를 확인하세요')
PY
}
ditto -c -k --keepParent "$APP" "$OUT/submit.zip"
notarize "$OUT/submit.zip" "$OUT/notary-app.json"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl -a -vv "$APP"
rm "$OUT/submit.zip"

TARBALL="$OUT/U3.app.tar.gz"
COPYFILE_DISABLE=1 tar --no-acls --no-fflags --no-xattrs -czf "$TARBALL" -C "$(dirname "$APP")" "$(basename "$APP")"
# 개인키·암호는 이 subshell의 변수와 signer의 환경 변수에만 둔다.
sign_archive() (
  set +x
  local key password
  key=$(security find-generic-password -a u3 -s u3-updater-private-key -w) || { echo 'Keychain의 업데이터 키를 읽지 못했습니다' >&2; exit 1; }
  password=$(security find-generic-password -a u3 -s u3-updater-key-password -w) || { unset key; echo 'Keychain의 업데이터 암호를 읽지 못했습니다' >&2; exit 1; }
  TAURI_SIGNING_PRIVATE_KEY="$key" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$password" pnpm --silent tauri signer sign --app-version "$VERSION" "$TARBALL" >/dev/null
  unset key password
)
sign_archive
SIGNATURE_FILE="$TARBALL.sig"
[[ -s "$SIGNATURE_FILE" ]] || { echo '업데이터 서명 파일이 없습니다' >&2; exit 1; }

STAGE=$(mktemp -d "$TMPDIR/u3-release-dmg.XXXXXX")
ditto "$APP" "$STAGE/U3.app"
ln -s /Applications "$STAGE/Applications"
DMG="$OUT/U3-$VERSION-arm64.dmg"
hdiutil create -volname U3 -srcfolder "$STAGE" -format UDZO -ov "$DMG"
codesign --sign "$IDENTITY" --timestamp "$DMG"
notarize "$DMG" "$OUT/notary-dmg.json"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl -a -t open --context context:primary-signature -v "$DMG"
if [[ "$MAC_ONLY" == 1 ]]; then
  write_metadata latest
  python3 -I - "$OUT" <<'PYMAC'
import hashlib, pathlib, sys
out = pathlib.Path(sys.argv[1])
files = sorted(path for path in out.iterdir() if path.name.endswith(('.dmg', '.tar.gz', '.sig')) or path.name == 'latest.json')
(out / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in files))
(out / 'release-notes.md').write_text('이 릴리스에는 Windows 설치본이 포함되지 않습니다.\n')
PYMAC
  git tag -a "v$VERSION" -m "U3 $VERSION"
  git push origin "v$VERSION"
  gh release create "v$VERSION" "$DMG" "$TARBALL" "$SIGNATURE_FILE" "$OUT/latest.json" "$OUT/SHA256SUMS.txt" --repo smpbrighton/u3 --verify-tag --title "U3 $VERSION" --generate-notes --notes-file "$OUT/release-notes.md" --latest
  echo "✓ release published: v$VERSION"
else
  write_metadata fragment
  python3 -I - "$HERE/scripts/release-notes-windows.md" "$OUT/release-notes.md" "$VERSION" <<'PYNOTES'
import pathlib, sys
pathlib.Path(sys.argv[2]).write_text(pathlib.Path(sys.argv[1]).read_text().replace('<version>', sys.argv[3]))
PYNOTES
  gh release create "v$VERSION" "$DMG" "$TARBALL" "$SIGNATURE_FILE" "$OUT/darwin.fragment.json" --repo smpbrighton/u3 --draft --target "$COMMIT_SHA" --title "U3 $VERSION" --notes-file "$OUT/release-notes.md"
  git tag -a "v$VERSION" -m "U3 $VERSION"
  git push origin "v$VERSION"
  echo "✓ release drafted: v$VERSION"
fi

# Plan: ffmpeg-dylib-paths (lite)
Track: lite.

plan mode 산출물. 승인 후 `architecture/changes/046-ffmpeg-dylib-paths/plan.md` 로 커밋한다. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## Context
배포본 U3 0.3.0 에서 영상을 넣으면 `ffprobe` 가 `Library not loaded: libavdevice.dylib … relative path not allowed in hardened program` 으로 죽는다. 원인: `@remotion/compositor-darwin-arm64` 의 `remotion`·`ffmpeg`·`ffprobe` 와 `libav*.dylib` 7개가 서로를 `libavdevice.dylib` 같은 **맨 이름**(경로 없음)으로 참조한다. Remotion 은 자기 호출에 `DYLD_LIBRARY_PATH` 를 넣어 피하지만, 앱 엔진(`src/engine/pipeline/ffmpeg.ts`)은 `FFPROBE_BIN` 으로 직접 실행하고, hardened runtime 은 `DYLD_*` 를 버린다. 0.2.2 배포본의 `ffprobe` 도 같은 상태라 043 회귀가 아니라 패키징의 오랜 결함이다(확인: `/Volumes/X31/.cache/u3/build/releases/0.2.2/U3.app.tar.gz` 의 ffprobe 가 `-version` 에서 같은 오류).

## 결정
- 사용자 지시 원문: 오류 캡처 이미지(ffprobe dyld 오류) 공유. "이 피씨에서 실행해" 뒤 발견.
- 고치는 방법: 설치 이름을 `@loader_path/<이름>` 으로 다시 쓴다(`install_name_tool`). entitlement `allow-dyld-environment-variables` 로 우회하지 않는다. 이유: 엔진이 직접 실행하는 경로에는 `DYLD_LIBRARY_PATH` 가 없고, 보안 entitlement 를 넓히지 않는다.
- 다시 쓰는 위치: `scripts/build-engine.ts` 가 리소스를 준비할 때(패키징·릴리스 공통 경로). 릴리스의 `sign-nested.sh` 는 그 뒤에 서명하므로 서명이 깨지지 않는다.
- 버전: 고친 뒤 0.3.1 로 릴리스한다.

## 대조
없음. 결정 0001(Tauri + Node sidecar)·0021(자동 업데이트)과 어긋나지 않는다. 진행 중인 다른 변경 없음.

## 바꿀 파일
- `scripts/fix-dylib-paths.sh` (new): `fix-dylib-paths.sh <dir>` — `<dir>` 안의 Mach-O 마다 `otool -L` 의 의존성 중 `/`·`@` 로 시작하지 않는 것을 `install_name_tool -change <이름> @loader_path/<이름>` 으로 바꾸고, dylib 은 `-id @loader_path/<이름>` 도 바꾼다. 끝에 `codesign --force -s - <file>` 로 ad-hoc 재서명한다(install_name_tool 이 서명을 깨고, Apple Silicon 은 서명 깨진 바이너리를 실행하지 않는다). `--check` 를 주면 바꾸지 않고 맨 이름이 남아 있으면 종료 코드 1.
- `scripts/build-engine.ts`: `node_modules` 를 `resources` 로 복사한 뒤 compositor 디렉터리에 `fix-dylib-paths.sh` 를 실행한다. `checkDylibs` 가 `/`·`@` 로 시작하지 않는 의존성을 실패로 본다(지금은 같은 디렉터리에 파일이 있으면 통과시킨다 — 이것이 결함을 숨겼다).
- `scripts/sign-nested.sh`: 서명 전에 `fix-dylib-paths.sh --check` 로 compositor 디렉터리를 검사한다(check-macos-executables 와 같은 자리).
- `tests/scripts/dylib-paths.test.ts` (new): (1) `node_modules/@remotion/compositor-darwin-arm64/libavutil.dylib`·`libavcodec.dylib` 를 임시 폴더에 복사 → `--check` 가 실패 → 스크립트 실행 → `otool -L` 에 맨 이름 0개, `@loader_path/` 참조, `otool -D` 가 `@loader_path/libavutil.dylib`, `codesign -v` 통과 → `--check` 통과. (2) `build-engine.ts` 소스가 `fix-dylib-paths.sh` 를 호출하고 `sign-nested.sh` 가 `--check` 를 codesign 앞에서 부른다(기존 macos-executables 테스트와 같은 방식).

## 순서
1. 실패 테스트 커밋: `tests/scripts/dylib-paths.test.ts` 를 쓰고 `pnpm exec vitest run tests/scripts/dylib-paths.test.ts` 로 실패(스크립트 없음)를 확인한다.
2. `scripts/fix-dylib-paths.sh` 작성 → 테스트 (1) 통과.
3. `build-engine.ts`·`sign-nested.sh` 수정 → 테스트 (2) 통과. `pnpm verify`.
4. `pnpm package` → `src-tauri/target/release/bundle/macos/U3.app/Contents/Resources/resources/node_modules/@remotion/compositor-darwin-arm64/ffprobe -version` 이 성공하고, 실제 영상(`~/Library/Application Support/U3/projects/*/input/*.MOV` 중 하나)으로 `-show_format` 이 JSON 을 낸다.
5. 커밋, `worktree.sh finish ffmpeg-dylib-paths`, wiki ingest, push.
6. `scripts/release.sh 0.3.1` → 설치(`~/Applications/U3.app`) → 앱에서 새 영상에 영상 넣기까지 확인(사용자 또는 감독자).

## 리스크
- 가장 위험한 단계는 4(패키징 뒤 실행 확인)다. `install_name_tool` 이 헤더 여유 공간 부족으로 실패할 수 있다(`@loader_path/` 가 맨 이름보다 길다). 그러면 스크립트가 종료 코드로 알리고, 대안은 `-headerpad` 없이 못 고치므로 entitlement 우회로 바꿔 plan 을 고친다.
- Remotion 자체 호출(`DYLD_LIBRARY_PATH`)은 `@loader_path` 와 공존한다. 렌더(smoke)로 확인한다.
- 택하지 않은 대안: (1) `allow-dyld-environment-variables` entitlement + 엔진이 `DYLD_LIBRARY_PATH` 설정 — 엔진 코드와 보안 범위가 함께 넓어진다. (2) 설치 뒤 앱에서 고치기 — 서명이 깨진다.

## 증명
1. 1단계 실패 출력과 2·3단계 통과 출력.
2. `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
3. 패키징한 앱의 `ffprobe -version` 과 실제 영상 `-show_format` 출력(명령·종료 코드 기록).
4. 릴리스 `✓ release published: v0.3.1`, 설치본 버전 0.3.1, 앱에서 영상 넣기 성공(사용자 확인이면 그렇다고 적는다).

## 롤백
- 데이터·API 변경 없음. 커밋 단위로 되돌린다. 0.3.0 은 영상 넣기가 안 되므로 되돌릴 이유가 없다.

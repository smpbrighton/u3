# Plan: windows-build (from spec.md)

구현은 codex 워커, diff 대조는 세션. 워크트리는 0.3.1(`2cb7f1f`)에서 갈라졌으므로 구현 전에 main 을 rebase 한다. 병합 순서: 048 → 047 → 049(049 가 마지막이라 Windows ffmpeg `atempo` 시험을 049 plan 에 둔다).

## 검토 목록
1. **열린 질문(사용자 소유)**: ① 짤·효과음·색인·MRX 재배포 권리 확인자 — 추천: 사용자가 확인하고 확인 전에는 archive 를 올리지 않는다(묶음 E 가 막힌다). ② Windows 11 실기기/VM 제공 — 추천: 사용자 PC 또는 Parallels VM, 없으면 증명 6 을 미검증으로 남긴다. ③ Azure Artifact Signing 도입 시점 — 추천: 이번 변경 밖, Windows 사용자 수 확인 뒤.
2. **릴리스 절차가 바뀐다**(critic I2): `release.sh` 가 draft 까지만 하고 Actions publish job 이 공개한다. 긴급 Mac 수정은 `--mac-only`. 추천: 채택. 이유: 한 버전에 두 플랫폼을 같은 `latest.json` 으로 묶는 유일한 방법. 근거 `spec.md` 요구사항 7·「빌드와 CI」.
3. **Windows 데이터 폴더 `%LOCALAPPDATA%\ai.brightongroup.u3`**(critic n1). 추천: 채택. 제거 프로그램의 「앱 데이터 삭제」 체크박스를 켜면 프로젝트가 지워진다(기본 해제).
4. **리소스 archive 는 prerelease Release `resources-<n>`**(critic n2). 추천: 채택.
5. **Windows 에서 TTS 를 숨긴다**(intent 승인됨, 재확인 아님) — 구현은 `capabilities.tts=false` 로 LibraryPanel 버튼·Inspector 「다시 만들기」·Settings 「음성」 구역 전체·모델 받기를 숨긴다. Settings nav 에서 「음성」 항목 자체를 뺀다. 추천: 구역 제거. 이유: 빈 구역을 남기면 설명문이 필요해진다.
6. **결정 파일**: 0032 `windows-build`(0025 대체: OS 범위·실제 배치), 0033 `release-flow`(0021 보완: draft→publish, `--mac-only`, Windows 키 secret). 0025 를 `superseded-by 0032`, INTENT.md 앱 구조 줄 교체, 0021 줄에 0033 덧붙임. 0004·0007·0008·0023·0024·0026 은 본문 수정 없이 0032 가 보완 사항을 적는다.
7. **계획 밖 발견**: media URL 의 `encodeRelPath` 가 `path.sep` 만 나눠 Windows 에서 `/` 가 `%2F` 가 된다(`media-server.ts:10,59`). 이 변경에서 고친다(묶음 A). `carousel-store.ts:31` 의 중복 기본 경로도 Store 로 통일한다.

## Context
사용자는 Windows 11 x64 에도 U3 를 배포하고 싶다. 코드는 Mac 전제가 흩어져 있다: `build-engine.ts` 의 darwin archive·compositor·otool, `package.sh`/`release.sh` 의 Swift TTS·공증·X31, `main.rs` 의 `node`·`compositor-darwin-arm64/ffmpeg`·`tauri://localhost`, 엔진의 `/usr/bin/security`·zsh codex 탐색·`SIGTERM` 종료·`~/Library/Application Support/U3`, 모든 spawn 에 `windowsHide` 없음, UI 에 TTS capability 판단 없음, `.github/` 없음. 패키징은 Mac 로컬(`pnpm package`), Windows 는 GitHub Actions `windows-latest` 에서만 한다.

## 묶음과 바꿀 파일
**A. 엔진 이식성(Mac 에서 단위 시험 가능)**
- `src/engine/platform.ts` (new): `enginePlatform()`(`darwin`|`win32`), `exe(name)`(win32 면 `.exe`), `defaultDataDir()`(darwin: 기존, win32: `%LOCALAPPDATA%\ai.brightongroup.u3`), `capabilities()`(`{ tts: platform==="darwin" }`), `defaultOrigin()`(darwin `tauri://localhost`, win32 `http://tauri.localhost`).
- `src/engine/store.ts:38`·`carousel-store.ts:31`: `defaultDataDir()`.
- `src/engine/main.ts:65`: whisper 기본 경로 `exe("whisper-cli")`. `tauriOrigin` 기본값 `defaultOrigin()`.
- `src/engine/routes/system.ts`: `GET /api/system` 에 `platform`·`capabilities`.
- `src/engine/routes/tts.ts`·`routes/models.ts`: `capabilities().tts` 가 false 면 `POST …/tts`·`download qwen-tts` 를 `HttpError(400, "unsupported-platform")`. job 시작·다운로드 전에.
- `src/engine/pipeline/media-server.ts:10,59`: `encodeRelPath`/`mediaUrl` 이 `/`·`\` 둘 다로 나누고 `/` 로 합침. `resolveUnder` 에 드라이브·UNC·대소문자 검사(`path.win32` 경로를 소문자 비교, `..` 세그먼트 거부).
- spawn 전부(`jev-key.ts:36`, `whisper.ts:14`, `tts.ts:25`, `codex.ts:102`, `codex-image.ts:154`, `ffmpeg.ts:13`, `system.ts:37`, `codex-path.ts:20`): `windowsHide: true`. 공통 옵션 상수 `src/engine/spawn-options.ts`.
- `src/engine/pipeline/codex-path.ts`: win32 면 shell 없이 `where.exe codex` 결과와 `%APPDATA%\npm\codex.cmd`·`%LOCALAPPDATA%\Programs\codex\codex.exe` 후보. `.cmd` 면 그 파일을 읽어 가리키는 `node_modules/@openai/codex/bin/codex.js` 를 찾고, 실행은 `node codex.js …`(엔진의 `process.execPath`). 찾지 못하면 기존 `codexPath` 설정 안내. darwin 분기는 그대로.
- `src/engine/shutdown.ts:43`: win32 면 `process.exit(0)`.
- `src/engine/jev-key.ts`: `createJevKeyStore` 를 darwin 전용으로 두고, `src/engine/jev-key-win.ts` (new) `createDpapiKeyStore({ helperPath, filePath })` — `spawn(helper, ["read"|"write"|"delete", filePath], { windowsHide })`, 키는 stdin, 결과 stdout. `main.ts` 가 플랫폼으로 고른다. `system.ts:200,206` 오류 문구에서 「Keychain」을 「보안 저장소」로.
- 테스트: `tests/engine/platform.test.ts` (new: exe·dataDir·origin·capabilities 를 `process.platform` stub 으로), `tests/engine/media-server.test.ts`(`/`·`\`·드라이브·UNC·`..` 거절), `tests/server/system.test.ts`(platform 필드), `tests/server/tts.test.ts`(win32 stub 에서 400 unsupported-platform, 파일·job 없음), `tests/server/jev-key-win.test.ts` (new: 가짜 helper 스크립트로 read/write/delete·stdin 전달·로그 미노출), `tests/engine/codex-path.test.ts`(win32 후보·`.cmd` 해석), `tests/engine/spawn-options.test.ts`(모든 spawn 호출이 공통 옵션을 쓰는지 소스 grep).

**B. UI capability**
- `src/ui/types.ts`: `SystemStatus` 에 `platform`·`capabilities`. `App.tsx:137`: Studio 에 `capabilities` 전달. Studio → LibraryPanel(:374 버튼)·Inspector(:239 다시 만들기)·Timeline(TTS 진행) 에 전달해 `tts===false` 면 렌더하지 않음. 응답 전(`status===null`)에도 숨김.
- `Settings.tsx:40,331`: `SECTIONS` 에서 `voice` 를 `capabilities.tts` 일 때만 포함(Settings 가 `/api/system` 을 이미 읽는다). `download("qwen-tts")` 경로도 숨김. `ModelStatus.qwenTts` 는 그대로.
- 테스트: `tests/ui/settings-layout.test.tsx`(tts false 면 「음성」 없음), `tests/ui/library-panel*.test.tsx`·`studio-inspector.test.tsx`(버튼 없음), `tests/ui/app-capabilities.test.tsx` (new, 소스 문자열 또는 static 렌더).

**C. 빌드 스크립트(플랫폼 descriptor)**
- `scripts/build-engine.ts`: `platforms` 표(darwin-arm64·win32-x64: nodeArchive(zip/tar.gz)·nodeBinary 경로·compositor 패키지·onnx 디렉터리·chrome 폴더 규칙). 지원 밖이면 `fail`. `installNodeRuntime`: zip 은 Node `zlib`+직접 해제 대신 시스템 `tar -xf`(Windows bsdtar 가 zip 지원). `installProductionDependencies`: `execFileSync(process.execPath, [npmCliJs, "install", …])` 로 `.cmd` 회피. Mac 분기(`fix-dylib-paths`·`checkDylibs`)는 `if (platform==="darwin")` 안에 두되 **문자열 `"fix-dylib-paths.sh"`·`checkDylibs(join(compositorDir` 순서 유지**(dylib-paths.test.ts). win32 분기: compositor 디렉터리 전체 복사, onnx `win32/x64` 의 `.node`·`.dll` 복사, Chrome 폴더 복사, `chrome-path.txt` 에 실행 파일 이름(기존 방식 유지). 새 `checkWindowsDeps`: `node.exe -e "require('onnxruntime-node')"`, `ffprobe.exe -version`.
- `scripts/fetch-resources.ts`: `U3_RESOURCE_ROOT`(archive 를 푼 폴더) 가 있으면 그 안의 `library/`·`meme-embed/`·`models/`·`licenses/` 를 쓰고 X31 경로·Swift 고지는 darwin 이면서 `U3_RESOURCE_ROOT` 가 없을 때만. `manifest.json`(파일 sha256 목록) 검사. 폰트는 항상 레포 `assets/fonts`.
- `scripts/make-resource-archive.ts` (new, Mac 에서 실행): X31 리소스로 `u3-resources-<n>.tar.gz` + `manifest.json` + sha256 출력. 업로드는 사람(`gh release create resources-<n> --prerelease`).
- `scripts/build-whisper.sh`: `uname` 분기. Windows(Git Bash): `cmake -G "Visual Studio 17 2022" -A x64 -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_NATIVE=OFF`, 산출물 `Release/whisper-cli.exe` → `resources/bin/whisper-cli.exe`·`binaries/whisper-cli-x86_64-pc-windows-msvc.exe`. tar.gz 에 sha256 검사 추가(현재 없음).
- `scripts/package.sh`: darwin 이면 지금 흐름, win32(Git Bash `MSYS*`/`MINGW*`)면 `build-tts.sh` 생략·`tauri build` 의 config 를 `tauri.windows.conf.json`(자동 병합)로. `check-engine-key.sh` 는 두 플랫폼 공통.
- `scripts/verify.sh`: darwin 전용 테스트(`dylib-paths`·`macos-executables`·`release`)는 `vitest` 의 `describe.skipIf(process.platform!=="darwin")` 로 바꾸고 출력에 「Windows native 시험 미실행」 표시. win32 에서는 `U3_WINDOWS_NATIVE=1` 일 때만 `tests/windows/*.test.ts` 실행.
- 테스트: `tests/scripts/build-engine-platforms.test.ts` (new: descriptor 표 단위 시험, npm cli 경로 결정), `tests/scripts/fetch-resources.test.ts`(archive root·manifest 검사).

**D. Tauri·Rust**
- `src-tauri/tauri.windows.conf.json` (new): `bundle.targets ["nsis"]`, `bundle.windows.nsis { installMode: "currentUser", languages: ["Korean","English"] }`, `webviewInstallMode { type: "downloadBootstrapper" }`, icon 에 `icons/icon.ico`, `externalBin ["binaries/whisper-cli"]`, `plugins.updater.pubkey` Windows 키, `createUpdaterArtifacts: true`.
- `src-tauri/src/main.rs`: `bundled_engine_command` 가 `platform.rs` (new) 의 상수로 `node.exe`·`compositor-win32-x64-msvc/ffmpeg.exe`·origin 을 고름. `#[cfg(windows)] cmd.creation_flags(CREATE_NO_WINDOW)`. `#[cfg(windows)] job.rs` (new): `windows` crate 의 `CreateJobObjectW`·`SetInformationJobObject(KILL_ON_JOB_CLOSE)`·`AssignProcessToJobObject`; 핸들을 앱 상태에 보관. `RunEvent::Exit` 에서 win32 는 stdin drop → 5초 대기 → Job 핸들 닫기. 테스트 `packaged_engine_runs_node…` 를 플랫폼별 기대값으로.
- `src-tauri/src/updater.rs`: 캐시 이름 `U3-{version}-setup.exe`(win) / `.app.tar.gz`(mac). Windows `install` 은 Tauri 가 앱을 끝내므로 `update_restart` 와 `install_on_exit` 모두 `before_exit` 에서 엔진 종료를 먼저 끝낸 뒤 `install`. 「다시 시작」·「앱 종료」 인자는 Tauri `tauri-plugin-updater` 소스의 NSIS 인자(`/P`·`/R` 등)를 읽어 정하고 plan 실행 기록에 적는다.
- `native/u3-key-store/` (new, Rust bin crate, Windows 전용): `read|write|delete <file>`, `CryptProtectData`/`CryptUnprotectData`(`windows` crate `Win32_Security_Cryptography`), 키는 stdin, 출력 stdout, 임시 파일→rename, 로그 없음. Cargo workspace 에 넣고 `build-engine.ts` win32 분기가 `cargo build --release` 뒤 `resources/bin/u3-key-store.exe` 로 복사. `cargo test` 는 Windows CI 에서.
- `src-tauri/Cargo.toml`: `[target.'cfg(windows)'.dependencies] windows = { features: ["Win32_System_JobObjects","Win32_System_Threading"] }`.

**E. CI·릴리스·문서**
- `.github/workflows/windows-build.yml` (new): `on: pull_request`(verify+package, secret 없음), `on: push: tags: v*` 와 `workflow_dispatch: inputs.tag`(패키징 → `check-engine-key` → NSIS 설치·엔진 시작·저장·제거 시험 → `tauri signer sign`(environment `release` 의 `TAURI_SIGNING_PRIVATE_KEY`·`_PASSWORD`) → draft Release 에 `U3-<v>-windows-x64-setup.exe`·`.sig`·`windows.fragment.json` 업로드) → `publish` job(두 fragment 확인·`latest.json`·`SHA256SUMS.txt`·`gh release edit --draft=false --latest`). env: `TMP/TEMP/CARGO_HOME/CARGO_TARGET_DIR/U3_BUILD_CACHE/npm_config_cache` 를 `RUNNER_TEMP` 아래. `timeout-minutes: 60`. 리소스는 `gh release download resources-<n>` → `U3_RESOURCE_ROOT`. 캐시 키 OS·lockfile·whisper 버전.
- `scripts/release.sh`: 순서 재배치(버전 커밋 push → 빌드·서명·공증 → `gh release create --draft --target <sha>` + Mac 자산 + `darwin.fragment.json` → 태그 push). `--mac-only` 는 지금 흐름(`--latest`). 정상 출력 `✓ release drafted: v<v>` / `✓ release published: v<v>`. `write_latest` 를 fragment 작성으로 분리. `tests/scripts/release.test.ts` 갱신(dry-run 이 fragment 와 `--mac-only` latest 둘 다).
- `scripts/publish-release.ts` (new, publish job 이 실행): fragment 병합·검증·latest.json.
- `AGENTS.md` 커맨드 절: 릴리스 두 줄(기본·`--mac-only`)과 정상 출력. `docs/install-windows.md` (new): spec 의 안내 문구 원문 + SHA-256 확인. 릴리스 노트 템플릿 `scripts/release-notes-windows.md` (new) 를 `gh release edit --notes-file` 로 붙임.
- 결정 0032·0033, INTENT.md, 0025 superseded.

**F. Windows 실측(사람·CI)**
- `tests/windows/*.test.ts` (new, `U3_WINDOWS_NATIVE=1`): 엔진 부팅 PORT, ffprobe, ONNX 추론, Chrome PNG, whisper fixture, DPAPI helper 왕복, TTS 거절, Origin·토큰·traversal 거절, 종료 뒤 프로세스·잠금 없음.
- 실기기 체크리스트 `architecture/changes/049-windows-build/checklist.md` (new): spec 검증 기준 6–9 항목을 표로, 결과·기기·날짜 기록.

## 순서
1. rebase main(047·048 병합 뒤), install. 장부 `depends_on playback-speed,shortcut-settings`.
2. 묶음 A(테스트 먼저) → 커밋들. 3. 묶음 B → 커밋. 4. 묶음 C → Mac 에서 `pnpm package` 가 여전히 통과 → 커밋. 5. 묶음 D(Mac 에서 `cargo check --target x86_64-pc-windows-msvc` 는 안 되므로 cfg 분기만 컴파일 확인) → 커밋. 6. 묶음 E → 커밋. 7. 결정·INTENT·AGENTS → `pnpm verify` → 커밋.
8. 브랜치를 origin 에 push 하고 PR 을 열어 Windows CI(PR job)를 돌린다. 실패는 워커가 고쳐 다시 push. 통과 전에는 병합하지 않는다.
9. 사용자: 리소스 권리 확인 → `make-resource-archive.ts` → `resources-1` prerelease 업로드. GitHub `release` environment 에 Windows updater 키 등록(`tauri signer generate` 로 만든 키, 공개키를 `tauri.windows.conf.json` 에).
10. finish(ff 병합) → wiki ingest → `release.sh 0.4.0` → 태그 push 로 Windows job → publish → 실기기 체크리스트(F).

## 리스크
- 가장 위험한 단계는 8 이다. Windows native 조립(ONNX DLL·Chrome·whisper MSVC·NSIS)은 CI 에서만 확인되고 반복 주기가 길다. 방어: 묶음 C 의 descriptor 단위 시험과 PR job 분리. 택하지 않은 대안: Mac 에서 cargo-xwin cross-build — Node·ONNX·Chrome 조립과 실행 검증이 안 된다(spec).
- Windows codex 의 `.cmd` 해석은 실기기 전까지 추정이다(F 에서 확인).
- Job Object·DPAPI·`creation_flags` 는 Mac 에서 컴파일되지 않는 cfg 분기라 CI 가 첫 컴파일이다.
- `release.sh` 재배치는 Mac 릴리스 경로를 건드린다. dry-run 테스트와 `--mac-only` 로 기존 경로를 남긴다.
- 9 의 권리 확인이 늦으면 10 이 막힌다. 그동안 CI PR job 은 archive 없이 돌 수 있게 `U3_RESOURCE_ROOT` 없을 때 빈 라이브러리로 **verify 만** 하고 package 는 실패로 둔다(spec: 빈 라이브러리 배포 금지).

## 증명
1. Mac: 각 묶음 테스트 실패→통과, `✓ verify passed`, `pnpm package` 가 Mac 앱을 그대로 만든다(dylib 검사 통과).
2. CI PR job 녹색(로그 URL·commit SHA 기록). 태그 job: 설치·시작·저장·제거 시험 로그, 자산 SHA-256.
3. publish job 이 만든 `latest.json` 에 두 플랫폼 항목, 기존 Mac 설치본이 그 manifest 로 업데이트됨.
4. Windows 11 실기기 체크리스트(F): SmartScreen 절차, 한글 경로, 마이크, 테마, 폰트, codex 두 모드, STT·분리·MP4·캐러셀, 두 버전 업데이트, 프로세스 잠금. 미실행 항목은 그대로 적는다.
5. 0.3.x Mac 설치본의 자동 업데이트가 `--mac-only` 없는 통합 Release 에서도 동작.

## 롤백
병합 커밋 되돌리기. `release.sh --mac-only` 가 이전 공개 절차와 같아 Mac 배포는 영향 없음. 올린 draft Release 는 삭제, prerelease `resources-<n>` 은 유지해도 `latest` 에 영향 없음. Windows 설치본은 제거 프로그램으로.


## 구현 실행 기록
- 사용자 지시에 따라 047·048 병합을 기다리지 않고 현재 main(0.3.2, 050·051 포함)에 rebase했다. 충돌은 없었다. `CI=true pnpm install --frozen-lockfile`이 통과했다.
- A: `test-A-fail.log`에서 7개 파일 실패를 확인했다. Windows TTS가 202였고 system에 platform/capabilities가 없었다. 테스트 커밋 뒤 구현했다. 기존 Keychain 인자 순서(050)를 유지했다. `test-A-pass.log`: 9개 파일·44개 테스트 통과. TypeScript 검사 통과.
- B: `test-B-fail.log`에서 capability가 false/미응답이어도 TTS 화면이 표시되는 실패 5개를 확인했다. 테스트 커밋 뒤 구현했다. `test-B-pass.log`: 3개 파일·21개 테스트 통과.
- C: descriptor의 순수 조회를 `scripts/build-platforms.ts`로 분리했다. `build-engine.ts`를 import할 때 빌드가 실행되는 기존 구조와 단위 테스트를 분리하기 위한 보조 파일이다. `test-C-fail.log`: descriptor 모듈·manifest 검사가 없어 실패했다. 테스트 커밋 뒤 구현했다. `test-C-pass.log`: 6개 파일·39개 테스트 통과.
- C의 Windows 검증 분리는 native 계약만 대상으로 한다. dylib·Mach-O·Mac 릴리스와 TTS helper·Keychain helper·POSIX shell fixture·SIGTERM 종료 시험은 Mac에서 유지한다. Windows에서는 F의 실제 helper·종료·TTS 거절 시험으로 검사한다. 공통 API·편집·인증 시험은 유지한다. 기존 테스트 단언은 변경하지 않았다.
- Whisper v1.9.5 archive SHA-256은 기존 캐시 파일에서 확인한 `ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720`이다. ggml CMake 소스에서 Windows CPU 옵션을 확인했다.
- 확인 근거: `node_modules/@tauri-apps/cli`의 `tauri build --help`는 플랫폼 config 자동 병합 후 명시 config 순서대로 덮어쓴다고 설명한다. `tauri-utils-2.10.1/src/config/parse.rs`도 플랫폼 JSON을 merge한다. Windows package에는 Mac bundle config를 전달하지 않는다.
- 확인 근거: CARGO_HOME registry의 `tauri-plugin-updater-2.14.0/src/{config,updater}.rs`에서 passive는 `/P`, updater는 `/UPDATE`, 재실행은 `/R`이며 `restart_after_install(false)`가 `/R`을 생략함을 확인했다. `on_before_exit`는 installer 실행 전 호출되고 install 성공 뒤 `std::process::exit(0)`한다. `Update::restart_after_install`을 사용할 수 있다. 2.14.0은 현재 target이 없는 manifest를 업데이트 없음으로 처리한다.
- 확인 근거: `windows-0.62.2/src/Windows/Win32`의 JobObjects·Threading·Security·Cryptography·Authorization·FileSystem·Foundation 소스에서 API 인자와 반환형을 읽었다. Windows cfg 코드는 Mac에서 컴파일하지 못하므로 Windows 컴파일·실행은 미검증이다.
- 사용자 지시의 순서 8·9·10은 수행하지 않는다. push·PR·CI 실행·리소스 업로드·키 생성/등록·배포·병합·wiki ingest는 감독자에게 남긴다.
- C: Mac `pnpm package` 종료 코드 0. `package-mac.log`에 앱 1.12 GiB·DMG 542.52 MiB 생성과 최종 `✓ engine key check passed`를 기록했다. SwiftPM 공유 캐시 대기를 거쳤다. 이 package는 ad-hoc 빌드이며 릴리스 서명·공증을 수행하지 않았다. npm staging 캐시 경로도 이후 실행부터 U3_BUILD_CACHE/npm으로 고정했다.
- D: `test-D-fail.log`의 설정·Job·DPAPI 누락 3개와 `test-D-rust-fail.log`의 cache_name E0425 실패를 커밋한 뒤 구현했다. `test-D-check.log`: Mac cargo check 통과. `test-D-rust-pass.log`: 11개 테스트 통과. `test-D-pass.log`: 3개 설정 테스트 통과. 기존 bundled_engine 테스트는 plan대로 플랫폼별 경로 기대값으로 바꿨다. 새 updater cache 테스트는 변경하지 않았다.
- D: spec 요구사항 1을 충족하는 보조 파일 `windows-hooks.nsh`·`install-vc-runtime.ps1`을 추가했다. 설치 시 Microsoft VC++ 14.44.35211의 고정 URL·SHA-256·Microsoft Authenticode 서명을 검사하고 부족한 runtime을 설치한다. redist 실행 파일은 레포·archive에 넣지 않는다. Microsoft 공식 문서에서 다운로드·Get-AuthenticodeSignature·Start-Process 인자를 확인했다. 내려받은 고정 파일 SHA-256은 cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b이다. NSIS hook·PowerShell·UAC의 실제 Windows 동작은 미검증이며 성공 여부는 추정이다.
- D: 설치·제거·/UPDATE·/R·hook 호출 위치는 현재 CLI 2.12.4가 요구하는 `tauri-bundler-2.10.4/src/bundle/windows/nsis/installer.nsi`에서 확인했다. Windows 공개키는 비워 두었다. 사용자 소유 단계 9에서 키를 등록하고 릴리스 job이 공개키를 config에 주입해야 한다. Mac 공개키를 Windows에 재사용하지 않는다.
- E: `test-E-fail.log`의 기본 dry-run latest 생성·--mac-only 미지원·publish 모듈 누락 실패를 커밋한 뒤 구현했다. `test-E-pass.log`: 19개 테스트 통과. 기본 fragment와 --mac-only latest를 함께 시험했다. 버전·commit·누락 플랫폼·변조 hash·서명 버전·dry-run fragment를 거절한다. shell syntax와 workflow YAML 파싱을 확인했다. GitHub CLI의 release create/view/upload/edit와 Tauri signer sign 옵션은 로컬 --help·CLI 소스로 확인했다.
- E: Windows runner 공통 조립·검증·패키징은 `scripts/windows-build.ps1`로 묶었다. PR에 리소스가 없으면 공통 verify만 하고 native/package 미실행을 summary에 남긴다. tag 릴리스에는 archive와 Windows 공개키를 요구한다. 공개된 Release의 태그 재실행은 자산을 변경하지 않는다. private key는 release 환경의 signer step에만 제공한다.
- E: 결정 0032·0033은 지정 템플릿 구조로 쓰고 Status를 draft로 남겼다. 0025의 상태와 INTENT·AGENTS 릴리스 설명을 plan대로 갱신했다. 등록된 키·리소스·Windows runner·실기기 증거는 아직 없다.

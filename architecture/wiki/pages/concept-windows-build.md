# Windows 빌드와 검증

## 요약
Windows x64 빌드는 플랫폼별 Node·compositor·ONNX 리소스와 NSIS 설치 구성을 사용한다. Windows 11 실기기 검증은 별도 체크리스트에 남아 있다. `scripts/build-platforms.ts` `src-tauri/tauri.windows.conf.json` `architecture/changes/049-windows-build/checklist.md` `git:c271e86:`

## 내용
- 빌드 descriptor는 macOS arm64와 Windows x64의 Node archive·compositor·ONNX 경로를 선택한다. Whisper Windows 빌드는 CPU용 MSVC 구성을 사용한다. `scripts/build-platforms.ts` `scripts/build-whisper.sh` `git:e8b8396:`
- Windows NSIS 설치는 WebView2와 VC++ runtime 설치 경로를 포함한다. 설치 안내는 서명 없는 설치 파일의 SmartScreen 및 정책 차단을 설명한다. CI 설치 smoke는 통과했지만 Windows 11 실기기의 UAC·WebView2 동작은 미검증이다. `src-tauri/tauri.windows.conf.json` `src-tauri/windows-hooks.nsh` `scripts/install-vc-runtime.ps1` `docs/install-windows.md` `architecture/changes/049-windows-build/plan.md` `git:ec2dbac:`
- 음성 업로드는 상대 데이터 경로에서도 ffprobe가 파일을 찾도록 목적지를 절대 경로로 만든다. 회귀 테스트가 있다. `src/engine/routes/voice.ts` `tests/engine/voice.test.ts` `architecture/changes/049-windows-build/ci-verification.md` `git:0c27762:`
- Mac 실행 기록에서 `pnpm verify`는 Vitest 156개 파일·794개 테스트, Rust 11개 테스트 및 렌더 smoke를 통과했다. Windows native 9개와 기존 선택 모델 2개는 건너뛰었다. `architecture/changes/049-windows-build/verify.log` `architecture/changes/049-windows-build/test-F-mac.log` `architecture/changes/049-windows-build/plan.md` `git:6c454aa:`
- Mac 패키징 기록은 ad-hoc 서명된 앱과 DMG 생성 및 engine key 검사를 보여 준다. 공증은 건너뛰었다. `architecture/changes/049-windows-build/package-mac.log` `git:c271e86:`
- Windows CI run 40687438017에서는 엔진 조립과 Whisper MSVC 빌드가 통과했고 Vitest 9개 파일이 실패했다. 후속 수정의 Mac 대상 테스트 37개와 `pnpm verify`는 통과했다. 후속 Windows CI 결과는 아래 사용자 제공 실행 사실을 참고한다. `architecture/changes/049-windows-build/ci-verification.md` `git:0c27762:`
- smoke는 Windows 번들의 ffmpeg 제약에 맞춰 PCM peak와 image2pipe·입력 seek를 사용하고 디졸브 혼합 비율을 검사한다. 후속 Windows CI의 설치 smoke는 통과했다는 사용자 제공 사실이 있다. `scripts/smoke.ts` `architecture/changes/049-windows-build/ci-verification.md` `git:9860d70:`
- Windows 11 실기기의 설치·제거, SmartScreen·보안 정책, 한글 경로, 마이크·폰트·테마, Codex·편집·캐러셀·STT·음성 분리, TTS 제한, DPAPI·보안 경계·프로세스 정리 및 업데이트는 미실행이다. checklist의 세부 미실행 항목을 유지한다. `architecture/changes/049-windows-build/checklist.md` `git:6c454aa:`
- CI 설치 smoke는 Tauri 창·마이크·기본 Known Folder·SmartScreen·업데이트를 검증하지 않는다. 리소스 archive는 prerelease `resources-1`에 올라갔고 Actions 변수 `U3_RESOURCE_VERSION=1`과 `U3_RESOURCE_SHA256`이 등록되었다. `GitHub Release resources-1` Windows updater 키 생성·등록은 사용자 소유 단계다. `scripts/windows-install-smoke.ps1` `architecture/changes/049-windows-build/checklist.md` `architecture/changes/049-windows-build/plan.md`
- Windows workflow의 `inspect`는 draft Release 조회를 위해 `contents: write`를 받는다. 회귀 테스트는 `inspect`, `windows-release`, `publish` 세 job의 쓰기 권한 선언을 검사한다. 테스트 실행 결과는 코드에서 못 찾음. `.github/workflows/windows-build.yml` `tests/scripts/windows-workflow.test.ts` `git:4798e89:` `git:ace19d2:`
- 사용자 제공 실행 사실에 따르면 `v0.3.8` 태그 push로 시작한 Windows build run [40813927617](https://github.com/smpbrighton/u3/actions/runs/40813927617)의 `inspect`는 `contents: read` 토큰으로 draft Release를 찾지 못해 `release not found`로 실패했다. 권한 수정 후 이 버전의 Windows workflow 성공 증거는 코드에서 못 찾음. `.github/workflows/windows-build.yml` `git:ace19d2:`
- Windows Node zip과 리소스 archive는 System32 `tar.exe`로 검사·압축 해제한다. Node와 리소스 archive는 각각 SHA-256을 확인하고 리소스 archive는 경로도 검사한다. `scripts/build-platforms.ts` `scripts/build-engine.ts` `scripts/windows-build.ps1` `git:279f4f8:`
- Windows Whisper는 호스트 CPU 탐지를 끄고 AVX·AVX2·FMA·F16C 커널을 켠다. 이전 CI run 40818736706에서는 모델 다운로드와 VAD가 완료됐지만 추론이 390초 안에 끝나지 않았다. `scripts/build-whisper.sh` `architecture/changes/049-windows-build/ci-verification.md` `git:6e5bd03:`
- 사용자 제공 실행 사실에 따르면 PR #2의 [Windows CI run 40821431526](https://github.com/smpbrighton/u3/actions/runs/40821431526)은 리소스를 포함한 NSIS 패키징, native 시험 9개, `pnpm verify`, 설치 smoke를 통과했다. CI 실행 원문은 코드에서 못 찾음. 이 실행 뒤 `bdec109`는 Mac `pnpm verify`만 통과했으며 Windows 재검증은 확인되지 않았다. `architecture/changes/049-windows-build/ci-verification.md` `tests/windows/native.test.ts` `git:bdec109:`
- Windows 11 실기기와 Release 공개는 미검증이다. 기존 checklist의 개별 미실행·blocked 항목은 유지한다. `architecture/changes/049-windows-build/checklist.md` `architecture/changes/049-windows-build/plan.md` `git:6e5bd03:`
- 결정 링크: [Windows 빌드](../../decisions/0032-windows-build.md), [릴리스 흐름](../../decisions/0033-release-flow.md). `git:e3a80f4:`

- 사용자 제공 사실에 따르면 `v1.0.0` 태그 [run 40825453652](https://github.com/smpbrighton/u3/actions/runs/40825453652)의 `windows-release`는 패키징·native·설치 검증·updater 서명·draft 업로드를 통과했다. CI 실행 원문은 코드에서 못 찾음. `.github/workflows/windows-build.yml` `git:72bdd03:`
- 같은 run의 `publish`는 onnxruntime-node postinstall의 Linux CUDA 패키지 다운로드 실패로 멈췄다. 이후 publish 설치 단계는 `ONNXRUNTIME_NODE_INSTALL: skip`을 설정하며 회귀 테스트가 선언을 검사한다. 수정 후 해당 workflow 실행 증거는 코드에서 못 찾음. `.github/workflows/windows-build.yml` `tests/scripts/windows-workflow.test.ts` `git:9bcb94e:` `git:cf31bbc:`

- 설치 엔진 시작은 리소스 경로와 Windows 데이터 경로의 `\\?\` 접두어를 제거한다. UNC 경로는 일반 UNC 경로로 바꾸고 다른 경로는 유지한다. `src-tauri/src/main.rs` `git:5a5cd5a:`
- 세션이 061의 `pnpm verify` 종료 코드 0과 `✓ verify passed`를 확인했다. 사용자 제공 실행 증거에 따르면 PR #4의 [Windows 빌드 run 41051550438](https://github.com/smpbrighton/u3/actions/runs/41051550438) 설치본을 Windows 11 사용자 세션에서 실행했을 때 엔진 node.exe가 127.0.0.1 포트에서 대기했고 `engine.log`에 새 시작 줄이 생겼다. CI와 실행 로그 원문은 코드에서 못 찾음. 화면 오류 부재와 stderr 확인 증거도 코드에서 못 찾음. `architecture/changes/061-windows-engine-verbatim-path/plan.md` `src-tauri/src/main.rs` `git:5a5cd5a:`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [자동 업데이트와 릴리스](concept-updates.md)
- [로컬 TTS](concept-local-tts.md)
- [로컬 모델과 리소스](concept-local-models.md)
- [Codex 호환성](concept-codex-compat.md)

## 출처
- `architecture/changes/049-windows-build/spec.md`
- `architecture/changes/049-windows-build/plan.md`
- `architecture/changes/049-windows-build/checklist.md`
- `architecture/changes/049-windows-build/ci-verification.md`
- `architecture/changes/049-windows-build/verify.log`
- `architecture/changes/049-windows-build/package-mac.log`
- `.github/workflows/windows-build.yml`
- `tests/scripts/windows-workflow.test.ts`
- `scripts/build-platforms.ts`
- `scripts/build-whisper.sh`
- `scripts/smoke.ts`
- `src/engine/routes/voice.ts`
- `src-tauri/tauri.windows.conf.json`
- `9860d70`

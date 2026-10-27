# Plan: auto-update (lite)
Track: lite.

## Context
사용자 지시: 「자동 업데이트 기능을 구현하고 싶어. brighton-runner를 참고해서 자동 업데이트되게끔.」
지금은 새 버전이 나오면 dmg를 다시 받아 바꿔야 한다. 앱은 ad-hoc 서명이다(`src-tauri/tauri.conf.json` `signingIdentity: "-"`).
사용자 답:
- 배포: GitHub Releases, 레포 `smpbrighton/u3`(public, 이미 push 함).
- 서명: Developer ID(`BRIGHTON AI HOLDINGS PTY LTD (47RAD569PH)`) + 공증. notarytool 프로필은 이 Mac 의 `nova-notary` 를 쓴다(동작 확인함).
- 적용: 자동으로 받고 확인한다. 새 버전은 다시 시작할 때 적용한다. 편집 중인 내용을 잃지 않는다.

runner 참고점(`brighton-runner/runner`): `tauri-plugin-updater` 를 Rust 에서만 쓴다(JS 패키지·웹뷰 권한 없음). minisign 키는 Keychain 에 두고 `tauri signer sign` 에 환경 변수로만 넘긴다. `createUpdaterArtifacts` 를 끄고 공증·staple 한 .app 으로 tar.gz 를 만든다(`scripts/notarize.sh`). 확인은 시작 때·6시간마다·창 focus(10분 간격)다(결정 0031·0048).

## 검토 목록
| # | 항목 | 추천 | 이유 |
|---|---|---|---|
| 1 | 결정 0021: 앱은 `tauri-plugin-updater` 로 GitHub Releases 의 `latest.json` 을 확인한다. 엔드포인트는 `https://github.com/smpbrighton/u3/releases/latest/download/latest.json` 이다. 서명이 맞지 않는 파일은 설치하지 않는다 | 받는다 | 사용자 답. 토큰 없이 받는 공개 주소 |
| 2 | 확인 시점: 시작 30초 뒤, 6시간마다, 창이 앞으로 올 때(마지막 확인에서 10분 지났을 때만). 개발 빌드(`debug_assertions`)는 확인하지 않는다 | 받는다 | runner 0031·0048 과 같다 |
| 3 | 적용: 새 버전이 있으면 바로 받고 서명을 확인한다. 받은 파일은 앱 캐시 폴더(`~/Library/Caches/ai.brightongroup.u3/update/`)에 둔다. 설치(번들 교체)는 ① 사이드바 「다시 시작」을 누르거나 ② 앱을 끌 때(`RunEvent::Exit`, 엔진 종료 뒤) 한다. 실행 중에는 번들을 바꾸지 않는다 | 받는다 | 실행 중인 엔진이 Resources 의 Remotion 번들·ffmpeg·whisper 를 새로 읽으면 옛 엔진과 새 파일이 섞인다. 끌 때 설치하면 다음 실행이 새 버전이다 |
| 4 | 「다시 시작」은 진행 중인 엔진 작업(생성·렌더·받아 적기·음성 분리·모델 받기)이 있으면 확인 대화상자를 먼저 보인다. 편집 중인 프로젝트는 기존 저장 경로로 저장한 뒤 다시 시작한다 | 받는다 | 편집 내용을 잃지 않는다 |
| 5 | 화면: 사이드바 아래에 상태 한 줄만 둔다. 받는 중 「업데이트 받는 중 42%」, 준비됨 「새 버전 0.2.1 · 다시 시작」 버튼. 확인 중·최신 상태는 표시하지 않는다. 실패는 snackbar 로 한 번 알리고 다음 확인 때 다시 시도한다. 설정에 「앱 정보」 카드(현재 버전, 마지막 확인 시각, 「지금 확인」)를 둔다 | 받는다 | runner 0077·0079 의 조용한 상태 표시 |
| 6 | Rust 모듈 `src-tauri/src/updater.rs`: 상태(`idle·downloading{percent}·ready{version}·failed{message}`)를 갖고 `update_status`·`update_check_now`·`update_restart` 명령과 `update-status` 이벤트를 낸다. 한 번에 한 확인만 돈다. 이미 받은 버전보다 새 버전이 나오면 새 버전을 받는다 | 받는다 | 웹뷰에 updater 권한을 주지 않는다(runner 0031) |
| 7 | 서명 키: U3 전용 minisign 키를 `tauri signer generate`(암호 포함)로 만든다. 개인키·암호는 login Keychain(account `u3`, service `u3-updater-private-key`·`u3-updater-key-password`)에만 두고, 생성 파일은 X31 임시 폴더에서 바로 지운다. 공개키는 `tauri.conf.json` `plugins.updater.pubkey` 에 둔다 | 받는다 | runner 키와 분리. 키를 출력·커밋하지 않는다 |
| 8 | 앱 서명: `src-tauri/tauri.release.conf.json` 에 Developer ID 와 hardened runtime 을 둔다. Tauri 가 서명하지 않는 Resources 안의 Mach-O(node, ffmpeg, chrome-headless-shell, `.node`·`.dylib`, Remotion compositor)는 릴리스 스크립트가 안쪽부터 `codesign --options runtime --timestamp` 로 서명하고 마지막에 앱을 다시 서명한다. 엔진·node·chrome 에는 `allow-jit`·`allow-unsigned-executable-memory`·`disable-library-validation` entitlements 를 준다. 앱 entitlements 에 마이크(`audio-input`)를 유지한다 | 받는다 | 공증은 모든 실행 파일이 hardened runtime 서명이어야 통과한다 |
| 9 | 릴리스 스크립트 `scripts/release.sh <버전>`: 깨끗한 main 확인 → `package.json`·`tauri.conf.json`·`Cargo.toml`/`Cargo.lock` 버전 → `pnpm verify` → `pnpm package`(release 설정) → 중첩 서명 → 앱 공증·staple → `U3.app.tar.gz`+`.sig`(Keychain 키를 환경 변수로만) → dmg 서명·공증·staple → `latest.json`(url 은 `releases/download/v<버전>/U3.app.tar.gz` 절대 주소) → 커밋 `release <버전>`·태그 `v<버전>`·push → `gh release create`(dmg, tar.gz, sig, latest.json). 모든 산출물과 임시 파일은 X31 | 받는다 | runner `notarize.sh` 흐름을 GitHub 로 옮긴다 |
| 10 | 첫 릴리스 0.2.0 은 업데이터가 들어간 첫 빌드라 손으로 한 번 설치한다. 0.2.1 을 이어서 내 0.2.0 → 0.2.1 자동 업데이트를 실제로 확인한다 | 받는다 | 지금 설치본(0.1.0)에는 업데이터가 없다 |
| 11 | AGENTS.md 커맨드 절에 `scripts/release.sh <버전>` 한 줄을 넣는다 | 받는다 | 반복 절차 |

## 바꿀 파일
- 결정·문서: `architecture/decisions/0021-auto-update.md`(new), `architecture/INTENT.md`(결정 줄 추가), `AGENTS.md`(커맨드 한 줄), 이 plan.md.
- Tauri: `src-tauri/Cargo.toml`(`tauri-plugin-updater = "2"`), `src-tauri/src/main.rs`(플러그인 등록, Exit 때 설치, 명령 등록), `src-tauri/src/updater.rs`(new), `src-tauri/tauri.conf.json`(`plugins.updater` pubkey·endpoints), `src-tauri/tauri.release.conf.json`(new), `src-tauri/entitlements.plist`, `src-tauri/entitlements-engine.plist`(new).
- UI: `src/ui/App.tsx` 또는 사이드바 컴포넌트(상태 한 줄·다시 시작), `src/ui/screens/Settings.tsx`(앱 정보 카드), `src/ui/updater.ts`(new, invoke·이벤트 래퍼).
- 엔진: 진행 중 작업 여부를 알 수 있는 기존 경로를 찾아 쓴다(`src/engine/jobs.ts` `JobRegistry`). 없으면 `GET /api/system/busy` 를 더한다.
- 스크립트: `scripts/release.sh`(new), `scripts/sign-nested.sh`(new, 중첩 서명).
- 테스트: Rust 단위 테스트(버전 비교·상태 전이·focus 10분 간격·이미 받은 버전 처리), UI 테스트(상태 한 줄 표시·다시 시작 확인), release 스크립트의 `latest.json` 생성 검사(서명·url 형식).

## 순서
1. 조정자: 장부 예약, 워크트리(X31 `u3-worktrees/038-auto-update`), plan 커밋, 결정 0021 초안.
2. W59 서명 스파이크(조정자): 키 생성·Keychain 저장. 지금 빌드에 중첩 서명 → 앱 공증 → staple → `spctl -a -vv` 통과와 실제 렌더 1회(chrome-headless-shell·node JIT 동작)를 확인한다. 공증이 막히면 원인과 선택지를 들고 멈춘다.
3. W60(codex): Rust updater 모듈·명령·Exit 설치, 테스트 먼저.
4. W61(codex): UI 상태 한 줄·다시 시작 확인·설정 앱 정보 카드, 진행 중 작업 확인.
5. W62(codex): `scripts/release.sh`·`sign-nested.sh`, AGENTS.md 한 줄.
6. 조정자: plan 대조 → 병합 → `pnpm verify` → `scripts/release.sh 0.2.0` → 0.2.0 손 설치 → `scripts/release.sh 0.2.1` → 설치본이 0.2.1 을 받아 「다시 시작」 뒤 0.2.1 로 열리는지 확인 → 워크트리 정리.

## 검증
- `pnpm verify` 마지막 줄 `✓ verify passed`(워커 워크트리와 병합 뒤 main).
- `xcrun notarytool` 결과 `status: Accepted`, `xcrun stapler validate` 통과, `spctl -a -vv ~/Applications/U3.app` 이 `source=Notarized Developer ID`.
- 0.2.0 설치본에서 0.2.1 이 자동으로 받아지고 사이드바에 「새 버전 0.2.1 · 다시 시작」이 보인다. 누르면 0.2.1 로 다시 열린다. 누르지 않고 끄면 다음 실행이 0.2.1 이다.
- 업데이트 뒤 마이크 권한을 다시 묻지 않는다(같은 Developer ID).
- 서명을 일부러 틀린 `latest.json` 으로는 설치하지 않는다(로컬 엔드포인트로 시험).

## 주의
- 업데이트 파일은 약 530MB 다. 받는 동안 메모리와 디스크를 그만큼 쓴다.
- 레포가 public 이므로 릴리스 파일도 누구나 받을 수 있다. 앱 안의 Jev 키는 빌드에 들어간 채로 배포된다(지금 dmg 와 같다).

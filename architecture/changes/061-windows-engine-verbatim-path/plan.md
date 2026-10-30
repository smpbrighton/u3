# Plan: windows-engine-verbatim-path (lite)
Track: lite.
<!-- lite 트랙: intent·spec·critic 없이 plan mode 의 승인으로 진행한다. 앞 단계 신호가 생기면 멈추고 새 slug 로 /smp:intent 를 시작한다. -->

plan mode 산출물. 승인 후 커밋한다. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다. PR 리뷰는 diff를 이 파일과 대조한다.

## 배경
Windows 11 에 설치한 U3 1.0.1 이 시작할 때 "U3 엔진을 시작하지 못했습니다: 엔진이 PORT 응답을 보내지 않았습니다" 를 낸다.

확인한 것(192.168.219.116, 사용자 `smp\sumin`, SSH):
- 사용자 세션에서 u3.exe 를 띄우면 엔진 Node 가 시작 파일을 찾다가 `EISDIR: illegal operation on a directory, lstat 'C:'` 로 종료한다.
- `node.exe \\?\C:\Users\sumin\AppData\Local\U3\resources\engine.mjs` 를 실행하면 같은 에러가 난다.
- 일반 경로 `C:\...\engine.mjs` 로 실행하면 엔진은 `PORT <번호>` 를 낸다(env 토큰, stdin 토큰 두 방식 모두).

추론(Windows 앱 안에서 값을 출력해 보지 않음): Tauri `resource_dir()` 가 `\\?\` 확장 경로를 돌려주고, `start_engine`(`src-tauri/src/main.rs:203`)이 이 경로로 `engine.mjs` 인자와 `U3_*` 환경변수를 만든다. Node 24.13.0 은 `\\?\` 시작 파일을 읽지 못한다.

`scripts/windows-install-smoke.ps1` 는 일반 경로로 엔진을 직접 띄우므로 이 버그를 잡지 못했다.

## 결정
- 사용자 지시: "플랜 작성하고 진행은 /orca-cli 로 codex에게 지시해"
- 수정 방식: 경로 문자열에서 `\\?\` 접두어를 빼는 순수 함수를 둔다. `\\?\UNC\server\share` 는 `\\server\share` 로 바꾼다. 다른 경로는 그대로 둔다.
- 함수는 플랫폼 조건 없이 문자열로 처리한다. 그래서 Mac 의 `pnpm verify`(cargo test)에서 회귀 시험이 돈다.
- 구현은 Orca 워크트리 터미널의 codex 작업자가 한다(`orca-cli` 스킬). 이 세션은 지시, 검증, 병합, Windows 확인을 맡는다.

## 대조
- 결정 [0032](../../decisions/0032-windows-build.md) 와 [0021](../../decisions/0021-auto-update.md) 를 따르며 뒤집지 않는다.
- 진행 중인 다른 변경 없음(장부 기준 060 은 병합됨).

## 바꿀 파일
- `src-tauri/src/main.rs`: `plain_path(PathBuf) -> PathBuf` 를 추가한다. release `start_engine` 에서 `resource_dir()` 와 Windows `app_local_data_dir()` 결과에 적용한다. `bundled_engine_tests` 에 회귀 시험을 추가한다.
- `architecture/changes/061-windows-engine-verbatim-path/plan.md` (new): 이 계획.

## 순서
1. 이 plan.md 를 워크트리 브랜치에 커밋한다.
2. codex 작업자가 `bundled_engine_tests` 에 시험을 추가한다. 시험 내용:
   - `\\?\C:\Users\sumin\AppData\Local\U3\resources` → `C:\Users\sumin\AppData\Local\U3\resources`
   - `\\?\UNC\server\share\U3` → `\\server\share\U3`
   - `C:\plain`, `/Applications/U3.app/Contents/Resources` → 그대로
   - `plain_path` 는 `unimplemented!()` 본문으로 두어 시험이 컴파일되고 실패하게 한다. `cargo test` 가 실패하는 것을 확인하고 커밋한다.
3. codex 작업자가 시험을 바꾸지 않고 `plain_path` 를 구현하고 `start_engine` 두 곳에 적용한다. 커밋한다.
4. 이 세션이 `pnpm verify` 를 실행해 `✓ verify passed` 를 확인한다.
5. Windows 확인(병합 전): 브랜치를 push 하고 draft PR 을 연다. `windows-build.yml` 의 PR 작업이 `windows-pr-<sha>` 설치본 artifact 를 만든다. 그 설치본을 192.168.219.116 에 설치하고, 사용자 세션에서 u3.exe 를 띄워(예약 작업 방식) 엔진 stderr 와 `engine.log` 를 확인한다.
6. `worktree.sh finish windows-engine-verbatim-path` 로 rebase·검증·병합·push·정리를 한다. draft PR 은 병합으로 닫힌다.
7. `scripts/release.sh 1.0.2` 로 릴리스한다. Actions 가 Windows 검증 후 공개한다.
8. `/smp:wiki ingest` 를 main 에서 한다.

## 리스크
- 가장 위험한 단계는 7 이다. 릴리스는 공개 자동 업데이트로 나간다. 그래서 단계 5 의 Windows 확인이 통과한 뒤에만 릴리스한다.
- PR 설치본은 `-AllowNoResources` 로 만들어져 모델 자원이 빠질 수 있다. 엔진 시작 확인에는 영향이 없다(smoke 도 같은 조건에서 엔진을 띄운다).
- `\\?\` 를 뺀 경로가 260자를 넘으면 일부 Win32 API 가 실패한다. 설치 경로 `C:\Users\<계정>\AppData\Local\U3\resources\...` 는 이 한도보다 짧다.
- 추론이 틀려 `resource_dir()` 가 일반 경로를 돌려주는 경우 이 수정은 효과가 없다. 단계 5 가 이 경우를 잡고, 그때는 병합하지 않고 멈춘다.
- 택하지 않은 대안:
  - `dunce::simplified`: Windows 가 아닌 곳에서 아무것도 하지 않으므로 Mac 에서 회귀 시험이 실패하지 않는다.
  - 엔진 쪽(`engine.mjs` 로더)을 고치는 것: Node 가 시작 파일을 읽기 전에 종료하므로 엔진 코드로 고칠 수 없다.
  - smoke 시험에 `\\?\` 경로를 넣는 것: 수정 뒤 앱은 일반 경로를 넘기므로 smoke 는 지금처럼 앱과 같은 일반 경로를 쓴다.

## 증명
- 단계 2: `cargo test --manifest-path src-tauri/Cargo.toml` 이 새 시험에서 실패한다(종료 코드 ≠ 0, `not implemented`).
- 단계 3·4: 같은 시험이 통과하고 `pnpm verify` 마지막 줄이 `✓ verify passed` 다.
- 단계 5: Windows 사용자 세션에서 PR 설치본을 실행했을 때 stderr 에 `엔진이 PORT 응답을 보내지 않았습니다` 가 없다. `C:\Users\sumin\AppData\Local\ai.brightongroup.u3\logs\engine.log` 에 새 시작 줄이 추가된다. 화면에서 엔진 에러가 없다(사용자 사진 또는 SSH 로 확인).
- 실행하지 못한 항목은 완료 보고에 미검증으로 적는다.

## 롤백
- 데이터 형식은 바뀌지 않는다. 코드 커밋을 되돌리면 된다.
- 단계 5 에서 실패하면 병합하지 않는다. 1.0.2 공개 뒤 문제가 나오면 되돌린 커밋으로 1.0.3 을 낸다.

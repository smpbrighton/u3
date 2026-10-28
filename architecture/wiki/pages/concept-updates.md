# 자동 업데이트와 릴리스

## 요약
앱은 업데이트를 확인하고 다운로드 상태를 표시하며, 저장 후 재시작할 때 설치한다. 릴리스 스크립트는 서명·공증과 업데이트 메타데이터 생성을 처리한다. `src-tauri/src/updater.rs` `src/ui/UpdateControls.tsx` `src/ui/update-save.tsx` `scripts/release.sh` `git:98fcf79:`

## 내용
- 업데이트 확인은 시작 후 30초, 이후 6시간 주기와 포커스 후 10분 간격을 사용한다. 수동 확인도 제공하며 debug 빌드는 확인하지 않는다. `src-tauri/src/updater_logic.rs` `src/ui/screens/Settings.tsx` `git:31aae20:`
- 새 버전은 다운로드 후 준비 상태로 표시한다. 설치 전에 작업을 저장하고 엔진을 종료한다. `src-tauri/src/updater.rs` `src/ui/update-save.tsx` `src/ui/UpdateControls.tsx` `git:a95a964:`
- 릴리스 스크립트는 중첩 실행 파일 서명, 앱과 DMG 공증, 업데이트 서명과 메타데이터 생성을 수행한다. dry-run은 릴리스 실행 없이 메타데이터 생성을 시험한다. `scripts/release.sh` `scripts/sign-nested.sh` `git:98fcf79:`
- 기록된 검증에서 updater Rust 테스트 9개와 릴리스 dry-run 테스트 11개가 통과했다. 실제 서명·공증·릴리스는 해당 실행에서 수행하지 않았다. `git:31aae20:` `git:98fcf79:` `git:300c7c3:`
- Jev 키 검사 변경의 검증에서 TypeScript 테스트 497개와 Rust 테스트 10개, smoke가 통과했고 TypeScript 테스트 2개는 건너뛰었다. 실제 패키징·서명·공증·릴리스·설치는 실행하지 않았다. `git:20d60d0:`
- 0.2.0 릴리스에서 앱과 DMG의 `spctl` 결과는 각각 `accepted`, `source=Notarized Developer ID`였다. GitHub Release `v0.2.0` 업로드와 공개 `latest.json`의 0.2.0 지정을 조정자가 확인했다. 릴리스 실행 증거의 저장 경로는 코드에서 못 찾음. `scripts/release.sh` `git:0782e6a:`
- W70 수정은 0.2.0 릴리스 커밋 뒤에 있다. 수정이 포함된 릴리스나 설치본 검증은 코드에서 못 찾음. `git:0782e6a:` `git:8e6e624:`
- 이전 버전 설정은 0.2.2였다. 이 커밋의 실제 배포·서명·공증·설치 실행 증거는 코드에서 못 찾음. `package.json` `src-tauri/Cargo.toml` `src-tauri/tauri.conf.json` `git:18f3e6a:`
- 0.3.0 커밋의 버전 설정은 0.3.0이었다. 이 버전 변경 커밋의 실제 배포·서명·공증·설치 실행 증거는 코드에서 못 찾음. `package.json` `src-tauri/Cargo.toml` `src-tauri/tauri.conf.json` `git:418c393:`
- compositor 경로 수정이 포함된 0.3.1 릴리스·설치 및 앱 영상 입력 검증의 실행 증거는 코드에서 못 찾음. `architecture/changes/046-ffmpeg-dylib-paths/plan.md` `git:41c0d1a:`
- 0.3.2 커밋은 앱과 Tauri의 버전 설정을 변경했다. 실제 배포·서명·공증·설치 실행 증거는 코드에서 못 찾음. `package.json` `src-tauri/Cargo.toml` `src-tauri/tauri.conf.json` `git:f4fcf7a:`
- 결정 링크: [자동 업데이트](../../decisions/0021-auto-update.md). `git:b9f7c76:`

## 관계
- [compositor dylib 경로](concept-compositor-dylib.md)
- [U3 데스크톱 앱](entity-desktop-app.md)
- [엔진 종료](entity-engine-shutdown.md)

## 출처
- `architecture/changes/038-auto-update/plan.md`
- `src-tauri/src/updater.rs`
- `src-tauri/src/updater_logic.rs`
- `src/ui/UpdateControls.tsx`
- `src/ui/update-save.tsx`
- `scripts/release.sh`
- `scripts/sign-nested.sh`
- `31aae20`
- `98fcf79`
- `300c7c3`
- `20d60d0`

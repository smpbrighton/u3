# compositor dylib 경로

## 요약
엔진 빌드는 compositor의 경로 없는 dylib 참조를 수정하고 패키지 서명 전에 검사한다. `scripts/build-engine.ts` `scripts/fix-dylib-paths.sh` `scripts/sign-nested.sh` `git:41c0d1a:`

## 내용
- 엔진은 `FFPROBE_BIN`으로 ffprobe를 직접 실행한다. 계획은 hardened runtime에서 경로 없는 dylib 참조가 거부된 오류를 기록한다. `src/engine/pipeline/ffmpeg.ts` `architecture/changes/046-ffmpeg-dylib-paths/plan.md` `git:41c0d1a:`
- 엔진 빌드는 runtime node_modules의 compositor를 resources에 복사하기 전에 수정한다. 스크립트는 최상위 Mach-O 파일의 경로 없는 의존성을 `@loader_path/`로 바꾸고 경로 없는 dylib ID도 바꾼 뒤 수정된 파일을 ad-hoc 재서명한다. `scripts/build-engine.ts` `scripts/fix-dylib-paths.sh` `git:41c0d1a:`
- `--check`는 남은 경로 없는 의존성이나 dylib ID를 실패로 처리한다. 중첩 서명 스크립트는 서명 전에 이 검사를 실행한다. 엔진 빌드의 dylib 검사는 경로 없는 의존성과 번들에 없는 `@` 의존성도 거부한다. `scripts/fix-dylib-paths.sh` `scripts/sign-nested.sh` `scripts/build-engine.ts` `git:41c0d1a:`
- 테스트는 세 dylib의 수정과 서명, 검사 및 빌드·서명 경로의 연결을 확인한다. 첫 테스트 제한 시간은 60초다. `tests/scripts/dylib-paths.test.ts` `git:77bc73c:` `git:68f04d1:`
- 실행 기록과 verify 로그에서 테스트 734개 통과·3개 건너뜀, Rust 테스트 10개 통과, 렌더 smoke 및 `✓ verify passed`를 확인했다. 패키지 로그는 10개 파일 수정과 ad-hoc 앱·DMG 생성을 보여 주며 공증은 건너뛰었다. `architecture/changes/046-ffmpeg-dylib-paths/plan.md` `git:41c0d1a:`
- 계획의 실행 기록은 패키지된 ffprobe의 `-version` 종료 코드 0과 실제 MOV의 `-show_format` JSON 출력을 기록한다. 해당 명령의 별도 출력 파일은 코드에서 못 찾음. 0.3.1 릴리스·설치 및 앱에서 영상 입력의 실행 증거도 코드에서 못 찾음. `architecture/changes/046-ffmpeg-dylib-paths/plan.md` `git:41c0d1a:`
- 결정 링크: [앱 구조](../../decisions/0001-tauri-node-sidecar.md), [자동 업데이트](../../decisions/0021-auto-update.md). `architecture/changes/046-ffmpeg-dylib-paths/plan.md`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [자동 업데이트와 릴리스](concept-updates.md)

## 출처
- `architecture/changes/046-ffmpeg-dylib-paths/plan.md`
- `scripts/build-engine.ts`
- `scripts/fix-dylib-paths.sh`
- `scripts/sign-nested.sh`
- `src/engine/pipeline/ffmpeg.ts`
- `tests/scripts/dylib-paths.test.ts`
- `41c0d1a`
- `68f04d1`

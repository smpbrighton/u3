# 원격 기본 프롬프트

## 요약
대본·말투·성격과 캐러셀 기획의 기본 프롬프트는 앱 내장 본문과 원격 캐시에서 선택한다. 사용자가 저장한 본문은 유지한다. `src/engine/prompt-defaults.ts` `src/engine/prompt-settings.ts` `git:6ec21ef:`

## 내용
- 설치 엔진은 시작 시와 6시간마다 GitHub `prompts` prerelease의 schema별 JSON을 받는다. 첫 받기가 진행 중이면 조회는 최대 3초 기다린다. 요청 제한은 10초다. `src/engine/prompt-defaults.ts` `src/engine/main.ts` `git:b02e479:`
- schema와 revision, 다섯 기본 본문과 자막 지침을 검증하고 512KB 초과 응답을 거부한다. 유효한 캐시와 내장 본문 중 revision이 큰 쪽을 사용하며 같으면 내장 본문을 사용한다. 받기에 실패하면 기존 캐시 또는 내장 본문을 사용한다. `src/core/default-prompts.ts` `src/engine/prompt-defaults.ts` `git:b02e479:`
- 내장 기본값은 schema 1·revision 4이며 말투·성격은 각각 1~4000자다. 앱은 두 필드가 없는 이전 원격 파일을 유효한 기본값으로 읽지 못한다. `src/core/default-prompts.ts` `tests/engine/prompt-defaults.test.ts` `git:ba33c59:`
- 개발 실행은 캐시를 읽거나 쓰지 않는다. `U3_PROMPTS_URL`을 지정하면 그 응답을 메모리에 보관하고 설치본은 이 주소를 무시한다. `src/engine/prompt-defaults.ts` `git:b02e479:`
- 사용자 본문을 저장하면 당시 기본 본문의 hash를 함께 저장한다. 해당 기본 본문이 바뀌면 `newerDefault`를 표시하며 기존 hash가 없으면 표시하지 않는다. 빈 본문이나 현재 기본 본문을 저장하면 사용자 본문과 hash를 삭제한다. `src/engine/prompt-settings.ts` `src/ui/screens/Settings.tsx` `git:6ec21ef:` `git:efcea52:`
- 설정 API는 현재 기본 본문과 변경 표시를 반환한다. 대본 생성과 캐러셀 기획은 현재 기본 본문을 사용한다. 화면의 기본값 복원은 빈 본문을 보내고 변경 없는 blur는 저장하지 않는다. `src/engine/routes/system.ts` `src/engine/routes/script.ts` `src/engine/routes/carousels.ts` `src/ui/screens/Settings.tsx` `git:efcea52:`
- 공개 스크립트는 깨끗한 main을 검사하고 내장 본문과 revision으로 자산을 만든다. 원격과 revision 및 본문이 같으면 공개하지 않고, 원격 revision이 같거나 더 큰데 본문이 다르면 실패한다. `scripts/publish-prompts.ts` `scripts/publish-prompts.sh` `git:d660c5d:`
- 공개 스크립트는 말투·성격이 없는 이전 원격 파일을 읽고 본문 비교에서 다른 값으로 취급한다. 수정 후 실제 원격 조회와 공개 실행 증거는 코드에서 못 찾음. `scripts/publish-prompts.ts` `tests/scripts/publish-prompts.test.ts` `git:22ecacb:`
- 원격 조회가 실패하면 curl 종료 코드와 관계없이 출력된 HTTP 코드가 404인 경우에만 원격 파일이 없는 것으로 처리한다. 다른 오류는 전달한다. 테스트는 종료 코드 22·56의 404와 500·빈 출력을 다룬다. `scripts/publish-prompts.ts` `tests/scripts/publish-prompts.test.ts` `git:e48f3a4:` `git:4d172e6:`
- 구현 전 실패 테스트 기록은 10개 파일 실패와 21개 테스트 실패를 보여 준다. 병합 뒤 main의 `pnpm verify`는 세션이 종료 코드 0과 `✓ verify passed`를 확인했다. `architecture/changes/055-remote-prompts/test-failure.txt` `git:d660c5d:`
- 세션 실행 증거에 따르면 수정 전 공개 dry-run은 원격 404에서 curl 종료 코드 56으로 실패했다. 수정 후 같은 dry-run은 `✓ prompts dry-run: publish`를 출력했고 `pnpm verify`는 `✓ verify passed`를 출력했다. `scripts/publish-prompts.sh` `scripts/publish-prompts.ts` `git:4d172e6:`
- 실제 원격 prerelease 공개와 설치본 캐시 확인은 미검증이다. 실제 공개 출력, 원격 revision 확인 및 설치본 설정 확인의 실행 증거는 코드에서 못 찾음. `architecture/changes/055-remote-prompts/plan.md` `scripts/publish-prompts.ts`
- 056 검증 기록은 구현 전 대상 테스트 39개 실패, 구현 후 core·서버·공개 판단 72개와 UI 44개 통과, Mac `pnpm verify` 종료 코드 0을 보고한다. 기록에 지정된 원본 로그는 현재 작업 폴더에서 찾지 못했다. `architecture/changes/056-voice-default-prompts/validation.md` `git:9456024:`
- 056 기록 당시 공개 스크립트의 이전 원격 파일 읽기는 실패했다. 후속 코드가 이를 수정했지만 그 후의 실행 출력은 코드에서 못 찾음. 실제 원격 공개·설치본 UI·Windows native 검증은 미검증이다. `architecture/changes/056-voice-default-prompts/validation.md` `git:22ecacb:`
- 결정 링크: [기본 프롬프트와 전역 자막 지침](../../decisions/0037-remote-prompts-caption-guide.md). `git:6562d73:`

- 영상 기획 기본 본문 변경 당시 내장 revision은 3이었다. 원격 revision 3 공개는 실행하지 않았다. `src/core/default-prompts.ts` `src/core/carousel-prompt.ts` `architecture/changes/060-carousel-video-genimage/failing-tests.md` `git:83a16ca:`

- `captionGuide`는 공백을 제거하고 최대 20,000자로 읽으며 누락되면 빈 문자열이다. 공개 스크립트는 본문 비교에 이 항목을 포함한다. `src/core/default-prompts.ts` `scripts/publish-prompts.ts` `git:318af07:`
- 세션이 062의 `pnpm verify` 종료 코드 0과 `✓ verify passed`를 확인했다. Windows 실제 대본 생성은 Codex 로그인 필요로 미검증이다. 원격 prompts revision 4 공개는 아직 실행하지 않았다. 실행 출력은 코드에서 못 찾음. `architecture/changes/062-global-caption-guide/plan.md` `git:318af07:`

## 관계
- [화면 셸과 설정](concept-ui-shell.md)
- [캐러셀 생성](concept-carousel.md)
- [타임라인 편집](concept-timeline-editing.md)
- [자동 업데이트와 릴리스](concept-updates.md)

## 출처
- `architecture/changes/055-remote-prompts/spec.md`
- `architecture/changes/055-remote-prompts/plan.md`
- `architecture/changes/055-remote-prompts/test-failure.txt`
- `src/core/default-prompts.ts`
- `src/engine/prompt-defaults.ts`
- `src/engine/prompt-settings.ts`
- `src/engine/routes/system.ts`
- `src/ui/screens/Settings.tsx`
- `scripts/publish-prompts.ts`
- `b02e479`
- `6ec21ef`
- `efcea52`
- `d660c5d`
- `tests/scripts/publish-prompts.test.ts`
- `e48f3a4`
- `4d172e6`

- `architecture/changes/056-voice-default-prompts/plan.md`
- `architecture/changes/056-voice-default-prompts/validation.md`
- `git:22ecacb:`

- `architecture/changes/060-carousel-video-genimage/failing-tests.md`

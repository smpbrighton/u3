# 원격 기본 프롬프트

## 요약
대본과 캐러셀 기획의 기본 프롬프트는 앱 내장 본문과 원격 캐시에서 선택한다. 사용자가 저장한 본문은 유지한다. `src/engine/prompt-defaults.ts` `src/engine/prompt-settings.ts` `git:6ec21ef:`

## 내용
- 설치 엔진은 시작 시와 6시간마다 GitHub `prompts` prerelease의 schema별 JSON을 받는다. 첫 받기가 진행 중이면 조회는 최대 3초 기다린다. 요청 제한은 10초다. `src/engine/prompt-defaults.ts` `src/engine/main.ts` `git:b02e479:`
- schema와 revision, 세 본문을 검증하고 512KB 초과 응답을 거부한다. 유효한 캐시와 내장 본문 중 revision이 큰 쪽을 사용하며 같으면 내장 본문을 사용한다. 받기에 실패하면 기존 캐시 또는 내장 본문을 사용한다. `src/core/default-prompts.ts` `src/engine/prompt-defaults.ts` `git:b02e479:`
- 개발 실행은 캐시를 읽거나 쓰지 않는다. `U3_PROMPTS_URL`을 지정하면 그 응답을 메모리에 보관하고 설치본은 이 주소를 무시한다. `src/engine/prompt-defaults.ts` `git:b02e479:`
- 사용자 본문을 저장하면 당시 기본 본문의 hash를 함께 저장한다. 해당 기본 본문이 바뀌면 `newerDefault`를 표시하며 기존 hash가 없으면 표시하지 않는다. 빈 본문이나 현재 기본 본문을 저장하면 사용자 본문과 hash를 삭제한다. `src/engine/prompt-settings.ts` `src/ui/screens/Settings.tsx` `git:6ec21ef:` `git:efcea52:`
- 설정 API는 현재 기본 본문과 변경 표시를 반환한다. 대본 생성과 캐러셀 기획은 현재 기본 본문을 사용한다. 화면의 기본값 복원은 빈 본문을 보내고 변경 없는 blur는 저장하지 않는다. `src/engine/routes/system.ts` `src/engine/routes/script.ts` `src/engine/routes/carousels.ts` `src/ui/screens/Settings.tsx` `git:efcea52:`
- 공개 스크립트는 깨끗한 main을 검사하고 내장 본문과 revision으로 자산을 만든다. 원격과 revision 및 본문이 같으면 공개하지 않고, 원격 revision이 같거나 더 큰데 본문이 다르면 실패한다. `scripts/publish-prompts.ts` `scripts/publish-prompts.sh` `git:d660c5d:`
- 구현 전 실패 테스트 기록은 10개 파일 실패와 21개 테스트 실패를 보여 준다. 병합 뒤 main의 `pnpm verify`는 세션이 종료 코드 0과 `✓ verify passed`를 확인했다. `architecture/changes/055-remote-prompts/test-failure.txt` `git:d660c5d:`
- 원격 prerelease 공개와 설치본 캐시 확인은 미검증이다. 공개 dry-run과 실제 공개 출력, 원격 revision 확인 및 설치본 설정 확인의 실행 증거는 코드에서 못 찾음. `architecture/changes/055-remote-prompts/plan.md` `scripts/publish-prompts.ts`
- 결정 링크: [기본 프롬프트 원격 갱신](../../decisions/0034-remote-default-prompts.md). `git:189fa06:`

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

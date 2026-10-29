# Codex 호환성

## 요약
Codex 실행 파일 탐색과 계정 모델 선택은 대본, 자막 및 캐러셀 작업에 연결된다. `src/engine/pipeline/codex-path.ts` `src/engine/codex-settings.ts` `src/engine/routes/script.ts` `src/engine/routes/captions.ts` `src/engine/routes/carousels.ts` `git:1263844:`

## 내용
- 실행 가능한 설정 경로를 우선하고 로그인 셸, 대화형 로그인 셸, 표준 설치 후보와 nvm 버전 순서로 탐색한다. 자동 탐색 결과는 설정에 저장하지 않는다. `src/engine/pipeline/codex-path.ts` `git:e8e72c3:`
- CLI 카탈로그를 먼저 조회하고 실패하면 bundled 카탈로그를 조회한다. 카탈로그 조회 결과는 실행 파일별로 60초 캐시한다. 조회 실패 시 저장된 모델을 유지하고 저장값도 없으면 `gpt-6.1-sol`을 쓴다. `src/engine/codex-settings.ts` `src/core/codex-model.ts` `git:b3e983c:`
- 카탈로그가 있으면 저장된 모델을 우선하고, 없으면 선호 모델 순서와 나머지 카탈로그 순서로 선택한다. 모델 사용 불가 오류에만 최대 두 번 다른 카탈로그 모델로 재시도한다. 성공한 모델을 저장하고 변경 메시지를 반환한다. 텍스트와 이미지 실행 모두 오류를 분류한다. `src/core/codex-model.ts` `src/engine/codex-settings.ts` `src/engine/pipeline/codex.ts` `src/engine/pipeline/codex-image.ts` `git:1263844:`
- CLI 버전이 0.159.3 미만이면 업데이트 경고를 표시하고 대본 생성을 막는다. 버전을 읽지 못하면 outdated로 판정하지 않는다. 설치 파일을 찾지 못한 경우와 로그인 확인 실패를 구분한다. `src/core/codex-model.ts` `src/engine/pipeline/codex-path.ts` `src/ui/components/u3/CodexWarning.tsx` `src/ui/screens/Script.tsx` `git:e3c7fd2:`
- 실패 테스트와 구현 커밋은 확인했다. 테스트 실행 출력과 `pnpm verify` 통과 증거는 코드에서 못 찾음. 설치본에서 자동 경로 탐색과 모델 전환을 확인한 실행 증거도 코드에서 못 찾음. `architecture/changes/052-codex-compat/plan.md` `tests/server/codex-models.test.ts` `git:58ae8a1:`

- Windows 경로 탐색은 native 실행 파일과 npm `codex.cmd` shim을 다룬다. Windows 실기기에서 두 경로와 로그인 성공은 미실행이다. `src/engine/pipeline/codex-path.ts` `tests/engine/codex-path.test.ts` `architecture/changes/049-windows-build/checklist.md` `git:9a58a0a:`

## 관계
- [Windows 빌드와 검증](concept-windows-build.md)
- [화면 셸과 설정](concept-ui-shell.md)
- [타임라인 편집](concept-timeline-editing.md)
- [캐러셀 생성](concept-carousel.md)

## 출처
- `architecture/changes/052-codex-compat/plan.md`
- `src/core/codex-model.ts`
- `src/engine/codex-settings.ts`
- `src/engine/pipeline/codex-path.ts`
- `src/engine/pipeline/codex.ts`
- `src/engine/pipeline/codex-image.ts`
- `src/engine/routes/script.ts`
- `src/engine/routes/captions.ts`
- `src/engine/routes/carousels.ts`
- `src/ui/components/u3/CodexWarning.tsx`
- `src/ui/screens/Script.tsx`
- `tests/server/codex-models.test.ts`
- `1263844`

# W30 설정에서 대본 프롬프트 수정

Track: lite.

## 결정

- 사용자가 요청한 결과는 설정 화면에서 대본 생성의 기본 지시문을 편집하고 저장하는 것이다.
- 편집 가능한 값은 기본 지시문 하나다. 앱은 형식 규칙, 받아 적은 말소리, 출력 스키마를 계속 덧붙인다.
- 기본 지시문은 core 상수 하나로 관리한다. 문구는 `영상과 사진을 보고 장면별 대본을 추천해 주세요. 입력 장면과 영상 길이에 맞는 장면 수로 구성하고, 자막은 짧고 자연스러운 한국어 구어체로 작성해 주세요.` 로 한다.
- 직접 쓰기 요청은 `mode: "direct"`와 사용자 글을 보낸다. AI 추천은 `mode: "ai"`만 보낸다. 기존 `prompt`만 오는 엔진 요청은 direct 입력으로 처리한다.
- 설정 API 는 기존 `/api/system/*` 경로 형식에 맞춰 `/api/system/script-prompt`를 사용한다. 응답은 `prompt`, `isDefault`, `rulesPreview`를 포함한다.
- W29와 결정 0013의 스크립트 형식·검증 규칙을 유지한다.
- UI는 기존 SEED 컴포넌트를 사용한다. 텍스트 영역 label은 컴포넌트 안에 한 번만 표시한다. 카드의 저장만 `brandSolid`로 강조하고 되돌리기와 다른 설정 액션은 약한 위계로 둔다.

## 바꿀 파일

- `src/core/script-prompt.ts`: 기본값, 고정 규칙 미리보기, 프롬프트 조립 순수 함수.
- `src/engine/routes/system.ts`, `src/engine/routes/script.ts`: 설정 GET·PUT과 생성 시 프롬프트 구성.
- `src/engine/pipeline/script-validation.ts`: 생성 경로와 공유하는 읽기 전용 형식 규칙 미리보기.
- `src/ui/screens/Settings.tsx`, `src/ui/styles.css`: 프롬프트 설정 카드와 읽기 전용 규칙 목록.
- `src/ui/screens/Script.tsx`: AI/direct 모드 요청 형식 변경.
- `tests/core/script-prompt.test.ts`, `tests/server/script-prompt.test.ts`: 기본값·규칙·조립과 설정 API를 검증.
- `architecture/changes/031-script-prompt-setting/plan.md`: 이 계획.

## 순서

1. core 조립 함수와 설정 API 동작을 증명하는 실패 테스트를 추가하고 `W30: 프롬프트 엔진 실패 테스트`로 커밋한다.
2. 테스트를 수정하지 않고 core 함수와 엔진 설정·생성 경로를 구현한다.
3. Settings 화면에 프롬프트 카드, 4000자 입력, 저장·기본값 복원, 규칙 미리보기를 구현한다.
4. Script 화면이 AI/direct 모드를 구분해 요청하도록 수정한다.
5. `U3_DATA_DIR=out/manual/store`, `U3_LIBRARY_DIR=/Users/smp/Applications/U3.app/Contents/Resources/resources/library`로 엔진을 실행한다. API에서 GET, 저장, 4001자 거부, 빈 문자열 기본값 복원을 확인한다. 저장 테스트 후 빈 문자열을 PUT 해 설정을 기본값으로 복구한다.
6. 앱 창 캡처가 가능하면 `out/manual/w30-settings.png`에 저장한다. 창이 가려져 결과가 흰 화면이면 그 사실을 기록한다.
7. 모든 변경을 W30 브랜치에 커밋하고 `pnpm verify`를 실행한다. push, Jira, 위키는 실행하지 않는다.

## 증명

- `pnpm test -- tests/core/script-prompt.test.ts tests/server/script-prompt.test.ts`가 프롬프트 조립과 엔진 API 규칙을 확인한다.
- 수동 엔진 API 호출이 저장·길이 제한·빈 값 복원을 확인한다.
- `pnpm verify`가 종료 코드 0이고 마지막 줄이 `✓ verify passed`인지 확인한다.
- UI의 Settings 화면에서 저장 버튼은 미저장 변경이 있을 때만 활성화되고, 기본값 복원은 현재 기본값일 때 비활성화된다.

## 위험과 되돌리기

- 기존 `prompt` 필드 요청의 의미를 유지해 호출자를 호환한다.
- 기본 지시문 변경은 프롬프트만 바꾸며, 형식 규칙과 검증은 고정한다.
- 문제 발생 시 W30 구현 커밋을 revert한다. 테스트 커밋과 계획 커밋은 별도로 유지할 수 있다.

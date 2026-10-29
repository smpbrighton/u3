# 056 구현 검증

## 실패 테스트
- 구현 전 대상 테스트 9개 파일을 실행했다. 종료 코드는 1이다.
- 출력: `Test Files 8 failed | 1 passed (9)`, `Tests 39 failed | 77 passed (116)`.
- 다섯 입력란의 「마지막 입력 1초 뒤 한 번 저장한다」가 모두 실패했다. 기대한 PUT 1회에 대해 실제 호출은 0회다.
- 다섯 입력란의 「입력 뒤 해제하면 남은 값을 즉시 저장한다」가 모두 실패했다. 기대한 PUT 1회에 대해 실제 호출은 0회다.
- 말투·성격 기본값 상태, revision 2, 4000자 검증, 원격 기본 말투·성격의 대본 반영, 공개 판단 테스트도 실패했다.
- 전체 원본 출력은 작업 폴더의 `node_modules/.cache/056/red.log`에 기록했다.

## 기존 단언 변경
- `script-prompt` core·서버: 새 첫 문장과 규칙 1·9를 확인한다. 기존 금지 패턴 단언은 유지했다.
- `default-prompts` core: 해시·bundled 객체의 본문을 세 개에서 다섯 개로 늘렸다.
- `script-voice` 서버: 문자열 응답을 PromptState 응답으로 바꿨다. 저장 객체는 빈 키 삭제와 기준 hash 추가를 확인한다. 옛 검수·화자 보존 단언은 유지했다.
- 자동 저장 UI: 말투 초기화 요청을 `{ tone: "", persona: "" }`에서 `{ tone: "" }`로 바꿨다. 두 호출과 마지막 요청 검증은 유지했다.
- 캐러셀 서버 테스트 세 파일에는 새 필수 필드용 bundled fixture만 추가했다. 단언은 바꾸지 않았다.

## 구현 후 검증
- core·서버·공개 판단: 7개 파일, 72개 테스트 통과.
- 설정 UI: 2개 파일, 44개 테스트 통과. 가짜 타이머로 다섯 입력란의 지연 저장·blur 저장·해제 저장·늦은 응답 보호를 확인했다.
- tsx 상수 비교 출력:

```text
DEFAULT_SCRIPT_PROMPT === JSON: true (length 1916)
DEFAULT_SCRIPT_TONE === JSON: true (length 426)
DEFAULT_SCRIPT_PERSONA === JSON: true (length 169)
```

- `PROMPT_SCHEMA = 1`, `PROMPT_REVISION = 2`.
- 다섯 본문 배열을 JSON.stringify한 SHA-256: `9fd6f5724e4990178c03574e4b7a4ade5b1d528bd3d1c0ca3fc92f972b9c219d`.
- `pnpm verify` 종료 코드 0. `Test Files 170 passed | 2 skipped (172)`, `Tests 994 passed | 11 skipped (1005)`.
- Rust 테스트 11개 통과. smoke 출력은 `✓ smoke passed: 1080×1920, 30fps, 138 frames`로 시작했다.
- verify 마지막 줄: `✓ verify passed`.
- 전체 verify 출력은 `node_modules/.cache/056/verify.log`에 기록했다.
- 캐러셀 본문 파일에는 diff가 없다.
- 실패 테스트 커밋 뒤 테스트 변경은 대본 생성 helper의 `Record<string, string | undefined>` 타입 보완뿐이다. 단언은 바꾸지 않았다.
- plan과 최종 diff를 대조했다. 제품 변경은 plan의 core·서버·Settings·공개 판단 범위에 한정했다.

## 계획 밖 확인 항목·미검증
- 계획 밖 제품 변경은 없다.
- 공개 스크립트의 `readRemote`는 현재 `PromptDefaultsFile`로 검증한다. 말투·성격이 없는 revision 1 원격 파일이면 이 검증에서 실패한다. 로컬 parse 결과는 `false`다. plan은 `decidePublish` 변경만 지정하므로 이 경로는 수정하지 않았다. 감독자가 공개 전에 확인해야 한다.
- 실제 원격 자산의 현재 내용은 조회하지 않았다. 공개 스크립트와 gh release 쓰기, push를 실행하지 않았다.
- Windows native·설치본 UI·앱 릴리스는 검증하지 않았다. 이번 verify는 Mac 검증이다.

## 바꾼 파일
- `architecture/changes/056-voice-default-prompts/validation.md`
- `scripts/publish-prompts.ts`
- `src/core/default-prompts.ts`
- `src/core/script-prompt.ts`
- `src/engine/prompt-settings.ts`
- `src/engine/routes/script.ts`
- `src/engine/routes/system.ts`
- `src/ui/screens/Settings.tsx`
- `tests/core/default-prompts.test.ts`
- `tests/core/script-prompt.test.ts`
- `tests/engine/prompt-defaults.test.ts`
- `tests/scripts/publish-prompts.test.ts`
- `tests/server/carousel-derived.test.ts`
- `tests/server/carousel-prompts.test.ts`
- `tests/server/carousels.test.ts`
- `tests/server/script-prompt.test.ts`
- `tests/server/script-style.test.ts`
- `tests/server/script-voice.test.ts`
- `tests/ui/settings-autosave.test.tsx`

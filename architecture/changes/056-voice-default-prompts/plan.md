# Plan: voice-default-prompts (lite)
Track: lite.

## 결정
- 사용자 지시: 「지금 수정된 버전의 프롬프트를 업데이트해줘 — 대본프롬프트, 말투, 성격, 이미지 생성에 들어가는 캐러셀 프롬프트 두건」.
- 캐러셀 수정본 위치를 물었고 답은 「/Users/smp/Library/Application Support/U3/settings.json 여기에 저장했다는데」. 그 파일에 캐러셀 키가 없어 검토 목록 3·4 로 다룬다.
- 0034 를 0035 로 대체한다. 대체 사유: 원격 기본값 대상에 말투·성격을 더하고 빈 값의 뜻이 「없음」에서 「기본값」으로 바뀐다.

## 대조
- 0034(대체됨) → 0035. 0033 릴리스 흐름: 0.3.8 은 `release.sh` draft → Actions Windows 공개로 간다. 진행 중인 변경 없음(049 병합 끝).


## 검토 목록
1. **말투·성격에 기본값이 생긴다. 「말투 없음」은 더 이상 표현할 수 없다.** 지금은 빈 값이 「말투 없음」이다. 바뀐 뒤에는 빈 값이 「기본값 사용」이다. 추천: 이대로 간다. 이유: 대본·캐러셀 프롬프트와 같은 규칙(빈 값 = 기본값)이라 화면과 서버 규칙이 하나다. 말투를 끄고 싶은 사용자는 아직 없다.
2. **0034 를 대체하는 새 결정을 쓴다.** 원격 기본값 대상에 말투·성격을 더한다. 추천: 대체. 이유: 0034 의 범위 문장이 「대본·캐러셀 기획 기본 프롬프트」로 고정되어 있다.
3. **캐러셀 두 프롬프트는 이번에 바꾸지 않는다.** 설치본 `settings.json`(10:34 저장)에는 `carouselTopicPrompt`·`carouselVideoPrompt` 키가 없다. 바탕화면 문서도 지금 기본값과 같다. 사용자가 구현 전에 본문을 다시 저장하거나 채팅에 붙이면 같은 커밋에 넣는다. 아니면 다음 revision 으로 원격만 갱신한다(앱 릴리스 불필요).
4. **고친 본문이 저장되지 않는 경우를 막는다.** 저장이 blur 에만 의존한다. 원인은 확인하지 못했다(추정: 입력란 포커스를 잃지 않은 채 화면을 떠나거나 앱을 닫음). 추천: 다섯 입력란 모두 입력 1초 뒤 자동 저장하고, 화면을 떠날 때 남은 저장을 보낸다. 이유: 원인과 관계없이 잃는 범위를 1초로 줄인다.

## Context
사용자가 설치본에서 대본 프롬프트·말투·성격을 고쳤고, 그 본문을 모든 사용자의 기본값으로 쓰기를 원한다(「지금 수정된 버전의 프롬프트를 업데이트해줘 — 대본프롬프트, 말투, 성격, 캐러셀 프롬프트 두건」). 대본은 055 구조로 원격 갱신이 되지만, 말투·성격은 기본값이 없는 단순 설정이다. 캐러셀 두 건은 저장된 수정본이 없다.

## 바꿀 파일
- `src/core/script-prompt.ts`: `DEFAULT_SCRIPT_PROMPT` = 설치본 `scriptPrompt`(1916자). 새 상수 `DEFAULT_SCRIPT_TONE`(426자)·`DEFAULT_SCRIPT_PERSONA`(169자) = 설치본 `scriptTone`·`scriptPersona`. 본문은 settings.json 에서 스크립트로 옮겨 글자 단위로 같게 한다.
- `src/core/default-prompts.ts`: `PromptDefaultsFile` 에 `tone`·`persona`(trim min 1, max 4000) 추가. `PROMPT_REVISION = 2`. `PROMPT_TEXT_HASH` 는 다섯 본문 배열의 sha256. schema 는 1 유지(0.3.7 의 zod object 는 모르는 키를 버리므로 revision 2 파일을 그대로 읽는다. 0.3.8 은 revision 1 파일·캐시를 읽지 못하고 bundled revision 2 를 쓴다).
- `src/engine/prompt-settings.ts`: `PROMPT_SETTINGS` 에 `{ kind: "tone", key: "scriptTone", baseKey: "scriptToneBaseHash", field: "tone" }`, `persona` 동일. 기존 `promptState`·`applyPrompt` 재사용.
- `src/engine/routes/system.ts`: `GET/PUT /api/system/script-voice` 를 `carousel-prompts` 와 같은 모양으로 바꾼다. 응답 `{ tone: PromptState, persona: PromptState }`, PUT 은 `{ tone?, persona? }`(max 4000).
- `src/engine/routes/script.ts:59`: `voice` 를 `promptState(settings, defaults, "tone").prompt` 등으로 만든다(`context.promptDefaults()`).
- `src/ui/screens/Settings.tsx`: 말투·성격을 캐러셀 프롬프트와 같은 `PromptState` 흐름으로 바꾼다(「기본값으로」 = 빈 본문 PUT, 「새 기본값이 있어요」). 다섯 입력란에 자동 저장: 마지막 입력 1초 뒤 저장, blur 는 즉시 저장, 컴포넌트 해제 때 남은 저장 실행. 기존 `saved` 비교로 바뀌지 않은 본문은 보내지 않는다.
- `scripts/publish-prompts.ts`: `decidePublish` 의 본문 비교에 `tone`·`persona` 추가.
- 결정: `architecture/decisions/<예약 번호>-remote-default-prompts-voice.md`(0034 대체), 0034 Status `superseded-by`, `architecture/INTENT.md` 목록 한 줄 교체.
- 테스트:
  - `tests/core/script-prompt.test.ts`: 새 첫 줄·규칙 1·9 로 기대값 교체, 말투·성격 상수 첫 문장.
  - `tests/core/default-prompts.test.ts`: 해시 다섯 본문, tone 4001자·빈 값 거부.
  - `tests/engine/prompt-defaults.test.ts`: revision 1 파일(말투 없음)은 무시하고 bundled.
  - `tests/server/script-voice.test.ts`: 기존 기대값을 새 응답 모양으로 바꾸고, 미수정 = 기본값, 수정 = 유지·`newerDefault`, 빈 본문 = 키 삭제.
  - 대본 생성 서버 테스트: codex 프롬프트에 기본 말투·성격이 들어간다.
  - `tests/ui/settings-autosave.test.tsx`: 입력 뒤 1초 = PUT 1회, 입력 뒤 해제 = PUT, 바뀌지 않은 blur = 요청 없음, 말투 「기본값으로」 = 빈 본문 PUT.
  - `tests/scripts/publish-prompts.test.ts`: tone 만 다르면 revision 확인 실패.

## 순서
1. 결정 번호 예약, plan.md·결정 파일·INTENT 커밋(워크트리 `../u3-056-voice-default-prompts`, main `9860d70` 기준이 아니면 main 위로 맞춤).
2. 실패 테스트 커밋(자동 저장 해제 테스트가 현재 코드에서 실패하는지 기록).
3. core·engine·route 구현 → 커밋.
4. Settings.tsx 구현 → `pnpm verify` → 커밋.
5. 세션: diff 대조 → `worktree.sh finish` → wiki ingest(049·056) → push.
6. `scripts/publish-prompts.sh` 로 revision 2 공개(0.3.7 사용자는 바로 새 대본 본문을 받는다).
7. 사용자: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret 등록 → `scripts/release.sh 0.3.8`(Mac draft) → Actions Windows 빌드·공개 → 설치본 0.3.8 설치.

## 리스크
- 가장 위험한 단계는 4(자동 저장)다. 입력 중 응답이 늦게 오면 입력란을 덮어쓸 수 있다. 기존 `ref.current === value` 비교를 유지해 늦은 응답이 새 입력을 덮지 않게 한다.
- 6을 7보다 먼저 하면 0.3.7 사용자는 말투·성격 없이 새 대본 본문만 받는다. 본문이 서로 독립이라 동작은 문제없다.
- 택하지 않은 대안: 말투·성격을 원격 밖 앱 상수로만 두기(다음 수정 때 앱 릴리스 필요), schema 2(0.3.7 이 새 본문을 받지 못함).

## 증명
1. 2단계 실패 출력, `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 상수 세 개가 설치본 settings.json 값과 같음(스크립트 비교 출력 `true`).
3. `✓ prompts published: schema 1 revision 2`, `curl -fsSL <주소> | jq '.revision, (.tone|length)'` = 2, 426.
4. 설치본 0.3.8: 설정의 말투·성격·대본이 새 본문이고 「기본값으로」가 비활성(본문 = 기본값). Windows 설치는 사용자가 Release 페이지에서 받아 확인.

## 롤백
커밋 되돌리기. 0.3.7 은 새 키(`scriptToneBaseHash` 등)를 무시한다. 원격 본문이 잘못되면 더 큰 revision 으로 다시 올린다.

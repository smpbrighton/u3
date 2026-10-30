# Plan: global-caption-guide (lite)
Track: lite.
<!-- lite 트랙: intent·spec·critic 없이 plan mode 의 승인으로 진행한다. 앞 단계 신호가 생기면 멈추고 새 slug 로 /smp:intent 를 시작한다. -->

plan mode 산출물. 승인 후 커밋한다. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다. PR 리뷰는 diff를 이 파일과 대조한다.

## 배경
원격 기본 프롬프트(`prompts` prerelease 의 `prompts-schema-1.json`, 현재 revision 3)는 이미 있다. 이 구조에는 제한이 두 개 있다.
1. 사용자가 고친 대본·말투·성격 설정이 있으면 그 설정이 원격 기본값보다 우선한다(결정 0035). 그래서 원격 기본값을 바꿔도 그 사용자에게는 적용되지 않는다.
2. 앱은 원격 파일의 다섯 항목만 읽는다. 새 항목을 넣어도 무시한다(`PromptDefaultsFile`, `src/core/default-prompts.ts`).

기대 결과: 사용자의 대본·말투·성격 설정을 바꾸지 않고, 「전역 자막 지침」을 모든 사용자의 대본 생성 프롬프트에 합친다. 이후 지침 내용은 원격 파일만 갱신해서 바꾼다.

## 결정
- 사용자 지시 원문: "/Users/smp/Downloads/전역_자막_지침.md 이 프롬프트도 추가해 … 전역 항목을 읽고 프롬프트에 합치는 기능을 앱에 한 번 추가해야 해 … 이것도 수정해서 빌드하고 완료되면 윈도우에 재설치까지 진행해 가능하다면." 구현은 앞 변경과 같이 Orca 의 codex 작업자에게 맡긴다.
- 원격 파일에 `captionGuide` 항목을 추가한다. schema 번호는 1 로 둔다. 1.0.1 이하 앱의 zod 객체는 모르는 항목을 버리므로 새 파일을 그대로 읽는다.
- `captionGuide` 는 `z.string().trim().max(20_000).default("")` 로 읽는다. revision 3 이하 캐시도 파싱 에러 없이 읽힌다.
- 전역 지침은 사용자 설정이 아니다. 설정 화면에 입력란을 두지 않고 저장 키도 없다. 사용자가 고친 대본·말투·성격과 관계없이 항상 합친다. 0035 의 "고친 프롬프트는 유지" 규칙은 그대로다.
- 합치는 위치: `buildScriptPrompt` 에서 기본 프롬프트·사용자 요청·말투·성격 뒤, 형식 규칙(`formatRules`) 앞에 `전역 자막 지침:\n<본문>` 으로 넣는다. 빈 값이면 넣지 않는다. 재생성(retry) 프롬프트는 같은 prompt 를 이어 쓰므로 함께 적용된다.
- 적용 범위는 영상 대본 생성뿐이다. 캐러셀 기획 프롬프트에는 넣지 않는다.
- 지침 본문은 파일의 제목 줄(`# 전역 자막 지침`)을 뺀 나머지 전체다(참고 URL 포함). 앱 코드 상수 `DEFAULT_CAPTION_GUIDE`(`src/core/script-prompt.ts`)가 정본이다.
- `PROMPT_REVISION` 을 4 로 올리고 `PROMPT_TEXT_HASH` 를 갱신한다. 병합 뒤 `scripts/publish-prompts.sh` 로 revision 4 를 올린다.
- 결정 0035 를 새 결정 0037 이 대체한다(0035 내용 + 전역 자막 지침). 0035 Status 는 `superseded-by: 0037`. INTENT.md 「기본 프롬프트」 줄을 고친다.
- 대본 검사 충돌: `checkScriptStyle`(`src/core/script-style.ts`)는 말줄임표(`...`, `…`)와 초성을 금지해 재생성을 일으킨다. 지침과 기존 기본 프롬프트(`DEFAULT_SCRIPT_PROMPT` 3항, `DEFAULT_SCRIPT_TONE`)는 둘을 허용한다. 사용자 답: "검사를 지침에 맞춤". 말줄임표·초성 금지를 빼고 `?!`·`!!` 금지와 이모지 2개 한도는 남긴다.
- 빌드·재설치: 061(Windows 엔진 경로 수정)과 함께 한 번에 빌드한다. 062 브랜치를 061 브랜치 위에 올리고(`depends_on: 061`) 그 PR 의 Windows 빌드 설치본을 Windows PC 에 설치해 둘 다 확인한다.

## 대조
- 0035 를 대체한다(위 결정). 뒤집는 부분은 없고 항목 하나를 더한다.
- 진행 중인 변경 061-windows-engine-verbatim-path 와 파일이 겹치지 않는다(061 은 `src-tauri/src/main.rs` 만). 빌드 확인을 위해 061 위에 쌓는다.

## 바꿀 파일
- `src/core/script-prompt.ts`: `DEFAULT_CAPTION_GUIDE` 상수 추가, `buildScriptPrompt` 에 `captionGuide?: string` 인자 추가.
- `src/core/default-prompts.ts`: `captionGuide` 스키마·bundled 값, `PROMPT_REVISION` 4, `PROMPT_TEXT_HASH` 갱신.
- `src/engine/routes/script.ts`: `buildScriptPrompt` 호출에 `defaults.captionGuide` 전달.
- `src/core/script-style.ts`: 말줄임표·초성 경고 제거. `tests/core/script-style.test.ts` 기대값 수정.
- `scripts/publish-prompts.ts`: `decidePublish` 의 본문 비교에 `captionGuide` 추가, `RemotePromptFile` 에서 없어도 읽기.
- `tests/core/default-prompts.test.ts`, `tests/core/script-prompt*.test.ts`(있는 파일), publish-prompts 시험: 아래 증명 시험.
- `architecture/decisions/0037-remote-prompts-caption-guide.md` (new), `architecture/decisions/0035-remote-default-prompts-voice.md`(Status), `architecture/INTENT.md`(기본 프롬프트 줄).
- `architecture/changes/062-global-caption-guide/plan.md` (new): 이 계획.

## 순서
1. 062 브랜치를 061 브랜치 위로 rebase 한다. `ledger.sh set global-caption-guide depends_on windows-engine-verbatim-path`. plan.md 와 결정 0037·0035·INTENT 수정을 한 커밋으로 넣는다.
2. codex 작업자(Orca, 062 워크트리)가 실패하는 시험을 먼저 쓰고 커밋한다.
   - `buildScriptPrompt` 에 `captionGuide` 를 주면 결과에 `전역 자막 지침:` 과 본문이 말투·성격 뒤, 형식 규칙 앞에 있다. 빈 값이면 없다.
   - 사용자가 고친 대본·말투·성격이 있어도 대본 추천 라우트의 프롬프트에 전역 지침이 들어간다(기존 라우트 시험 방식이 있으면 그것을 쓴다).
   - `PromptDefaultsFile` 이 `captionGuide` 없는 revision 3 파일을 `captionGuide: ""` 로 읽는다. 20000자 초과는 거부한다.
   - bundled 값·revision 4·hash 시험을 새 기대값으로 고친다.
   - `decidePublish` 는 `captionGuide` 만 다를 때 revision 을 올리라고 요구한다.
   - `checkScriptStyle` 은 `…`, `...`, `ㅋㅋ`, `ㄹㅇ` 에 경고를 내지 않고, `?!`·`!!`·이모지 3개에는 계속 경고를 낸다.
3. codex 작업자가 시험을 바꾸지 않고 구현해 커밋한다.
4. 이 세션이 diff 를 이 plan 과 대조하고 `pnpm verify` 를 실행한다.
5. 062 브랜치를 push 하고 draft PR 을 연다(061 커밋 포함). Windows 빌드 설치본을 192.168.219.116 에 설치한다. 사용자 세션에서 u3.exe 를 띄워 엔진 시작(061)을 확인한다.
6. 061 `worktree.sh finish`, 그다음 062 `worktree.sh finish` 로 병합한다. PR #3 과 062 PR 은 병합으로 닫힌다.
7. main 에서 `scripts/publish-prompts.sh` 로 revision 4 를 올린다.
8. `scripts/release.sh 1.0.2` 로 릴리스한다. 공개되면 Windows 에 1.0.2 를 다시 설치해 정식 설치본으로 둔다.
9. `/smp:wiki ingest` 를 main 에서 한다.

## 리스크
- 원격 revision 4 가 공개되면 1.0.1 사용자도 받는다. 1.0.1 은 `captionGuide` 를 버리고 나머지 다섯 항목은 revision 3 과 같으므로 동작이 바뀌지 않는다.
- 1.0.2 가 받는 원격이 revision 3 인 동안(단계 7 전)에는 앱 내장 revision 4 를 쓰므로 지침이 적용된다.
- 지침이 프롬프트를 길게 만든다(약 1,300자). 프롬프트 한도와 충돌하지 않는다(대본 20,000자 한도는 사용자 입력에만 적용).
- 초성 금지를 빼면 TTS 가 `ㅋㅋ` 같은 초성을 그대로 읽을 수 있다. 사용자가 이 동작을 받아들였다(위 결정).
- 검사 규칙이 코드에 있으므로, 이후 지침을 원격으로 바꿔 새 표기를 금지·허용해도 코드 검사는 따라가지 않는다.
- 가장 위험한 단계는 8 이다. 공개 자동 업데이트로 나간다. 그래서 단계 5 의 Windows 확인 뒤에만 한다.
- 택하지 않은 대안: 기존 대본 기본값에 지침을 넣는 것. 대본을 고친 사용자에게 적용되지 않는다.

## 증명
- 단계 2: `pnpm exec vitest run <새 시험 파일>` 이 새 시험에서 실패한다(종료 코드 ≠ 0).
- 단계 3·4: 같은 시험이 통과하고 `pnpm verify` 마지막 줄이 `✓ verify passed` 다.
- 단계 5: Windows 사용자 세션에서 PR 설치본을 실행했을 때 엔진 stderr 에 `엔진이 PORT 응답을 보내지 않았습니다` 가 없고 `engine.log` 에 새 시작 줄이 생긴다.
- 단계 7: `✓ prompts published: schema 1 revision 4`. 원격 파일을 받아 `captionGuide` 가 있는지 확인한다.
- 단계 8: `✓ release drafted: v1.0.2`, Actions 공개 성공, Windows 에 1.0.2 설치 후 엔진 시작 확인.
- Windows 에서 실제 대본 생성(codex 로그인 필요)은 확인하지 않는다. 프롬프트 합치기는 시험으로 증명한다.

## 롤백
- 지침 내용만 문제면 `DEFAULT_CAPTION_GUIDE` 를 고치고 revision 을 올려 다시 publish 한다. 빈 문자열로 올리면 지침을 끈다.
- 코드 문제면 커밋을 되돌리고 다음 릴리스를 낸다. 데이터 형식은 바뀌지 않는다(설정 키 추가 없음).

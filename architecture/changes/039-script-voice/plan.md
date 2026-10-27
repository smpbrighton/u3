# Plan: script-voice (lite)
Track: lite.

## 결정
- 사용자 지시: "위 이론에 따르면 지금 설정된 대본 프롬프트는 잘못된거 같은데 ~더라 라는말을 너무많이해. SNS 말투같지도 않고. 이모지도 안쓰고."
- 사용자 지시: "자막 검수가 아예 없어져도 되지않을까?" → 추천(검수 단계 삭제, 코드 검사와 한 번 재생성으로 대체)에 "좋아 추천대로 진행".
- 사용자 답: "이모지는 읽지않는걸로 이모지 허용할게."
- 세션이 정한 것: 초성 말("ㅋㅋ", "ㄹㅇ")은 지금처럼 금지한다. 사용자 지시는 이모지만 허용했다.
- 세션이 정한 것: 이모지는 대본 전체에서 2개까지, 문장 끝 부호 뒤에만 둔다.
- 세션이 정한 것: "~더라"·"~라더라"는 합쳐서 대본 전체에서 1번까지만 쓴다.

## 대조
- 결정: 대본 프롬프트·자막 검수를 정한 accepted 결정은 없다(`architecture/decisions/` 에서 "검수"·"scriptReview" 검색 결과 없음).
- 진행 중인 변경: 038-auto-update(impl). 장부에 파일 목록이 없다. 커밋 때 `ledger.sh set script-voice files` 로 겹침을 확인한다.
- 앞선 변경 034-script-voice-prompts·031-script-prompt-setting 이 만든 검수 단계와 설정 필드를 이 변경이 지운다.

## 바꿀 파일
- `src/core/script-prompt.ts`: 기본 프롬프트에서 "~더라" 예시를 줄이고 말끝 예시를 섞는다. "~더라" 1회 규칙과 이모지 허용 규칙을 넣는다. 이모지가 들어간 예시 대본 한 개를 더한다.
- `src/core/script-style.ts` (new): `checkScriptStyle(script)` 가 위반 목록(문자열 배열)을 돌려준다.
- `src/core/script-review.ts`: 지운다.
- `src/engine/routes/script.ts`: 검수 호출을 지운다. 초안을 `checkScriptStyle` 로 검사하고, 위반이 있으면 위반 목록을 붙여 한 번만 다시 생성한다. 응답의 `reviewResult`·`reviewWarning` 을 `styleWarnings` 로 바꾼다.
- `src/engine/routes/system.ts`: `/api/system/script-voice` 의 GET·PUT 에서 `review` 를 지운다. 저장 파일의 옛 `scriptReview` 값은 읽지 않고 그대로 둔다.
- `src/ui/screens/Settings.tsx`: "자막 검수" 입력란과 `review` 필드를 지운다.
- `src/ui/styles.css`: `.script-voice-field-review` 규칙이 있으면 지운다.
- `src/ui/screens/Script.tsx`: `styleWarnings` 를 기존 경고 줄(`transcriptWarning`)에 함께 보인다.
- `tests/core/script-style.test.ts` (new): 검사 규칙 테스트.
- `tests/core/script-review.test.ts`: 지운다.
- `tests/core/caption-w38.test.ts`: 검수 채택 테스트를 지운다.
- `tests/core/script-prompt-transfer.test.ts`: 검수 프롬프트 단언을 지운다. "~더라" 횟수 상한과 이모지 규칙 단언을 더한다.
- `tests/server/script-voice.test.ts`: `review` 필드 테스트를 지운다. 옛 `scriptReview` 값이 저장 파일에 보존되는지 단언한다.
- `tests/server/script-*.test.ts` 또는 새 서버 테스트: 위반 초안이면 codex 를 두 번, 깨끗한 초안이면 한 번 부르는지 단언한다.

## 검사 규칙(`checkScriptStyle`)
caption 을 문장으로 나눈다(".", "?", "!" 기준, 뒤의 이모지는 앞 문장에 붙인다). 아래를 위반 하나당 한 줄로 돌려준다.
1. 이모지(`\p{Extended_Pictographic}`)가 대본 전체에서 2개를 넘는다.
2. 이모지가 문장 끝 부호 뒤가 아닌 곳에 있다.
3. 말끝이 "더라"·"라더라"인 문장이 2개 이상이다.
4. 같은 말끝이 3번 이상이거나 두 문장 연속이다. 말끝은 끝 부호·이모지를 뺀 마지막 두 음절이다. "지"로 끝나는 말끝은 하나로 센다.
5. 마지막 문장을 뺀 "?"가 2개를 넘는다. "!"가 1개를 넘는다. "?!", "!!", "...", "…"가 있다.
6. 문장이 "요"·"니다"로 끝난다. 또는 "음"·"함"·"임"·"됨"으로 끝난다.
7. 끝 부호가 없는 문장이 있다.
8. "ㅋ"·"ㅎ"·"ㄹㅇ" 같은 초성 말이 있다.
9. 마지막 장면에 "댓글"·"구독"·"링크"·"프로필"이 있다.

## 순서
1. `tests/core/script-style.test.ts` 를 쓴다. 규칙마다 위반 예와 통과 예를 둔다.
2. `src/core/script-style.ts` 를 구현한다.
3. `src/core/script-prompt.ts` 기본 프롬프트를 고친다. 길이는 20,000자 안이다(현재 8,886자).
4. `src/engine/routes/script.ts` 에서 검수 단계를 검사·재생성으로 바꾼다. 재생성 프롬프트는 원래 프롬프트 뒤에 "## 이전 초안에서 고칠 것" 절(위반 목록)을 붙인다. 두 번째 결과도 위반이면 위반이 적은 쪽을 쓰고 남은 위반을 `styleWarnings` 로 돌려준다.
5. `src/core/script-review.ts` 와 그 테스트를 지운다. 참조를 정리한다.
6. `system.ts`·`Settings.tsx`·`styles.css` 에서 검수 설정을 지운다.
7. `Script.tsx` 에 `styleWarnings` 를 보인다.
8. 테스트를 고치고 `pnpm verify` 를 실행한다.
9. 이모지 렌더링을 확인한다(증명 3).

## 리스크
- 가장 위험한 단계: 이모지 렌더링. 자막 폭 측정(`src/core/measure.ts`, opentype)은 한글 폰트만 싣는다. 폰트에 없는 이모지는 대체 글리프 폭으로 측정된다. 내보내기는 Remotion(Chromium)이 시스템 이모지 폰트로 그린다. 측정 폭과 그린 폭이 다르면 줄바꿈이 어긋난다. 증명 3에서 확인하고, 어긋나면 측정에서 이모지 폭을 글자 크기 1em 으로 계산한다.
- 녹음 뒤 받아 적기(whisper)로 자막을 다시 만들면 이모지는 사라진다. 이 경로가 대본 caption 을 덮어쓰는지는 확인하지 않았다. 구현 때 확인하고 결과를 이 절에 적는다.
- 재생성이 생기면 그 대본은 codex 를 두 번 부른다. 검수가 매번 두 번 부르던 지금보다 평균 호출 수는 줄어든다.
- 말끝 판정(마지막 두 음절)은 규칙 기반이라 오탐이 있다. 오탐은 재생성 한 번과 경고 표시로 끝나고 대본 생성은 막지 않는다.
- 택하지 않은 대안: 검수 프롬프트를 짧게 줄여 남기기. 같은 모델이 같은 규칙을 다시 보는 구조라 효과가 작고 호출이 늘어서 택하지 않았다.
- 택하지 않은 대안: 프롬프트 전면 재작성(규칙 대폭 삭제·예시 30개 이상). 효과 측정 수단이 없어 이번에는 말끝·이모지 규칙과 예시 한 개로 한정했다.

## 증명
1. `pnpm verify` 가 종료 코드 0 이고 마지막 줄이 `✓ verify passed` 다.
2. `tests/core/script-style.test.ts` 가 규칙 1~9 의 위반 예를 모두 잡고 통과 예는 빈 배열을 돌려준다.
3. 이모지 렌더링: 이모지 두 개가 든 대본으로 프로젝트를 만들고 mp4 를 내보낸다. 내보낸 영상의 해당 프레임 스크린샷에서 이모지가 그려지고 줄이 화면 밖으로 넘치지 않는지 본다. 증거 경로를 기록한다.
4. 실제 대본 생성 한 번: 앱에서 대본 추천을 실행한다. 결과의 "~더라" 횟수, 이모지 수, codex 호출 수(1 또는 2)를 기록한다.
5. 설정 화면에 "자막 검수" 입력란이 없는 것을 스크린샷으로 확인한다.

## 롤백
- 옛 설정 파일의 `scriptReview` 값은 지우지 않는다. 이 커밋을 되돌리면 검수 단계와 설정이 저장된 값과 함께 돌아온다.
- 사용자가 설정에서 대본 프롬프트를 직접 저장해 두었다면 새 기본값이 적용되지 않는다. 이 경우 설정의 "기본값으로 되돌리기"로 새 기본값을 받는다. 데이터 마이그레이션은 없다.

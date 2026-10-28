# Plan: script-prompt-captions
Track: lite.

## Context
사용자가 `/Users/smp/Desktop/프롬프트.md` 의 「교체용 프롬프트」로 기본 대본 프롬프트를 바꾸고 배포하라고 지시했다. 지금 `src/core/script-prompt.ts` 의 `DEFAULT_SCRIPT_PROMPT` 는 쇼츠 썰 대본 작가 지침(프레임 7개·예시 대본·언어집·문장부호·AI 티 줄이기·형식)이다. 새 프롬프트는 장면별 짧은 화면 자막 14개 규칙이다. `src/core/script-style.ts` 의 검사기는 옛 프롬프트의 규칙(문장 끝 부호 필수, 반말·음슴체 금지, 말끝 반복 제한, 물음표·느낌표 개수, 마지막 장면 안내 금지)을 검사하고 `routes/script.ts` 가 위반이 있으면 한 번 재생성한다. 새 프롬프트는 부호 없는 짧은 구절과 사용자 지정 말투를 허용하므로, 옛 검사기를 두면 생성마다 경고와 재생성이 난다.

## 결정
- 사용자 지시 원문: "/Users/smp/Desktop/프롬프트.md 대본 프롬프트는 이걸로 교체해서 배포해".
- `DEFAULT_SCRIPT_PROMPT` 를 문서의 코드 블록 본문으로 바꾼다. 문서의 예시·삭제 목록·주의점은 프롬프트에 넣지 않는다.
- 검사기는 새 프롬프트와 충돌하는 규칙을 뺀다(세션 판단, 문서 3절이 다음 조치로 남긴 항목): 문장 끝 부호 필수, 금지 말투(요·니다·음·함·임·됨), 말끝 반복·연속·더라 제한, 물음표·느낌표 개수, 이모지 위치(부호 뒤), 마지막 장면 댓글·구독·링크·프로필. 남기는 규칙: 이모지 2개 이하, 금지 문장부호(`?!`·`!!`·`...`·`…`), 초성 말. 재생성 흐름(`routes/script.ts`)은 그대로다.
- 사용자가 설정에 저장한 `scriptPrompt` 는 그대로 우선한다(기존 동작).

## 대조
결정 0024(codex 대본)·0028 유지. 진행 중 변경과 겹치는 파일 없음(049 는 이 파일들을 바꾸지 않는다).

## 바꿀 파일
- `src/core/script-prompt.ts`: `DEFAULT_SCRIPT_PROMPT` 본문 교체.
- `src/core/script-style.ts`: `checkScriptStyle` 을 세 규칙으로 줄인다. `EMOJI` export 유지(`tts-clips.ts` 가 쓴다).
- `tests/core/script-prompt.test.ts`: 기본 지침 단언을 새 프롬프트 기준으로.
- `tests/core/script-style.test.ts`: 뺀 규칙의 테스트 삭제, 남은 규칙 테스트 유지.
- `tests/server/script-style.test.ts`: 위반 fixture 를 초성·이모지 기준으로.

## 순서
1. 프롬프트·검사기·테스트 수정 → `pnpm verify` → 커밋.
2. `worktree.sh finish script-prompt-captions` → wiki ingest → push → `release.sh 0.3.4`(047 포함) → 설치.

## 리스크
- 가장 위험한 단계는 검사기 축소다. 옛 규칙을 기대하는 사용자 설정 프롬프트는 영향이 없다(검사기는 기본·사용자 프롬프트 모두에 같은 규칙을 적용했으므로, 축소는 경고가 줄어드는 방향이다). 택하지 않은 대안: 프롬프트만 교체 — 생성마다 끝 부호·말끝 경고와 재생성이 난다.

## 증명
1. `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 설치본에서 「대본 프롬프트」 기본값이 새 본문으로 보임(0.3.4).

## 롤백
커밋 되돌리기.

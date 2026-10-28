# Plan: 054 carousel-prompts (lite)
Track: lite. 승인되면 `u3-054-carousel-prompts/architecture/changes/054-carousel-prompts/plan.md` 에 커밋한다. 구현은 codex 워커, diff 대조는 세션. main 병합 뒤 0.3.5 릴리스.

## Context
캐러셀 기획 지침은 코드에 직접 들어 있고 설정에 편집 항목이 없다. 「주제로」 기획은 `src/engine/routes/carousels.ts:227`, 「영상으로」 기획은 같은 파일 353행의 한 줄 프롬프트다. 영상의 「대본 프롬프트」와 말투·성격은 캐러셀에 적용되지 않는다. 사용자가 `/Users/smp/Desktop/캐러셀_프롬프트.md` 의 두 본문(「주제로」·「영상으로」)으로 바꾸고, 설정 「이미지 생성」 아래에 편집 항목을 두라고 지시했다. 「주제 다듬기」(203행)와 이미지 생성 지시문(`codex-image.ts`)은 문서에 없으므로 그대로 둔다.

기존 재사용 패턴: 대본 프롬프트는 `src/core/script-prompt.ts` 의 `DEFAULT_SCRIPT_PROMPT`·`SCRIPT_PROMPT_MAX_LENGTH`, 라우트 `GET/PUT /api/system/script-prompt`(`system.ts:218-236`, 빈 값·기본값이면 설정 키 삭제, `isDefault` 반환), 설정 UI 의 `changePrompt`/`savePrompt` + `SettingsGroup action=「기본값으로」` + `Textarea` + 글자 수 표시(`Settings.tsx:200-204, 317-319`).

## 결정
- 사용자 지시 원문: "캐러샐용 지침은 /Users/smp/Desktop/캐러셀_프롬프트.md 여기에있어 이걸로 바꿔서 이미지 설정아래에 항목 추가해줘".
- 기본 프롬프트 둘을 문서의 코드 블록 2·3 본문 그대로 `src/core/carousel-prompt.ts` 에 둔다. 동적 입력(장수·주제·화풍 / 자료 JSON)은 본문 뒤에 앱이 붙인다(문서 1절: 「요청 장수와 입력 자료를 함께 제공」).
- 설정 저장 위치는 엔진 settings.json 의 `carouselTopicPrompt`·`carouselVideoPrompt`(대본 프롬프트와 같은 규칙: 빈 값·기본값이면 키 삭제).
- 설정 화면: 「이미지 생성」 구역(`section === "imagegen"`) 의 기존 SettingsGroup 아래에 SettingsGroup 두 개 「캐러셀 기획 프롬프트 · 주제로」「캐러셀 기획 프롬프트 · 영상으로」를 둔다. 각각 Textarea(`h-28 text-xs`)·글자 수·「기본값으로」. 설명문 없음(043 화면 글 규칙).
- 「주제 다듬기」 프롬프트와 `codex-image.ts` 의 이미지 지시문은 바꾸지 않는다(문서 범위 밖).

## 대조
결정 0026·0027(캐러셀 범위·텍스트 객체) 유지. 049 워크트리(미병합)와 겹치는 파일: `Settings.tsx`(049 는 TTS capability 로 「음성」 구역 조건), `carousels.ts`(049 는 손대지 않음) → 049 가 나중에 rebase 한다. 053 과는 겹치지 않는다.

## 바꿀 파일
- `src/core/carousel-prompt.ts` (new): `CAROUSEL_PROMPT_MAX_LENGTH = 20_000`, `DEFAULT_CAROUSEL_TOPIC_PROMPT`, `DEFAULT_CAROUSEL_VIDEO_PROMPT`(문서 본문 그대로), `carouselTopicPrompt({ basePrompt, count, topic, style? })` → `${base}\n\n요청 장수: ${count}\n주제: ${topic}` + (`\n요청 화풍: ${style}`), `carouselVideoPrompt({ basePrompt, count, material })` → `${base}\n\n요청 장수: ${count}\n자료: ${JSON.stringify(material)}`, `resolveCarouselPrompt(saved: unknown, fallback)`(문자열이고 trim 이 비어 있지 않으면 그것, 아니면 기본).
- `src/engine/routes/system.ts`: `GET /api/system/carousel-prompts` → `{ topic: { prompt, isDefault }, video: { prompt, isDefault } }`. `PUT` body `{ topic?: string, video?: string }`(각 `max(CAROUSEL_PROMPT_MAX_LENGTH)`), 주어진 키만 갱신, 빈 값·기본값이면 설정 키 삭제, 응답은 GET 과 같은 형태. script-prompt 라우트 패턴 복사.
- `src/engine/routes/carousels.ts:227, 353`: settings 를 읽어 `resolveCarouselPrompt` 로 기본·저장 프롬프트를 고르고 `carouselTopicPrompt`/`carouselVideoPrompt` 로 조립. `carouselServices.plan`/`derivePlan` 경로는 그대로(derivePlan 은 이미 `prompt` 를 받는다).
- `src/ui/screens/Settings.tsx`: 상태 `carouselPrompts { topic, video }` + ref, 마운트 `Promise.allSettled` 에 `GET /api/system/carousel-prompts` 추가, `changeCarouselPrompt(kind, value)`/`saveCarouselPrompt(kind)`(`persist("carousel-prompts", …)`, 응답 반영은 `savePrompt` 와 같은 방식), 「이미지 생성」 구역에 SettingsGroup 두 개.
- 테스트: `tests/core/carousel-prompt.test.ts` (new: 기본 본문 첫 줄·10번 규칙 포함, 길이 제한 안, 조립 결과에 장수·주제·화풍·자료 포함, 화풍 없으면 줄 없음, resolve 규칙), `tests/server/carousel-prompts.test.ts` (new: script-prompt.test.ts 패턴 — GET 기본, PUT topic 만 저장·video 기본 유지, 빈 값·기본값 → 키 삭제·isDefault, 다른 설정 보존, 길이 초과 400), `tests/server/carousels.test.ts`·`carousel-derived.test.ts`: 저장된 프롬프트가 codex 호출 prompt 의 앞부분에 들어가고 장수·주제(또는 자료)가 뒤에 붙는지(가짜 runner/서비스로 prompt 캡처), `tests/ui/settings-layout.test.tsx`: imagegen 표식에 「캐러셀 기획 프롬프트」 추가, `tests/ui/settings-autosave.test.tsx` 패턴으로 `tests/ui/settings-carousel-prompts.test.tsx` (new: blur 저장·기본값으로·응답 반영).

## 순서
1. `carousel-prompt.ts` + core 테스트 → 커밋.
2. 서버 라우트·carousels.ts + 서버 테스트(실패 먼저: GET 404, 기획 프롬프트에 저장 본문 없음) → 커밋.
3. Settings UI + UI 테스트 → `pnpm verify` → 커밋.
4. `worktree.sh finish carousel-prompts` → wiki ingest → push → `release.sh 0.3.5` → 설치.

## 리스크
- 가장 위험한 단계는 2 다. 기획 결과 검증(`PlanSchema`, 장수 일치)은 그대로이므로 새 프롬프트가 장수를 어기면 기존 오류 「요청한 장 수와 맞지 않습니다」가 난다. 프롬프트 1번 규칙이 장수를 명시한다. 택하지 않은 대안: 프롬프트 하나로 두 모드 공용 — 문서가 둘을 분리했다.
- 설정 Textarea 가 「이미지 생성」 구역을 길게 만든다. 구역은 스크롤된다.

## 증명
1. 2단계 실패 출력, `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 설치본(0.3.5): 설정 → 이미지 생성 아래 두 프롬프트가 새 본문으로 보이고, 수정·「기본값으로」가 저장됨. 주제로 캐러셀 기획 1회 실행(사용자 또는 감독자).

## 롤백
커밋 되돌리기. settings.json 의 두 키는 구버전이 무시한다.

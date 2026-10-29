# Review: carousel-video-genimage
Author: claude-opus-5-5. Status: draft. Round: 1.

## 대조한 것
- 변경 문서: `architecture/changes/060-carousel-video-genimage/intent.md`, `architecture/changes/060-carousel-video-genimage/spec.md`, 초안 결정 `architecture/decisions/0036-scope-carousel-video-genimage.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`(accept 커밋 b2ffb22 의 변경분 포함)
- 결정: 유효한 `0026`·`0027`·`0024`·`0035`·`0032` 를 대조했다. 대체된 `0015`·`0018`·`0019`·`0034` 는 인용 확인용으로 읽었다.
- 위키: `architecture/wiki/index.md`, `pages/concept-carousel.md`, `pages/concept-remote-prompts.md`, `pages/concept-ui-shell.md`(캐러셀 프롬프트 절), `pages/concept-codex-compat.md`(캐러셀 언급)
- 진행 중인 변경: 장부의 059 `engine-request-log`(impl) `/Volumes/X31/workspace/smp_workspace/u3-059-engine-request-log/architecture/changes/059-engine-request-log/plan.md` 를 읽었다. intent·spec 은 없다(lite). 059 는 `src/engine/http.ts`·`app.ts`·`main.ts`·`routes/system.ts`·`src/ui/api.ts` 를 바꾼다. 060 이 바꿀 파일과 겹치지 않는다. 059 가 원인을 찾는 「이 시각으로 다시 뽑기」 Load failed 는 060 이 응답을 바꾸는 `POST …/frame` 이다. 059 는 그 라우트의 동작을 바꾸지 않으므로 충돌로 보지 않았다. 다른 장부 항목은 모두 done 이다.
- 코드: `src/core/carousel.ts`, `src/core/carousel-prompt.ts`, `src/core/default-prompts.ts`, `src/core/carousel-frame.ts`, `src/engine/routes/carousels.ts`, `src/engine/carousel-store.ts`, `src/engine/pipeline/codex-image.ts`, `src/engine/pipeline/carousel-frame.ts`, `src/engine/pipeline/jev-box.ts`, `src/engine/pipeline/codex.ts`·`codex-schema.ts`(output schema), `src/engine/pipeline/render.ts`(캐러셀 합성), `src/engine/prompt-settings.ts`, `src/remotion/CarouselSlide.tsx`, `src/ui/screens/carousel/BackgroundSection.tsx`·`CarouselEdit.tsx`·`workflow.ts`·`derived-ui-state.ts`, `tests/core/default-prompts.test.ts`

## 발견

### Important
1. **사용자가 고친 영상 기획 프롬프트에서는 `imagePrompt` 가 나오지 않아 AI 이미지 기본값이 「지시문 없음」으로 실패한다.** 0035 는 고친 프롬프트를 바꾸지 않고 새 기본값을 표시만 한다. spec 은 `imagePrompt` 규칙을 기본 프롬프트 본문(답 6)에만 넣는다. 설정에서 영상 프롬프트를 고친 사용자는 새 규칙을 받지 못한다. 그 본문이 이전 기본값에서 출발했으면 「새 배경 이미지 제작 지시문을 추가하지 않는다」도 그대로 남는다. 새 캐러셀의 기본 모드는 `"ai"`(답 2)이고, 빈 지시문은 생성 실패다(요구사항 5). 따라서 이 사용자들은 새 영상 캐러셀의 모든 장에서 기본 경로가 실패한다. 요구사항 1·5 가 이 경우에 성립하지 않는다. 수정 방향: `imagePrompt` 규칙을 고칠 수 있는 본문 밖(`carouselVideoPrompt` 가 붙이는 고정 꼬리)에 둔다. 또는 빈 `imagePrompt` 일 때 제목·본문·`target` 으로 지시문을 채운다. 근거: `architecture/decisions/0035-remote-default-prompts-voice.md`, `src/engine/prompt-settings.ts`(사용자 본문 우선·`newerDefault` 표시), `src/core/carousel-prompt.ts`(`resolveCarouselPrompt`, `carouselVideoPrompt`), `src/engine/routes/carousels.ts`(`planDerivedCarousel`), spec 요구사항 5.
2. **유효한 0027 의 「글자 없는 배경」과 0036 이 함께 유효해지는데 서로 어긋난다.** 0027 은 image_gen 배경을 글자 없이 만든다고 정한다. `architecture/INTENT.md` 의 0027 줄도 「글자 없는 배경」이다. 0036 은 image_gen 배경이 참고 장면의 상품 패키지를 같은 형태로 그리게 하고, 라벨 글자는 「재현을 보장하지 않는다」고만 쓴다. 이것은 배경에 상품의 글자가 들어가는 것을 받아들인다는 뜻이다. intent 제약과 spec 우려 1 은 이 충돌을 적는다. 그러나 0036 은 0026 만 대체하고 0027 은 대체하지도 고치지도 않는다. 구현 뒤에는 유효한 결정 두 개가 서로 다른 규칙을 말한다. 수정 방향: 0036 에 「영상 파생 AI 이미지는 0027 의 글자 없는 배경 규칙에서 참고 상품의 기존 글자를 예외로 둔다」를 적는다. 또는 0027 을 대체하는 결정을 같은 변경에서 낸다. 근거: `architecture/decisions/0027-carousel-text-objects.md`(결정 첫 항목), `architecture/INTENT.md`(캐러셀 이미지·글 줄), `architecture/decisions/0036-scope-carousel-video-genimage.md`(Supersedes: 0026 만), spec 우려 1.

### nit
1. **모드를 바꾸면 다른 배경 기준의 강조와 이미지가 남는다.** 요구사항 2 는 모드 전환 때 재생성을 하지 않는다. 그런데 자동 상자(`highlight.box`)와 AI 윤곽 이미지(`highlight.image`)는 전환 전 배경에서 만든 것이다. 지금 `carouselSlideImage` 는 `ai-outline` 이면 모드와 상관없이 `highlight.image` 를 고른다. 따라서 원본 장면으로 바꿔도 생성 이미지 기반 윤곽이 보인다. 상자도 다른 그림의 좌표로 남는다. 이것은 답 4·요구사항 7(「그 장에 보이는 배경 기준」)과 어긋난다. 같은 문제로, 원본 장면 모드에서 시각을 바꿔 다시 뽑은 뒤 AI 로 돌아오면 요구사항 2 는 이전 장면의 생성 이미지를 그대로 쓴다. 근거: spec 답 4·요구사항 2·7, `src/engine/routes/carousels.ts`(`carouselSlideImage`), `src/engine/carousel-store.ts`(`saveBackgroundVersion`).
2. **생성 이미지와 AI 윤곽 이미지가 같은 파일 이름을 쓴다. 이전 이미지는 남지 않는다.** `saveImageVersion` 과 `saveHighlightImageVersion` 은 둘 다 `images/<slideId>-<version>.png` 에 쓴다. 두 함수는 버전 번호를 따로 센다. 따라서 AI 모드에서 AI 윤곽을 만들면 생성 이미지 v1 과 윤곽 v1 이 같은 파일이 된다. 한쪽을 다시 만들 때 지우는 이전 파일이 다른 쪽의 현재 파일일 수 있다. 또 `saveImageVersion` 은 이전 파일을 지운다. 이것은 요구사항 4 의 「이전 이미지는 버전으로 남는다(기존 `saveImageVersion` 규칙)」와 맞지 않는다. 그리고 `saveImageVersion` 은 장 수준 `image` 에 쓰지만, spec 설계는 생성 이미지를 `background.image` 에 둔다. 근거: `src/engine/carousel-store.ts`(`saveImageVersion`, `saveBackgroundVersion`), spec 요구사항 4·설계 데이터 항목.
3. **AI 모드의 상태 필드를 어느 경로가 보는지 정하지 않았다.** spec 은 `imageStatus`·`imageError` 를 프레임 상태와 나눈다. 지금 받기 대상 판정은 `background.status === "done"` 이다. 화면 상태(`slideStatus`, `derived-ui-state.ts`), 취소(`/cancel`), 앱 재시작 복구(`recover`)도 `background.status` 만 본다. 생성 경로는 프레임 저장(`saveFrameVersion`)에서 `background.status` 를 `done` 으로 바꾼 뒤 이미지를 만든다. 그 결과 AI 이미지가 아직 없거나 실패한 장도 완료로 보이거나 받기 대상이 될 수 있다. 앱이 생성 중에 닫히면 `imageStatus` 는 `running` 으로 남는다. 또 장 수준 `image`·`status`·`error` 가 이미 있어 이미지 상태가 세 곳이 된다. 근거: `src/engine/routes/carousels.ts`(`/download`, `/cancel`, `extractSlideFrame`), `src/engine/carousel-store.ts`(`recover`), `src/ui/screens/carousel/workflow.ts`, `src/ui/screens/carousel/derived-ui-state.ts`, `src/core/carousel.ts`(`CarouselSlide`).
4. **AI 모드 생성도 프레임에 Jev Box 를 먼저 부른다. 「다시 만들기」의 경로도 정하지 않았다.** spec 의 생성 순서는 기존 `extractSlideFrame` 을 그대로 부른 뒤 image_gen 을 부른다. `extractSlideFrame` 은 Jev 가 켜져 있으면 프레임에서 상자를 찾는다. 따라서 AI 모드 장마다 쓰지 않을 Jev 호출과 사용량이 한 번 늘고, 프레임 기준 상자가 잠시 저장된다. 요구사항 4 의 「다시 만들기」가 `POST /generate` 를 쓰면 프레임도 다시 뽑고 강조를 다시 지운다. 근거: `src/engine/routes/carousels.ts`(`extractSlideFrame`, `/generate` project 분기), spec 설계 생성 항목·요구사항 4.
5. **사용자가 그린 상자를 지울지가 spec 안에서 어긋난다.** 답 4 는 배경을 다시 만들면 「사용자가 그린 상자는 지운다」고 쓴다. 설계는 `clearAutomaticHighlight` 를 부른다고 쓴다. 이 함수는 `boxManual` 상자를 남긴다. 프레임 저장(`saveBackgroundVersion`)도 수동 상자를 남긴다. 근거: spec 답 4·설계 강조 항목, `src/engine/carousel-store.ts`(`clearAutomaticHighlight`, `saveBackgroundVersion`).
6. **AI 모드에서 「세로 자르기」(`cropY`)의 역할을 정하지 않았다.** 프레임 파일은 자르지 않은 1080×1920 이다. `cropY` 는 합성 때 `objectPosition` 으로만 적용된다. 그래서 참고 이미지는 사용자가 고른 자르기와 상관없이 세로 전체 프레임이다. 생성 이미지는 이미 캐러셀 비율이므로 `cropY` 가 효과가 없다. 화면에는 이 조절이 그대로 남는다. 근거: `src/engine/pipeline/carousel-frame.ts`, `src/remotion/CarouselSlide.tsx`, `src/ui/screens/carousel/BackgroundSection.tsx`.
7. **기획 밖에서 생기는 장과 검토 단계의 모드 전환을 정하지 않았다.** 검토 단계에서 장을 더하면(`POST /slides` → `addSlide`·`newSlide`) 기본 `mode: "frame"` 과 빈 `imagePrompt` 가 된다. 그래서 새 캐러셀 안에 원본 장면 장이 섞인다. 다시 기획(`POST /:id/plan` → `replacePlan`)할 때 `imagePrompt`·`mode` 를 어떻게 넣는지도 spec 에 없다. 또 `PATCH /slides/:slideId` 는 검토 단계에서도 받는다. 「AI 로 바꾸면 생성을 시작한다」를 단계 조건 없이 구현하면 0026·0036 의 「검토 없이 이미지를 만들지 않는다」와 어긋난다. 근거: `src/core/carousel.ts`(`newSlide`), `src/engine/carousel-store.ts`(`addSlide`, `replacePlan`), spec 답 2·설계 모드 항목, `architecture/decisions/0036-scope-carousel-video-genimage.md`.
8. **영상 캐러셀의 화풍(`style`) 출처가 없다.** 지시문 빌더는 `style` 을 받는다. 그러나 영상 캐러셀 요청 화면에는 화풍 입력이 없다. `DerivedPlanSchema` 에도 `style` 이 없다. 0027 은 「화풍은 사용자가 요청 때 한 줄로 주거나 AI 가 정한다」고 정한다. 화풍이 비면 장마다 그림의 분위기가 달라질 수 있다. 근거: `architecture/decisions/0027-carousel-text-objects.md`, `src/engine/routes/carousels.ts`(`DerivedPlanSchema`, `POST /api/projects/:id/carousel`), spec 설계 생성 항목.
9. **우려 3 의 근거가 코드와 다르다. 8번 규칙을 지우면 이전 설치본의 `target` 이 영향을 받는다.** 이전 설치본은 `--output-schema` 를 strict 로 넘긴다(`compileCodexSchema`). 그래서 모델은 `imagePrompt` 를 내지 못한다. 「DerivedPlanSchema 가 모르는 키를 버림」이 이유가 아니다. 또 지우려는 문장은 `target` 규칙(8번) 안에 있다. 이 문장은 `target` 에 이미지 지시를 넣지 않게 한다. 원격 revision 을 받은 0.3.7·1.0.0 에서는 이 제한이 사라진다. 그 `target` 은 Jev Box 질문과 AI 윤곽 지시문에 그대로 들어간다. 수정 방향: 8번에 「target 에 이미지 지시를 넣지 않는다」는 남긴다. 근거: `src/engine/pipeline/codex.ts`·`codex-schema.ts`, `src/core/carousel-prompt.ts`(8번), `src/engine/routes/carousels.ts`(`askJevBox` 입력, AI 윤곽 `instruction`), spec 우려 3·답 6.
10. **얼굴 규칙이 채택됐는지 spec 안에서 갈린다.** 우려 4 는 「얼굴은 그리지 않는다」를 추천으로만 둔다. 답 3 과 설계의 지시문 문장에는 이 규칙이 없다. 그런데 검증 기준은 「얼굴 금지 문장이 들어간다」를 시험한다. intent 의 범위 밖 항목은 「인물 얼굴 보존」이고, 「얼굴 금지」가 아니다. 근거: spec 답 3·설계·우려 4·검증 기준, intent 기대 결과의 범위 밖 항목.
11. **모드 전환 라우트의 메서드가 틀렸다.** spec 은 `PUT /api/carousels/:id/slides/:slideId` 라고 쓴다. 지금 장 필드 수정은 `PATCH /api/carousels/:id/slides/:slideId` 다. `PUT` 은 `/api/carousels/:id`(이름·주제)에만 있다. 근거: `src/engine/routes/carousels.ts`, spec 설계 모드 바꾸기 항목.
12. **revision 을 올릴 위치와 함께 바꿀 값이 빠졌다.** `PROMPT_REVISION` 은 `src/core/carousel-prompt.ts` 가 아니라 `src/core/default-prompts.ts` 에 있다. 본문을 바꾸면 같은 파일의 `PROMPT_TEXT_HASH` 도 바꿔야 한다. `tests/core/default-prompts.test.ts` 가 이 값을 검사한다. 근거: `src/core/default-prompts.ts`, `tests/core/default-prompts.test.ts`, spec 설계 기획 항목.
13. **보이는 배경을 고르는 로직이 네 곳에 있다. spec 은 일부만 적는다.** spec 은 `carouselSlideImage` 를 `src/core/carousel.ts` 의 함수로 둔다. 지금 이 함수는 `src/engine/routes/carousels.ts` 안에 있다. 같은 판단이 `src/ui/screens/carousel/workflow.ts`(`slideImage`), `src/ui/screens/carousel/derived-ui-state.ts`, `src/engine/pipeline/render.ts`(`hasImage`)에도 있다. spec 의 바꿀 파일에는 뒤의 세 곳이 없다. 한 곳이 빠지면 미리보기·받기·완료 판정이 서로 다른 배경을 고른다. 근거: 위 네 파일, spec 설계 데이터 항목.
14. **intent 제약이 대체된 결정을 인용한다.** intent 제약은 image_gen 근거로 「0015·0027」을 쓴다. 0015 는 0019 에, 0019 는 0027 에 대체됐다. 근거: `architecture/changes/060-carousel-video-genimage/intent.md` 제약, `architecture/decisions/0015-carousel-codex-image-gen.md`(superseded-by 0019).
15. **`INTENT.md` 가 draft 결정을 유효 결정으로 가리킨다.** accept 커밋 b2ffb22 는 「결정」 절의 범위 줄을 0036 으로 바꾸고 0026 을 지웠다. 그러나 0036 의 상태는 draft 이고, 0026 은 아직 유효 상태다. 그 절은 「유효한 결정만」을 적는 곳이다. 근거: `architecture/INTENT.md`, `architecture/decisions/0036-scope-carousel-video-genimage.md`, `architecture/decisions/0026-scope-carousel-review-texts.md`.

## 처리

| # | 발견 | 판단 |
|---|------|------|
| I1 | 고친 영상 프롬프트에서 imagePrompt 가 안 나옴 | 채택 |
| I2 | 0027 글자 없는 배경과 0036 어긋남 | 채택 |
| n1 | 모드 전환 뒤 이전 배경의 강조·이미지가 남음 | 채택 |
| n2 | 생성 이미지와 AI 윤곽 파일 이름 충돌, 이전 버전 미보존 | 채택(최신만 남김으로 요구사항 수정) |
| n3 | AI 모드 상태를 보는 경로 미정 | 채택 |
| n4 | AI 모드에서도 프레임 Jev Box 호출, 다시 만들기 경로 미정 | 채택 |
| n5 | 사용자 상자 지움 여부 자기모순 | 채택 |
| n6 | AI 모드의 세로 자르기 역할 | 채택 |
| n7 | 추가 장·다시 기획 장의 모드, 검토 단계 생성 시작 | 채택 |
| n8 | 영상 캐러셀 화풍 출처 없음 | 채택 |
| n9 | 우려 3 근거 오류, target 규칙 제거 위험 | 채택 |
| n10 | 얼굴 규칙 채택 여부 갈림 | 채택 |
| n11 | PUT → PATCH | 채택 |
| n12 | PROMPT_REVISION 위치·해시 누락 | 채택 |
| n13 | 보이는 배경 판단이 네 곳 | 채택 |
| n14 | intent 가 대체된 0015 인용 | 기각 |
| n15 | INTENT.md 가 draft 0036 을 가리킴 | 채택(plan 승인 때 상태 반영) |

- I1 채택 — imagePrompt·style 규칙을 고칠 수 없는 고정 꼬리로 옮기고, 빈 지시문은 제목·본문·대상으로 채운다(spec 답 5·6).
- I2 채택 — 0036 에 0027 예외를 적는다. 0027 전체를 대체하는 것은 이 변경보다 크다.
- n2 채택 — 생성 이미지는 `-gen-` 파일 이름을 쓰고 최신만 남긴다. 버전 보존은 이 변경에 필요 없다(YAGNI).
- n5 채택 — 배경이 바뀌면 사용자 상자도 지운다. 다른 그림의 좌표는 쓸모가 없다.
- n14 기각 — accepted intent 의 인용 오류이고 구현 결과가 달라지지 않는다. spec 은 0027 을 근거로 쓴다.
- n15 채택 — plan 승인 때 0036 을 accepted, 0026 을 superseded-by 0036 으로 바꾼다.
- 나머지 채택 항목은 spec 요구사항·설계·검증 기준에 반영했다.

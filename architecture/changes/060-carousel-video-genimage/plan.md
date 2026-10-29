# Plan: carousel-video-genimage
Track: full. intent·spec accepted(`b2ffb22`), review draft(`2d6a4f7`, Important 2·nit 15, n14 만 기각). 승인되면 `accept.sh --with-plan carousel-video-genimage` 로 review·plan 을 받고 0036 을 accepted, 0026 을 superseded-by 0036 으로 바꾼다. 구현은 codex 워커, diff 대조는 세션.

## 검토 목록
1. **보이는 배경이 바뀌면 사용자가 그린 상자도 지운다(critic n5 채택).** 모드 전환·다시 만들기·시각 변경 때 상자와 AI 윤곽을 모두 지우고 자동 상자는 새 배경에서 다시 찾는다. 추천: 이대로. 이유: 다른 그림의 좌표는 새 배경에 맞지 않는다. 근거: `spec.md` 답 4, `review.md` n5.
2. **생성 이미지는 최신 하나만 남긴다(critic n2, spec 요구사항 4 수정).** 「다시 만들기」 뒤 이전 그림으로 돌아갈 수 없다. 추천: 이대로. 이유: 버전 보존은 이 변경에 필요 없고, 원본 장면 전환이 되돌릴 길이다. 근거: `review.md` n2.
3. **AI 이미지 모드에서는 「세로 자르기」를 숨긴다(critic n6).** 참고 이미지는 자르지 않은 전체 프레임이다. 추천: 이대로. 근거: `spec.md` 요구사항 8.
4. **영상 캐러셀도 공통 화풍(`style`)을 AI 가 정한다(critic n8).** 요청 화면에 화풍 입력은 더하지 않는다. 추천: 이대로. 이유: 장마다 분위기가 달라지는 것을 막고, 입력 칸을 늘리지 않는다. 근거: `spec.md` 답 5.
5. **critic n14 기각.** accepted intent 가 대체된 0015 를 인용하는 문서 오류다. 구현 결과가 달라지지 않는다.
6. **외부 공개 동작: 병합 뒤 기본 프롬프트 revision 을 올려 원격에 공개한다(0035).** 1.0.0·0.3.7 설치본도 영상 기획 본문(8번 문장 하나 삭제)을 받는다. 앱 릴리스(1.0.1)와 같은 날 공개한다. 추천: plan 승인으로 함께 받는다.

## Context
사용자: 「캐러셀 생성하기 누르면 영상속에 들고있는 상품장면을 기준으로 gpt 이미지가 생성되어야하는거 아니냐는거지 지금은 그냥 영상속 장면 하나만 나오잖아」. 설계는 `architecture/changes/060-carousel-video-genimage/spec.md`, 결정은 `decisions/0036-scope-carousel-video-genimage.md`(0026 대체, 0027 예외 하나).

재사용할 것: `runCarouselImage`·`referenceImage` 첨부(`src/engine/pipeline/codex-image.ts`, AI 윤곽이 이미 씀), `extractSlideFrame`(`src/engine/routes/carousels.ts`), `askJevBox`(`src/engine/pipeline/jev-box.ts`), 「주제로」의 지시문 입력란(`src/ui/screens/carousel/CarouselReview.tsx`).

## 바꿀 파일
- `src/core/carousel.ts`: frame 배경 `mode`(기본 `"frame"`), `generated?: { file, version, frameVersion }`, `generatedStatus`·`generatedError`, 영상 캐러셀 `style`. `newSlide` 가 영상 파생이면 `mode: "ai"`. `visibleBackground(slide)` (new, 보이는 배경 판단 한 곳).
- `src/core/carousel-prompt.ts`: 영상 본문 8번에서 「새 배경 이미지 제작 지시문을 추가하지 않는다」만 지운다. `carouselVideoPrompt` 가 고정 꼬리(imagePrompt·style 출력 규칙)를 붙인다.
- `src/core/default-prompts.ts`: `PROMPT_REVISION` 3, `PROMPT_TEXT_HASH` 갱신.
- `src/engine/pipeline/codex-image.ts`: `referencePrompt(...)`(new, spec 답 3 문장).
- `src/engine/carousel-store.ts`: 생성 이미지 저장(`-gen-` 파일, 이전 생성 파일만 삭제), `clearBackgroundHighlight`(new), `addSlide`·`replacePlan` 의 모드, `recover` 가 `visibleBackground` 사용.
- `src/engine/routes/carousels.ts`: `DerivedPlanSchema` 에 `imagePrompt`·`style`, 빈 지시문 채우기, 생성 project 분기(AI 모드: 프레임 Jev 생략 → 생성 → 생성 이미지에서 자동 상자), `POST …/frame` AI 모드 202, `POST …/slides/:slideId/regenerate`(new), `PATCH …/slides/:slideId` 의 `mode`(이미지 단계 이후만 생성 시작), highlight·download·cancel 이 `visibleBackground` 사용, 지금의 `carouselSlideImage` 를 `visibleBackground` 로 교체.
- `src/engine/pipeline/render.ts`: `hasImage` 를 `visibleBackground` 로.
- `src/ui/screens/carousel/workflow.ts`·`derived-ui-state.ts`: `visibleBackground` 사용.
- `src/ui/screens/carousel/BackgroundSection.tsx`·`CarouselEdit.tsx`: 모드 선택(「AI 이미지」「원본 장면」), AI 모드 「다시 만들기」·생성 상태, 버튼 이름(「이 시각으로 다시 만들기」/「이 시각으로 다시 뽑기」), AI 모드 세로 자르기 숨김.
- `src/ui/screens/carousel/CarouselReview.tsx`: 영상 캐러셀 장에도 이미지 지시문 입력란.
- 테스트: spec 「검증 기준」의 서버·지시문·기본 프롬프트·UI 시험(기존 `tests/server/carousel-derived.test.ts`·`carousels.test.ts`·`tests/core/default-prompts.test.ts`·`tests/ui/` 캐러셀 시험을 넓히거나 새 파일).

## 순서
1. 실패 테스트(서버·core·UI) 커밋, 실패 출력 기록.
2. core(데이터·`visibleBackground`·프롬프트·revision) → 커밋.
3. engine(store·routes·render·지시문 빌더) → 커밋.
4. UI → `pnpm verify` → 커밋.
5. 세션: diff 를 spec·plan 과 대조 → finish → wiki ingest → push.
6. 세션: `scripts/publish-prompts.sh` 로 revision 3 공개 → `release.sh 1.0.1` → 설치 → 사용자 실기 확인.

## 리스크
- 가장 위험한 단계는 3 이다. 상태가 프레임·생성 두 갈래가 되면서 받기·취소·복구·완료 표시가 엇갈릴 수 있다. `visibleBackground` 한 함수로 모으고 각 경로에 시험을 둔다.
- 기존 영상 캐러셀(모드 없음)이 바뀌면 안 된다. 「모드 없는 저장본 = 원본 장면」 시험으로 막는다.
- image_gen 이 참고 상품을 다르게 그릴 수 있다. 자동 시험으로는 확인할 수 없고 사용자 실기로 본다.
- 택하지 않은 대안: 0027 전체 대체(범위가 큼), 생성 이미지 버전 보존(YAGNI), 요청 화면 화풍 입력(입력 칸 증가).

## 증명
1. 1단계 실패 출력과 `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 원격: `✓ prompts published: schema 1 revision 3`.
3. 설치본 1.0.1: 영상 캐러셀을 새로 만들어 장마다 AI 이미지가 생성되는지, 모드 전환·다시 만들기가 동작하는지 사용자 확인.
4. 미검증으로 남길 것: 상품 동일성의 품질(사용자 판단), Windows 실기기.

## 롤백
커밋 되돌리기. 새 필드는 이전 앱이 무시하고(모드 없음 = 원본 장면), `-gen-` 파일은 남아도 쓰이지 않는다. 원격 프롬프트는 더 큰 revision 으로 이전 본문을 다시 올린다.

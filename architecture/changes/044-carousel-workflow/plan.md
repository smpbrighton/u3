# Plan: carousel-workflow (from spec.md)

plan mode 산출물. 승인 후 커밋한다. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다. PR 리뷰는 diff 를 이 파일과 대조한다.

## 검토 목록
사람이 결정할 항목만 둔다. 항목마다 추천·이유·근거.
1. **043 착수 순서(critic I1):** 043 shadcn 구현은 044·045 가 main 에 병합된 뒤 시작한다. 044 는 UI 를 만들지 않는다(데이터·API·합성·엔진 테스트만). **추천:** 그렇게 한다. **이유:** SEED 위에 캐러셀 화면을 만들면 043 B3 에서 다시 만든다. **근거:** `spec.md` 「구현 분담」, `review.md` I1.
2. **레거시 캐러셀 모양 차이(critic n2 일부 채택):** 저장된 장의 글은 위치별 고정 y·아래 음영 하나로 바뀌어 지금과 몇 % 다르다. **추천:** 받아들인다. **이유:** 줄 수 기반 y 재현은 변환 함수가 글 높이를 알아야 해 일이 더 크다. 저장된 캐러셀은 사용자 데이터 두 개뿐이다. **근거:** `spec.md` 요구사항 11, `decisions/0027` 결과.
3. **줄바꿈 수동 검증(critic n6 일부 채택):** 미리보기(WebKit)와 PNG(Chromium)의 줄바꿈 비교는 자동 테스트 대신 043 B3 의 캡처 비교로 한다. 이 변경에서는 PNG 쪽 렌더 테스트만 둔다. **추천:** 그렇게 한다. **이유:** 두 엔진을 테스트에 띄우는 일이 이 확인보다 크다. **근거:** `review.md` n6.
4. **구현 작업자:** 사용자 지시 "구현은 /orca-cli 로 codex에게 지시하고 이 세션은 관리감독" 에 따라 `.smp/config.toml` 의 `impl_model`(claude-sonnet-5-5) 대신 Orca codex 워커(`--dangerously-bypass-approvals-and-sandbox`, 이 워크트리)에게 묶음 단위로 맡기고 이 세션이 diff·verify 를 확인한다. **추천:** 그렇게 한다.
5. **롤백 범위:** 새 스키마로 저장된 carousel.json 은 0.2.2 가 읽지 못해 목록에서 빠진다(아래 롤백 절). **추천:** 받아들인다. **이유:** 0.2.2 로 되돌릴 일은 릴리스 전 테스트 설치뿐이다.

## 바꿀 파일
### 데이터(core)
- `src/core/carousel.ts`: `CarouselTextObject`(id, role title|body|extra, text ≤5000, x·y·width 0–1, font pretendard|gmarket|tmon, weight 400|700, fontSize 12–200, color, align, effect none|shadow|bar|outline, barColor?, opacity 0–1), `CarouselLogo`(enabled, x, y, width, opacity, file), `CarouselSlide` 에 `texts`(2–5)·`logo?`·`brightness`(0.2–2, 기본 1)·`shade`(0–0.9, 기본 0.35), `Carousel` 에 `stage`(review|images, 기본 images)·`caption`(≤2000, 기본 ""). preprocess: `title`·`body`·`textPlacement` → `textsFromLegacy(slide, aspect)`, 레거시 키 제거. `style` 은 두 방식 선택값(superRefine 의 style 필수 제거). 새 순수 함수 `textsFromLegacy`, `defaultTexts(aspect)`, `newSlide(source, previous?)`.
- `src/core/carousel-frame.ts`: `scriptFrameSecs(count, durationSec)`(대본 단계 프레임 i 의 시각 `((i+0.5)/count)*duration`)와 `nearestScriptFrame(secs, sec)`.
### 엔진
- `src/engine/carousel-store.ts`: `createCarousel` 이 `stage: "review"`·`caption`·`style?`·`aspect` 를 받음. `replacePlan(id, plan)` 이 `caption`·`style?` 을 받고 장의 `background`·`sceneNumber` 를 유지하며 `texts` 를 제목·본문으로 채움(영상 기획은 `sceneNumber`·`target`·`sec` 도 설정). 새 메서드 `addSlide`, `removeSlide`, `reorderSlides`(모두 `stage !== "review"` 면 409, 2–10 범위), `updateCarouselFields` 에 `caption`·`style`, `setStage(id, "images")`, `updateSlideUserFields` 에 `texts`·`logo`·`brightness`·`shade`·`sceneNumber`·`background.sec`, `copyLogo(id, srcPath)` → `logos/logo.<ext>`.
- `src/engine/routes/carousels.ts`:
  - `POST /api/carousels`: `style?`·`aspect?` 받음, `stage: "review"`.
  - `POST /:id/plan`: `source.kind` 분기. 주제 기획 프롬프트에 화풍(있으면)·캡션 요구, `PlanSchema` 에 `caption`. 영상 기획은 `planDerivedCarousel(context, project, count)`(지금 `POST /api/projects/:id/carousel` 83–115행의 기획 부분을 함수로 뺀 것)로, `DerivedPlanSchema` 에 `caption`. `carouselServices.plan`·`derivePlan` 반환형에 `caption?`.
  - `POST /api/projects/:id/carousel`: 캐러셀 생성 + 영상 기획, `stage: "review"`, 프레임·Jev 작업 없음. 응답 201 `{carousel}`.
  - 새: `POST /:id/slides`, `DELETE /:id/slides/:slideId`, `PUT /:id/slides/order`(`{slideIds}`), `PATCH /:id`(`{caption?, style?}`), `POST /:id/logo`(설정 워터마크 복사, 없으면 409), `GET /api/projects/:id/frames/list`(추출 없이 기존 `.frames/<inputId>/` 목록과 시각).
  - `PATCH /:id/slides/:slideId`: `texts`·`logo`·`brightness`·`shade`·`sceneNumber`·`background.sec` 추가(`title`·`body`·`textPlacement` 입력 제거).
  - `POST /:id/generate`: `setStage("images")` 뒤 주제는 지시문 있는 장만 `startImage`(빈 장은 `error: "지시문 없음"`, 400 제거), 영상은 장마다 `startImage`(key `carousel:<id>:<slideId>`)로 프레임 렌더(`renderProjectFrame`)·`saveFrameVersion`·Jev box(지금 derive 작업 116–149행 로직을 `extractSlideFrame` 함수로 뺌). `/frame` 라우트도 같은 함수를 부른다.
  - `POST /:id/cancel`: job key 의 slideId 로 장을 찾아 `background.status`/`status` 를 failed 로.
  - `POST /:id/download`: `caption.txt`(UTF-8) 를 같은 폴더에 씀.
  - `GET /:id/files/*`: 확장자로 content-type(png·jpg·webp).
- `src/engine/pipeline/render.ts` `renderCarouselSlide`: props 에 `texts`·`logoUrl?`·`brightness`·`shade`. `src/engine/main.ts` `composeCarouselSlide`: 로고 파일 URL(`mediaServer.url("carousels", "<id>/logos/…")`).
### 합성
- `src/remotion/CarouselSlide.tsx`: props `{imageUrl, texts, logoUrl?, brightness, shade, aspect, frameCropY?, highlight?}`. 배경 `filter: brightness()`, 아래 음영 `linear-gradient(transparent, rgba(0,0,0,shade))`, 글 객체마다 절대 배치(`left=x·W`, `top=y·H`, `width=width·W`, `fontSize=fontSize·min(W,H)/1080`, `pre-wrap`·`keep-all`), 효과 shadow=`text-shadow`, bar=`background: barColor` 패딩 0.4em, outline=`-webkit-text-stroke 0.04em #000`+그림자, `opacity`. 로고 `<Img>`(x·y 중심, width·W). 폰트는 `CAPTION_FONT_FAMILY[font]`.
- `src/remotion/carousel-layout.ts`: `textObjectStyle(text, canvas)`, `shadeStyle(shade)`, `logoStyle(logo, canvas)` 순수 함수. `textPlacementStyle` 삭제.
- `src/remotion/fonts.ts`: `CAPTION_FONT_FAMILY` 재export(이미 자막 렌더가 쓰는 경로 확인 후 재사용).
### 테스트
- `tests/core/carousel-texts.test.ts` (new): 레거시 3 위치×4 비율 변환, 저장 JSON 에 레거시 키 없음, `newSlide` 초기값, `scriptFrameSecs`·`nearestScriptFrame`.
- `tests/engine/carousel-store.test.ts`: add/remove/reorder 범위·409, `replacePlan` 이 background 유지, `copyLogo`.
- `tests/server/carousel-workflow.test.ts` (new): 두 방식 생성 → `stage: "review"`·작업 없음, 기획 응답에 caption, 검토 수정(제목·본문·지시문) → `generate` 지시문·`GET` 반영(intent 판정 2), 빈 지시문 건너뜀, `generate` 뒤 `stage: "images"`·순서 변경 409, 영상 generate 가 장마다 프레임 작업·Jev box, cancel 이 slideId 로 표시, download 가 `caption.txt`, logo 복사·409, frames/list.
- `tests/server/carousels.test.ts`·`carousel-derived.test.ts`: 바뀐 흐름(derive 가 작업을 만들지 않음, generate 가 프레임)에 맞게 고침. `tests/remotion/carousel-slide.test.tsx`: texts·로고·음영 마크업.
- `tests/engine/render-carousel.test.ts` (new, `render-media.test.ts` 방식): 바 효과 글 객체 둘(y 0.1·0.7, 바 색 빨강·파랑)로 PNG 렌더 → ffmpeg 픽셀 샘플이 좌표와 맞음. Chrome 없으면 skip 로 표시(통과로 보고하지 않음).
### 문서
- `architecture/changes/044-carousel-workflow/plan.md`: 이 파일.
- 043 pages.md·spec 화면 목록·아티팩트 보드는 043 워크트리에서 게이트 2 재개 때(요구사항 13).

## 순서
묶음마다 테스트 먼저 → 구현 → `pnpm verify` → 커밋. 명령 앞에 AGENTS.md 의 X31 캐시 환경변수.
1. **A 데이터:** `carousel-texts.test.ts` → `carousel.ts`·`carousel-frame.ts`. 기존 `tests/core/carousel.test.ts` 의 placement 테스트를 변환 기준으로 고친다.
2. **B 저장소:** `carousel-store.test.ts` 추가 → `carousel-store.ts`.
3. **C 라우트:** `carousel-workflow.test.ts` → `carousels.ts`·`frames.ts`·`app.ts`(carouselServices 타입). 기존 두 서버 테스트 수정.
4. **D 합성:** `carousel-slide.test.tsx`·`render-carousel.test.ts` → `CarouselSlide.tsx`·`carousel-layout.ts`·`render.ts`·`main.ts`.
5. **E 통합 확인:** `pnpm verify`. `pnpm dev` 로 엔진을 띄워 기존 캐러셀 두 개가 읽히고(`GET /api/carousels`) `download` PNG 가 지금 모양과 비슷한지 캡처 한 장(수동, 경로 기록).
6. **F 마감:** `worktree.sh finish carousel-workflow`(rebase·verify·병합·push), `/smp:wiki ingest`(위키 캐러셀 페이지 결정 링크를 0026·0027 로, critic n14).
7. 045 가 먼저 병합돼 있으면 rebase 뒤 요구사항 14(`plainCaptionText` 를 파생 기획 입력·Jev 대상에 적용)를 이 변경에서 한다. 아니면 045 가 한다.

## 리스크
- **가장 위험한 단계는 C(라우트)다.** derive 흐름이 「생성 + 기획 + 프레임 작업 하나」에서 「생성 + 기획」과 「generate 가 장마다 프레임 작업」으로 갈라진다. 취소·복구(`recover`)·`hasActiveForCarousel` 가 작업 key·`projectId` 에 의존하므로 key 형식을 `carousel:<id>:<slideId>` 로 통일하고 테스트로 잠근다.
- 렌더 테스트는 Chrome(`U3_CHROME_EXECUTABLE`)이 필요하다. 없으면 skip 되고 완료 보고에 미검증으로 적는다.
- 글 객체 좌표는 장 크기 비율이라 비율(aspect)을 바꾸면 모양이 달라진다. 비율은 생성 뒤 바꾸지 않는다(지금도 같다).
- 택하지 않은 대안: (1) UI 까지 SEED 로 함께 구현 — 043 에서 다시 만든다. (2) 레거시 모양을 줄 수 기반으로 정확히 재현 — 변환 함수가 글 높이를 알아야 한다. (3) 로고를 설정 파일 직접 참조 — 설정 변경이 기존 캐러셀을 바꾼다(critic n7).

## 증명
1. `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`(묶음마다, 병합 전).
2. 새 테스트 파일 넷이 통과하고 기존 캐러셀 테스트가 바뀐 흐름으로 통과한다. 실패 출력은 보고에 그대로 적는다.
3. 렌더 픽셀 테스트 통과 또는 skip 사유(Chrome 없음) 기록.
4. 5 단계 수동 확인: 기존 캐러셀 두 개 `GET` 응답에 `texts`·`stage: "images"` 가 있고 PNG 캡처 경로를 보고에 적는다.
5. `grep -rn "textPlacement" src` 가 `textsFromLegacy` 입력 처리 외 0건.
6. 미검증 항목은 완료 보고에 그대로 적는다.

## 롤백
- 코드는 커밋 단위로 되돌린다. 데이터: 새 스키마로 저장된 `carousel.json` 은 `texts`·`stage` 를 가지고 `title`·`body` 가 없다. 0.2.2 는 `title` 필수라 파싱에 실패해 목록에서 빠진다(파일은 남는다). 되돌려야 하면 `texts[0].text`·`texts[1].text` 를 `title`·`body` 로, `y<0.3` 이면 top·`<0.55` 면 center·그 밖은 bottom 으로 쓰는 일회성 스크립트 `scripts/carousel-downgrade.ts` 를 그때 만든다(이 변경에 넣지 않는다).

# Spec: carousel-video-genimage
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
1. 원본 장면 배경을 남긴다. 장마다 「AI 이미지 / 원본 장면」을 고른다. 이유: AI 가 상품을 다르게 그리거나 가격표처럼 실제 글자가 중요할 때 되돌릴 길이 필요하다.
2. 새 영상 캐러셀의 기본값은 AI 이미지다. 기획으로 만든 장, 다시 기획한 장, 검토 단계에서 더한 장 모두 AI 이미지로 시작한다. 이미 만든 캐러셀은 원본 장면으로 남는다(저장 값에 모드가 없으면 원본 장면).
3. 지시문에 세 문장을 넣는다: 「참고 사진의 상품을 같은 상품으로 그린다(종류·색·모양·패키지 형태)」, 「새 글자·숫자·로고·워터마크를 만들지 않는다. 상품에 원래 있는 글자는 그대로 두되 재현은 보장하지 않는다」, 「사람은 손 정도만 그리고 얼굴은 그리지 않는다」. 라벨이 중요하면 원본 장면을 고른다.
4. 강조(상자·AI 윤곽)는 그 장에 보이는 배경 이미지를 기준으로 적용한다. 보이는 배경이 바뀌면(모드 전환, 다시 만들기, 시각 변경) 그 장의 자동 상자·사용자 상자·AI 윤곽 이미지를 모두 지운다. 다른 그림의 좌표나 윤곽이 남지 않게 하기 위해서다. 강조 형태와 대상 글은 남기고, 자동 상자는 새 배경에서 다시 찾는다.
5. 기획 단계에서 장마다 `imagePrompt` 와 캐러셀 공통 `style` 을 만든다. 검토 화면에서 「주제로」 캐러셀과 같은 지시문 입력란으로 고친다. 지시문이 비어 있으면 생성 때 제목·본문·강조 대상으로 지시문을 만든다.
6. `imagePrompt`·`style` 출력 규칙은 사용자가 고칠 수 있는 영상 기획 본문 밖, `carouselVideoPrompt` 가 붙이는 고정 꼬리에 둔다(설정에서 본문을 고친 사용자도 받도록). 본문 8번에서는 「실제 화면에서 확인했다고 주장하지 않는다」와 「target 에 이미지 제작 지시를 넣지 않는다」를 남기고, 「새 배경 이미지 제작 지시문을 추가하지 않는다」만 지운다. 본문을 바꾸므로 `src/core/default-prompts.ts` 의 `PROMPT_REVISION` 과 `PROMPT_TEXT_HASH` 를 갱신하고 원격에 공개한다(0035).

## 요구사항
1. 새 「영상으로」 캐러셀에서 이미지 만들기를 누르면 장마다 고른 장면 프레임(자르지 않은 전체 프레임)을 참고 이미지로 붙인 image_gen 이 돌고, 결과가 그 장의 배경이 된다.
2. 장마다 배경 모드를 「AI 이미지」「원본 장면」 중에서 바꿀 수 있다. 원본 장면으로 바꾸면 이미 뽑은 프레임을 바로 쓴다. AI 이미지로 바꾸면 현재 프레임에서 만든 생성 이미지가 있으면 그것을, 없거나 다른 프레임에서 만든 것이면 생성을 시작한다. 검토 단계에서는 모드만 바꾸고 생성을 시작하지 않는다.
3. 시각을 바꾸고 「이 시각으로 다시 만들기」를 누르면 프레임을 다시 뽑고, AI 이미지 모드면 그 프레임으로 다시 생성한다.
4. AI 이미지 모드에서 「다시 만들기」는 프레임을 다시 뽑지 않고 같은 프레임·지시문으로 새 이미지를 만든다. 최신 이미지만 남긴다.
5. 생성 실패는 그 장만 실패로 표시하고, 원본 장면으로 바꿀 수 있다.
6. 강조는 그 장에 보이는 배경 이미지 기준으로 동작한다(답 4).
7. 받기(PNG)·완료 표시·취소·앱 재시작 복구는 그 장에 보이는 배경의 상태를 기준으로 한다. AI 모드 장은 생성 이미지가 있어야 완료다.
8. AI 이미지 모드에서는 「세로 자르기」를 숨긴다(생성 이미지는 이미 캐러셀 비율이다).
9. 이미 저장된 영상 캐러셀은 열었을 때 원본 장면 모드로 보이고 동작이 바뀌지 않는다.

## 설계
- 데이터(`src/core/carousel.ts`): frame 배경에 `mode: "ai" | "frame"`(저장 값에 없으면 `"frame"`, 새 기획·추가 장은 `"ai"`), `generated?: { file, version, frameVersion }`(생성 이미지와 그 참고 프레임 버전), `generatedStatus`·`generatedError`. 영상 캐러셀에 `style`.
- 보이는 배경 판단은 `src/core/carousel.ts` 의 함수 하나 `visibleBackground(slide)` → `{ file?, status, error? }` 로 모은다. 모드가 `"ai"` 면 생성 이미지·`generatedStatus`, 아니면 프레임·`status`. 그 위에 AI 윤곽 이미지가 있으면 그것. 쓰는 곳: `src/engine/routes/carousels.ts`(지금의 `carouselSlideImage`, `/download`, `/cancel`), `src/engine/carousel-store.ts`(`recover`), `src/engine/pipeline/render.ts`(`hasImage`), `src/ui/screens/carousel/workflow.ts`(`slideImage`), `src/ui/screens/carousel/derived-ui-state.ts`.
- 파일: 생성 이미지는 `images/<slideId>-gen-<version>.png`, AI 윤곽은 지금 이름을 유지한다. 새 버전을 저장하면 같은 종류의 이전 파일만 지운다.
- 기획(`src/engine/routes/carousels.ts`): `DerivedPlanSchema` 에 `imagePrompt`·`style` 추가. `planDerivedCarousel`·`replacePlan`·`addSlide` 가 새 장을 `mode: "ai"` 로 만든다. 고정 꼬리(답 6)는 `src/core/carousel-prompt.ts` 의 `carouselVideoPrompt` 에 둔다.
- 생성(`POST /api/carousels/:id/generate`, project 분기): 프레임을 뽑는다. 모드가 `"ai"` 면 프레임의 Jev Box 를 부르지 않고 이어서 `runCarouselImage` 를 `referenceImage = 프레임` 과 새 지시문 빌더로 부른 뒤, 생성 이미지에서 자동 상자를 찾는다. 지시문 빌더는 `src/engine/pipeline/codex-image.ts` 에 `referencePrompt(...)` 로 두고 답 3 의 문장을 넣는다(지금의 `outlinePrompt` 는 AI 윤곽 전용).
- 장면 다시 뽑기(`POST …/frame`): 프레임을 다시 뽑은 뒤 모드가 `"ai"` 면 생성 작업을 큐에 넣고 202 로 작업을 돌려준다. 원본 장면 모드는 지금처럼 동기 응답.
- 다시 만들기: `POST /api/carousels/:id/slides/:slideId/regenerate`(new). 프레임을 다시 뽑지 않는다.
- 모드 바꾸기: `PATCH /api/carousels/:id/slides/:slideId` 의 background 에 `mode`. 이미지 단계 이후에만 필요하면 생성을 시작한다(요구사항 2).
- 강조: `highlight` 라우트의 Jev Box·AI 윤곽 입력을 `visibleBackground` 의 파일로 바꾼다. 보이는 배경이 바뀌면 `clearBackgroundHighlight`(new, 자동·사용자 상자와 윤곽 이미지 모두 지움)를 부른다.
- 화면(`src/ui/screens/carousel/BackgroundSection.tsx`·`CarouselReview.tsx`): 배경 절에 모드 선택, AI 모드일 때 「다시 만들기」와 생성 상태, 버튼 이름 「이 시각으로 다시 만들기」(AI)·「이 시각으로 다시 뽑기」(원본), AI 모드에서 「세로 자르기」 숨김. 검토 화면의 영상 캐러셀 장에 이미지 지시문 입력란.

## 결정
- 0026 을 0036 으로 대체한다: 영상 파생 캐러셀의 배경은 고른 장면을 참고 이미지로 image_gen 이 만든 그림이 기본이고, 장마다 원본 장면으로 바꿀 수 있다. 0036 은 0027 의 「글자 없는 배경」에 예외 하나를 둔다: 영상 파생 그림에서 참고 상품에 원래 있는 글자는 남을 수 있다(새 글자는 만들지 않는다). → `../../decisions/0036-scope-carousel-video-genimage.md`

## 우려 사항
1. **글자 없는 배경 규칙(0027)과 상품 패키지 글자.** image_gen 은 패키지 글자를 바꾸거나 깨뜨릴 수 있다. 0036 이 예외로 적는다. 정책 소유자: 제품 책임자(사용자). 추천: 라벨 재현을 보장하지 않고 원본 장면 전환으로 보완한다.
2. **사용량·시간 증가.** 영상 캐러셀 5장이면 image_gen 5회(장당 수십 초, ChatGPT 사용량 소모)가 는다. 정책 소유자: 사용자. 추천: 그대로 받아들이고 동시 수 설정(0027)으로 조절한다.
3. **원격 기본 프롬프트 revision.** 영상 기획 본문을 바꾸면 이전 설치본(0.3.7·1.0.0)도 원격으로 새 본문을 받는다. 이전 설치본은 codex 에 strict output schema 를 넘기므로 `imagePrompt` 를 출력하지 못하고, 본문에서 지운 문장은 배경 지시에 관한 것이라 `target` 규칙은 그대로다. 정책 소유자: 개발. 추천: 이 변경의 앱 릴리스와 같은 날 공개한다.
4. **사람 얼굴.** 참고 프레임의 사람을 image_gen 이 다른 사람처럼 그린다. 0026·0036 은 「인물 사진」을 범위 밖에 둔다. 정책 소유자: 사용자. 추천: 지시문에 얼굴 금지를 넣는다(답 3).

## 검증 기준
- `pnpm verify` 가 `✓ verify passed` 로 끝난다.
- 서버 시험: 영상 캐러셀 생성이 프레임 추출 뒤 참고 이미지를 붙여 이미지 생성 서비스를 부르고 프레임 Jev Box 는 부르지 않는다. 원본 장면 모드는 생성 서비스를 부르지 않는다. 모드 없는 저장본은 원본 장면으로 읽힌다. 시각 다시 뽑기가 AI 모드에서 생성 작업을 시작한다. `regenerate` 는 프레임을 다시 뽑지 않는다. 검토 단계의 모드 전환은 생성을 시작하지 않는다. 받기·취소·복구가 `visibleBackground` 상태를 따른다. 배경이 바뀌면 상자·윤곽이 지워진다. 사용자 본문을 고친 설정에서도 기획 프롬프트에 `imagePrompt` 꼬리가 붙는다.
- 지시문 빌더 시험: 참고 이미지 경로, 「같은 상품」, 「새 글자 없음」, 얼굴 금지 문장이 들어간다.
- 기본 프롬프트 시험: revision·해시 갱신.
- UI 시험: 모드 전환, 「다시 만들기」, AI 모드에서 세로 자르기 숨김, 검토 화면 지시문 입력.
- 실기(사용자): 영상 캐러셀을 새로 만들어 상품 장면이 같은 상품으로 그려지는지 확인한다.

# Review: carousel-workflow
Author: claude-opus-5-5[1m]. Status: draft. Round: 1.

## 대조한 것
- 변경: `architecture/changes/044-carousel-workflow/intent.md`, `spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 결정(유효): `architecture/decisions/0026-scope-carousel-review-texts.md`, `0027-carousel-text-objects.md`, `0016-caption-layers-opacity-brand.md`, `0024-jev-key-setting.md`, `0013-generation-merge-clips-memes.md`
- 결정(대체됨, 대체 관계 확인용): `0022-scope-add-tts.md`, `0019-carousel-image-aspects.md`, `0017-scope-carousel-two-modes.md`, `0018-codex-jev-box.md`
- 위키: `architecture/wiki/index.md`, `architecture/wiki/SCHEMA.md`, `architecture/wiki/pages/concept-carousel.md`
- 진행 중인 변경(장부 `ledger.sh show` 의 critic·design 단계):
  - 043 shadcn-redesign: `/Volumes/X31/workspace/smp_workspace/u3-043-shadcn-redesign/architecture/changes/043-shadcn-redesign/{intent,spec,plan,design,pages}.md`, 그 워크트리의 `architecture/decisions/0025-ui-shadcn.md`
  - 045 caption-scene-review: `/Volumes/X31/workspace/smp_workspace/u3-045-caption-scene-review/architecture/changes/045-caption-scene-review/{intent,spec}.md`, 그 워크트리의 `architecture/decisions/0028-caption-clip-style.md`, `0029-scene-review.md`(plan 없음)
- 코드: `src/core/carousel.ts`, `src/core/fonts.ts`, `src/engine/routes/carousels.ts`, `src/engine/main.ts`(`composeCarouselSlide`·media roots), `src/engine/routes/system.ts`(워터마크), `src/engine/pipeline/frames.ts`, `src/remotion/CarouselSlide.tsx`, `src/remotion/carousel-layout.ts`, `src/remotion/fonts.ts`, `src/ui/screens/Carousels.tsx`, `package.json`

## 발견

### Important
1. **043 의 기반(B0) 없이 043 B3 를 대체한다. 043 산출물은 043 브랜치에만 있다.** 044 제약은 「043 디자인 체계(shadcn 부품, 토큰)를 따른다」이고, spec 우려 1 은 043 plan 의 B3 를 이 변경의 plan 으로 대체한다고 한다. 043 plan 의 순서는 B0(Tailwind·shadcn·토큰·CSS layer) → B1 공통 셸 → B2 → B3 다. main 과 044 워크트리에는 아직 SEED 만 있다(`package.json` 의 `@seed-design/*`, `src/ui/components/` 없음). 그래서 044 는 캐러셀 화면을 SEED 로 만들어 043 이 다시 만들게 하거나, 범위에 없는 B0 를 가져와야 한다. 장부의 044 `DEPENDS_ON` 은 `-` 다. 또 검증 기준 7(「043 아티팩트에 보드가 추가되고 pages.md 6 절이 바뀐 커밋」)이 가리키는 `pages.md`·`design-src/` 는 043 워크트리 브랜치에만 있다. 044 브랜치에서는 그 커밋을 만들 수 없다. 043 spec 의 화면·상태 목록(accepted)도 캐러셀을 「제목·본문·텍스트 위치」로 적고 검토 화면이 없다. 이 목록은 043 증명 1(대응표 누락 0)의 기준이다. 요구사항 13 은 pages.md 와 아티팩트만 고치고 이 목록을 고치지 않는다. 045 spec 은 같은 파일 충돌을 우려로 올렸지만 044 spec 에는 없다.
   근거: `spec.md` 「제약」·우려 1·요구사항 13·검증 기준 7, `u3-043-shadcn-redesign/.../043-shadcn-redesign/plan.md` 「순서」 8–11, `.../043-shadcn-redesign/spec.md` 37행, `.../043-shadcn-redesign/design.md` 「디자인 원본 사본」, `u3-045-caption-scene-review/.../045-caption-scene-review/spec.md` 우려 4, `package.json` 40–41행.
2. **045 의 `*단어*` 강조 표기가 영상 파생 캐러셀 기획 입력에 그대로 들어간다.** 영상 파생 기획은 타임라인 자막 레이어의 메인 클립 글(`captionLayersOf(project.timeline)…clip.text`)을 `captionLayersMain` 으로 codex 에 넘긴다. 045(0028)는 그 글 안에 `*단어*` 를 쓰게 한다. 045 가 별표를 빼는 곳은 TTS·받아 적기·대본 입력뿐이다. 그러면 044 의 기획 결과 제목·본문과 Jev Box 대상(`target`)에 별표가 섞인다. 044 글 객체는 표기를 해석하지 않으므로 PNG 에 별표가 그대로 그려진다. 어느 쪽 변경이 `plainCaptionText` 를 캐러셀 기획 입력에 적용할지 정해야 한다.
   근거: `src/engine/routes/carousels.ts` `POST /api/projects/:id/carousel` 의 `captionText`·`material`, `u3-045-caption-scene-review/architecture/decisions/0028-caption-clip-style.md` 결정 2, `.../045-caption-scene-review/spec.md` 「데이터」 `plainCaptionText`.
3. **결정 0026 이 043 이 아직 구현하지 않은 대본 프레임 규칙을 accepted 로 적는다.** 0026 은 AI 추천 입력을 「영상마다 길이 1초당 1장(3~10장)」으로 적는다. 대체한 0022 는 「영상마다 같은 간격 10장, 프로젝트 최대 40장」이고, 지금 코드도 같다(`frameCountForInputs = min(40, count×10)`, `frameAllocation(…, limit = 40)`). 새 규칙은 043 pages.md 4 절의 「바뀜(프레임 수)」에서 왔고 043 B4 에서 구현할 일이다. 044 spec 은 이 규칙을 바꾸지 않는다. 044 가 먼저 병합되면 결정의 정본과 코드가 어긋난다. 043 에는 이 규칙의 결정이 없다(0025 는 UI 구조만 다룬다).
   근거: `architecture/decisions/0026-scope-carousel-review-texts.md` 결정 2, `architecture/decisions/0022-scope-add-tts.md` 결정 2, `src/engine/pipeline/frames.ts` 6–20행, `u3-043-shadcn-redesign/.../043-shadcn-redesign/pages.md` 93행, `u3-043-shadcn-redesign/architecture/decisions/0025-ui-shadcn.md`.

### nit
1. **「검토로 돌아가기」 뒤의 상태가 정의되지 않았다.** 요구사항 5 는 돌아간 뒤 「글·캡션만」 고치고 장 수·순서는 바꿀 수 없다고 한다. 그러나 API 는 `PATCH /:id` 로 `stage→"review"` 를 받고, 장 수·순서 변경을 `stage: "review"` 에서 허용한다. 그래서 돌아간 뒤 API 로 장을 더하고 지우고 순서를 바꿀 수 있다. 검토 머리줄의 「이미지 만들기」를 다시 누를 때 `generate` 가 완료한 장까지 모두 다시 만드는지도 정하지 않았다. 다시 만들면 구독 한도를 쓰고 사용자가 고른 이미지를 덮는다. 생성 중에 돌아갈 수 있는지도 없다. 지금 취소는 작업의 `sceneIndex` 로 `carousel.slides[index]` 를 찾으므로, 생성 중에 순서가 바뀌면 다른 장을 실패로 표시한다.
   근거: `spec.md` 요구사항 4·5, 「API」 3·4번째 항목, `src/engine/routes/carousels.ts` `POST /api/carousels/:id/cancel`.
2. **레거시 변환이 지금 모양을 유지하지 못한다.** 지금 렌더는 위치(위·가운데·아래)마다 다른 그라데이션을 깐다. spec 의 `shade` 는 아래쪽 그라데이션 하나(기본 0.35)다. 그래서 「위」·「가운데」 장은 변환 뒤 어두운 띠의 위치가 바뀐다. 「가운데」·「아래」 배치는 flex 정렬이라 제목 y 가 글 높이(줄 수)에 따라 정해진다. 순수 함수 `textsFromLegacy(slide, aspect)` 는 줄 수를 모르므로 같은 y 를 계산하지 못한다. 16:9 본문은 폭 60% 가운데 배치이고, 글 묶음은 `maxHeight: 82%`·`overflow: hidden` 이다. 기본 좌표(제목 x 0.08·폭 0.84)만으로는 이 둘이 나오지 않는다. intent 제약 「모양을 유지한다」와 요구사항 11 이 이 차이를 다루지 않는다.
   근거: `src/remotion/CarouselSlide.tsx` 그라데이션·글 묶음 스타일, `src/remotion/carousel-layout.ts` `textPlacementStyle`, `spec.md` 요구사항 9·11, 「데이터」 4번째 항목, `intent.md` 제약 3.
3. **영상 파생 검토의 프레임 썸네일 출처가 없다.** 요구사항 3 과 API 절은 기획 때 프레임을 만들지 않는다고 한다. 답 6 은 검토 화면에서 장마다 「프레임 썸네일을 보인다」고 한다. 시각을 바꿀 때마다 썸네일을 무엇으로 만드는지(대본 단계 프레임 재사용, 별도 추출, 입력 썸네일) 정하지 않았다.
   근거: `spec.md` 답 6, 요구사항 3, 「API」 2번째 항목, `src/engine/routes/frames.ts`.
4. **영상 방식의 기획 경로가 비어 있다.** 「다시 기획」은 「지금 주제·화풍·장 수로」 다시 만든다고 하지만 영상 방식에는 주제가 없다. 지금 `POST /:id/plan` 은 주제 캐러셀만 받고, spec 은 그 엔드포인트를 「지금과 같다」고 한다. 답 5 는 기획 때 `caption` 을 함께 만든다고 하지만, 캡션 요구를 더하는 곳은 주제 기획 프롬프트뿐이다. 영상 기획 스키마(`DerivedPlanSchema`)의 `caption` 은 적혀 있지 않다. 「데이터」는 `style` 이 두 방식 모두의 값이라고 하지만 요구사항 2 의 영상 요청에는 화풍이 없고, 영상 배경은 화풍을 쓰지 않는다.
   근거: `spec.md` 답 5·7, 요구사항 2·4, 「API」 1·2번째 항목, `src/engine/routes/carousels.ts` `DerivedPlanSchema`·`POST /api/carousels/:id/plan`.
5. **앱에 없는 굵기를 고르게 한다.** 요구사항 6 은 세 폰트 모두 굵기 400·700 을 고르게 한다. 앱에 든 파일은 Pretendard 400·700, G마켓 산스 700, 티몬체 400 뿐이다. G마켓 산스 400 과 티몬체 700 은 브라우저가 합성하거나 대체한다. 합성 굵기는 미리보기(WebKit)와 렌더(Chromium)에서 다를 수 있어 「같은 모양」 요구와 어긋난다.
   근거: `src/core/fonts.ts` `FONT_FILES`, `spec.md` 요구사항 6·12, `architecture/decisions/0027-carousel-text-objects.md` 결정 2.
6. **넘침 판정과 줄바꿈 일치에 검증이 없다.** 넘침은 UI 미리보기 DOM 으로만 판정한다. 장 목록 표시와 받기 전 확인을 하려면 지금 보이지 않는 장도 모두 DOM 에 그려야 하는데, spec 은 이 방법을 적지 않는다. 미리보기는 Tauri WebKit 이고 PNG 는 Remotion Chromium 이다. 같은 CSS 라도 글꼴 메트릭과 `keep-all` 줄바꿈이 다르면 화면 판정과 PNG 가 어긋난다. 요구사항 12 는 CSS 로 같다고 단정하고, 검증 기준에는 두 쪽 줄바꿈을 비교하는 항목이 없다. 글 객체에 높이가 없으므로 「줄이 상자 밖」이 무엇인지도 정하지 않았다.
   근거: `spec.md` 요구사항 7·10·12, 「합성」 2번째 항목, 검증 기준 5·6, `intent.md` 제약 4.
7. **로고가 설정 파일을 그대로 참조할 때의 동작이 없다.** 설정의 워터마크는 `brand/watermark.<ext>` 한 파일이다. 사용자가 설정에서 이미지를 바꾸면 기존 캐러셀의 로고도 모두 바뀌고, 지우면 로고를 켠 장에 그릴 파일이 없다. 그때 미리보기·PNG 의 동작과, 로고를 처음 켤 때 x·y·폭 기본값(설정 워터마크 기본값을 쓰는지)이 없다.
   근거: `src/engine/routes/system.ts` `POST`·`DELETE /api/system/brand/watermark`, `src/core/schema.ts` 120–125행, `spec.md` 요구사항 8, 답 4.
8. **intent 판정 기준 (2)에 대응하는 검증 기준이 없다.** intent 는 「검토에서 고친 글이 이미지 지시문과 편집 화면에 반영된다」를 판정 기준으로 둔다. spec 검증 기준 2–7 에는 이 항목을 확인하는 테스트가 없다.
   근거: `intent.md` 기대 결과 판정 기준 (2), `spec.md` 검증 기준.
9. **장 더하기의 초기값이 없다.** 주제 방식에서 더한 장은 이미지 지시문이 비어 있다. 지금 `generate` 는 지시문이 빈 장이 하나라도 있으면 400(`missing-plan`)으로 전체를 거절한다. 영상 방식에서 더한 장의 장면 번호·시각·강조 대상 초기값도 없다.
   근거: `spec.md` 요구사항 4, 「API」 3번째 항목, `src/engine/routes/carousels.ts` `POST /api/carousels/:id/generate`.
10. **「영상으로」 프로젝트 목록 조건이 엔진 조건보다 넓다.** 요구사항 1 은 「타임라인 영상과 영상 입력이 있는 프로젝트」를 보인다. 엔진은 `script.json` 을 읽고 `CodexScript` 로 검증한 뒤, 영상 1 본 화면 클립이 첫 영상 입력인지 본다. `script.json` 이 없는 프로젝트를 고르면 읽기 오류로 실패한다.
   근거: `spec.md` 요구사항 1, `src/engine/routes/carousels.ts` `POST /api/projects/:id/carousel` 첫 다섯 줄.
11. **주제 방식 요청에 비율이 생긴다.** 요구사항 2 는 주제 방식 요청에 비율을 넣는다. intent 에는 이 요구가 없다. 지금 주제 캐러셀은 설정의 비율을 쓰고, 043 pages.md 6.2(게이트 1 확정)에도 비율이 없다. 0027 은 비율을 「설정의」 값으로 적는다. 설정값을 기본으로 두는 요청 값인지 정하지 않았다.
   근거: `spec.md` 요구사항 2, `src/engine/routes/carousels.ts` `POST /api/carousels`, `u3-043-shadcn-redesign/.../043-shadcn-redesign/pages.md` 6.2, `architecture/decisions/0027-carousel-text-objects.md` 결정 1.
12. **받기 확인 대화상자 두 개의 순서가 없다.** 043 pages.md 6.3 은 미완성 장이 있으면 「완료한 장만 받을까요?」를 묻는다. 044 는 넘친 장이 있으면 확인 대화상자를 더한다. 둘이 함께 해당할 때 하나로 합치는지 차례로 묻는지 정하지 않았다.
   근거: `u3-043-shadcn-redesign/.../043-shadcn-redesign/pages.md` 6.3 「모두 받기」, `spec.md` 답 8·요구사항 10.
13. **글 크기의 「1080 기준」이 16:9 에서 모호하다.** 16:9 장은 1920×1080 이다. 「1080 기준」이 폭인지 짧은 변인지 정하지 않았다. 지금 렌더는 비율과 상관없이 76/40px 고정값이다.
   근거: `spec.md` 요구사항 6, `src/remotion/carousel-layout.ts` `carouselCanvasSize`, `src/remotion/CarouselSlide.tsx`.
14. **위키 캐러셀 페이지가 대체된 결정을 가리킨다.** `concept-carousel.md` 의 결정 링크는 0017(0022 가 대체)과 0019(0027 이 대체)다. 이 변경의 라운드 마감 ingest 에서 0026·0027 로 바꿔야 한다.
   근거: `architecture/wiki/pages/concept-carousel.md` 「결정 링크」 줄.

## 처리

| # | 발견 | 판단 |
|---|---|---|
| I1 | B0 없이 B3 대체, 043 산출물은 043 브랜치에만 | 채택 |
| I2 | `*단어*` 가 파생 캐러셀 기획 입력에 들어감 | 채택 |
| I3 | 0026 이 미구현 프레임 규칙을 적음 | 채택 |
| n1 | 「검토로 돌아가기」 뒤 상태 미정 | 채택 |
| n2 | 레거시 변환이 지금 모양을 못 지킴 | 일부 채택 |
| n3 | 검토 썸네일 출처 없음 | 채택 |
| n4 | 영상 방식 기획 경로 비어 있음 | 채택 |
| n5 | 앱에 없는 굵기 | 채택 |
| n6 | 넘침·줄바꿈 검증 없음 | 일부 채택 |
| n7 | 로고가 설정 파일을 직접 참조 | 채택 |
| n8 | intent 판정 기준 2 의 검증 없음 | 채택 |
| n9 | 더한 장 초기값 없음 | 채택 |
| n10 | 프로젝트 목록 조건이 엔진보다 넓음 | 채택 |
| n11 | 주제 방식 비율 요청 값 | 채택 |
| n12 | 받기 확인 대화상자 둘 | 채택 |
| n13 | 「1080 기준」 모호 | 채택 |
| n14 | 위키가 대체된 결정 가리킴 | 채택(ingest 때) |

I1 채택 — spec 「구현 분담」 절: 044 는 데이터·API·합성·엔진 테스트만, 화면은 043 B3 가 shadcn 으로 만든다. 043 은 044·045 병합 뒤 시작(장부 depends_on). 요구사항 13 에 043 spec 화면 목록 수정을 더하고 검증 8 로 043 워크트리 커밋을 가리킨다.
I2 채택 — 요구사항 14: 파생 기획 입력·Jev 대상에 `plainCaptionText` 적용, 뒤에 병합되는 쪽이 한다. 045 spec 에도 적용 대상을 더한다.
I3 채택 — 0026 의 프레임 문장을 0022 와 같게 되돌렸다. 043 B4 가 바꿀 때 결정을 쓴다.
n1 채택 — 「검토로 돌아가기」를 없앴다. 단계는 review→images 한 번. 편집 화면의 「글」「캡션」 섹션이 글을 고친다. 취소는 장 id 로 찾는다.
n2 일부 채택 — y 고정값·아래 음영 하나로 바뀌는 차이를 요구사항 11 과 0027 결과에 적고 받아들인다. 줄 수 기반 y 재현은 변환 함수가 글 높이를 알아야 해 일이 더 크다.
n3 채택 — 대본 단계 프레임 중 가장 가까운 시각 것을 쓴다.
n4 채택 — `plan` 이 source 로 분기, `DerivedPlanSchema` 에 caption, 화풍은 주제 방식만.
n5 채택 — 굵기 선택은 Pretendard 만.
n6 일부 채택 — 넘침 정의(그려진 상자가 장 밖)와 숨긴 DOM 전체 판정을 적었다. 두 엔진 줄바꿈 비교는 자동 테스트 대신 plan 의 수동 캡처 비교로 둔다. 자동화는 Chromium 을 테스트에 띄워야 해 일이 더 크다.
n7 채택 — 켤 때 캐러셀 폴더로 복사, 기본값은 설정 워터마크 기본값.
n8 채택 — 검증 7.
n9 채택 — 요구사항 4 의 초기값과 빈 지시문 장 건너뛰기.
n10 채택 — 목록 조건에 대본 있음 추가.
n11 채택 — 비율은 두 방식 모두 요청 값(설정값 기본). pages.md 6.2 수정 대상.
n12 채택 — 한 대화상자로 합쳤다.
n13 채택 — 짧은 변 1080 기준.
n14 채택 — 라운드 마감 ingest 에서 0026·0027 로 바꾼다.

plan 검토 목록 후보: I1(043 착수를 044·045 뒤로), n2(레거시 모양 차이), n6(줄바꿈 수동 검증).


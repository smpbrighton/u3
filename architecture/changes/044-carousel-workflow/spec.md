# Spec: carousel-workflow
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
1. 「캐러셀 만들기」(영상 카드 메뉴·스튜디오 머리줄): 남긴다. 같은 「새 캐러셀」 대화상자를 「영상으로」+ 그 프로젝트가 골라진 상태로 연다. 입구는 둘이지만 대화상자는 하나다.
2. 글 객체 수: 제목·본문은 지울 수 없고, 추가 글은 3개까지(장당 최대 5개). 이유: uUu 의 제목·본문·CTA 세 객체를 덮고, 인스펙터 섹션 수가 한 화면에 들어간다.
3. 글 효과: 없음·그림자·반투명 바·외곽선 넷. 바 색만 고르고 그림자·외곽선 값은 고정이다.
4. 로고: 설정의 워터마크 이미지를 쓴다. 캐러셀에서 따로 고르지 않는다. 이미지가 없으면 「설정에서 이미지 선택」 링크 한 줄(043 브랜드 패널과 같다).
5. 게시 캡션: 만든다. 기획 때 `caption`(2000자)을 함께 만들고 검토·편집 화면에서 고치며 받기 때 `caption.txt` 를 같은 폴더에 쓴다.
6. 영상 파생 검토: 검토 화면에서 장면(시각)도 바꾼다. 장마다 장면 번호 선택과 시각 입력을 두고 프레임 썸네일을 보인다. 편집 화면의 「이 시각으로 다시 뽑기」는 그대로다.
7. 화풍 입력: 요청 대화상자에 둔다(한 줄, 비우면 AI 가 정한다). 검토 화면에서 값을 고칠 수 있다.
8. 넘친 글: 받기를 막지 않는다. 「넘친 글이 있는 장 n개」 확인 대화상자 뒤 받는다.

## 요구사항
1. 캐러셀 목록 「새 캐러셀」은 첫 단계에서 「주제로」「영상으로」를 고른다. 「영상으로」는 타임라인 영상과 영상 입력이 있는 프로젝트 목록에서 하나를 고른다.
2. 요청 값: 주제(1000자, 「AI 로 다듬기」 유지)·장 수 2–10·비율·화풍(한 줄, 선택). 영상은 프로젝트·장 수·비율.
3. 「기획」을 누르면 캐러셀이 `stage: "review"` 로 만들어지고 검토 화면으로 간다. 이미지·프레임은 만들지 않는다.
4. 검토 화면: 장 카드 목록(번호·제목·본문·이미지 지시문 또는 장면·시각·강조 대상). 글은 바로 고친다. 「장 더하기」(10장까지)·「지우기」(2장까지)·끌어서 순서 바꾸기. 캡션·화풍 입력. 「다시 기획」은 지금 주제·화풍·장 수로 다시 만든다(확인 대화상자). 「이미지 만들기」(주황)가 생성을 시작하고 편집 화면으로 간다.
5. 「이미지 만들기」 뒤 `stage: "images"`. 편집 화면 「검토로 돌아가기」로 글·캡션만 다시 고칠 수 있고, 장 수·순서는 바꿀 수 없다.
6. 글 객체: 장마다 `texts[]`(제목·본문 + 추가 3개). 속성은 글·x·y·폭(장 크기 비율)·폰트(pretendard·gmarket·tmon)·굵기(400·700)·크기(12–200px, 1080 기준)·색·정렬·효과(none·shadow·bar·outline)·바 색·투명도.
7. 미리보기: 글 객체를 끌어 옮기고 오른쪽 가장자리로 폭을 바꾼다. 방향키 1%. 고른 객체가 인스펙터 「글」 섹션 맨 위에 온다. 넘침(글 상자가 장 밖·줄이 상자 밖)은 빨간 테두리로 보인다.
8. 로고: 켜기, x·y·폭(비율), 투명도. 설정 워터마크 이미지를 쓴다.
9. 배경: 밝기 0.2–2.0, 음영 0–0.9(아래쪽 그라데이션). 단독은 이미지 지시문·「다시 만들기」, 영상은 시각·세로 자르기·강조(지금과 같다).
10. 받기: PNG(지금과 같다) + `caption.txt`. 넘친 장이 있으면 확인 대화상자.
11. 저장된 캐러셀: 읽을 때 `title`·`body`·`textPlacement` 를 `texts` 두 개로 바꾼다. 위치·크기·색·그림자는 지금 렌더(패딩 9%·8%, 76/40px, 흰색, 그림자)와 같다. `stage` 가 없으면 `images`.
12. 미리보기와 PNG 는 같은 `CarouselSlide` 컴포넌트다. 글 줄바꿈은 CSS(`word-break: keep-all`, `white-space: pre-wrap`)로 두 쪽이 같다.
13. 043 산출물: pages.md 6 절을 이 흐름으로 다시 쓰고, 아티팩트 캐러셀 페이지에 새 대화상자(방식 선택·주제·영상)·검토(단독·영상)·편집(글 객체 선택·로고·넘침) 보드를 더한다.

## 설계
### 데이터(`src/core/carousel.ts`)
- `CarouselTextObject { id, role: "title"|"body"|"extra", text(5000), x, y, width (0–1), font, weight, fontSize, color, align, effect, barColor?, opacity }`.
- `CarouselSlide` 에 `texts: CarouselTextObject[]`(2–5), `logo?: { enabled, x, y, width, opacity }`, `brightness`(기본 1), `shade`(기본 0.35) 추가. `title`·`body`·`textPlacement` 는 입력 호환용으로 남기고 `preprocess` 에서 `texts` 로 바꾼 뒤 버린다. 저장은 `texts` 만 쓴다.
- `Carousel` 에 `stage: "review"|"images"`, `caption(2000)`. `style` 은 두 방식 모두 선택값.
- 기본 좌표: 제목 x 0.08·y 0.09·폭 0.84, 본문은 제목 아래. `textPlacement` 변환은 지금 flex 배치와 같은 y 를 계산하는 순수 함수 `textsFromLegacy(slide, aspect)` 로 하고 테스트한다.
### API(`src/engine/routes/carousels.ts`, `carousel-store.ts`)
- `POST /api/carousels` 요청에 `style?` 추가, 만들면 `stage: "review"`. 이어서 `POST /:id/plan` 이 기획을 채운다(지금과 같다). 기획 프롬프트에 화풍(있으면)·캡션 요구를 더하고 응답 스키마에 `caption` 을 넣는다.
- `POST /api/projects/:id/carousel`: 기획만 하고 `stage: "review"` 로 만든다. 프레임 추출은 하지 않는다.
- 새 엔드포인트: `POST /:id/slides`(더하기), `DELETE /:id/slides/:slideId`, `PUT /:id/slides/order`, `PATCH /:id`(caption·style·stage→"review"). `PATCH /:id/slides/:slideId` 는 `texts`·`logo`·`brightness`·`shade`·`sceneNumber`·`background.sec` 를 받는다.
- `POST /:id/generate`: `stage` 를 `images` 로 바꾼 뒤 단독은 지금처럼 생성, 영상은 장마다 프레임 추출(지금 `/frame` 로직을 함수로 빼서 부른다)을 큐에 넣는다. 장 수·순서 변경은 `stage: "review"` 에서만 받고 그 밖은 409.
- `POST /:id/download`: `caption.txt` 를 함께 쓴다.
### 합성(`src/remotion/CarouselSlide.tsx`, `carousel-layout.ts`)
- 배경 위에 밝기(`filter: brightness`)와 음영 그라데이션, 글 객체마다 절대 배치 `<div>`(폭=width×장 폭, `pre-wrap`·`keep-all`), 효과: shadow=`text-shadow`, bar=객체 뒤 반투명 바(`barColor`), outline=`-webkit-text-stroke`+그림자. 로고는 워터마크 파일 `<Img>`.
- 넘침 판정은 UI 미리보기의 DOM(`scrollHeight`·경계)으로 한다. 엔진은 판정하지 않는다.
### 화면(`src/ui/screens/Carousels.tsx`, `carousel/*`)
- `NewCarouselDialog`(방식 선택 → 주제 또는 프로젝트 선택 → 요청 값 → 「기획」). `DerivedCarouselDialog` 는 이 대화상자의 「영상으로」 분기로 합친다. 영상 카드 메뉴·스튜디오는 `projectId` 를 넘겨 연다.
- `CarouselReview`(새 화면): 머리줄(이름·「다시 기획」·「이미지 만들기」), 장 카드 목록(끌어 순서), 캡션·화풍 입력.
- `CarouselEdit`(지금 편집 화면): 미리보기에 글 객체 선택·끌기·폭 핸들(기존 강조 상자 끌기와 같은 방식), 인스펙터 섹션 「글」(고른 객체가 위, 나머지 접힘, 「글 더하기」)·「로고」·「배경」·「강조」(영상)·「캡션」. 머리줄에 「검토로 돌아가기」.
- 043 pages.md 6 절·아티팩트 보드: 이 절의 화면대로.

## 결정
- [0026](../../decisions/0026-scope-carousel-review-texts.md): 범위(0022 대체). 캐러셀은 두 방식 모두 요청 → 기획 → 검토 → 이미지 → 편집 → 받기. 글 객체·로고·배경 밝기·음영·게시 캡션을 더한다. 근거 조사·기획안 비교·톤 프리셋·인물 사진·마스크 편집은 여전히 없다.
- [0027](../../decisions/0027-carousel-text-objects.md): 캐러셀 글(0019 대체). 이미지는 글자 없는 배경(유지), 글은 장당 2–5 개의 객체로 앱이 얹고 위치·폭·폰트·크기·색·정렬·효과를 가진다. 미리보기와 PNG 는 같은 컴포넌트.

## 우려 사항
- 043 intent 의 제약 「기능·데이터·엔진 API 는 바꾸지 않는다」와 어긋난다. 043 은 보류 중이고 사용자가 044·045 를 먼저 잡기로 했다(043 design.md 보류 기록). 소유자: 사용자. 추천: 043 plan.md 단계 B 의 B3 을 이 변경의 plan 으로 대체한다고 적는다.
- 검토 단계가 늘어 「절차는 최대한 간단하게」와 긴장한다. 소유자: 사용자. 추천: 검토는 한 화면이고 「이미지 만들기」 한 번으로 넘어간다. 단계는 하나만 는다.
- 외곽선 효과는 `-webkit-text-stroke` 에 의존한다. Remotion 렌더(Chromium)와 Tauri 웹뷰(WebKit)에서 두께가 다를 수 있다. 소유자: 엔지니어링. 추천: plan 에서 두 쪽 캡처를 비교하고 다르면 외곽선을 뺀다.

## 검증 기준
1. `pnpm verify` 통과.
2. `tests/core/carousel-texts.test.ts`: 레거시 장(`title`·`body`·`textPlacement` 세 값×비율 넷)이 `texts` 두 개로 바뀌고 저장 JSON 에 레거시 키가 없다.
3. `tests/server/carousel-workflow.test.ts`: 주제·영상 두 방식 모두 만들면 `stage: "review"` 이고 이미지·프레임 작업이 없다. 장 더하기·지우기·순서가 2–10 범위를 지키고 `images` 단계에서는 409. `generate` 가 `stage` 를 `images` 로 바꾼다. 받기가 `caption.txt` 를 쓴다.
4. `tests/ui/new-carousel-dialog.test.tsx`: 두 방식 모두 「기획」 뒤 검토 화면으로 간다. 영상 카드에서 열면 프로젝트가 골라져 있다.
5. `tests/ui/carousel-text-drag.test.tsx`: 글 객체를 끌면 PATCH 에 바뀐 x·y 가 간다.
6. 렌더 테스트: `texts` 좌표 둘로 PNG 를 만들고 글 영역의 픽셀 위치가 좌표와 맞는다(기존 캐러셀 렌더 테스트 방식).
7. 043 아티팩트에 보드가 추가되고 pages.md 6 절이 바뀐 커밋.

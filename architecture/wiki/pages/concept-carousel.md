# 캐러셀 생성

## 요약
캐러셀은 주제에서 이미지를 생성하거나 영상 프로젝트의 장면 프레임을 사용한다. 각 장의 텍스트와 배경을 편집하고 PNG를 받는다. `src/core/carousel.ts` `src/engine/routes/carousels.ts` `src/ui/screens/Carousels.tsx` `architecture/changes/030-carousel-images/spec.md` `architecture/changes/033-carousel-from-video/spec.md`

## 내용
- 이미지 생성은 전용 큐에서 동시 실행 수를 제한한다. 장마다 상태를 저장하고 중단된 작업을 복구할 때 실패 상태로 바꾼다. `src/engine/image-queue.ts` `src/engine/carousel-store.ts` `src/engine/routes/carousels.ts`
- Codex 이미지 실행은 결과 PNG를 검사하고 실행의 session id로 생성 파일을 찾는다. `src/engine/pipeline/codex-image.ts` `architecture/changes/030-carousel-images/spec.md`
- 영상 파생 캐러셀은 프레임 배경과 강조 영역을 사용한다. Jev Box 결과와 사용자 편집을 처리한다. `src/core/carousel.ts` `src/engine/pipeline/carousel-frame.ts` `src/engine/pipeline/jev-box.ts` `src/ui/screens/carousel/BackgroundSection.tsx`
- 이미지 비율은 4:5, 1:1, 9:16, 16:9를 지원한다. 텍스트 렌더링은 배경과 별도로 처리한다. `src/core/carousel.ts` `src/remotion/CarouselSlide.tsx` `git:6f86659:`
- 실제 Codex image_gen의 ephemeral 파일 유지 여부와 실제 외부 서비스 전체 흐름의 실행 증거는 코드에서 못 찾음. `architecture/changes/030-carousel-images/spec.md`
- 결정 링크: [캐러셀 범위](../../decisions/0026-scope-carousel-review-texts.md), [글 객체](../../decisions/0027-carousel-text-objects.md). `git:480b5ec:`

- 캐러셀 파일 URL은 토큰이 포함된 `/api/media/carousels/` 경로를 사용한다. 배포된 Tauri 앱은 엔진 origin을 붙이고 개발 환경은 상대 경로를 쓴다. `src/ui/api.ts` `src/engine/routes/media.ts` `git:2432e77:`
- 이미지 URL이 비어 있으면 미리보기의 이미지와 강조 이미지 렌더를 생략한다. 인스펙터는 grid 열과 segmented control의 최소 폭을 제한한다. `src/remotion/CarouselSlide.tsx` `src/ui/styles.css` `git:2432e77:`
- 변경 계획은 내려받은 영상 캐러셀 PNG 5개에 프레임과 텍스트가 있었다고 기록한다. 해당 파일과 별도 실행 증거는 코드에서 못 찾음. `architecture/changes/042-carousel-image-view/plan.md` `git:e0ecd51:`
- URL·미디어 경로·빈 이미지 테스트가 추가되었다. 수정 전후 실행 출력, `pnpm verify`, 브라우저 넘침 검사, 패키징 앱에서 일반·영상 캐러셀 이미지 확인의 실행 증거는 코드에서 못 찾음. `tests/ui/carousel-file-url.test.ts` `tests/server/carousel-media.test.ts` `tests/remotion/carousel-slide.test.tsx` `architecture/changes/042-carousel-image-view/plan.md` `git:2432e77:`

- 새 캐러셀은 `review` 단계로 생성하며, 영상 파생은 기획 후 이미지·프레임 작업을 시작하지 않는다. `generate`가 `images` 단계로 전환하고 주제별 이미지 또는 장별 영상 프레임 작업을 시작한다. `src/engine/routes/carousels.ts` `git:a351ab2:`
- 검토 단계에서 장을 추가·삭제·정렬하고 캡션과 화풍을 수정한다. 생성 단계에서는 장 추가·삭제·정렬이 거부된다. 다운로드는 PNG와 `caption.txt`를 저장한다. `src/engine/carousel-store.ts` `src/engine/routes/carousels.ts` `git:e205fb4:` `git:a351ab2:`
- 장은 제목·본문을 포함하는 2–5개의 글 객체와 선택적 로고, 밝기와 음영을 가진다. 레거시 제목·본문·위치는 읽을 때 글 객체로 변환하고 단계 기본값은 `images`다. `src/core/carousel.ts` `git:34fd789:`
- 합성은 글 객체의 위치·폭·폰트·색·효과와 로고·밝기·음영을 사용한다. 설정의 워터마크는 캐러셀 폴더로 복사한다. `src/remotion/CarouselSlide.tsx` `src/remotion/carousel-layout.ts` `src/engine/carousel-store.ts` `git:8e5d3c3:`
- 기존 화면은 제목·본문과 세 위치를 편집한다. 검토 화면과 글 객체의 자유 배치·속성 편집 화면은 아직 없으며 043에서 구현할 대상이다. `src/ui/screens/Carousels.tsx` `architecture/changes/044-carousel-workflow/plan.md` `git:8e5d3c3:`
- 수동 확인에서 레거시 캐러셀 두 개를 새 스키마로 읽었다는 사용자 제공 증거가 있다. 첫 장 PNG 두 파일이 `/Volumes/X31/.cache/u3/design/044-capture/`에 있다. 읽기 응답 원본과 이전 모양과의 비교 결과는 코드에서 못 찾음. `architecture/changes/044-carousel-workflow/plan.md` `git:8e5d3c3:`
- 044의 `pnpm verify` 실행 출력과 PNG 픽셀 테스트 통과 또는 skip 결과는 코드에서 못 찾음. WebKit 미리보기와 Chromium PNG의 줄바꿈 비교, 넘침 표시와 받기 전 확인은 미검증이다. 화면 작업은 043에 남아 있다. `architecture/changes/044-carousel-workflow/plan.md` `tests/engine/render-carousel.test.ts` `architecture/changes/044-carousel-workflow/review.md`

## 관계
- [자막과 장면 검토](concept-caption-scene-review.md)
- [U3 데스크톱 앱](entity-desktop-app.md)
- [타임라인 편집](concept-timeline-editing.md)
- [로컬 모델과 리소스](concept-local-models.md)

## 출처
- `architecture/changes/044-carousel-workflow/spec.md`
- `architecture/changes/044-carousel-workflow/plan.md`
- `architecture/changes/030-carousel-images/spec.md`
- `architecture/changes/033-carousel-from-video/spec.md`
- `src/core/carousel.ts`
- `src/engine/carousel-store.ts`
- `src/engine/image-queue.ts`
- `src/engine/routes/carousels.ts`
- `src/engine/pipeline/codex-image.ts`
- `src/engine/pipeline/carousel-frame.ts`
- `src/engine/pipeline/jev-box.ts`
- `src/remotion/CarouselSlide.tsx`
- `src/ui/screens/Carousels.tsx`
- `6f86659`

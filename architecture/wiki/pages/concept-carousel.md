# 캐러셀 생성

## 요약
캐러셀은 주제에서 이미지를 생성하거나 영상 프로젝트의 장면 프레임을 사용한다. 각 장의 텍스트와 배경을 편집하고 PNG를 받는다. `src/core/carousel.ts` `src/engine/routes/carousels.ts` `src/ui/screens/Carousels.tsx` `architecture/changes/030-carousel-images/spec.md` `architecture/changes/033-carousel-from-video/spec.md`

## 내용
- 이미지 생성은 전용 큐에서 동시 실행 수를 제한한다. 장마다 상태를 저장하고 중단된 작업을 복구할 때 실패 상태로 바꾼다. `src/engine/image-queue.ts` `src/engine/carousel-store.ts` `src/engine/routes/carousels.ts`
- Codex 이미지 실행은 결과 PNG를 검사하고 실행의 session id로 생성 파일을 찾는다. `src/engine/pipeline/codex-image.ts` `architecture/changes/030-carousel-images/spec.md`
- 영상 파생 캐러셀은 프레임 배경과 강조 영역을 사용한다. Jev Box 결과와 사용자 편집을 처리한다. `src/core/carousel.ts` `src/engine/pipeline/carousel-frame.ts` `src/engine/pipeline/jev-box.ts` `src/ui/screens/carousel/BackgroundSection.tsx`
- 이미지 비율은 4:5, 1:1, 9:16, 16:9를 지원한다. 텍스트 렌더링은 배경과 별도로 처리한다. `src/core/carousel.ts` `src/remotion/CarouselSlide.tsx` `git:6f86659:`
- 실제 Codex image_gen의 ephemeral 파일 유지 여부와 실제 외부 서비스 전체 흐름의 실행 증거는 코드에서 못 찾음. `architecture/changes/030-carousel-images/spec.md`
- 결정 링크: [캐러셀 범위](../../decisions/0017-scope-carousel-two-modes.md), [이미지 비율](../../decisions/0019-carousel-image-aspects.md). `git:6f86659:`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [타임라인 편집](concept-timeline-editing.md)
- [로컬 모델과 리소스](concept-local-models.md)

## 출처
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

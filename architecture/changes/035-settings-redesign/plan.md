# Plan: settings-redesign (lite)
Track: lite.

## Context
사용자가 설치 앱의 설정 화면을 보고 다음을 요청했다(원문): 「설정창은 seed-design을 입혀주고 전부 개행해서 표기하지말고 2열 또는 3열로 유기적으로 표기해. 그리고 프롬프트는 1열로 보이고 적당한 세로 길이에 스크롤 되게해. 이미지 모델은 9:16 16:9 비율도 지원해주고 브랜드는 미리보기 가능하게 해줘. 자동 알림음도 seed-design 입혀주고」.
지금 설정 화면은 카드가 한 열로 길게 이어지고, 브랜드 카드는 숫자 입력을 줄마다 하나씩 두며, 자동 알림음 카드는 SEED 가 아닌 기본 input(checkbox·select·range)을 쓴다. 캐러셀 비율은 4:5·1:1 뿐이다(결정 0015).

## 검토 목록
| # | 항목 | 추천 | 이유 | 근거 |
|---|---|---|---|---|
| 1 | 결정 0019 가 0015 를 대체한다: 캐러셀 비율에 9:16(1080×1920)·16:9(1920×1080)을 더한다 | 받는다 | 사용자 지시. 0015 의 나머지(codex image_gen, 글자는 위에 얹음, 설정 옵션)는 그대로 옮긴다 | `architecture/decisions/0015-carousel-codex-image-gen.md` |
| 2 | image_gen 요청 크기: 9:16 은 1008×1792, 16:9 는 1792×1008(16 의 배수, 정확한 비율). 결과는 지금처럼 가운데를 잘라 1080 짧은 변 기준으로 맞춘다 | 받는다 | W36 확인: 요청 크기와 실제 크기가 달라도 자르기로 맞춘다 | `src/engine/pipeline/codex-image.ts` |
| 3 | 16:9 장의 글자 배치: 위·가운데·아래 위치는 그대로, 본문 폭은 화면 폭의 60% 로 줄인다 | 받는다 | 가로가 긴 화면에서 한 줄이 너무 길어지지 않게 한다 | `src/remotion/carousel-layout.ts` |
| 4 | 설정 배치: CSS grid `repeat(auto-fit, minmax(340px, 1fr))` 로 2~3열. 프롬프트 카드(대본·화자·말투·성격·자막 검수)는 모든 열을 차지하는 1열 묶음. 프롬프트 칸 높이는 240px 고정, 넘치면 칸 안에서 스크롤 | 받는다 | 창 폭에 따라 2열 또는 3열이 된다 | 사용자 지시 |
| 5 | 브랜드 미리보기: 브랜드 카드 안에 9:16 작은 미리보기(약 220px 폭). 미리보기는 렌더와 같은 Remotion 컴포넌트(타이틀 바·워터마크 층)를 회색 배경 위에 그리고, 예시 타이틀 글 「타이틀 미리보기」를 쓴다. 저장 전 값도 바로 보인다 | 받는다 | 내보내기와 같은 모양을 보인다 | 사용자 지시 |
| 6 | 033(W41) 이 같은 `aspect` 스키마를 쓴다. 035 는 W41 병합 뒤 그 위에서 구현한다 | 받는다 | 같은 파일 충돌을 한 번만 푼다 | `src/core/carousel.ts` |

## 바꿀 파일
- `architecture/decisions/0019-carousel-image-aspects.md` (new), `0015-…`(superseded-by 0019), `architecture/INTENT.md`(0015 줄 교체).
- `src/core/carousel.ts`, `src/engine/pipeline/codex-image.ts`, `src/engine/routes/system.ts`(image-options 검증), `src/remotion/carousel-layout.ts`, `src/remotion/CarouselSlide.tsx`, `src/remotion/Root.tsx`(Composition 크기): 비율 넷.
- `src/engine/routes/carousels.ts`, `src/engine/carousel-store.ts`: 파생 캐러셀 비율 검증과 저장 타입을 비율 넷으로 확장.
- `src/ui/screens/Settings.tsx`, `src/ui/styles.css`: grid 배치, 프롬프트 1열 묶음과 고정 높이 스크롤, 브랜드 카드 SEED 정리(숫자 입력을 Slider+값 표시로, 2열 묶음)와 미리보기, 자동 알림음 카드를 SEED Switch·Select·Slider·ActionButton 으로.
- `src/ui/settings/BrandPreview.tsx` (new): 미리보기 컴포넌트(@remotion/player, 브랜드 층만).
- `src/ui/screens/Carousels.tsx`: 비율 넷의 썸네일·미리보기 크기.
- 테스트: `tests/core/carousel.test.ts`(비율 넷 스키마·캔버스 크기), `tests/engine/codex-image.test.ts`(요청 크기·자르기), `tests/server/carousels.test.ts` 또는 system 테스트(image-options 비율 검증).

## 순서
1. W47(워커, W41 병합 뒤): 실패 테스트(비율 넷) 커밋 → 엔진·Remotion·스키마 구현 → 설정 화면 재배치·SEED·브랜드 미리보기·자동 알림음 카드.
2. 조정자: 결정 0019 와 INTENT 갱신(병합 뒤), 패키징·시험 실행으로 설정 화면 캡처(창 폭 1280·1600 두 가지), 9:16 캐러셀 1장 실제 생성.
3. 설치 뒤 사용자에게 설정 화면 확인 요청.

## 리스크
- 가장 위험한 단계: Settings.tsx 대규모 재배치. W46·W41 과 같은 파일을 바꾸지 않도록 W47 을 그 뒤에 시작한다.
- 16:9 장은 게시 앱(인스타그램 캐러셀)에서 잘릴 수 있다. 확인하지 않았다. 사용자 선택으로 둔다.
- 택하지 않은 대안: 설정을 탭으로 나누기(사용자는 한 화면 다열 배치를 원했다).

## 증명
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- 비율 넷 단위 테스트 통과.
- 시험 실행 캡처: 설정 화면 2열·3열, 프롬프트 칸 스크롤, 브랜드 미리보기, 자동 알림음 카드. 9:16 캐러셀 1장(low) 실제 생성 결과 PNG 1080×1920.

## 롤백
`aspect` 값만 더한다. 되돌리면 9:16·16:9 로 만든 캐러셀은 스키마 검증에서 읽히지 않으므로, 되돌리기 전에 그 캐러셀을 알린다.

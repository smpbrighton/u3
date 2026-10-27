# Plan: brand-title-content (lite)
Track: lite.

## Context
사용자가 설치 앱(W54)을 확인하고 네 가지를 요청했다(원문 요지).
1. 「자막 레이어가 크기가 맞질 않아서 세이프존이 켜진 상태에서 좌측에 꽉 차버린 관계로, 우측으로 쏠려버린 현상」
2. 「짤방 레이어도 선택 시 크기가 맞지 않는 마이너한 이슈」
3. 「브랜드 타이틀은 스튜디오에서 적는 것으로 되어 있는데, 기본값은 설정에서 정하고 텍스트 또는 이미지를 선택해서 채울 수 있게 해줘, 워터마크와 브랜드 타이틀은 카드 레이아웃을 분리해줘」
4. 「화자는 삭제해」
나머지(032 끌기 9개, 033 파생 캐러셀, 035 설정 화면)는 사용자가 확인했다. 작업자는 Orca 로 띄운 codex 다.

사용자 답: AI 제목 자동 채우기는 끈다. 타이틀 이미지는 설정에 올린 한 장만 쓴다.

## 확인한 원인과 가설
- **자막(확인):** `snapBoxToSafeZone`(`src/core/preview-geometry.ts:33`)은 상자 아래 끝이 `RIGHT_RAIL_TOP`(1024) 아래면 좌우 여백 160px 을 쓴다. 쓸 수 있는 폭은 760px 이다. 자막 상자 최대 폭은 `SAFE_WIDTH`(960px) 이다. 상자가 760px 보다 넓으면 x 가 왼쪽 여백 160 에 붙고, 상자는 오른쪽 캔버스 밖으로 나간다. 그래서 자막 중심이 오른쪽으로 옮겨진다.
- **자막 크기(가설, 작업자가 증명):** 스크린샷에서 상자 폭은 글줄 폭 + 좌우 패딩보다 약 140 캔버스 px 넓다. `measureCaption`(`src/remotion/caption-measure.ts`)은 canvas `measureText` 로 잰다. 코드 어디에도 `document.fonts` 대기나 `delayRender` 가 없다. 웹폰트가 늦게 오면 대체 폰트로 잰 폭이 `useMemo` 에 남는다. 작업자는 앱에서 측정 폭과 DOM 글줄 폭을 비교해 원인을 확정한다.
- **짤(가설, 작업자가 증명):** 선택 상자와 짤 창은 `memeAspects[memeId]`(라이브러리 width·height) 로 높이를 정한다. `<Video objectFit="contain">` 이 실제 영상을 창 안에 좌우 여백을 두고 그린다. 스크린샷의 창 비율은 0.71, 보이는 짤 비율은 0.80 이다. 라이브러리 값과 실제 표시 비율(SAR·회전 포함)이 다르다. 작업자는 해당 짤(Futurama 「HOPEFULLY」)의 라이브러리 값과 ffprobe 값을 비교한다.

## 검토 목록
| # | 항목 | 추천 | 이유 |
|---|---|---|---|
| 1 | 세이프존 스냅: 상자 폭이 그 높이의 안전 폭보다 넓으면 가로를 캔버스 가운데에 둔다. 세로 스냅은 그대로다 | 받는다 | 상자가 캔버스 밖으로 나가지 않고 중심도 옮겨지지 않는다. 줄바꿈 폭은 바꾸지 않아 끌 때 글줄이 바뀌지 않는다 |
| 2 | 자막 측정: 원인이 폰트 로딩이면 `measureCaption` 결과를 폰트 로딩 뒤 다시 잰다. 렌더(Remotion)는 `delayRender` 로 폰트를 기다린다. 미리보기는 `document.fonts` 의 `loadingdone` 뒤 다시 그린다 | 받는다 | 렌더와 미리보기 모두 같은 폰트로 잰다 |
| 3 | 짤 비율: 원인 지점(라이브러리 메타 생성 또는 ffprobe 해석)에서 표시 비율(width×SAR/height, 회전 반영)을 쓴다. 이미 만든 라이브러리 색인은 다시 만든다 | 받는다 | 렌더 창과 선택 상자가 같은 값을 쓴다 |
| 4 | 결정 0020: 타이틀 바 내용의 기본값을 설정에 둔다. 종류는 글·이미지 중 하나다. 이미지는 설정에 올린 한 장이다. 영상은 켜기·끄기, 종류, 글, 높이·글자 크기·투명도를 따로 가질 수 있다. 새 영상에 AI 제목을 자동으로 채우지 않는다. 0016 의 타이틀 바 부분을 보완한다(대체 아님) | 받는다 | 사용자 지시와 답 |
| 5 | 스키마: `BrandSettings.titleBar` 에 `kind: "text"|"image"`(기본 text), `text`(≤30, 기본 ""), `file`(`title.(png|jpg|webp)`) 추가. 기존 저장값은 기본값으로 읽는다. `TimelineBrand.titleBar` 의 `text` 는 optional, `kind` optional 추가. 영상 값이 없으면 설정값을 쓴다 | 받는다 | 옛 settings·프로젝트가 그대로 열린다 |
| 6 | 렌더: `render.titleBar` 에 `kind`·`file` 추가. 이미지 종류는 바 높이에서 위아래 패딩을 뺀 높이 안에 `contain` 으로 가운데 그린다. 배경 색·투명도는 그대로 쓴다. 보임 조건은 `enabled ?? (종류에 맞는 내용이 있음)` | 받는다 | 워터마크와 같은 파일 해석 경로(`src/engine/pipeline/render.ts:99`, Preview 의 `brandMediaUrl`)를 쓴다 |
| 7 | 엔진: `POST/DELETE /api/system/brand/title-image` 를 워터마크 라우트(`src/engine/routes/system.ts:59-85`)와 같은 방식으로 추가한다. 파일은 store `brand/title.<ext>` | 받는다 | 기존 패턴 재사용 |
| 8 | 생성: `from-script.ts:119` 가 `brand.titleBar.text` 를 채우지 않는다. 캐러셀 제목은 지금처럼 `titleBar.text ?? script.title` 이다 | 받는다 | 사용자 답 |
| 9 | 설정 화면: 브랜드 카드를 「워터마크」 카드와 「타이틀 바」 카드로 나눈다. 각 카드는 자기 층만 그리는 `BrandPreview` 와 저장 버튼을 갖는다. 타이틀 바 카드: 내용 종류 SegmentedControl(글·이미지) → 글이면 기본 글 입력, 이미지면 이미지 선택·지우기 → 기존 스타일 컨트롤 | 받는다 | 사용자 지시 |
| 10 | 스튜디오 브랜드 Inspector: 타이틀 바에 종류 SegmentedControl 을 둔다. 글 입력의 placeholder 는 설정 기본 글이다. 빈 글은 설정 기본 글을 쓴다. 「다시 만들기」(AI 제목)는 글 종류에서 유지한다. 이미지 종류는 설정 이미지가 없으면 안내 문구를 보인다 | 받는다 | 결정 0020 |
| 11 | 화자 삭제: 설정 화면 필드, `ScriptVoiceSettings.speaker`, 대본·검수 프롬프트의 화자 설정 줄, `/api/system` 의 speaker 입력·출력을 지운다. 저장된 `scriptSpeaker` 값은 읽지 않는다(파일에서 지우지 않는다) | 받는다 | 사용자 지시. 프롬프트 본문의 일반 「화자」 지침(이야기 속 화자)은 남긴다 |
| 12 | 장부: 032·033·035 를 done 으로 닫는다. 037 을 impl 로 연다 | 받는다 | 사용자 확인 끝 |

## 바꿀 파일
- 결정·문서: `architecture/decisions/0020-title-bar-content.md`(new), `architecture/INTENT.md`(결정 줄 추가), 이 plan.md.
- 버그: `src/core/preview-geometry.ts`(스냅), `src/remotion/caption-measure.ts`·`src/remotion/U3Short.tsx`·`src/ui/studio/Preview.tsx`(폰트 대기), 짤 메타 생성 지점(작업자가 찾음, `src/engine/` 라이브러리 색인).
- 타이틀: `src/core/schema.ts`, `src/core/timeline/to-render.ts`, `src/core/timeline/from-script.ts`, `src/engine/routes/system.ts`, `src/engine/pipeline/render.ts`, `src/remotion/U3Short.tsx`(BrandTitleBar), `src/ui/screens/Settings.tsx`, `src/ui/settings/BrandPreview.tsx`, `src/ui/studio/Inspector.tsx`, `src/ui/studio/Preview.tsx`, `src/ui/styles.css`.
- 화자: `src/core/script-prompt.ts`, `src/core/script-review.ts`, `src/engine/routes/script.ts`, `src/engine/routes/system.ts`, `src/ui/screens/Settings.tsx`.
- 테스트: `tests/core/preview-geometry*.test.ts`(넓은 상자 가운데 스냅), 짤 비율 원인 지점 테스트, `tests/core/to-render*.test.ts`(타이틀 종류·기본값·보임 조건), 엔진 title-image 라우트 테스트, from-script 테스트(자동 제목 없음), 화자 관련 기존 테스트 갱신.

## 순서
1. 조정자: 워크트리 생성(`orca worktree create --name 037-brand-title-content --no-parent --agent codex`), plan.md 커밋, 장부 갱신.
2. W55(codex): 실패 테스트 커밋(스냅·짤 비율) → 코드 수정 커밋. 자막 폰트 원인은 앱에서 증명 후 CSS·DOM 결함이면 본문에 이유를 적고 고친다.
3. W56(codex): 화자 삭제.
4. W57(codex): 타이틀 바 내용(스키마·엔진·렌더·설정 카드 분리·스튜디오). 테스트 먼저.
5. 조정자: diff 를 이 plan 과 대조 → 결정 0020·INTENT 커밋 → main ff 병합 → `pnpm verify` → `pnpm package` → `~/Applications/U3.app` 재설치(이전 앱은 휴지통) → X31 시험 데이터로 화면 확인(설정 두 카드, 타이틀 이미지·글, 자막 상자 스냅, 짤 상자) → 워크트리 정리.
6. 사용자 확인 뒤 `/smp:wiki ingest`(2fe8d4d..HEAD) 와 037 done.

## 검증
- `pnpm verify` 마지막 줄 `✓ verify passed`(워커 워크트리와 병합 뒤 main 둘 다).
- 앱 확인: 세이프존 켜고 자막 레이어를 아래 rail 구역에 놓았을 때 자막이 가로 가운데에 남고 상자가 캔버스 안에 있다. 짤 선택 상자 폭이 보이는 짤 폭과 같다. 설정에서 타이틀 이미지를 올리면 새 영상과 스튜디오 미리보기·내보내기 mp4 에 이미지가 나온다. 설정 「대본 프롬프트」에 화자 칸이 없다.
- 모든 명령에 X31 캐시 접두사를 붙인다. 실제 `~/Library/Application Support/U3/` 에는 쓰지 않는다.

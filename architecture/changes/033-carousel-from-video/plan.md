# Plan: carousel-from-video (full)
Track: full. 일괄 승인 계획(030·032·033·034)의 한 부분이다. 공통 절은 아래 「일괄 계획 공통」에 있다.

### 바꿀 파일
- `src/core/carousel.ts`: `source`, `Slide.background`(generated·frame), topic 출처일 때만 `topic`·`style`·`imagePrompt` 필수.
- `src/core/carousel-frame.ts` (new): 장면 번호 → 영상 1 본 화면 클립 → 타임라인 시각, 짤이면 가까운 본 화면.
- `src/core/jev-api.ts`, `src/engine/pipeline/jev-box.ts` (new): Box 질문(`jev-1.14.0`), multipart 이미지 요청. 형식은 TypeSafe 공식 문서로 확인.
- `src/engine/pipeline/carousel-frame.ts` (new): 영상 1 만 남긴 Timeline 의 renderStill(1080×1920, 자르지 않음).
- `src/engine/routes/carousels.ts`: `POST /api/projects/:id/carousel`, 장 `frame`·`highlight` API.
- `src/engine/pipeline/codex-image.ts`: 참고 이미지 `-i` 와 AI 윤곽 지시문(「글자 없음」 없음).
- `src/remotion/CarouselSlide.tsx`: 프레임 배경·cropY·강조 셋.
- `src/ui/screens/CarouselWorkspace.tsx`(배경 절), `Studio.tsx`(머리 줄 버튼), `Home.tsx`(카드 Menu): `PreviewEditLayer` 재사용.
- 테스트: `tests/core/carousel-frame.test.ts`, `tests/engine/jev-box.test.ts`, `tests/server/carousel-derived.test.ts` 등.

### 단위
- W41: 데이터·프레임·Box·파생 기획·AI 윤곽 엔진. 첫 작업으로 Jev Box 를 실제 프레임 1장(`out/manual` 시험 프로젝트)으로 1회 호출해 형식을 확인하고 보고한다. 테스트: 030 형식 읽기, 파생 기획 검증, 시각 변환, cropY, Box 응답·낮은 confidence, 프레임 다시 뽑기 격리, 원본 삭제 뒤 읽기와 다시 뽑기 거부, 손으로 고친 상자 병합, Jev 꺼짐, AI 윤곽 지시문.
- W42: 화면(배경 절, 시각 슬라이더, 자르기, 강조 Segmented, 대상, 색·두께, 상자 끌기·직접 그리기).

### 증명
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- 실제 확인(조정자, 앱 창 캡처): 실제 영상 프로젝트에서 5장 파생, 1장 테두리, 1장 AI 윤곽, 모두 받기.

### 리스크
- 가장 위험한 단계: W41 의 Jev Box 형식(문서 미확인). 형식이 다르면 W41 에서 멈추고 보고한다.
- 택하지 않은 대안: 로컬 분할 모델(새 모델 배포), codex 가 프레임을 보고 시각을 고르기(호출이 무겁다).

### 롤백
캐러셀 데이터에 필드를 더할 뿐이다. revert 하면 파생 캐러셀은 열리지 않으므로, 되돌리기 전에 사용자에게 알린다.

## 일괄 계획 공통
## Context
Confluence 「26-10-26 U3 추가 및 고도화 기능 아이데이션」을 바탕으로 네 변경을 한 번에 승인받고 codex 워커로 병렬 구현한다. 030·032·033 은 full 트랙(intent·spec accepted, review draft 커밋)이고, 034 는 lite 트랙이다. 승인되면 이 파일을 변경마다 `plan.md` 로 나눠 커밋하고, 030·032·033 은 `accept.sh --with-plan <slug>` 로 review·plan 을 받는다.

### 검토 목록 (승인 전에 볼 것)
| # | 항목 | 추천 | 이유 | 근거 |
|---|---|---|---|---|
| 1 | 결정 0018 이 0009 를 대체한다: Jev Box(`jev-1.14.0`) 추가, 프레임 이미지를 TypeSafe 로 보냄(새 경로) | 받는다. 설정의 Jev 끄기로 막을 수 있다 | 끄면 상자를 직접 그리면 된다 | 033 spec 결정, review I1·n1 |
| 2 | 033 AI 윤곽 강조는 프레임 전체를 다시 그린다(상품 글자·얼굴이 바뀔 수 있음) | 상자 강조를 기본으로, AI 윤곽에는 안내 문구 | 상품 콘텐츠는 상품이 정확해야 한다 | 033 spec 우려 1 |
| 3 | 032 서브 자막 언어는 영어 고정(고르는 설정 없음) | 받는다 | 요구는 한글 메인·영어 서브다 | 032 review n11(기각) |
| 4 | 라이브러리 notify 소리(「카톡」「iPhone Notification」 등, 출처 myinstants)의 사용 권리를 확인하지 않았다. 자동 알림음 기본은 「띠링- 소리」 | 목록은 그대로, 권리 점검은 따로 | 라이브러리 전체 문제다 | 032 review n12 |
| 5 | 티몬체 라이선스 문구가 엇갈리고 공식 배포처가 열려 있는지 모른다 | 원본·라이선스 그대로 넣고, 못 받으면 티몬체를 빼고 알린다 | 원문을 확인할 수 없는 파일을 배포하지 않는다 | 032 spec 우려 1 |
| 6 | 032 자막 위치 기준을 「상자 아래 끝」으로 바꾼다(기본 1480). 타이틀 바가 보이면 자막을 바 영역으로 옮길 수 없다 | 받는다 | 세이프존 안에 두고 바에 가리지 않는다 | 032 review n2·n13 |
| 7 | 030 받기는 받는 장만 01 부터 다시 번호를 매긴다 | 받는다 | 게시 앱에 순서대로 올린다 | 030 review 12 |
| 8 | 030 codex 의 `generated_images`(사용자 codex 데이터)는 지우지 않는다 | 받는다 | 앱 밖 데이터다 | 030 review 11 |
| 9 | 034 는 uUu v12(스티븐, `ef12340`) 대본 지침을 U3 출력 형식에 맞게 옮긴다. 상품·채널 변수, 공개 단어, visual, upload, TTS 억양 문구는 뺀다 | 받는다 | U3 대본은 영상 입력 장면·자막이고 TTS·상품 입력이 없다 | uUu `prompts/script.default.md` |
| 10 | 034 는 대본 생성마다 codex 를 한 번 더 부른다(자막 검수) | 받는다. 실패하면 초안을 쓴다 | uUu 의 낭독 검수가 문장 품질을 만든 단계다 | uUu `prompts/script-review.default.md` |
| 11 | 034 는 설정의 「앱이 항상 덧붙이는 규칙」 목록을 화면에서 지운다(규칙은 계속 붙는다) | 받는다 | 사용자 지시 | 사용자 메시지 |
| 12 | 032 색 고르기는 `react-colorful`(MIT 확인 필요)을 쓴다 | 받는다 | SEED React 에 색 선택 컴포넌트가 없다(llms.txt 확인) | seed-design.io/react/llms.txt |
| 13 | 병합 순서: W32(공통) → 032 → 030 → 033. 034 는 W32 뒤 아무 때나 | 받는다 | 같은 파일을 두 번 일반화하지 않는다 | 032 review I2 |

### 진행 방식
- 조정자는 코드를 쓰지 않는다. 단위마다 `orca worktree create … --agent codex --model gpt-6-luna --effort high` 로 워커를 띄우고, 재검토 → 워크트리에서 `pnpm verify` → main ff 병합 → 정리를 한다. 같은 단위에서 수정 요청이 3회를 넘으면 멈춘다.
- 동시 워커는 최대 3개다. 워커는 범위 밖 파일을 고치지 않고, 테스트를 고쳐서 통과시키지 않는다. 버그 수정은 실패 테스트를 먼저 커밋한다. CSS·DOM 결함은 테스트 없이 고치고 커밋 본문에 이유를 적는다.
- 각 변경의 계획 커밋 브랜치(030·032·033·034)는 단위 브랜치가 main 에 병합될 때 함께 들어가도록, 첫 단위 워커를 그 변경 브랜치 위에서 시작한다(030 은 W32 병합 뒤 main 에 rebase).
- 끌기 동작은 사용자가 검증한다. W37 병합·설치 뒤 조정자가 확인할 동작 목록과 빌드 위치를 요청으로 낸다.

### 단위와 순서
| 파 | 단위 | 변경 | 내용 | 선행 |
|---|---|---|---|---|
| 1 | W32 | 032 | codex 실행기 일반화 | — |
| 1 | W33 | 032 | 데이터·마이그레이션·렌더 기초·폰트 | — |
| 1 | W34 | 030 | 캐러셀 저장소·스키마·이미지 전용 큐 | — |
| 2 | W35 | 034 | 대본 지침 이식·화자/말투/성격·자막 검수 | W32 |
| 2 | W36 | 030 | 이미지 실행기·기획·다듬기·API·이미지 옵션 설정 | W32, W34 |
| 2 | W37 | 032 | 투명도 UI·세이프존 switch·미리보기 편집 층 | W33 |
| 3 | W38 | 032 | 자막 레이어 편집기·두 행·받아 적기·번역·제목·자동 알림음 | W33, W35 |
| 3 | W39 | 032 | 브랜드(워터마크·타이틀 바) 설정·렌더·Inspector | W33 |
| 3 | W40 | 030 | 캐러셀 화면·CarouselSlide·모두 받기 | W36 |
| 4 | W41 | 033 | 파생 데이터·프레임·Jev Box·파생 기획·AI 윤곽 | W38, W40 |
| 4 | W42 | 033 | 파생 화면(배경 절·상자 끌기) | W41, W37 |

# Plan: carousel-images (full)
Track: full. 일괄 승인 계획(030·032·033·034)의 한 부분이다. 공통 절은 아래 「일괄 계획 공통」에 있다.

### 바꿀 파일
- `src/core/carousel.ts` (new): `Carousel`·`Slide` zod 스키마, 받기 폴더 이름 정리·번호 함수.
- `src/engine/carousel-store.ts` (new): `<data>/carousels/<id>/` 원자적 쓰기·키 잠금, 엔진 전용 필드 병합, 읽을 때 중단된 장 → 실패.
- `src/engine/image-queue.ts` (new): 이미지 전용 PQueue(동시 수 = 설정). 기존 `JobRegistry`(`src/engine/jobs.ts`) 동시 수는 그대로.
- `src/engine/pipeline/codex-image.ts` (new): image_gen 실행 인자 묶음(작업 폴더 쓰기 샌드박스·셸·이미지 생성), `--json` 이벤트의 session id 로만 결과 되찾기, PNG 검사, ffmpeg 가운데 자르기·1080 폭.
- `src/engine/routes/carousels.ts` (new), `src/engine/main.ts`: API 등록, 미디어 서버 `carousels` 루트.
- `src/engine/routes/system.ts`: `GET/PUT /api/system/image-options`.
- `src/remotion/CarouselSlide.tsx` (new), `src/remotion/Root.tsx`: Composition 등록.
- `src/ui/screens/Carousels.tsx`·`CarouselWorkspace.tsx` (new), `src/ui/App.tsx`(「준비 중」 배지 제거), `src/ui/screens/Settings.tsx`(「이미지 생성」 카드).
- `tests/core/carousel.test.ts`, `tests/engine/carousel-store.test.ts`, `tests/engine/image-queue.test.ts`, `tests/engine/codex-image.test.ts`, `tests/server/carousels.test.ts` (new).

### 단위
- W34: 스키마·저장소·이미지 큐와 테스트(왕복, 병합이 이미지 결과를 되돌리지 않음, 중단 장 → 실패, 큐 동시 수, 생성 중 삭제 거부).
- W36: 이미지 실행기(첫 작업으로 `--ephemeral` 에서 `generated_images` 가 남는지 가짜 없이 1회 확인하고 보고), 기획·다듬기(W32 실행기), API, 설정. 테스트: session id 없으면 실패, 기획 검증, 장별 재생성이 다른 장 불변, 텍스트 수정이 이미지 버전 불변, 옵션 저장·검증.
- W40: 화면(SEED), CarouselSlide, 받기(폴더 선택, 이름 충돌 번호, 미완료 장 확인). 테스트: 받기 파일 이름·번호.

### 증명
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- 실제 확인(조정자, `U3_DATA_DIR=out/manual/store`): 실제 codex 로 3장 만들기 → 1장 다시 만들기 → 텍스트 수정 → 모두 받기로 PNG 3장. 앱 창 캡처를 `evidence/` 에 둔다.

### 리스크
- 가장 위험한 단계: W36 의 image_gen 호출(비공개 인터페이스, 구독 한도). 결과 검사와 장별 실패 표시로 막는다.
- 택하지 않은 대안: sharp(새 네이티브 의존성), 기존 작업 큐 공유(렌더를 막음).

### 롤백
새 폴더 `carousels/` 만 쓴다. 병합 커밋을 revert 하면 기존 데이터는 그대로다.

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

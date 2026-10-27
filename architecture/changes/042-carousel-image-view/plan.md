# Plan: carousel-image-view (lite)
Track: lite.

## 결정
- 사용자 지시: "영상에서 캐러샐을 만들면 우측에 요소들이 화면을 벗어나는것과, 그냥 캐러샐도 마찬가진데 만들어진 사진이 로드가 안돼. 실제로 파일이 만들어진건 다운로드 받아보니까 만들어진것 같던데", "영상에서 캐러셀은 그냥 안보이네", "모두 받기 한 폴더인데 이미지가 없어".
- 확인한 사실: `/Users/smp/Desktop/새 영상 캐러셀/01~05.png` 는 1920×1080 PNG 이고 프레임·제목·본문이 그려져 있다. 그래서 「모두 받기」 결과는 정상이고, 고칠 대상은 앱 화면 표시다.
- 세션이 정한 것: 엔진의 옛 경로 `/api/carousels/:id/files/*` 는 지우지 않는다. 화면이 이 경로를 쓰지 않고 테스트도 없지만, 지우는 일은 이 버그와 관계가 없다.

## 원인
1. **이미지가 표시되지 않는다(일반·영상 캐러셀 공통).** `src/ui/api.ts:86` 의 `carouselFileUrl` 이 `http://127.0.0.1:<엔진 포트>/carousels/<id>/<파일>` 을 만든다. 엔진 API 서버에는 이 경로가 없다. `/carousels/<id>/...` 는 별도 포트의 미디어 서버(`src/engine/pipeline/media-server.ts`) 경로다. 엔진에는 토큰을 확인하고 미디어 서버로 넘기는 `/api/media/carousels/:id/*`(`src/engine/routes/media.ts:38`)가 이미 있다. 다른 미디어 URL 함수(`mediaUrl`·`libraryMediaUrl`·`brandMediaUrl`)는 모두 `/api/media/...` 를 쓴다. 이 함수 하나만 다르다(W40, `314a6ad` 부터).
2. **오른쪽 패널 요소가 패널 밖으로 넘친다(영상 캐러셀).** 넘치는 요소는 배경 절(`BackgroundSection`)의 슬라이더·「프레임 다시 뽑기」·강조 형태·색 선택기다. 제목·본문 입력은 넘치지 않는다. `.carousel-inspector` 는 세로 flex 이고, 자식 `.carousel-background-section` 은 열 폭을 정하지 않은 grid 다(`src/ui/styles.css:289-294`). 그래서 안쪽 요소 하나의 min-content 폭이 패널 폭(330px − 안쪽 여백)보다 크면 절 전체가 넓어지는 것으로 추정한다. 어느 요소의 min-content 가 큰지는 구현 때 브라우저에서 확인한다.

3. **가운데 미리보기가 비어 있다(구현 중 발견).** URL 을 고친 뒤에도 Remotion Player 미리보기만 비어 있었다. `Carousels.tsx` 는 `imageUrl` 을 빈 문자열로 시작하고 비동기로 채운다. 첫 렌더에서 `CarouselSlide` 의 Remotion `<Img src="">` 가 `No "src" prop was passed to <Img>.` 를 던지고, Player 는 그 뒤 URL 이 와도 비어 있다. 수정: `CarouselSlide` 는 `imageUrl` 이 비어 있으면 `<Img>` 를 그리지 않는다. 바꿀 파일에 `src/remotion/CarouselSlide.tsx`, 테스트에 `tests/remotion/carousel-slide.test.tsx` 를 더한다.

## 대조
- 결정: 0017·0019(캐러셀 범위·비율)와 충돌 없음. 화면 표시만 고친다.
- 진행 중인 변경: 039-script-voice(`Settings.tsx`·`Script.tsx`·`styles.css`), 040-qwen-tts(`Settings.tsx`·`Timeline.tsx`). `styles.css` 가 039 와 겹친다. 겹치는 줄은 다르다(039 는 `.script-voice-field-review`, 이 변경은 `.carousel-*`).

## 바꿀 파일
- `src/ui/api.ts`: `carouselFileUrl` 이 `/api/media/carousels/<id>/<파일>?token=` 을 만든다. origin 규칙은 `brandMediaUrl` 과 같다(Tauri 배포 빌드는 `http://127.0.0.1:<포트>`, 개발 빌드는 상대 경로).
- `src/ui/styles.css`: `.carousel-inspector` 의 자식과 `.carousel-background-section` 이 패널 폭을 넘지 않게 한다(`min-width: 0`, `grid-template-columns: minmax(0, 1fr)`). 원인 요소를 찾으면 그 요소에 폭 제한을 더한다.
- `tests/ui/carousel-file-url.test.ts` (new): `carouselFileUrl` 이 `/api/media/carousels/` 경로를 만든다는 테스트. 엔진 연결은 `vi.mock` 으로 고정한다.
- `tests/server/carousel-media.test.ts` (new): `/api/media/carousels/<id>/<파일>?token=` 요청이 미디어 서버 URL 로 302 를 돌려주는지 확인하는 테스트. 기존 경로가 동작한다는 것을 고정한다.

## 순서
1. `tests/ui/carousel-file-url.test.ts` 를 쓰고 커밋한다. 수정 전 코드에서 경로가 `/carousels/` 라서 실패하는 것을 확인한다.
2. `tests/server/carousel-media.test.ts` 를 쓴다. 이 테스트는 수정 전에도 통과해야 한다(엔진 경로는 이미 맞다).
3. `carouselFileUrl` 을 고친다. 1의 테스트가 통과하는지 확인한다.
4. `pnpm dev` 로 화면을 띄우고 Aside 로 캐러셀 편집 화면을 연다. 오른쪽 패널에서 `scrollWidth > clientWidth` 인 요소를 찾아 원인 요소를 확인한다.
5. `styles.css` 를 고친다. 4와 같은 방법으로 넘침이 없는지 확인하고 스크린샷을 남긴다.
6. `pnpm verify` 를 실행한다.
7. 병합한 뒤 `pnpm package` 로 앱을 만들어 `~/Applications/U3.app` 에 설치한다. 실제 사용 확인은 사용자가 한다.

## 리스크
- 가장 위험한 단계는 5다. 넘침 원인이 SEED 컴포넌트 내부 폭이면, CSS 로 폭을 줄일 때 슬라이더나 세그먼트가 찌그러질 수 있다. 4에서 원인 요소를 먼저 확인하고 그 요소만 고친다.
- `pnpm dev` 화면이 Tauri 밖 브라우저에서 엔진에 연결되지 않으면 4·5를 브라우저로 확인할 수 없다. 그때는 CSS 를 고친 뒤 패키징한 앱에서 사용자가 확인하고, 이 사실을 완료 보고에 적는다.
- 택하지 않은 대안: 엔진 토큰 검사에서 `/api/carousels/:id/files/*` 도 쿼리 토큰을 받게 하는 안. 보안 경계를 넓히고, 이미 있는 미디어 경로와 중복된다.

## 증명
1. `tests/ui/carousel-file-url.test.ts` 가 수정 전에 실패하고 수정 후에 통과한다. 두 실행의 출력을 남긴다.
2. `tests/server/carousel-media.test.ts` 가 통과한다.
3. `pnpm verify` 가 종료 코드 0 이고 마지막 줄이 `✓ verify passed` 다.
4. 브라우저 확인(가능할 때): 너비 1100px 창에서 캐러셀 편집 화면의 오른쪽 패널 안에 넘치는 요소가 없다. 스크린샷 경로를 기록한다.
5. 패키징한 앱에서 일반 캐러셀과 영상 캐러셀의 목록 썸네일·장 썸네일·미리보기 이미지가 보이는지 사용자가 확인한다.

## 롤백
- 데이터와 설정을 바꾸지 않는다. 커밋을 되돌리면 이전 동작으로 돌아간다.

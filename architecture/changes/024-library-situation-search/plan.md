# W24 라이브러리 상황 검색과 스튜디오 정리 계획

Track: lite.

## 검토 목록
- 없음. 요구 동작, W23 변경 경계, 테스트 선행 및 커밋 순서를 지정했다.

## 결정
- 라이브러리 상황 검색은 프로젝트 API와 분리한다. 짤 후보는 기존 `searchMemeCandidates` 결과로 만들고, 별도 Jev 판정은 기존 `memeFitRequest`와 usage 기록을 재사용한다.
- 짤 후보는 검색 즉시 임베딩 유사도 순으로 보이고, 임베딩을 사용할 수 없으면 규칙 순으로 보인다. Jev 완료 후에는 적합도 순으로 바꾼다. Jev 실패는 후보 순서를 유지한다.
- 효과음은 `searchLibrary`와 짤 감정·장면 효과음 규칙으로 후보를 우선 배치한다. 라이브러리 전체가 90개 이하면 전체를 Jev 한 번으로 판정한다.
- 검색 요청은 브라우저 `AbortController`와 순번 검사를 함께 쓴다. 빈 검색은 기존 페이지형 전체 라이브러리 목록을 유지한다.
- 입력 글자색은 앱의 모든 `input`, `textarea`, `select`에 `var(--seed-color-fg-neutral)`을 적용한다. 앱 색 배경 체계를 유지하면서 시스템 다크 모드의 기본 입력 글자색을 막고, placeholder는 중립 보조색으로 지정한다.
- 편집 툴바의 재생 버튼과 재생 시각만 없앤다. 미리보기 재생 컨트롤은 유지한다.
- 요구마다 실패 테스트를 별도 커밋한다. 구현 커밋에서는 `tests/`와 fixture를 바꾸지 않는다.

## 바꿀 파일
- `architecture/changes/024-library-situation-search/plan.md`
- `src/core/meme-rank.ts`
- `src/core/sfx.ts`
- `src/engine/pipeline/meme-rank.ts`
- `src/engine/pipeline/library.ts`
- `src/engine/routes/library.ts`
- `src/ui/studio/LibraryPanel.tsx`
- `src/ui/screens/Studio.tsx`
- `src/ui/styles.css`
- `tests/core/meme-rank.test.ts`
- `tests/core/sfx.test.ts`
- `tests/server/library.test.ts`
- `tests/ui/library-situation-search.test.ts`
- `tests/ui/studio-toolbar.test.ts`

## 순서
1. 이 계획을 `W24: 라이브러리 상황 검색 계획`으로 먼저 커밋한다.
2. 짤 후보·판정 순서와 API 동작의 실패 테스트만 추가하고 `W24: 짤 상황 검색 실패 테스트`로 커밋한다.
3. 효과음 후보 규칙과 Jev 요청 생성의 실패 테스트만 추가하고 `W24: 효과음 상황 검색 실패 테스트`로 커밋한다.
4. 두 검색창의 debounce, 중단, 늦은 응답 폐기, 상태·빈 결과 표시 테스트만 추가하고 `W24: 검색 화면 실패 테스트`로 커밋한다.
5. 입력 색과 툴바 중복 컨트롤 제거 테스트만 추가하고 `W24: 스튜디오 화면 정리 실패 테스트`로 커밋한다.
6. 테스트를 수정하지 않고 순수 후보·Jev 요청 함수, 검색 API, usage 기록, 즉시 후보와 Jev 순위 UI를 구현한다. W23 소유인 검색 카드 클릭·끌기 처리, `Studio.tsx`의 `keydown`, `onDrop`, `addMeme`, `addSfx`는 건드리지 않는다.
7. 모든 입력의 글자색·placeholder 색을 고정하고 편집 툴바의 재생 버튼·시각을 제거한다.
8. `pnpm verify`를 실행한다. 마지막 20줄을 보존하고 종료 코드와 마지막 줄을 확인한다.
9. `U3_DATA_DIR=out/manual/store`, 설치 앱 라이브러리 경로로 `pnpm tauri dev`를 백그라운드 실행한다. 키는 main 레포 `.env`에서 읽는 코드 경로를 확인하고, 필요할 때만 프로세스 환경 변수로 전달한다. `.env`를 복사하거나 키를 출력하지 않는다.
10. 다크 모드에서 짤 검색 입력 캡처와 지정한 짤·효과음 상황의 Jev 검색 캡처를 `out/manual/`에 저장한다. 실제 Jev는 확인 단계에서 한 번만 사용한다.
11. 개발 앱, sidecar, `target/debug/u3`를 모두 종료하고, 변경을 이 워크트리 브랜치에 커밋한다. push하지 않고 main은 건드리지 않는다.

## 위험과 대응
- 임베딩 인덱스 또는 모델이 없으면 기존 검색 코드가 규칙 후보로 대체한다. 결과는 비우지 않는다.
- Jev 키가 없거나 Jev 요청이 실패하면 즉시 후보 순서를 유지하고 안내 문구를 표시한다.
- 효과음은 라이브러리 전체를 후보에 포함해 후보 밖 항목이 사라지지 않게 한다. Jev 요청은 최대 90개로 제한한다.
- W23이 같은 UI 파일을 바꾼다. W23 소유 함수와 처리 코드는 유지하고, 통합 후 조정자가 요청한 rebase가 필요하면 이 브랜치에서만 수행한다.
- 시스템 외관은 바꾸지 않는다. 입력 CSS와 실제 앱 창 캡처로 다크 모드 표시를 확인한다.
- 새 devDependency를 추가하지 않는다.

## 완료 증거
- 계획 커밋과 요구별 테스트 선행 커밋이 구현 커밋과 분리되어 있다.
- 구현 커밋은 `tests/`와 fixture를 수정하지 않는다.
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- 앱 창 캡처 3개: `out/manual/w24-search.png`, `out/manual/w24-meme-jev.png`, `out/manual/w24-sfx-jev.png`.
- 실행한 앱 프로세스를 종료하고, 모든 변경을 커밋하며 push하지 않는다.

## 롤백
- W24 커밋을 역순으로 되돌린다. 데이터 스키마는 바꾸지 않는다.

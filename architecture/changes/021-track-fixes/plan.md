# W21 영상 트랙 결함 수정 계획

Track: lite.

## 검토 목록
- 없음. 재현 절차와 기대 동작, 테스트 우선 커밋 규칙, 확인 방법이 지정되어 있다.

## 결정
- 결정 0011의 영상 1 연속 트랙과 영상 2 이상 작은 창 규칙을 유지한다.
- 영상 행 판정은 편집 영역의 첫 행을 기준으로 하고, 기준 요소 선택은 순수 함수 또는 상수 선택자로 검증한다.
- 영상 1 삭제는 순수 함수로 계산한다. 영상 1에 클립이 남지 않는 삭제는 막고 기존 Snackbar 경로로 이유를 알린다.
- 영상 2 이상 렌더는 clip의 위치·크기와 내용 비율을 유지한다. 기존 전환 효과 계산은 같은 창에 적용한다.
- 각 결함의 실패 테스트와 smoke 검사 변경을 테스트 전용 커밋에 넣고, 그 뒤 구현 커밋에서는 테스트와 fixture를 바꾸지 않는다.
- 실행 취소 뒤 미리보기는 지정한 실제 실행 경로로 재현을 시도한다. 재현하지 못하거나 Remotion Player 내부 원인이면 코드를 바꾸지 않고 근거를 기록한다.

## 바꿀 파일
- `architecture/changes/021-track-fixes/plan.md`
- `src/ui/studio/video-track-drop.ts`, 관련 `tests/ui/video-track-drop.test.ts`
- `src/remotion/U3Short.tsx`, 스타일 계산 모듈, 관련 Remotion 테스트, `scripts/smoke.ts`
- `src/core/timeline/video-track-edits.ts` 또는 영상 삭제 규칙을 둘 core 모듈, `src/core/timeline/video-groups.ts`
- `src/ui/studio/Timeline.tsx`, `src/ui/screens/Studio.tsx`, 관련 삭제 테스트
- 필요하면 `src/ui/studio/Inspector.tsx`와 관련 테스트

## 순서
1. 이 계획을 `W21: 영상 트랙 결함 수정 계획`으로 먼저 커밋한다.
2. 드롭 행 판정과 오버레이 스타일의 실패 테스트를 작성한다. smoke 경계 검사도 같은 테스트 전용 커밋에 넣는다.
3. 테스트를 바꾸지 않고 드롭 행 판정과 오버레이 스타일을 구현한다.
4. 영상 1 마지막 클립·묶음·혼합 선택 삭제의 실패 테스트를 작성해 테스트 전용 커밋을 만든다.
5. 테스트를 바꾸지 않고 모든 영상 삭제 경로를 순수 삭제 함수에 연결한다.
6. 실행 취소 뒤 미리보기를 지정 프로젝트에서 시도한다. 재현 여부와 증거를 기록한다.
7. 지정 데이터·라이브러리 경로로 `pnpm tauri dev`를 실행한다. 영상 프로젝트에서 타임라인과 미리보기를 캡처하고, 렌더 API로 export를 만든다. 영상 2 구간 프레임을 추출해 작은 창과 둘레 영상을 확인한다. 화면 끌기를 자동화할 수 없으면 같은 코드 경로를 사용하고 보고한다.
8. `pnpm verify`를 실행하고 마지막 20줄을 기록한다. diff와 커밋을 확인한다. 실행한 앱과 sidecar 프로세스를 종료한다. push와 main 변경은 하지 않는다.

## 위험과 대응
- DOM 요소 선택은 jsdom 없이 선택자 상수 또는 순수 판정 함수로 검증한다.
- 기존 영상 행 인덱스와 `video-new` 삽입 위치를 보존하고, 스크롤과 행 경계 ±1px 테스트로 판정한다.
- 짤·영상·사진의 미디어 요소가 부모 창의 경계를 넘지 않도록 하고, 전환 opacity·transform·clipPath를 부모에 유지한다.
- `node_modules`가 없으면 설치된 라이브러리의 dist 소스 확인과 검증 실행이 불가능할 수 있다. 새 devDependency는 추가하지 않는다.

## 완료 증거
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- 지정된 Tauri 앱 창 캡처 `out/manual/w21-overlay.png`와 export 프레임 `out/manual/w21-overlay-frame.png`.
- export `out/manual/w21-export.mp4`에서 작은 창과 아래 영상 노출 확인.
- 각 결함의 실패 테스트 커밋 뒤 테스트를 건드리지 않은 구현 커밋.
- 실행 취소 뒤 미리보기 재현 결과와 프로세스 종료 결과.

## 롤백
- W21 커밋을 역순으로 되돌린다. 데이터 스키마 변경은 추가하지 않는다.

# W25 라이브러리 포인터 끌기 계획

Track: lite.

## 검토 목록
- 없음. 사용자 요구와 테스트 우선 커밋 순서, 확인 방법이 지정되어 있다.

## 결정
- 라이브러리 미디어·짤·효과음은 HTML5 drag/drop 대신 pointer 이벤트로 끈다. 4px 초과 움직임부터 끌기를 시작하고, 그 안에서 놓으면 기존 클릭 동작을 실행한다.
- 드롭 좌표는 순수 함수로 timeline·preview·none과 초 단위 위치로 판정한다. 타임라인 x좌표는 VIDEO_TRACK_EDIT_GRID_SELECTOR 편집 Grid의 scrollLeft와 현재 zoom을 반영한다. preview는 재생 헤드 시각을 쓴다.
- 새 짤·효과음 트랙과 원본 미디어 overlay/append 동작은 decideNewLaneDrop 및 decideOverlayDrop를 유지한다. 추가한 클립을 선택하고 기존 history 경로로 한 번 실행 취소가 되게 한다.
- 드래그 중 포인터 미리보기와 타임라인 위치 안내를 표시한다. Escape와 유효 영역 밖의 pointerup은 추가를 취소한다.
- Input.tsx의 Finder 파일 경로 수신과 tauri.conf.json은 바꾸지 않는다.
- 테스트 전용 커밋 뒤 구현 커밋을 만들고, 구현 커밋에서는 tests와 fixture를 수정하지 않는다.

## 바꿀 파일
- `architecture/changes/025-pointer-library-drag/plan.md`
- `src/ui/studio/library-drop.ts`, 관련 `tests/ui/` 테스트
- `src/ui/studio/LibraryPanel.tsx`
- `src/ui/screens/Studio.tsx`
- 필요한 `src/ui/studio/*.css` 또는 UI 스타일 파일

## 순서
1. 이 계획을 `W25: 포인터 끌기 계획`으로 커밋한다.
2. 포인터 시작 문턱, 클릭/끌기 구분, 좌표의 timeline·preview·none 및 시각 판정 실패 테스트를 작성한다. 요청 원문을 commit body에 기록하고 `W25: 포인터 끌기 실패 테스트`로 커밋한다.
3. 테스트를 수정하지 않고 순수 판정 함수를 구현한다.
4. LibraryPanel의 세 항목 종류에서 pointerdown/move/up, pointer capture 또는 window 추적, preview, 텍스트 선택 방지, Escape 취소를 구현한다. draggable과 dataTransfer 경로를 제거한다.
5. Studio에서 판정 결과로 새 트랙 또는 overlay/append 추가를 실행하고 선택 및 history 동작을 연결한다. 타임라인 안내선을 같은 좌표 함수에 연결한다.
6. 지정 환경으로 `pnpm tauri dev`를 백그라운드 실행한다. 화면 끌기 자동화가 불가능하면 그 사실과 순수 함수 테스트 증거를 보고한다. 실행한 앱과 sidecar를 종료한다.
7. `pnpm verify`를 실행하고 종료 코드 및 마지막 20줄을 확인한다. 모든 변경을 현재 브랜치에 커밋한다. push, main, Jira, 위키는 변경하지 않는다.

## 위험과 대응
- Wry의 OS drag/drop 가로채기가 앱 내부 포인터 이벤트와 별개로 동작하는지 지정 개발 앱에서 확인한다.
- Finder 파일 놓기는 Tauri 이벤트 경로를 유지하고 Input.tsx 및 dragDropEnabled 설정을 수정하지 않는다.
- 포인터가 라이브러리·Inspector·창 밖에서 끝나면 추가하지 않는다.

## 완료 증거
- 실패 테스트 전용 커밋 및 테스트를 변경하지 않은 구현 커밋.
- 지정 환경의 개발 앱 실행 및 종료 결과. UI 자동화가 안 되면 제한 사유.
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.

## 롤백
- W25 커밋을 역순으로 되돌린다. 프로젝트 데이터 형식은 변경하지 않는다.

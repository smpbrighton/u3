# 홈 카드와 내보내기 경고

## 요약
홈 프로젝트 카드는 타임라인의 첫 main 클립 입력을 썸네일 대상으로 고르고, 영상은 첫 프레임 썸네일을 요청한다. 내보내기 화면은 지정 경로의 mp4 파일 존재 여부를 조회해 덮어쓰기 경고를 표시한다. `src/ui/screens/home-thumbnail.ts` `src/ui/screens/Home.tsx` `src/engine/routes/output.ts` `src/ui/export-warning.ts` `git:3dba009`

## 내용
- 타임라인에 main 클립이 있으면 해당 입력을 선택하고, 없으면 첫 입력을 선택한다. main 클립이 있지만 입력을 찾지 못하면 썸네일 입력은 없다. `src/ui/screens/home-thumbnail.ts` `git:3dba009`
- 홈은 선택 입력이 영상이면 `/thumbnail` API를 호출하고 사진이면 미디어 URL을 사용한다. 썸네일 로드 실패는 표시하지 않고 카드의 빈 썸네일 상태를 유지한다. `src/ui/screens/Home.tsx` `git:3dba009`
- 출력 파일 확인 API는 절대 경로와 `.mp4` 확장자를 요구한다. 파일이 없으면 `exists: false`를 반환하고, 다른 오류는 정상 응답으로 바꾸지 않는다. `src/engine/routes/output.ts` `git:3dba009`
- 덮어쓰기 경고는 경로가 있고 파일 존재가 참이며 내보내기가 완료되지 않았을 때 표시한다. 경고가 있어도 내보내기 버튼은 비활성화되지 않는다. `src/ui/export-warning.ts` `src/ui/ExportDialog.tsx` `git:3dba009`
- 테스트는 썸네일 대상 선택, 출력 파일 조회 오류 처리, 경고 노출 조건을 다룬다. `tests/ui/home-thumbnail.test.ts` `tests/engine/output-exists.test.ts` `tests/ui/export-warning.test.ts` `git:ec52275` `git:809efb6` `git:c6c210b`
- 화면 시험에서 영상 카드 첫 프레임 표시와 기존 `~/Movies/U3/새 영상.mp4` 파일에 대한 경고 표시를 확인했다. 경고 뒤 내보내기 실행은 하지 않았다. 같은 이름 덮어쓰기 동작은 미검증이다. `docs/manual-check.md` `git:b3a4d65`
- 변경에 별도 검증 기록은 코드에서 못 찾음. `architecture/changes/001-desktop-studio/spec.md` `git:3dba009`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [타임라인 편집](concept-timeline-editing.md)

## 출처
- `src/ui/screens/home-thumbnail.ts`
- `src/ui/screens/Home.tsx`
- `src/ui/ExportDialog.tsx`
- `src/ui/export-warning.ts`
- `src/engine/routes/output.ts`
- `tests/ui/home-thumbnail.test.ts`
- `tests/engine/output-exists.test.ts`
- `tests/ui/export-warning.test.ts`
- `docs/manual-check.md`
- `architecture/changes/001-desktop-studio/spec.md`
- `ec52275`
- `809efb6`
- `c6c210b`
- `3dba009`
- `4e55964`
- `b3a4d65`

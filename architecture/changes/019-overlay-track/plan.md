# W19 겹친 영상 트랙 구현 계획

Track: lite.

## 검토 목록
- 없음. 결정 0010과 사용자가 지정한 동작, 기본값, 입력 유형이 모두 확정되어 있다.

## 결정
- 결정 0010을 따른다. 겹친 영상은 `Timeline.overlay`로 추가하고, 기존 프로젝트는 빈 배열로 읽는다.
- 드롭 판정은 순수 함수로 두고, 대본 변환은 바꾸지 않는다.
- 사용자가 지정한 테스트 전용 커밋과 구현 전용 커밋 순서를 따른다.

## 바꿀 파일
- `src/core/schema.ts`, `src/core/timeline/ops.ts`, `src/core/timeline/to-render.ts`
- `src/engine/store.ts`, `src/engine/pipeline/render.ts`
- `src/remotion/U3Short.tsx`, `src/remotion/types.ts`
- `src/ui/screens/Studio.tsx`, `src/ui/studio/{Timeline,timeline-adapter,Inspector,Preview,timeline-zoom}.tsx`
- 관련 `tests/`, `scripts/smoke.ts`, `tests/fixtures/project/project.json`, `docs/ui-design-check.md`
- `architecture/changes/019-overlay-track/plan.md`

## 순서
1. 스키마·구버전 프로젝트, 변환, 드롭 판정, 편집 동작의 실패 테스트를 요구 단위로 추가하고 각각 테스트만 커밋한다. 스모크 fixture 변경도 실패 테스트 커밋에 포함한다.
2. 스키마·저장소 호환, 드롭·편집·Inspector, 미리보기·렌더를 구현 커밋으로 완성한다. 구현 커밋은 테스트와 fixture를 변경하지 않는다.
3. `scripts/smoke.ts`에서 오버레이 구간의 렌더 픽셀 변화를 확인한다. 화면 설계 점검표를 갱신한다.
4. `pnpm verify`를 실행한다. 지정한 데이터·라이브러리 경로로 `pnpm tauri dev`를 띄우고 화면, 렌더, ffprobe를 확인한다. 실행한 프로세스를 종료한다.
5. diff를 이 계획과 대조하고 모든 변경을 현재 브랜치에 커밋한다. push와 main 변경은 하지 않는다.

## 위험과 대응
- `@remotion/media`의 `Video`, Remotion의 `Loop`, `Img` 사용법을 설치된 타입과 공식 문서에서 확인한다.
- 겹친 영상 입력 경로는 짤 라이브러리 경로와 프로젝트 입력 경로를 기존 URL 해석 규칙에 맞춰 분리한다.
- 이전 `project.json`은 스키마 기본값으로 읽히는 테스트를 추가한다.

## 완료 증거
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- 스튜디오·타임라인 캡처, export mp4의 ffprobe 스트림·길이, 겹친 구간 프레임 캡처.

## 롤백
- W19 커밋을 역순으로 되돌린다. project.json은 필드 추가만 하며 기존 파일 형식은 유지한다.

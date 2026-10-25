# W20 영상 분할·묶기·전환 효과 계획

Track: lite.

## 검토 목록
- 없음. 사용자가 C 분할 위치, 묶기 방식과 M 키, 클립 앞·뒤 효과, 효과 종류와 방향을 지정했고 조정자가 이 계획을 승인했다.

## 결정
- 결정 0011의 영상 1 연속 트랙과 영상 2 이상 오버레이 트랙을 유지한다.
- C는 마우스 포인터 아래 영상 클립을 자르고, S는 재생 헤드에서 자르는 기존 동작을 유지한다.
- 같은 트랙 범위 선택과 인접 클립 묶기를 제공한다. 묶음은 클립의 `groupId`로 저장한다.
- 시작·끝 전환 효과와 길이를 클립에 저장한다. 기존 프로젝트는 효과 없음으로 읽는다.
- `@remotion/transitions`는 추가하지 않는다. npm 메타데이터의 `UNLICENSED` 표기와 설치된 Remotion 라이선스 표기가 다르고, 조정자가 사용 조건을 확인하지 못했다. 기존 Remotion의 `interpolate`, `AbsoluteFill`, `Sequence`와 CSS `opacity`, `transform`, `clip-path`로 효과를 만든다.
- 영상 1 경계 전환은 원래 경계 중심으로 양쪽 클립을 절반씩 겹쳐 렌더한다. 이 방식은 타임라인 길이와 자막·오디오 시각을 유지한다. 오디오 crossfade도 같은 구간에서 적용한다.
- 사용자가 지정한 테스트 전용 커밋과 테스트를 건드리지 않는 구현 커밋 순서를 따른다.

## 바꿀 파일
- `src/core/schema.ts`, `src/core/timeline/ops.ts`, `src/core/timeline/to-render.ts`
- `src/engine/pipeline/render.ts`, 필요한 경우 `src/engine/store.ts`
- `src/remotion/U3Short.tsx`, `src/remotion/types.ts`
- `src/ui/screens/Studio.tsx`, `src/ui/studio/Timeline.tsx`, `src/ui/studio/timeline-adapter.ts`, `src/ui/studio/Inspector.tsx`, `src/ui/studio/timeline-zoom.ts`
- 관련 `tests/`, `scripts/smoke.ts`, 필요한 smoke fixture, `docs/ui-design-check.md`
- `architecture/changes/020-split-group-transition/plan.md`

## 순서
1. 분할 판정·분할 편집의 실패 테스트를 작성하고 `W20: C 분할 실패 테스트`로 커밋한다.
2. 범위 선택·묶기 가능 판정·묶음 이동·삭제·해제의 실패 테스트를 작성하고 `W20: 클립 묶기 실패 테스트`로 커밋한다.
3. 효과 타입·프레임 계산·전환 경계·오디오 crossfade·기존 프로젝트 기본값의 실패 테스트를 작성한다. smoke fixture 변경도 테스트 커밋에 넣는다. 테스트를 요구 단위로 나눠 `W20: 전환 효과 실패 테스트`와 필요 시 추가 테스트 전용 커밋으로 커밋한다.
4. 각 구현을 테스트 전용 커밋 뒤에 구현한다. 구현 커밋에서 `tests/`와 fixture를 바꾸지 않는다. 그룹 키보드·이동·삭제, C/S 분할, Inspector, 타임라인 표시, preview와 export를 연결한다.
5. `scripts/smoke.ts`에서 경계 가운데 프레임이 양쪽 원본 프레임과 다른지 확인한다. `docs/ui-design-check.md`의 Studio 행을 갱신한다.
6. 지정 경로로 Tauri 앱을 실행하고 요청한 화면 캡처와 API export를 확인한다. 프로세스를 종료한다. `pnpm verify`의 종료 코드와 마지막 줄을 확인한다.
7. diff를 이 계획과 대조하고 현재 브랜치에 모든 변경을 커밋한다. push와 main 변경은 하지 않는다.

## 위험과 대응
- 그룹 이동은 영상 1의 순서 이동과 영상 2 이상의 시작 시각 이동을 모두 다룬다. 변환과 판정은 순수 함수로 테스트한다.
- 영상 1 전환은 총 길이를 보존하면서 클립 경계 프레임을 앞뒤 구간에서 소비한다. 자막·오디오의 원래 시각은 바꾸지 않는다.
- 방향 전환의 `clip-path` 렌더링은 WebKit 미리보기와 Remotion export에서 같은 프레임 계산을 사용한다.
- Remotion 전환 패키지는 추가하지 않으며, 효과는 설치된 Remotion API와 CSS로 구현한다.
- 기존 `project.json` 호환을 스키마 기본값과 fixture로 검증한다.

## 완료 증거
- `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.
- `out/manual/w20-split.png`, `w20-group.png`, `w20-dissolve.png`, `w20-export.mp4`, `w20-dissolve-frame.png`.
- Tauri 창, export mp4의 렌더 길이, 경계 전환 프레임을 확인하고 실행한 프로세스를 종료한다.

## 롤백
- W20 커밋을 역순으로 되돌린다. 새 필드는 기본값이 있어 기존 `project.json`을 유지한다.

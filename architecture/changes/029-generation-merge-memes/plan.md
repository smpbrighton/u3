# W29 자동 생성 타임라인 수정 계획

Track: lite.

## 검토 목록
- 없음. 동작, 파일 범위, 테스트 선행 커밋, 검증 방법을 사용자 지시가 지정했다.

## 결정
- 요구 원문: “여전히 짤방이 추가가 안되고 영상이 분할만 됐어 자막 때문에 자막이 달리는 위치에서 영상이 분할된거 같은데 영상은 하나고 자막이 그 위에 여러개가 될 수 있겠지. 그리고 짤방은 말했듯 영상 타임라인 위에 생성되야해”
- 영상 1은 입력 항목 ID와 원본 구간 경계가 0.05초 이내로 맞닿은 이웃 장면만 하나의 클립으로 합친다. 합친 클립은 처음 장면의 시작 전환과 마지막 장면의 끝 전환을 보존한다.
- 장면별 자막·효과음은 기존 타임라인 시각을 보존한다. 사진 클립은 입력 원본 구간이 없고 기존 사진 길이·장면 배치가 장면별이므로 합치지 않는다.
- Codex 프롬프트는 각 영상 입력에서 reaction을 하나 이상 고르도록 요구한다. 스키마는 바꾸지 않는다.
- 대본에 반응 짤이 없는 입력은 각 장면 자막을 상황 문장으로 검색·판정한다. Jev 상위 후보는 기존 W24 후보 검색 결과를 사용한다. Jev 오류·키 없음 때는 임베딩 순서와 규칙 순서로 구성한 후보의 첫 항목을 입력 마지막 장면에 둔다.
- Jev 요청 모양을 만드는 판정은 core 순수 함수에 둔다. 엔진 rank 경로의 usage 기록에 projectId를 전달한다.
- 입력마다 최대 한 장면에 짤을 보충하고, 같은 입력에서 같은 짤 ID를 중복 사용하지 않는다. 짤은 `timelineFromScript`가 overlays에 두며 장면 경계 시각에 놓고 영상 전체 길이를 늘리지 않는다.
- 후보가 없는 장면은 `missingCount`에 포함해 기존 스낵바 안내에 반영한다. 이미 저장된 프로젝트는 읽기·마이그레이션 시 변경하지 않는다.
- 요구별 실패 테스트를 먼저 별도 커밋하고, 각 구현 커밋은 `tests/`와 fixture를 수정하지 않는다.

## 바꿀 파일
- `architecture/changes/029-generation-merge-memes/plan.md`
- `src/core/timeline/from-script.ts`
- `src/core/script-memes.ts`
- `src/core/meme-rank.ts`
- `src/engine/pipeline/script-validation.ts`
- `src/ui/screens/Script.tsx`의 generate 흐름만
- `tests/core/from-script.test.ts`
- `tests/core/script-memes.test.ts`
- `tests/pipeline/script-validation.test.ts`

## 순서
1. 계획을 `W29: 자동 생성 타임라인 수정 계획`으로 커밋한다.
2. 인접 영상 구간 합치기와 끊긴 구간 분리 실패 테스트를 작성하고 `W29: 이어지는 장면 클립 병합 실패 테스트`로 커밋한다.
3. 테스트 파일을 건드리지 않고 영상 클립 병합을 구현한다. 사진 입력, 장면별 자막·효과음 시각, 전환 경계를 유지한다.
4. reaction null 장면의 입력별 짤 보충, Jev 실패 fallback, 중복 방지, 후보 없음 계산의 순수 함수 실패 테스트를 작성하고 `W29: 자동 짤 보충 실패 테스트`로 커밋한다.
5. Codex 프롬프트 reaction 요구의 실패 테스트를 작성하고 `W29: Codex 짤 반응 요구 실패 테스트`로 커밋한다.
6. 테스트를 수정하지 않고 순수 판정 함수, Codex 프롬프트 문구, generate 흐름의 상황 검색·Jev rank·fallback·중복 제거를 연결한다. Jev 호출은 프로젝트 ID를 포함해 기존 rank API를 통과시켜 usage에 기록한다.
7. `pnpm verify`를 실행하고 마지막 20줄과 종료 코드를 기록한다. 실패하면 범위 내 구현을 수정한다.
8. 환경 변수 `U3_DATA_DIR=out/manual/store`, `U3_LIBRARY_DIR=/Users/smp/Applications/U3.app/Contents/Resources/resources/library`로 엔진 또는 `pnpm tauri dev`를 실행한다. main 레포 `.env`의 키는 프로세스 환경으로만 전달하고 출력하지 않는다. 새 시험 프로젝트 생성 및 대본 생성을 시도하고, 저장된 video·overlays·captions 수와 짤 ID를 기록한다. 불가능하면 확인하지 못한 사유를 기록한다.
9. 실행한 앱·sidecar·`target/debug/u3` 프로세스를 종료한다. 수정과 확인 결과를 이 워크트리 브랜치에 커밋한다. push와 main 변경은 하지 않는다.

## 위험과 대응
- 원본 경계의 미세한 차이는 0.05초 허용 오차로 연결한다. 실제 장면 길이와 타임라인 시각은 첫 시작 및 마지막 끝을 사용한다.
- 같은 짤 중복 제거는 입력 단위로 한다. 다른 입력은 같은 짤을 사용할 수 있다.
- Jev 네트워크·키 오류는 기존 rank 경로가 fallback 결과를 반환하도록 처리하고, UI는 오류로 생성을 중단하지 않는다.
- 동시 변경 W28은 `src/ui/**` 마크업·CSS를 수정한다. 이 변경은 `Script.tsx` generate 함수 범위로 한정한다.
- 계획 밖 파일 변경이 필요하면 중단하고 마지막 보고에 사유를 적는다.

## 완료 증거
- 계획 커밋과 각 요구의 테스트 전용 커밋이 구현 커밋과 분리되어 있다.
- 테스트 전용 커밋은 구현 전에 실패를 확인한다. 구현 커밋은 `tests/`와 fixture를 수정하지 않는다.
- 실제 생성 시도 결과 또는 실행 불가 사유와 timeline 개수·짤 ID를 기록한다.
- `pnpm verify` 종료 코드 0이며 마지막 줄이 `✓ verify passed`다.
- 실행 앱과 sidecar가 종료되어 있고 모든 변경이 커밋되어 있다.

## 롤백
- W29 커밋을 역순으로 되돌린다. 프로젝트 데이터 스키마와 기존 저장 프로젝트는 변경하지 않는다.

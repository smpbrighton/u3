# Plan: timeline-trim-fixes (lite)
Track: lite.

## 검토 목록
1. **효과음 커서 고착의 원인은 확정하지 못했다.** GUI 조작 도구가 없어 재현하지 못했다. 코드에서 찾은 어긋남(아래 2·3)을 고치면 사라질 것으로 추정한다. 1.0.0 설치 뒤 사용자가 실기로 확인한다. 남으면 058 을 다시 연다. 추천: 이대로. 이유: 확인된 어긋남을 고치는 것이 재현 도구를 마련하는 것보다 먼저다.
2. **타임라인에서 자막 끝을 끌면 늘어난다.** 범위는 자막 편집기의 구간 막대와 같다: 같은 줄의 앞뒤 자막과 영상 길이를 넘지 않고, 최소 0.1초. 범위를 넘게 끌면 경계에서 멈춘다. 추천: 이대로.
3. **소리 클립(목소리·효과음)을 파일 길이보다 길게 끌면 오류 대신 파일 끝에서 멈춘다.** 추천: 이대로. 이유: 지금은 오류 메시지만 뜨고 타임라인 화면은 늘어난 채로 남는다.

## 결정
- 사용자 보고: 「효과음이 길이 조절하려고 드래그하면 계속 길이조절 마우스 커서 상태로 남아있거든? 다른곳 더블클릭하면 풀리는데 … 마우스 커서가 클릭중(드래그 중)이 아님에도 커서가 조절되고 이상해」, 「영상이랑 자막은 괜찮은데, 자막이 줄이는것만되고 늘리는건 안되네?」.
- 대체하는 결정 없음.

## 대조
- 0016(편집 모델·앱이 만든 자르기): 자르기 규칙의 범위만 넓힌다. 위배 없음. 057(드래그 실행 취소)은 병합됨. 진행 중인 변경 없음.

## Context
확인한 사실:
- 타임라인 자막 늘리기는 `trimCaptionClip` 이 막는다(`src/core/timeline/ops.ts:166`, 「클립을 늘리는 트림은 지원하지 않습니다」). 자막 편집기 구간 막대는 `setCaptionRange`(`ops.ts:182`)로 늘리기를 허용한다.
- 소리 클립을 파일 길이 너머로 끌면 `trimAudioClip` 이 RangeError 를 낸다(`ops.ts:237`).
- `Timeline.tsx` 의 `doEdit` 은 오류가 나면 `onError` 만 부르고 라이브러리 편집 상태를 되돌리지 않는다(`src/ui/studio/Timeline.tsx:227–237`). 변경이 없을 때만 `resetEditor()` 를 부른다. 그래서 라이브러리 화면의 클립 폭과 실제 데이터가 어긋난 채 남는다.
- 클립 드래그·크기 조절은 `@xzdarcy/react-timeline-editor` 1.0.0 의 interactjs 가 처리한다. 커서 고착은 이 라이브러리의 상호작용 상태가 끝나지 않은 것으로 추정한다(미확인).

## 바꿀 파일
- `src/core/timeline/ops.ts`:
  - `resizeCaptionClip(timeline, clipId, edge, toSec)` (new): 잡은 쪽 가장자리만 옮기고 `setCaptionRange` 로 범위를 맞춘다. 결과가 같으면 같은 timeline 을 돌려준다.
  - `clampAudioTrim(clip, edge, toSec, fileDurationSec)` (new): 시작 쪽은 `inStartSec` 이 0 아래로, 끝 쪽은 `inEndSec` 이 파일 길이 위로 가지 않게 `toSec` 을 자른다(배속 반영, 기존 `sourceAt` 재사용). 최소 길이는 기존 `requireFrames` 규칙.
  - `trimCaptionClip`·`trimAudioClip` 은 그대로 둔다(다른 호출처와 기존 시험 유지).
- `src/ui/studio/Timeline.tsx` `onActionResizeEnd`: 자막 줄은 `resizeCaptionClip`, 목소리·효과음은 `clampAudioTrim` 뒤 `trimAudioClip`. `doEdit` 의 catch 에서 `onError` 뒤 `resetEditor()` 를 부른다.
- 테스트:
  - `tests/core/timeline-ops.test.ts`: 자막 끝·시작을 늘림, 다음 자막 시작에서 멈춤, 영상 길이에서 멈춤, 줄이기는 지금과 같음. 소리 끝을 파일 길이 너머로 → 파일 끝, 시작을 0 너머로 → 파일 처음, 배속 1.5 에서도 같은 경계.
  - Timeline UI 시험(기존 studio 시험 위치): 자르기가 오류를 내면 `onError` 와 함께 편집기 key 가 바뀐다(`resetEditor`).

## 순서
1. plan.md 커밋.
2. 실패 테스트 커밋(실패 출력 기록: 자막 늘리기 RangeError, 소리 경계 RangeError, 오류 뒤 reset 없음).
3. ops.ts 구현 → Timeline.tsx → `pnpm verify` → 커밋.
4. 세션: diff 대조 → finish → wiki ingest(057·058) → push → PR #2 병합 → `release.sh 1.0.0`.

## 리스크
- `resetEditor()` 는 편집기를 다시 마운트한다. 오류 때만 부르므로 정상 편집의 스크롤 위치에는 영향이 없다. 스크롤은 기존 코드가 복원한다.
- 택하지 않은 대안: 라이브러리 action 에 `maxEnd`·`minStart` 를 주기(라이브러리가 이 값을 이동 범위에도 써서 클립을 옮길 수 없게 됨), 라이브러리 교체(범위가 큼).

## 증명
1. 2단계 실패 출력, `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 미검증으로 남길 것: 효과음 커서 고착의 실기 확인(1.0.0 설치 뒤 사용자), 자막 늘리기 실기 확인(사용자).

## 롤백
커밋 되돌리기. 데이터 형식은 바뀌지 않는다.

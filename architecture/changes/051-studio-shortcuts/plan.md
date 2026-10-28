# Plan: studio-shortcuts (lite)
Track: lite.

plan mode 산출물. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다.


## Context
배포본 스튜디오에서 C/ㅊ(포인터 자르기)·S 가 동작하지 않는다(사용자 보고). 브라우저 dev(Chromium)에서는 동작한다(클립 49→51 확인). 배포본은 WebKit 이다. `src/ui/studio/shortcuts.ts` 의 `studioShortcut` 은 (a) `event.target.closest("[role]")` 이 `button`·`tab`·`switch` 등이면 null, (b) `isComposing` 이면 null 을 낸다. WebKit 은 버튼·탭을 누른 뒤 포커스를 거기 남기고, 포커스할 수 없는 요소(타임라인 클립)를 눌러도 포커스를 옮기지 않는다. 그래서 라이브러리 탭이나 재생 버튼을 한 번 누른 뒤에는 타임라인 위의 단축키가 모두 막힌다. 한글 자판에서는 WebKit 이 첫 keydown 에도 `isComposing: true` 를 줄 수 있어 ㅊ 도 막힌다. Chromium 은 클릭 때 포커스를 body 로 옮겨 증상이 없다. Cua Driver 가 없어 배포본 재현은 못 했고, 이 두 경로는 코드 근거로 좁힌 것이다.

## 결정
- 사용자 지시 원문: "영상에서 c 혹은 ㅊ 물리키 입력했을때 커트 등의 단축키가 동작안했고".
- 고치는 방법 두 가지를 함께 한다. (1) 판정: 글 입력 대상(INPUT·TEXTAREA·SELECT·contentEditable·`range`·`slider`·`combobox`·`listbox`·`option`·`textbox`·`searchbox`·`spinbutton`)만 막는다. `button`·`tab`·`switch`·`checkbox`·`radio` 에 포커스가 있을 때는 Space 만 막고(그 요소를 누르는 키) 글자 키·Delete·⌘ 조합은 허용한다. `isComposing` 은 `code` 가 없을 때만 본다(물리 키 코드가 있으면 글 입력 대상 밖에서는 조합 중이어도 판정). (2) 포커스: 타임라인 클립·빈 곳을 누르면 `document.activeElement` 가 버튼·탭이면 `blur()` 한다(`Timeline.tsx` 의 `onClickAction`·`onClickTimeArea`·호스트 pointerdown).

## 대조
결정 0016(편집 모델·단축키) 유지. 048 shortcut-settings(설정에서 단축키 조정, 의도 단계)가 같은 `shortcuts.ts` 를 바꾼다 → 048 은 051 뒤에 rebase 한다(장부 depends_on). 파일 겹침: `src/ui/studio/shortcuts.ts`, `tests/ui/shortcuts.test.ts`.

## 바꿀 파일
- `tests/ui/shortcuts.test.ts`: 실패 테스트 — `targetRole: "button"` + `KeyC` → `split-pointer`, `targetRole: "tab"` + `KeyS` → `split-playhead`, `targetRole: "button"` + Space → null, `isComposing: true` + `code: "KeyC"`(글 입력 밖) → `split-pointer`, `isComposing: true` + `code: "KeyC"` + `targetTagName: "INPUT"` → null. 기존 단언 유지.
- `src/ui/studio/shortcuts.ts`: 위 판정.
- `src/ui/studio/Timeline.tsx`: 클릭 때 버튼·탭 포커스 해제. `tests/ui/timeline-video-split.test.ts` 또는 새 `tests/ui/timeline-focus.test.ts` 에 포커스 해제 단언(jsdom 에서 `button.focus()` 뒤 클릭 → `document.activeElement === document.body`).

## 순서
1. 실패 테스트 → 실패 확인 → 커밋.
2. `shortcuts.ts` → 통과. 3. `Timeline.tsx` 포커스 해제 + 테스트 → 통과. `pnpm verify` → 커밋.
4. 패키징(`pnpm package`) 뒤 패키징 앱에서 「새 영상」 열기 → 라이브러리 탭 누르기 → 클립 위에서 C → 클립이 둘로 나뉨(감독자 수동, Cua 없음 → 사용자 확인으로 대체 가능).
5. `worktree.sh finish studio-shortcuts`.

## 리스크
- 가장 위험한 단계는 2 다. 버튼에 포커스가 있을 때 글자 키를 허용하면 포커스된 버튼의 기본 동작과 겹칠 수 있다. 버튼은 Space/Enter 로만 눌리므로 Space 를 계속 막고 Enter 는 단축키가 아니다. 택하지 않은 대안: 판정만 고치고 포커스 해제를 안 함 — Space(재생)가 포커스된 탭에서 계속 막힌다.
- 근거가 코드 추론이라 배포본에서 재현·검증 전까지는 추정이다. 증명 4 가 그 확인이다.

## 증명
1. 1단계 실패 출력, 2·3단계 통과, `pnpm verify` 통과.
2. 4단계 결과(감독자 또는 사용자 확인, 미검증이면 적는다).

## 실행 기록
- 1단계: 단축키 테스트 10개·포커스 테스트 12개가 구현 전 실패(커밋 `d74aad6`·`1b8fb33`). 테스트의 타입 캐스트 보정은 감독자 승인으로 별도 커밋 `36d6d87`(단언 불변).
- 2·3단계: 구현 `3b15136`, `pnpm verify` 마지막 줄 `✓ verify passed`. 포커스 테스트는 jsdom 대신 DOM 대역(계획 밖, 감독자 수용).
- 4단계(배포본 수동 확인): Cua Driver 없음 → 0.3.2 설치 뒤 사용자 확인으로 대체. 미검증.

## 롤백
커밋 되돌리기. 데이터 변경 없음.

# Spec: shortcut-settings
Source: intent.md (draft). Status: accepted.

## 열린 질문에 대한 답
1. **Q1 저장 위치 — 엔진 settings.json.** `Store.readSettings`·`saveSettings`(원자 쓰기)와 `routes/system.ts` 의 기능별 검증, UI 의 `SettingsSaves` 대기열을 그대로 쓴다. 테마가 localStorage 인 이유(첫 화면 전 동기 적용)는 단축키에 없다.
2. **Q2 저장 형식 — 동작마다 조합 하나.** `studioShortcuts: Record<동작 id, 조합 문자열>`. 지금 코드의 보조 조합(⌘M·⌃M 묶기, ⌃Z 등)은 없앤다. 이유: 조합이 둘이면 충돌 검사·표시·기록이 모두 두 배가 되고, ⌘M 은 macOS 창 최소화와 겹친다. Ctrl 조합은 macOS 에서 쓰지 않으므로 뺀다.
3. **Q3 배치 — 설정에 「단축키」 구역, 스튜디오 툴바에 「단축키」 팝오버.** 설정 구역은 「화면」 다음이다. 스튜디오는 툴바 오른쪽 끝 아이콘 버튼(접근 이름 「단축키」)을 누르면 여덟 동작과 현재 키가 팝오버로 보인다. 항상 보이는 목록은 타임라인 높이를 깎는다.
4. **Q4 금지 조합 — 글 편집·시스템 예약만.** 글 입력 요소 안에서는 모든 단축키를 막는다(051 의 판정 유지). 설정에서는 ⌘A·C·V·X(⇧ 변형 포함), ⌘⌫·⌘⌦, ⌘Q·W·H·M·Tab·Space, ⌘⇧3·4·5, Tab·Enter·Escape 를 배정하지 못한다. C·S·M 같은 글자 키는 글 입력 밖에서만 듣는 것이므로 허용한다.
5. **Q5 ⌘M — 기본값에서 뺀다.** 묶기는 M 만이다. 배포본에서 ⌘M 이 웹뷰에 오는지 확인할 필요가 없어진다.

## 요구사항
1. 설정 「단축키」 구역에 여덟 동작의 행이 있다. 행은 「동작 — 키 입력 칸 — 기본값으로」다. 동작: 포인터 자르기, 재생 헤드 자르기, 재생·일시 정지, 묶기, 풀기, 실행 취소, 다시 실행, 삭제.
2. 입력 칸에 포커스를 두고 조합 한 번을 누르면 기록하고 바로 저장한다. 한글 자판의 ㅊ·ㄴ·ㅡ 는 `KeyC`·`KeyS`·`KeyM` 으로 기록한다(물리 키 기준). 수정키만 누른 입력·반복 입력은 기록하지 않는다. Escape·포커스 이탈은 기록을 취소한다.
3. 다른 동작이 쓰는 조합, 답 4 의 예약 조합은 저장하지 않고 행에 오류 한 줄을 보인다(「재생 헤드 자르기에서 사용 중이에요」, 「글 편집에 사용하는 조합이에요」, 「시스템에서 사용하는 조합이에요」). 「기본값으로」도 같은 검사를 거친다.
4. 저장된 표는 모든 프로젝트와 앱 재실행에 적용된다. 설정이 없거나 잘못된 파일은 기본 표를 쓴다.
5. 스튜디오는 저장된 표로 판정한다. 바꾼 뒤 옛 키는 듣지 않는다. 툴바 「단축키」 팝오버와 실행 취소·다시 실행 버튼의 접근 이름이 현재 키를 보인다.
6. 각 동작의 편집 결과·실행 조건(포인터 아래 클립, 재생 헤드 위치, 녹음 중 재생 차단, 영상 1 마지막 클립 삭제 차단, repeat 차단)은 바뀌지 않는다.
7. 글 입력 요소 안, 조합 입력 중의 보호는 051 의 판정을 그대로 쓴다. 051 이 먼저 병합되고 이 변경은 그 위에 표 인수만 더한다.
8. 범위 밖: 전역 단축키, 순차 조합, 프로젝트별 설정, 새 편집 동작, 051 의 배포본 결함.

## 설계
### 데이터
- 새 `src/core/studio-shortcuts.ts`: 동작 id 8개, `DEFAULT_STUDIO_SHORTCUTS`, zod 스키마(`studioShortcuts` 는 선택 필드), `normalizeChord(event) → "Meta+Shift+KeyZ"` 같은 정규 문자열(순서 Meta·Ctrl·Alt·Shift·code), `parseStudioShortcuts(settings)`(없거나 잘못되면 기본 표, 부분 표는 빠진 동작만 기본값), `shortcutConflict(table, id, chord) → { kind: "action", id } | { kind: "text" } | { kind: "system" } | null`, `formatChord(chord)`(⌘⌃⌥⇧, ⌫ ⌦ Space, 글자 키는 대문자). UI·엔진이 같은 함수를 쓴다.
- 허용 code: `KeyA–Z`, `Digit0–9`, `Space`, `Backspace`, `Delete`, `F1–F12`, 방향키, `Home`·`End`·`PageUp`·`PageDown`. 삭제 동작은 `Backspace` 와 `Delete` 를 같은 키로 본다(macOS 의 delete 키가 Backspace 로 온다).

| 동작 id | 라벨 | 기본값 |
|---|---|---|
| split-pointer | 포인터 자르기 | KeyC |
| split-playhead | 재생 헤드 자르기 | KeyS |
| toggle-play | 재생·일시 정지 | Space |
| group | 묶기 | KeyM |
| ungroup | 풀기 | Shift+KeyM |
| undo | 실행 취소 | Meta+KeyZ |
| redo | 다시 실행 | Meta+Shift+KeyZ |
| delete | 삭제 | Backspace(=Delete) |

### API
- `GET /api/system/studio-shortcuts` → `{ bindings }`(검증된 표). `PUT` 은 전체 표를 받아 검증(여덟 id, 허용 code, 충돌·예약)하고 실패하면 400 + `{ code, action, conflict?, message }`, 파일 불변. 저장은 최신 설정을 읽어 `studioShortcuts` 만 바꾼다(`routes/system.ts` 의 다른 기능별 PUT 과 같은 방식).

### 실행 연결
- `studioShortcut(event, bindings)` 로 바꾼다. 051 의 입력 보호 판정을 먼저 적용하고, 그다음 `normalizeChord(event)` 로 표를 조회한다. 수정키는 정확히 비교한다(⇧M 은 풀기, M 은 묶기).
- App 이 엔진 연결 뒤 표를 한 번 읽어 보유하고 Studio·Settings 에 넘긴다. 읽기 전·실패 시에는 기본 표로 동작한다(편집을 막지 않는다). Settings 저장 성공 응답으로 App 의 표를 갱신한다. Studio 는 Timeline 에 같은 표를 넘긴다.
- 기록 핸들러는 입력 칸 전용이라 `studioShortcut` 을 거치지 않는다.

### 화면
- 설정: 구역 순서 「화면」「단축키」「브랜드」…. 행은 `SettingRow`(라벨 · readOnly 입력 칸(포커스 시 「키 입력 중」) · 「기본값으로」 버튼(기본값이면 비활성)). 오류는 행 아래 한 줄, `aria-describedby` 연결. 설명문·placeholder 없음.
- 스튜디오: 툴바 오른쪽 끝에 아이콘 버튼 「단축키」 → Popover 에 「동작 — 키」 여덟 줄. 실행 취소·다시 실행 버튼의 `title` 하드코딩(⌘Z·⇧⌘Z)을 현재 표의 값으로 바꾼다.

## 결정
1. 단축키는 앱 전체 설정이고 엔진 settings.json 에 동작 id → 물리 키 조합 하나로 저장한다. 보조 조합(⌘M·⌃M·⌃Z…)은 없앤다. → 결정 0016 의 「⌘M/M 묶기, ⇧⌘M/⇧M 풀기」 조항을 「기본 M·⇧M, 설정에서 재정의」로 보완하는 새 결정 파일(번호는 spec 승인 뒤 예약).
2. 스튜디오의 단축키 표시는 툴바 팝오버 하나다. 툴팁·도움말·상시 목록은 두지 않는다.

## 우려 사항
1. **보조 조합 삭제는 동작 변경이다.** ⌘M·⌃M·⌃Z·⌃⇧Z·⌦(삭제는 유지) 가 사라진다. 정책 소유자: 제품 책임자. 추천: 없앤다. 이유: 설정 화면의 충돌 검사와 표시가 단순해지고, ⌘M 은 macOS 최소화와 겹쳐 지금도 믿을 수 없다.
2. **051 과 같은 파일을 바꾼다.** `shortcuts.ts`·`shortcuts.test.ts`. 정책 소유자: 엔지니어링. 추천: 051 병합 뒤 rebase(장부 depends_on 설정됨).
3. **설정 파일에 잘못된 표가 있으면 기본 표로 조용히 돌아간다.** 정책 소유자: 제품 책임자. 추천: 알리지 않는다. 이유: 파일을 손으로 고치는 사용자만 겪고, 설정 화면에서 현재 값이 보인다.

## 검증 기준
1. `pnpm verify` 통과.
2. `tests/core/studio-shortcuts.test.ts`: 기본 표, 정규화(한글 key + KeyC → KeyC), 부분 표 채우기, 잘못된 파일 → 기본 표, 허용 code 밖 거절, 동작 간 충돌, 예약 조합 거절, formatChord.
3. `tests/ui/shortcuts.test.ts`: 기존 단언 유지 + 사용자 표의 새 키 실행, 옛 키 미실행, ⇧M/M 구분, ⌘M 미실행.
4. `tests/server/studio-shortcuts.test.ts`: GET 기본값, PUT 성공·재조회, 잘못된 PUT 400 + 파일 불변 + 다른 설정 보존.
5. `tests/ui/settings-shortcuts.test.tsx`: 여덟 행, 기록·Escape 취소·반복 무시, 자동 저장, 충돌 오류 한 줄과 이전 값 유지, 「기본값으로」.
6. `tests/ui/studio-shortcut-popover.test.tsx`: 팝오버 여덟 줄이 표와 일치, undo·redo 버튼 접근 이름에 현재 키.
7. 설치본 수동: 키 변경 → 스튜디오에서 새 키 동작·옛 키 무동작 → 앱 재실행 뒤 유지 → 기본값으로. 미실행이면 그렇게 적는다.

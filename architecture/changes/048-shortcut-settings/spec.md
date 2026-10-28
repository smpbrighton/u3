# Spec: shortcut-settings
Source: intent.md. Status: accepted.

## 열린 질문에 대한 답
1. **Q1 저장 위치 — 엔진 settings.json.** `Store.readSettings`·`saveSettings`(원자 쓰기)와 `routes/system.ts` 의 기능별 검증, UI 의 `SettingsSaves` 대기열을 그대로 쓴다. 테마가 localStorage 인 이유(첫 화면 전 동기 적용)는 단축키에 없다.
2. **Q2 저장 형식 — 동작마다 조합 하나.** `studioShortcuts: Record<동작 id, 조합 문자열>`. 지금 코드의 보조 조합(⌘M·⌃M 묶기, ⌃Z·⌃⇧Z, ⌘⌫·⇧⌫ 삭제)은 없앤다. 이유: 조합이 둘이면 충돌 검사·표시·기록이 모두 두 배가 된다. 명령 수정키는 플랫폼 공통 이름 `Mod` 로 저장한다. macOS 에서 `Mod` 는 ⌘, Windows(049 windows-build)에서는 Ctrl 이다. 사용자가 배정할 수 있는 수정키는 `Mod`·`Shift`·`Alt` 다. macOS 의 ⌃ 는 배정하지 못한다.
3. **Q3 배치 — 설정에 「단축키」 구역, 스튜디오 툴바에 「단축키」 팝오버.** 설정 구역은 「화면」 다음이다. 스튜디오는 툴바 오른쪽 끝 아이콘 버튼(접근 이름 「단축키」)을 누르면 여덟 동작과 현재 키가 팝오버로 보인다. 항상 보이는 목록은 타임라인 높이를 깎는다.
4. **Q4 금지 조합 — 글 편집·시스템·앱 메뉴 예약만.** 글 입력 요소 안에서는 모든 단축키를 막는다(051 의 판정 유지). 설정에서 배정하지 못하는 조합은 플랫폼별이다. macOS: ⌘A·C·V·X(⇧ 변형 포함), ⌘⌫, ⌘Q·W·H·Tab·Space, ⌘⇧3·4·5, 앱 메뉴 가속기 ⌃⌘F(전체 화면)·⌥⌘H(다른 앱 가리기), Tab·Enter·Escape. Windows: Ctrl+A·C·V·X(Shift 변형 포함), Ctrl+⌫, Ctrl+W·Tab·Space, Alt+F4, Tab·Enter·Escape. ⌘M 은 이 앱의 메뉴가 쓰지 않으므로(023 이 Minimize 를 뺐다) 예약하지 않는다. C·S·M 같은 글자 키는 글 입력 밖에서만 듣는 것이므로 허용한다.
5. **Q5 ⌘M — 기본값에서 뺀다.** 묶기는 M 만이다. 이유는 답 2 의 「동작마다 조합 하나」다.

## 요구사항
1. 설정 「단축키」 구역에 여덟 동작의 행이 있다. 행은 「동작 — 키 입력 칸 — 기본값으로」다. 동작: 포인터 자르기, 재생 헤드 자르기, 재생·일시 정지, 묶기, 풀기, 실행 취소, 다시 실행, 삭제.
2. 입력 칸에 포커스를 두고 조합 한 번을 누르면 기록하고 바로 저장한다. 한글 자판의 ㅊ·ㄴ·ㅡ 는 `KeyC`·`KeyS`·`KeyM` 으로 기록한다(물리 키 기준). 수정키만 누른 입력·반복 입력은 기록하지 않는다. Escape·포커스 이탈은 기록을 취소한다.
3. 다른 동작이 쓰는 조합, 답 4 의 예약 조합은 저장하지 않고 행에 오류 한 줄을 보인다(「재생 헤드 자르기에서 사용 중이에요」, 「글 편집에 사용하는 조합이에요」, 「시스템에서 사용하는 조합이에요」). 「기본값으로」도 같은 검사를 거친다.
4. 저장된 표는 모든 프로젝트와 앱 재실행에 적용된다. 설정이 없거나 잘못된 파일은 기본 표를 쓴다.
5. 스튜디오는 저장된 표로 판정한다. 바꾼 뒤 옛 키는 듣지 않는다. 툴바 「단축키」 팝오버와 실행 취소·다시 실행 버튼의 접근 이름(`aria-label`)이 현재 키를 보인다. 두 버튼의 `title` 은 지운다(결정 2).
6. 각 동작의 편집 결과·실행 조건(포인터 아래 클립, 재생 헤드 위치, 녹음 중 재생 차단, 영상 1 마지막 클립 삭제 차단, repeat 차단)은 바뀌지 않는다.
7. 글 입력 요소 안, 조합 입력 중의 보호는 051 의 판정을 그대로 쓴다. 버튼·탭·switch·checkbox·radio 포커스에서 막는 것은 물리 키 `Space` 다. 재생·일시 정지를 다른 키로 바꿔도 이 보호는 `Space` 에 남는다. 051 은 main 에 병합됐고 이 워크트리는 그 앞에서 분기했으므로 구현 전에 rebase 한다.
8. 범위 밖: 전역 단축키, 순차 조합, 프로젝트별 설정, 새 편집 동작, 051 의 배포본 결함.

## 설계
### 데이터
- 새 `src/core/studio-shortcuts.ts`: 동작 id 8개, `DEFAULT_STUDIO_SHORTCUTS`, zod 스키마(`studioShortcuts` 는 선택 필드), `normalizeChord(event, platform) → "Mod+Shift+KeyZ"` 같은 정규 문자열(순서 Mod·Alt·Shift·code. macOS 는 `metaKey` 를, Windows 는 `ctrlKey` 를 `Mod` 로 본다. 다른 명령키가 눌리면 null), `parseStudioShortcuts(settings, platform)`(없거나 잘못되면 기본 표. 항목 단위로 허용 code 밖·예약 조합이면 그 동작만 기본값. 채운 뒤 두 동작이 같은 조합이면 표 전체를 기본값), `shortcutConflict(table, id, chord, platform) → { kind: "action", id } | { kind: "text" } | { kind: "system" } | null`, `formatChord(chord, platform)`(macOS 는 ⌘⌥⇧, Windows 는 Ctrl+·Alt+·Shift+, ⌫ Space, 글자 키는 대문자). UI·엔진이 같은 함수를 쓴다. 플랫폼은 UI 가 `navigator.platform` 으로, 엔진이 `process.platform` 으로 정한다.
- 허용 code: `KeyA–Z`, `Digit0–9`, `Space`, `Backspace`, `F1–F12`, 방향키, `Home`·`End`·`PageUp`·`PageDown`. `Delete` 는 `normalizeChord` 가 항상 `Backspace` 로 정규화한다(macOS 의 delete 키가 Backspace 로 오고, 전진 삭제 키도 같은 동작이다). 그래서 `Delete` 는 저장 표에 나타나지 않는다. `code` 가 비어 있으면(051 의 `key` 판정 경로) 글자 키를 `Key<대문자>` 로 바꿔 정규화한다.

| 동작 id | 라벨 | 기본값 |
|---|---|---|
| split-pointer | 포인터 자르기 | KeyC |
| split-playhead | 재생 헤드 자르기 | KeyS |
| toggle-play | 재생·일시 정지 | Space |
| group | 묶기 | KeyM |
| ungroup | 풀기 | Shift+KeyM |
| undo | 실행 취소 | Mod+KeyZ |
| redo | 다시 실행 | Mod+Shift+KeyZ |
| delete | 삭제 | Backspace(Delete 도 같은 조합) |

### API
- `GET /api/system/studio-shortcuts` → `{ bindings }`(`parseStudioShortcuts` 를 거친 표). `PUT` 은 전체 표를 받아 검증(여덟 id, 허용 code, 충돌·예약)하고 실패하면 400 + `{ code, action, conflict?, message }`, 파일 불변. 저장은 최신 설정을 읽어 `studioShortcuts` 만 바꾼다(`routes/system.ts` 의 다른 기능별 PUT 과 같은 방식).

### 실행 연결
- `studioShortcut(event, bindings)` 로 바꾼다. 051 의 입력 보호 판정을 먼저 적용하고, 그다음 `normalizeChord(event)` 로 표를 조회한다. 수정키는 정확히 비교한다(⇧M 은 풀기, M 은 묶기).
- App 이 엔진 연결 뒤 표를 한 번 읽어 보유하고 Studio·Settings 에 넘긴다. 읽기 전·실패 시에는 기본 표로 동작한다(편집을 막지 않는다). Settings 저장 성공 응답으로 App 의 표를 갱신한다. Studio 는 Timeline 에 같은 표를 넘긴다.
- 기록 핸들러는 입력 칸 전용이라 `studioShortcut` 을 거치지 않는다.

### 화면
- 설정: 구역 순서 「화면」「단축키」「브랜드」…. 행은 `SettingRow`(라벨 · readOnly 입력 칸(포커스 시 「키 입력 중」) · 「기본값으로」 버튼(기본값이면 비활성)). 오류는 행 아래 한 줄, `aria-describedby` 연결. 설명문·placeholder 없음.
- 스튜디오: 툴바 오른쪽 끝에 아이콘 버튼 「단축키」 → Popover 에 「동작 — 키」 여덟 줄. 실행 취소·다시 실행 버튼의 `aria-label` 을 「실행 취소 ⌘Z」처럼 현재 표의 값으로 만들고, 하드코딩된 `title` 은 지운다.

## 결정
1. 단축키는 앱 전체 설정이고 엔진 settings.json 에 동작 id → 물리 키 조합 하나(`Mod` 는 플랫폼 명령키)로 저장한다. 보조 조합(⌘M·⌃M·⌃Z·⌃⇧Z·⌘⌫·⇧⌫)은 없앤다. → 결정 0016 의 「자르기(재생 헤드 S, 포인터 C)」 조항을 「기본 C·S·Space·M·⇧M·Mod+Z·Mod+⇧Z·⌫, 설정에서 재정의」로 보완하는 새 결정 파일(번호는 plan 때 예약).
2. 스튜디오의 단축키 표시는 툴바 팝오버 하나다. 툴팁(`title`)·도움말·상시 목록은 두지 않는다.

## 우려 사항
1. **보조 조합 삭제는 동작 변경이다.** ⌘M·⌃M·⌃Z·⌃⇧Z·⌘⌫·⇧⌫ 가 사라진다(⌦ 는 ⌫ 와 같은 조합으로 유지). 정책 소유자: 제품 책임자. 추천: 없앤다. 이유: 설정 화면의 충돌 검사와 표시가 단순해진다.
2. **051 과 같은 파일을 바꾼다.** `shortcuts.ts`·`shortcuts.test.ts`. 051 은 main 에 병합됐다. 추천: 구현 전에 main 을 rebase 한다. 기존 테스트의 보조 조합 단언(⌘M·⌃Z·⌃⇧M)은 새 설계대로 바꾸고, 나머지 단언은 유지한다.
3. **설정 파일에 잘못된 표가 있으면 기본 표로 조용히 돌아간다.** 정책 소유자: 제품 책임자. 추천: 알리지 않는다. 이유: 파일을 손으로 고치는 사용자만 겪고, 설정 화면에서 현재 값이 보인다.

## 검증 기준
1. `pnpm verify` 통과.
2. `tests/core/studio-shortcuts.test.ts`: 기본 표, 정규화(한글 key + KeyC → KeyC, Delete → Backspace, `code` 없는 글자 키, macOS metaKey → Mod, Windows ctrlKey → Mod, macOS ctrlKey → null), 부분 표 채우기, 채운 뒤 충돌 → 기본 표, 잘못된 파일 → 기본 표, 허용 code 밖 거절, 동작 간 충돌, 플랫폼별 예약 조합 거절, formatChord 두 플랫폼.
3. `tests/ui/shortcuts.test.ts`: 보조 조합 단언을 새 설계로 바꾸고 나머지 단언 유지 + 사용자 표의 새 키 실행, 옛 키 미실행, ⇧M/M 구분, ⌘M 미실행, 재생 키를 바꿔도 버튼 포커스에서 Space 차단 유지.
4. `tests/server/studio-shortcuts.test.ts`: GET 기본값, PUT 성공·재조회, 잘못된 PUT 400 + 파일 불변 + 다른 설정 보존.
5. `tests/ui/settings-shortcuts.test.tsx`: 여덟 행, 기록·Escape 취소·반복 무시, 자동 저장, 충돌 오류 한 줄과 이전 값 유지, 「기본값으로」.
6. `tests/ui/studio-shortcut-popover.test.tsx`: 팝오버 여덟 줄이 표와 일치, undo·redo 버튼 접근 이름에 현재 키.
7. 설치본 수동: 키 변경 → 스튜디오에서 새 키 동작·옛 키 무동작 → 앱 재실행 뒤 유지 → 기본값으로. 미실행이면 그렇게 적는다.

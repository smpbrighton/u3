# Review: shortcut-settings
Author: claude-opus-5-5. Status: draft. Round: 1.

## 대조한 것
- 변경: `architecture/changes/048-shortcut-settings/intent.md`, `spec.md`
- 지침: `AGENTS.md`, `architecture/INTENT.md`
- 결정(유효): `architecture/decisions/0016-caption-layers-opacity-brand.md`, `0025-ui-shadcn.md`, `0029-scene-review.md`. 단축키를 언급하는 대체된 결정 `0005`·`0010`·`0011`·`0012` 도 확인했다.
- 위키(main 레포 기준, 051 ingest 포함): `architecture/wiki/index.md`, `pages/concept-timeline-editing.md`, `pages/concept-ui-shell.md`
- 진행 중인 다른 변경(`ledger.sh show` 의 worktree 경로):
  - `u3-047-playback-speed/architecture/changes/047-playback-speed/intent.md`·`spec.md`. plan 은 없다.
  - `u3-049-windows-build/architecture/changes/049-windows-build/intent.md`·`spec.md`. plan 은 없다.
- 병합된 변경: `architecture/changes/051-studio-shortcuts/plan.md`(main), `architecture/changes/023-shortcuts-transition-length/plan.md`, `architecture/changes/043-shadcn-redesign/pages.md` 0절
- 코드(main 레포 `/Volumes/X31/workspace/smp_workspace/u3`):
  - `src/ui/studio/shortcuts.ts`, `src/ui/studio/Timeline.tsx`, `src/ui/screens/Studio.tsx`
  - `src/ui/screens/Settings.tsx`, `src/ui/settings/settings-save.ts`, `src/ui/settings/SettingsControls.tsx`
  - `src/engine/store.ts`, `src/engine/routes/system.ts`
  - `src-tauri/src/main.rs`(`macos_menu`), muda 0.20.0 `src/items/predefined.rs`(메뉴 가속기)
  - `tests/ui/shortcuts.test.ts`
- 047 과는 `Timeline.tsx` 파일만 겹친다. 의미가 충돌하는 곳은 찾지 못했다. 047 의 배속 입력은 INPUT 요소이므로 단축키 보호 대상이다.

## 발견

### Important
1. **049 windows-build 와 충돌한다. 키 모델이 macOS 에만 맞는다.**
   - 049 spec 은 accepted 다. 그 spec 의 「플랫폼별 기능과 화면」 표는 Windows 스튜디오가 「같은 편집 모델」을 쓴다고 정한다. 같은 spec 은 `GET /api/system` 에 `platform`·`capabilities` 를 더한다.
   - 048 spec 은 플랫폼 분기 없이 다음을 고정한다. 답 2 는 「Ctrl 조합은 macOS 에서 쓰지 않으므로 뺀다」이다. 기본값은 `Meta+KeyZ`·`Meta+Shift+KeyZ` 다. 답 4 의 예약 목록은 macOS 조합(⌘Q·W·H·M·Tab·Space, ⌘⇧3·4·5)이다. `formatChord` 는 ⌘⌃⌥⇧ 기호를 쓴다.
   - Windows 에서 `Meta` 는 Windows 키다. 그래서 Windows 사용자는 기본 표에서 Ctrl+Z 로 실행 취소하지 못한다. 지금 main 의 `studioShortcut` 은 `metaKey || ctrlKey` 를 명령 수정키로 본다. 그래서 지금 코드는 Windows 에서도 Ctrl+Z 로 동작한다. 048 이 이 동작을 없앤다.
   - muda 는 Windows 의 Redo 가속기를 Ctrl+Y 로 둔다. 048 의 예약 목록과 기본값은 이것을 반영하지 않는다.
   - 근거: `u3-049-windows-build/architecture/changes/049-windows-build/spec.md`(「플랫폼별 기능과 화면」), `048-shortcut-settings/spec.md`(답 2·답 4·데이터 표), main `src/ui/studio/shortcuts.ts`(`const command = Boolean(event.metaKey || event.ctrlKey)`), muda 0.20.0 `src/items/predefined.rs`(`Redo` 의 `not(target_os = "macos")` 분기)
2. **spec 결정 1 이 0016 에 없는 조항을 가리킨다.**
   - spec 결정 1 은 0016 의 「⌘M/M 묶기, ⇧⌘M/⇧M 풀기」 조항을 보완한다고 쓴다. 0016 에는 그런 조항이 없다.
   - 0016 에서 키를 정하는 조항은 「자르기(재생 헤드 S, 포인터 C)와 실행 취소(스냅숏 100개)는 앱이 만든다」 하나다. 이 변경은 사용자가 C·S 를 다른 키로 바꾸게 한다. 그래서 새 결정은 이 조항을 「기본 C·S, 설정에서 재정의」로 보완해야 한다.
   - 잘못된 조항을 대상으로 새 결정을 쓰면 다음 상태가 된다. 0016 은 accepted 인 채로 「S·C」를 정하고, 앱은 그 키를 듣지 않는다.
   - 근거: `architecture/decisions/0016-caption-layers-opacity-brand.md`(결정 절의 타임라인 화면 줄), `architecture/INTENT.md`(0016 줄), `048-shortcut-settings/spec.md`(결정 1), `intent.md`(제약 첫 줄)

### nit
1. **⌘M 을 없애는 이유가 이 앱의 메뉴와 맞지 않는다.**
   - spec 답 2·답 5·우려 1 과 intent Q2·Q5 는 「⌘M 은 macOS 창 최소화와 겹친다」를 이유로 ⌘M 묶기를 없앤다. 답 4 는 ⌘M 을 시스템 예약 조합에 넣는다.
   - 023 은 이 충돌을 피하려고 macOS 메뉴에서 Minimize 를 뺐다. main 의 `macos_menu` 의 Window 메뉴에는 `maximize`·`close_window` 만 있다. muda 의 ⌘M 가속기는 Minimize 항목에만 붙는다.
   - 그래서 이 앱에서는 메뉴가 ⌘M 을 쓰지 않는다. 설치본에서 ⌘M 이 웹뷰에 오는지는 확인하지 못했다. 위 판단은 코드에서 한 추정이다.
   - 이 이유를 그대로 두면 제품 책임자는 잘못된 전제로 사용자 기능(⌘M 묶기)을 없앤다. 그리고 비어 있는 조합을 예약한다. ⌘M 을 예약하면 023 이 Minimize 를 뺀 이유도 없어지지만, spec 은 메뉴를 어떻게 할지 정하지 않는다.
   - 근거: main `src-tauri/src/main.rs`(`macos_menu`), `architecture/changes/023-shortcuts-transition-length/plan.md`(11·33·39행), muda 0.20.0 `src/items/predefined.rs`(`Minimize` 가속기)
2. **예약 목록에 앱 자신의 메뉴 가속기가 빠졌다. Ctrl 을 배정할 수 있는지도 정하지 않았다.**
   - `macos_menu` 의 View > Fullscreen 은 ⌃⌘F 다. Hide Others 는 ⌥⌘H 다. 둘 다 답 4 의 예약 목록에 없다. 사용자가 둘 중 하나를 배정하면 메뉴가 그 키를 받는다. 그 결과 스튜디오 동작 대신 전체 화면 전환이나 다른 앱 가리기가 실행된다(추정, 설치본에서 확인하지 않음).
   - 답 2 는 「Ctrl 조합은 뺀다」고 쓴다. 그러나 `normalizeChord` 의 순서에는 Ctrl 이 있고, 허용 code 목록은 수정키를 말하지 않는다. 사용자 배정에서 Ctrl 을 허용하는지 정하지 않았다.
   - 허용하면 macOS 입력 소스 전환 기본 조합 ⌃Space 도 예약 대상이 된다. 한글 사용자가 이 조합을 쓴다. ⌃Space 가 기본 조합이라는 것은 문서로 확인하지 않은 추정이다.
   - 근거: main `src-tauri/src/main.rs`(`macos_menu` 의 `fullscreen`·`hide_others`), muda 0.20.0 `src/items/predefined.rs`(`Fullscreen`: `META | CONTROL` + `KeyF`, `HideOthers`: `CMD_OR_CTRL | ALT` + `KeyH`), `spec.md`(답 2·답 4·데이터)
3. **삭제의 보조 조합이 사라지지만 우려 1 에 없다. Backspace·Delete 를 같은 키로 보는 범위가 불명확하다.**
   - 지금 `studioShortcut` 은 삭제 판정을 command 검사보다 앞에서 하고 Shift 를 보지 않는다. 그래서 ⌘⌫·⇧⌫·⇧⌦ 도 삭제를 실행한다.
   - spec 의 「수정키는 정확히 비교한다」와 답 4 의 ⌘⌫·⌘⌦ 예약은 이 조합을 없앤다. 우려 1 의 사라지는 조합 목록은 「⌦(삭제는 유지)」만 말한다.
   - 데이터 절은 「삭제 동작은 Backspace 와 Delete 를 같은 키로 본다」고 쓴다. 다른 동작에 `Delete` 를 배정할 때 다음 세 가지를 정하지 않았다.
     - `shortcutConflict` 가 그 배정을 삭제와의 충돌로 보는지
     - 그 키를 누를 때 표 조회가 어느 동작을 고르는지
     - 삭제를 다른 키로 바꾼 뒤에도 두 키를 묶는지
   - 근거: main `src/ui/studio/shortcuts.ts`(`if (key === "delete" || key === "backspace") return "delete";` 가 `if (command) return null;` 앞에 있다), `spec.md`(우려 1·데이터·실행 연결)
4. **검증 기준 3 의 「기존 단언 유지」가 spec 의 설계와 충돌한다.**
   - main `tests/ui/shortcuts.test.ts` 는 다음을 단언한다.
     - 8·24·65행: ⌘M → `group`
     - 25행: ⌃Z → `undo`
     - 66행: ⌃⇧M → `ungroup`
     - 14행: `code: ""` 인 `c` → `split-pointer`
   - 답 2 와 검증 3 의 「⌘M 미실행」은 처음 셋을 뒤집는다.
   - 14행은 물리 키 코드가 없을 때 `key` 로 판정하는 051 의 경로다. spec 의 `normalizeChord` 는 `code` 만 정의하므로 이 경로를 어떻게 할지 정하지 않았다. 요구사항 7 은 051 의 판정을 「그대로」 쓴다고 쓴다. 이 경로가 그 판정에 들어가는지도 정하지 않았다.
   - 구현자는 기존 단언을 지우거나 설계를 어겨야 한다.
   - 근거: main `tests/ui/shortcuts.test.ts`, `src/ui/studio/shortcuts.ts`(`const key = event.code ? codeKey(event.code) : event.key.toLowerCase();`), `spec.md`(요구사항 7·검증 기준 3)
5. **부분 표를 채우면 충돌하는 표가 생길 수 있다.**
   - `parseStudioShortcuts` 는 부분 표에서 빠진 동작만 기본값으로 채운다. 저장된 부분 표가 다른 동작에 `KeyC` 를 두고 `split-pointer` 를 빠뜨렸으면, 채운 뒤의 표는 `KeyC` 를 두 동작에 둔다.
   - spec 은 `parseStudioShortcuts` 가 충돌·예약·허용 code 를 검사하는지 정하지 않았다. 그래서 GET 이 돌려주는 「검증된 표」의 뜻이 정해지지 않는다. 앞으로 동작을 더하면 부분 표가 실제로 생긴다.
   - 근거: `spec.md`(데이터의 `parseStudioShortcuts`, API 의 GET, 요구사항 4)
6. **실행 취소·다시 실행 버튼의 「접근 이름」과 `title` 이 맞지 않는다. 결정 2 와도 맞지 않는다.**
   - 요구사항 5 와 검증 6 은 두 버튼의 접근 이름이 현재 키를 보인다고 쓴다. 화면 절은 `title` 만 바꾼다.
   - 두 버튼에는 `aria-label="실행 취소"`·`"다시 실행"` 이 있다. 그래서 접근 이름은 바뀌지 않고, `title` 은 설명이 된다.
   - 결정 2 는 「툴팁 … 두지 않는다」고 쓴다. 그러나 `title` 은 키를 담은 네이티브 툴팁으로 남는다.
   - 근거: main `src/ui/screens/Studio.tsx`(실행 취소 `title="실행 취소 ⌘Z"`, 다시 실행 `title="다시 실행 ⇧⌘Z"`), `spec.md`(요구사항 5·화면·결정 2·검증 기준 6)
7. **051 의 Space 보호가 무엇을 기준으로 하는지 spec 이 정하지 않았다.**
   - 051 은 버튼·탭·switch·checkbox·radio 에 포커스가 있으면 물리 키 Space 만 막는다.
   - 048 에서는 사용자가 재생·일시 정지를 다른 키로 바꾸거나 Space 를 다른 동작에 줄 수 있다. 이때 보호가 물리 키 Space 를 따르는지, `toggle-play` 동작을 따르는지 spec 에 없다.
   - 요구사항 7 의 「그대로」는 물리 키 Space 를 뜻하는 것으로 읽힌다(추정). 테스트 항목에도 없다.
   - 근거: main `src/ui/studio/shortcuts.ts`(`if (key === " " && (tagName === "BUTTON" || spaceRoles.has(role))) return null;`), `architecture/wiki/pages/concept-timeline-editing.md`(051 줄), `spec.md`(요구사항 7·검증 기준 3)
8. **우려 2 의 「장부 depends_on 설정됨」이 장부와 다르다.**
   - `ledger.sh show` 에서 048 의 DEPENDS_ON 은 `-` 다. 051 plan 의 대조 절도 「장부 depends_on」을 전제로 쓴다.
   - 051 은 이미 main 에 병합됐다(`238985c`). 이 worktree 는 `2cb7f1f`(release 0.3.1) 위의 `9be3620` 에서 분기했으므로 051 의 코드가 없다. 구현 전에 rebase 가 필요하다.
   - 근거: `ledger.sh show` 출력, `architecture/changes/051-studio-shortcuts/plan.md`(대조), `spec.md`(우려 2·요구사항 7)
9. **spec 헤더가 「Source: intent.md (draft)」다.** intent.md 는 accepted 다. 근거: `spec.md` 2행, `intent.md` 2행

## 처리

| # | 발견 | 판단 |
|---|------|------|
| I1 | 049 와 충돌: 키 모델이 macOS 전용 | 채택 |
| I2 | 결정 1 이 0016 에 없는 조항을 가리킴 | 채택 |
| n1 | ⌘M 삭제 이유가 앱 메뉴와 맞지 않음 | 채택 |
| n2 | 앱 메뉴 가속기 예약 누락·Ctrl 배정 여부 미정 | 채택 |
| n3 | ⌘⌫·⇧⌫ 삭제 소실이 우려 1 에 없음·Delete 동일시 범위 | 채택 |
| n4 | 검증 3 「기존 단언 유지」가 설계와 충돌·code 없는 경로 | 채택 |
| n5 | 부분 표 채우기 뒤 충돌 가능 | 채택 |
| n6 | 접근 이름은 aria-label·title 은 툴팁 | 채택 |
| n7 | Space 보호 기준 미정 | 채택 |
| n8 | 우려 2 의 장부 depends_on 문구 | 채택 |
| n9 | Source 줄 | 채택 |

- I1 채택 — 명령 수정키를 플랫폼 공통 이름 `Mod`(macOS ⌘, Windows Ctrl)로 저장한다. 기본값 `Mod+KeyZ`·`Mod+Shift+KeyZ`. 예약 조합은 플랫폼별 목록. `normalizeChord`·`parseStudioShortcuts`·`shortcutConflict`·`formatChord` 가 platform 인수를 받는다. 배정할 수 있는 수정키는 Mod·Shift·Alt 뿐이고 macOS ⌃ 는 배정하지 못한다.
- I2 채택 — 새 결정은 0016 의 「자르기(재생 헤드 S, 포인터 C)」 조항을 「기본 C·S·Space·M·⇧M·Mod+Z·Mod+⇧Z·⌫, 설정에서 재정의」로 보완한다.
- n1 채택 — ⌘M 삭제 이유를 「동작마다 조합 하나」로 고친다. ⌘M 은 예약하지 않는다(023 이 Minimize 를 뺐다).
- n2 채택 — macOS 예약에 ⌃⌘F·⌥⌘H 를 더한다. ⌃ 는 배정 불가라 ⌃Space 문제는 없다.
- n3 채택 — 우려 1 에 ⌘⌫·⇧⌫ 를 더한다. `Delete` 는 `normalizeChord` 가 항상 `Backspace` 로 정규화하므로 저장 표에 나타나지 않고 충돌 검사도 하나다.
- n4 채택 — 검증 3: 보조 조합 단언(⌘M·⌃Z·⌃⇧M)은 새 설계로 바꾸고 나머지 유지. `code` 없는 글자 키는 `Key<대문자>` 로 바꿔 정규화한다.
- n5 채택 — `parseStudioShortcuts`: 항목 단위로 허용 code 밖·예약이면 그 동작만 기본값, 채운 뒤 충돌이 남으면 표 전체 기본값. GET 은 이 함수를 거친 표를 돌려준다.
- n6 채택 — 두 버튼의 `aria-label` 에 현재 키를 넣고 `title` 을 지운다.
- n7 채택 — 버튼·탭 포커스 보호는 물리 키 `Space` 를 따른다. 재생 키를 바꿔도 유지한다. 검증 3 에 추가.
- n8 채택 — 우려 2 를 「051 병합됨, 구현 전 rebase」로 고친다.
- n9 채택 — Source 줄 수정.

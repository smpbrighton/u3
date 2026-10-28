# Plan: shortcut-settings (from spec.md)

구현은 codex 워커, diff 대조는 세션. 워크트리는 0.3.1(`2cb7f1f`)에서 갈라졌으므로 구현 전에 main 을 rebase 한다. 병합 순서: 048 → 047 → 049.

## 검토 목록
사람이 결정할 것만. intent 승인 때 받은 항목(보조 조합 삭제, 설정 위치, 팝오버)은 다시 올리지 않는다.
1. **⌘⌫·⇧⌫ 삭제도 사라진다**(critic n3). 추천: 없앤다. 이유: 「동작마다 조합 하나」와 일관되고, ⌫ 하나로 충분하다. 근거 `spec.md` 우려 1.
2. **명령키를 `Mod` 로 저장하고 macOS ⌃ 조합은 배정할 수 없다**(critic I1, 049 대비). 추천: 채택. 이유: Windows 에서 같은 표가 Ctrl 로 동작한다. 근거 `spec.md` 답 2.
3. **실행 취소·다시 실행 버튼의 `title` 툴팁을 지우고 `aria-label` 에 키를 넣는다**(critic n6). 추천: 채택. 이유: 결정 2(툴팁 없음)와 일관. 사용자에게는 호버 힌트가 사라지고 팝오버가 대신한다.
4. **결정 0016 보완 파일을 새로 쓴다**(번호 0030, `ledger.sh reserve-decision` 으로 예약). 내용: 「기본 C·S·Space·M·⇧M·Mod+Z·Mod+⇧Z·⌫, 설정에서 재정의」. 0016 의 Status 는 유지(보완, 대체 아님). INTENT.md 0016 줄에 「단축키 기본값·재정의 → 0030」을 덧붙인다.

## Context
사용자는 스튜디오 단축키를 바꾸고 싶다. 지금은 `src/ui/studio/shortcuts.ts` 가 키를 하드코딩하고, Studio.tsx(undo·redo·play·group·ungroup·delete)와 Timeline.tsx(split-pointer·split-playhead)가 각자 `studioShortcut` 을 부른다. 설정은 엔진 `settings.json` 에 기능별 PUT 으로 저장하고 Settings.tsx 가 마운트 때 직접 GET 한다. UI 플랫폼 판별 코드는 없다. jsdom 없이 `renderToStaticMarkup` 으로 UI 를 시험한다.

## 바꿀 파일
- `src/core/studio-shortcuts.ts` (new): `STUDIO_ACTIONS`(id·라벨 8개), `DEFAULT_STUDIO_SHORTCUTS`, `StudioShortcutTable` zod(8 키 모두 string), `Platform = "mac" | "win"`, `normalizeChord(input, platform)`(Mod·Alt·Shift·code 순 문자열 또는 null. mac: metaKey→Mod, ctrlKey 있으면 null. win: ctrlKey→Mod, metaKey 있으면 null. `Delete`→`Backspace`. `code` 비면 한 글자 `key` 를 `Key<대문자>`, `" "`→`Space`), `ALLOWED_CODES`, `RESERVED_CHORDS(platform)`, `shortcutConflict(table, id, chord, platform)`, `parseStudioShortcuts(value, platform)`(항목 단위 기본값 대체 → 중복 남으면 전체 기본값), `formatChord(chord, platform)`, `lookupShortcut(table, chord)`.
- `src/ui/studio/shortcuts.ts`: `studioShortcut(event, bindings = DEFAULT_STUDIO_SHORTCUTS, platform = uiPlatform())`. 보호 판정(051: textTags·textRoles·contentEditable·range, `code` 없을 때 isComposing/229, BUTTON·spaceRoles 에서 물리 `Space`)은 그대로 두고, 그 뒤를 `normalizeChord` + `lookupShortcut` 로 바꾼다. 보조 조합 분기(줄 32–36)와 `codeKey` 를 지운다.
- `src/ui/platform.ts` (new): `uiPlatform()` — `navigator.platform` 이 `Mac` 으로 시작하면 `mac`, 아니면 `win`. 테스트에서 stub 가능.
- `src/engine/routes/system.ts`: `GET /api/system/studio-shortcuts` → `{ bindings: parseStudioShortcuts(settings.studioShortcuts, enginePlatform()) }`. `PUT` 은 `parseJson(c, StudioShortcutTable)` 뒤 각 id 로 `shortcutConflict` 검사. 실패는 `throw new HttpError(400, "shortcut-conflict", message, { action, conflict })`. 성공 시 최신 settings 읽어 `studioShortcuts` 만 바꿔 `saveSettings`, 응답 `{ bindings }`. `enginePlatform()` 은 `process.platform === "darwin" ? "mac" : "win"`.
- `src/ui/api.ts`: `api()` 가 던지는 Error 에 `code`·details 를 붙인다(`ApiError extends Error { code; details }`). 기존 호출은 message 만 쓰므로 호환.
- `src/ui/App.tsx`: 엔진 연결 성공 뒤 `GET /api/system/studio-shortcuts` 한 번 → `shortcuts` 상태(실패·읽기 전은 `DEFAULT_STUDIO_SHORTCUTS`). Studio 에 `shortcuts`, Settings 에 `shortcuts`·`onShortcuts` 전달.
- `src/ui/screens/Studio.tsx`: `props.shortcuts` 를 `studioShortcut` 둘째 인수로. Timeline 에 `shortcuts` prop 전달. 실행 취소·다시 실행 버튼 `aria-label` 을 `실행 취소 ${formatChord(...)}` 로, `title` 삭제. 툴바 오른쪽 끝(가로 확대 뒤)에 `Popover.Root`(radix-ui 직접 import, 알림 팝오버와 같은 꼴) 아이콘 버튼 `aria-label="단축키"`. 내용은 새 `src/ui/studio/ShortcutList.tsx`(export, `<dl>` 여덟 줄 「라벨 — formatChord」)로 분리해 테스트가 직접 렌더한다.
- `src/ui/studio/Timeline.tsx`: `shortcuts?` prop 추가, `studioShortcut(…, props.shortcuts)`; useEffect 의존성에 추가.
- `src/ui/settings/ShortcutSettings.tsx` (new): `SettingsGroup title="단축키"`. 행마다 `SettingRow label htmlFor` + readOnly `Input`(값 `formatChord`, 포커스 시 「키 입력 중」, `onKeyDown` 에서 `normalizeChord`; 수정키만·repeat·Escape 는 무시/취소; blur 로 취소) + `Button variant="ghost" size="sm"` 「기본값으로」(기본값이면 disabled). 오류는 행 바로 아래 `<p id role="alert" className="text-xs text-destructive">` 한 줄, Input 에 `aria-describedby`·`aria-invalid`. 저장: 로컬에서 `shortcutConflict` 먼저 검사 → 통과하면 `PUT` 전체 표(기존 `persist` 패턴, `saves.run("studio-shortcuts", …)`) → 응답 `bindings` 로 `onShortcuts`. 400 이면 details 의 메시지를 행 오류로. 문구: 「{라벨}에서 사용 중이에요」「글 편집에 사용하는 조합이에요」「시스템에서 사용하는 조합이에요」.
- `src/ui/screens/Settings.tsx`: `SECTIONS` 에 `["shortcuts","단축키"]` 를 `screen` 다음에. props 에 `shortcuts`·`onShortcuts`. 구역 렌더 추가.
- `architecture/decisions/0030-studio-shortcut-settings.md` (new), `architecture/INTENT.md` 0016 줄 보완.
- 테스트: `tests/core/studio-shortcuts.test.ts` (new), `tests/ui/shortcuts.test.ts`(보조 조합 단언 줄 8·24·25·65·66 을 새 설계로: ⌘M→null, ⌃Z→null(mac), ⌃⇧M→null. 나머지 유지 + 표 인수 케이스), `tests/server/studio-shortcuts.test.ts` (new, tts-settings.test.ts 의 setup 패턴), `tests/ui/settings-shortcuts.test.tsx` (new, settings-autosave 패턴: Input·Button mock 으로 onKeyDown·onClick 꺼내기, `api` mock), `tests/ui/studio-shortcut-popover.test.tsx` (new, `ShortcutList` 직접 렌더 + Studio 소스 문자열에 `aria-label="단축키"`), `tests/ui/settings-layout.test.tsx`(sections·labels 에 단축키 추가), `tests/ui/studio-toolbar.test.ts`(「단축키」 포함).

## 순서
1. rebase main. `CI=true pnpm install --frozen-lockfile`.
2. `src/core/studio-shortcuts.ts` + `tests/core/studio-shortcuts.test.ts` → 통과 → 커밋.
3. `tests/ui/shortcuts.test.ts` 수정(새 설계 단언 추가, 보조 조합 단언 반전) → 실패 확인 → 커밋. `shortcuts.ts`·`platform.ts` 구현 → 통과 → 커밋.
4. 엔진 라우트 + `tests/server/studio-shortcuts.test.ts`(실패 먼저) → 통과 → 커밋.
5. App·Studio·Timeline·ShortcutList·`api.ts` + popover 테스트 → 커밋.
6. ShortcutSettings·Settings + settings 테스트·layout 테스트 수정 → 커밋.
7. 결정 0030·INTENT.md → `pnpm verify` → 커밋.
8. `pnpm package` 뒤 설치본 수동 확인(증명 3) → `worktree.sh finish shortcut-settings`.

## 리스크
- 가장 위험한 단계는 3 이다. 판정 순서를 바꾸면 051 의 보호가 깨질 수 있다. 051 단언을 모두 유지하는 것이 방어다. 택하지 않은 대안: 하드코딩 표를 두고 설정만 덮어쓰기 — 두 판정 경로가 남아 충돌 검사가 두 배가 된다.
- Radix Popover 는 static markup 에 Content 가 없다. 내용을 `ShortcutList` 로 분리해 시험한다.
- `api.ts` 변경은 모든 UI 호출에 닿는다. message 만 쓰는 기존 호출은 그대로다.

## 증명
1. 3·4 단계의 실패 출력, 통과 출력, `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 서버 테스트: GET 기본값, PUT 성공·재조회, 충돌 PUT 400 + settings.json 불변 + 다른 키(`scriptTone`) 보존, 잘못된 표 → GET 기본값.
3. 설치본 수동(감독자 또는 사용자): 설정 「단축키」에서 포인터 자르기를 X 로 → 스튜디오에서 X 로 자르기, C 무동작 → 앱 재실행 뒤 유지 → 「기본값으로」. 미실행이면 그렇게 적는다.

## 롤백
커밋 되돌리기. `settings.json` 의 `studioShortcuts` 키는 구버전이 무시한다.

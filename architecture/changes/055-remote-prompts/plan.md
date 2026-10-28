# Plan: 055 remote-prompts (full)
Track: full. intent·spec accepted(`375936f`), review draft(`6e19e38`). 승인되면 `accept.sh --with-plan remote-prompts` 로 review·plan 을 받고 0034 를 accepted 로 바꾼다. 구현은 codex 워커, diff 대조는 세션.

## 검토 목록
1. **critic n5 일부 기각 — 비교 화면 없음.** 고친 사용자가 새 기본값을 보려면 「기본값으로」를 눌러야 하고 고친 본문은 사라진다. 추천: 이대로 간다. 이유: 비교 화면은 이 변경보다 작업이 크고, 「새 기본값이 있어요」 표시만으로 사용자가 판단할 수 있다. 근거: `spec.md` 우려 사항 5, `review.md` n5.
2. **0033(049, accepted) 해석 — `prompts` 자산은 교체한다.** 0033 의 「공개 Release 의 자산을 교체하지 않는다」는 버전 Release 에 대한 규칙으로 보고, 0034 가 `prompts` 를 갱신용 고정 주소로 명시한다. 추천: 이 해석으로 간다. 이유: `release.sh` 와 분리했으므로 부분 공개 문제가 없고, 고정 주소 없이는 최신 파일을 찾는 데 GitHub API 가 필요하다. 근거: `spec.md` 우려 사항 3, `git show 049-windows-build:architecture/decisions/0033-release-flow.md`.
3. **개발자 절차 변경 — 기본 프롬프트를 바꿀 때 `PROMPT_REVISION` 을 올리고 `PROMPT_TEXT_HASH` 를 갱신해야 한다.** 시험이 hash 불일치를 잡고 갱신 방법을 실패 메시지로 알린다. 그 뒤 `scripts/publish-prompts.sh` 로 올린다. 추천: 이대로 간다. 이유: revision 을 원격에서 계산하면 자산 삭제 뒤 revision 이 되돌아간다(critic n2). 근거: `spec.md` 설계 「데이터」.
4. **외부 공개 동작 — 병합 뒤 `prompts` prerelease 를 처음 만들고 revision 1 을 올린다.** 공개 레포에 새 prerelease 가 생긴다. 추천: plan 승인으로 함께 받는다. 이유: 설치본 증명에 필요하고 본문은 현재 기본값과 같다.

## Context
기본 프롬프트(대본, 캐러셀 「주제로」·「영상으로」)는 앱 코드 상수라 고칠 때마다 앱 릴리스가 필요하다. 사용자는 기본값을 GitHub Release 에 두고, 기본값을 쓰는 사용자는 자동으로 새 기본값을 쓰고 고친 사용자는 그대로 두기를 원한다. 설계는 `architecture/changes/055-remote-prompts/spec.md`, 결정은 `decisions/0034-remote-default-prompts.md`.

## 바꿀 파일
- `src/core/default-prompts.ts` (new): `PROMPT_SCHEMA = 1`, `PROMPT_REVISION = 1`, `PROMPT_TEXT_HASH`(= sha256 of `JSON.stringify([script, carouselTopic, carouselVideo])`), `BUNDLED_PROMPT_DEFAULTS = { schema, revision, script, carouselTopic, carouselVideo }`(기존 `DEFAULT_*` 상수 재사용), 타입 `PromptDefaults`, zod `PromptDefaultsFile`(schema literal, revision int ≥ 1, 본문 trim 비어 있지 않음·≤ 20000). node crypto 는 쓰지 않는다(UI 공용).
- `src/engine/prompt-defaults.ts` (new): `createPromptDefaults({ dataDir, env, fetchImpl, now? })` → `{ current(): Promise<PromptDefaults>, refresh(): Promise<void>, start(): () => void }`.
  - 개발 실행 = `!env.U3_RESOURCE_DIR`(`jev-key.ts:55` 관례). 개발: 캐시 읽기·쓰기 없음. `U3_PROMPTS_URL` 이 있을 때만 받아 메모리에 둔다. 설치본: 고정 주소 `https://github.com/smpbrighton/u3/releases/download/prompts/prompts-schema-${PROMPT_SCHEMA}.json`, `U3_PROMPTS_URL` 무시, 캐시 `<dataDir>/prompt-defaults.json` (`writeJsonAtomic` 재사용, store.ts 와 같은 함수).
  - 받기: `AbortSignal.timeout(10_000)`, 응답 512KB 초과·JSON 오류·스키마 불일치는 무시하고 `console.error` 로그. revision 이 현재 캐시보다 클 때만 교체.
  - `current()`: 진행 중인 첫 받기를 최대 3초 기다린 뒤 캐시와 `BUNDLED_PROMPT_DEFAULTS` 중 revision 큰 쪽(같으면 bundled).
  - `start()`: 즉시 `refresh()`(기다리지 않음) + `setInterval(6h)`, 해제 함수 반환.
  - `promptHash(text)`: sha256 hex.
- `src/engine/prompt-settings.ts` (new, system.ts 중복 제거): 세 프롬프트 정의 `[{ kind, key, baseKey }]`, `promptState(settings, defaults, kind)` → `{ prompt, isDefault, defaultPrompt, newerDefault }`, `applyPrompt(settings, defaults, kind, raw)`(trim, 비거나 기본값과 같으면 key·baseKey 삭제, 아니면 key = 본문·baseKey = promptHash(기본값)).
- `src/engine/app.ts`: `AppContext.promptDefaults?: () => Promise<PromptDefaults>`; 없으면 `BUNDLED_PROMPT_DEFAULTS` 를 내는 기본값(기존 테스트 컨텍스트 변경 없음).
- `src/engine/main.ts`: `createPromptDefaults({ dataDir: store.root, env: process.env, fetchImpl: fetch })`, `start()`, 컨텍스트에 `promptDefaults: () => prompts.current()`. 해제는 `installEngineShutdown` 경로에 더한다.
- `src/engine/routes/system.ts`: script-prompt GET/PUT, carousel-prompts GET/PUT 를 `prompt-settings.ts` 로 바꾼다. 응답에 `defaultPrompt`·`newerDefault` 추가. script 응답의 `rulesPreview` 유지.
- `src/engine/routes/script.ts:124`, `src/engine/routes/carousels.ts:227·353`: `DEFAULT_*` 대신 `(await context.promptDefaults()).script` 등.
- `src/ui/screens/Settings.tsx`: `DEFAULT_SCRIPT_PROMPT`·`DEFAULT_CAROUSEL_*` import 제거. 상태에 프롬프트별 `{ prompt, defaultPrompt, newerDefault, saved }`. 「기본값으로」 → `changePrompt(defaultPrompt)` 후 빈 본문 PUT. blur → `value !== saved` 일 때만 PUT. 응답으로 상태 갱신(기존 `promptRef.current === value` 경쟁 처리 유지). `newerDefault` 면 SettingsGroup 제목 옆 `<span className="text-2xs text-muted-foreground">새 기본값이 있어요</span>`(SettingsGroup 에 제목 보조 슬롯이 없으면 `title` 을 ReactNode 로 받게 한다).
- `scripts/publish-prompts.ts` (new, tsx) + `scripts/publish-prompts.sh` (new): 깨끗한 main 확인 → `BUNDLED_PROMPT_DEFAULTS` 로 `$TMPDIR/prompts-schema-N.json` 생성 → 원격 파일을 `curl -fsSL` 로 받음(없으면 없음) → `decidePublish(remote, local)`: 같은 revision·같은 본문 = unchanged, 원격 revision ≥ local 이고 본문 다름 = 실패, 그 밖 = publish. publish 는 `gh release view prompts` 없으면 `gh release create prompts --prerelease --title "Default prompts" --notes ...`, 그 뒤 `gh release upload prompts <file> --clobber`. `--dry-run` 은 결정과 파일 경로만 출력. 정상 출력 `✓ prompts published: schema N revision R` / `✓ prompts unchanged`. gh 옵션은 구현 전에 `gh release create --help`·`upload --help` 로 확인한다.
- `AGENTS.md` 커맨드 절: `scripts/publish-prompts.sh` — 깨끗한 main 의 기본 프롬프트를 `prompts` prerelease 에 올린다. 정상 출력 한 줄.
- 테스트:
  - `tests/core/default-prompts.test.ts`: `PROMPT_TEXT_HASH` 가 세 상수의 sha256 과 같음(실패 메시지: 「기본 프롬프트를 바꿨으면 PROMPT_REVISION 을 올리고 PROMPT_TEXT_HASH 를 갱신」), 스키마 검증 경계(빈 본문, 20001자, revision 0, schema 2).
  - `tests/engine/prompt-defaults.test.ts`(tmp dataDir, 가짜 fetch): 캐시 없음 → bundled; 원격 revision 2 → 캐시 생성·current 가 원격; revision 같거나 작음 → 교체 없음; 실패·시간 초과·512KB 초과·필드 누락 → 이전 값; bundled revision > 캐시 → bundled; 개발 실행은 fetch 안 부르고 캐시 파일 안 만듦; 개발 + `U3_PROMPTS_URL` → 메모리만; 설치본은 `U3_PROMPTS_URL` 무시하고 고정 주소; 첫 받기 진행 중 `current()` 가 3초 안에서 기다림(가짜 타이머).
  - `tests/server/script-prompt.test.ts`·`carousel-prompts.test.ts` 확장: `promptDefaults` 주입으로 원격 기본값 바뀐 뒤 미수정 = 새 본문, 수정 = 그대로·`newerDefault` 참(바뀐 프롬프트만), baseHash 없으면 거짓, 빈 본문 PUT → 키·baseHash 삭제, 대본 PUT 응답 필드.
  - `tests/server/carousels.test.ts`·`carousel-derived.test.ts`·대본 생성 테스트(기존 script 라우트 테스트 파일): codex 프롬프트가 주입한 기본값으로 시작.
  - `tests/ui/settings-autosave.test.tsx`·`settings-carousel-prompts.test.tsx` 수정: 「기본값으로」 = 빈 본문 PUT, 바뀌지 않은 blur 는 요청 없음, `newerDefault` 표시.
  - `tests/scripts/publish-prompts.test.ts`(또는 기존 scripts 테스트 위치): `decidePublish` 세 경우.

## 순서
1. 실패 테스트 먼저: core·engine·server·UI·publish 테스트를 추가하고 실패를 확인해 커밋(실패 출력 기록).
2. `default-prompts.ts` + `prompt-defaults.ts` → 커밋.
3. `prompt-settings.ts`, `app.ts`, `main.ts`, 라우트 세 개 → 커밋.
4. `Settings.tsx` → 커밋.
5. `publish-prompts.{ts,sh}` + AGENTS.md → `pnpm verify` → 커밋.
6. 세션: diff 를 spec·plan 과 대조 → `worktree.sh finish remote-prompts` → wiki ingest → push.
7. 세션: `scripts/publish-prompts.sh --dry-run` → `scripts/publish-prompts.sh`(revision 1 공개) → `release.sh 0.3.7` → 설치.

## 리스크
- 가장 위험한 단계는 3(라우트 교체)이다. `isDefault`·키 삭제 비교가 상수에서 현재 기본값으로 바뀌므로, 기본값과 같은 본문을 저장한 기존 사용자 상태가 달라질 수 있다. 서버 테스트가 미수정·수정·빈 본문 세 경우를 덮는다.
- 엔진 시작이 네트워크를 기다리지 않아야 한다. `start()` 는 기다리지 않고, `current()` 의 대기는 3초 상한이다.
- 049 와 `system.ts`·`Settings.tsx` 가 겹친다. 049 가 나중에 rebase 한다.
- 택하지 않은 대안: 원격 revision + 1 계산(자산 삭제 시 revision 이 되돌아감), `release.sh` 연동(0033 부분 공개 충돌), 서명(우려 사항 1).

## 증명
1. 1단계 실패 출력과 `pnpm verify` 마지막 줄 `✓ verify passed`.
2. `scripts/publish-prompts.sh --dry-run` 출력, 실제 공개 출력 `✓ prompts published: schema 1 revision 1`, `curl -fsSL <주소> | jq .revision` = 1.
3. 설치본 0.3.7: 다시 시작 뒤 `~/Library/Application Support/U3/prompt-defaults.json` 이 생기고 revision 1, 설정의 세 프롬프트가 현재 기본 본문이다(GET API 또는 화면).
4. 본문 변경 전파는 시험만으로 증명한다(운영 자산에 시험 본문을 올리지 않는다).

## 롤백
커밋 되돌리기. 새 설정 키(`*BaseHash`)와 캐시 파일은 구버전이 무시한다. 공개한 본문이 잘못되면 고친 본문을 더 큰 `PROMPT_REVISION` 으로 다시 올린다. `prompts` prerelease 는 `gh release delete prompts` 로 지울 수 있고, 앱은 bundled 로 돌아간다.

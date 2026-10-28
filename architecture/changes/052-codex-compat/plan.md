# Plan: 052 codex-compat (lite)
Track: lite. 승인되면 `u3-052-codex-compat/architecture/changes/052-codex-compat/plan.md` 에 커밋한다. 구현은 codex 워커(네 번째), diff 대조는 세션.

## Context
사용자 보고 두 가지. ① 「대본을 만들지 못했어요 · Codex CLI 요청이 실패했습니다 (종료 코드 1): … The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account … model_not_found」. ② 설정에 「codex 로그인이 필요해요」가 떠 있는데 실제로는 로그인돼 있고, 「U3의 Codex 실행 경로가 비어 있어 자동 검색이 실패하는 상태라, 로그인된 CLI 경로를 지정하고 앱을 재시작」해서 풀었다.

확인한 원인:
- 모델 `gpt-6-luna` 가 여섯 곳에 하드코딩돼 있다(`routes/script.ts:66`, `captions.ts:21,45`, `carousels.ts:182,260,318`, `system.ts:28,219`, `pipeline/codex.ts:75`). 계정 플랜·CLI 버전에 따라 ChatGPT 로그인 경로에서 그 모델이 거절된다(openai/codex #49396·#43751: 0.157 이하 CLI 는 카탈로그가 낡아 400, 0.159.3 이상에서 해결. 플랜 만료·미포함도 같은 문구). 앱은 사용자 계정의 카탈로그(`codex debug models`)를 이미 읽지만 기본값 선택에 쓰지 않고, 실패해도 다른 모델로 넘어가지 않는다.
- `findCodexPath` 는 `$SHELL -lc "command -v codex"` 하나만 쓴다(`pipeline/codex-path.ts:10-12`). 로그인 셸은 `.zshrc` 를 읽지 않아 nvm·npm 전역 경로를 모른다. 표준 설치본 `~/.codex/packages/standalone/current/bin/codex` 도 PATH 에 없으면 못 찾는다. 못 찾으면 `installed:false` 인데 UI 문구는 `installed` 가 false 면 「설치가 필요해요」, 로그인 확인 실패면 「로그인이 필요해요」라 사용자가 원인을 알 수 없다.
- CLI 버전을 보지 않는다. `codexFailureReason` 은 「옵션 미지원」만 잡는다.

## 결정
- 사용자 지시 원문: "내가 보기엔 codex cli 버전이 낮은거 같은데 이런 사용자가 태반일것 같아 이것도 마저 수정해줘".
- 모델: 기본값을 하드코딩하지 않는다. 저장된 모델이 계정 카탈로그에 있으면 그것, 없으면 선호 순서(`gpt-6.1-sol`→`gpt-6-luna`→`gpt-6.1-terra`→`gpt-6-astra`) 중 카탈로그에 있는 첫 모델, 카탈로그가 없으면 `gpt-6.1-sol`. 실행이 「모델 사용 불가」로 실패하면 카탈로그의 다음 모델로 한 번씩 바꿔 최대 2회 재시도하고, 성공한 모델을 설정에 저장하며 결과 메시지에 「모델 A 를 쓸 수 없어 B 로 바꿨어요」를 넣는다. 전부 실패하면 「이 계정에서 쓸 수 있는 codex 모델이 없어요. codex 를 업데이트하거나 ChatGPT 플랜을 확인하세요」.
- 버전: `codex --version` 을 읽어 `0.159.3` 미만이면 `outdated`. 상태 응답에 `version`·`outdated`. UI 경고 「codex 업데이트가 필요해요 (현재 0.153.4, 0.159.3 이상 필요)」. 대본 생성은 outdated 면 막는다(로그인 안 됨과 같은 취급). 기준 근거: openai/codex #49396 의 사용자 보고(0.157.1 실패, 0.159.3·0.162.1 성공). 공식 최소 버전 문서는 없다(미확인 → 상수 하나로 두고 주석에 근거).
- 경로: 설정값 → `$SHELL -lc` → `$SHELL -ilc`(stdin ignore, `TERM=dumb`, 10초) → 후보 파일(`~/.codex/packages/standalone/current/bin/codex`, `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.npm-global/bin`, `~/.volta/bin`, `~/.bun/bin`, `~/Library/pnpm`, `~/.nvm/versions/node/*/bin` 중 최신) 순서로 실행 가능한 첫 파일. 찾은 경로는 설정에 쓰지 않는다(다음 실행 때 다시 찾는다).
- 문구: `installed:false` 는 「codex 를 찾지 못했어요」+「실행 파일 지정」 버튼(지금과 같은 버튼), 로그인 확인 실패는 「codex 로그인이 필요해요」, outdated 는 위 문구. 모델 불가 오류는 「이 계정에서 '<model>' 모델을 쓸 수 없습니다」.

## 대조
결정 0024(codex CLI, 기본 `gpt-6-luna`)의 「기본 모델」 문구가 바뀐다 → 대체가 아니라 보완: 결정 0024 본문은 두고 INTENT.md AI 줄의 「기본 `gpt-6-luna`」를 「기본은 계정 카탈로그에서 고름」으로 고친다(결정 파일 추가 없음. 기본값 선택 규칙은 코드·위키에 남긴다). 진행 중 변경과 겹치는 파일: 049 windows-build 가 `codex-path.ts`·`system.ts`·`CodexWarning`·`Settings.tsx` 를 바꾼다 → 052 를 먼저 병합하고 049 가 rebase 한다(장부 049 depends_on 에 codex-compat 추가). 047·048 과는 겹치지 않는다.

## 바꿀 파일
- `src/core/codex-model.ts` (new): `CODEX_MIN_VERSION = "0.159.3"`, `CODEX_MODEL_PREFERENCE`, `resolveCodexModel(saved, catalogSlugs)`, `nextCodexModel(failed: string[], catalogSlugs)`, `isCodexModelUnavailable(text)`(`/not supported when using Codex with a ChatGPT account|"code":"model_not_found"|Model metadata for '.+' not found/i`), `compareVersion(a, b)`, `isCodexOutdated(version)`.
- `src/engine/pipeline/codex-path.ts`: `findCodexPath` 후보 탐색(위 결정), `codexVersion(bin)`(`--version` → `/(\d+\.\d+\.\d+)/`), `codexLoginStatus` 가 `{ installed, loggedIn, version, outdated, error? }` 반환.
- `src/engine/codex-settings.ts` (new): `codexSelection(context)` → settings·카탈로그(`readCodexModels` 를 `system.ts` 에서 여기로 옮김, 60초 메모리 캐시)로 `{ bin, model, effort, catalogSlugs }`. `withCodexModelFallback(context, run: (model) => Promise<T>)`: 실행 → `CodexModelUnavailableError` 면 `nextCodexModel` 로 최대 2회 재시도, 성공 시 `saveSettings({ codexModel })`, 반환 `{ value, switchedFrom? }`.
- `src/engine/pipeline/codex.ts`: `CodexModelUnavailableError extends CodexError`(model 보유). 실패 분기에서 `isCodexModelUnavailable(result.stderr + events.detail)` 이면 이 오류. `codexCliArgs` 의 `?? "gpt-6-luna"` 제거(model 필수). `codexFailureReason` 에 모델 불가 문구 추가.
- `src/engine/pipeline/codex-image.ts:112`: 같은 판정으로 `CodexModelUnavailableError`.
- `src/engine/routes/script.ts:66`, `captions.ts:21,45`, `carousels.ts:182,260,318`: `codexSelection` + `withCodexModelFallback`. 바뀐 모델은 job 완료 메시지(`message`)에 「모델 A 를 쓸 수 없어 B 로 바꿨어요」.
- `src/engine/routes/system.ts`: `DEFAULT_CODEX_MODELS` 제거(카탈로그 없으면 `[{ slug: "gpt-6.1-sol", … }]` 를 `codex-model.ts` 의 상수로), `GET /api/system/codex-settings` 가 `resolveCodexModel` 결과(+ `resolved: true/false`)를, `GET /api/system` 이 version·outdated 를 돌려준다.
- `src/ui/types.ts`: `SystemStatus.codex` 에 `version?`·`outdated?`.
- `src/ui/components/u3/CodexWarning.tsx`, `src/ui/screens/Settings.tsx:246,297`, `src/ui/screens/Script.tsx:90`: 문구 세 가지·outdated 차단·「실행 파일 지정」 버튼은 `!installed` 때 유지.
- `architecture/INTENT.md` AI 줄. `architecture/wiki` 는 ingest 때.
- 테스트: `tests/core/codex-model.test.ts` (new), `tests/engine/codex-path.test.ts` (new: 가짜 HOME 의 standalone 경로 탐색, 실패하는 셸, `--version` 파싱·outdated), `tests/engine/codex.test.ts`(모델 불가 stderr → `CodexModelUnavailableError`, 실제 오류 원문 fixture), `tests/engine/codex-image.test.ts`(같음), `tests/server/codex-models.test.ts`(저장 모델이 카탈로그에 없으면 GET 이 선호 모델, 가짜 codex 가 luna 에 400 → sol 로 재시도 성공 → settings 갱신·메시지, 전부 실패 메시지, `/api/system` 의 version·outdated), `tests/ui/codex-warning.test.tsx` (new: 세 문구).

## 순서
1. `codex-model.ts` + 테스트 → 커밋.
2. `codex-path.ts` 탐색·버전 + 테스트(실패 먼저: 가짜 HOME 후보를 못 찾음) → 커밋.
3. `codex.ts`·`codex-image.ts` 오류 분류 + 테스트(실패 먼저: 원문 stderr 로 일반 CodexError 가 남) → 커밋.
4. `codex-settings.ts` + 라우트 교체 + 서버 테스트(실패 먼저) → 커밋.
5. UI·types·INTENT → `pnpm verify` → 커밋.
6. 설치본 확인(감독자): 설정에서 모델을 카탈로그에 없는 값으로 둔 뒤 대본 생성 → 자동 전환 메시지. `finish codex-compat` → wiki ingest → push → release 0.3.3.

## 리스크
- 가장 위험한 단계는 4 다. 재시도가 image_gen 처럼 비용이 드는 호출에서 중복 생성될 수 있다. 모델 불가 오류는 요청 전 400 이라 생성 전에 끝난다. 그래도 재시도는 `CodexModelUnavailableError` 에만 한다. 택하지 않은 대안: 오류 문구만 바꾸고 사용자가 모델을 고르게 두기 — 「태반」인 사용자가 설정을 열어야 한다.
- `-ilc` 는 `.zshrc` 가 대화형 입력을 기다리면 10초 timeout 으로 끝난다. 후보 파일 탐색이 그 뒤에 있어 결과는 나온다.
- 버전 기준 0.159.3 은 사용자 보고 기반이다. 상수 하나라 바꾸기 쉽다.

## 증명
1. 2·3·4 단계 실패 출력, 통과 출력, `✓ verify passed`.
2. 서버 테스트의 재시도 시나리오(luna 400 → sol 성공, settings 에 `codexModel: "gpt-6.1-sol"`).
3. 설치본: 이 PC 에서 `codex-path` 설정을 지우고 앱 재실행 → 자동 탐색이 `~/.codex/packages/standalone/current/bin/codex` 를 찾아 로그인 상태가 보임. 모델을 `gpt-5.5` 로 저장한 뒤 대본 생성 → 전환 메시지. 미실행이면 적는다.

## 롤백
커밋 되돌리기. settings.json 의 `codexModel` 은 이전 코드도 그대로 읽는다.

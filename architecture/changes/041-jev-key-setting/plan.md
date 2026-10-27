# Plan: jev-key-setting (lite)
Track: lite.

## Context
사용자 지시: 「레포 분리하지 말고, 사용자가 Jev 키 입력하는 걸로 하자. Jev 키는 설정에서 입력하는 걸로.」
지금은 `scripts/build-engine.ts:41-49,135` 가 `.env` 의 `TYPESAFE_API_KEY` 를 엔진 번들(`engine.mjs`)에 문자열로 넣는다(결정 0018). 자동 업데이트(0021)로 public 레포 `smpbrighton/u3` 의 Release 에 dmg·tar.gz 를 올리면 누구나 키를 꺼낼 수 있다. 0.2.0 릴리스 전에 키를 빌드에서 뺀다. W67(레포 분리)은 이미 되돌렸고(07c2610) 소스 레포는 다시 public 이다.

엔진의 키 사용처: `src/engine/main.ts:93`(`jevAvailable`), `src/engine/pipeline/jev.ts:160-162`(`jevClientFromEnv`), `src/engine/routes/library.ts:60,83`, `src/engine/routes/memes.ts:23`, `src/engine/routes/carousels.ts:130-202`(`askJevBox({ apiKey: process.env.TYPESAFE_API_KEY })`, `context.jevAvailable`), `src/engine/routes/system.ts:173,181`(상태).

## 검토 목록
| # | 항목 | 추천 | 이유 |
|---|---|---|---|
| 1 | 결정 0024 가 0018 을 대체한다: Jev 키는 사용자가 설정에서 입력한다. 빌드에 키를 넣지 않는다. 0018 의 나머지(codex·Jev 만, 모델 버전, 실패 시 규칙 점수)는 그대로 옮긴다 | 받는다 | 사용자 지시. public 릴리스에 키가 들어가지 않는다 |
| 2 | 저장: macOS login Keychain(account `u3`, service `u3-jev-api-key`). 엔진이 `/usr/bin/security` 로 읽고 쓴다. 키는 stdin 으로 넘겨 프로세스 인자에 남기지 않는다(`security add-generic-password ... -w` 를 인자 없이 쓰면 프롬프트로 읽는 방식을 확인해 쓰고, 안 되면 `-X` hex 등 인자 노출이 없는 방식을 찾는다). settings.json·로그·응답에 키를 쓰지 않는다 | 받는다 | 평문 파일에 두지 않는다 |
| 3 | 엔진 `src/engine/jev-key.ts`(new): `readJevKey()`(Keychain, 메모리 캐시), `saveJevKey(key)`, `deleteJevKey()`. 개발·테스트는 `process.env.TYPESAFE_API_KEY` 가 있으면 그 값을 먼저 쓴다(`pnpm dev` 의 `.env`). `context.jevAvailable`(boolean)을 `context.jevKey()`(현재 키 또는 null)로 바꾸고 모든 사용처가 호출 때마다 읽는다. 키를 바꾸면 엔진을 다시 띄우지 않아도 바로 쓴다 | 받는다 | 사용처가 한 경로를 쓴다 |
| 4 | API: `GET /api/system/jev` 에 `hasKey`·`keyHint`(끝 4자)를 더한다. `PUT /api/system/jev-key { key }`(앞뒤 공백 제거, 빈 값·4000자 초과 거절), `DELETE /api/system/jev-key`. 저장 전에 키로 가벼운 Jev 호출 한 번을 해서 401·403 이면 「키를 확인해 주세요」로 거절한다. 네트워크 실패는 저장은 하되 경고를 돌려준다 | 받는다 | 틀린 키를 저장하지 않는다 |
| 5 | 설정 「Jev 짤 판정」 카드: 상태(연결됨·키 없음), 키 입력칸(type=password, 저장 뒤 비움, placeholder 「저장됨 ····abcd」), 「저장」, 「지우기」. 키가 없으면 「키가 없으면 짤은 규칙 점수로 골라요」 안내. 1열 배치(W63)는 유지한다 | 받는다 | 사용자 지시 |
| 6 | 빌드: `build-engine.ts` 의 키 읽기·주입(`.env` 필수 검사 포함)을 지운다. `scripts/release.sh` 와 `pnpm package` 뒤 검사로 `engine.mjs` 에 `TYPESAFE_API_KEY =` 대입이나 `.env` 의 실제 키 값이 있으면 실패한다(키 값은 출력하지 않는다) | 받는다 | 키가 다시 들어가는 것을 막는다 |
| 7 | 기존 설치본(0.1.0)은 키가 박혀 있다. 0.2.0 부터는 설정에서 한 번 입력해야 한다. 설치 뒤 사용자에게 입력을 안내한다 | 받는다 | 업그레이드 경로 |
| 8 | 지금 키(`.env`)는 0.1.0 dmg 에 들어 있었다. 0.1.0 dmg 는 공개된 적이 없으므로 키를 바꾸지 않는다 | 받는다 | 공개 업로드 전이다 |

## 바꿀 파일
- 결정·문서: `architecture/decisions/0024-jev-key-setting.md`(new), `0018-codex-jev-box.md`(Status: superseded-by 0024), `architecture/INTENT.md`(0018 줄 교체), 이 plan.md.
- 엔진: `src/engine/jev-key.ts`(new), `src/engine/app.ts`(context 타입), `src/engine/main.ts`, `src/engine/pipeline/jev.ts`(`jevClientFromEnv` → 키 인자), `src/engine/routes/{system,library,memes,carousels}.ts`.
- UI: `src/ui/screens/Settings.tsx`, `src/ui/styles.css`.
- 빌드: `scripts/build-engine.ts`, `scripts/release.sh`, `scripts/check-engine-key.sh`(new 또는 release.sh 안 함수).
- 테스트: `tests/server/jev-key.test.ts`(new: 저장·삭제·힌트·거절·응답에 키 없음, Keychain 은 가짜 `security` 로), 기존 `jevAvailable` 을 쓰는 테스트 갱신, 빌드 검사 테스트.

## 순서
1. 조정자: 장부 예약, X31 워크트리, plan 커밋.
2. W68(codex): 실패 테스트 → 엔진 키 저장·API·사용처 교체.
3. W69(codex): 설정 카드, 빌드에서 키 제거와 검사.
4. 조정자: plan 대조 → 결정 0024·INTENT → 병합 → `pnpm verify` → `/smp:wiki ingest`(2fe8d4d..HEAD, 푸시 훅 요구) → `scripts/release.sh 0.2.0` → 0.2.0 손 설치·설정에서 키 입력·짤 판정 1회 확인 → `scripts/release.sh 0.2.1` → 자동 업데이트 확인(0021 검증 항목).

## 검증
- `pnpm verify` 마지막 줄 `✓ verify passed`.
- 패키징한 `engine.mjs` 에서 `.env` 의 키 값이 0건이다(`grep -c -F`, 값은 출력하지 않음).
- 설치본에서 키 없음 → 설정에 입력 → 「연결됨」, 짤 판정이 Jev 로 돈다. 지우기 → 「키 없음」, 규칙 점수로 돈다.
- `GET /api/system/jev` 응답과 엔진 로그에 키가 없다.

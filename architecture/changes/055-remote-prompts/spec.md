# Spec: remote-prompts
Source: intent.md (accepted). Status: accepted.
<!-- Status: draft | accepted. 제품 책임자가 바꾼다. accepted 커밋 뒤 /smp:critic으로 대조한다. -->

## 열린 질문에 대한 답
- 두는 곳: 고정 태그 `prompts` 의 prerelease 자산 `prompts-schema-<N>.json` 이다. 주소는 `https://github.com/smpbrighton/u3/releases/download/prompts/prompts-schema-<N>.json` 이다. prerelease 는 `releases/latest` 가 되지 않으므로 앱 업데이트 주소(0021)에 영향이 없다. 이 자산은 버전 Release 가 아니라 갱신용 고정 주소이므로 교체한다. main raw 파일은 커밋 즉시 모든 사용자에게 퍼지고 릴리스와 개발 커밋을 가를 수 없어 쓰지 않는다. 번호별 prerelease 는 최신 번호를 찾으려면 GitHub API(토큰 없이 시간당 60회)가 필요해 쓰지 않는다.
- 서명·hash: 쓰지 않는다. HTTPS 와 내용 검증(스키마 번호·필드·길이)만 한다. hash 는 믿을 수 있는 다른 출처가 없으면 의미가 없다. 근거와 남는 위험은 우려 사항 1.
- 받는 시점: 엔진이 시작할 때 한 번, 그 뒤 6시간마다다. 시작 직후의 설정 조회와 생성은 진행 중인 첫 받기를 최대 3초 기다린다.
- 고친 사용자 알림: 한다. 고친 뒤 그 프롬프트의 기본값이 바뀌면 프롬프트 제목 옆에 「새 기본값이 있어요」를 표시한다. 본문은 바꾸지 않는다.
- 개발 실행: 받지 않고 캐시도 읽거나 쓰지 않는다. 코드의 기본값을 고쳐 바로 확인할 수 있어야 하기 때문이다. 개발 실행 판정은 기존 관례대로 `U3_RESOURCE_DIR` 이 없는 실행이다. 개발 실행에 `U3_PROMPTS_URL` 이 있으면 그 주소에서 받아 메모리에만 둔다(시험용). 설치본은 `U3_PROMPTS_URL` 을 무시한다.

## 요구사항
1. 기본 프롬프트를 쓰는 사용자는 `prompts` 자산이 갱신된 뒤 엔진이 다시 시작하거나 6시간이 지나면, 설정과 생성에서 새 기본 프롬프트를 쓴다.
2. 프롬프트를 고친 사용자의 본문은 원격 갱신 뒤에도 그대로다.
3. 「기본값으로」를 누르거나 본문을 비우거나 현재 기본값과 같은 본문을 저장하면, 그 프롬프트는 다시 원격 기본값을 따른다.
4. 고친 프롬프트의 기본값이 고친 때와 달라지면 설정이 그 프롬프트에만 「새 기본값이 있어요」를 표시한다.
5. 받기에 실패하거나 내용이 맞지 않으면 앱은 캐시와 앱에 든 기본값 가운데 revision 이 큰 쪽을 쓴다. 생성은 실패하지 않는다.
6. 앱이 아는 스키마 번호와 다른 파일은 쓰지 않는다.
7. 개발자는 깨끗한 main 에서 `scripts/publish-prompts.sh` 하나로 main 의 기본 프롬프트를 `prompts` 자산에 올린다. 앱 릴리스(`release.sh`)는 이 스크립트를 실행하지 않는다.
8. 입력에서 포커스만 옮기고 본문을 바꾸지 않으면 설정은 저장하지 않는다.

## 설계
### 데이터
- 원격 파일 `prompts-schema-<N>.json`: `{ "schema": N, "revision": 정수, "script": 문자열, "carouselTopic": 문자열, "carouselVideo": 문자열 }`. 각 본문은 trim 뒤 비어 있지 않고 20000자 이하다. 앱은 512KB 를 넘는 응답을 거부한다.
- `src/core/default-prompts.ts`(새 파일): `PROMPT_SCHEMA = 1`, `PROMPT_REVISION`(정수), `PROMPT_TEXT_HASH`(세 본문의 SHA-256). 앱의 JSON 스키마·형식 규칙이 프롬프트와 호환되지 않게 바뀌면 `PROMPT_SCHEMA` 를 올린다. 옛 앱은 옛 번호 파일을 계속 읽는다.
- 기본 프롬프트의 정본은 지금의 `DEFAULT_SCRIPT_PROMPT`·`DEFAULT_CAROUSEL_TOPIC_PROMPT`·`DEFAULT_CAROUSEL_VIDEO_PROMPT` 상수이고 git 이력에 남는다. 앱에 든 기본값의 revision 은 `PROMPT_REVISION` 이다. 본문을 바꾸면 `PROMPT_REVISION` 을 올리고 `PROMPT_TEXT_HASH` 를 갱신해야 한다. 시험이 hash 불일치를 잡는다.
- 캐시: 데이터 폴더의 `prompt-defaults.json`(원격 파일과 같은 형태). 받은 파일의 revision 이 캐시보다 클 때만 바꾼다. 현재 기본값은 캐시와 앱에 든 기본값 가운데 revision 이 큰 쪽이다. 같으면 앱에 든 기본값이다.
- 설정 키: 기존 `scriptPrompt`·`carouselTopicPrompt`·`carouselVideoPrompt` 를 유지한다. 키가 있으면 고친 것이다. 저장할 때 그때 현재 기본값 본문의 SHA-256 을 `scriptPromptBaseHash`·`carouselTopicPromptBaseHash`·`carouselVideoPromptBaseHash` 에 둔다. 키를 지우면 함께 지운다. `newerDefault` 는 고친 키와 base hash 가 있고 base hash 가 현재 기본값의 hash 와 다를 때 참이다. base hash 가 없으면(이 기능 전에 고친 사용자) 거짓이다.

### 엔진
- `src/engine/prompt-defaults.ts`(새 파일): `effectiveDefaults()` 는 진행 중인 첫 받기를 최대 3초 기다린 뒤 현재 기본값을 낸다. `refreshPromptDefaults()` 는 주소에서 10초 제한으로 받고 검증한 뒤 캐시를 바꾼다. 실패는 로그만 남긴다. `main.ts` 가 시작 때 기다리지 않고 한 번 부르고 6시간마다 부른다. 개발 실행 규칙은 열린 질문 답을 따른다.
- 대본 생성(`routes/script.ts`)과 캐러셀 기획(`routes/carousels.ts` 두 곳)은 `DEFAULT_*` 상수 대신 `effectiveDefaults()` 를 쓴다.
- API `GET/PUT /api/system/script-prompt` 와 `GET/PUT /api/system/carousel-prompts` 의 각 프롬프트 응답에 `defaultPrompt`(현재 기본값)와 `newerDefault`(boolean)를 더한다. `isDefault` 와 「기본값과 같으면 키 삭제」 비교는 현재 기본값으로 한다.

### 화면
- 설정의 세 프롬프트 편집 항목은 「기본값으로」 버튼 비활성 판정을 응답의 `defaultPrompt` 로 한다. UI 는 core 의 `DEFAULT_*` 상수를 더 이상 쓰지 않는다.
- 「기본값으로」는 빈 본문을 PUT 한다. 서버가 키를 지우고 현재 기본값을 응답한다.
- 포커스가 벗어날 때는 마지막으로 받거나 저장한 값과 본문이 다를 때만 PUT 한다.
- `newerDefault` 가 참이면 그 SettingsGroup 제목 옆에 「새 기본값이 있어요」를 둔다. 다른 설명문은 두지 않는다(043 화면 글 규칙).

### 릴리스
- `scripts/publish-prompts.sh`: 깨끗한 main 에서만 실행한다. main 의 세 상수와 `PROMPT_REVISION` 으로 파일을 `$TMPDIR`(X31)에 만든다. 원격 파일이 같은 revision·같은 본문이면 `✓ prompts unchanged` 로 끝낸다. 원격 revision 이 `PROMPT_REVISION` 이상인데 본문이 다르면 실패한다. 그 밖에는 `gh release upload prompts --clobber` 로 올린다. `prompts` 태그가 없으면 prerelease 로 만든다. 정상 출력은 `✓ prompts published: schema <N> revision <R>`.
- 원격 파일이 사라져도 revision 은 코드에서 오므로 다시 올리면 된다. 그동안 앱은 캐시나 앱에 든 기본값을 쓴다.
- `release.sh` 는 바꾸지 않는다. 새 앱 버전은 자기 `PROMPT_REVISION` 본문을 담으므로 원격 공개 여부와 관계없이 최신 기본값을 쓴다.

## 결정
- 기본 프롬프트 원격 갱신 → [0034](../../decisions/0034-remote-default-prompts.md).

## 우려 사항
1. 원격 본문에 서명이 없다. GitHub 계정이나 레포가 뚫리면 공격자가 기본 프롬프트를 바꿀 수 있다. 대본·기획의 codex 호출은 `--sandbox read-only` 이고 출력은 JSON 스키마로 검증하므로, 피해는 생성된 글 내용으로 한정된다. 앱 업데이트 자체는 이미 같은 레포에 의존한다. 추천: 서명 없이 진행. 정책 소유자: 사용자.
2. 원격 갱신은 릴리스 노트와 앱 업데이트 없이 사용자 결과를 바꾼다. 무엇이 바뀌었는지는 git 이력에만 남는다. 추천: 받아들인다. 정책 소유자: 사용자.
3. 049 의 0033 은 「공개 Release 의 자산을 교체하지 않는다」고 정한다. `prompts` 는 버전 Release 가 아니라 갱신용 고정 주소이고 `release.sh` 와 분리되므로, 0034 가 이 자산만 교체 대상으로 명시한다. `system.ts`·`Settings.tsx` 는 049 와 겹치고 나중에 병합되는 쪽이 rebase 한다. 정책 소유자: 개발.
4. 0.3.6 이하 설치본은 원격 기본값을 받지 않는다. 이 기능을 담은 버전으로 한 번 업데이트해야 한다. 정책 소유자: 사용자.
5. 고친 사용자가 새 기본값을 보려면 「기본값으로」를 눌러야 하고 고친 본문은 사라진다. 비교 화면은 두지 않는다. 정책 소유자: 사용자.

## 검증 기준
- `pnpm verify` 가 `✓ verify passed` 로 끝난다. 아래 시험을 포함한다.
- core: `PROMPT_TEXT_HASH` 가 세 상수의 SHA-256 과 같다.
- 엔진: 캐시 유효/무효/schema 불일치/revision 이 작거나 같음/받기 실패·시간 초과·512KB 초과·필드 누락에서 `effectiveDefaults()` 결과. 앱에 든 revision 이 캐시보다 크면 앱에 든 본문. 개발 실행은 받지 않고 캐시를 쓰지 않음, `U3_PROMPTS_URL` 이면 메모리에만 둠. 설치본은 `U3_PROMPTS_URL` 을 무시함. 첫 받기가 진행 중이면 3초 안에서 기다림.
- 서버: 원격 기본값이 바뀐 뒤 고치지 않은 사용자는 새 본문, 고친 사용자는 그대로. 바뀐 프롬프트에만 `newerDefault` 가 참이고 base hash 가 없으면 거짓. 빈 본문 PUT 뒤 새 기본값을 따름. 대본 PUT 응답 포함. 대본 생성·캐러셀 기획 두 경로의 codex 프롬프트가 현재 기본값으로 시작함.
- UI: 「기본값으로」가 빈 본문을 보내고 응답 본문을 표시함. 바뀌지 않은 본문의 blur 는 요청을 보내지 않음. `newerDefault` 표시.
- publish 스크립트(`--dry-run`): 원격과 같으면 unchanged, 원격 revision 이 같거나 큰데 본문이 다르면 실패, 그 밖에는 `PROMPT_REVISION` 파일을 만든다.
- 설치본: 현재 기본값(revision 1)을 `prompts` 에 올린 뒤 이 기능이 든 설치본을 다시 시작하면 데이터 폴더에 revision 1 캐시가 생기고 설정 프롬프트가 같은 본문이다. 시험 본문은 운영 자산에 올리지 않는다.

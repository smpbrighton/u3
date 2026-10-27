# u3

@architecture/INTENT.md

## 커맨드
- 검증: `pnpm verify` — 마지막 줄 예시: `✓ verify passed`
- 개발: `pnpm dev`
- 패키징: `pnpm package` — ad-hoc `.app`과 `.dmg`를 만든다.
- 릴리스: `scripts/release.sh <버전>` — 깨끗한 main에서 서명·공증 뒤 GitHub Releases에 배포한다. 정상 출력: `✓ release published: v<버전>`.

완료 전 검증 명령을 실행하고 출력을 보고한다. 실패하면 코드를 고친다.

## 구조
- `architecture/` 변경 체인 `changes/NNN-slug/{intent,spec,review,plan}.md` · `decisions/` · `wiki/`(이해가 필요하면 `wiki/index.md`부터)
- `src/ui/`: React 화면
- `src/engine/`: Node 엔진
- `src-tauri/`: Tauri 앱
- `scripts/`, `tests/`: 빌드·검증 스크립트와 테스트

## 컨벤션
- 변경은 lite로 시작한다. lite는 plan mode에서 만든 `plan.md`(`Track: lite.`) 하나로 진행한다(`/smp:plan lite <slug>`). full 신호(기대 결과 미정·미결 설계 선택 셋 이상·accepted 결정을 뒤집음)가 있으면 full로 간다. 판정 기준은 `/smp:plan` 스킬에 있다.
- full은 `intent.md` → `spec.md` → `review.md` → `plan.md` 순서로 커밋된 것만 다음 단계의 입력이다. intent·spec·review의 `Status: accepted`는 사람이 `/smp:accept`로 바꾸고, 모델이 쓰면 훅이 막는다.
- 라운드 마감은 `/smp:wiki ingest`까지다.
- `.env`, API 키, 라이브러리와 모델 파일은 커밋하지 않는다.
- 결과물·캐시·임시 파일은 X31에 둔다. 명령 앞에 `TMPDIR=/Volumes/X31/.cache/u3/tmp CARGO_HOME=/Volumes/X31/.cache/cargo U3_BUILD_CACHE=/Volumes/X31/.cache/u3/build HOMEBREW_CACHE=/Volumes/X31/.cache/homebrew`를 붙인다. 내장 디스크에는 설치본(`~/Applications/U3.app`, Homebrew 패키지)만 둔다.

## 에이전트가 틀리는 것
- 같은 실수가 두 번째 나오면 여기에 규칙 한 줄.
- `pnpm verify`가 통과하기 전에 완료로 보고하지 않는다.

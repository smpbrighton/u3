# u3

## 커맨드
- 검증: `pnpm verify` — 마지막 줄 예시: `✓ verify passed`
- 개발: `pnpm dev`

완료 전 검증 명령을 실행하고 출력을 보고한다. 실패하면 코드를 고친다.

## 구조
- `architecture/`: 변경 계획, 결정, 위키
- `src/ui/`: React 화면
- `src/engine/`: Node 엔진
- `src-tauri/`: Tauri 앱
- `scripts/`, `tests/`: 빌드·검증 스크립트와 테스트

## 컨벤션
- 변경은 lite로 시작한다. 계획은 `architecture/changes/NNN-slug/plan.md`에 둔다.
- 전체 변경은 승인된 문서를 순서대로 진행한다. 라운드 마감은 `/smp:wiki ingest`다.
- `.env`, API 키, 라이브러리와 모델 파일은 커밋하지 않는다.

## 에이전트가 틀리는 것
- `pnpm verify`가 통과하기 전에 완료로 보고하지 않는다.

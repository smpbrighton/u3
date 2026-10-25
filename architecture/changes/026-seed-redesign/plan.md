# W26 SEED Design 전체 화면 재설계 계획

Track: lite.

## 검토 목록
- 사용자 요청에서 전체 화면과 완료 조건이 정해져 있다. Doctor 리포트가 컴포넌트·테마·토큰 불일치와 적용 대상을 제공한다.

## 결정
- SEED 공식 공통 문서와 React 문서, 현재 CLI 도움말을 확인한 뒤 해당 계약과 스니펫을 사용한다.
- Doctor error를 먼저 고치고, 화면 단위로 raw control을 SEED 컴포넌트로 교체한다.
- 화면 동작과 기존 테스트는 유지한다. 단축키 대상 판정에 필요한 경우 실패 테스트를 별도 선행 커밋한다.
- 데이터 고유 색과 타임라인·Remotion·파일 선택기 내부 컨트롤은 교체 가능 범위를 확인해 유지 사유를 기록한다.

## 바꿀 파일
- `index.html`, `seed-design/`, SEED 스니펫 의존성에 한해 `package.json`·`pnpm-lock.yaml`
- `src/ui/**`, `docs/ui-design-check.md`, 필요 시 단축키 관련 `tests/`
- 이 계획 파일

## 순서
1. 이 계획을 `W26: SEED Design 재설계 계획`으로 커밋한다.
2. Doctor 리포트와 SEED 공식 문서 인덱스·컴포넌트 문서·CLI 도움말을 확인하고 필요한 스니펫을 설치한다.
3. 테마 속성, 유효 토큰, SEED 내부 클래스 덮어쓰기 제거를 적용해 기반 커밋을 만든다.
4. 공통 내비게이션·버튼·알림과 홈·입력·대본·설정 화면을 화면 단위로 교체하고 커밋한다.
5. Studio 라이브러리·Inspector·타임라인 컨트롤·대화상자를 교체한다. 단축키 실패 테스트가 필요하면 먼저 테스트만 커밋한다.
6. `docs/ui-design-check.md`를 갱신한다.
7. 요청한 환경으로 `pnpm tauri dev`를 백그라운드 실행하고 각 조작 가능한 화면의 앱 창만 캡처한다. 실행한 앱과 sidecar를 종료한다.
8. `pnpm dlx @seed-design/cli@latest compat`와 `pnpm verify`를 실행한다. verify의 마지막 20줄을 확인한다.
9. 모든 변경을 이 브랜치에 화면 단위 커밋으로 남긴다. push, main, Jira, 위키는 건드리지 않는다.

## 완료 증거
- Doctor 두 error 해결, 전체 적용 범위의 화면과 입력 컨트롤을 SEED 컴포넌트로 교체.
- 타임라인·Remotion·파일 선택기 등 남긴 raw 요소의 사유 및 화면 캡처 여부 기록.
- compat 결과와 `pnpm verify` 종료 코드 0, 마지막 줄 `✓ verify passed`.

## 롤백
- W26 커밋을 역순으로 되돌린다. 프로젝트 데이터 형식과 사용자 데이터는 변경하지 않는다.

# 엔진 종료

## 요약
Node sidecar는 stdin 종료 또는 SIGTERM에서 진행 작업과 서버 자원을 정리한다. 최대 4초 정리 후 출력을 flush하고 SIGTERM으로 끝내 ONNX Runtime 정적 소멸자의 abort를 피한다. `src/engine/shutdown.ts` `git:8d0c1c5703a70790c4174563d7948d68af7ec066:` `git:e53f232454d68c4efcbec63999be43d62974ab47:` `git:b94d0097621a6c55a01cd598746fe8a178795bf9:`

## 내용
- 종료 시 엔진은 신규 요청 수락을 멈추고 작업 큐, HTTP 서버, 미디어 서버, 임베더 세션을 정리한다. `src/engine/main.ts` `src/engine/shutdown.ts` `git:8d0c1c5703a70790c4174563d7948d68af7ec066:`
- 부모 종료 제한은 5초이며 엔진 정리 제한은 4초다. `src/engine/shutdown.ts` `git:e53f232454d68c4efcbec63999be43d62974ab47:`
- ONNX 실행 경로는 공유 런타임 인스턴스로 단일화됐다. 정리 뒤 SIGTERM으로 프로세스를 끝내며, 정상 종료 코드 0이 아니라 SIGTERM 종료 상태를 갖는다. `src/engine/pipeline/separate.ts` `src/engine/pipeline/meme-embed.ts` `src/engine/shutdown.ts` `git:b99e63e9f6827f155fd48fb9f4741e7cc57837bb:` `git:8daada698f4dbd6a91cc8e2f6f1215b150c619b6:`
- 수동 확인에서 음성 분리·받아 적기·짤 순위·대본·렌더를 사용한 뒤 stdin을 닫았다. 엔진은 정리 후 SIGTERM(-15)으로 끝났고 새 충돌 기록은 없었다. `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`

- Tauri 감시 스레드는 엔진 종료를 확인하고 5분에 최대 3회 재시작한다. 시작 실패나 한도 초과 때 연결 오류를 표시한다. 앱 종료와 업데이트 재시작은 재기동을 차단한다. `src-tauri/src/main.rs` `src-tauri/src/updater.rs` `git:c510819:`
- 엔진은 데이터 폴더의 `logs/engine.log`에 기록하고 5 MiB 경계에서 이전 로그를 `.1`로 회전한다. 로그는 알려진 비밀 값과 인증 정보를 가린다. 설정에서 로그 폴더를 열 수 있다. `src/engine/engine-log.ts` `src/engine/main.ts` `src/ui/UpdateControls.tsx` `git:b08b742:` `git:f6d8d48:`
- 재시작 이벤트는 연결 정보를 새로 조회하게 하고 마지막 작업을 다시 하라는 알림을 표시한다. 실패한 요청은 자동 재전송하지 않는다. `src/ui/App.tsx` `src/ui/api.ts` `git:f6d8d48:`
- 로컬 ad-hoc 0.3.8에서 강제 종료 후 새 프로세스·알림·새 포트의 홈 썸네일을 확인했고 네 번째 종료에서 중단 배너를 확인했다. 기록은 로그에 token·Bearer 문자열이 없었다고 명시한다. 설정·스튜디오 요청과 스튜디오 미리보기의 재시작 후 성공 증거는 코드에서 못 찾음. `architecture/changes/057-engine-restart-undo/verify.log` `architecture/changes/057-engine-restart-undo/evidence/restart-snack.png` `architecture/changes/057-engine-restart-undo/evidence/restart-stop.png` `git:31e51df:`
- 057의 `pnpm verify`와 Rust 테스트는 통과했다. 정상 종료 중 재시작 차단은 Rust 테스트로만 확인했다. 테스터 PC의 실제 원인과 Windows 실기기 재시작은 미검증이다. `architecture/changes/057-engine-restart-undo/verify.log` `architecture/changes/057-engine-restart-undo/plan.md` `git:31e51df:`

- API 요청 기록은 OPTIONS를 제외한다. GET이 아닌 요청은 도착과 종료 상태·시간을 기록하고 GET은 400 이상 또는 5초 초과일 때 종료만 기록한다. 경로의 쿼리와 요청 본문은 기록하지 않는다. 인증·호스트·Origin 검사 앞에서 기록한다. `src/engine/http.ts` `src/engine/app.ts` `git:54baef7:`
- UI fetch 실패는 AbortError를 제외하고 연결을 초기화한 뒤 실패 메서드·쿼리를 뺀 경로·오류 문구를 client-log로 한 번 보고한다. 보고 실패는 버리고 다시 보고하지 않는다. 서버는 문자열 길이를 검사하고 제어 문자와 경로 쿼리를 제거한다. `src/ui/api.ts` `src/engine/routes/system.ts` `git:54baef7:`
- 요청 로그와 client-log의 경계 조건을 검사하는 테스트가 추가됐다. 해당 변경의 실패 테스트 출력과 `pnpm verify` 실행 증거는 코드에서 못 찾음. `tests/engine/request-log.test.ts` `tests/server/client-log.test.ts` `tests/ui/api-connection.test.ts` `architecture/changes/059-engine-request-log/plan.md` `git:7938b30:`
- 캐러셀 프레임 재생성의 Load failed 실제 원인은 미확인이다. 새 버전 설치 후 재현 시 로그 확인은 미검증이다. `architecture/changes/059-engine-request-log/plan.md` `git:09c3e03:`

## 관계
- [U3 데스크톱 앱](entity-desktop-app.md)
- [로컬 모델과 리소스](concept-local-models.md)
- [자동 업데이트와 릴리스](concept-updates.md)

## 출처
- `src/engine/shutdown.ts`
- `src/engine/main.ts`
- `src/engine/pipeline/separate.ts`
- `src/engine/pipeline/meme-embed.ts`
- `docs/manual-check.md`
- `8d0c1c5703a70790c4174563d7948d68af7ec066`
- `e53f232454d68c4efcbec63999be43d62974ab47`
- `b99e63e9f6827f155fd48fb9f4741e7cc57837bb`
- `b94d0097621a6c55a01cd598746fe8a178795bf9`
- `8daada698f4dbd6a91cc8e2f6f1215b150c619b6`
- `1cfc7e35c4af2fa3d58d6a017a83d21556c39740`

# 엔진 종료

## 요약
Node sidecar는 stdin 종료 또는 SIGTERM에서 진행 작업과 서버 자원을 정리한다. 최대 4초 정리 후 출력을 flush하고 SIGTERM으로 끝내 ONNX Runtime 정적 소멸자의 abort를 피한다. `src/engine/shutdown.ts` `git:8d0c1c5703a70790c4174563d7948d68af7ec066:` `git:e53f232454d68c4efcbec63999be43d62974ab47:` `git:b94d0097621a6c55a01cd598746fe8a178795bf9:`

## 내용
- 종료 시 엔진은 신규 요청 수락을 멈추고 작업 큐, HTTP 서버, 미디어 서버, 임베더 세션을 정리한다. `src/engine/main.ts` `src/engine/shutdown.ts` `git:8d0c1c5703a70790c4174563d7948d68af7ec066:`
- 부모 종료 제한은 5초이며 엔진 정리 제한은 4초다. `src/engine/shutdown.ts` `git:e53f232454d68c4efcbec63999be43d62974ab47:`
- ONNX 실행 경로는 공유 런타임 인스턴스로 단일화됐다. 정리 뒤 SIGTERM으로 프로세스를 끝내며, 정상 종료 코드 0이 아니라 SIGTERM 종료 상태를 갖는다. `src/engine/pipeline/separate.ts` `src/engine/pipeline/meme-embed.ts` `src/engine/shutdown.ts` `git:b99e63e9f6827f155fd48fb9f4741e7cc57837bb:` `git:8daada698f4dbd6a91cc8e2f6f1215b150c619b6:`
- 수동 확인에서 음성 분리·받아 적기·짤 순위·대본·렌더를 사용한 뒤 stdin을 닫았다. 엔진은 정리 후 SIGTERM(-15)으로 끝났고 새 충돌 기록은 없었다. `docs/manual-check.md` `git:1cfc7e35c4af2fa3d58d6a017a83d21556c39740:`

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

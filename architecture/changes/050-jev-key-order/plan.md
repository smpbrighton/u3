# Plan: jev-key-order (lite)
Track: lite.

plan mode 산출물. 구현이 계획에서 벗어나면 같은 커밋에서 이 파일을 고친다.


## Context
설정 「짤」에서 Jev API 키를 「저장」하면 「Jev 키를 Keychain에 저장하지 못했습니다」가 난다(사용자 캡처). 재현: 엔진이 보내는 명령 `add-generic-password -U -a u3 -s u3-jev-api-key login.keychain-db -w "<키>"` 를 `security -i` 로 실행하면 usage 오류(종료 2)다. `security` 의 getopt 는 첫 위치 인자(키체인 이름) 뒤의 `-w` 를 옵션으로 받지 않는다. `-w "<키>"` 를 키체인 이름 앞에 두면 종료 0 으로 저장된다(macOS 27.0.1 에서 확인). 기존 테스트의 가짜 `security` 는 인자 순서를 보지 않아 결함을 잡지 못했다. 0.3.x 와 무관한 오랜 결함이다(041 확인 때는 다른 macOS 였을 가능성).

## 결정
- 사용자 지시 원문: Jev 키 저장 실패 캡처 공유, "전부 plan 작성하고 구현은 가능하다면 병렬로".
- 고치는 방법: `src/engine/jev-key.ts` `saveJevKey` 의 명령 순서를 `add-generic-password -U -a u3 -s u3-jev-api-key -w "<키>" <키체인>` 으로 바꾼다. 다른 로직(길이 제한·제어문자 거부·`-i` stdin 전달)은 그대로다.

## 대조
결정 0024(Jev 키는 설정에서 입력해 Keychain 에 저장) 유지. 진행 중 변경과 겹치는 파일 없음.

## 바꿀 파일
- `tests/server/jev-key.test.ts`: 가짜 `security` 가 실제 getopt 처럼 첫 위치 인자 뒤의 옵션을 거부하게 고친다(키체인 이름 뒤에 `-w` 가 오면 종료 2). 저장 테스트가 수정 전 코드에서 실패해야 한다.
- `src/engine/jev-key.ts`: `command` 문자열의 `-w` 를 키체인 이름 앞으로.

## 순서
1. 테스트 수정 → `pnpm exec vitest run tests/server/jev-key.test.ts` 실패 확인 → 커밋.
2. `jev-key.ts` 수정 → 같은 테스트 통과 → `pnpm verify` → 커밋.
3. 수동 확인: 터미널에서 같은 명령을 테스트 계정(`-a u3-test`)으로 `security -i` 에 넣어 종료 0 과 `find-generic-password` 로 읽힘을 확인하고 지운다(사용자 키를 건드리지 않는다).
4. `worktree.sh finish jev-key-order`.

## 리스크
- 가장 위험한 단계는 2 다. `-w` 뒤 인자 해석이 macOS 버전마다 다를 수 있어 3 의 실제 `security` 확인을 증명에 넣는다. 택하지 않은 대안: `-X`(16진) 전달 — 순서 문제는 같다.

## 증명
1. 1단계 실패 출력, 2단계 통과 출력, `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 3단계 실제 `security` 종료 코드 0.
3. 배포 뒤 사용자가 설정에서 키 저장 성공(미검증이면 그렇게 적는다).

## 실행 기록
- 1단계: 가짜 security 에 순서 검사를 넣자 저장 테스트 6개 실패(커밋 `47c808c`). 2단계: `-w` 를 키체인 이름 앞으로 옮기자 19개 통과.
- 3단계: 실제 `/usr/bin/security -i` 에 `add-generic-password -U -a u3-test -s u3-jev-test -w "k\"q\\x" "login.keychain-db"` → 종료 0, `find-generic-password` 로 `k"q\x` 읽힘, 테스트 항목 삭제.

## 롤백
데이터 변경 없음. 커밋 되돌리기.

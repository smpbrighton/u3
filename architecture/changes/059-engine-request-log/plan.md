# Plan: engine-request-log (lite)
Track: lite.

## 검토 목록
1. **엔진 로그에 요청 기록을 남긴다.** GET 이 아닌 요청(POST·PUT·PATCH·DELETE)은 도착과 끝(상태 코드·걸린 시간)을 모두 남긴다. GET 은 실패(400 이상)나 5초 넘게 걸린 것만 남긴다. 경로의 쿼리(`?token=` 등)는 남기지 않는다. 본문은 남기지 않는다. 추천: 이대로. 이유: 「Load failed」가 요청이 엔진에 도착하기 전인지 뒤인지 가를 수 있고, 미디어·상태 조회 GET 으로 로그가 넘치지 않는다.
2. **UI 가 엔진 연결 실패를 겪으면 엔진에 그 사실을 보고한다.** fetch 실패 직후 `POST /api/system/client-log` 로 「실패한 메서드·경로·브라우저 오류 문구」를 한 번 보낸다. 이 보고도 실패하면 버린다. 추천: 이대로. 이유: 같은 로그 파일 안에서 「UI 가 실패한 요청」과 「엔진이 받은 요청」을 시각으로 맞춰 볼 수 있다.

## 결정
- 사용자 지시: 「로그를 추가하고」(캐러셀 「이 시각으로 다시 뽑기」 Load failed 원인 확인용).
- 대체하는 결정 없음.

## 대조
- 057 의 `src/engine/engine-log.ts`(회전·비밀값 가림)를 그대로 쓴다. 진행 중인 변경 없음.

## Context
- 사용자 PC(설치본 0.3.7)에서 「이 시각으로 다시 뽑기」가 「엔진에 연결하지 못했습니다: Load failed」로 실패했다. 그때 엔진(pid 6394)은 살아 있었다.
- 같은 요청을 curl 로 보내면 1.9초에 200 이 왔고, CORS preflight(204)도 정상이었다. URLSession 으로 1–15초 쉰 뒤 POST 를 보내도 9번 모두 정상이었다(연결 재사용 가설 미재현).
- 지금 엔진은 요청을 기록하지 않아 요청이 엔진에 닿았는지 알 수 없다.

## 바꿀 파일
- `src/engine/http.ts`(또는 같은 미들웨어 파일): `requestLog(write)` 미들웨어. `app.use("/api/*", …)` 로 `localOnly`·`cors` 앞에 둔다(거부된 요청도 남도록). 형식: `[req] → POST /api/carousels/:id/slides/:slideId/frame` / `[req] ← 200 POST … 1855ms`. 경로는 `c.req.path`(쿼리 없음). OPTIONS 는 남기지 않는다.
- `src/engine/app.ts`: `AppContext.log?: (line: string) => void` 를 받아 미들웨어에 넘긴다. 없으면 기록하지 않는다(기존 시험 컨텍스트 변경 없음).
- `src/engine/main.ts`: 057 로그의 `write` 를 `log` 로 넘긴다.
- `src/engine/routes/system.ts`: `POST /api/system/client-log` `{ method, path, message }`(각 문자열 길이 상한 200·500·500) → `[ui] 연결 실패 POST … : Load failed`.
- `src/ui/api.ts`: fetch 실패(AbortError 제외) 때 `resetConnection()` 뒤 `client-log` 를 한 번 보낸다(`void …catch(() => undefined)`, `client-log` 자신의 실패는 다시 보고하지 않음).
- 테스트:
  - `tests/engine/request-log.test.ts`: POST 는 도착·끝 두 줄, GET 200 은 기록 없음, GET 404 는 기록, 쿼리의 token 이 로그에 없음, OPTIONS 기록 없음, 401(토큰 틀림)도 기록.
  - `tests/server/client-log.test.ts`: 길이 상한, 기록 형식.
  - `tests/ui/api*.test.ts`: fetch 실패 뒤 `client-log` 를 한 번 보냄, `client-log` 실패 뒤 재귀 없음.

## 순서
1. plan.md 커밋.
2. 실패 테스트 커밋.
3. 구현 → `pnpm verify` → 커밋.
4. 세션: diff 대조 → finish → wiki ingest → push. 1.0.0 이 이미 나갔으면 1.0.1 에 넣는다.

## 리스크
- 로그 양: 생성 작업의 진행 조회는 GET 이라 남지 않는다. 5MB 회전(057)이 상한이다.
- 개인정보: 경로에 프로젝트·캐러셀 id 가 들어간다. 파일 경로·본문·쿼리는 남기지 않는다.

## 증명
1. 실패 테스트 출력, `pnpm verify` 마지막 줄 `✓ verify passed`.
2. 미검증으로 남길 것: Load failed 의 실제 원인(새 버전 설치 뒤 재현되면 로그로 확인).

## 롤백
커밋 되돌리기.

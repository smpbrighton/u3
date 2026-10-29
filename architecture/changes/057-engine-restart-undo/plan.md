# Plan: engine-restart-undo (lite)
Track: lite.

## 결정
- 사용자 지시: 「진행해」(앞 답변의 제안: 엔진 로그·자동 재시작과 스튜디오 실행 취소 수정을 lite 변경 하나로).
- 대체하는 결정 없음.

## 대조
- 0032(앱 구조: sidecar 엔진·127.0.0.1·일회용 토큰): 재시작한 엔진도 새 일회용 토큰을 받는다. 위배 없음.
- 0016(편집 모델·앱이 만든 실행 취소): 실행 취소 기록 단위만 바꾼다.
- 진행 중인 변경 없음.


## 검토 목록
1. **엔진이 죽으면 앱이 자동으로 다시 띄운다. 진행 중이던 작업(내보내기·음성 만들기·이미지 생성)은 사라진다.** 화면에 「엔진을 다시 시작했어요. 마지막 작업을 다시 해 주세요」를 띄운다. 5분 안에 3번 넘게 죽으면 더 띄우지 않고 지금의 연결 오류 배너를 보인다. 추천: 이대로. 이유: 지금은 엔진이 죽으면 앱을 껐다 켤 때까지 모든 동작이 실패한다. 무한 재시작은 CPU·로그를 낭비한다.
2. **엔진 로그를 데이터 폴더 `logs/engine.log` 에 남기고(5MB 넘으면 `engine.log.1` 로 한 번 돌림), 설정 「앱 정보」에 「로그 폴더 열기」를 둔다.** 로그에는 오류 메시지와 파일 경로가 들어간다. 토큰·API 키는 넣지 않는다. 추천: 이대로. 이유: 테스터 PC 의 원인을 보려면 테스터가 로그 파일을 보내 줘야 한다.
3. **막대 하나를 끄는 동작은 실행 취소 한 번으로 되돌린다.** 키보드 방향키로 바꾼 값은 지금처럼 한 칸씩 기록한다. 추천: 이대로.
4. 범위 밖: 캐러셀 편집기 실행 취소(기능 없음), 다중 선택, 편집기 안 음성 모델 변경, 재생 막대 손잡이, 캐러셀 배경 가로 이동·크기, 캐러셀 자막 겹침. 따로 변경으로 한다.

## Context
테스터 피드백: 「강조 부분 눌러도 먹통입니다(엔진과 연결할 수 없다고 뜸)」, 「모두 받기를 눌러도 엔진과 연결을 할 수 없다고 뜨고 다음 액션이 실행되지 않습니다」, 「작업 중 종종 엔진 연결이 끊기는 현상」, 「막대를 잡고 50→70으로 움직인 후 cmd+z를 누르면 … 69로 감」. 사용자 지시: 「진행해」(엔진 로그·자동 재시작과 스튜디오 실행 취소 수정).

확인한 사실:
- UI 의 「엔진에 연결하지 못했습니다」는 fetch 자체가 실패할 때만 난다(`src/ui/api.ts:59`). 오류 응답에도 CORS 헤더는 붙는다(설치본 0.3.7 에서 400·404 응답 확인).
- 엔진은 앱 시작 때 한 번만 뜨고 죽어도 다시 뜨지 않는다(`src-tauri/src/main.rs` setup). stderr 는 `Stdio::inherit()` 라 Finder 로 연 앱에서는 남지 않는다.
- 제 설치본에서 「모두 받기」 5장 두 건은 각각 4.5초에 성공했다. 테스터 PC 의 원인은 확인하지 못했다.
- 스튜디오 막대는 값이 바뀔 때마다 `edit` → `pushHistory` 를 부른다(`src/ui/components/u3/StudioControls.tsx:10`, `src/ui/screens/Studio.tsx:130`). 기록 상한은 100(`src/core/timeline/history.ts`)이라 긴 드래그가 이전 편집 기록을 밀어낸다.

## 바꿀 파일
- `src/engine/engine-log.ts` (new): `createEngineLog({ dir, maxBytes = 5MB })` → `{ file, write(line) }`. 줄 앞에 ISO 시각. 넘으면 `engine.log` → `engine.log.1`(기존 .1 덮음). 동기 append(크래시 직전 기록 보존).
- `src/engine/main.ts`: 시작 때 로그를 만들고 시작 줄(앱 버전·플랫폼·`U3_PREVIOUS_EXIT` 이 있으면 「이전 엔진 종료: …」)을 쓴다. `console.error`·`console.warn` 을 원래 출력과 로그 양쪽에 쓰게 감싼다. `unhandledRejection` 은 로그만, `uncaughtException` 은 로그 뒤 `process.exit(1)`(지금 Node 기본 동작과 같은 종료). 로그 경로는 `store.root/logs`.
- `src/engine/routes/system.ts`: `GET /api/system` 응답에 `logFile` 추가.
- `src-tauri/src/main.rs`: `EngineProcess.connection` 을 `Mutex<Option<EngineConnection>>`, `startup_error` 를 `Mutex<Option<String>>` 로. 감시 스레드가 1초마다 `try_wait`. 종료 중(Exit 이벤트에서 세우는 `AtomicBool`)이 아니면 재시작: `start_engine` 을 다시 부르고 env `U3_PREVIOUS_EXIT=<종료 상태>` 를 넘기고, 연결을 바꾸고, `app.emit("engine-restarted", ())`. 재시작 판단은 순수 함수 `restart_allowed(&[Instant], now) -> bool`(최근 5분 3회 상한)로 분리해 Rust 테스트. 상한을 넘으면 `startup_error` 에 「엔진이 반복해서 멈췄어요. 앱을 다시 시작해 주세요」, 연결은 None, `engine-stopped` emit. debug·release 두 `start_engine` 모두 같은 감시를 쓴다.
- `src/ui/api.ts`: fetch 가 실패하면(AbortError 제외) `resetConnection()` 을 부르고 지금처럼 오류를 던진다. 다시 보내지 않는다(POST 중복 방지).
- `src/ui/App.tsx`: Tauri 에서 `engine-restarted` 를 들으면 `resetConnection()`·`setConnectionAttempt(+1)`·스낵바 「엔진을 다시 시작했어요. 마지막 작업을 다시 해 주세요」. `engine-stopped` 면 재연결 시도로 배너를 띄운다.
- 설정 「앱 정보」(`AppInfo` 컴포넌트): 「로그 폴더 열기」 버튼 → `revealItemInDir(status.logFile)`(`ExportDialog.tsx` 와 같은 plugin-opener). 파일이 아직 없으면 버튼을 숨기지 않고 오류 스낵바.
- `src/core/timeline/history.ts`: `replacePresent(history, next)`(past 유지, future 비움).
- `src/ui/studio/history-gesture.tsx` (new): React context `{ begin(), end() }`. `src/ui/screens/Studio.tsx` 가 제공한다. 진행 중인 제스처의 첫 `edit` 은 `pushHistory`, 이후 `edit` 은 `replacePresent`. `end()` 가 제스처를 닫는다.
- `src/ui/components/u3/StudioControls.tsx`: 스튜디오 Slider 에 `onPointerDown` → `begin()`, `onValueCommit` → `end()`. 컨텍스트가 없으면 지금 동작.
- 테스트:
  - `tests/engine/engine-log.test.ts`: 줄 기록, 5MB 넘김 → `.1` 회전, 시작 줄에 `U3_PREVIOUS_EXIT` 반영, 토큰이 로그에 없다.
  - `tests/core/timeline-history.test.ts`(기존 파일이 있으면 거기): `replacePresent` 뒤 undo 가 제스처 전 상태.
  - 스튜디오 UI 테스트: 막대 pointerdown → 값 여러 번 → commit → 실행 취소 한 번이면 처음 값. 방향키 두 번 → 실행 취소 한 번이면 한 칸 전.
  - `tests/ui/api*.test.ts`: fetch 실패 뒤 다음 호출이 `engine_connection` 을 다시 부른다.
  - App 테스트: `engine-restarted` 이벤트 → 스낵바·재연결.
  - Rust: `restart_allowed` 3회 허용·4회째 거부·5분 지나면 허용.

## 순서
1. plan.md 커밋.
2. 실패 테스트 커밋(실패 출력 기록: 막대 실행 취소가 69 에 해당하는 값으로 돌아감, fetch 실패 뒤 연결 재조회 없음 등).
3. 엔진 로그·`/api/system` → 커밋.
4. Rust 감시·재시작 → 커밋.
5. UI(api·App·앱 정보·실행 취소 제스처) → `pnpm verify` → 커밋.
6. 세션: diff 대조 → 개발 실행 또는 설치본에서 엔진 강제 종료(`kill <엔진 pid>`) → 재시작·스낵바·새 동작 성공 확인 → `worktree.sh finish` → wiki ingest → push → 다음 릴리스.

## 리스크
- 가장 위험한 단계는 4(Rust 감시)다. 앱 종료·업데이트 재시작 때 감시 스레드가 엔진을 다시 띄우면 안 된다. Exit 이벤트에서 종료 표시를 먼저 세우고 `stop_engine` 을 부른다. 업데이트 재시작 경로(`updater::update_restart`)도 같은 표시를 세운다.
- 재시작한 엔진의 포트·토큰이 바뀐다. 이미 그려진 미디어 URL(포트 포함)은 재연결로 화면이 다시 그려질 때 바뀐다. 다시 그려지지 않는 미리보기는 깨질 수 있다. 증명 6에서 스튜디오 미리보기를 확인한다.
- Windows Job 객체: 재시작한 자식도 `spawn_engine` 이 Job 에 넣는다.
- 택하지 않은 대안: UI 가 실패한 요청을 자동으로 다시 보내기(POST 가 두 번 실행될 수 있음), Rust 가 stderr 를 파일로 받기(로그 위치가 엔진 데이터 폴더와 갈라짐).

## 증명
1. 2단계 실패 출력, `pnpm verify` 마지막 줄 `✓ verify passed`(Rust 테스트 포함).
2. 개발 실행에서 엔진 pid 를 `kill -9` → 2초 안에 스낵바, 이어서 설정·스튜디오 요청 성공, `logs/engine.log` 에 「이전 엔진 종료」 줄.
3. 3회 넘게 kill → 배너 「엔진이 반복해서 멈췄어요」.
4. 스튜디오에서 막대를 50→70 으로 끈 뒤 cmd+z → 50.
5. 미검증으로 남길 것: 테스터 PC 의 실제 원인(로그를 받은 뒤 별도 변경), Windows 실기기 재시작.

## 롤백
커밋 되돌리기. 새 파일(`logs/`)은 구버전이 무시한다.

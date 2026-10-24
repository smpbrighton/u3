# 수동 확인 (plan.md 「증명」 수동 항목)

## 환경

- macOS 27.0.1, Apple M4. 빌드 머신과 확인 머신이 같다.
- 빌드: `pnpm package`(main). 산출물: `src-tauri/target/release/bundle/macos/U3.app`(1.07 GiB), `src-tauri/target/release/bundle/dmg/U3_0.1.0_aarch64.dmg`(530 MiB).
- 설치: `.dmg` 를 마운트해 `~/Applications/U3.app` 으로 복사했다. `codesign --verify --deep --strict` 결과는 `satisfies its Designated Requirement` 다(ad-hoc 서명, 공증 없음).
- API 확인은 설치한 앱 안의 엔진(`Contents/MacOS/u3-engine`)을 `src-tauri/src/main.rs` 릴리스 경로와 같은 환경 변수, `PATH=/usr/bin:/bin`(node 없음), 임시 `U3_DATA_DIR` 로 띄워 HTTP 로 불렀다. 화면 클릭은 하지 않았다.
- 측정 클립은 `/Volumes/X31/workspace/smp_workspace/u3-spike-media/` 의 대체 클립(TTS 말소리·합성 음악·uUu 렌더)이다. 실제 숏폼 원본이 아니다.
- 캡처와 원시 결과는 `out/manual/`(커밋하지 않음)에 있다: `launch.png`, `w9-pgrep.txt`, `w9-results.json`, `w9-engine.log`, `w9-export.mp4`.

## 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| 앱 실행 | 통과 | `open ~/Applications/U3.app` 뒤 앱(`Contents/MacOS/u3`)과 엔진(번들 `node engine.mjs`) 프로세스를 확인했다. 첫 화면 캡처 `out/manual/launch.png`(U3 창만) |
| 앱 종료 | 통과 | 앱을 끝내면 엔진도 끝났다. 새 충돌 기록이 없었다 |
| 엔진 종료(모델 사용 뒤) | 통과 | 음성 분리·받아 적기·짤 순위·대본·렌더 뒤 stdin 을 닫으면 엔진이 정리를 마치고 SIGTERM 기본 동작으로 끝난다(종료 상태 -15). onnxruntime 전역 `Environment` 소멸자의 abort 를 피하려는 선택이다(`src/engine/shutdown.ts`). 실행 전후 `~/Library/Logs/DiagnosticReports` 에 새 기록이 없었다 |
| Node·Python 이 없는 계정에서 실행 | 부분 | `PATH` 에 node 가 없는 조건에서 번들 엔진이 돌았다. Node·Python 이 없는 별도 계정·Mac 실행은 미실행(계정을 만들지 않았다) |
| codex 로그인 감지 | 통과 | `/api/system`: codex 설치·로그인 `true`. 설정 화면 「사용할 수 있어요」 |
| codex 대본 생성 | 통과 | 프레임 21장(영상 10·10, 사진 1)을 붙여 대본 추천 → 16.2초, 14장면, 경고 없음 |
| 로그아웃 상태에서 버튼 막힘 | 부분 | 설정 화면의 「로그인이 필요해요」 상태는 임시 스크립트로 재현해 캡처했다(W11, `docs/ui-design-check.md`). 실제 로그아웃과 대본 버튼 막힘은 미실행(사용자 codex 세션을 끊지 않았다) |
| Jev 판정 | 통과 | 짤 순위 HTTP 200. 후보마다 Jev `fit`·`confidence` 가 붙었다 |
| bge-m3 처음 실행 받기 | 통과 | 설치한 앱을 처음 실행했을 때 `~/Library/Application Support/U3/cache/models/Xenova/bge-m3`(2.1 GB)를 받았다. 받는 동안의 진행률 화면은 캡처하지 않았다 |
| whisper 모델 받기 진행률 | 미실행 | 574 MB 받기를 다시 하지 않고 스파이크 때 받은 모델을 링크했다 |
| 마이크 녹음(서명 빌드) | 미실행 | 화면 클릭과 마이크 권한 창 허용이 필요하다. S4 스파이크(`docs/spikes/mic.md`)에서 ad-hoc 서명 빌드의 `audio/mp4` 녹음을 확인했다 |
| 음성 분리 60초 처리 시간 | 통과 | `clip1_speech_music.mp4`(60초) 23.4초. stem 두 파일 생성 |
| 받아 적기 속도·정확도 | 통과 | `clip2_speech_silence_music.mp4`(60초) 2.5초, CER 4.42%, 자막 6개, 첫 자막 시작 1.00초(실제 말 시작 1.00초) |
| mp4 내보내기 | 통과 | `out/manual/w9-export.mp4`: H.264 1080×1920 30fps, AAC, 11.05초. 4초 지점 프레임에 원본 영상이 보인다 |
| iPhone 재생 | 미실행 | 파일을 iPhone 으로 옮기지 않았다 |

## 남은 문제

- 설치 크기가 spec 우려 사항 3 의 「수백 MB」보다 크다(앱 1.07 GiB, dmg 530 MiB).
- 스튜디오의 음소거 토글·라디오 모양은 화면설계보다 투박하다(`docs/ui-design-check.md`).

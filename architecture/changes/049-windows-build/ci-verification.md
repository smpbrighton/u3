# 049C: Windows Vitest 보정

## 실패 근거

[Windows CI run 40687438017](https://github.com/smpbrighton/u3/actions/runs/40687438017)의 `verify-pr` 실패 로그를 확인했다. 엔진 조립과 Whisper MSVC 빌드는 통과했다. Vitest는 9개 파일에서 실패했다.

CI 로그의 Windows ffmpeg `configuration:`에는 `--disable-filters`가 있다. 개별 활성화 목록에는 `sine`, `concat`, `atempo`, `scale`이 있지만 `color`는 없다. `color=red:...` 입력 실패는 셸 인용 문제가 아니라 번들의 필터 구성 문제다. Mac의 같은 버전 compositor를 바이너리 폴더에서 `ffmpeg -hide_banner -filters`로 조회해도 `color`가 없다. Windows 실행 파일을 Mac에서 실행하지는 않았다.

CI 빌드 설정은 `rawvideo` encoder와 `image2pipe` muxer를 활성화한다. `rawvideo` muxer는 목록에 없다. Mac 번들의 `-muxers`에서도 같은 차이를 확인했다. 픽셀 시험은 `rawvideo` encoder를 `image2pipe`로 출력하도록 바꿨다. RGB 바이트와 기존 픽셀 단언은 유지했다.

`src/` 검색에서는 `-f lavfi` 또는 `color=` 입력을 찾지 못했다. 앱의 lavfi 생성 코드는 수정할 대상이 없었다.

## 파일별 조치

| 파일 | 조치 |
| --- | --- |
| `tests/engine/codex-path.test.ts` | POSIX 탐색 3개만 `describe.skipIf(win32)`로 분리했다. 이름에 `Windows: POSIX 셸 fixture 미실행`을 표시했다. 설정 경로·버전·로그인 시험은 Node `.js` fixture로 유지했다. Windows npm `.cmd` 해석 시험에 실제 Node 실행과 버전 3개의 단언을 추가했다. |
| `tests/engine/codex-image.test.ts` | `.mjs` 직접 실행을 `.js` Node 진입점으로 교체했다. stdout·stderr 모델 오류 분류 단언을 모두 유지했다. 건너뛰지 않는다. |
| `tests/engine/ffmpeg.test.ts` | 플랫폼 descriptor로 패키지와 실행 파일 확장자를 선택한다. 절대 경로를 사용한다. pnpm에서 실제 설치된 compositor도 실행한다. |
| `tests/engine/audio-speed.test.ts` | darwin 직접 import를 플랫폼 descriptor로 교체했다. 길이·주파수·원본·캐시·취소 단언을 유지했다. |
| `tests/engine/voice.test.ts` | 상대 Store 경로로 업로드할 때 ffprobe에 절대 경로를 전달해야 한다는 회귀 단언을 추가했다. 실패를 확인한 테스트를 `fa4b43f`로 먼저 커밋했다. |
| `tests/engine/render-media.test.ts` | Node가 만든 PNG 24장과 WAV로 빨강 0.4초·파랑 0.4초 영상을 만든다. 타이틀 PNG도 Node로 만든다. 실제 번들 ffmpeg로 fixture와 픽셀을 처리한다. 배속·길이·시작/끝 색·오디오·캐시·타이틀 단언을 유지했다. |
| `tests/engine/render-carousel.test.ts` | 배경 PNG를 Node로 만든다. Windows Chrome 캐시 경로와 `.exe`를 지원한다. 네 좌표의 RGB 단언을 유지했다. |
| `tests/engine/library-reference.test.ts` | 테스트 루트를 현재 플랫폼의 절대 경로로 만든다. 경로·URL·마이그레이션 단언을 유지했다. |
| `tests/server/audio-prepare.test.ts` | Windows에서 제공하지 않는 TTS 재생성 1개만 Mac 전용으로 표시했다. 공통 배속·중복·취소·보안·정리 시험 4개는 계속 실행한다. |
| `tests/helpers/codex.ts` | 두 플랫폼의 Node `.js` fixture를 만든다. Windows 실행은 앱의 `codexCommand`를 거친다. |
| `tests/helpers/media.ts` | `scripts/build-platforms.ts`로 번들을 고른다. 추가 패키지 없이 PNG·440 Hz WAV를 만든다. |
| `src/engine/routes/voice.ts` | 업로드 목적지를 `path.resolve`로 만든다. ffprobe가 바이너리 폴더에서 실행돼도 상대 데이터 폴더의 음성을 읽는다. |

## 앱 결함 판정

음성 업로드에는 앱 결함이 있었다. 상대 `U3_DATA_DIR`에서 만든 파일 경로를 번들 ffprobe에 그대로 넘겼다. 번들 실행 폴더가 프로젝트 폴더와 다르면 해당 파일을 찾지 못해 400을 반환했다. 절대 경로 전달로 수정했다.

라이브러리 참조의 실패는 테스트 경로 문제다. Windows의 `path.resolve`는 `/app/...`에 현재 드라이브를 붙인다. 기존 `path.join` 기대값은 드라이브가 없었다. `media-server.ts`와 라이브러리 참조 앱 코드는 수정하지 않았다.

## 검증

- Mac에서 대상 9개 파일: 37개 테스트가 통과했다.
- Mac에서 `pnpm verify`: 종료 코드 0이다. Vitest 165개 파일·880개 테스트가 통과했다. 기존 Windows native suite를 포함한 1개 파일·10개 테스트는 건너뛰었다. Rust 11개 테스트와 렌더 smoke도 통과했다.
- 검증 마지막 줄: `✓ verify passed`.
- Windows 재실행과 push는 감독자가 수행한다. 이 작업자는 push하지 않는다.

## 후속 CI 확인

이번 수정은 실패한 Vitest 9개 파일을 다룬다. `scripts/smoke.ts`는 여전히 `select`, `volumedetect`, `rawvideo` muxer를 사용한다. CI의 번들 활성화 목록과 Mac 번들 조회에는 이 기능들이 없다. Windows CI가 Vitest 다음 단계에 도달하면 smoke 호환성을 별도로 확인해야 한다.

## run 40815199068 후속 수정

- 기존 실패 로그 `windows-ci-run1.log:1237–1243`에서 MRX 배경 WAV가 0 bytes였다. `writeFloatWav`는 WAV Transform의 `finish`에서 반환하며 파일 WriteStream의 완료를 기다리지 않는다. Mac에서 반환 직후 동기 읽기로 같은 결함을 재현했다(`out/mrx-write-fail.log`: 실제 0, 기대 176444 bytes). Windows native 시험에 반환 직후 입력·목소리·배경 WAV의 전체 길이와 RIFF/data 길이 단언을 먼저 추가했다.
- 같은 로그 1262–1269의 Whisper 600초 초과에는 다운로드·변환·추론 단계 정보가 없다. native 시험에 다운로드 진행률, SHA-256 확인 완료, CLI 시작/종료, JSON 읽기 완료 진단을 추가했다. 다운로드 180초와 변환·추론 390초의 취소 신호로 실패 단계를 구분한다. 기존 600초 제한과 실제 한국어 단어 결과 단언은 유지한다.
- Windows Whisper 빌드 로그 181행은 `/arch:SSE4.2`만 사용한다. AVX·AVX2·FMA·F16C를 끈 상태다. 이는 추론 지연의 후보이며, 다운로드 지연과 구분하기 전에는 원인으로 확정하지 않는다.
- 회귀 단언 커밋 `2ca4c8f` 전에 Mac `pnpm verify`가 통과했다(`out/windows-fix-test-verify.log`). 이후 MRX는 pipeline으로 파일 WriteStream의 완료·닫기와 오류 전파를 기다리도록 수정했다. 동일한 Mac 재현 명령이 176444 bytes와 data 176400 bytes를 확인하고 통과했다(`out/mrx-write-pass.log`).
- 로그 1200–1215의 workflow 정규식 실패는 CRLF를 LF로 정규화했다. 권한 단언은 유지했다. 로그 1249–1257의 DPAPI 실패는 Windows PowerShell의 Security 모듈 로드 실패다. 시험에서 CI와 같은 `pwsh`를 사용하고 PowerShell 오류를 종료 코드 실패로 처리했다. helper 제품 코드는 수정하지 않았다.
- 로그 1180·1221의 두 5초 초과에는 각각 1197행 EBUSY와 1234행 ENOTEMPTY가 뒤따른다. 배속 시험은 세 속도의 결과를 이미 출력했고, 음성 준비 시험에서는 종료되지 않은 비동기 요청이 정리된 파일을 읽어 ENOENT를 냈다(899행). 두 시험의 제한만 30초로 늘렸다. 정리 동작과 제품 코드는 바꾸지 않았다. Windows 재실행으로 인과관계를 확인한다.
- Whisper native 실행에는 stderr 진단도 남긴다. 앱 일반 실행에는 출력하지 않는다. 취소 실패 메시지는 마지막 stderr 2000자를 포함한다. 모델·fixture·한국어 결과 단언과 CLI 인자·Windows 빌드 옵션은 유지했다.

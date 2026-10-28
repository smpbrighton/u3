# Spec: windows-build
Source: intent.md (draft, 같은 턴의 초안). Status: accepted.

## 열린 질문에 대한 답
1. **Q1 범위:** Windows 11 x64, TTS 제외(음성 만들기 버튼·TTS 설정·모델 받기 숨김), 받아 적기는 whisper.cpp CPU 빌드. CUDA 는 드라이버·시험 범위를 늘리므로 뺀다. macOS 의 TTS 는 그대로다.
2. **Q2 서명:** 1차는 Authenticode 없는 NSIS 설치 파일이다. 릴리스 노트에 SmartScreen 「추가 정보 → 실행」, 파일 속성 「차단 해제」, SHA-256 확인을 적는다. Smart App Control·조직 정책이 막는 PC 는 지원하지 않는다. Azure Artifact Signing(월 9.99달러/5,000회) 도입 시점은 사용자 수를 본 뒤 정한다(열린 질문으로 남김).
3. **Q3 업데이트 키:** Windows 전용 updater 키 쌍을 만들고 개인키는 GitHub 의 보호된 release environment secret 에 둔다. macOS 키·Keychain 경로는 그대로다. 결정 0021 에 Windows 예외를 적는다.
4. **Q4 리소스:** CI 는 X31 을 읽지 못하므로 짤·효과음·색인·MRX·VAD·폰트를 버전 고정 archive(SHA-256 명시)로 GitHub Release 자산 `u3-resources-<버전>.tar.zst` 에 올려 `fetch-resources.ts` 가 받는다. 재배포 권리 확인은 사용자가 한다(열린 질문으로 남김).
5. **Q5 실기기:** 깨끗한 Windows 11 x64 PC 또는 VM 에서 설치·SmartScreen·마이크·편집·업데이트를 확인하는 것이 릴리스 게이트다. 제공자는 사용자다(열린 질문으로 남김). 최소 RAM·STT 대기시간 기준은 실측 뒤 적는다.
6. **Q6 CI 디스크·예산:** 원격 runner 는 `GITHUB_WORKSPACE`·`RUNNER_TEMP` 만 쓴다(X31 정책은 로컬 Mac 에만). job 제한 60분. public 저장소라 표준 runner 요금은 0 달러다.

## 요구사항
1. Windows 11 x64에서 NSIS `.exe`로 사용자별 설치·실행·제거를 한다. 시스템 Node·Python·ffmpeg·Chrome은 필요하지 않다. WebView2 또는 VC++ runtime이 없으면 설치 프로그램이 신뢰할 수 있는 Microsoft 배포본으로 충족한다. 권한이나 네트워크가 부족하면 설치 프로그램이 실패를 알린다.
2. codex CLI와 ChatGPT 로그인을 확인한 뒤 입력 1~20개 → 두 대본 방식 → 스튜디오 → MP4 내보내기와 주제·영상 캐러셀 → PNG·`caption.txt` 받기를 끝낸다. AI 제공자·모델 선택·Jev 규칙 대체·편집 모델은 바꾸지 않는다.
3. Windows는 MRX CPU 음성 분리·마이크 녹음·음성 불러오기·Whisper CPU 받아 적기를 지원한다. TTS 버튼·설정·모델 다운로드를 노출하지 않으며, 직접 TTS API를 호출해도 실행하거나 다운로드하지 않는다.
4. Jev 키의 저장·교체·삭제를 Windows 사용자 범위에서 처리한다. 키를 응답·로그·설정 JSON·명령행 인자·빌드에 넣지 않는다. 저장 전 검증·끝 4자 표시·키 없을 때 규칙 점수는 0024와 같다.
5. 한글·공백을 포함한 설치·사용자·원본·출력 경로에서 가져오기·재열기·렌더를 한다. 데이터와 모델은 설치 폴더 밖의 사용자 데이터 경로에 둔다. 앱 제거와 업데이트로 프로젝트를 지우지 않는다.
6. Windows 엔진도 `127.0.0.1`·임의 포트·일회용 토큰·허용 Origin 검사를 유지한다. Windows 지원을 이유로 인증·CORS를 와일드카드로 바꾸지 않는다. 프로세스를 시작할 때 콘솔 창을 띄우지 않는다.
7. Windows 빌드·패키징·자동 검증은 GitHub Actions `windows-latest`에서 한다. 같은 버전의 macOS·Windows 산출물을 한 Release와 `latest.json`에 넣는다. 한 플랫폼이 실패하면 그 버전을 latest로 공개하지 않는다.
8. Authenticode 없는 설치 파일도 updater minisign 서명과 서명된 버전 검사를 통과해야 업데이트한다. 편집 내용을 저장하고 엔진을 종료한 뒤 설치한다. 기존 macOS 서명·공증·업데이트를 유지한다.
9. SmartScreen 안내는 릴리스 노트와 연결된 설치 문서에만 둔다. 앱 첫 실행 안내·설치 설명 팝업·설정 도움말 문장을 추가하지 않는다. 보안 기능을 끄거나 조직 정책을 우회하라고 안내하지 않는다.

## 설계
### 현재 코드의 경계
- `scripts/build-engine.ts`는 Node 24.13.0의 darwin-arm64 archive와 compositor 경로를 고정한다. production 의존성을 별도 설치하고 Remotion 번들·Chrome 폴더를 복사한다. `otool`·dylib 검사도 항상 실행한다.
- `src-tauri/src/main.rs`는 resources의 Node를 직접 실행한다. `FFMPEG_BIN`·`FFPROBE_BIN`·`U3_WHISPER_CLI`·Origin이 Mac 값이다. `src/engine/main.ts`도 whisper 실행 파일의 기본 이름에 확장자가 없다.
- `scripts/package.sh`는 Whisper와 Swift TTS를 항상 빌드한다. `tauri.bundle.conf.json`의 `externalBin`도 두 실행 파일을 모두 요구한다. `release.sh`는 X31·Darwin arm64·Keychain·공증과 darwin 전용 `latest.json`을 전제한다.
- `scripts/fetch-resources.ts`는 uUu·MRX·라이선스를 X31 절대 경로에서 읽고 Swift checkout을 요구한다. `Store`의 기본 경로는 `~/Library/Application Support/U3`다. `jev-key.ts`는 `/usr/bin/security`를 부른다.
- `codex-path.ts`는 zsh의 `command -v`로 codex를 찾는다. Windows에는 이 탐색 경로가 없다. `Recorder.tsx`는 `audio/mp4`·`audio/webm` 지원 여부를 이미 검사한다.
- `pnpm-lock.yaml`에는 `@remotion/compositor-win32-x64-msvc@4.0.529`가 있다. 패키지 이름을 `compositor-win32-x64`로 줄여 실제 경로에 쓰지 않는다. ONNX Runtime 1.22.0의 지원 OS에도 win32가 있다. Windows 설치본 실행 증거는 아직 없다.

### 빌드와 CI
- 공통 `tauri.conf.json`에 macOS·Windows 공통 설정을 둔다. 플랫폼별 bundle 설정을 나눈다. Windows 설정은 NSIS만 만들고 `x86_64-pc-windows-msvc`를 대상으로 한다. Windows icon `.ico`도 준비한다.
- Windows NSIS는 `currentUser` 설치를 기본으로 한다. WebView2 bootstrapper를 포함하고 설치 중 필요한 runtime을 받는다. 완전한 오프라인 설치는 이번 범위가 아니다. ONNX 등 native 모듈의 VC++ runtime 요구도 깨끗한 VM에서 확인한다. 누락된 runtime은 Microsoft 서명·해시·재배포 조건을 확인한 설치 단계로 충족한다.
- `.github/workflows/windows-build.yml`을 추가한다. PR의 비밀 없는 검증·빌드와, 신뢰하는 버전 태그의 패키징·Release asset 업로드를 분리한다. Node 24·pnpm 10.33.0·MSVC Rust target·CMake를 준비하고 잠금 파일로 설치한다. 각 job의 오류를 그대로 실패로 반환한다.
- 로컬 Mac의 `pnpm package`는 macOS 산출물만 만든다. 현재 U3에서는 Windows cross-build를 지원하지 않는다. Tauri에는 cargo-xwin cross-compile 문서가 있지만, U3의 Windows Node·ONNX·compositor·Whisper 조립과 실행 검증은 Windows runner에서만 수행한다.
- Windows CI는 `TMP`·`TEMP`·`TMPDIR`·`CARGO_HOME`·`CARGO_TARGET_DIR`·`U3_BUILD_CACHE`·npm/pnpm 캐시를 runner 작업·임시 디스크로 지정한다. 로컬 Mac 스크립트의 X31 설정을 Windows에 복사하지 않는다. 캐시 키는 OS·아키텍처·잠금 파일·Whisper 버전을 포함한다.
- Windows CI는 버전 파일을 고치거나 커밋하지 않는다. 태그·빌드 commit SHA·package/Tauri/Cargo 버전 일치를 검사한다. macOS 릴리스 경로도 버전 반영과 최종 공개를 분리한다. 두 플랫폼의 성공을 모으는 단일 publish 단계만 Release를 latest로 공개한다.

### 엔진과 리소스 조립
`build-engine.ts`에 플랫폼 descriptor를 둔다. 지원하지 않는 OS·아키텍처에서는 조기에 실패한다.

| 항목 | macOS arm64 | Windows x64 |
| --- | --- | --- |
| Node 24.13.0 | `node-v24.13.0-darwin-arm64.tar.gz` → `resources/node` | `node-v24.13.0-win-x64.zip` → `resources/node.exe` |
| compositor 4.0.529 | `@remotion/compositor-darwin-arm64` | `@remotion/compositor-win32-x64-msvc` |
| media 실행 파일 | `ffmpeg`, `ffprobe`, `remotion` | `ffmpeg.exe`, `ffprobe.exe`, `remotion.exe` |
| ONNX Runtime 1.22.0 | `bin/napi-v6/darwin/arm64` | `bin/napi-v6/win32/x64` |
| 렌더 브라우저 | Mac용 Chrome headless shell | Windows용 `chrome-headless-shell.exe`와 동봉 DLL·데이터 |
| Whisper | Metal 정적 빌드 | MSVC CPU Release 빌드 `whisper-cli.exe` |

- Node archive는 공식 `SHASUMS256.txt`로 검사한다. 압축 해제와 production dependency 설치는 플랫폼에 맞게 처리한다. Windows의 `.cmd`를 `execFileSync`로 직접 실행하지 않는다. npm CLI의 JS 진입점을 Node로 실행하는 등 shell 없는 경로를 쓴다.
- production staging은 해당 runner에서 native·optional 의존성을 설치한다. Mac node_modules를 Windows에 복사하지 않는다. Remotion 버전은 4.0.529로 일치시키고, Transformers와 앱은 기존 override대로 ONNX Runtime 1.22.0 하나를 쓴다.
- compositor와 ONNX Runtime은 실행 파일 하나만 고르지 않고 해당 배포 디렉터리의 DLL·`.node`를 함께 복사한다. Windows에서 Node import·CPU ONNX 추론·ffmpeg/ffprobe 실행으로 의존성 누락을 검사한다. Mac의 `fix-dylib-paths.sh`·`otool`·`codesign`·`sign-nested.sh`는 Mac 분기에서만 실행한다.
- `ensureBrowser`는 Windows runner에서 Windows 배포본을 받는다. `chrome-path.txt`에는 복사한 Chrome 폴더 기준 상대 실행 파일 경로를 기록한다. 브라우저의 DLL·pak·locale 등 형제 파일을 유지한다. 설치 앱은 Chrome을 추가로 받지 않는다.
- Whisper는 기존 v1.9.5 소스를 MSVC로 빌드한다. `BUILD_SHARED_LIBS=OFF`, Metal·CUDA 끄기, build host CPU 최적화 고정 방지를 적용한다. Windows 11 x64 시험 장치에서 불법 명령 없이 실행해야 한다. 추가 DLL이 생기면 함께 패키징하고 누락 검사를 한다.
- `resources/bin/whisper-cli.exe`와 Tauri가 요구하는 `binaries/whisper-cli-x86_64-pc-windows-msvc.exe`를 준비한다. Windows bundle의 `externalBin`에서 `u3-tts`를 제외한다. `build-tts.sh`·Metal 리소스·Qwen tokenizer 생성은 Windows에서 실행하지 않는다.
- `fetch-resources.ts`는 리소스 root와 라이선스 root를 입력으로 받게 한다. CI archive는 기존 짤·효과음·색인·MRX int8·Silero VAD·폰트·고지를 포함한다. MRX·VAD의 기존 checksum을 유지하고 archive checksum·파일 manifest를 검사한다. Swift/MLX/Qwen 리소스와 고지는 해당 파일을 넣는 Mac 분기에서만 읽는다.
- bge-m3 약 2.1GB와 Whisper 약 574MB는 설치 파일에 넣지 않는다. 0004·0007의 받기 시점과 대체 동작을 유지한다. CI 리소스가 누락되면 빈 라이브러리로 배포하지 않고 실패한다.

### 플랫폼별 기능과 화면
`GET /api/system`에 엔진의 `platform`과 `capabilities`를 추가한다. UI는 user-agent가 아니라 이 응답으로 기능을 고른다. 응답 전에는 지원을 확인하지 않은 TTS 버튼을 노출하지 않는다.

| 기능 | macOS Apple Silicon | Windows 11 x64 |
| --- | --- | --- |
| 입력·대본·스튜디오·MP4·캐러셀 | 유지한다. | 같은 편집 모델·결과물 형식을 쓴다. |
| TTS | Swift/MLX·Sohee·기존 모델 받기를 유지한다. | capability를 false로 둔다. 생성·설정·모델 받기를 숨긴다. |
| STT | whisper.cpp Metal·한국어·단어 시각을 유지한다. | 같은 모델·CLI 결과 형식을 CPU로 처리한다. CUDA는 제외한다. |
| 음성 분리 | MRX·ONNX CPU를 유지한다. | 같은 MRX·CPU EP·분할 처리를 쓴다. GPU EP를 추가하지 않는다. |
| 녹음 | WKWebView·MediaRecorder를 유지한다. | WebView2의 마이크 권한과 `isTypeSupported`로 형식을 고른다. 결과를 기존 ffmpeg 경로로 읽는다. |
| Jev 키 | login Keychain을 유지한다. | 현재 사용자 DPAPI로 암호화한 파일을 쓴다. |
| 창 배경색·테마 | 기존 테마를 유지한다. | CSS 테마와 네이티브 창·웹뷰 배경색을 맞춘다. Tauri에 지원되는 RGBA 값을 넘긴다. |
| 폰트 | 앱에 든 Pretendard·G마켓 산스·티몬체를 유지한다. | 같은 파일을 UI·Remotion에 넣는다. 시스템 한글 폰트 설치를 요구하지 않는다. |
| 업데이트 | 기존 공개키·darwin-aarch64·Developer ID 공증을 유지한다. | Windows 전용 공개키·windows-x86_64·minisign 서명을 쓴다. Authenticode는 없다. |

- Windows TTS API는 job·모델 다운로드 전에 `unsupported-platform`으로 거절한다. TTS 모델 받기 API도 막는다. 기존 TTS 설정값을 지우지 않는다. 이미 음성 파일이 있는 프로젝트의 재생·내보내기는 막지 않는다. 프로젝트를 다른 OS로 옮기는 자동 기능은 추가하지 않는다.
- 창 배경색 권한은 현재 `core:window:allow-set-background-color`를 유지한다. Windows에서 실제 색 변환과 테마 전환을 시험한다. updater 권한을 웹뷰에 주거나 shell 실행 권한을 추가하지 않는다.
- Jev 키는 `JevKeyStore` 인터페이스를 유지한다. Windows 전용 Rust helper `u3-key-store.exe`를 resources/bin에 넣고 엔진이 pipe로 호출한다. helper는 `CryptProtectData`·`CryptUnprotectData`의 현재 사용자 범위를 쓴다. machine-wide 보호나 평문 대체 저장은 쓰지 않는다.
- 암호화 파일은 데이터 root의 `secrets/jev-key.dpapi`에 둔다. helper는 파일 접근을 현재 사용자로 제한하고 암호문만 임시 파일에 쓴 뒤 교체한다. 작업 종류·파일 경로만 인자로 받고 키는 stdin으로 받는다. 읽은 키는 엔진 stdout pipe로만 반환한다. helper 원문 오류·키를 로그에 쓰지 않는다. 실패하면 일반 오류 또는 규칙 점수로 처리한다. `security` 구현과 같은 직렬화·캐시 갱신을 적용한다.
- Windows Credential Manager는 대안이다. 이번 제안은 DPAPI 파일로 정한다. Node native addon 없이 Rust helper 하나로 사용자별 저장과 암호문 파일 처리를 시험할 수 있기 때문이다. 키 복호화는 같은 Windows 사용자 보안 경계 안에서만 보호한다.

### 경로·프로세스·인증
- Rust의 플랫폼 분기가 Node·compositor·Whisper·key helper 실행 파일 이름을 정한다. `FFMPEG_BIN`·`FFPROBE_BIN`·`U3_WHISPER_CLI`·`U3_KEY_STORE_CLI`에는 `.exe`를 포함한 절대 경로를 준다. 나머지 리소스 env는 기존 이름을 유지한다.
- Windows 데이터 root는 `%LOCALAPPDATA%\U3`다. Mac은 기존 경로를 유지한다. Rust가 `U3_DATA_DIR`을 넘기고 개발 실행의 `Store` 기본값도 플랫폼별로 맞춘다. 모델·프로젝트·업데이트 캐시는 설치 리소스 폴더에 쓰지 않는다.
- 파일 경로는 `PathBuf`·`node:path`로 조립한다. PATH는 `path.delimiter`를 쓰고, 프로젝트 안의 논리 상대 경로와 media URL은 `/`로 정규화한다. Windows의 드라이브·역슬래시·UNC·대소문자를 고려해 루트 이탈을 검사한다. 정상 경로 지원을 위해 traversal 검사를 약하게 만들지 않는다.
- 실행 파일과 인자 배열을 분리한다. shell 문자열에 사용자 경로·대본·키를 붙이지 않는다. Node의 Windows child는 `windowsHide`를 적용하고 Rust의 숨김 프로세스 생성도 처리한다. stdin EOF·취소·앱 종료 때 Node와 렌더·Whisper 등 자식을 정리한다. Windows 종료 후 남은 프로세스·파일 잠금을 검사한다.
- Windows codex 탐색은 zsh를 쓰지 않는다. PATH와 사용자 설치 위치에서 native `codex.exe`를 찾는다. npm 설치에서는 `.cmd` 자체를 spawn하지 않고 설치된 launcher가 가리키는 native 실행 파일을 해석한다. 찾지 못하면 기존 경로 지정 동작을 쓴다. WSL의 Linux 실행 파일·로그인 세션을 자동으로 연결하지 않는다.
- 패키지 Windows의 허용 Origin은 기본 custom-protocol HTTP 구성인 `http://tauri.localhost`로 고정한다. Mac은 `tauri://localhost`, 개발은 `http://127.0.0.1:1420`이다. 실제 WebView2 Origin과 Rust가 넘기는 값의 일치를 설치본에서 확인한다. API와 media 서버의 토큰·Origin 거절 시험을 모두 유지한다.

### 릴리스·서명·설치 안내
- 배포 파일 이름은 `U3-<version>-windows-x64-setup.exe`로 통일한다. Tauri의 native 산출물 이름을 이 이름으로 정규화한 뒤 updater 서명과 checksum을 만든다. 실행 파일 본문은 서명 뒤 수정하지 않는다.
- 같은 Release에 Windows `.exe`·`.exe.sig`, 기존 `U3-<version>-arm64.dmg`·`U3.app.tar.gz`·`.sig`, `latest.json`, `SHA256SUMS.txt`를 올린다. Windows `.sig`는 Authenticode 인증서가 아니라 updater 검증용 minisign 서명이다.
- Windows updater 공개키는 Windows config에서만 바꾼다. 개인키·암호는 승인된 GitHub release environment secret으로만 공급한다. macOS 키는 Keychain에 남긴다. 신뢰하지 않는 PR에서는 키를 제공하지 않으며 release job만 asset 쓰기 권한을 가진다. 서명 job의 로그·artifact·캐시에는 개인키를 남기지 않는다.
- 플랫폼별 job은 draft Release에 asset과 플랫폼 fragment를 올린다. 공통 publish 단계가 동일 tag·버전·commit·업로드 hash를 확인하고 `latest.json`을 한 번 만든다. `platforms.darwin-aarch64`는 Mac archive URL·서명, `platforms.windows-x86_64`는 Windows installer URL·서명을 갖는다. 각 `signature`에는 `.sig` 내용 자체를 넣는다. 한 job이 다른 플랫폼 항목을 덮어쓰지 않는다.
- `scripts/release.sh`는 Mac 서명·공증을 유지하되 darwin 전용 manifest로 바로 latest를 공개하지 않게 바꾼다. GitHub Actions가 Windows 빌드·업로드와 최종 통합 Release 공개를 담당한다. 부분 실패에서는 이전 latest를 유지한다. 기존 공개 Release asset을 조용히 교체하지 않는다.
- `updater.rs`의 `.app.tar.gz` 캐시 이름과 Mac의 `request_restart`·`RunEvent::Exit` 설치 경로를 플랫폼별로 나눈다. Windows updater의 `install`은 설치 전에 앱을 종료하므로, 저장·작업 확인·엔진과 자식 종료를 먼저 끝낸다. `on_before_exit` 경계도 사용해 순서를 보장한다. 설치 프로그램이 새 앱을 시작하게 하며 기존 실행 파일을 미리 다시 열지 않는다.
- 릴리스 노트는 아래 문구를 Windows asset 링크 앞에 싣는다. 설치 문서에는 같은 절차와 공식 주소·해시 확인을 둔다. 앱 첫 실행 안내는 만들지 않는다.

> **Windows 설치 전 확인**
>
> 이 Windows 설치 파일에는 Authenticode 코드 서명이 없습니다. Windows가 게시자를 확인하지 못하거나 SmartScreen 경고를 표시할 수 있습니다. GitHub의 `smpbrighton/u3` 공식 Release에서 받은 파일인지 확인하세요. `SHA256SUMS.txt`의 SHA-256과 다운로드 파일의 SHA-256을 비교하세요. 출처나 해시가 다르면 실행하지 마세요.
>
> 1. 「Windows의 PC 보호」 창이 나오면 「추가 정보」를 누르세요.
> 2. 공식 파일임을 확인한 뒤 「실행」을 누르세요.
> 3. 파일 속성에 「차단 해제」가 표시되면 해당 파일의 「차단 해제」를 선택하세요.
> 4. 「적용」을 누르세요.
> 5. 설치 파일을 다시 실행하세요.
>
> 「실행」이 없거나 Smart App Control·회사 보안 정책이 차단하면 이 절차로 설치할 수 없습니다. 보안 기능을 끄지 마세요. 회사 PC는 관리자에게 문의하세요. 악성코드 경고가 나오면 실행을 중단하세요. 「차단 해제」는 서명이나 안전성 검증을 대신하지 않습니다.
>
> Windows 버전은 TTS를 지원하지 않습니다. 받아 적기는 CPU를 사용합니다. AI 대본과 이미지 생성에는 Windows용 codex CLI 설치와 ChatGPT 로그인이 필요합니다. WebView2 등 설치 구성요소를 받을 인터넷 연결이 필요합니다.

- Azure Artifact Signing으로 전환하면 app·helper·installer의 Authenticode 서명 정책과 공급망을 별도 변경으로 설계한다. 서명 비용과 심사 기간을 승인받는다. 서명만으로 경고가 사라진다고 안내하지 않는다.
- 공식 근거: [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/), [Tauri updater](https://v2.tauri.app/plugin/updater/), [SmartScreen 제한](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [Artifact Signing 비용](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku), [신청 대상](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [GitHub Actions 무료 조건](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [runner 단가](https://docs.github.com/en/billing/reference/actions-runner-pricing).

## 결정
- 대체안: 현재 유효한 0025(0001을 대체한 앱 구조)의 OS 범위를 macOS 15+ Apple Silicon + Windows 11 x64로 바꾸고, Tauri 2·React/shadcn·Node sidecar·loopback 토큰 구조를 유지한다.
- 0004·0007은 Windows 데이터 경로·CPU Whisper 실행을 보완한다. 0008의 MRX CPU 처리는 유지한다. 0023·0026의 TTS 제공 범위는 Mac으로 한정한다. 0024의 Keychain은 Mac에서 유지하고 Windows는 사용자 DPAPI로 보완한다.
- 0021은 Mac의 Developer ID·공증·Keychain updater 키를 유지한다. Windows에는 Authenticode 없는 NSIS·전용 updater 키·보호된 CI secret·통합 manifest 공개를 제안한다.
- 결정 번호는 spec 승인 뒤 예약한다.

## 우려 사항
- 제품 책임자: Windows TTS 제외는 현재 범위의 플랫폼 차이다. 녹음·음성 불러오기와 기존 음성 재생을 유지하고 TTS 동작만 숨기는 안을 추천한다. Swift/MLX 이식 없이 핵심 제작 흐름을 제공하기 때문이다.
- 배포·보안 정책 소유자: unsigned exe는 Smart App Control·조직 정책에서 실행을 보장하지 못한다. 파일 단위 허용 절차가 있는 개인 PC부터 지원하는 안을 추천한다. 보안 기능 해제를 제품 설치 조건으로 요구하지 않기 때문이다.
- 비밀 보관 정책 소유자: Windows updater key의 GitHub secret 보관은 0021의 Keychain 한정 정책에 대한 예외다. Windows 전용 키·보호된 environment·태그 고정 job을 추천한다. Mac 키의 신뢰 경계를 넓히지 않고 CI 배포를 수행하기 때문이다.
- 리소스·라이선스 소유자: CI는 현재 X31의 리소스와 Swift checkout을 읽지 못한다. 배포 권리와 checksum을 확인한 공통 archive를 먼저 준비하는 안을 추천한다. 파일이 없거나 권리가 미확인인 상태에서 릴리스를 만들 수 없기 때문이다.
- 워크스페이스 정책 소유자: Windows 원격 runner에는 X31이 없다. 원격 runner 디스크만 쓰는 예외를 추천한다. 로컬 내장 디스크 금지 정책을 유지하면서 CI를 실행하기 때문이다.
- 제품·검증 담당자: Windows CPU STT·ONNX 메모리·WebView2 녹음·폰트 결과는 미측정이다. Windows 11 설치본 실측을 릴리스 게이트로 두는 안을 추천한다. `windows-latest`의 Windows Server 시험을 사용자 PC 증거로 대체하지 않기 때문이다.
- 비용 소유자: 초기 Windows job 30~60분은 추정이다. 60분 timeout과 회당 사용 시간 기록을 추천한다. public 표준 runner 실행은 무료지만 유료 전환 시 회당 0.30~0.60달러와 저장 초과 비용이 발생하기 때문이다. Azure 대안은 월 9.99달러부터이며 별도 승인이 필요하다.

## 검증 기준
- 검증 명령은 `pnpm verify` 하나를 유지한다. OS-aware Node 검증 진입점으로 TypeScript 검사·Vitest·Cargo check/test·Remotion smoke를 순서대로 실행하고, 어느 단계든 실패하면 종료 코드 0을 반환하지 않는다. 성공 마지막 줄은 `✓ verify passed`다.
- macOS에서는 기존 dylib·서명·macOS 실행 파일 시험을 유지한다. Windows에서는 Mach-O 도구를 실행하지 않는다. 플랫폼 전용 native 시험만 명시적으로 분리하며 공통 API·편집·보안 시험을 통째로 건너뛰지 않는다.
- 공통 단위 시험은 플랫폼 descriptor·실행 파일 확장자·`path.win32`·Origin 선택·feature capability·manifest 병합을 Mac에서도 검사한다. Windows native 통합 시험은 `pnpm verify`가 Windows CI에서 실행할 때만 돈다. Mac 실행 결과에는 Windows native 시험을 실행하지 않았다고 표시한다.
- Windows CI는 먼저 리소스·native helper·Whisper·엔진을 준비한다. `pnpm verify`의 Windows 분기가 이 리소스로 Node 부팅→PORT 응답·health API, ffprobe/ffmpeg, Chrome MP4·캐러셀 PNG, 실제 CPU ONNX 추론, 한국어 Whisper fixture를 검사한다. 의존성 누락을 skip으로 바꾸지 않는다. 모델·fixture는 checksum으로 고정하며 개인 영상이나 실제 API 키를 넣지 않는다.
- Windows CI에서 DPAPI 저장·교체·삭제·복호화 실패·평문 미저장·키 로그 미노출을 검사한다. TTS API와 모델 받기 직접 호출이 거절되는지 검사한다. 토큰 없음·잘못된 토큰·외부 Origin·드라이브/UNC/역슬래시 traversal 요청이 거절되는지 검사한다.
- Windows CI는 패키징 후 NSIS 설치·엔진 시작·프로젝트 저장/재열기·제거를 검사한다. 깨끗한 Windows 11에서는 시스템 Node·ffmpeg·Chrome·개발 도구가 없는 일반 사용자 계정으로 같은 흐름을 별도 확인한다. 한글·공백 경로, 마이크 허용/거절, 다크·라이트·시스템 테마, 세 폰트의 미리보기/결과물, 프로세스 종료 후 파일 잠금을 확인한다.
- Windows 11에서 실제 codex 로그인·두 대본 방식·짤/효과음 편집·Whisper 모델 받기/취소·STT·음성 분리·MP4 재생과 두 캐러셀 방식의 PNG/캡션을 확인한다. bge-m3 받기 전 규칙 점수도 확인한다. 성능 수치는 장치·입력 길이·메모리와 함께 기록한다.
- 두 버전의 Windows 설치본으로 업데이트 받기→저장→엔진/자식 종료→설치→새 버전 실행을 확인한다. 변조 payload·틀린 서명·서명된 버전 불일치를 거절한다. manifest 병합의 버전 불일치·한 플랫폼 실패는 공개를 막는다. macOS 항목과 기존 updater 공개키를 유지하는지도 검사한다.
- 공식 다운로드에서 받은 파일로 Windows 11 SmartScreen 절차를 확인한다. MOTW가 없는 CI 내부 파일의 실행 성공을 SmartScreen 증거로 쓰지 않는다. 안내의 「실행」·「차단 해제」가 없는 정책 조건도 기록한다. 앱에 첫 실행 설치 안내가 생기지 않았는지 확인한다.
- 검증 로그·commit SHA·artifact SHA-256·Windows 11 화면 증거·미검증 항목을 plan의 실행 기록에 남긴다. 이 문서는 설계 초안이며 Windows 실행·패키징·서명·릴리스가 통과했다는 증거가 아니다.

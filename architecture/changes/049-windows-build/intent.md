# Intent: windows-build
Author: sumin.p. Status: accepted.

## 문제
사용자는 “윈도우 사용자도 사용할 수 있게 exe 프로그램을 만들어야하는데 윈도우에서는 공인된 배포자가 아니므로, 우회해서 설치할 수 있는 방법을 안내해야해”라고 요청했다.
현재 U3는 macOS Apple Silicon만 지원하므로 Windows 사용자는 설치와 편집을 시작하지 못한다.
Windows 설치 파일에 Authenticode 서명이 없으면 SmartScreen이 경고하며, 일부 Windows 보안 정책은 실행을 막는다.

## 기대 결과
- Windows 11 x64 사용자는 GitHub Releases에서 NSIS `.exe` 설치 파일을 받는다. 일반 사용자 계정으로 설치하고 시작 메뉴에서 U3를 실행한다. WebView2가 없으면 설치 프로그램이 Microsoft 배포본을 설치한다.
- codex CLI 설치·ChatGPT 로그인 뒤, 영상·사진 1~20개 넣기 → 직접 쓴 대본 다듬기 또는 AI 추천 → 스튜디오 장면·자막·짤·효과음 편집 → 1080×1920·30fps MP4 내보내기를 끝낸다. Node·Python·ffmpeg·Chrome을 따로 설치하지 않는다.
- Windows에서 마이크 녹음·음성 파일 불러오기·MRX CPU 음성 분리·Whisper CPU 받아 적기를 쓴다. Whisper 모델은 요청할 때 받고, bge-m3는 처음 실행 때 받는다. bge-m3를 받기 전에도 규칙 점수로 짤을 고른다.
- Windows에서 주제 또는 영상으로 캐러셀 2~10장을 만든다. 기획 검토 → 이미지 만들기 → 글 객체 편집 → PNG와 `caption.txt` 받기를 끝낸다. Jev 키의 저장·교체·삭제는 Windows 사용자별 보안 저장소를 쓴다.
- Windows에서도 새 버전을 확인하고 받는다. 편집 내용을 저장하고 엔진을 종료한 뒤, 다시 시작 또는 앱 종료 시 업데이트 설치 프로그램을 실행한다. 앱은 updater 서명과 서명된 버전을 검사한다.
- 릴리스 노트는 서명 없는 파일임을 먼저 밝힌다. 공식 다운로드 주소·SHA-256 확인과 SmartScreen의 「추가 정보 → 실행」, 파일 속성의 「차단 해제」 절차를 안내한다. 이 절차가 허용되지 않는 보안 정책에서는 설치를 보장하지 않는다.
- Windows 1차 범위에는 TTS가 없다. 음성 만들기 버튼·TTS 설정·TTS 모델 받기를 숨긴다. 녹음과 불러온 음성은 유지한다. CUDA STT·Windows ARM64·Windows 10·Linux·Microsoft Store 배포는 범위 밖이다.
- macOS 15 이상 Apple Silicon의 기존 기능·TTS·Developer ID 서명·공증·업데이트를 유지한다. 앱에 설치 설명 팝업이나 첫 실행 안내를 추가하지 않는다.

## 영향 범위
- Windows 11 x64 사용자와 기존 macOS 사용자에게 영향을 준다. codex 구독·로그인과 Jev 사용자의 키 입력 방식은 유지한다.
- Tauri 셸·WebView2·엔진 실행 환경·데이터 경로·키 저장·폰트·기능 노출을 플랫폼별로 나눈다. 엔진의 loopback·일회용 토큰·Origin 검사는 유지한다.
- Node·Remotion compositor·ONNX Runtime·Chrome headless shell·whisper.cpp·리소스 수급과 패키징을 Windows에 맞춘다.
- GitHub Actions의 Windows 빌드와 GitHub Releases 산출물·통합 `latest.json`·설치 안내를 추가한다. 현재 유효한 앱 구조 결정 0025와 그 선행 결정 0001의 macOS 전용 범위를 바꾼다.

## 제약
- 설치 파일과 앱은 Authenticode 서명 없이 시작한다. updater minisign 서명은 별도이며 반드시 유지한다. 백신·SmartScreen·Smart App Control을 끄거나 회사 정책을 바꾸라고 안내하지 않는다.
- Swift/MLX TTS에는 Windows 실행 경로가 없다. Windows 받아 적기는 whisper.cpp CPU로 시작한다. GPU 가속과 Windows TTS는 별도 변경으로 다룬다.
- 현재 U3의 Windows 산출물은 `windows-latest` x64 runner에서 만든다. 로컬 Mac의 Windows cross-build는 지원하지 않는다. Tauri 자체의 cross-compile 가능 여부와 U3의 지원 경로를 구분한다.
- API 키·업데이터 개인키·라이브러리·모델은 커밋하지 않는다. 짤·효과음·색인·MRX·라이선스 파일을 CI가 재현 가능하게 받는 경로가 필요하다. 사용자 프로젝트 형식과 기존 미디어를 임의로 바꾸지 않는다.
- 로컬 Mac의 결과물·캐시·임시 파일은 X31에 둔다. 원격 Windows CI는 runner의 작업·임시 디스크를 쓰는 예외가 필요하다.
- 표준 public GitHub Actions runner의 실행 요금은 0달러다. 초기 Windows 빌드·검증은 회당 30~60분으로 예산을 잡되 실측 전 추정으로 표시한다. 유료 Windows x64 표준 runner 단가 0.010달러/분을 적용하면 회당 0.30~0.60달러다. 캐시·artifact 저장 초과 비용은 별도다.
- 서명 없는 배포의 Authenticode 비용은 0달러다. 대안인 Azure Trusted Signing의 현재 이름은 Artifact Signing이다. Basic은 월 9.99달러/5,000회이며 초과 서명은 회당 0.005달러다. 세금·환율·계약 가격은 별도다. 가입 심사와 서명만으로 SmartScreen 경고가 없어지지는 않는다.

## 열린 질문
- Q1. Windows 11 x64·TTS 제외·CPU STT를 1차 범위로 받을 것인가? 이 범위를 추천한다. Swift/MLX를 이식하지 않고 설치부터 결과물까지 제공할 수 있다.
- Q2. 서명 없는 배포를 먼저 할 것인가, Azure Artifact Signing을 먼저 도입할 것인가? 서명 없는 1차 배포를 추천한다. 심사 대기 없이 시작할 수 있다. 다만 Smart App Control·조직 정책이 막는 PC는 지원 범위에서 제외해야 한다.
- Q3. Windows updater 전용 개인키를 GitHub의 보호된 release environment secret에 둘 것인가? macOS 키와 분리하는 안을 추천한다. Windows CI 배포를 자동화하면서 기존 Mac Keychain 키의 노출 범위를 늘리지 않는다.
- Q4. CI에 제공할 리소스 archive의 저장 위치와 재배포 권리를 누가 확인할 것인가? 기존 macOS와 같은 파일을 checksum·라이선스와 함께 버전 고정해 제공하는 안을 추천한다. X31 절대 경로는 원격 runner에서 쓸 수 없다.
- Q5. 누가 Windows 11 실기기 또는 VM을 제공할 것인가? 일반 사용자 계정과 한글·공백 경로를 포함한 깨끗한 Windows 11 시험을 추천한다. `windows-latest` runner만으로는 실제 Windows 11 설치·SmartScreen·마이크·편집 화면을 입증하지 못한다. 최소 RAM과 STT 대기시간 기준은 실측 뒤 정한다.
- Q6. 원격 CI 디스크 예외와 회당 60분의 초기 빌드 예산을 받을 것인가? 이 한도를 추천한다. X31 정책을 로컬에 유지하면서 원격 빌드와 비용 측정을 시작할 수 있다.

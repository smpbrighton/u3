**Windows 설치 전 확인**

이 Windows 설치 파일에는 Authenticode 코드 서명이 없습니다. Windows가 게시자를 확인하지 못하거나 SmartScreen 경고를 표시할 수 있습니다. GitHub의 `smpbrighton/u3` 공식 Release에서 받은 파일인지 확인하세요. `SHA256SUMS.txt`의 SHA-256과 다운로드 파일의 SHA-256을 비교하세요. 출처나 해시가 다르면 실행하지 마세요.

1. 「Windows의 PC 보호」 창이 나오면 「추가 정보」를 누르세요.
2. 공식 파일임을 확인한 뒤 「실행」을 누르세요.
3. 파일 속성에 「차단 해제」가 표시되면 해당 파일의 「차단 해제」를 선택하세요.
4. 「적용」을 누르세요.
5. 설치 파일을 다시 실행하세요.

「실행」이 없거나 Smart App Control·회사 보안 정책이 차단하면 이 절차로 설치할 수 없습니다. 보안 기능을 끄지 마세요. 회사 PC는 관리자에게 문의하세요. 악성코드 경고가 나오면 실행을 중단하세요. 「차단 해제」는 서명이나 안전성 검증을 대신하지 않습니다.

Windows 버전은 TTS를 지원하지 않습니다. 받아 적기는 CPU를 사용합니다. AI 대본과 이미지 생성에는 Windows용 codex CLI 설치와 ChatGPT 로그인이 필요합니다. WebView2 등 설치 구성요소를 받을 인터넷 연결이 필요합니다.

[Windows 11 x64 설치 파일](https://github.com/smpbrighton/u3/releases/download/v<version>/U3-<version>-windows-x64-setup.exe) · [SHA256SUMS.txt](https://github.com/smpbrighton/u3/releases/download/v<version>/SHA256SUMS.txt)

[Mac Apple Silicon DMG](https://github.com/smpbrighton/u3/releases/download/v<version>/U3-<version>-arm64.dmg) · [Windows 설치 문서](https://github.com/smpbrighton/u3/blob/main/docs/install-windows.md)

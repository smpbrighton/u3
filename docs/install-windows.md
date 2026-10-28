# Windows 설치

대상은 Windows 11 x64입니다. 앱은 사용자별 NSIS 설치 파일로 설치합니다. 설치 구성요소를 내려받을 인터넷 연결이 필요합니다. VC++ runtime이 부족하면 Microsoft 설치 프로그램이 구성요소 설치 권한을 요청합니다. 권한을 허용하지 못하면 설치를 중단합니다.

**Windows 설치 전 확인**

이 Windows 설치 파일에는 Authenticode 코드 서명이 없습니다. Windows가 게시자를 확인하지 못하거나 SmartScreen 경고를 표시할 수 있습니다. GitHub의 `smpbrighton/u3` 공식 Release에서 받은 파일인지 확인하세요. `SHA256SUMS.txt`의 SHA-256과 다운로드 파일의 SHA-256을 비교하세요. 출처나 해시가 다르면 실행하지 마세요.

1. 「Windows의 PC 보호」 창이 나오면 「추가 정보」를 누르세요.
2. 공식 파일임을 확인한 뒤 「실행」을 누르세요.
3. 파일 속성에 「차단 해제」가 표시되면 해당 파일의 「차단 해제」를 선택하세요.
4. 「적용」을 누르세요.
5. 설치 파일을 다시 실행하세요.

「실행」이 없거나 Smart App Control·회사 보안 정책이 차단하면 이 절차로 설치할 수 없습니다. 보안 기능을 끄지 마세요. 회사 PC는 관리자에게 문의하세요. 악성코드 경고가 나오면 실행을 중단하세요. 「차단 해제」는 서명이나 안전성 검증을 대신하지 않습니다.

Windows 버전은 TTS를 지원하지 않습니다. 받아 적기는 CPU를 사용합니다. AI 대본과 이미지 생성에는 Windows용 codex CLI 설치와 ChatGPT 로그인이 필요합니다. WebView2 등 설치 구성요소를 받을 인터넷 연결이 필요합니다.

## SHA-256 확인

공식 [U3 Releases](https://github.com/smpbrighton/u3/releases)에서 설치 파일과 같은 버전의 SHA256SUMS.txt를 받습니다. PowerShell에서 파일 이름의 버전을 바꾸어 실행합니다.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\U3-<버전>-windows-x64-setup.exe'
```

출력의 Hash와 SHA256SUMS.txt에서 같은 파일 이름의 hash를 비교합니다. 값이 다르면 실행하지 않습니다. `.exe.sig`는 앱 updater가 쓰는 minisign 서명입니다. Windows 게시자 인증서가 아닙니다.

## 데이터와 제거

앱은 기본으로 `%LOCALAPPDATA%\U3`에 설치합니다. 프로젝트·모델·키는 `%LOCALAPPDATA%\ai.brightongroup.u3`에 둡니다. 업데이트는 이 데이터 폴더를 유지합니다. 제거 프로그램에서 앱 데이터 삭제를 선택하면 프로젝트와 모델도 삭제합니다. 기본값은 선택 해제입니다.

## 빌드와 배포 담당자

- 리소스 권리를 확인한 뒤 `make-resource-archive.ts`로 archive를 만들고 `resources-<정수>` prerelease에 올립니다. `U3_RESOURCE_VERSION`·`U3_RESOURCE_SHA256` Actions 변수를 등록합니다.
- Windows 전용 updater 개인키·암호를 보호된 release environment의 `TAURI_SIGNING_PRIVATE_KEY`·`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret으로 등록합니다. 공개키는 `U3_WINDOWS_UPDATER_PUBLIC_KEY` 변수로 등록합니다. PR에는 개인키를 제공하지 않습니다. 커밋된 Windows config의 빈 공개키는 아직 키를 등록하지 않았다는 뜻입니다.
- 기본 `scripts/release.sh <버전>`은 버전 commit을 push하고 Mac 자산을 draft에 올린 뒤 tag를 push합니다. Actions가 Windows 검증과 서명을 끝내면 두 fragment의 version·commit·hash를 검사하고 공개합니다. 어느 단계든 실패하면 이전 latest를 유지합니다.
- 같은 태그 재실행은 `gh workflow run windows-build.yml -f tag=v<버전>`으로 합니다. 고정된 같은 commit을 재빌드합니다. 공개한 Release는 변경하지 않습니다. 코드가 바뀌면 새 버전과 두 플랫폼의 새 빌드를 준비합니다.
- 긴급 Mac 수정은 `scripts/release.sh --mac-only <버전>`으로 즉시 공개합니다. Windows 미포함을 릴리스 노트에 적습니다. Windows는 자기 플랫폼 항목이 없는 manifest를 업데이트 없음으로 처리합니다.
- 리소스가 등록되지 않은 PR은 공통 verify만 실행합니다. package와 Windows native 시험은 미실행으로 표시합니다. 릴리스 job은 리소스가 없으면 실패합니다.
- 출시 전 `architecture/changes/049-windows-build/checklist.md`의 Windows 11 실기기 게이트를 모두 확인합니다. CI의 Windows Server 실행은 실기기 증거를 대신하지 않습니다.

## 설치 구성요소 근거

- [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Microsoft VC++ runtime](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
- [Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

VC++ runtime은 Microsoft 공식 고정 배포본 14.44.35211을 설치 시 내려받습니다. SHA-256은 `cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b`입니다. 설치 프로그램은 이 값과 유효한 Microsoft Authenticode 서명을 함께 검사합니다. 배포본은 U3에 재포장하지 않습니다.

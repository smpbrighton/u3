# 0021 앱 자동 업데이트: GitHub Releases, Developer ID 공증, 다시 시작 때 적용

Status: accepted
Source: changes/038-auto-update/plan.md

## 맥락
새 버전은 dmg 를 다시 받아 바꿔야 했다. 앱은 ad-hoc 서명이었다. 사용자는 brighton-runner 처럼 자동으로 업데이트되기를 원한다. U3 에는 로그인과 서버가 없으므로 토큰 없이 받는 공개 주소가 필요하다.

## 결정
- 앱은 `tauri-plugin-updater`(2.14 이상)를 Rust 에서만 쓴다. 웹뷰에는 updater 권한을 주지 않는다. 확인 주소는 `https://github.com/smpbrighton/u3-releases/releases/latest/download/latest.json` 이다. 소스 레포 `smpbrighton/u3` 는 private 이고, 릴리스 파일만 public 레포 `smpbrighton/u3-releases` 의 Release asset 으로 둔다.
- 업데이트 파일은 U3 전용 minisign 키로 서명한다. 개인키와 암호는 개발 Mac 의 login Keychain(account `u3`)에만 둔다. 공개키는 `tauri.conf.json` 에 둔다. 서명이 맞지 않거나 서명에 버전이 없으면(`requireSignedVersion`) 설치하지 않는다.
- 앱은 Developer ID(`BRIGHTON AI HOLDINGS PTY LTD (47RAD569PH)`)와 hardened runtime 으로 서명하고 공증·staple 한다. 앱 안의 모든 Mach-O 를 안쪽부터 서명한다. `Contents/MacOS` 에는 Mach-O 만 둔다. 셸 스크립트는 서명이 xattr 에만 남아 Gatekeeper 가 거부하고, xattr 없이 묶은 업데이트 파일에서 서명이 깨진다.
- 확인은 시작 30초 뒤, 6시간마다, 창이 앞으로 올 때(10분 간격) 한다. 개발 빌드는 확인하지 않는다.
- 새 버전은 바로 받아 앱 캐시 폴더에 둔다. 설치(번들 교체)는 사이드바 「다시 시작」이나 앱 종료 때, 엔진을 끈 뒤 한다. 실행 중에는 번들을 바꾸지 않는다. 「다시 시작」은 진행 중인 엔진 작업이 있으면 먼저 확인을 받고, 편집 중인 프로젝트를 저장한다.
- 화면은 사이드바 아래 상태 한 줄(받는 중·준비됨)과 설정 「앱 정보」 카드만 둔다. 실패는 snackbar 로 알린다.
- 릴리스는 `scripts/release.sh <버전>` 이 버전 반영·검증·빌드·서명·공증·업데이트 파일·dmg·태그·GitHub Release 를 한 번에 한다.

## 결과
업데이트 파일은 약 530MB 다. 릴리스 레포가 public 이므로 릴리스 파일은 누구나 받을 수 있다. 빌드에 넣은 키는 배포 파일 안에 함께 들어간다(소스가 private 이어도 같다).

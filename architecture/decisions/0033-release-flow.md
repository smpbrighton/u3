# 0033 두 플랫폼 릴리스 공개 절차

Status: draft
Source: changes/049-windows-build/spec.md, changes/049-windows-build/plan.md

## 맥락
0021은 Mac 빌드와 GitHub Release 공개를 한 번에 실행한다. 같은 버전의 Mac과 Windows를 한 manifest로 배포하려면 최종 공개를 분리해야 한다. 이 결정은 0021의 릴리스 조항과 Windows 키 보관 예외를 보완한다.

## 결정
- `release.sh <버전>`은 버전 commit을 push한 뒤 Mac 검증·빌드·서명·공증을 수행한다. 같은 commit SHA의 자산과 darwin.fragment.json을 draft Release에 올리고 버전 tag를 push한다. 정상 출력은 `✓ release drafted: v<버전>`이다.
- 신뢰하는 tag의 Windows job은 같은 commit을 빌드하고 NSIS 설치·native 검증을 수행한다. 정규화한 installer를 버전에 묶어 minisign 서명한다. Windows 자산과 windows.fragment.json을 같은 draft에 올린다. 재실행은 기존 같은 tag를 대상으로 한다.
- publish job만 두 fragment의 버전·commit·업로드 파일 hash·서명 trusted comment의 버전을 확인하고 latest.json과 SHA256SUMS.txt를 만든다. 두 플랫폼이 모두 성공해야 draft를 latest로 공개한다. 실패하면 이전 latest를 유지한다. 공개 Release의 자산을 교체하지 않는다.
- 긴급 Mac 수정의 예외는 `release.sh --mac-only <버전>`이다. darwin 항목만 든 manifest로 즉시 공개하고 Windows 미포함을 노트에 적는다. 정상 출력은 `✓ release published: v<버전>`이다. Windows는 자기 target이 없는 manifest를 업데이트 없음으로 처리한다.
- Mac의 Developer ID·공증·Keychain updater 키와 기존 공개키를 유지한다. Windows 전용 개인키·암호는 GitHub 보호된 release environment secret에만 둔다. 공개키는 Windows config에만 반영한다. PR에는 개인키를 제공하지 않는다. 키를 로그·artifact·cache에 쓰지 않는다.
- updater는 두 플랫폼에서 payload와 서명된 버전을 확인한다. 편집 저장·작업 확인 뒤 엔진을 종료하고 설치한다. Windows의 다시 시작은 NSIS `/P /UPDATE /R`을 사용한다. 앱 종료는 `/P /UPDATE`로 설치하고 재실행하지 않는다. updater 2.14의 restart_after_install과 on_before_exit 경계로 제어한다. Mac request_restart·Exit 설치를 유지한다.
- 리소스 전용 archive는 resources-<정수> prerelease에만 둔다. 리소스 Release가 releases/latest를 대체하지 않게 한다. 재배포 권리 확인 전에 올리지 않는다.

## 결과
기본 Mac 릴리스 공개가 Windows 검증 성공을 기다린다. Windows 실패 시 draft와 tag가 남는다. 키 등록·리소스 업로드·CI·Windows 11 두 버전 업데이트는 별도 증거가 필요하다. 이 문서의 Status는 사람 검토 전까지 draft다.

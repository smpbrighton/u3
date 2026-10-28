# 0032 앱 구조와 Windows 빌드

Status: accepted
Source: changes/049-windows-build/spec.md, changes/049-windows-build/plan.md
Supersedes: 0025

## 맥락
U3의 빌드·경로·프로세스·키 저장은 macOS Apple Silicon을 전제했다. Windows 11 x64에도 같은 편집 모델과 결과물을 제공한다. Windows 실행 검증은 아직 완료하지 않았다.

## 결정
- Tauri 2 셸, React·Vite·shadcn/Radix·Tailwind UI, Node 엔진을 유지한다. 지원 범위는 macOS 15+ Apple Silicon과 Windows 11 x64다.
- Rust가 resources의 `node` 또는 `node.exe`를 직접 실행한다. `bundle.externalBin`에는 Whisper를 두고 Mac에만 u3-tts를 더한다. Node를 externalBin 셸 런처로 만들지 않는다.
- 엔진은 127.0.0.1 임의 포트·일회용 토큰·허용 Origin을 유지한다. 설치본 Origin은 Mac `tauri://localhost`, Windows `http://tauri.localhost`다. 모든 엔진 자식은 콘솔을 숨긴다. Windows는 Job Object의 KILL_ON_JOB_CLOSE로 엔진과 자식을 정리한다.
- Windows 데이터는 `%LOCALAPPDATA%\ai.brightongroup.u3`에 둔다. 기본 설치 폴더 `%LOCALAPPDATA%\U3`와 분리한다. 제거 시 앱 데이터 삭제는 기본 해제다. Mac 데이터 경로를 유지한다.
- Windows Jev 키는 현재 사용자 DPAPI로 암호화한 `secrets/jev-key.dpapi`에 둔다. Rust helper와 stdin/stdout pipe로 전달한다. 사용자 DACL과 암호문 임시 파일 교체를 적용한다. Mac Keychain을 유지한다. 이 조항은 0024를 보완한다. 배포 엔진 키 검사는 두 플랫폼에 적용한다.
- Windows는 CPU Whisper와 MRX CPU 음성 분리·녹음·음성 가져오기를 제공한다. TTS capability는 false다. 버튼·설정·모델 받기를 숨기며 API도 job·다운로드 전에 거절한다. 기존 음성 재생·내보내기는 유지한다. 0007·0008·0023·0026을 보완한다.
- 공통 라이브러리·색인·MRX·VAD·라이선스는 앱 버전과 분리한 정수 버전 archive로 고정한다. 전체 manifest·SHA-256을 검사한다. 폰트 파일의 정본은 assets/fonts다. bge-m3와 Whisper 모델은 기존 시점에 받는다. 리소스가 없으면 패키징하지 않는다. 이 조항은 0004를 보완한다.
- Windows NSIS는 currentUser와 WebView2 bootstrapper를 쓴다. VC++ runtime이 부족하면 Microsoft 고정 배포본의 hash·서명을 검사하고 설치한다. Windows 앱·installer에는 Authenticode를 적용하지 않는다. 안내는 릴리스 노트와 설치 문서에 둔다.
- Windows 조립·패키징·native 검증은 Windows runner가 맡는다. Mac의 `pnpm package`는 Mac 산출물만 만든다. Windows runner는 workspace·runner temp만 사용한다.

## 결과
Mac UI·TTS·Developer ID·공증 경로를 유지한다. Windows 공개 전 NSIS 설치·제거, native 의존성, Job Object, DPAPI, codex, 업데이트를 Windows 11에서 검증해야 한다. 리소스 재배포 권리·updater 키 등록·실기기 제공은 사용자 소유다. 검증 결과는 변경 049의 plan과 checklist에 기록한다.

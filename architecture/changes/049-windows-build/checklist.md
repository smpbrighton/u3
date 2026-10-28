# Windows 11 실기기 검증

이 문서는 실행 결과를 기록하는 체크리스트다. Windows 실행과 CI는 구현 작업자가 수행하지 않았다. CI의 Windows Server 시험은 Windows 11 실기기 증거를 대신하지 않는다.

| 항목 | 결과 | 기기·OS·메모리 | 확인 날짜 | 증거·측정 |
|---|---|---|---|---|
| GitHub PR verify·package·Windows native 전체 | 미실행 | 미제공 | 미실행 | CI URL·commit SHA 필요 |
| 태그 Windows package·서명·설치·최종 publish | 미실행 | 미제공 | 미실행 | artifact SHA-256·두 fragment·latest 필요 |
| 깨끗한 일반 사용자 Windows 11 x64 설치·실행·제거 | 미실행 | 미제공 | 미실행 | 시스템 Node·Python·ffmpeg·Chrome 없음 |
| WebView2 없음·네트워크 부족·설치 권한 부족 | 미실행 | 미제공 | 미실행 | bootstrapper 성공·실패 확인 |
| VC++ runtime 없음·낡은 버전·UAC 허용/거절 | 미실행 | 미제공 | 미실행 | 고정 hash·Microsoft 서명·실패 안내 확인 |
| 공식 다운로드의 SmartScreen·MOTW 절차 | 미실행 | 미제공 | 미실행 | 추가 정보/실행·차단 해제 유무 기록 |
| Smart App Control·조직 정책 차단 | 미실행 | 미제공 | 미실행 | 보안 기능을 끄지 않고 설치 불가로 기록 |
| 한글·공백 설치·사용자·원본·출력 경로 | 미실행 | 미제공 | 미실행 | 가져오기·저장·재열기·렌더 |
| 기본 데이터 root와 제거의 데이터 삭제 체크박스 | 미실행 | 미제공 | 미실행 | 설치 폴더와 분리·기본 해제·업데이트 유지 |
| 마이크 허용/거절·녹음 형식·음성 가져오기 | 미실행 | 미제공 | 미실행 | WebView2에서 재생·저장 확인 |
| 다크·라이트·시스템 테마·네이티브 배경색 | 미실행 | 미제공 | 미실행 | 실제 RGBA 변환과 테마 전환 |
| Pretendard·G마켓 산스·티몬체 | 미실행 | 미제공 | 미실행 | 시스템 폰트 없이 미리보기·MP4·PNG |
| native codex.exe·npm codex.cmd 탐색·ChatGPT 로그인 | 미실행 | 미제공 | 미실행 | npm shim 해석의 실기기 성공은 추정 |
| 입력 1~20개와 두 대본 방식 | 미실행 | 미제공 | 미실행 | read-only sandbox·오류 원문 확인 |
| 캐러셀 주제·영상 두 방식 | 미실행 | 미제공 | 미실행 | workspace-write·image_generation·PNG·caption.txt |
| 짤·효과음·편집·047 atempo | 미실행 | 미제공 | 미실행 | 047 병합 후 배속 편집까지 확인 |
| bge-m3 받기 전 규칙 점수·모델 받기 | 미실행 | 미제공 | 미실행 | 빈 라이브러리 패키징 금지 확인 |
| Whisper 모델 받기·취소·한국어 CPU STT | 미실행 | 미제공 | 미실행 | 입력 길이·대기 시간·최대 메모리 기록 |
| MRX CPU 음성 분리와 MP4 재생 | 미실행 | 미제공 | 미실행 | 입력 길이·분리 시간·최대 메모리 기록 |
| TTS 화면 숨김·직접 API 거절·기존 음성 재생/내보내기 | 미실행 | 미제공 | 미실행 | job·모델 파일 미생성 |
| Jev 키 저장·교체·삭제·DPAPI 변조 거절·사용자 DACL | 미실행 | 미제공 | 미실행 | 평문·로그·설정 JSON·argv에 키 없음 |
| 일회용 토큰·Origin·drive/UNC/역슬래시 traversal | 미실행 | 미제공 | 미실행 | API와 media 서버에서 모두 거절 |
| 정상 종료·취소·강제 종료 후 프로세스와 파일 잠금 | 미실행 | 미제공 | 미실행 | Node·ffmpeg·Chrome·Whisper·compositor 없음 |
| Windows 두 버전 업데이트와 저장·엔진 종료 순서 | 미실행 | 미제공 | 미실행 | 다시 시작은 새 앱 실행·앱 종료는 실행 없음 |
| 변조 payload·틀린 minisign·서명 버전 불일치 | 미실행 | 미제공 | 미실행 | 모두 설치 거절 |
| 한 플랫폼 실패·fragment/commit/hash 불일치 | 단위 시험 통과 | Mac | plan 실행 기록 참조 | publish-release 테스트·실제 CI는 미실행 |
| 통합 manifest로 기존 0.3.x Mac 설치본 업데이트 | 미실행 | 미제공 | 미실행 | 기존 Mac 공개키·darwin 항목 유지 |

CI 설치 smoke는 RUNNER_TEMP의 한글·공백 설치 경로와 별도 U3_DATA_DIR로 설치된 Node 엔진을 시험한다. Tauri 창·마이크·사용자 기본 Known Folder·SmartScreen·업데이트는 이 시험으로 검증하지 않는다.

권리 확인 전 리소스 archive를 올리지 않는다. Windows updater 키 생성·등록과 리소스 업로드는 사용자 소유 단계다. 0032·0033의 Status는 draft로 남긴다.

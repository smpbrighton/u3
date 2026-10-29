# u3 INTENT

> 제품 수준의 현재 상태 문서다. 변경 요청은 `changes/NNN-slug/intent.md`에 쓴다. 날짜·경위·이력은 쓰지 않는다. 결정의 정본은 `decisions/`다.

## 문제
누구의 어떤 문제를 푸는가. 세 문장 이내.

## 기대 결과
이 제품이 성공이면 무엇이 참인가. 측정 가능하게.

## 영향 범위
사용자, 시스템, 외부 연동. 목록.

## 제약
기술·법·비용·일정. 목록.

## 결정
유효한 결정만, 한 줄 + `decisions/NNNN-slug.md` 링크. 대체된 결정은 여기서 지운다.

- 앱 구조: Tauri 2 셸 + React·shadcn/Tailwind UI(다크·라이트 테마 설정) + resources의 Node 엔진(127.0.0.1·일회용 토큰, Rust가 직접 실행), macOS 15+ Apple Silicon·Windows 11 x64 → [0032](decisions/0032-windows-build.md)
- AI: codex CLI(모델·effort 선택, 기본은 계정 카탈로그에서 고름)와 Jev(짤 적합도 `jev-1.13.0`, 캐러셀 강조 상자 Box `jev-1.14.0`, 키는 사용자가 설정에서 입력해 Mac Keychain·Windows 사용자 DPAPI에 저장)만, Claude 없음 → [0024](decisions/0024-jev-key-setting.md)
- 범위: 입력(영상·사진 섞어 1~20개)·대본·짤·효과음·녹음·TTS 음성·음성 분리·mp4 내보내기·캐러셀(한 대화상자에서 주제·영상 선택, 요청→기획→검토→이미지→편집→받기, 2~10장, 영상 파생은 장면 참고 AI 이미지 기본·원본 장면 전환, PNG+caption.txt), 업로드·채널·허브·움직이는 장 없음 → [0036](decisions/0036-scope-carousel-video-genimage.md)
- TTS: Mac에서 Qwen3-TTS 1.7B CustomVoice 를 Swift 도우미(MLX)로 로컬 실행, 모델은 받기·첫 생성 때 받음, 기본 화자 Sohee, 자막 클립 단위로 목소리 트랙에, 내보내기·음성 분리와 동시 실행 없음 → [0023](decisions/0023-qwen-tts-local.md)
- 캐러셀 이미지·글: codex 내장 image_gen(설정에서 모델·퀄리티·비율 4:5·1:1·9:16·16:9·동시 수)으로 글자 없는 배경, 글은 장당 2~5 객체(위치·폭·폰트·크기·색·정렬·효과)로 앱이 얹음, 로고·밝기·음영 → [0027](decisions/0027-carousel-text-objects.md)
- 라이브러리: 짤·효과음과 짤 색인은 앱에 넣고 bge-m3 는 처음 실행 때 받음, 그 전에는 규칙 점수 → [0004](decisions/0004-bundled-library-lazy-model.md)
- 편집 모델: 자막 레이어 여러 개(메인·서브 두 줄, 레이어 스타일·위치, 폰트 세 가지), 여러 영상 트랙(영상 1 은 본 화면만 빈틈 없음, 짤은 기본으로 영상 2 이상 작은 창), 모든 화면 클립 투명도, 워터마크·타이틀 바(설정 기본값 + 영상별 값), 효과음 트랙 여러 개, `@xzdarcy/react-timeline-editor` + 앱이 만든 자르기·실행 취소 → [0016](decisions/0016-caption-layers-opacity-brand.md), 단축키 기본값·재정의 → [0030](decisions/0030-studio-shortcut-settings.md)
- 자막 클립 재정의·자막 편집기: 클립마다 색·크기 배율·굵게·등장 효과·강조색을 레이어 위에 덮고 `*단어*` 는 강조 표기, 스튜디오 「자막」 탭에서 목록·이전·다음·구간 슬라이더로 편집 → [0028](decisions/0028-caption-clip-style.md)
- 클립 배속: 영상·음성 0.5–2.0배, 영상은 Remotion 재생률, 음성은 원본 보존 atempo WAV, 자막 시각 유지 → [0031](decisions/0031-playback-speed.md)
- 기본 프롬프트: 대본·말투·성격·캐러셀 기획 기본 프롬프트는 GitHub `prompts` prerelease 에서 받아 캐시, 고친 프롬프트는 유지하고 새 기본값만 표시, 실패 시 캐시·앱 내장값, 입력 1초 뒤 자동 저장 → [0035](decisions/0035-remote-default-prompts-voice.md)
- 장면 검토: 자동 생성 클립은 `sceneIndex` 를 갖고 스튜디오 「장면」 탭에서 장면별 짤(후보 5)·효과음을 바꾸거나 빼거나 넣음, 2 대본 뒤 첫 탭 → [0029](decisions/0029-scene-review.md)
- 타이틀 바 내용: 설정에서 글·이미지 기본값, 영상별 재정의, 새 영상에 AI 제목 자동 채움 없음 → [0020](decisions/0020-title-bar-content.md)
- 자동 업데이트: GitHub Releases(`smpbrighton/u3`)의 서명된 업데이트를 받아 다시 시작·종료 때 적용, Mac Developer ID 공증·Windows 전용 minisign, 기본 draft→두 플랫폼 확인→공개·긴급 --mac-only → [0021](decisions/0021-auto-update.md) · [0033](decisions/0033-release-flow.md)
- 자동 생성: 같은 원본의 이어지는 장면은 영상 1 클립 하나, 원본 영상마다 짤 하나 이상(Jev 가 장면 선택, 영상 2), 프로젝트 안 짤 중복 없음 → [0013](decisions/0013-generation-merge-clips-memes.md)
- 소리: 녹음은 웹뷰 MediaRecorder, 음성 분리는 MRX(MIT) int8 ONNX 를 onnxruntime-node CPU EP 로, 결과는 목소리·배경 두 트랙 → [0008](decisions/0008-voice-record-separate-cpu.md)
- 받아 적기: whisper.cpp(Mac Metal·Windows CPU, 정적 빌드) + large-v3-turbo q5_0(사용자가 받기를 고를 때 받음), 한국어 고정, 단어 시각을 클립 구간으로 옮겨 자막 클립, AI 추천 대본 입력에도 씀 → [0007](decisions/0007-whisper-stt.md)

## 열린 질문
아직 결정되지 않은 것. 답이 나오면 `changes/`의 새 intent.md가 된다.

## 지도
변경 `changes/` · 결정 `decisions/` · 이해 `wiki/index.md`

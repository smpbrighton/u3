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

- 앱 구조: Tauri 2 셸 + React UI + Node sidecar 엔진(127.0.0.1·일회용 토큰), macOS Apple Silicon 만 → [0001](decisions/0001-tauri-node-sidecar.md)
- AI: codex CLI(모델·effort 선택, 기본 `gpt-6-luna`)와 Jev(개발자 등록 키를 빌드 때 넣음)만, Claude 없음 → [0009](decisions/0009-codex-model-select-jev.md)
- 범위: 입력(영상·사진 섞어 1~20개)·대본·짤·효과음·녹음·음성 분리·mp4 내보내기, TTS·업로드·채널·허브·캐러셀 없음 → [0003](decisions/0003-core-scope.md)
- 라이브러리: 짤·효과음과 짤 색인은 앱에 넣고 bge-m3 는 처음 실행 때 받음, 그 전에는 규칙 점수 → [0004](decisions/0004-bundled-library-lazy-model.md)
- 편집 모델: 여러 영상 트랙(영상 1 은 본 화면만 빈틈 없음, 짤은 기본으로 영상 2 이상 작은 창, 트랙 사이 이동), 효과음 트랙 여러 개, `@xzdarcy/react-timeline-editor` + 앱이 만든 자르기·실행 취소 → [0012](decisions/0012-overlay-memes-sfx-lanes.md)
- 자동 생성: 같은 원본의 이어지는 장면은 영상 1 클립 하나, 원본 영상마다 짤 하나 이상(Jev 가 장면 선택, 영상 2), 프로젝트 안 짤 중복 없음 → [0013](decisions/0013-generation-merge-clips-memes.md)
- 소리: 녹음은 웹뷰 MediaRecorder, 음성 분리는 MRX(MIT) int8 ONNX 를 onnxruntime-node CPU EP 로, 결과는 목소리·배경 두 트랙 → [0008](decisions/0008-voice-record-separate-cpu.md)
- 받아 적기: whisper.cpp(Metal, 정적 빌드) + large-v3-turbo q5_0(사용자가 받기를 고를 때 받음), 한국어 고정, 단어 시각을 클립 구간으로 옮겨 자막 클립, AI 추천 대본 입력에도 씀 → [0007](decisions/0007-whisper-stt.md)

## 열린 질문
아직 결정되지 않은 것. 답이 나오면 `changes/`의 새 intent.md가 된다.

## 지도
변경 `changes/` · 결정 `decisions/` · 이해 `wiki/index.md`

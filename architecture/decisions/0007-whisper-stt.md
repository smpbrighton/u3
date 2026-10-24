# 0007 받아 적기: whisper.cpp

Status: accepted
Source: changes/001-desktop-studio/spec.md

## 맥락
원본 소리와 녹음에 말소리가 있다. 사용자는 말소리로 자막을 만들고, AI 대본이 영상에서 하는 말을 알기를 원한다. 앱에는 Python 런타임이 없다.

## 결정
- sidecar 가 whisper.cpp(MIT)의 `whisper-cli` 를 부른다. 빌드 단계에서 `cmake -DBUILD_SHARED_LIBS=OFF` 로 정적 빌드하고 Metal 셰이더를 내장한다.
- 모델은 `ggml-large-v3-turbo-q5_0.bin`(MIT, 574 MB)이다. 앱에 넣지 않는다. 사용자가 「자막 만들기」를 처음 누르거나 설정에서 받기를 누를 때만 받는다.
- 언어는 한국어로 고정한다. 단어 시각은 `-ml 1 -sow` 로 받고, 입력 기준 시각을 클립 구간으로 옮긴다. 자막은 uUu `buildCaptionChunks`(측정 폭, 2줄 이내)로 나눈다.
- 음성 분리를 한 입력은 목소리 트랙을 받아 적는다.
- AI 추천 대본은 받아 적은 말소리를 프레임과 함께 codex 에 넘긴다. 모델이 없거나 받아 적기가 실패·지연되면 그 영상은 프레임만 넘긴다.

## 결과
단어 시각은 실험 기능이라 plan 의 스파이크로 확인한다. 어긋나면 문장 시각을 글자 수로 나눈다.

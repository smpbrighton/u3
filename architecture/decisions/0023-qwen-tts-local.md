# 0023 TTS: Qwen3-TTS 로컬 실행(Swift 도우미)

Status: accepted
Source: changes/040-qwen-tts/spec.md

## 맥락
앱에는 Python 런타임이 없다(0007·0008). Qwen3-TTS 는 1.7B 와 0.6B 를 공개했다. 한국어 프리셋 화자 WER 은 1.7B CustomVoice 가 1.741, 0.6B CustomVoice 가 3.053 이다(QwenLM/Qwen3-TTS README). swift-qwen3-tts(MIT)는 MLX Swift 로 Qwen3-TTS 를 돌린다.

## 결정
- sidecar 가 Swift 도우미 `u3-tts` 를 부른다. `u3-tts` 는 swift-qwen3-tts 를 감싼다. `u3-tts` 는 `Contents/MacOS` 에, `default.metallib` 는 `Contents/Resources` 에 둔다(0021).
- 모델은 Qwen3-TTS-12Hz-1.7B-CustomVoice 다. 앱에 넣지 않는다. 사용자가 설정에서 받기를 누르거나 처음 음성 만들기를 누를 때 받는다.
- 기본 화자는 Sohee 다. 설정에서 프리셋 화자와 말투 지시 한 줄을 바꾼다.
- 음성은 첫 자막 레이어의 메인 자막 클립 단위로 만들고 목소리 트랙의 자막 클립 시작 시각에 놓는다. 자막 클립과 장면 길이는 바꾸지 않는다. 클립은 생성이 끝난 뒤 UI 가 넣는다.
- TTS·내보내기·음성 분리는 동시에 돌지 않는다.
- 목소리 복제(Base 모델)는 쓰지 않는다.

## 결과
스파이크 S1(`docs/spikes/qwen-tts.md`)을 통과했다. 모델은 mlx-community `Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit` 다. 모델 레포에 `tokenizer.json` 이 없어서, 빌드 때 원본 토크나이저 파일로 만든 `tokenizer.json` 을 앱 리소스에 넣는다. `u3-tts` 는 MLX 캐시 한도 256MB 로 돈다(6장면 19.3초, peak footprint 6.4 GiB). 사용자는 음질을 "아주 자연스럽지는 않지만 쓸 수 있다"고 판정했다.

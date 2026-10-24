# 0006 소리: 녹음과 음성 분리

Status: accepted
Source: changes/001-desktop-studio/spec.md

## 맥락
사용자는 영상에 목소리를 녹음해 넣고, 원본 소리에서 목소리와 배경을 따로 조절하려 한다. 앱에는 Python 런타임이 없다.

## 결정
- 녹음은 웹뷰의 `getUserMedia` + `MediaRecorder` 로 한다. 형식은 `audio/mp4` 를 먼저 쓰고 `isTypeSupported` 로 고른다. 파형은 wavesurfer.js v8(BSD-3)로 그린다.
- 앱 번들에 `NSMicrophoneUsageDescription` 과 `com.apple.security.device.audio-input` 을 넣는다.
- 음성 분리는 sidecar 의 onnxruntime-node(CoreML EP, 그다음 CPU)로 MRX(코드·가중치 MIT, int8 약 31 MB)를 돌린다. 대사는 목소리, 음악과 효과의 합은 배경이 된다.
- 분리 결과는 입력별로 `stems/` 에 두고, 분리 되돌리기로 원본 소리 트랙에 돌아간다.
- Demucs 는 가중치가 연구용 라이선스라 쓰지 않는다.

## 결과
분리 속도와 품질은 공개 수치가 없어 plan 의 스파이크로 확인한다. 녹음은 서명한 빌드에서 확인한다.

# 0008 소리: 녹음과 음성 분리(CPU 실행)

Status: accepted
Source: changes/001-desktop-studio/plan.md
Supersedes: 0006

## 맥락
사용자는 영상에 목소리를 녹음해 넣고, 원본 소리에서 목소리와 배경을 따로 조절하려 한다. 앱에는 Python 런타임이 없다. 스파이크 S2(`docs/spikes/mrx.md`)에서 MRX int8 ONNX 를 60초 클립 3개로 쟀다. CoreML EP 는 34~90초가 걸리고 최대 메모리가 13~15 GB 였다. CPU EP 는 19초가 걸리고 최대 메모리가 6.4 GB 였다.

## 결정
- 녹음은 웹뷰의 `getUserMedia` + `MediaRecorder` 로 한다. 형식은 `audio/mp4` 를 먼저 쓰고 `isTypeSupported` 로 고른다. 파형은 wavesurfer.js v8(BSD-3)로 그린다.
- 앱 번들에 `NSMicrophoneUsageDescription` 과 `com.apple.security.device.audio-input` 을 넣는다.
- 음성 분리는 sidecar 의 onnxruntime-node CPU EP 로 MRX(코드·가중치 MIT)를 돌린다. CoreML EP 는 쓰지 않는다. 모델은 공식 가중치에서 STFT·ISTFT 를 뺀 신경망 부분을 ONNX 로 내보내 int8 로 바꾼 파일(약 31 MB)이다. STFT·ISTFT 는 sidecar 가 계산한다. 메모리를 줄이려고 입력을 구간으로 나눠 처리한다.
- 대사는 목소리, 음악과 효과의 합은 배경이 된다.
- 분리 결과는 입력별로 `stems/` 에 두고, 분리 되돌리기로 원본 소리 트랙에 돌아간다.
- Demucs 는 가중치가 연구용 라이선스라 쓰지 않는다.

## 결과
60초 입력의 분리 시간은 Apple M4 CPU 에서 약 19초다. 청취 품질은 수동 확인 항목으로 남는다. 녹음 파일 길이는 녹음기 타이머와 다를 수 있어서 클립 길이는 디코드한 실제 길이를 쓴다(`docs/spikes/mic.md`).

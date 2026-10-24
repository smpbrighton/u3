# 마이크 녹음 스파이크 (S4)

## 측정 명령

```sh
cd spikes/mic
pnpm install --frozen-lockfile
pnpm exec tauri build
ditto "src-tauri/target/release/bundle/macos/U3 Mic Spike.app" "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/U3 Mic Spike.app"
open -n "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/U3 Mic Spike.app"
sleep 2
screencapture -x /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/tcc-screen.png
sleep 30
cat /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/result.json
codesign -d --entitlements - "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/U3 Mic Spike.app"
find /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic -maxdepth 1 -name 'recording.*' -exec ffprobe -v error -show_format -show_streams {} \;
ffmpeg -hide_banner -i /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/recording.m4a -af volumedetect -f null -
```

이 실험 앱은 시작할 때 형식 다섯 개를 검사하고, 첫 지원 형식을 골라 `getUserMedia` 로 5초를 녹음한다. `write_capture` 와 `write_result` Tauri 명령이 캐시 폴더에 데이터를 쓴다. 아래 두 명령은 결과 파일을 직접 다시 측정할 때 쓴다.

```sh
ffprobe -v error -show_entries format=duration,format_name -show_entries stream=codec_name,codec_type,sample_rate,channels -of json /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/recording.m4a
ffmpeg -hide_banner -i /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/recording.m4a -af volumedetect -f null -
```

## 환경

- macOS 27.0.1 (26A434), Apple Silicon arm64
- Node v24.13.0, pnpm 10.28.2, Rust 1.98.0, Cargo 1.98.0
- Xcode 27.1 (Build 27A9275), Tauri CLI 2.12.4, ffprobe 8.1.1
- 공용 미디어 클립은 사용하지 않았다. 이 스파이크는 마이크 녹음을 측정한다.

## 결과

- `pnpm exec tauri build`: 성공. `U3 Mic Spike.app` ad-hoc 서명 빌드를 만들었다.
- `codesign -d --entitlements - ...`: `com.apple.security.device.audio-input` 값이 `true`다.
- 앱 `Info.plist`: `NSMicrophoneUsageDescription` 값은 `마이크 스파이크에서 5초 녹음 검증을 수행합니다.`다.
- 앱 번들 식별자: `ai.brightongroup.u3.mic-spike`. 서명은 `adhoc` 이고 TeamIdentifier 는 설정되지 않았다.
- 앱은 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic/` 로 복사해 `open -n` 으로 실행했다.
- `result.json`: `audio/mp4` true, `audio/mp4;codecs=mp4a.40.2` true, `audio/webm` true, `audio/webm;codecs=opus` true, `audio/wav` false. 선택 형식은 `audio/mp4`, 녹음기 측정 길이는 5013 ms, 오류는 `null`이다.
- `ffprobe`: MP4/M4A 컨테이너, AAC 코덱, 48000 Hz, mono, 파일 길이 3.628 s (3.63 s).
- `ffmpeg -af volumedetect`: mean volume -51.1 dB, max volume -21.3 dB.
- 녹음기 측정 길이 5.013 s (5.01 s)와 디코드 파일 길이 3.628 s (3.63 s)의 차이는 1.385 s (1.39 s)다. 녹음 시작 전 마이크 활성화 지연과 `MediaRecorder.start()`에 timeslice 를 주지 않은 점을 원인 후보로 둔다. 원인은 확정하지 않았다.
- `tcc-screen.png` 는 전체가 검게 나왔다. 조정자는 결과가 기록되어 마이크 권한이 허용된 사실을 확인했지만, 권한 창이 실제로 표시됐는지와 앱 이름으로 표시됐는지는 확인하지 못했다. 검은 캡처가 셸의 화면 기록 권한 때문인지는 추정이며 확인하지 못했다.
- `tccutil` 로 권한 상태를 바꾸지 않았다.

## 판정

**go (조건: 1.39 s 길이 차이를 W7c Recorder 에서 처리)**. 서명 빌드에서 `audio/mp4` 지원과 녹음 파일 생성을 확인했다. W7c 에서는 클립 길이를 타이머 요청값이 아니라 디코드한 실제 파일 길이로 쓴다. 녹음 시작 시각은 `MediaRecorder`의 `start` 이벤트 뒤에 잡는다. timeslice 를 설정해 파일 길이를 다시 잰다. 이 측정만으로 1.39 s 차이의 원인은 확정하지 않는다.

권한 요청은 결과가 기록된 것으로 보아 허용 상태였지만, TCC 창이 앱 이름으로 표시됐는지는 확인하지 못했다. 권한 표시 정책은 이번 측정으로 변경하지 않는다.

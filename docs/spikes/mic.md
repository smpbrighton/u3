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
```

이 실험 앱은 시작할 때 형식 다섯 개를 검사하고, 첫 지원 형식을 골라 `getUserMedia` 로 5초를 녹음한다. `write_capture` 와 `write_result` Tauri 명령이 캐시 폴더에 데이터를 쓴다. 현재 실행에서는 `result.json` 이 생기지 않았으므로 마지막 두 명령은 결과를 만들지 못한다.

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
- 실행 후 30초 기다렸다. 화면 캡처 `tcc-screen.png` 는 전체가 검게 나와 TCC 권한 창의 출현 여부를 읽을 수 없다.
- 캐시 폴더에 `result.json` 과 녹음 파일이 없다. 지원 형식, 선택 MIME 형식, 녹음 길이, 오류, 컨테이너·코덱은 확인하지 못했다. ffprobe 측정도 하지 못했다.
- `tccutil` 로 권한 상태를 바꾸지 않았다.

## 판정

**no-go (측정 증거 부족)**. 서명 빌드와 마이크 entitlement 는 확인했다. 앱 이름으로 표시된 TCC 창, 형식 지원 여부, 5초 녹음 파일은 확인하지 못했다. 캡처 화면이 검고 결과 JSON 도 없어서 권한 요청과 녹음이 완료됐다고 판정할 근거가 없다.

원인은 이 실행 환경에서 TCC 창을 관찰할 수 없고 앱 결과 파일도 생성되지 않은 점이다. spec 의 마이크 정책 변경은 제안하지 않는다. 상호작용 가능한 macOS 세션에서 동일한 서명 빌드를 실행하고, 사람이 권한 창에서 허용한 뒤 JSON 과 파일을 확인해야 한다. 이 확인 전에는 `0006`의 녹음 결정을 구현 전제 조건으로 승인하지 않는다.

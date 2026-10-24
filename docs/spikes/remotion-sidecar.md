# S1: Remotion sidecar

## 목적과 판정

**판정: GO — 방식 B(Node 바이너리 + JS 번들 리소스).** Ad-hoc 서명한 Tauri `.app`을 레포 밖 캐시로 복사했다. macOS에 Node를 설치하지 않은 조건에서 `open`으로 앱을 시작했다. 앱이 번들 Node, Chrome Headless Shell, Remotion compositor를 사용해 H.264/AAC mp4를 만들었다. 앱 안의 sidecar를 `env -i`로 직접 실행해 같은 결과를 확인했다.

composition은 3초(90프레임), 1080×1920, 30fps다. 화면에는 `U3` 글자를 표시하고 660 Hz 톤을 재생한다. 이 합성 클립은 코드 경로 검증용이며 실제 숏폼 원본이 아니다. 공용 미디어 README에 기록된 실제 숏폼 대체 클립은 이 렌더 측정에는 쓰지 않았다.

## 환경

- macOS 27.0.1 (26A434), Apple Silicon arm64
- 개발 셸 Node.js v24.13.0, pnpm 10.33.0, Rust 1.98.0
- 앱에 번들한 Node.js 공식 배포본: v24.13.0 `darwin-arm64`
- Tauri CLI 2.12.4, Tauri Rust 2.12.5
- Remotion `remotion`, `@remotion/bundler`, `@remotion/renderer`: 모두 4.0.529 (uUu와 동일)
- 렌더러 compositor: `@remotion/compositor-darwin-arm64` 4.0.529
- 빌드한 앱은 `codesign` ad-hoc 서명이다. 공증은 하지 않았다.

## 재현 명령

레포 루트에서 실행한다. 빌드 의존성, Chrome 다운로드, Tauri 산출물과 렌더 결과는 레포 밖 캐시에 둔다. Chrome은 Remotion `ensureBrowser()`가 처음 빌드할 때 받는다. 받은 Chrome은 `.app` 리소스에 복사한다.

```sh
cd spikes/remotion-sidecar
npm ci
SPIKE_CACHE=/Volumes/X31/workspace/smp_workspace/u3-spike-cache/remotion-sidecar
mkdir -p "$SPIKE_CACHE/node"
curl -fL https://nodejs.org/dist/v24.13.0/node-v24.13.0-darwin-arm64.tar.gz \
  -o "$SPIKE_CACHE/node/node-v24.13.0-darwin-arm64.tar.gz"
tar -xzf "$SPIKE_CACHE/node/node-v24.13.0-darwin-arm64.tar.gz" -C "$SPIKE_CACHE/node"
U3_NODE_BINARY="$SPIKE_CACHE/node/node-v24.13.0-darwin-arm64/bin/node" \
  npm run tauri -- build
ditto src-tauri/target/release/bundle/macos/RemotionSidecarSpike.app \
  "$SPIKE_CACHE/RemotionSidecarSpike-installed.app"
env -i HOME=/tmp PATH=/usr/bin:/bin \
  open -n "$SPIKE_CACHE/RemotionSidecarSpike-installed.app"
```

앱 시작 후 `/tmp/u3-remotion-sidecar-result.mp4.done` 파일이 생기면 렌더가 끝난 것이다. `env -i`로 번들 sidecar를 직접 확인하려면 다음 명령을 쓴다.

```sh
env -i HOME=/tmp PATH=/usr/bin:/bin \
  U3_SPIKE_OUTPUT="$SPIKE_CACHE/direct-installed.mp4" \
  "$SPIKE_CACHE/RemotionSidecarSpike-installed.app/Contents/MacOS/remotion-sidecar"
```

ffprobe로 출력 스트림을 읽는다.

```sh
ffprobe -v error -show_entries format=duration \
  -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels \
  -of json /tmp/u3-remotion-sidecar-result.mp4
```

앱과 번들 구성 크기는 다음 명령으로 잰다.

```sh
du -sh "$SPIKE_CACHE/RemotionSidecarSpike-installed.app"
du -sh "$SPIKE_CACHE/RemotionSidecarSpike-installed.app/Contents/Resources/resources"/*
```

## 측정 결과

| 항목 | 결과 |
|---|---:|
| 설치 앱에서 sidecar 렌더 시간 | 2,118 ms |
| 번들 sidecar 직접 실행 렌더 시간 (`env -i`) | 1,721 ms |
| MP4 길이 | 3.050667 s |
| 비디오 | H.264, 1080×1920, 30/1 fps |
| 오디오 | AAC, 48 kHz, 2채널 |
| `.app` 크기 | 941.10 MiB (디스크 사용량 975 MiB) |
| 번들 Node runtime | 112 MiB, `Contents/Resources/resources/node` |
| Chrome Headless Shell | 193 MiB, `Contents/Resources/resources/chrome-headless-shell/` |
| Remotion compositor | 약 18 MiB, `Contents/Resources/resources/node_modules/@remotion/compositor-darwin-arm64/` |
| JS 번들 및 public asset | 27 MiB, `Contents/Resources/resources/remotion-bundle/` |
| renderer와 종속 패키지 | 630 MiB, `Contents/Resources/resources/node_modules/` 전체 복사 기준 |

Chrome은 **첫 빌드에서 다운로드했다**. Remotion은 `https://storage.googleapis.com/chrome-for-testing-public/149.0.7790.0/mac-arm64/chrome-headless-shell-mac-arm64.zip`에서 93.5 MB 압축 파일을 받았다. 이후 Chrome Headless Shell 디렉터리를 앱 리소스에 넣었다. 앱은 `selectComposition()`과 `renderMedia()` 모두에 번들된 `browserExecutable` 경로를 전달했다. 설치 앱 렌더 로그에는 다운로드가 없었다.

Compositor의 `ffmpeg`, `ffprobe`, `remotion` 실행 파일과 관련 dylib는 npm 패키지 `@remotion/compositor-darwin-arm64` 안에 있다. 이 실험은 `node_modules` 전체를 리소스에 복사해 위치를 확인했다. 이 방식은 동작하지만 630 MiB를 차지한다. W8 `build-engine.ts`는 production 의존성만 staging 디렉터리에 설치하고 Remotion renderer가 요구하는 패키지와 플랫폼 compositor만 포함해 크기를 줄여야 한다.

## W8 `build-engine.ts` 절차

1. Node.js 공식 `darwin-arm64` 배포본에서 Node runtime을 가져온다. Homebrew Node를 복사하지 않는다. 이 환경의 Homebrew Node는 Homebrew dylib에 의존했다. 공식 바이너리는 macOS 시스템 라이브러리만 참조했다.
2. 엔진 JavaScript를 Node 호환 번들로 만든다. 번들과 Node runtime을 Tauri resources에 복사한다.
3. Remotion 4.0.529의 production 의존성을 staging 디렉터리에 설치한다. `@remotion/compositor-darwin-arm64`를 포함하고 `otool -L`로 앱 외부 라이브러리 의존을 확인한다.
4. 빌드 시 Remotion `ensureBrowser()`를 호출한다. Chrome Headless Shell이 없으면 한 번 다운로드한다. 그 디렉터리와 실행 파일 경로 manifest를 Tauri resources에 넣는다.
5. 아키텍처 접미사를 붙인 `src-tauri/binaries/u3-engine-aarch64-apple-darwin` launcher를 만든다. launcher는 `.app/Contents/MacOS`에서 `../Resources/resources`를 계산해 번들 Node와 JS 번들을 실행한다.
6. Tauri 설정의 `bundle.externalBin`에 launcher를, `bundle.resources`에 Node, JS 번들, Chrome Headless Shell, Remotion 의존성을 둔다. 앱 시작 코드가 sidecar를 시작하고 결과 경로를 파일로 남긴다.
7. ad-hoc `.app`을 캐시로 복사한다. Node가 없는 `PATH` 조건에서 `open` 실행과 sidecar 직접 실행을 확인하고, ffprobe로 영상·오디오를 검사한다.

현재 S1 구현은 이 절차를 별도 spike 앱에서 입증했다. 앱 본체인 `src-tauri/`와 루트 package 설정은 수정하지 않았다.

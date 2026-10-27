# Qwen3-TTS S1 스파이크

## 결과

S1에서 중단했다. 1.7B CustomVoice bf16의 로드가 `Required configuration file missing: tokenizer.json`으로 실패했다. 6장면 생성과 60초 기준은 판정하지 못했다. 사용자 지시의 중단 조건에 따라 8bit·0.6B 로드를 시도하지 않았다. WAV는 생성되지 않았다. 순서 3의 사용자 청취 게이트와 앱 통합은 진행하지 않았다.

Swift 도우미와 Metal shader 빌드는 통과했다. 시스템 밖 dylib 의존은 없다. 모델별 결과는 다음과 같다.

| 모델 | 로드 | 6장면 전체 생성 시간 | 최대 RSS(`/usr/bin/time -l`) | 60초 기준 |
|---|---|---|---|---|
| 1.7B CustomVoice bf16 | 실패: `tokenizer.json` 없음 | 미측정. 로드 실패까지 4.47초 | 로드 시도 중 2,102,771,712 bytes(1.958 GiB) | 판정 불가 |
| 1.7B CustomVoice 8bit | 미시도: bf16 로드 실패로 중단 | 미측정 | 미측정 | 판정 불가 |
| 0.6B CustomVoice bf16 | 미시도: bf16 로드 실패로 중단 | 미측정 | 미측정 | 판정 불가 |

4.47초는 음성 생성 시간이 아니다. 실패한 프로세스의 종료 코드는 1이다. 같은 실행의 `peak memory footprint`는 3,851,701,632 bytes(3.587 GiB)였다. 이 값과 최대 RSS는 서로 다른 지표다. 생성 중 메모리와 6 GiB 이상 여유 메모리 조건은 확인하지 못했다.

## 환경과 Metal Toolchain

- 측정일은 2026-10-27이다. Mac은 Apple M6, 메모리 24 GiB, macOS 27.0.1(26A434)이다.
- Swift는 6.4이고, Swift 패키지의 최소 macOS 버전은 15.0이다.
- 처음 실행한 `xcrun metal --version`은 다음 오류로 실패했다.

```text
error: error: cannot execute tool 'metal' due to missing Metal Toolchain; use: xcodebuild -downloadComponent MetalToolchain
```

지정된 캐시 환경 변수를 붙여 `xcodebuild -downloadComponent MetalToolchain`을 실행했다. 관리자 권한 요청 없이 종료 코드 0으로 끝났다. 설치 출력은 다음과 같다.

```text
Downloaded asset to: /System/Library/AssetsV2/com_apple_MobileAsset_MetalToolchain/389a215aea89fda945178f9fb8bcdc6aa0e20570.asset/AssetData/Restore/022-20184-410.dmg
Done downloading: Metal Toolchain 27A266a.
```

`xcrun --find metal`로 확인한 활성 실행 파일 위치는 다음과 같다. Cryptex 마운트 경로는 시스템 상태에 따라 바뀐다.

```text
/var/run/com.apple.security.cryptexd/mnt/com.apple.MobileAsset.MetalToolchain-v27.1.266.1.7T8SRR/Metal.xctoolchain/usr/bin/metal
```

설치 후 `xcrun metal --version`은 종료 코드 0이고 `Apple metal version 32023.921 (metalfe-32023.921.6)`을 출력했다. Toolchain은 개발 도구 설치본으로 시스템 위치에 설치됐다. 모델·Swift 빌드·실험 로그는 X31에 두었다.

## 코드와 라이선스

| 의존성 | 고정 revision | 라이선스 근거 |
|---|---|---|
| [AtomGradient/swift-qwen3-tts](https://github.com/AtomGradient/swift-qwen3-tts/tree/27a5b5b2c5d55258bead2c6e851208987e1ca225) | `27a5b5b2c5d55258bead2c6e851208987e1ca225` | 해당 revision의 README 「License」가 MIT를 명시한다. 별도 LICENSE 파일은 없다. |
| [ml-explore/mlx-swift](https://github.com/ml-explore/mlx-swift/tree/072b684acaae80b6a463abab3a103732f33774bf) 0.29.1 | `072b684acaae80b6a463abab3a103732f33774bf` | MIT |
| [huggingface/swift-transformers](https://github.com/huggingface/swift-transformers/tree/a2e184dddb4757bc943e77fbe99ac6786c53f0b2) 1.0.0 | `a2e184dddb4757bc943e77fbe99ac6786c53f0b2` | tokenizer 로드 구현을 확인한 의존성이다. |

`native/u3-tts/Package.swift`가 TTS 라이브러리 revision과 MLX 버전을 고정한다. `Package.resolved`는 전이 의존성도 고정한다. 라이브러리 API는 `Models/Qwen3.swift`, `Models/Qwen3+Streaming.swift`, `Core/AudioUtils.swift`에서 확인했다.

`scripts/build-tts.sh`는 SwiftPM의 scratch·공용 캐시·설정·보안 경로와 module cache를 `U3_BUILD_CACHE` 아래에 둔다. 빌드에는 `--force-resolved-versions`를 쓴다. SwiftPM CLI의 native build system으로 실행 파일을 만들고, 동일 MLX checkout의 CMake `mlx-metallib` target으로 shader를 만든다. Python 바인딩은 빌드하지 않는다.

Metal 27에서 MLX 0.29.1의 `fence.metal` 컴파일은 `no member named 'thread_scope_system' in namespace 'metal'`로 실패했다. 이 소스의 fallback 선언은 `__METAL_MEMORY_SCOPE_SYSTEM__`이 없을 때만 동작한다. `-U__METAL_MEMORY_SCOPE_SYSTEM__`을 붙인 컴파일이 통과했다. 빌드 스크립트는 이 옵션으로 `fence.air`를 먼저 만든다. 의존성 소스는 고치지 않는다.

## 받은 모델

모든 모델은 MLX 형식이다. 모델 카드와 Hugging Face API의 파일 목록·revision·라이선스를 확인했다. 각 레포에서 `.gitattributes`를 제외한 13개 파일을 고정 revision URL로 받았다. 레포의 파일 목록에 없는 `tokenizer.json`은 추가하지 않았다.

| 모델 | Hugging Face 레포 | 고정 revision | 라이선스 | 받은 파일 합계 |
|---|---|---|---|---|
| 1.7B bf16 | [mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/tree/52f4770fd9726457eae3d3b6aa92047a25a10776) | `52f4770fd9726457eae3d3b6aa92047a25a10776` | Apache-2.0 | 4,520,194,094 bytes |
| 1.7B 8bit | [mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit/tree/41d3337e8b7f2843a75841595fc14e4b9a7a4b96) | `41d3337e8b7f2843a75841595fc14e4b9a7a4b96` | Apache-2.0 | 3,080,140,019 bytes |
| 0.6B bf16 | [mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16/tree/6415d95f88be018ff9e46813119dc3bc12261328) | `6415d95f88be018ff9e46813119dc3bc12261328` | Apache-2.0 | 2,498,417,886 bytes |

파일 합계는 레포 파일만 포함한다. 로컬 출처 기록 `source.json`은 제외한다. 각 모델 폴더는 `/Volumes/X31/.cache/u3/models-spike/<표의 레포 마지막 이름>/`이다. API 원문은 `/Volumes/X31/.cache/u3/build/040-<모델 이름>.json`에 남겼다. 가중치는 커밋하지 않았다.

## 로드 실패 원인

확인한 호출 순서는 다음과 같다.

1. `Qwen3TTSModel.fromPretrained`가 config와 safetensors를 읽는다.
2. 모델 parameter update와 `eval(model)`을 실행한다.
3. `postLoadHook`이 `AutoTokenizer.from(modelFolder:)`를 부른다.
4. swift-transformers 1.0.0의 `Sources/Hub/Hub.swift:260`이 `tokenizer.json` 존재를 검사한다.
5. 파일이 없으므로 `configurationMissing("tokenizer.json")`을 던진다.

bf16의 stdout은 다음 두 JSON 이벤트만 포함한다. `loaded` 이벤트는 없다. 오류는 stderr에도 기록했다.

```json
{"event":"loading","metallib":"/Volumes/X31/.cache/u3/tts-spike/U3TTS-spike.app/Contents/Resources/tts/default.metallib","model":"/Volumes/X31/.cache/u3/models-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16"}
{"event":"error","message":"Required configuration file missing: tokenizer.json"}
```

세 MLX 레포는 모두 `tokenizer_config.json`, `vocab.json`, `merges.txt`를 제공하지만 `tokenizer.json`은 제공하지 않는다. 원본 [Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/tree/0c0e3051f131929182e2c023b9537f8b1c68adfe)도 revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`에서 같은 파일 구성을 가진다. 원본 레포의 API 기록은 `040-hf-original.json`에 두었다.

이번에 확인한 원인은 모델 배포 파일과 Swift tokenizer의 입력 형식 불일치다. 1.7B의 tensor 구조 자체가 지원되지 않는다는 증거는 얻지 못했다. 8bit·0.6B도 같은 파일 누락 조건을 가진다. 두 모델의 실제 로드 실패 여부는 미검증이다. 0.6B로 바꾸는 것만으로 원인을 해결한다고 판단할 근거는 없다.

재개하려면 별도 작업에서 `vocab.json`·`merges.txt`와 동등한 Swift tokenizer 입력을 마련하고 token id 일치를 검증해야 한다. 이번 작업에서는 tokenizer를 변환하거나 의존성을 교체하지 않았다. Python 런타임도 추가하지 않았다.

## 입력과 측정 방법

화자는 `Sohee`, 언어는 `korean`, `instruct`는 빈 문자열이다. 라이브러리의 기본 sampling 설정을 썼고 MLX seed는 0이다. 모델 한 번 로드 후 항목을 순서대로 생성하는 인터페이스다. 음성 저장은 라이브러리의 `saveAudioArray`를 쓴다. JSONL은 원래 stdout descriptor로 쓰며 라이브러리의 일반 출력은 stderr로 보낸다.

대본은 `src/core/script-prompt.ts`의 예시 1에서 추출한 다음 6장면이다. 훅 제목은 별도 항목으로 넣지 않았다. 계획은 이 대본을 30초 분량으로 부르지만 실제 음성 길이는 측정하지 못했다.

1. 우리 남편 세차에 진짜 미친 사람이거든. 주말마다 세차장 출근 도장 찍어.
2. 근데 요즘 세차장을 한 번도 안 가는 거야. 차는 오히려 더 깨끗한데?
3. 이상해서 차를 싹 뒤져 봤지. 트렁크 구석에서 이게 나오더라.
4. 정체는 무선 핸디 청소기였어. 손바닥만 한데 선이 없어.
5. 시트 틈에 쑥 넣으니까 부스러기가 순식간에 싹 빨려 들어가는 거 있지?
6. 요즘 차 있는 집은 이거 하나씩 다 있대. 다음 주에 내 차 글로브박스에도 하나 들어갔잖아! 너는 차에 이런 거 몰래 쟁여 둔 적 있어?

측정 직전 캐시 환경 변수를 붙여 `pgrep -fl vitest`를 실행했다. 출력이 없고 종료 코드는 1이었다. 이 워크트리의 검증과 모델 다운로드도 끝난 뒤 로드를 시도했다.

실행 명령은 다음과 같다. 시작 폴더는 `/Volumes/X31/.cache/u3/tts-spike/U3TTS-spike.app/Contents/MacOS`였다. 요청의 모델·출력 폴더는 절대 경로다.

```sh
TMPDIR=/Volumes/X31/.cache/u3/tmp \
CARGO_HOME=/Volumes/X31/.cache/cargo \
U3_BUILD_CACHE=/Volumes/X31/.cache/u3/build \
HOMEBREW_CACHE=/Volumes/X31/.cache/homebrew \
XDG_CACHE_HOME=/Volumes/X31/.cache/u3/build/xdg-cache \
HF_HOME=/Volumes/X31/.cache/u3/models-spike/huggingface HF_HUB_OFFLINE=1 \
/usr/bin/time -l ./u3-tts --metallib ../Resources/tts/default.metallib \
  < /Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/request.json \
  > /Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/events.jsonl \
  2> /Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/time.log
```

표준 입력 JSON의 필드는 `model`, `speaker`, `instruct`, `items: [{id, text}]`, `outDir`이다. 항목 id는 영문·숫자·밑줄·하이픈을 허용하고 중복을 거부한다. 정상 생성의 설계 출력은 `<id>.wav`(24 kHz mono)다. 이벤트는 `loading`, `loaded`, `itemStarted`, `progress`, `itemDone`, `done`, `error`다. 실제 WAV 출력과 정상 종료 이벤트는 로드 실패 때문에 미검증이다.

## metallib 위치와 링크

실험용 번들에서 파일을 다음과 같이 나눴다.

```text
/Volumes/X31/.cache/u3/tts-spike/U3TTS-spike.app/Contents/
  MacOS/u3-tts
  MacOS/u3
  Resources/tts/default.metallib
```

`u3`는 실행 파일 검사 스크립트의 필수 이름을 맞추기 위해 복사한 동일 도우미다. 이 번들은 실제 Tauri 앱이 아니다. `scripts/check-macos-executables.sh`는 이 번들에서 종료 코드 0이다. `Contents/MacOS`에는 Mach-O만 있다.

MLX 0.29.1의 `Source/Cmlx/mlx/mlx/backend/metal/device.cpp:110`에는 기본 library 경로를 바꾸는 인자나 환경 변수 처리가 없다. 마지막 탐색 대상은 빌드 시 정의한 `METAL_PATH="default.metallib"`다. 도우미는 `--metallib`의 상대 경로를 먼저 절대 경로로 바꾸고, 모델 초기화 전에 그 파일의 폴더로 이동한다. 따라서 이 버전은 `default.metallib`라는 파일 이름을 요구한다. 앱 통합 때는 별도 프로세스인 도우미에만 이 작업 폴더 변경이 적용된다.

해당 Resources 경로로 실행했을 때 기본 metallib 탐색 오류 없이 tokenizer 초기화까지 진행했다. 별도의 Metal API 진단은 같은 파일을 `MTLDevice.makeLibrary(URL:)`로 열어 다음 결과를 냈다.

```text
device=Apple M6 metallib=/Volumes/X31/.cache/u3/tts-spike/U3TTS-spike.app/Contents/Resources/tts/default.metallib functions=311
```

Resources의 파일 읽기는 확인했다. 전체 TTS 생성에서 shader가 정상 동작하는지는 미검증이다. 진단 소스·실행 파일은 `U3_BUILD_CACHE/040-metal-probe.*`, 결과는 `tts-spike/metallib-probe.log`에 있다.

`otool -L`에는 `/System/Library/`와 `/usr/lib/` 의존성만 있다. `@rpath`나 MLX·Cmlx dylib는 없다. `nm`은 실행 파일에 정의된 `T _mlx_add`, `T _mlx_array_new` 등을 표시한다. 이 결과로 MLX 코드의 정적 링크를 확인했다. Metal·Accelerate와 Swift runtime은 시스템 동적 라이브러리를 쓴다. 전체 목록은 `tts-spike/otool-L.txt`와 `static-symbols.txt`에 두었다.

## WAV와 미측정 항목

다음 경로는 입력 요청의 출력 위치다. 각 폴더에 `request.json`은 있지만 `scene-1.wav`부터 `scene-6.wav`까지의 파일은 없다.

| 모델 | WAV 출력 위치 | 장면 1~6 길이 | whisper 일치율 |
|---|---|---|---|
| 1.7B bf16 | `/Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/scene-N.wav` | 모두 미측정 | 미측정 |
| 1.7B 8bit | `/Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit/scene-N.wav` | 모두 미측정 | 미측정 |
| 0.6B bf16 | `/Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16/scene-N.wav` | 모두 미측정 | 미측정 |

기존 whisper 실행 파일은 `/Volumes/X31/.cache/u3/build/whisper-build/bin/whisper-cli`에 있다. 기존 모델은 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/ggml-large-v3-turbo-q5_0.bin`에 있다. `whisper-cli --help`도 확인했다. WAV가 없어서 일치율을 재지 않았다.

사용자 청취 판정, 전체 생성 속도, 장면별 길이, 생성 중 최대 메모리, 정상 WAV 형식, 모델을 읽은 뒤의 오프라인 합성은 모두 미검증이다. `HF_HUB_OFFLINE=1` 설정만으로 오프라인 합성을 검증했다고 보지 않는다. 실제 Tauri 패키징·서명·공증은 S1 뒤의 범위라 실행하지 않았다.

## 검증과 보관

- `bash scripts/build-tts.sh`: 종료 코드 0이다. 마지막 줄은 `✓ u3-tts built: /Volumes/X31/.cache/u3/build/u3-tts/arm64-apple-macosx/release/u3-tts`다.
- `bash -n scripts/build-tts.sh`: 종료 코드 0이다.
- `u3-tts --help`: 종료 코드 0이다. 잘못된 인자는 종료 코드 1과 파싱 가능한 JSONL `error` 이벤트를 낸다.
- `pnpm verify`: 종료 코드 0이고 마지막 줄은 `✓ verify passed`다. Vitest 104개 파일에서 461개 통과·2개 건너뜀이고 Rust 테스트 10개가 통과했다.
- Resources 배치 시험용 번들의 `check-macos-executables.sh`: 종료 코드 0이다.

검증 명령에는 AGENTS.md의 캐시 환경 변수를 붙였다. `pnpm verify`에는 `CARGO_TARGET_DIR=/Volumes/X31/.cache/u3/build/040-cargo-target`도 지정했다. 빌드 로그와 검증 로그는 `U3_BUILD_CACHE/040-build-tts.log`, `040-verify.log`다. Swift 빌드 산출물은 `U3_BUILD_CACHE/u3-tts/` 아래에 있다. 패키징용 복사본은 git에서 제외되는 `src-tauri/binaries/u3-tts-aarch64-apple-darwin`, `src-tauri/resources/tts/default.metallib`다.

레포에는 `native/u3-tts/`, `scripts/build-tts.sh`, 이 기록만 추가했다. `src/` 앱 코드·제품 결정·계획은 고치지 않았다. 다른 워크트리 수정, main 병합, push는 하지 않았다.

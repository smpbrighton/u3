# Qwen3-TTS S1 스파이크

## 결과

S1의 기계 측정을 마쳤다. 가중치와 함께 배포되지 않은 `tokenizer.json`을 개발 실험용 Python으로 만들었다. 세 모델 모두 Python·Swift token id 비교와 로드를 통과했다. Sohee 화자로 예시 대본 6장면을 생성했다. WAV는 모델마다 6개씩 총 18개다. 사용자 청취 판정과 앱 통합은 진행하지 않았다.

Swift 도우미와 Metal shader 빌드는 통과했다. 시스템 밖 dylib 의존은 없다. 시간은 `/usr/bin/time -l`의 `real`이다. 프로세스 시작·모델 로드·6장면 생성·파일 저장·종료를 모두 포함한다.

| 모델 | 로드 | 6장면 전체 시간 | 최대 RSS | peak memory footprint | 60초 기준 |
|---|---|---|---|---|---|
| 1.7B CustomVoice bf16 | 성공 | 36.31초 | 2.224 GiB | 16.948 GiB | 통과 |
| 1.7B CustomVoice 8bit | 성공 | 26.06초 | 3.016 GiB | 17.481 GiB | 통과 |
| 0.6B CustomVoice bf16 | 성공 | 31.06초 | 2.477 GiB | 17.886 GiB | 통과 |

| 모델 | 로드 시간 | 생성·저장 시간 합계 | 출력 음성 길이 합계 | whisper 문자 일치율 |
|---|---|---|---|---|
| 1.7B bf16 | 6.15초 | 29.95초 | 36.16초 | 98.32%(3/179자 편집 거리) |
| 1.7B 8bit | 4.64초 | 21.05초 | 42.88초 | 97.21%(5/179자 편집 거리) |
| 0.6B bf16 | 3.24초 | 27.50초 | 54.32초 | 98.88%(2/179자 편집 거리) |

모델별 측정은 새 프로세스로 한 번씩 했다. 측정 순서는 bf16 → 8bit → 0.6B다. 출력 음성 길이가 다르므로 생성 시간 차이를 같은 음성 길이의 성능 차이로 해석하지 않는다. 계획의 「30초 분량」 대본을 그대로 사용했지만 실제 출력은 36.16~54.32초다. 60초 기준은 지정된 6장면 전체 시간에 적용했다.

최대 RSS와 footprint는 `/usr/bin/time -l`의 서로 다른 지표다. Apple Silicon의 메모리를 RSS 하나로 판단하지 않도록 둘 다 기록한다. 원시 최대 RSS는 순서대로 2,387,574,784 / 3,238,100,992 / 2,659,991,552 bytes다. footprint는 18,197,909,752 / 18,770,119,848 / 19,204,901,648 bytes다. 총 24 GiB에서 footprint만 빼면 6.114~7.052 GiB다. OS와 다른 앱을 제외한 실제 여유 메모리가 6 GiB 이상인지는 측정하지 못했다.

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

모든 모델은 MLX 형식이다. 모델 카드와 Hugging Face API의 파일 목록·revision·라이선스를 확인했다. 각 레포에서 `.gitattributes`를 제외한 13개 파일을 고정 revision URL로 받았다. 여기에 아래 방법으로 만든 `tokenizer.json` 하나만 추가했다. 레포의 원래 파일은 덮어쓰지 않았다.

| 모델 | Hugging Face 레포 | 고정 revision | 라이선스 | 받은 파일 합계 |
|---|---|---|---|---|
| 1.7B bf16 | [mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/tree/52f4770fd9726457eae3d3b6aa92047a25a10776) | `52f4770fd9726457eae3d3b6aa92047a25a10776` | Apache-2.0 | 4,520,194,094 bytes |
| 1.7B 8bit | [mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit/tree/41d3337e8b7f2843a75841595fc14e4b9a7a4b96) | `41d3337e8b7f2843a75841595fc14e4b9a7a4b96` | Apache-2.0 | 3,080,140,019 bytes |
| 0.6B bf16 | [mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16/tree/6415d95f88be018ff9e46813119dc3bc12261328) | `6415d95f88be018ff9e46813119dc3bc12261328` | Apache-2.0 | 2,498,417,886 bytes |

파일 합계는 레포 파일만 포함한다. 로컬 출처 기록 `source.json`과 생성한 `tokenizer.json`은 제외한다. 각 모델 폴더는 `/Volumes/X31/.cache/u3/models-spike/<표의 레포 마지막 이름>/`이다. API 원문은 `/Volumes/X31/.cache/u3/build/040-<모델 이름>.json`에 남겼다. 가중치와 생성한 tokenizer는 커밋하지 않았다.

## tokenizer 변환과 일치 검증

처음 받은 파일만으로 1.7B bf16을 읽으면 `Required configuration file missing: tokenizer.json`으로 실패했다. swift-qwen3-tts의 `postLoadHook`이 `AutoTokenizer.from(modelFolder:)`를 부르고, swift-transformers 1.0.0의 `Sources/Hub/Hub.swift:260`이 이 파일을 필수로 검사한다.

세 MLX 레포는 모두 `tokenizer_config.json`, `vocab.json`, `merges.txt`를 제공하지만 `tokenizer.json`은 제공하지 않는다. 원본 [Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/tree/0c0e3051f131929182e2c023b9537f8b1c68adfe)도 revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`에서 같다. 원본 API 기록은 `040-hf-original.json`에 두었다. 첫 실패는 4.47초에 종료 코드 1을 냈다. 해당 로그는 bf16 출력 폴더의 `events.missing-tokenizer.jsonl`, `time.missing-tokenizer.log`로 보존했다.

감독자가 승인한 후속 실험에서 `/Volumes/X31/.cache/u3/py-spike/`에 Python 3.9.6 venv를 만들었다. Transformers 4.57.6과 tokenizers 0.22.2를 설치했다. pip cache와 Python bytecode cache는 `/Volumes/X31/.cache/u3/py-spike-cache/`에 두었다. 전체 설치 목록은 `tts-spike/python-requirements.txt`다. 이 환경은 개발 실험 전용이며 앱 실행·빌드·패키징에 Python을 추가하지 않았다.

변환 소스는 `native/u3-tts/spike/prepare-tokenizers.py`다. 각 모델 폴더를 `AutoTokenizer.from_pretrained(folder, local_files_only=True, use_fast=True)`로 읽어 `Qwen2TokenizerFast`를 만들었다. `save_pretrained` 출력은 모델별 `python-tokenizer-export/`에 저장했다. 출력 중 `tokenizer.json` 하나만 모델 폴더에 복사했다. 원래 `tokenizer_config.json`·`vocab.json`·`merges.txt`는 유지했다.

| 모델 | tokenizer.json 크기 | SHA-256 | added_tokens_decoder 검사 | Python·Swift token id |
|---|---|---|---|---|
| 1.7B bf16 | 11,423,986 bytes | `09267689b8362020b9763b65dd5be7e086b31e28d72e02837a9e781de9a91bc7` | 33/33 일치 | 48/48 입력 일치 |
| 1.7B 8bit | 11,423,986 bytes | `09267689b8362020b9763b65dd5be7e086b31e28d72e02837a9e781de9a91bc7` | 33/33 일치 | 48/48 입력 일치 |
| 0.6B bf16 | 11,423,986 bytes | `09267689b8362020b9763b65dd5be7e086b31e28d72e02837a9e781de9a91bc7` | 33/33 일치 | 48/48 입력 일치 |

검사는 원래 `added_tokens_decoder`의 모든 ID와 `content`, `lstrip`, `normalized`, `rstrip`, `single_word`, `special` 속성을 생성 JSON의 `added_tokens`와 대조했다. `<|endoftext|>`(151643), `<|im_start|>`(151644), `<|im_end|>`(151645)를 포함한 33개가 모두 들어갔다. 재로드한 Python tokenizer의 인코딩도 변환 전과 같았다.

비교 입력은 대본 원문 6개, TTS 라이브러리가 쓰는 assistant wrapper를 붙인 6개, 특수 토큰 단독 입력 33개, 한국어·영어·숫자·이모지 혼합 1개, 공백·줄바꿈·탭 입력 1개, instruct wrapper 1개다. 양쪽 모두 `add_special_tokens=true`로 인코딩했다. `native/u3-tts/Sources/TokenizerCheck/TokenizerCheck.swift`는 TTS와 같은 `AutoTokenizer.from(modelFolder:)`와 `encode(text:)`를 사용한다. 48개 입력에 대한 ID 배열을 모두 비교했고 차이가 없었다. 모든 가능한 입력의 동등성을 증명한 결과는 아니다.

`u3-tokenizer-check`는 개발 전용 Swift product다. `build-tts.sh`는 기존 `u3-tts` product만 빌드·복사한다. Python 의존성 고정은 `native/u3-tts/spike/requirements.txt`에 둔다. 변환 결과는 `tts-spike/tokenizer-summary.json`, 모델별 `python-token-ids.json`, `swift-token-ids.json`에 기록했다.

## 입력과 측정 방법

화자는 `Sohee`, 언어는 `korean`, `instruct`는 빈 문자열이다. 라이브러리의 기본 sampling 설정을 썼고 MLX seed는 0이다. 모델 한 번 로드 후 항목을 순서대로 생성하는 인터페이스다. 음성 저장은 라이브러리의 `saveAudioArray`를 쓴다. JSONL은 원래 stdout descriptor로 쓰며 라이브러리의 일반 출력은 stderr로 보낸다.

대본은 `src/core/script-prompt.ts`의 예시 1에서 추출한 다음 6장면이다. 훅 제목은 별도 항목으로 넣지 않았다. 원문은 줄이거나 속도를 보정하지 않았다.

1. 우리 남편 세차에 진짜 미친 사람이거든. 주말마다 세차장 출근 도장 찍어.
2. 근데 요즘 세차장을 한 번도 안 가는 거야. 차는 오히려 더 깨끗한데?
3. 이상해서 차를 싹 뒤져 봤지. 트렁크 구석에서 이게 나오더라.
4. 정체는 무선 핸디 청소기였어. 손바닥만 한데 선이 없어.
5. 시트 틈에 쑥 넣으니까 부스러기가 순식간에 싹 빨려 들어가는 거 있지?
6. 요즘 차 있는 집은 이거 하나씩 다 있대. 다음 주에 내 차 글로브박스에도 하나 들어갔잖아! 너는 차에 이런 거 몰래 쟁여 둔 적 있어?

각 모델 측정 직전 캐시 환경 변수를 붙여 `pgrep -fl vitest`를 실행했다. 세 번 모두 출력이 없고 종료 코드는 1이었다. 이 워크트리의 검증·빌드·tokenizer 비교도 끝난 뒤 로드를 시도했다. TTS 측정과 whisper 실행을 겹치지 않았다.

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

표준 입력 JSON의 필드는 `model`, `speaker`, `instruct`, `items: [{id, text}]`, `outDir`이다. 항목 id는 영문·숫자·밑줄·하이픈을 허용하고 중복을 거부한다. 출력은 `<id>.wav`다. `ffprobe`로 18개 모두 24 kHz mono `pcm_f32le`를 확인했다. WAV 길이와 `itemDone.durationSec`도 일치했다. 세 프로세스 모두 종료 코드 0이며 `loaded`, 장면별 `itemStarted`·`progress`·`itemDone`, 마지막 `done` 이벤트를 냈다.

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

세 모델 모두 `--metallib ../Resources/tts/default.metallib`로 실행해 6장면 전체 생성을 마쳤다. 실행 파일 폴더에는 metallib를 두지 않았다. 별도의 Metal API 진단도 같은 파일을 `MTLDevice.makeLibrary(URL:)`로 열어 다음 결과를 냈다.

```text
device=Apple M6 metallib=/Volumes/X31/.cache/u3/tts-spike/U3TTS-spike.app/Contents/Resources/tts/default.metallib functions=311
```

Resources 위치의 metallib를 사용한 전체 TTS 생성을 확인했다. 진단 소스·실행 파일은 `U3_BUILD_CACHE/040-metal-probe.*`, 결과는 `tts-spike/metallib-probe.log`에 있다.

`otool -L`에는 `/System/Library/`와 `/usr/lib/` 의존성만 있다. `@rpath`나 MLX·Cmlx dylib는 없다. `nm`은 실행 파일에 정의된 `T _mlx_add`, `T _mlx_array_new` 등을 표시한다. 이 결과로 MLX 코드의 정적 링크를 확인했다. Metal·Accelerate와 Swift runtime은 시스템 동적 라이브러리를 쓴다. 전체 목록은 `tts-spike/otool-L.txt`와 `static-symbols.txt`에 두었다.

## WAV와 whisper 비교

각 모델 폴더에 `scene-1.wav`부터 `scene-6.wav`까지 있다. `N`은 1~6이다.

| 모델 | WAV 경로 |
|---|---|
| 1.7B bf16 | `/Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16/scene-N.wav` |
| 1.7B 8bit | `/Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit/scene-N.wav` |
| 0.6B bf16 | `/Volumes/X31/.cache/u3/tts-spike/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16/scene-N.wav` |

| 장면 | 1.7B bf16 길이 | 1.7B 8bit 길이 | 0.6B bf16 길이 |
|---|---|---|---|
| 1 | 6.08초 | 7.36초 | 9.20초 |
| 2 | 4.80초 | 8.72초 | 6.08초 |
| 3 | 4.64초 | 5.36초 | 8.40초 |
| 4 | 4.96초 | 6.64초 | 7.92초 |
| 5 | 4.88초 | 5.20초 | 6.56초 |
| 6 | 10.80초 | 9.60초 | 16.16초 |
| 합계 | 36.16초 | 42.88초 | 54.32초 |

기존 whisper 실행 파일은 `/Volumes/X31/.cache/u3/build/whisper-build/bin/whisper-cli`다. 기존 모델은 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/ggml-large-v3-turbo-q5_0.bin`이다. `whisper-cli --help`에서 인자와 여러 입력 파일 지원을 확인했다. 원본 WAV는 유지했다. whisper 입력 사본만 ffmpeg로 16 kHz mono PCM16으로 바꿨다. 언어는 `ko`, 출력은 `-otxt -np -nt`이며 초기 prompt는 주지 않았다.

문자 일치율은 원문과 전사문을 NFC로 정규화하고 영문을 소문자로 바꾼 뒤 문자·숫자만 남겨 계산했다. 따라서 공백·구두점 차이는 제외한다. 각 장면의 Levenshtein 편집 거리 합계를 기준 문자 수 179로 나눴다. 식은 `100 × max(0, 1 - 편집 거리 합계 / 기준 문자 수 합계)`다. 공식 WER과 다른 보조 지표다.

| 장면 | 1.7B bf16 문자 일치율 | 1.7B 8bit 문자 일치율 | 0.6B bf16 문자 일치율 |
|---|---|---|---|
| 1 | 100.00% | 100.00% | 100.00% |
| 2 | 100.00% | 92.31% | 100.00% |
| 3 | 100.00% | 100.00% | 100.00% |
| 4 | 95.45% | 100.00% | 100.00% |
| 5 | 96.43% | 89.29% | 96.43% |
| 6 | 98.00% | 100.00% | 98.00% |

예를 들어 8bit의 장면 2 전사에는 원문에 없는 「아, 그」가 들어갔다. 장면 5의 「넣으니까」는 「떠오니까」로 전사됐다. 이 차이가 합성 음성의 발음 오류인지 whisper의 인식 오류인지는 자동 비교로 구분하지 못한다. 사용자가 WAV를 듣고 판정해야 한다.

전체 측정·전사·편집 거리는 `tts-spike/measurement-summary.json`에 있다. 모델별 `whisper-inputs/scene-N.wav.txt`에 전사문을 남겼다. 분석 스크립트와 로그는 `U3_BUILD_CACHE/040-analyze-tts.mjs`, `040-analyze-tts.log`다.

사용자 청취 판정과 OS·다른 앱을 제외한 실제 여유 메모리는 미측정이다. 네트워크를 차단한 상태의 합성은 별도로 실행하지 않았다. `HF_HUB_OFFLINE=1` 설정만으로 이를 검증했다고 보지 않는다. 실제 Tauri 패키징·서명·공증은 S1 뒤의 범위라 실행하지 않았다.

## 검증과 보관

- `bash scripts/build-tts.sh`: 종료 코드 0이다. 마지막 줄은 `✓ u3-tts built: /Volumes/X31/.cache/u3/build/u3-tts/arm64-apple-macosx/release/u3-tts`다.
- `bash -n scripts/build-tts.sh`: 종료 코드 0이다.
- `u3-tts --help`: 종료 코드 0이다. 잘못된 인자는 종료 코드 1과 파싱 가능한 JSONL `error` 이벤트를 낸다.
- tokenizer 변환: 세 모델 모두 특수 토큰 33개와 Python 재로드 검사를 통과했다. 생성 파일의 크기·SHA-256이 같다.
- `u3-tokenizer-check`: 세 모델 모두 종료 코드 0이다. 모델마다 비교 입력 48개가 일치했다.
- 6장면 생성: 세 모델 모두 종료 코드 0이다. WAV 18개와 `done` 이벤트를 확인했다.
- `pnpm verify`: 종료 코드 0이고 마지막 줄은 `✓ verify passed`다. Vitest 104개 파일에서 461개 통과·2개 건너뜀이고 Rust 테스트 10개가 통과했다.
- Resources 배치 시험용 번들의 `check-macos-executables.sh`: 종료 코드 0이다.

검증 명령에는 AGENTS.md의 캐시 환경 변수를 붙였다. `pnpm verify`에는 `CARGO_TARGET_DIR=/Volumes/X31/.cache/u3/build/040-cargo-target`도 지정했다. 빌드 로그와 검증 로그는 `U3_BUILD_CACHE/040-build-tts.log`, `040-verify.log`다. Swift 빌드 산출물은 `U3_BUILD_CACHE/u3-tts/` 아래에 있다. 패키징용 복사본은 git에서 제외되는 `src-tauri/binaries/u3-tts-aarch64-apple-darwin`, `src-tauri/resources/tts/default.metallib`다.

이번 후속 커밋은 `native/u3-tts/`의 개발용 tokenizer 준비·비교 도구와 이 기록만 고친다. `src/` 앱 코드·제품 결정·계획은 고치지 않았다. Python·모델·생성 tokenizer·빌드 산출물·WAV는 커밋하지 않는다. 다른 워크트리 수정, main 병합, push는 하지 않았다.

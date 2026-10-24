# whisper.cpp 스파이크

## 환경과 입력

- 측정일: 2026-10-24.
- macOS 27.0.1, Apple M4 arm64, Node v24.13.0, pnpm 10.33.0.
- whisper.cpp v1.9.5, CMake 4.4.4, ffmpeg 8.1.1, Homebrew 7.0.9.
- 이 Mac에는 CMake가 없어서 `brew install cmake`로 설치했다.
- 측정 클립은 실제 숏폼 원본이 없어 만든 대체 클립이다. 공용 클립 README의 구성과 대본을 사용했다.
- whisper.cpp 소스와 모델, WAV, 빌드 결과는 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/`에 두었다. 공용 클립 원본은 읽기만 했다.
- 모델 출처는 whisper.cpp 문서가 가리키는 공식 저장소 `https://huggingface.co/ggerganov/whisper.cpp`다. 모델 크기는 574 MB(547 MiB)이며 SHA-256은 `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`다.

## 빌드와 dylib 확인

`spikes/whisper/build.sh`가 다음 명령을 실행한다.

```sh
cmake -S "$SOURCE" -B "$BUILD" \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON
cmake --build "$BUILD" --config Release --target whisper-cli -j "$(sysctl -n hw.ncpu)"
```

whisper.cpp v1.9.5의 `ggml/CMakeLists.txt`에서 `GGML_METAL_EMBED_LIBRARY` 기본값은 `${GGML_METAL}`이다. CMake cache에서 `GGML_METAL=ON`, `GGML_METAL_EMBED_LIBRARY=ON`을 확인했다. 실행 파일은 `Mach-O 64-bit executable arm64`다.

`otool -L` 출력 전문:

```text
/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/build/bin/whisper-cli:
	/System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate (compatibility version 1.0.0, current version 4.0.0)
	/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1359.0.0)
	/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation (compatibility version 300.0.0, current version 5027.0.69)
	/System/Library/Frameworks/Metal.framework/Versions/A/Metal (compatibility version 1.0.0, current version 382.5.3)
	/System/Library/Frameworks/MetalKit.framework/Versions/A/MetalKit (compatibility version 1.0.0, current version 174.4.0)
	/usr/lib/libc++.1.dylib (compatibility version 1.0.0, current version 2200.27.0)
	/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (compatibility version 150.0.0, current version 5027.0.69)
	/usr/lib/libobjc.A.dylib (compatibility version 0.0.0, current version 228.0.0)
```

의존성은 시스템 프레임워크와 `/usr/lib` 라이브러리뿐이다. 그 밖의 dylib 의존은 없다. whisper.cpp 기본 설정이 Metal shader library를 실행 파일에 내장하는 점도 확인했다.

## 측정 방법

각 MP4를 아래 명령으로 16 kHz, 모노, PCM WAV로 변환했다.

```sh
ffmpeg -y -v error -i "$INPUT.mp4" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$OUTPUT.wav"
```

whisper-cli `--help`로 `-ojf`(JSON 전체), `-sns`(비말소리 토큰 억제), `-ml`, `-sow`, `--dtw`, `--vad`, `--vad-model` 옵션을 확인했다. 두 측정은 아래 명령으로 각각 세 클립에 실행했다. 입력 길이는 모두 60초다.

```sh
whisper-cli -m "$MODEL" -f "$WAV" -l ko -sns -ml 1 -sow -ojf -of "$OUT"
whisper-cli -m "$MODEL" -f "$WAV" -l ko -sns --dtw large.v3.turbo -ojf -of "$OUT"
```

실시간 배율은 60초를 측정한 처리 시간으로 나눴다. CER은 정답 대본과 JSON 전사문에서 공백과 Unicode 문장부호를 제거한 뒤 글자 단위 Levenshtein 편집 거리 ÷ 정답 글자 수로 계산했다. 숫자 발음과 숫자 표기를 정규화하지 않았다. CER 통과 기준은 각 클립 10% 이하로 정했다.

## 측정값

| 클립 | `-ml 1 -sow` 시간 | 실시간 배율 | CER | `--dtw large.v3.turbo` 시간 | 실시간 배율 | CER |
|---|---:|---:|---:|---:|---:|---:|
| clip1 | 7.92초 | 7.58× | 1.37% (2/146) | 2.98초 | 20.13× | 1.37% (2/146) |
| clip2 | 2.87초 | 20.91× | 4.42% (5/113) | 2.77초 | 21.66× | 4.42% (5/113) |
| clip3 | 4.71초 | 12.74× | 9.13% (23/252) | 4.65초 | 12.90× | 9.13% (23/252) |

clip2의 말 시작 시각 대비 각 방식이 출력한 첫 단어 시각은 같다.

| 알려진 말 시작 | 출력 시작 | 차이 |
|---:|---:|---:|
| 1.0초 | 0.36초 | -0.64초 |
| 17.1초 | 16.56초 | -0.54초 |
| 31.9초 | 30.00초 | -1.90초 |

모든 말소리 전사는 읽을 수 있는 한글 단어다. `-ml 1 -sow`는 단어 단위 segment를 만들지만 segment 안 token은 음절·토큰 조각으로 나뉜다. 출력 JSON에 글자 인코딩 손상은 없었다. 두 방법 모두 clip2의 알려진 시작 시각 허용치 0.5초를 넘었다.

| 비말소리 구간 | `-ml 1 -sow` 헛 문장 수 | DTW 헛 문장 수 |
|---|---:|---:|
| clip1 32.6–60초 | 0 | 0 |
| clip2 9.1–17.1초 | 0 | 0 |
| clip2 23.9–31.9초 | 0 | 0 |
| clip2 38.5–60초 | 0 | 0 |
| clip3 47–60초 | 1 | 1 |

clip3의 무음 구간에 `감사합니다.`가 한 번 출력됐다. 나머지 확인 구간에는 헛 문장이 없었다. 이 측정에서는 헛 문장이 많지 않아 VAD 비교는 실행하지 않았다.

## 판정

**No-go.** 정적 Metal 빌드는 외부 dylib 없이 실행됐다. 세 클립 처리 시간은 모두 60초보다 짧고 CER은 정한 10% 이하 기준을 통과했다. 두 시각 방식은 동일한 전사와 시작 시각을 냈으며, 최대 1.90초 어긋나 0.5초 기준을 통과하지 못했다.

W6에는 `-ml 1 -sow`나 DTW token timestamp를 쓰지 않고, spec의 대체 방식인 문장 시각을 글자 수로 나누는 방식을 선택한다. 단, clip2의 문장 첫 시각도 실제 말 시작과 최대 1.90초 어긋났다. 따라서 글자 수 분배만으로는 0.5초 조건을 만족한다고 판정할 수 없다. plan의 no-go 규칙에 따라 whisper 구현 전에 spec을 바꿔야 한다. spec 변경안은 문장 시각 대체의 시작 경계 정확도 기준을 정하거나, 시작 경계를 보정하는 정렬 단계를 추가하고 같은 클립으로 다시 측정하는 것이다.

JSON fixture 후보는 `spikes/whisper/sample-output.json`에 둔다. clip2의 `-ml 1 -sow` 실행에서 나온 whisper-cli 전체 JSON 출력이다.

## 재현 정보

소스는 `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz`에서 받았다. W8의 `build-whisper.sh`는 지정한 uUu 작업 트리에서 찾지 못했다. 이 스파이크에는 `spikes/whisper/build.sh`를 추가했다. 모델, 소스, 오디오와 전체 측정 JSON은 레포 밖 캐시에 보관한다.

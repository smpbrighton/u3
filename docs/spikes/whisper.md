# whisper.cpp 스파이크

## 환경과 입력

- 측정일: 2026-10-24.
- macOS 27.0.1, Apple M4 arm64, Node v24.13.0, pnpm 10.33.0.
- whisper.cpp v1.9.5, CMake 4.4.4, ffmpeg 8.1.1, Homebrew 7.0.9.
- 이 Mac에는 CMake가 없어서 `brew install cmake`로 설치했다.
- 측정 클립은 실제 숏폼 원본이 없어 만든 대체 클립이다. 공용 클립 README의 구성과 대본을 사용했다.
- whisper.cpp 소스와 모델, WAV, 빌드 결과는 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/`에 두었다. 공용 클립 원본은 읽기만 했다.
- 모델 출처는 whisper.cpp 문서가 가리키는 공식 저장소 `https://huggingface.co/ggerganov/whisper.cpp`다. 모델 크기는 574 MB(547 MiB)이며 SHA-256은 `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`다.
- VAD 모델은 whisper.cpp v1.9.5 README와 다운로드 스크립트가 가리키는 `https://huggingface.co/ggml-org/whisper-vad`의 `ggml-silero-v6.2.0.bin`이다. 크기는 864.35 KiB이며 SHA-256은 `2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987`다.
- whisper-vad 모델 카드(`https://huggingface.co/ggml-org/whisper-vad`)는 MIT를 표시한다. 원본 Silero VAD 저장소도 README와 라이선스 파일(`https://github.com/snakers4/silero-vad`, `https://github.com/snakers4/silero-vad/blob/master/LICENSE`)에서 MIT를 명시한다. 864.35 KiB이고 MIT이므로 MIT 고지를 포함해 앱 리소스로 번들하는 방식을 추천한다.

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
MEDIA=/Volumes/X31/workspace/smp_workspace/u3-spike-media
CACHE=/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper
mkdir -p "$CACHE/media"
for clip in clip1_speech_music clip2_speech_silence_music clip3_reels; do
  ffmpeg -y -v error -i "$MEDIA/$clip.mp4" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$CACHE/media/$clip.wav"
done
```

whisper-cli `--help`로 `-ojf`(JSON 전체), `-sns`(비말소리 토큰 억제), `-ml`, `-sow`, `-nfa`(flash attention 끄기), `--dtw`, `--vad`, `--vad-model` 옵션을 확인했다. 아래 세 명령을 각 클립에 실행했다. 입력 길이는 모두 60초다.

```sh
CACHE=/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper
CLI="$CACHE/build/bin/whisper-cli"
MODEL="$CACHE/ggml-large-v3-turbo-q5_0.bin"
VAD_MODEL="$CACHE/ggml-silero-v6.2.0.bin"
for clip in clip1_speech_music clip2_speech_silence_music clip3_reels; do
  /usr/bin/time -p "$CLI" -m "$MODEL" -f "$CACHE/media/$clip.wav" -l ko -sns -ml 1 -sow -ojf -of "$CACHE/ml1-$clip" >"$CACHE/ml1-$clip.log" 2>&1
  /usr/bin/time -p "$CLI" -m "$MODEL" -f "$CACHE/media/$clip.wav" -l ko -sns -nfa --dtw large.v3.turbo -ojf -of "$CACHE/dtw-nfa-$clip" >"$CACHE/dtw-nfa-$clip.log" 2>&1
  /usr/bin/time -p "$CLI" -m "$MODEL" -f "$CACHE/media/$clip.wav" -l ko -sns --vad -vm "$VAD_MODEL" -ml 1 -sow -ojf -of "$CACHE/vad-ml1-$clip" >"$CACHE/vad-ml1-$clip.log" 2>&1
done
```

입력 시작점은 다음 명령으로 확인했다.

```sh
ffmpeg -hide_banner -i /Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/media/clip2_speech_silence_music.wav -af 'silencedetect=noise=-40dB:d=0.3' -f null - 2>&1
ffmpeg -hide_banner -i /Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/media/clip1_speech_music.wav -af 'silencedetect=noise=-40dB:d=0.3' -f null - 2>&1
```

clip2에서 명령은 `silence_end: 1.002`와 `silence_end: 17.124625`를 출력했다. 따라서 말1·말2 시작점은 각각 1.00초와 17.12초다. 말3은 음악이 이어져 무음 검출을 쓸 수 없으므로 README 설계값 31.87초를 사용했다. clip1도 음악이 처음부터 이어져 `silencedetect`가 경계를 출력하지 않았다. clip1 시작점은 README 설계값 6.00초다.

처리 시간은 `/usr/bin/time -p`의 `real` 값이다. 실시간 배율은 60초를 처리 시간으로 나눴다. CER은 정답 대본과 JSON 전사문에서 공백과 Unicode 문장부호를 제거한 뒤 글자 단위 Levenshtein 편집 거리 ÷ 정답 글자 수로 계산했다. 숫자 발음과 숫자 표기를 정규화하지 않았다. CER 통과 기준은 각 클립 10% 이하다.

DTW 시작 시각은 segment offsets를 사용하지 않았다. whisper.cpp v1.9.5의 `examples/cli/cli.cpp`는 `t_dtw`를 출력할 때 100으로 나누므로 `tokens[].t_dtw / 100`을 초로 계산했다. `t_dtw`의 단위는 10 ms다. 올바른 DTW 실행 로그에 `flash attn = 0`, `dtw = 1`이 찍힌 것을 확인했다. 잘못된 이전 실행은 `dtw_token_timestamps is not supported with flash_attn - disabling` 경고를 내고 `dtw = 0`이었으며, JSON의 `tokens[].t_dtw`가 모두 -1이었다. 그 실행은 DTW 결과와 비교에서 제외했다.

## 측정값

| 클립 | 방식 | 처리 시간 | 실시간 배율 | CER |
|---|---|---:|---:|---:|
| clip1 | `-ml 1 -sow` | 7.92초 | 7.58× | 1.37% (2/146) |
| clip1 | `-nfa --dtw large.v3.turbo` | 5.59초 | 10.73× | 4.79% (7/146) |
| clip1 | `--vad -vm "$VAD_MODEL" -ml 1 -sow` | 1.86초 | 32.26× | 2.05% (3/146) |
| clip2 | `-ml 1 -sow` | 2.87초 | 20.91× | 4.42% (5/113) |
| clip2 | `-nfa --dtw large.v3.turbo` | 3.12초 | 19.23× | 4.42% (5/113) |
| clip2 | `--vad -vm "$VAD_MODEL" -ml 1 -sow` | 1.89초 | 31.75× | 4.42% (5/113) |
| clip3 | `-ml 1 -sow` | 4.71초 | 12.74× | 9.13% (23/252) |
| clip3 | `-nfa --dtw large.v3.turbo` | 6.24초 | 9.62× | 16.27% (41/252) |
| clip3 | `--vad -vm "$VAD_MODEL" -ml 1 -sow` | 3.87초 | 15.50× | 7.54% (19/252) |

clip1 시작점과 clip2의 세 시작점에 대한 출력 시각이다. 차이는 출력에서 기준을 뺀 값이다.

| 입력 구간 | 기준 | `-ml 1 -sow` segment 시작 | DTW `t_dtw / 100` | VAD `-ml 1 -sow` segment 시작 |
|---|---:|---:|---:|---:|
| clip1 첫 말 | 6.00초 | 0.00초 (-6.00초) | 6.08초 (+0.08초) | 6.08초 (+0.08초) |
| clip2 말1 | 1.00초 | 0.36초 (-0.64초) | 1.22초 (+0.22초) | 1.00초 (0.00초) |
| clip2 말2 | 17.12초 | 16.56초 (-0.56초) | 17.22초 (+0.10초) | 17.14초 (+0.02초) |
| clip2 말3 | 31.87초 | 30.00초 (-1.87초) | 32.06초 (+0.19초) | 31.90초 (+0.03초) |

`-ml 1 -sow` JSON의 segment offsets에서 `from == to`인 항목은 clip1에 5개, clip2에 6개였다. VAD 결과는 두 클립 모두 0개였다. 일반 `-ml 1 -sow`는 30초 창 경계에서 segment 시간이 어긋났다. clip1 첫 단어가 0.00초, clip2 말3이 30.00초로 기록됐다. VAD clip1은 시작 시각은 맞췄지만 첫 단어 `비`를 출력하지 않고 `오는`부터 출력했다. 이 누락은 clip1 CER 2.05%에 반영됐다.

DTW와 VAD 출력의 지정 비말소리 구간에서 확인한 헛 문장 수다. DTW는 token `t_dtw` 시각을 사용했다.

| 비말소리 구간 | DTW `-nfa --dtw` | VAD `--vad -ml 1 -sow` |
|---|---:|---:|
| clip1 32.6–60초 | 1 | 0 |
| clip2 9.1–17.1초 | 0 | 0 |
| clip2 23.9–31.9초 | 0 | 0 |
| clip2 38.5–60초 | 0 | 0 |
| clip3 47–60초 | 1 | 0 |

DTW는 clip1 무음·음악 구간에 `감사합니다.`를, clip3 무음 구간에 `한글자막 제공 및 자막 제공 및 광고를 포함하고 있습니다.`를 출력했다. VAD는 지정 무음 구간에 문장을 출력하지 않았다.

## 판정

**Go: `--vad -vm "$VAD_MODEL" -ml 1 -sow`.** 정적 Metal 빌드는 외부 dylib 없이 실행됐다. 모든 클립의 VAD 처리 시간은 60초보다 짧고 CER은 10% 이하이며, clip1과 clip2의 시작 시각 차이는 모두 0.5초 이하다. VAD 모델은 공식 배포본이며 크기는 1 MB 미만이다.

`-nfa --dtw large.v3.turbo`도 clip1과 clip2의 시작 시각 기준은 통과했다. 그러나 clip3 CER이 16.27%로 10% 기준을 넘고, 두 비말소리 구간에 헛 문장을 출력해 W6 방식으로 선택하지 않았다. 일반 `-ml 1 -sow`는 시작 시각과 0 길이 segment 기준을 통과하지 못했다.

W6에는 `--vad -vm "$VAD_MODEL" -ml 1 -sow`를 사용한다. VAD는 첫 단어를 놓친 구간이 있어도 전체 CER 기준을 통과했다. W6에서 VAD 모델을 함께 배포하거나 공식 저장소에서 받도록 연결해야 한다.

JSON fixture 후보는 `spikes/whisper/sample-output.json`에 둔다. clip2를 `--vad -vm ggml-silero-v6.2.0.bin -ml 1 -sow -sns -l ko -ojf`로 실행한 whisper-cli 전체 JSON 출력이다.

## 재현 정보

소스는 `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz`에서 받았다. W8의 `build-whisper.sh`는 지정한 uUu 작업 트리에서 찾지 못했다. 이 스파이크에는 `spikes/whisper/build.sh`를 추가했다. 모델, VAD 모델, 소스, 오디오와 전체 측정 JSON은 레포 밖 캐시에 보관한다.

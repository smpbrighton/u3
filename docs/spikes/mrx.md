# MRX S2 spike

## 판정

**GO.** 공식 MERL 가중치에서 STFT·ISTFT를 그래프 밖으로 둔 ONNX 모델을 만들었다. dynamic int8 파일은 31,146,919 bytes다. 다섯 초 fixture에서 PyTorch 원본과 세 stem 상관계수가 0.997 이상이다. 세 60초 클립 모두 CPU 처리 시간이 60초 이하이고, 입력·출력 길이가 일치한다. 두 정답 대본 클립은 정한 RMS 기준을 충족한다.

CoreML은 clip1에서 90.347초가 걸렸다. clip2는 33.827초, clip3는 34.493초가 걸렸다. CoreML 시간 기준을 넘은 클립은 CPU에서 18.749초에 처리했다. 실행 로그에는 CoreML로 배치된 15개 ONNX partition과 CPU fallback으로 배치된 221개 노드가 나온다.

사람 청취는 **청취 미실행**이다. 사용자가 청취할 파일은 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out/clip{1,2,3}-{coreml,cpu}-{voice,bg}.wav`다.

## 공식 출처와 파생 모델

- 공식 프로젝트: [MERL cocktail-fork-separation](https://github.com/merlresearch/cocktail-fork-separation), [공식 소개](https://cocktail-fork.github.io/).
- 사용한 공식 저장소 커밋은 `19b3de827ebc4bfb014570cf92dd32b4ee3b6921`이다. archive URL은 <https://codeload.github.com/merlresearch/cocktail-fork-separation/tar.gz/19b3de827ebc4bfb014570cf92dd32b4ee3b6921>다.
- MERL README는 모델 출력을 speech·music·sfx 세 stem으로 설명하고, 입력을 44.1 kHz `channels × samples`로 정의한다.
- 공식 저장소에는 int8 ONNX가 없다. 공식 Git LFS 파일은 `default_mrx_pre_trained_weights.pth`다.
- 공식 checkpoint: <https://media.githubusercontent.com/media/merlresearch/cocktail-fork-separation/main/checkpoints/default_mrx_pre_trained_weights.pth>.
- GitHub 파일 정보: <https://api.github.com/repos/merlresearch/cocktail-fork-separation/contents/checkpoints/default_mrx_pre_trained_weights.pth>.
- 받은 checkpoint 크기는 122,317,463 bytes다. SHA-256은 `9cecc071c9e58afda34d1a98609a1540f61320e718bafecc4c9c1c5e3ed20a0c`다.
- MERL 저장소 코드와 포함 체크포인트의 라이선스는 MIT다. [LICENSE.md](https://github.com/merlresearch/cocktail-fork-separation/blob/main/LICENSE.md).
- 첫 전체 모델 export는 `torch.onnx.errors.SymbolicValueError: STFT does not currently support complex types` 오류로 실패했다. 두 번째 시도에서 공식 `mrx.py`를 import하는 `MRXMaskNetwork` 래퍼를 `spikes/mrx/export_model.py`에 만들었다. 래퍼 입력은 real·imag STFT 성분이고, 공식 encoder·CrossNet·decoder가 예측한 실수 mask만 출력한다. 이 래퍼는 `torch.onnx.export` opset 17로 성공했다. 1단계가 성공해서 `dynamo=True` 전체 모델 export는 시도하지 않았다.
- STFT와 ISTFT는 공식 설정 `[1024, 2048, 8192]`, hop 256, periodic Hann, centered reflect padding, normalized FFT를 사용한다. Node 구현 왕복 검사의 최대 절대 오차는 n_fft 1024와 2048에서 `1.49e-8`, 8192에서 `7.45e-9`였다.
- PyTorch 원본 모델과 float32 ONNX 비교는 5초 fixture에서 수행했다. float32 파일은 122,338,431 bytes다. stem별 최대 절대 오차는 music `1.34e-7`, speech `1.51e-7`, sfx `1.79e-7`이고 상관계수는 모두 `0.999999999998` 이상이다.
- `onnxruntime.quantization.quantize_dynamic`으로 MatMul·Gemm·LSTM 가중치를 int8로 바꿨다. int8 파일은 31,146,919 bytes(약 29.7 MiB)다. SHA-256은 `8e65265d4d2ed452255af7e18d56ae3b3dd623322dc89c4151cd83e70bf6dca8`다. PyTorch 원본 대비 stem별 최대 절대 오차 / 상관계수는 music `0.00889 / 0.99981`, speech `0.00639 / 0.99705`, sfx `0.02035 / 0.99991`이다.
- 원본 모델과 ONNX 비교는 공식 `MRX.forward`를 입력에 직접 적용했다. `separate.py`의 선택적 loudness 정규화(`input_lufs=-27`)는 적용하지 않았다.

## 환경과 입력

- macOS 27.0.1 (Build 26A434), Apple M4, arm64.
- Node v24.13.0, npm 11.6.2, onnxruntime-node 1.22.0.
- Python 3.11.14, PyTorch 2.14.1, ONNX 1.23.2, ONNX Runtime 1.31.0, ffmpeg 8.1.1.
- MERL README는 Python 3.9와 PyTorch 1.13.1을 문서화한다. 이 환경은 Python 3.11로 실행했다.
- 공용 clip1·clip2·clip3는 ffmpeg로 stereo 44.1 kHz float32 WAV로 변환했다. 각각 정확히 60초다. fixture는 clip1의 첫 5초다.
- 공용 클립 README가 설명하듯 세 파일은 실제 숏폼 원본이 없어 만든 대체 클립이다. 입력 미디어 폴더는 읽기만 했다.

## 반복 실행

모델·가중치·WAV·프로파일은 레포 밖 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/`에 저장한다. 공용 미디어는 `/Volumes/X31/workspace/smp_workspace/u3-spike-media/`에서 읽는다.

처음부터 환경과 모델을 준비하는 명령이다.

```bash
cd spikes/mrx && npm install
python3.11 -m venv /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/venv
/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/venv/bin/pip install torch torchaudio onnx onnxscript onnxruntime onnxruntime-tools soundfile librosa pyloudnorm
mkdir -p /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/source/pinned
curl -fL https://codeload.github.com/merlresearch/cocktail-fork-separation/tar.gz/19b3de827ebc4bfb014570cf92dd32b4ee3b6921 -o /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/source/merl.tar.gz
tar -xzf /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/source/merl.tar.gz -C /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/source/pinned
```

레포 루트에서 모델 export와 비교·양자화를 실행한다.

```bash
/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/venv/bin/python spikes/mrx/export_model.py
bash spikes/mrx/prepare.sh
/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/venv/bin/python spikes/mrx/compare_quantize.py
cd spikes/mrx && npx tsx src/validate-stft.ts /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/fixture-5s.wav
cd ../..
bash spikes/mrx/run-all.sh
```

`run-all.sh`는 clip1·clip2·clip3를 CoreML 우선 및 CPU 우선으로 각각 실행한다. 실행 로그와 ORT profile JSON을 cache에 남긴다. 이어서 세 clip과 5초 fixture의 두 출력 길이를 확인하고, RMS 측정과 60초 PyTorch CPU 실행을 수행한다. 필요한 옵션과 실제 provider 배치는 [run.ts](../../spikes/mrx/src/run.ts), [export_model.py](../../spikes/mrx/export_model.py), [run-all.sh](../../spikes/mrx/run-all.sh)에 있다.

## 측정 결과

처리 시간은 WAV 입력 후 STFT 시작부터 ONNX 출력과 ISTFT 합산 완료까지다. 출력 WAV 저장 시간은 제외한다. RTF는 처리 시간 ÷ 60초다. 각 provider는 독립 Node 프로세스로 실행했다. 최대 RSS는 해당 프로세스의 `process.resourceUsage().maxRSS`다.

| 입력 | CoreML 시간 / RTF / 최대 RSS | CPU 시간 / RTF / 최대 RSS | 길이 |
|---|---:|---:|---|
| clip1 | 90.347초 / 1.5058 / 13,079.4 MB | 18.749초 / 0.3125 / 6,402.0 MB | voice·bg 모두 60초 |
| clip2 | 33.827초 / 0.5638 / 13,126.2 MB | 18.962초 / 0.3160 / 6,425.2 MB | voice·bg 모두 60초 |
| clip3 | 34.493초 / 0.5749 / 14,927.6 MB | 19.193초 / 0.3199 / 6,425.2 MB | voice·bg 모두 60초 |
| fixture | 2.085초 / 0.4170 / 2,708.8 MB | 1.614초 / 0.3228 / 778.5 MB | voice·bg 모두 5초 |

5초 fixture 길이는 두 출력 모두 입력과 한 sample 이내로 일치했다. 60초 세 클립도 voice·bg 각각 입력과 한 sample 이내로 일치했다. `check-lengths.sh`가 이를 검사했다.

공식 PyTorch 원본 CPU 모델은 clip1 60초 입력을 7.942초(RTF 0.1324)에 처리했다. `MRX.forward`의 STFT·신경망·ISTFT는 포함하고 WAV 읽기·저장은 제외했다.

품질 기준은 정답 말소리 구간에서 `voice RMS >= bg RMS + 6 dB`, 음악 전용 구간에서 `voice RMS <= bg RMS - 20 dB`, 무음 구간에서 voice와 bg가 각각 `-50 dBFS 이하`다. RMS는 구간 내 stereo sample 전체를 합쳐 dBFS로 계산했다.

| 클립·구간 | CoreML voice / bg RMS | 차이 | CPU voice / bg RMS | 차이 | 결과 |
|---|---:|---:|---:|---:|---|
| clip1 말소리 6.0–32.6초 | -20.309 / -27.127 dBFS | +6.818 dB | -20.309 / -27.127 dBFS | +6.818 dB | 통과 |
| clip1 음악 전용 32.6–34.9, 35.2–49.9, 50.5–60초 | -92.064 / -25.501 dBFS | -66.563 dB | -92.076 / -25.501 dBFS | -66.574 dB | voice 누출 통과 |
| clip2 말소리 1.0–9.1, 17.1–23.4, 31.9–38.5초 | -20.162 / -54.872 dBFS | +34.710 dB | -20.162 / -54.876 dBFS | +34.714 dB | 통과 |
| clip2 음악 23.9–26.8, 27.1–31.9초 | -55.938 / -23.442 dBFS | -32.496 dB | -55.939 / -23.442 dBFS | -32.497 dB | voice 누출 통과 |
| clip2 무음 9.1–17.1, 38.5–60초 | -102.453 / -109.848 dBFS | - | -102.440 / -109.897 dBFS | - | 통과 |

clip1 말소리 구간은 voice와 bg 간격이 기준보다 0.818 dB 크다. clip2 말소리 간격은 기준보다 크다. 음악·무음 구간도 설정한 누출·잡음 기준을 만족한다. clip1 음악 구간은 whoosh(35초)와 applause(50초) 효과 구간을 뺐다. clip2 음악 구간은 impact(26.9초)를 뺐다. 청취 확인은 하지 않았다.

## 최종 판단

**GO.** CPU 세 클립 처리 시간이 각각 18.749초, 18.962초, 19.193초로 모두 60초 이하다. voice와 bg 출력 길이는 입력과 같다. 두 정답 클립의 말소리 분리량, 음악 구간 voice 누출, 무음 잡음 RMS가 기준을 통과했다. 다만 CoreML clip1은 60초 제한을 넘고 세 CoreML 실행의 최대 RSS는 12.8–14.6 GiB였다. runtime은 CoreML을 우선 시도하고 실패·지연 상황에서 CPU fallback을 유지해야 한다. 사람 청취는 별도 확인 항목이다.

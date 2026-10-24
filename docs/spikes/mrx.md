# MRX S2 spike

## 판정

**NO-GO (보류).** 공식 MRX 배포처는 int8 ONNX 파일을 제공하지 않는다. 공식 `.pth` 가중치를 ONNX로 내보내려는 시도는 모델 내부 `torch.stft`의 complex 결과에서 실패했다. 따라서 onnxruntime-node 세션이 생성되지 않았고, CoreML·CPU 처리 시간, 품질 RMS, 출력 길이, 5초 fixture 검증을 측정하지 못했다. 확인하지 않은 수치를 통과로 취급하지 않는다.

spec의 임시 품질 기준은 말소리 구간에서 `voice RMS >= bg RMS + 6 dB`다. 음악 전용 구간에서 voice 누출은 `voice RMS <= bg RMS - 20 dB`, 무음 구간 voice와 bg 잡음은 각각 `-50 dBFS 이하`를 목표로 기록한다. 판정의 go 조건은 60초 입력 하나 이상이 CoreML 또는 CPU에서 60초 이하, 모든 정답 말소리 구간에서 voice가 bg보다 6 dB 이상 크고, 출력 길이가 입력과 같은 것이다. 공통 plan은 세 클립을 모두 측정하므로 세 입력 전부 길이 조건을 충족해야 한다.

## 공식 배포처와 모델

- 공식 프로젝트: [MERL cocktail-fork-separation](https://github.com/merlresearch/cocktail-fork-separation)
- 공식 소개 페이지: [The Cocktail Fork Problem](https://cocktail-fork.github.io/)
- 저장소 README는 MRX를 대사(speech)·음악(music)·효과(sfx) 3개 stem으로 분리한다고 설명한다. 입력은 44.1 kHz `channels × samples`다.
- 저장소 README의 Git LFS 체크포인트 목록에는 `default_mrx_pre_trained_weights.pth`가 있다. int8 ONNX 배포 파일이나 ONNX inference API는 목록에 없다.
- 공식 checkpoint URL: <https://media.githubusercontent.com/media/merlresearch/cocktail-fork-separation/main/checkpoints/default_mrx_pre_trained_weights.pth>
- GitHub API 파일 정보: <https://api.github.com/repos/merlresearch/cocktail-fork-separation/contents/checkpoints/default_mrx_pre_trained_weights.pth>
- 받은 checkpoint 크기: 122,317,463 bytes. SHA-256: `9cecc071c9e58afda34d1a98609a1540f61320e718bafecc4c9c1c5e3ed20a0c`.
- 공식 코드와 저장소 가중치 라이선스: MIT. [LICENSE.md](https://github.com/merlresearch/cocktail-fork-separation/blob/main/LICENSE.md)
- 저장소 README의 DnR test SI-SDR: MRX (repo) speech 12.5 dB, music 4.2 dB, SFX 5.7 dB. 이는 공개 데이터셋 점수이며 이 spike의 품질 측정값이 아니다.

int8 ONNX는 공식 배포물에서 찾지 못했다. 공식 코드에서 모델을 불러와 PyTorch ONNX exporter로 5초 입력을 내보내는 대안을 시도했다. exporter는 `torch.onnx.errors.SymbolicValueError: STFT does not currently support complex types`로 중단됐다. 오류는 공식 `mrx.py`의 complex `torch.stft` 경로에서 났다. 이를 해결하려면 STFT/ISTFT를 real/imag ONNX 연산으로 재작성하거나 전처리·후처리 밖으로 분리하고, 원본과 출력 정합성을 다시 검증해야 한다. int8 변환은 export 이후 별도 검증 항목이다. 이 spike에서는 구조 변경을 하지 않았다.

## 실험 코드

- `spikes/mrx/src/run.ts`: float32 ONNX 모델을 onnxruntime-node로 열고 CoreML EP 다음 CPU를 요청한다. CoreML 세션 로그와 profiling JSON에서 partition/fallback 노드를 확인하도록 verbose 로그를 켠다. 이 코드는 모델 입출력 계약을 `audio: [1,2,samples]`, `stems: [1,3,2,samples]`로 가정한다. export 모델이 없어서 계약도 검증하지 못했다.
- `spikes/mrx/prepare.sh`: 공용 세 클립을 ffmpeg로 44.1 kHz stereo float WAV로 바꾸고 첫 5초 fixture를 만든다.
- 독립 npm 프로젝트는 `spikes/mrx/package.json`에 있다. 루트 의존성은 바꾸지 않았다.
- 청취 판정은 **청취 미실행**이다. 청취 파일 경로(모델이 정상 생성된 뒤): `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out/clip{1,2,3}-{coreml,cpu}-voice.wav`와 `bg.wav`.

## 환경

- macOS 27.0.1 (Build 26A434), Apple M4, `arm64`.
- Node v24.13.0, npm (spike 독립 설치). onnxruntime-node `1.22.0`.
- ffmpeg 8.1.1.
- export 도구: Python 3.11.14, PyTorch 2.14.1, ONNX 1.23.2. MERL README가 문서화한 테스트 환경은 Python 3.9이며, 저장소 requirements는 PyTorch 1.13.1이다.
- 실험 소스와 모델은 `/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/` 아래에 두었다. 미디어 원본 디렉터리는 읽기만 했다.

## 다시 실행

레포 루트에서 미디어를 준비한다.

```bash
bash spikes/mrx/prepare.sh
```

공식 저장소의 기본 checkpoint로 export를 재시도한다. 현재 공식 모델 코드에서 실패하는 명령이며, 실패를 재현하는 절차다.

```bash
/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/venv/bin/python /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/export.py
```

export 성공 후에만 실측 명령을 실행한다.

```bash
cd spikes/mrx
npm install
npm run run -- /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/model/mrx.onnx /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/clip1_speech_music.wav /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out clip1
npm run run -- /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/model/mrx.onnx /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/clip2_speech_silence_music.wav /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out clip2
npm run run -- /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/model/mrx.onnx /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/clip3_reels.wav /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out clip3
npm run run -- /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/model/mrx.onnx /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/fixture-5s.wav /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out fixture-5s
bash spikes/mrx/check-lengths.sh /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/fixture-5s.wav /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out fixture-5s coreml
bash spikes/mrx/check-lengths.sh /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/media/fixture-5s.wav /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out fixture-5s cpu
```

세션별 요약은 `out/<label>-{coreml,cpu}.log`, ORT verbose partition/fallback 진단은 명령의 stdout·stderr, ORT 프로파일은 ORT가 출력한 프로파일 파일에 남는다. 전체 로그를 저장하려면 각 명령 끝에 `2>&1 | tee /Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/out/<label>-ort.log`를 붙인다. 이 spike에서는 위 ONNX 측정 명령을 실행하지 못했다.

## 측정 결과

60초 클립별 CoreML·CPU 시간, 실시간 배율, 최대 메모리, 출력 길이, RMS 수치는 **측정 불가**다. 사용할 ONNX 모델이 없어 세션을 만들지 못했다. 로그에서 CoreML 실행과 CPU로 넘어간 노드도 확인하지 못했다. 5초 fixture에서 voice/bg 두 파일 길이를 확인하는 검증 역시 실행하지 못했다.

| 클립 | 처리 시간 CoreML / CPU | 실시간 배율 | 최대 RSS | voice/bg 길이 | RMS |
|---|---:|---:|---:|---:|---|
| clip1, 60초 | 미측정 / 미측정 | 미측정 / 미측정 | 미측정 | 미측정 | 미측정 |
| clip2, 60초 | 미측정 / 미측정 | 미측정 / 미측정 | 미측정 | 미측정 | 미측정 |
| clip3, 60초 입력 | 미측정 / 미측정 | 미측정 / 미측정 | 미측정 | 미측정 | 미측정 |
| fixture, 5초 | 미실행 | 미실행 | 미실행 | 미확인 | 미실행 |

## 다음 spec 변경 제안

현재 MRX int8 ONNX 사전 조건은 공식 산출물로 충족되지 않는다. 구현 전 MRX 모델 정의를 ONNX 호환 STFT/ISTFT 경계로 재구성하고, 공식 PyTorch 결과와 waveform 정합성을 먼저 확인하는 별도 작업이 필요하다. 모델 파일 크기 31 MB, CoreML/CPU provider partition, 품질·시간 기준은 그 변환 모델을 얻은 뒤 다시 판정한다. 변환이 어렵거나 CPU 60초 제한을 넘으면 우려 사항 7의 대안인 464 MB Mel-Band RoFormer(MIT) 검토를 제품 결정으로 올린다. 현재는 spec을 바꾸지 않았고 단계 2에서 중단해야 한다.

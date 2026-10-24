"""Compare the exported mask graph with MERL's original model, then quantize it."""
from pathlib import Path
import json
import sys
import time

import numpy as np
import soundfile as sf
import torch
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic

ROOT = Path('/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx')
MERL = ROOT / 'source/pinned/cocktail-fork-separation-19b3de827ebc4bfb014570cf92dd32b4ee3b6921'
sys.path.insert(0, str(MERL))
from mrx import MRX

N_FFTS = [1024, 2048, 8192]
HOP = 256
FP32 = ROOT / 'model/mrx-mask-fp32.onnx'
INT8 = ROOT / 'model/mrx-mask-int8.onnx'
FIXTURE = ROOT / 'media/fixture-5s.wav'


def infer_onnx(path, audio):
    session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
    tensors = {}
    specs = []
    for idx, nfft in enumerate(N_FFTS):
        spec = torch.stft(audio.reshape(-1, audio.shape[-1]), nfft, HOP,
                          window=torch.hann_window(nfft), normalized=True,
                          center=True, pad_mode='reflect', return_complex=True)
        spec = spec.reshape(1, audio.shape[1], nfft // 2 + 1, -1)
        specs.append(spec)
        tensors[f'spec_{idx}_real'] = spec.real.numpy()
        tensors[f'spec_{idx}_imag'] = spec.imag.numpy()
    masks = session.run(None, tensors)
    estimate = torch.zeros((1, 3, 2, audio.shape[-1]), dtype=audio.dtype)
    for resolution, (nfft, spec, mask) in enumerate(zip(N_FFTS, specs, masks)):
        mask = torch.from_numpy(mask)
        for source in range(3):
            multiplied = spec * mask[:, source]
            waveform = torch.istft(multiplied.reshape(-1, multiplied.shape[-2], multiplied.shape[-1]),
                                   nfft, HOP, window=torch.hann_window(nfft), normalized=True,
                                   center=True, length=audio.shape[-1])
            estimate[:, source] += waveform.reshape(1, 2, -1)
    return estimate


def metrics(reference, candidate):
    results = []
    for idx, name in enumerate(['music', 'speech', 'sfx']):
        ref = reference[0, idx].reshape(-1).double()
        got = candidate[0, idx].reshape(-1).double()
        error = (ref - got)
        corr = torch.corrcoef(torch.stack([ref, got]))[0, 1].item()
        results.append({
            'stem': name,
            'maxAbsError': error.abs().max().item(),
            'rmsError': torch.sqrt(torch.mean(error.square())).item(),
            'correlation': corr,
        })
    return results


def main():
    audio_np, rate = sf.read(FIXTURE, dtype='float32', always_2d=True)
    assert rate == 44100 and audio_np.shape[1] == 2
    audio = torch.from_numpy(audio_np.T.copy()).unsqueeze(0)
    model = MRX().eval()
    model.load_state_dict(torch.load(MERL / 'checkpoints/default_mrx_pre_trained_weights.pth',
                                    map_location='cpu', weights_only=True))
    with torch.inference_mode():
        start = time.perf_counter()
        reference = model(audio)
        pytorch_sec = time.perf_counter() - start
        fp32 = infer_onnx(FP32, audio)
    report = {
        'fixture': str(FIXTURE), 'sampleRate': rate, 'seconds': audio.shape[-1] / rate,
        'pytorchCpuSec': pytorch_sec, 'fp32Bytes': FP32.stat().st_size,
        'fp32Comparison': metrics(reference, fp32),
    }
    quantize_dynamic(str(FP32), str(INT8), weight_type=QuantType.QInt8,
                     op_types_to_quantize=['MatMul', 'Gemm', 'LSTM'])
    with torch.inference_mode():
        int8 = infer_onnx(INT8, audio)
    report['int8Bytes'] = INT8.stat().st_size
    report['int8Comparison'] = metrics(reference, int8)
    report_path = ROOT / 'out/fixture-comparison.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()

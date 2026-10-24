"""One-shot CPU timing of MERL's original PyTorch waveform model."""
from pathlib import Path
import sys
import time
import soundfile as sf
import torch

ROOT = Path('/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx')
MERL = ROOT / 'source/pinned/cocktail-fork-separation-19b3de827ebc4bfb014570cf92dd32b4ee3b6921'
sys.path.insert(0, str(MERL))
from mrx import MRX

audio_path = Path(sys.argv[1])
wave, rate = sf.read(audio_path, dtype='float32', always_2d=True)
assert rate == 44100 and wave.shape[1] == 2
audio = torch.from_numpy(wave.T.copy()).unsqueeze(0)
model = MRX().eval()
model.load_state_dict(torch.load(MERL / 'checkpoints/default_mrx_pre_trained_weights.pth',
                                map_location='cpu', weights_only=True))
with torch.inference_mode():
    start = time.perf_counter()
    result = model(audio)
    elapsed = time.perf_counter() - start
print(f'input={audio_path} seconds={audio.shape[-1] / rate:.3f} pytorchCpuSec={elapsed:.3f} rtf={elapsed / (audio.shape[-1] / rate):.4f} output={tuple(result.shape)}')

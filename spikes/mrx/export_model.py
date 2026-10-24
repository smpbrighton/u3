"""Export MERL MRX neural network only; STFT and ISTFT stay outside ONNX."""
from pathlib import Path
import sys
import torch

ROOT = Path('/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx')
MERL = ROOT / 'source/pinned/cocktail-fork-separation-19b3de827ebc4bfb014570cf92dd32b4ee3b6921'
sys.path.insert(0, str(MERL))
from mrx import MRX  # noqa: E402


class MRXMaskNetwork(torch.nn.Module):
    """Inputs are real STFT components; return one [batch, source, channel, freq, frame] mask per resolution."""
    def __init__(self, model: MRX):
        super().__init__()
        self.encoders = model._encoders
        self.cross_net = model._cross_net
        self.decoders = model._decoders

    def forward(self, *components):
        encoded = []
        original_shapes = []
        for idx, encoder in enumerate(self.encoders):
            real, imag = components[2 * idx], components[2 * idx + 1]
            magnitude = torch.sqrt(real.square() + imag.square())
            batch, channels, bins, frames = magnitude.shape
            original_shapes.append((batch, channels, bins, frames))
            value = magnitude.transpose(-1, -2).reshape(-1, bins)
            value = encoder.layer(value)
            value = torch.tanh(value).reshape(-1, frames, value.shape[-1])
            encoded.append(value)

        shared = self.cross_net(encoded)
        source_masks = []
        for source_decoder in self.decoders:
            resolutions = []
            for idx, decoder in enumerate(source_decoder):
                batch, channels, bins, frames = original_shapes[idx]
                value = decoder(shared)
                value = value.transpose(-1, -2).reshape(batch, channels, bins, frames)
                resolutions.append(value)
            source_masks.append(resolutions)
        return tuple(torch.stack([source_masks[s][r] for s in range(3)], dim=1) for r in range(3))


def main():
    checkpoint = MERL / 'checkpoints/default_mrx_pre_trained_weights.pth'
    model = MRX().eval()
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))
    wrapper = MRXMaskNetwork(model).eval()
    # A 5-second waveform produces floor(samples / hop) + 1 centered STFT frames.
    sample_count = 5 * 44100
    inputs = []
    dynamic_axes = {}
    names = []
    for idx, n_fft in enumerate(model._window_lengths):
        frames = sample_count // model._n_hop + 1
        bins = n_fft // 2 + 1
        for part in ('real', 'imag'):
            name = f'spec_{idx}_{part}'
            names.append(name)
            inputs.append(torch.zeros(1, 2, bins, frames))
            dynamic_axes[name] = {3: f'frames_{idx}'}
    for idx in range(3):
        dynamic_axes[f'masks_{idx}'] = {4: f'frames_{idx}'}
    output = ROOT / 'model/mrx-mask-fp32.onnx'
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapper, tuple(inputs), str(output), input_names=names, output_names=['masks_0', 'masks_1', 'masks_2'],
        dynamic_axes=dynamic_axes, opset_version=17, dynamo=False,
    )
    print(f'EXPORTED {output} bytes={output.stat().st_size}')


if __name__ == '__main__':
    main()

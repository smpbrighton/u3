import FFT from 'fft.js';

export type ComplexSpec = { real: Float32Array; imag: Float32Array; frames: number; bins: number; channels: number };
export const N_FFTS = [1024, 2048, 8192] as const;
export const HOP = 256;

function reflectIndex(index: number, length: number): number {
  while (index < 0 || index >= length) {
    if (index < 0) index = -index;
    if (index >= length) index = 2 * length - 2 - index;
  }
  return index;
}

export function stft(interleaved: Float32Array, channels: number, samples: number, nfft: number): ComplexSpec {
  const bins = nfft / 2 + 1;
  const frames = Math.floor(samples / HOP) + 1;
  const real = new Float32Array(channels * bins * frames);
  const imag = new Float32Array(real.length);
  const fft = new FFT(nfft);
  const window = Float64Array.from({ length: nfft }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nfft));
  const time = new Array<number>(nfft * 2);
  const transformed = fft.createComplexArray();
  const scale = 1 / Math.sqrt(nfft);
  for (let channel = 0; channel < channels; channel++) {
    for (let frame = 0; frame < frames; frame++) {
      const first = frame * HOP - nfft / 2;
      for (let i = 0; i < nfft; i++) {
        const sample = interleaved[reflectIndex(first + i, samples) * channels + channel]!;
        time[2 * i] = sample * window[i]!;
        time[2 * i + 1] = 0;
      }
      fft.transform(transformed, time);
      for (let bin = 0; bin < bins; bin++) {
        const at = (channel * bins + bin) * frames + frame;
        real[at] = transformed[2 * bin]! * scale;
        imag[at] = transformed[2 * bin + 1]! * scale;
      }
    }
  }
  return { real, imag, frames, bins, channels };
}

export function istft(specReal: Float32Array, specImag: Float32Array, mask: Float32Array, channels: number, samples: number, nfft: number, frames: number) {
  const bins = nfft / 2 + 1;
  const fft = new FFT(nfft);
  const spectrum = fft.createComplexArray();
  const frameTime = fft.createComplexArray();
  const window = Float64Array.from({ length: nfft }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nfft));
  const output = new Float32Array(samples * channels);
  const weight = new Float64Array(samples);
  const scale = Math.sqrt(nfft);
  for (let channel = 0; channel < channels; channel++) {
    const overlap = new Float64Array(samples + nfft);
    const denom = new Float64Array(samples + nfft);
    for (let frame = 0; frame < frames; frame++) {
      spectrum.fill(0);
      for (let bin = 0; bin < bins; bin++) {
        const at = (channel * bins + bin) * frames + frame;
        const factor = mask[at]!;
        spectrum[2 * bin] = specReal[at]! * factor;
        spectrum[2 * bin + 1] = specImag[at]! * factor;
      }
      for (let bin = 1; bin < bins - 1; bin++) {
        spectrum[2 * (nfft - bin)] = spectrum[2 * bin]!;
        spectrum[2 * (nfft - bin) + 1] = -spectrum[2 * bin + 1]!;
      }
      fft.inverseTransform(frameTime, spectrum);
      const start = frame * HOP;
      for (let i = 0; i < nfft; i++) {
        const target = start + i;
        if (target >= overlap.length) continue;
        overlap[target] += frameTime[2 * i]! * scale * window[i]!;
        denom[target] += window[i]! * window[i]!;
      }
    }
    for (let sample = 0; sample < samples; sample++) {
      const paddedAt = sample + nfft / 2;
      output[sample * channels + channel] = denom[paddedAt]! > 1e-12 ? overlap[paddedAt]! / denom[paddedAt]! : 0;
    }
  }
  return output;
}

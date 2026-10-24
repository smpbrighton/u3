import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Reader } from 'wav';
import { N_FFTS, istft, stft } from './stft.js';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('usage: npx tsx src/validate-stft.ts <float32-stereo.wav>');
const wav = await new Promise<{ data: Float32Array; channels: number; rate: number }>((resolve, reject) => {
  const reader = new Reader();
  const chunks: Buffer[] = [];
  let format: { channels: number; sampleRate: number; bitDepth: number; audioFormat: number };
  reader.on('format', (f) => {
    format = f;
    reader.on('data', (chunk: Buffer) => chunks.push(chunk));
    reader.on('end', () => {
      const pcm = Buffer.concat(chunks);
      resolve({
        data: new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)),
        channels: format.channels,
        rate: format.sampleRate,
      });
    });
  });
  reader.on('error', reject);
  fs.createReadStream(inputPath).pipe(reader);
});
assert.equal(wav.channels, 2);
assert.equal(wav.rate, 44100);
for (const nfft of N_FFTS) {
  const spec = stft(wav.data, wav.channels, wav.data.length / wav.channels, nfft);
  const reconstructed = istft(spec.real, spec.imag, new Float32Array(spec.real.length).fill(1), wav.channels,
    wav.data.length / wav.channels, nfft, spec.frames);
  let maxAbsError = 0;
  for (let i = 0; i < reconstructed.length; i++) maxAbsError = Math.max(maxAbsError, Math.abs(reconstructed[i]! - wav.data[i]!));
  console.log(JSON.stringify({ nfft, maxAbsError }));
  assert.ok(maxAbsError < 2e-4, `n_fft=${nfft} reconstruction max abs error ${maxAbsError}`);
}

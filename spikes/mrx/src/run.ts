import * as ort from 'onnxruntime-node';
import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { Reader, Writer } from 'wav';
import { N_FFTS, istft, stft } from './stft.js';

const [modelPath, inputPath, outputDir, label = 'clip', provider = 'coreml'] = process.argv.slice(2);
if (!modelPath || !inputPath || !outputDir || !['coreml', 'cpu'].includes(provider)) {
  throw new Error('usage: npm run run -- <model.onnx> <input-44k-stereo.wav> <output-dir> <label> <coreml|cpu>');
}

function readWav(path: string): Promise<{ data: Float32Array; channels: number; rate: number }> {
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    const buffers: Buffer[] = [];
    let format: { channels: number; sampleRate: number; bitDepth: number; audioFormat: number };
    reader.on('format', (f) => {
      format = f;
      reader.on('data', (chunk: Buffer) => buffers.push(chunk));
      reader.on('end', () => {
        const pcm = Buffer.concat(buffers);
        if (format.audioFormat !== 3 || format.bitDepth !== 32) return reject(new Error('expected float32 WAV'));
        const data = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
        resolve({ data, channels: format.channels, rate: format.sampleRate });
      });
    });
    reader.on('error', reject);
    fs.createReadStream(path).pipe(reader);
  });
}

function writeWav(path: string, data: Float32Array, channels: number, sampleRate: number) {
  return new Promise<void>((resolve, reject) => {
    const writer = new Writer({ channels, sampleRate, bitDepth: 32, format: 3 });
    writer.on('error', reject);
    writer.on('finish', resolve);
    writer.pipe(fs.createWriteStream(path));
    writer.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    writer.end();
  });
}

function addInPlace(target: Float32Array, source: Float32Array) {
  for (let i = 0; i < target.length; i++) target[i] += source[i]!;
}

const wav = await readWav(inputPath);
if (wav.channels !== 2 || wav.rate !== 44100) throw new Error(`expected 44.1 kHz stereo; got ${wav.rate} Hz/${wav.channels}ch`);
const samples = wav.data.length / 2;
const preparedAt = performance.now();
const specs = N_FFTS.map((nfft) => stft(wav.data, wav.channels, samples, nfft));
const inputTensors: Record<string, ort.Tensor> = {};
for (let idx = 0; idx < specs.length; idx++) {
  const spec = specs[idx]!;
  const shape = [1, wav.channels, spec.bins, spec.frames];
  inputTensors[`spec_${idx}_real`] = new ort.Tensor('float32', spec.real, shape);
  inputTensors[`spec_${idx}_imag`] = new ort.Tensor('float32', spec.imag, shape);
}
fs.mkdirSync(outputDir, { recursive: true });
const logPath = `${outputDir}/${label}-${provider}.log`;
const started = performance.now();
let session: ort.InferenceSession | undefined;
try {
  console.log(`SESSION provider=${provider} fallback=[cpu] input=${inputPath}`);
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: provider === 'coreml' ? [{ name: 'coreml', useCPUOnly: false }, 'cpu'] : ['cpu'],
    logSeverityLevel: 0,
    enableProfiling: true,
    profileFilePrefix: `${outputDir}/${label}-${provider}`,
  });
  const outputs = await session.run(inputTensors);
  const maskTensors = N_FFTS.map((_, idx) => outputs[`masks_${idx}`]!);
  for (const [idx, maskTensor] of maskTensors.entries()) {
    if (maskTensor.dims.length !== 5 || maskTensor.dims[1] !== 3 || maskTensor.dims[2] !== 2 || maskTensor.dims[3] !== specs[idx]!.bins) {
      throw new Error(`unexpected masks_${idx} shape ${maskTensor.dims}`);
    }
  }
  const sourceWaveforms = Array.from({ length: 3 }, () => new Float32Array(samples * wav.channels));
  for (let source = 0; source < 3; source++) {
    for (let resolution = 0; resolution < N_FFTS.length; resolution++) {
      const spec = specs[resolution]!;
      const maskTensor = maskTensors[resolution]!;
      const masks = maskTensor.data as Float32Array;
      const frames = maskTensor.dims[4]!;
      const mask = new Float32Array(spec.real.length);
      for (let channel = 0; channel < wav.channels; channel++) {
        for (let bin = 0; bin < spec.bins; bin++) {
          for (let frame = 0; frame < frames; frame++) {
            const specAt = (channel * spec.bins + bin) * frames + frame;
            const maskAt = (((source * wav.channels + channel) * spec.bins + bin) * frames) + frame;
            mask[specAt] = masks[maskAt]!;
          }
        }
      }
      addInPlace(sourceWaveforms[source]!, istft(spec.real, spec.imag, mask, wav.channels, samples, N_FFTS[resolution]!, frames));
    }
  }
  const voice = sourceWaveforms[1]!;
  const bg = sourceWaveforms[0]!.slice();
  addInPlace(bg, sourceWaveforms[2]!);
  const elapsed = (performance.now() - preparedAt) / 1000;
  await writeWav(`${outputDir}/${label}-${provider}-voice.wav`, voice, wav.channels, wav.rate);
  await writeWav(`${outputDir}/${label}-${provider}-bg.wav`, bg, wav.channels, wav.rate);
  await session.endProfiling();
  const profilePath = fs.readdirSync(outputDir)
    .filter((name) => name.startsWith(`${label}-${provider}_`) && name.endsWith('.json'))
    .sort()
    .at(-1) ?? 'profile-not-found';
  fs.writeFileSync(logPath, `provider=${provider}\nrequestedEP=${provider}\nfallback=CPU allowed\nelapsedSec=${elapsed.toFixed(3)}\nrtf=${(elapsed / (samples / wav.rate)).toFixed(4)}\nsamples=${samples}\noutputShapes=${maskTensors.map((t) => t.dims).join(';')}\nprofile=${profilePath}\n`);
  console.log(`DONE provider=${provider} seconds=${elapsed.toFixed(3)} rtf=${(elapsed / (samples / wav.rate)).toFixed(4)} samples=${samples}`);
} catch (error) {
  fs.writeFileSync(logPath, `provider=${provider}\nrequestedEP=${provider}\nfailed=${String(error)}\n`);
  console.error(`FAILED provider=${provider}: ${String(error)}`);
  process.exitCode = 1;
} finally {
  await session?.release();
}
console.log(`MAX_RSS_MB=${(process.resourceUsage().maxRSS / 1024).toFixed(1)} TOTAL_MEMORY_MB=${(os.totalmem() / 1024 / 1024).toFixed(0)}`);

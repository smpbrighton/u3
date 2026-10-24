import * as ort from 'onnxruntime-node';
import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { Reader, Writer } from 'wav';

const [modelPath, inputPath, outputDir, label = 'clip'] = process.argv.slice(2);
if (!modelPath || !inputPath || !outputDir) {
  throw new Error('usage: npm run run -- <model.onnx> <input-44k-stereo.wav> <output-dir> [label]');
}

function readWav(path: string): Promise<{ data: Float32Array; channels: number; rate: number }> {
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    const buffers: Buffer[] = [];
    reader.on('format', (f) => {
      reader.on('data', (chunk: Buffer) => buffers.push(chunk));
      reader.on('end', () => {
        const pcm = Buffer.concat(buffers);
        const data = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
        resolve({ data, channels: f.channels, rate: f.sampleRate });
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

const wav = await readWav(inputPath);
if (wav.channels !== 2 || wav.rate !== 44100) throw new Error(`expected 44.1 kHz stereo; got ${wav.rate} Hz/${wav.channels}ch`);
const samples = wav.data.length / 2;
const planar = new Float32Array(wav.data.length);
for (let i = 0; i < samples; i++) { planar[i] = wav.data[i * 2]!; planar[samples + i] = wav.data[i * 2 + 1]!; }
const input = new ort.Tensor('float32', planar, [1, 2, samples]);
fs.mkdirSync(outputDir, { recursive: true });
for (const provider of ['coreml', 'cpu'] as const) {
  const logPath = `${outputDir}/${label}-${provider}.log`;
  const started = performance.now();
  try {
    console.log(`SESSION provider=${provider} fallback=[cpu] input=${inputPath}`);
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: provider === 'coreml' ? [{ name: 'coreml', useCPUOnly: false }, 'cpu'] : ['cpu'],
      logSeverityLevel: 0,
      enableProfiling: true,
    });
    const output = await session.run({ audio: input });
    const elapsed = (performance.now() - started) / 1000;
    const stem = output.stems!;
    if (stem.dims.length !== 4 || stem.dims[1] !== 3 || stem.dims[2] !== 2) throw new Error(`unexpected output shape ${stem.dims}`);
    const values = stem.data as Float32Array;
    const separated = [] as Float32Array[];
    for (let s = 0; s < 3; s++) {
      const interleaved = new Float32Array(samples * 2);
      for (let i = 0; i < samples; i++) { interleaved[i * 2] = values[(s * 2) * samples + i]!; interleaved[i * 2 + 1] = values[(s * 2 + 1) * samples + i]!; }
      separated.push(interleaved);
    }
    const voice = separated[1]!;
    const bg = new Float32Array(samples * 2);
    for (let i = 0; i < bg.length; i++) bg[i] = separated[0]![i]! + separated[2]![i]!;
    await writeWav(`${outputDir}/${label}-${provider}-voice.wav`, voice, 2, wav.rate);
    await writeWav(`${outputDir}/${label}-${provider}-bg.wav`, bg, 2, wav.rate);
    const profilePath = await session.endProfiling();
    fs.writeFileSync(logPath, `provider=${provider}\nrequestedEP=${provider}\nprovidersAvailable=check-build-logs\nelapsedSec=${elapsed.toFixed(3)}\nrtf=${(elapsed / (samples / wav.rate)).toFixed(4)}\nsamples=${samples}\noutputShape=${stem.dims}\nprofile=${profilePath}\n`);
    console.log(`DONE provider=${provider} seconds=${elapsed.toFixed(3)} rtf=${(elapsed / (samples / wav.rate)).toFixed(4)} samples=${samples}`);
    await session.release();
  } catch (error) {
    fs.writeFileSync(logPath, `provider=${provider}\nrequestedEP=${provider}\nfailed=${String(error)}\n`);
    console.error(`FAILED provider=${provider}: ${String(error)}`);
  }
}
console.log(`MAX_RSS_MB=${(process.resourceUsage().maxRSS / 1024).toFixed(1)} TOTAL_MEMORY_MB=${(os.totalmem() / 1024 / 1024).toFixed(0)}`);

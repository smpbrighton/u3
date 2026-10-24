import * as ort from "onnxruntime-node";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Reader, Writer } from "wav";
import { HOP, istft, N_FFTS, stft } from "./stft";

const SAMPLE_RATE = 44_100;
const CHANNELS = 2;
// 10초 구간은 MRX 8192 FFT 텐서의 메모리를 제한하고, 2초 겹침은 경계 전후 문맥을 모델에 제공한다.
export const CHUNK_SAMPLES = SAMPLE_RATE * 10;
export const OVERLAP_SAMPLES = SAMPLE_RATE * 2;

export interface AudioBuffer { data: Float32Array; channels: number; rate: number }
export interface StemPair { voice: Float32Array; bg: Float32Array }
export type ChunkSeparator = (chunk: Float32Array, samples: number, signal?: AbortSignal) => Promise<StemPair>;

export function segmentRanges(samples: number): { start: number; end: number }[] {
  const chunk = Math.floor(CHUNK_SAMPLES / HOP) * HOP;
  const overlap = Math.floor(OVERLAP_SAMPLES / HOP) * HOP;
  const stride = chunk - overlap;
  const ranges: { start: number; end: number }[] = [];
  for (let start = 0; start < samples; start += stride) {
    const end = Math.min(samples, start + chunk);
    ranges.push({ start, end });
    if (end === samples) break;
  }
  return ranges;
}

export async function separateChunks(input: AudioBuffer, separateChunk: ChunkSeparator, signal?: AbortSignal, onProgress?: (progress: number) => void): Promise<StemPair> {
  if (input.channels !== CHANNELS || input.rate !== SAMPLE_RATE || input.data.length % CHANNELS) {
    throw new Error("MRX 입력은 44.1 kHz 스테레오여야 합니다");
  }
  const samples = input.data.length / CHANNELS;
  const ranges = segmentRanges(samples);
  const voice = new Float32Array(input.data.length);
  const bg = new Float32Array(input.data.length);
  const weights = new Float32Array(samples);
  for (const [index, range] of ranges.entries()) {
    if (signal?.aborted) throw new Error("음성 분리가 취소되었습니다");
    const chunk = input.data.slice(range.start * CHANNELS, range.end * CHANNELS);
    const output = await separateChunk(chunk, range.end - range.start, signal);
    if (output.voice.length !== chunk.length || output.bg.length !== chunk.length) throw new Error("MRX 출력 길이가 입력과 다릅니다");
    const leftOverlap = index === 0 ? 0 : ranges[index - 1]!.end - range.start;
    const rightOverlap = index === ranges.length - 1 ? 0 : range.end - ranges[index + 1]!.start;
    for (let local = 0; local < range.end - range.start; local++) {
      const fromLeft = leftOverlap ? Math.min(1, (local + 1) / leftOverlap) : 1;
      const fromRight = rightOverlap ? Math.min(1, (range.end - range.start - local) / rightOverlap) : 1;
      const weight = Math.min(fromLeft, fromRight);
      const global = range.start + local;
      weights[global] += weight;
      for (let channel = 0; channel < CHANNELS; channel++) {
        const at = local * CHANNELS + channel;
        const out = global * CHANNELS + channel;
        voice[out] += output.voice[at]! * weight;
        bg[out] += output.bg[at]! * weight;
      }
    }
    onProgress?.((index + 1) / ranges.length);
  }
  for (let sample = 0; sample < samples; sample++) {
    const weight = weights[sample] || 1;
    voice[sample * CHANNELS] /= weight;
    voice[sample * CHANNELS + 1] /= weight;
    bg[sample * CHANNELS] /= weight;
    bg[sample * CHANNELS + 1] /= weight;
  }
  return { voice, bg };
}

export function readFloatWav(file: string): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    const buffers: Buffer[] = [];
    reader.on("format", format => {
      const isFloat32 = format.audioFormat === 3 && format.bitDepth === 32;
      const isPcm16 = format.audioFormat === 1 && format.bitDepth === 16;
      if (!isFloat32 && !isPcm16) {
        reject(new Error("MRX 입력 WAV는 float32 또는 PCM 16-bit여야 합니다"));
        reader.destroy();
        return;
      }
      reader.on("data", (chunk: Buffer) => buffers.push(chunk));
      reader.on("end", () => {
        const pcm = Buffer.concat(buffers);
        const data = isFloat32 ? new Float32Array(pcm.byteLength / 4) : pcm16ToFloat32(pcm);
        if (isFloat32) for (let i = 0; i < data.length; i++) data[i] = pcm.readFloatLE(i * 4);
        resolve({ data, channels: format.channels, rate: format.sampleRate });
      });
    });
    reader.on("error", reject);
    createReadStream(file).pipe(reader);
  });
}

export function pcm16ToFloat32(pcm: Buffer): Float32Array {
  if (pcm.byteLength % 2) throw new Error("PCM 16-bit 데이터 길이가 맞지 않습니다");
  const data = new Float32Array(pcm.byteLength / 2);
  for (let i = 0; i < data.length; i++) data[i] = pcm.readInt16LE(i * 2) / 32768;
  return data;
}

export async function writeFloatWav(file: string, data: Float32Array, channels = CHANNELS, rate = SAMPLE_RATE): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const writer = new Writer({ channels, sampleRate: rate, bitDepth: 32, format: 3 });
    writer.on("error", reject);
    writer.on("finish", resolve);
    writer.pipe(createWriteStream(file));
    const pcm = Buffer.allocUnsafe(data.length * 4);
    for (let i = 0; i < data.length; i++) pcm.writeFloatLE(data[i]!, i * 4);
    writer.write(pcm);
    writer.end();
  });
}

async function modelChunkSeparator(modelPath: string): Promise<{ separate: ChunkSeparator; close: () => Promise<void> }> {
  // 결정 0008: CPU EP만 사용한다. CoreML provider는 등록하지 않는다.
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
  const separate: ChunkSeparator = async (chunk, samples, signal) => {
    if (signal?.aborted) throw new Error("음성 분리가 취소되었습니다");
    const specs = N_FFTS.map(nfft => stft(chunk, CHANNELS, samples, nfft));
    const feeds: Record<string, ort.Tensor> = {};
    specs.forEach((spec, index) => {
      const shape = [1, CHANNELS, spec.bins, spec.frames];
      feeds[`spec_${index}_real`] = new ort.Tensor("float32", spec.real, shape);
      feeds[`spec_${index}_imag`] = new ort.Tensor("float32", spec.imag, shape);
    });
    const outputs = await session.run(feeds);
    if (signal?.aborted) throw new Error("음성 분리가 취소되었습니다");
    const stems = Array.from({ length: 3 }, () => new Float32Array(samples * CHANNELS));
    for (const [resolution, nfft] of N_FFTS.entries()) {
      const spec = specs[resolution]!;
      const tensor = outputs[`masks_${resolution}`];
      if (!tensor || tensor.dims.length !== 5 || tensor.dims[1] !== 3 || tensor.dims[2] !== CHANNELS || tensor.dims[3] !== spec.bins) {
        throw new Error(`MRX masks_${resolution} 출력 형식이 맞지 않습니다`);
      }
      const masks = tensor.data as Float32Array;
      const frames = tensor.dims[4]!;
      for (let source = 0; source < 3; source++) {
        const mask = new Float32Array(spec.real.length);
        for (let channel = 0; channel < CHANNELS; channel++) {
          for (let bin = 0; bin < spec.bins; bin++) {
            for (let frame = 0; frame < frames; frame++) {
              const sourceAt = (((source * CHANNELS + channel) * spec.bins + bin) * frames) + frame;
              const targetAt = (channel * spec.bins + bin) * frames + frame;
              mask[targetAt] = masks[sourceAt]!;
            }
          }
        }
        const separated = istft(spec.real, spec.imag, mask, CHANNELS, samples, nfft, frames);
        const target = stems[source]!;
        for (let i = 0; i < target.length; i++) target[i] += separated[i]!;
      }
    }
    const bg = stems[0]!.slice();
    for (let i = 0; i < bg.length; i++) bg[i] += stems[2]![i]!;
    return { voice: stems[1]!, bg };
  };
  return { separate, close: () => session.release() };
}

export async function separateWav(options: { modelPath: string; inputPath: string; voicePath: string; bgPath: string; signal?: AbortSignal; onProgress?: (progress: number) => void }): Promise<void> {
  const input = await readFloatWav(options.inputPath);
  const model = await modelChunkSeparator(options.modelPath);
  try {
    const stems = await separateChunks(input, model.separate, options.signal, options.onProgress);
    if (options.signal?.aborted) throw new Error("음성 분리가 취소되었습니다");
    await writeFloatWav(options.voicePath, stems.voice, input.channels, input.rate);
    await writeFloatWav(options.bgPath, stems.bg, input.channels, input.rate);
  } finally {
    await model.close();
  }
}

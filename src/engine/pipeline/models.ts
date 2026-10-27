import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface ModelFile { url: string; sha256: string; relativePath: string; size?: number }
export const QWEN_TTS_MODEL_DIR = "Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit";
export const QWEN_TTS_REVISION = "41d3337e8b7f2843a75841595fc14e4b9a7a4b96";
export const QWEN_TOKENIZER_SHA256 = "09267689b8362020b9763b65dd5be7e086b31e28d72e02837a9e781de9a91bc7";
const QWEN_FILES: Array<[string, string, number]> = [
  ["config.json", "43f29f9ab55cf387bd2ce1d07e9d95a5ca8974fa2fda4e2b45c13ae64aad3bfa", 6058],
  ["generation_config.json", "f1b90b4513f3b34c62851049e2492d7b4c5940daf1276f89c82b8ef04127f3aa", 245],
  ["merges.txt", "599bab54075088774b1733fde865d5bd747cbcc7a547c5bc12610e874e26f5e3", 1671839],
  ["model.safetensors", "b696f4bf45f54497b6de758981e76f1410bd68af05a657477dee466b0202df1a", 2393308931],
  ["model.safetensors.index.json", "2551ed02dc288b90cd6b7ec98652433f08ef2ae98fb3eda5248a4b9e5b47d08b", 71786],
  ["preprocessor_config.json", "efdde1022ea9d76928bf7a9cd53139138f5ba2e466e837f08f6105ab1af1c119", 127],
  ["speech_tokenizer/config.json", "ee65bb901c876664ab8707c487157aa1a6ee57c65969b28fb5ec9dc211e68167", 2336],
  ["speech_tokenizer/configuration.json", "6bc26d64eb5024b4d1dab5a52371958b429256d6c9d59787f1f5294a54e0cebd", 76],
  ["speech_tokenizer/model.safetensors", "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258", 682293092],
  ["speech_tokenizer/preprocessor_config.json", "fcb3805e597e786d4067706e602f6688524640f8d3396790e2e09b5942fcbdfb", 234],
  ["tokenizer_config.json", "dc3c31c3bdaedd5016382bb3cbe07323026775ad51f5a4fb564505992ae4a670", 7344],
  ["vocab.json", "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910", 2776833],
];
export const QWEN_TTS_FILES: ModelFile[] = QWEN_FILES.map(([relativePath, sha256, size]) => ({
  relativePath, sha256, size,
  url: `https://huggingface.co/mlx-community/${QWEN_TTS_MODEL_DIR}/resolve/${QWEN_TTS_REVISION}/${relativePath}`,
}));

export async function qwenTtsReady(cacheDir: string): Promise<boolean> {
  const root = path.join(cacheDir, QWEN_TTS_MODEL_DIR);
  for (const file of QWEN_TTS_FILES) {
    const info = await stat(path.join(root, file.relativePath)).catch(() => null);
    if (!info?.isFile() || info.size !== file.size) return false;
  }
  return sha256(path.join(root, "tokenizer.json")).then(hash => hash === QWEN_TOKENIZER_SHA256).catch(() => false);
}

export async function downloadQwenTts(options: {
  cacheDir: string; tokenizerPath: string; signal?: AbortSignal; onProgress?: (progress: number) => void;
  fetcher?: typeof fetch; files?: ModelFile[]; tokenizerSha256?: string;
}): Promise<string> {
  const checkAbort = () => { if (options.signal?.aborted) throw new Error("TTS 모델 받기를 취소했습니다"); };
  checkAbort();
  if (await sha256(options.tokenizerPath) !== (options.tokenizerSha256 ?? QWEN_TOKENIZER_SHA256)) throw new Error("tokenizer.json SHA-256 검사가 실패했습니다");
  const root = path.join(options.cacheDir, QWEN_TTS_MODEL_DIR);
  const files = options.files ?? QWEN_TTS_FILES;
  const total = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  let done = 0;
  for (const file of files) {
    checkAbort();
    await downloadModelFile({ file, destination: path.join(root, file.relativePath), signal: options.signal, fetcher: options.fetcher,
      onProgress: received => options.onProgress?.(total ? Math.min(1, (done + received) / total) : 0) });
    done += file.size ?? (await stat(path.join(root, file.relativePath))).size;
  }
  checkAbort();
  await mkdir(root, { recursive: true });
  const temporary = path.join(root, "tokenizer.json.part");
  try {
    await copyFile(options.tokenizerPath, temporary);
    checkAbort();
    await rename(temporary, path.join(root, "tokenizer.json"));
  } finally { await rm(temporary, { force: true }); }
  options.onProgress?.(1);
  return root;
}
export const WHISPER_MODEL: ModelFile = {
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin",
  sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
  relativePath: "ggml-large-v3-turbo-q5_0.bin",
  size: 574_041_195,
};

const BGE_REVISION = "4de13258303883538bd53b696b452bf8099f0858";
export const BGE_FILES: ModelFile[] = [
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/config.json`, sha256: "734a79bf12d388c1467a4e3ab625f45de7f6906cffcfb93a1eca1787504bed95", relativePath: "config.json" },
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/sentencepiece.bpe.model`, sha256: "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865", relativePath: "sentencepiece.bpe.model", size: 5_069_051 },
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/special_tokens_map.json`, sha256: "8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835", relativePath: "special_tokens_map.json" },
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/tokenizer.json`, sha256: "6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790", relativePath: "tokenizer.json", size: 17_082_821 },
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/tokenizer_config.json`, sha256: "7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4", relativePath: "tokenizer_config.json" },
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/onnx/model.onnx`, sha256: "5d89a0010dd39aa2cfa8b22bb49f06904c5bbf5877135f877da419480f40cde3", relativePath: "onnx/model.onnx", size: 607_298 },
  { url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/onnx/model.onnx_data`, sha256: "1eebfb28493f67bba03ce0ef64bfdc7fc5a3bd9d7493f818bb1d78cd798416b4", relativePath: "onnx/model.onnx_data", size: 2_266_820_608 },
];

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => createReadStream(file).on("data", chunk => hash.update(chunk)).on("error", reject).on("end", resolve));
  return hash.digest("hex");
}

export async function bgeM3Ready(cacheDir: string): Promise<boolean> {
  const root = path.join(cacheDir, "Xenova/bge-m3");
  const modelMarker = await stat(path.join(cacheDir, "models--Xenova--bge-m3")).catch(() => null);
  if (!modelMarker?.isDirectory()) return false;
  for (const file of BGE_FILES) {
    const info = await stat(path.join(root, file.relativePath)).catch(() => null);
    if (!info?.isFile() || (file.size !== undefined && info.size !== file.size)) return false;
  }
  return true;
}

export async function downloadModelFile(options: {
  file: ModelFile;
  destination: string;
  signal?: AbortSignal;
  onProgress?: (received: number, total: number | null) => void;
  fetcher?: typeof fetch;
}): Promise<void> {
  const { file, destination, signal } = options;
  await mkdir(path.dirname(destination), { recursive: true });
  const existingFile = await stat(destination).catch(() => null);
  if (existingFile?.isFile() && (!file.size || existingFile.size === file.size) && await sha256(destination) === file.sha256) {
    options.onProgress?.(existingFile.size, file.size ?? existingFile.size);
    return;
  }
  const temporary = `${destination}.part`;
  try {
    const existing = await stat(temporary).then(info => info.size).catch(() => 0);
    const response = await (options.fetcher ?? fetch)(file.url, {
      signal,
      headers: existing ? { Range: `bytes=${existing}-` } : undefined,
    });
    if (!(response.ok || response.status === 206) || !response.body) throw new Error(`모델 다운로드 HTTP ${response.status}`);
    if (existing && response.status !== 206) await rm(temporary, { force: true });
    const offset = existing && response.status === 206 ? existing : 0;
    const rangeTotal = /^bytes\s+\d+-\d+\/(\d+)$/i.exec(response.headers.get("content-range") ?? "")?.[1];
    const totalBytes = Number(rangeTotal ?? response.headers.get("content-length")) || file.size || null;
    const writer = await import("node:fs").then(fs => fs.createWriteStream(temporary, { flags: offset ? "a" : "w" }));
    const reader = response.body.getReader();
    let received = offset;
    try {
      for (;;) {
        if (signal?.aborted) throw new Error("모델 다운로드를 취소했습니다");
        const { done, value } = await reader.read();
        if (done) break;
        if (!writer.write(Buffer.from(value))) await new Promise<void>(resolve => writer.once("drain", resolve));
        received += value.byteLength;
        options.onProgress?.(received, totalBytes);
      }
      await new Promise<void>((resolve, reject) => {
        writer.once("error", reject);
        writer.end(resolve);
      });
    } catch (error) {
      reader.cancel().catch(() => undefined);
      writer.destroy();
      throw error;
    }
    const actualSize = (await stat(temporary)).size;
    if (file.size && actualSize !== file.size) throw new Error(`모델 크기가 맞지 않습니다 (${actualSize} != ${file.size})`);
    if (await sha256(temporary) !== file.sha256) throw new Error("모델 SHA-256 검사가 실패했습니다");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function downloadBgeM3(options: { cacheDir: string; signal?: AbortSignal; onProgress?: (progress: number) => void }): Promise<string> {
  // Transformers.js의 요청 URL 캐시와 W6a meme-embed.ts의 모델 디렉터리 확인을 모두 맞춘다.
  const root = path.join(options.cacheDir, "Xenova/bge-m3");
  await mkdir(path.join(options.cacheDir, "models--Xenova--bge-m3"), { recursive: true });
  let done = 0;
  const total = BGE_FILES.reduce((sum, file) => sum + (file.size ?? 0), 0);
  for (const file of BGE_FILES) {
    const destination = path.join(root, file.relativePath);
    await downloadModelFile({
      file,
      destination,
      signal: options.signal,
      onProgress: received => {
        const base = done;
        options.onProgress?.(Math.min(1, (base + received) / total));
      },
    });
    done += file.size ?? (await stat(destination)).size;
  }
  return path.join(root, "onnx/model.onnx");
}

export async function downloadWhisper(options: { cacheDir: string; signal?: AbortSignal; onProgress?: (progress: number) => void }): Promise<string> {
  const destination = path.join(options.cacheDir, WHISPER_MODEL.relativePath);
  await downloadModelFile({ file: WHISPER_MODEL, destination, signal: options.signal, onProgress: (received, total) => options.onProgress?.(total ? received / total : 0) });
  return destination;
}

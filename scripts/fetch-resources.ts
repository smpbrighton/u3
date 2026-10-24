import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const target = join(root, "src-tauri/resources");
const library = process.env.UUU_LIBRARY_DIR ?? "/Volumes/X31/workspace/smp_workspace/uUu/data/library";
const embed = process.env.UUU_EMBED_DIR ?? "/Volumes/X31/workspace/smp_workspace/uUu/data/cache/meme-embed";
const mrx = process.env.U3_MRX_MODEL ?? "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/model/mrx-mask-int8.onnx";
const cache = process.env.U3_BUILD_CACHE ?? join(homedir(), "Library/Caches/u3-build");
const mrxSha256 = "8e65265d4d2ed452255af7e18d56ae3b3dd623322dc89c4151cd83e70bf6dca8";
const sileroSha256 = "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987";
const silero = join(cache, "ggml-silero-v6.2.0.bin");
const emotionSlugs: Record<string, string> = {
  "뿌듯함": "proud",
  "감동": "touched",
  "인정": "agree",
  "의심": "doubt",
  "기대": "anticipation",
  "억울": "injustice",
  "소름": "chills",
  "부끄러움": "embarrassed",
  "분노": "anger",
  "체념": "resignation",
  "당황": "confused",
  "웃음": "laugh",
  "귀찮음": "annoyed",
  "놀람": "surprised",
};

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function requireHash(file: string, expected: string, label: string): Promise<void> {
  if (await sha256(file) !== expected) throw new Error(`${label} SHA-256 검사가 실패했습니다: ${file}`);
}

async function requireDirectory(dir: string, label: string): Promise<void> {
  try {
    await readdir(dir);
  } catch {
    throw new Error(`${label} 경로를 읽을 수 없습니다: ${dir}`);
  }
}

export async function copyLibrary(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  const memes = join(destination, "memes");
  const emotions = await readdir(memes);
  for (const [emotion, slug] of Object.entries(emotionSlugs)) {
    if (emotions.includes(emotion)) await rename(join(memes, emotion), join(memes, slug));
  }
}

async function main(): Promise<void> {
  await requireDirectory(library, "UUU_LIBRARY_DIR");
  await requireDirectory(embed, "UUU_EMBED_DIR");
  await mkdir(join(target, "models"), { recursive: true });
  await cp(join(root, "assets/fonts"), join(target, "assets/fonts"), { recursive: true, force: true });
  await copyLibrary(library, join(target, "library"));
  await cp(embed, join(target, "library/meme-embed"), { recursive: true, force: true });

  try {
    await requireHash(mrx, mrxSha256, "MRX int8 모델");
  } catch (error) {
    throw new Error(`MRX int8 모델을 찾지 못했거나 체크섬이 다릅니다. docs/spikes/mrx.md와 spikes/mrx/export_model.py, prepare.sh, compare_quantize.py의 export·quantize 절차를 실행하세요. ${error instanceof Error ? error.message : ""}`);
  }
  await cp(mrx, join(target, "models/mrx.int8.onnx"));

  await mkdir(cache, { recursive: true });
  try {
    await readFile(silero);
  } catch {
    execFileSync("curl", ["-fL", "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin", "-o", silero], { stdio: "inherit" });
  }
  await requireHash(silero, sileroSha256, "Silero VAD 모델");
  await cp(silero, join(target, "models/ggml-silero-v6.2.0.bin"));

  const notices = join(target, "licenses");
  await mkdir(notices, { recursive: true });
  const legalSources = [
    ["MIT-MRX.txt", "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mrx/source/pinned/cocktail-fork-separation-19b3de827ebc4bfb014570cf92dd32b4ee3b6921/LICENSE.md"],
    ["MIT-whisper.cpp.txt", join(process.env.U3_BUILD_CACHE ?? join(homedir(), "Library/Caches/u3-build"), "whisper.cpp-1.9.5/LICENSE")],
    ["MIT-whisper-vad.txt", "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/whisper/whisper.cpp-1.9.5/LICENSE"],
    ["OFL-BlackHanSans.txt", "/Volumes/X31/workspace/smp_workspace/uUu/out/ui/fonts/BlackHanSans-LICENSE.txt"],
    ["OFL-Pretendard.txt", "/Volumes/X31/workspace/smp_workspace/uUu/out/ui/fonts/Pretendard-LICENSE.txt"],
  ];
  for (const [name, source] of legalSources) await cp(source, join(notices, name));
  await writeFile(join(notices, "THIRD-PARTY.txt"), "U3 includes third-party assets and software. License texts are in this directory.\n");
  process.stdout.write("앱 라이브러리와 모델 리소스를 복사하고 체크섬을 확인했습니다.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

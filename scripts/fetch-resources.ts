import { cp, lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const defaultTarget = join(root, "src-tauri/resources");
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

export async function fetchResources(target = defaultTarget, commonOnly = false): Promise<void> {
  const archiveRoot = process.env.U3_RESOURCE_ROOT;
  if (archiveRoot) {
    await validateResourceManifest(archiveRoot);
    for (const directory of ["library/memes", "library/sfx", "meme-embed", "models", "licenses"]) {
      if (!(await readdir(join(archiveRoot, directory))).length) throw new Error(`리소스가 비었습니다: ${directory}`);
    }
    const licenseRoot = process.env.U3_LICENSE_ROOT ?? join(archiveRoot, "licenses");
    await requireHash(join(archiveRoot, "models/mrx.int8.onnx"), mrxSha256, "MRX int8 모델");
    await requireHash(join(archiveRoot, "models/ggml-silero-v6.2.0.bin"), sileroSha256, "Silero VAD 모델");
    for (const name of ["MIT-MRX.txt", "MIT-whisper.cpp.txt", "MIT-whisper-vad.txt", "OFL-BlackHanSans.txt", "OFL-Pretendard.txt"]) await readFile(join(licenseRoot, name));
    await mkdir(target, { recursive: true });
    await copyLibrary(join(archiveRoot, "library"), join(target, "library"));
    await cp(join(archiveRoot, "meme-embed"), join(target, "library/meme-embed"), { recursive: true });
    await cp(join(archiveRoot, "models"), join(target, "models"), { recursive: true });
    await cp(licenseRoot, join(target, "licenses"), { recursive: true });
    await cp(join(root, "assets/fonts"), join(target, "assets/fonts"), { recursive: true });
    // Mac의 Swift·MLX 고지는 실제 Mac 리소스를 넣을 때만 아래에서 준비한다.
    if (process.platform !== "darwin" || commonOnly) return;
  } else {
    if (process.platform !== "darwin") throw new Error("Windows 패키징에는 U3_RESOURCE_ROOT가 필요합니다");
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
  }
  const notices = join(target, "licenses");
  if (commonOnly) return;
  const mlxRoot = join(cache, "u3-tts/checkouts/mlx-swift");
  const qwenSwiftRoot = join(cache, "u3-tts/checkouts/swift-qwen3-tts");
  const mlxLicense = await readFile(join(mlxRoot, "LICENSE"), "utf8");
  const qwenSwiftReadme = await readFile(join(qwenSwiftRoot, "README.md"), "utf8");
  if (!/## License\s+MIT/.test(qwenSwiftReadme)) throw new Error("swift-qwen3-tts의 MIT 고지를 확인하지 못했습니다");
  await writeFile(join(notices, "MIT-mlx-swift.txt"), mlxLicense);
  await writeFile(join(notices, "MIT-swift-qwen3-tts.txt"),
    "swift-qwen3-tts, AtomGradient. Revision 27a5b5b2c5d55258bead2c6e851208987e1ca225.\nhttps://github.com/AtomGradient/swift-qwen3-tts\nThe pinned README identifies the license as MIT. The standard MIT text follows.\n\n" + mlxLicense.replace("Copyright (c) 2023 ml-explore", "Copyright (c) AtomGradient"));
  const qwenLicense = join(cache, "Qwen3-TTS-APACHE-2.0.txt");
  try { await requireHash(qwenLicense, "a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655", "Qwen3-TTS 라이선스"); }
  catch {
    execFileSync("curl", ["-fL", "https://raw.githubusercontent.com/QwenLM/Qwen3-TTS/022e286b98fbec7e1e916cb940cdf532cd9f488e/LICENSE", "-o", qwenLicense], { stdio: "inherit" });
    await requireHash(qwenLicense, "a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655", "Qwen3-TTS 라이선스");
  }
  await writeFile(join(notices, "Apache-2.0-Qwen3-TTS.txt"),
    "Qwen3-TTS by Qwen Team. tokenizer.json is generated from vocab.json, merges.txt and tokenizer_config.json.\nSource: https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit/tree/41d3337e8b7f2843a75841595fc14e4b9a7a4b96\nOriginal model: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice\nLicense: Apache-2.0.\n\n" + await readFile(qwenLicense, "utf8"));
  await writeFile(join(notices, "THIRD-PARTY.txt"), "U3 includes third-party assets and software. License texts are in this directory.\n");
  process.stdout.write("앱 라이브러리와 모델 리소스를 복사하고 체크섬을 확인했습니다.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await fetchResources();

export async function resourceFiles(directory: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("리소스 심볼릭 링크는 허용하지 않습니다");
    if (entry.isDirectory()) result.push(...await resourceFiles(join(directory, entry.name), name));
    else if (entry.isFile() && name !== "manifest.json") result.push(name);
    else if (!entry.isFile()) throw new Error("리소스 파일 형식을 확인하세요");
  }
  return result.sort();
}
export async function validateResourceManifest(directory: string): Promise<void> {
  if (!(await lstat(directory)).isDirectory()) throw new Error("리소스 root가 디렉터리가 아닙니다");
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as { files?: Record<string, string> };
  if (!manifest.files || !Object.keys(manifest.files).length) throw new Error("리소스 manifest가 비었습니다");
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (!name || /[\\:]/.test(name) || name.startsWith("/") || name.split("/").some(part => !part || part === ".." || part === ".") || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("리소스 manifest 경로·hash 오류");
  }
  const actual = await resourceFiles(directory);
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error("리소스 파일 목록이 manifest와 다릅니다");
  for (const name of actual) await requireHash(join(directory, name), manifest.files[name]!, "리소스");
}

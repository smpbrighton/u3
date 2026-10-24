import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWhisperOutput } from "../src/core/transcript";
import { readFloatWav, separateWav } from "../src/engine/pipeline/separate";
import { runFfmpeg } from "../src/engine/pipeline/ffmpeg";
import { transcribeAudio } from "../src/engine/pipeline/whisper";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spikeCache = process.env.U3_SPIKE_CACHE_DIR ?? "/Volumes/X31/workspace/smp_workspace/u3-spike-cache";
const whisperRoot = path.join(spikeCache, "whisper");
const mrxRoot = path.join(spikeCache, "mrx");
const whisperCli = process.env.U3_WHISPER_CLI ?? path.join(whisperRoot, "build/bin/whisper-cli");
const whisperModel = process.env.U3_WHISPER_MODEL ?? path.join(whisperRoot, "ggml-large-v3-turbo-q5_0.bin");
const sileroModel = process.env.U3_SILERO_MODEL ?? path.join(whisperRoot, "ggml-silero-v6.2.0.bin");
const mrxModel = process.env.U3_MRX_MODEL ?? path.join(mrxRoot, "model/mrx-mask-int8.onnx");
const fixture = path.join(root, "tests/fixtures/project/input/ko-5s.wav");

async function present(file: string): Promise<boolean> {
  return access(file).then(() => true).catch(() => false);
}

async function makeFixture(work: string): Promise<string> {
  if (await present(fixture)) return fixture;
  const aiff = path.join(work, "ko-5s.aiff");
  const generated = path.join(work, "ko-5s.wav");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("say", ["-v", "Yuna", "안녕하세요. 모델 검증을 진행합니다.", "-o", aiff], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`say 종료 코드 ${code}`)));
  });
  await runFfmpeg(["-i", aiff, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", generated]);
  return generated;
}

async function main() {
  const missing: string[] = [];
  for (const file of [whisperCli, whisperModel, sileroModel, mrxModel]) if (!await present(file)) missing.push(file);
  if (missing.length) {
    console.error("실제 모델 검증을 하려면 아래 파일을 준비하세요:");
    for (const file of missing) console.error(`- ${file}`);
    console.error("U3_SPIKE_CACHE_DIR 또는 U3_WHISPER_CLI, U3_WHISPER_MODEL, U3_SILERO_MODEL, U3_MRX_MODEL 환경 변수로 경로를 지정할 수 있습니다.");
    process.exitCode = 1;
    return;
  }
  const work = await mkdtemp(path.join(os.tmpdir(), "u3-test-models-"));
  try {
    const source = await makeFixture(work);
    const transcript = await transcribeAudio({ file: source, whisperPath: whisperCli, modelPath: whisperModel, vadModelPath: sileroModel });
    const words = parseWhisperOutput(transcript);
    if (!words.length || !words.some(word => word.text.trim())) throw new Error("실제 whisper 결과에 글자가 없습니다");
    console.log(`whisper: 비어 있지 않은 ${words.length}개 항목, ${words.map(word => word.text).join(" ").slice(0, 100)}`);

    const normalized = path.join(work, "mrx-input.wav");
    const voice = path.join(work, "voice.wav");
    const bg = path.join(work, "bg.wav");
    await runFfmpeg(["-i", source, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_f32le", normalized]);
    const input = await readFloatWav(normalized);
    await separateWav({ modelPath: mrxModel, inputPath: normalized, voicePath: voice, bgPath: bg });
    const voiceWav = await readFloatWav(voice);
    const bgWav = await readFloatWav(bg);
    if (voiceWav.data.length !== input.data.length || bgWav.data.length !== input.data.length) {
      throw new Error(`MRX 출력 길이가 입력과 다릅니다 (입력 ${input.data.length}, voice ${voiceWav.data.length}, bg ${bgWav.data.length})`);
    }
    console.log(`MRX: input=${input.data.length / 2} samples, voice=${voiceWav.data.length / 2}, bg=${bgWav.data.length / 2}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`test:models 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

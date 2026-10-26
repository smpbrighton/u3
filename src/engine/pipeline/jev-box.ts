import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JevResponse, type JevBoxQuestion } from "../../core/jev-api";
import type { CarouselBox } from "../../core/carousel";
import { ffprobe, runFfmpeg } from "./ffmpeg";

export const JEV_BOX_MODEL = "jev-1.14.0";
export const JEV_BOX_MIN_CONFIDENCE = 0.5;

export type JevBoxResult = { box: CarouselBox | null; confidence: number | null; usage: { input_tokens: number; output_tokens: number }; model: string };

async function fitBoxImage(file: string): Promise<{ file: string; cleanup?: string }> {
  let width: number, height: number;
  try {
    const probe = await ffprobe(file); const stream = probe.streams.find(item => item.codec_type === "video");
    width = stream?.width ?? 0; height = stream?.height ?? 0;
  } catch { return { file }; }
  if (!width || !height) return { file };
  const scale = Math.min(1568 / Math.max(width, height), Math.max(1, 280 / Math.min(width, height)));
  const fittedWidth = Math.max(2, Math.round(width * scale / 2) * 2);
  const fittedHeight = Math.max(2, Math.round(height * scale / 2) * 2);
  if (fittedWidth === width && fittedHeight === height) return { file };
  if (Math.max(fittedWidth, fittedHeight) > 1568 || Math.min(fittedWidth, fittedHeight) < 280) throw new Error("TypeSafe Box 이미지 크기를 지원 범위로 맞출 수 없습니다");
  const dir = await mkdtemp(path.join(os.tmpdir(), "u3-jev-box-")); const output = path.join(dir, "frame.png");
  await runFfmpeg(["-i", file, "-vf", `scale=${fittedWidth}:${fittedHeight}`, "-frames:v", "1", output]);
  return { file: output, cleanup: dir };
}

/** 한 프레임을 TypeSafe Box로 보내고 낮은 confidence 답은 비운다. */
export async function askJevBox(input: {
  imagePath: string; target: string; apiKey?: string; enabled?: boolean; fetchImpl?: typeof fetch;
}): Promise<JevBoxResult> {
  if (input.enabled === false || !input.apiKey) return { box: null, confidence: null, usage: { input_tokens: 0, output_tokens: 0 }, model: JEV_BOX_MODEL };
  const photo = randomUUID();
  const question: JevBoxQuestion = { type: "box", instructions: `${input.target} in \`photo\`` };
  const payload = {
    model: JEV_BOX_MODEL,
    state: { photo },
    assets: { [photo]: { type: "image", part: "frame" } },
    questions: { target: question },
  };
  const fitted = await fitBoxImage(input.imagePath);
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(payload)], { type: "application/json" }));
  form.append("frame", new Blob([await readFile(fitted.file)], { type: "image/png" }), "frame.png");
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}`, "TypeSafe-Danger-Zone-Images": "true" },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`TypeSafe Box 연결 실패: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (fitted.cleanup) await rm(fitted.cleanup, { recursive: true, force: true });
  }
  if (!response.ok) throw new Error(`TypeSafe Box ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const parsed = JevResponse.safeParse(await response.json());
  if (!parsed.success) throw new Error(`TypeSafe Box 응답 형식이 다릅니다: ${parsed.error.message.slice(0, 300)}`);
  const answer = parsed.data.answers.target;
  if (!answer || answer.type !== "box") throw new Error("TypeSafe Box 응답에 target 상자가 없습니다");
  return {
    box: answer.confidence >= JEV_BOX_MIN_CONFIDENCE ? answer.box : null,
    confidence: answer.confidence,
    usage: { input_tokens: parsed.data.usage.input_tokens, output_tokens: parsed.data.usage.output_tokens },
    model: parsed.data.model,
  };
}

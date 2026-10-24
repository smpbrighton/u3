import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "../src/core/schema";
import { timelineToRender } from "../src/core/timeline/to-render";
import { renderShort } from "../src/engine/pipeline/render";

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests/fixtures/project");
const outputDir = path.join(root, "out/smoke");
const outputPath = path.join(outputDir, "u3-short.mp4");

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

async function startFixtureServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Range" }).end(); return; }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    let file: string;
    try { file = Buffer.from(new URL(req.url ?? "/", "http://localhost").pathname.slice(1), "base64url").toString(); }
    catch { res.writeHead(400).end(); return; }
    const resolved = path.resolve(file);
    if (!resolved.startsWith(fixtureRoot + path.sep)) { res.writeHead(403).end(); return; }
    const info = await stat(resolved).catch(() => null);
    if (!info?.isFile()) { res.writeHead(404).end(); return; }
    const headers: Record<string, string | number> = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges", "Accept-Ranges": "bytes", "Content-Type": resolved.endsWith(".jpg") ? "image/jpeg" : resolved.endsWith(".wav") ? "audio/wav" : "video/mp4" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (req.headers.range && !range) { res.writeHead(416).end(); return; }
    const start = range ? Number(range[1] || Math.max(0, info.size - Number(range[2]))) : 0;
    const end = range ? Math.min(Number(range[2] || info.size - 1), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) { res.writeHead(416).end(); return; }
    headers["Content-Length"] = end - start + 1;
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(resolved, { start, end }).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string", "미디어 서버가 포트를 열지 못했습니다");
  return {
    url: (file: string) => `http://127.0.0.1:${address.port}/${Buffer.from(path.resolve(file)).toString("base64url")}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function framePixel(file: string, frame: number, out: string) {
  await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-vf", `select=eq(n\\,${frame}),crop=2:2:24:24,scale=1:1:flags=neighbor,format=rgb24`, "-vsync", "0", "-frames:v", "1", "-f", "rawvideo", out]);
  return readFile(out);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const fixture = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
  const media = await startFixtureServer();
  try {
    const expected = timelineToRender(fixture.timeline);
    const inputRecords = fixture.inputs.map((input) => ({ ...input, url: media.url(path.join(fixtureRoot, input.file)) }));
    await renderShort({
      timeline: fixture.timeline,
      inputs: inputRecords,
      projectFolder: fixtureRoot,
      libraryFolder: path.join(fixtureRoot, "library"),
      outputPath,
      resolveMediaUrl: media.url,
      onProgress: ({ progress }) => { if (progress === 1) console.log("render: 100%"); },
    });

    const { stdout: probeOut } = await execFile("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", outputPath]);
    const probe = JSON.parse(probeOut) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }[]; format: { duration: string } };
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    assert(video?.width === 1080 && video.height === 1920, `해상도가 1080×1920이 아닙니다: ${video?.width}×${video?.height}`);
    assert(video.r_frame_rate === "30/1", `fps가 30이 아닙니다: ${video.r_frame_rate}`);
    const actualFrames = Number(video.nb_frames ?? Math.round(Number(probe.format.duration) * 30));
    assert(Math.abs(actualFrames - expected.durationInFrames) <= 1, `길이가 다릅니다: expected ${expected.durationInFrames} frames, got ${actualFrames}`);
    assert(probe.streams.some((stream) => stream.codec_type === "audio"), "오디오 스트림이 없습니다");

    const { stderr: volumeLog } = await execFile("ffmpeg", ["-hide_banner", "-i", outputPath, "-af", "volumedetect", "-f", "null", "-"]);
    const maxVolume = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(volumeLog)?.[1];
    assert(maxVolume !== undefined && Number(maxVolume) > -60, `오디오가 무음이거나 매우 작습니다: ${maxVolume ?? "측정 없음"}`);

    const trimmed = expected.video.find((item) => item.id === "video-trimmed");
    assert(trimmed?.sourceStartFrame !== undefined, "자른 영상 구간을 fixture에서 찾지 못했습니다");
    const [renderedPixel, sourcePixel] = await Promise.all([
      framePixel(outputPath, trimmed.startFrame, path.join(outputDir, "rendered-edge.rgb")),
      framePixel(path.join(fixtureRoot, "input/video.mp4"), trimmed.sourceStartFrame, path.join(outputDir, "source-edge.rgb")),
    ]);
    const delta = Math.max(...[0, 1, 2].map((i) => Math.abs(renderedPixel[i]! - sourcePixel[i]!)));
    assert(delta <= 28, `자른 클립 경계 픽셀이 원본 시각과 다릅니다: RGB 최대 차이 ${delta}`);

    console.log(`✓ smoke passed: 1080×1920, 30fps, ${actualFrames} frames, audio max ${maxVolume} dB, cut edge RGB delta ${delta}`);
  } finally {
    await media.close();
  }
}

main().catch((error) => {
  console.error(`smoke 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

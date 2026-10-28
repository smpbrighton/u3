import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
    const allowedRoots = [fixtureRoot, outputDir].map(root => path.resolve(root));
    if (!allowedRoots.some(root => resolved.startsWith(root + path.sep))) { res.writeHead(403).end(); return; }
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

async function framePixels(file: string, frame: number, out: string, rendered: boolean, x = 0.5, y = 0.5) {
  const size = rendered ? 128 : 64;
  const width = rendered ? 1080 : 540;
  const height = rendered ? 1920 : 960;
  const left = Math.round(x * width - size / 2);
  const top = Math.round(y * height - size / 2);
  const crop = `crop=${size}:${size}:${left}:${top}${rendered ? ",scale=64:64:flags=area" : ""}`;
  // Windows 번들 ffmpeg 에는 rawvideo 머서가 없다. image2pipe 로 raw 프레임을 stdout 에 받아 파일에도 남긴다.
  // Windows 번들 ffmpeg 에는 select 필터도 없다. 입력 seek(-ss) 로 프레임 시각을 찾는다(두 입력 모두 30fps).
  const { stdout } = await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", ...(frame > 0 ? ["-ss", (frame / 30).toFixed(6)] : []), "-i", file, "-vf", `${crop},format=rgb24`, "-frames:v", "1", "-c:v", "rawvideo", "-f", "image2pipe", "pipe:1"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  await writeFile(out, stdout);
  assert(stdout.length === 64 * 64 * 3, `프레임 추출 결과가 64×64 RGB 가 아닙니다: ${path.basename(file)} frame ${frame} → ${stdout.length} bytes`);
  return stdout;
}

function pixelMae(a: Buffer, b: Buffer): number {
  assert(a.length === b.length, "비교할 프레임의 크기가 다릅니다");
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference += Math.abs(a[i]! - b[i]!);
  return difference / a.length;
}

function blendPixelRatio(blend: Buffer, a: Buffer, b: Buffer): number {
  let between = 0;
  for (let i = 0; i < blend.length; i++) {
    const low = Math.min(a[i]!, b[i]!) - 12;
    const high = Math.max(a[i]!, b[i]!) + 12;
    if (blend[i]! >= low && blend[i]! <= high) between++;
  }
  return between / blend.length;
}

function wavData(file: Buffer): Buffer {
  assert(file.toString("ascii", 0, 4) === "RIFF" && file.toString("ascii", 8, 12) === "WAVE", "WAV 파일이 아닙니다");
  let offset = 12;
  while (offset + 8 <= file.length) {
    const id = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    if (id === "data") return file.subarray(offset + 8, Math.min(file.length, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data 청크가 없습니다");
}

function peakDb(pcm: Buffer): number {
  let peak = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
  return peak === 0 ? -Infinity : 20 * Math.log10(peak / 32768);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const fixture = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
  const libraryFolder = path.join(outputDir, "library");
  for (const id of ["meme-front", "meme-back"]) {
    const folder = path.join(libraryFolder, "memes", "smoke");
    await mkdir(folder, { recursive: true });
    await copyFile(path.join(fixtureRoot, "input/video.mp4"), path.join(folder, `${id}.mp4`));
    await writeFile(path.join(folder, `${id}.json`), JSON.stringify({ id, emotion: "smoke", situations: [], importedAt: "", tagsConfirmed: true }));
  }
  const media = await startFixtureServer();
  try {
    const expected = timelineToRender(fixture.timeline);
    const inputRecords = fixture.inputs.map((input) => ({ ...input, url: media.url(path.join(fixtureRoot, input.file)) }));
    await renderShort({
      timeline: fixture.timeline,
      inputs: inputRecords,
      projectFolder: fixtureRoot,
      libraryFolder,
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

    // Windows 번들 ffmpeg 에는 volumedetect 필터가 없다. PCM 으로 풀어 Node 에서 최대 음량을 잰다.
    // raw s16le muxer 도 Windows 빌드에 없으므로 WAV 로 풀어 data 청크를 읽는다.
    const wavPath = path.join(outputDir, "u3-short.wav");
    await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", outputPath, "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", "-f", "wav", wavPath]);
    const maxVolume = peakDb(wavData(await readFile(wavPath)));
    assert(Number.isFinite(maxVolume) && maxVolume > -60, `오디오가 무음이거나 매우 작습니다: ${Number.isFinite(maxVolume) ? maxVolume.toFixed(1) : "측정 없음"}`);

    const trimmed = expected.video.find((item) => item.id === "video-trimmed");
    assert(trimmed?.sourceStartFrame !== undefined, "자른 영상 구간을 fixture에서 찾지 못했습니다");
    const sourceFile = path.join(fixtureRoot, "input/video.mp4");
    const renderedFrame = await framePixels(outputPath, trimmed.startFrame, path.join(outputDir, "rendered-edge.rgb"), true);
    const candidates = await Promise.all(Array.from({ length: 11 }, async (_, index) => {
      const sourceFrame = trimmed.sourceStartFrame! - 5 + index;
      const pixels = await framePixels(sourceFile, sourceFrame, path.join(outputDir, `source-edge-${sourceFrame}.rgb`), false);
      return { sourceFrame, pixels, mae: pixelMae(renderedFrame, pixels) };
    }));
    const nearest = [...candidates].sort((a, b) => a.mae - b.mae)[0]!;
    const nearestWrong = candidates.filter((candidate) => Math.abs(candidate.sourceFrame - trimmed.sourceStartFrame!) > 1).sort((a, b) => a.mae - b.mae)[0];
    let minFrameSeparation = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) minFrameSeparation = Math.min(minFrameSeparation, pixelMae(candidates[i]!.pixels, candidates[j]!.pixels));
    }
    assert(Math.abs(nearest.sourceFrame - trimmed.sourceStartFrame) <= 1, `자른 클립 경계가 원본 시각에서 벗어났습니다: 기대 ${trimmed.sourceStartFrame}±1, 최근접 ${nearest.sourceFrame} (MAE ${nearest.mae.toFixed(2)})`);
    assert(nearestWrong && nearestWrong.mae - nearest.mae > 4, `경계 후보 프레임의 색 차이가 충분하지 않습니다: 최근접 오차 ${nearest.mae.toFixed(2)}, 잘못된 프레임 오차 ${nearestWrong?.mae.toFixed(2)}`);
    assert(minFrameSeparation > 20, `경계 주변 fixture 프레임의 색 차이가 작습니다: 최소 MAE ${minFrameSeparation.toFixed(2)}`);

    const dissolve = expected.transitions.find((item) => item.fromId === "video-opening" && item.toId === "photo-insert");
    assert(dissolve?.kind.kind === "dissolve", "영상 1 경계 디졸브 fixture를 찾지 못했습니다");
    const dissolveFrame = dissolve.startFrame + Math.floor(dissolve.durationInFrames / 2);
    const dissolvePixels = await framePixels(outputPath, dissolveFrame, path.join(outputDir, "dissolve.rgb"), true);
    const beforePixels = await framePixels(sourceFile, 25, path.join(outputDir, "dissolve-before.rgb"), false);
    const afterPixels = await framePixels(path.join(fixtureRoot, "input/photo.jpg"), 0, path.join(outputDir, "dissolve-after.rgb"), false);
    const transitionMaeBefore = pixelMae(dissolvePixels, beforePixels);
    const transitionMaeAfter = pixelMae(dissolvePixels, afterPixels);
    const sourceMae = pixelMae(beforePixels, afterPixels);
    const betweenRatio = blendPixelRatio(dissolvePixels, beforePixels, afterPixels);
    assert(transitionMaeBefore > 0 && transitionMaeAfter > 0, "디졸브 가운데 프레임이 경계 양쪽 원본 프레임과 같으면 안 됩니다");
    assert(transitionMaeBefore < sourceMae && transitionMaeAfter < sourceMae, `디졸브 가운데 프레임이 양쪽 원본의 혼합 범위에 없습니다: ${transitionMaeBefore.toFixed(2)}, ${transitionMaeAfter.toFixed(2)}, source ${sourceMae.toFixed(2)}`);
    assert(betweenRatio > 0.7, `디졸브 가운데 픽셀이 양쪽 원본 픽셀 사이에 있지 않습니다: ${(betweenRatio * 100).toFixed(1)}%`);

    const overlay = expected.overlay.find((item) => item.id === "overlay-smoke");
    assert(overlay?.kind === "meme", "겹친 짤 fixture를 찾지 못했습니다");
    const overlayFrame = overlay.startFrame + 5;
    const overlaySource = expected.video.find((item) => overlayFrame >= item.startFrame && overlayFrame < item.startFrame + item.durationInFrames);
    assert(overlaySource?.sourceStartFrame !== undefined, "겹친 짤 아래에서 재생할 영상 프레임을 찾지 못했습니다");
    const sourceFrame = overlaySource.sourceStartFrame + overlayFrame - overlaySource.startFrame;
    const overlayPixels = await framePixels(outputPath, overlayFrame, path.join(outputDir, "overlay-center.rgb"), true);
    const sourceCenterPixels = await framePixels(sourceFile, sourceFrame, path.join(outputDir, "overlay-source-center.rgb"), false);
    const overlayMae = pixelMae(overlayPixels, sourceCenterPixels);
    assert(overlayMae > 5, `겹친 영상 구간의 중심 픽셀이 바뀌지 않았습니다: MAE ${overlayMae.toFixed(2)}`);
    const outsidePixels = await framePixels(outputPath, overlayFrame, path.join(outputDir, "overlay-outside.rgb"), true, 0.1, 0.5);
    const sourceOutsidePixels = await framePixels(sourceFile, sourceFrame, path.join(outputDir, "overlay-source-outside.rgb"), false, 0.1, 0.5);
    const outsideMae = pixelMae(outsidePixels, sourceOutsidePixels);
    assert(outsideMae < 12, `겹친 창 바깥에 아래 영상이 보이지 않습니다: MAE ${outsideMae.toFixed(2)}`);

    console.log(`✓ smoke passed: 1080×1920, 30fps, ${actualFrames} frames, audio max ${maxVolume.toFixed(1)} dB, cut edge source frame ${nearest.sourceFrame} (MAE ${nearest.mae.toFixed(2)}, separation ${minFrameSeparation.toFixed(2)}), dissolve MAE ${transitionMaeBefore.toFixed(2)}/${transitionMaeAfter.toFixed(2)} (${(betweenRatio * 100).toFixed(1)}% in range), overlay center MAE ${overlayMae.toFixed(2)}, outside MAE ${outsideMae.toFixed(2)}`);
  } finally {
    await media.close();
  }
}

main().catch((error) => {
  console.error(`smoke 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

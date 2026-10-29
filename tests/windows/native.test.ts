import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const enabled = process.platform === "win32" && process.env.U3_WINDOWS_NATIVE === "1";
const execute = promisify(execFile);
const resources = path.resolve(process.env.U3_WINDOWS_RESOURCE_DIR ?? "src-tauri/resources");
const compositor = path.join(resources, "node_modules/@remotion/compositor-win32-x64-msvc");
const token = "u3-windows-native-fixture";
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const run = (bin: string, args: string[], timeout = 120_000) => execute(bin, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024, cwd: process.cwd() });
let root: string, child: ChildProcessWithoutNullStreams, closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>, origin: string;
const headers = { authorization: `Bearer ${token}`, origin: "http://tauri.localhost", "content-type": "application/json" };
const request = (url: string, options: RequestInit = {}) => fetch(origin + url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30_000) });

describe.skipIf(!enabled)("Windows packaged native", () => {
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3 Windows 한 글 "));
    const chrome = (await readFile(path.join(resources, "chrome-path.txt"), "utf8")).trim();
    child = spawn(path.join(resources, "node.exe"), [path.join(resources, "engine.mjs")], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, U3_TOKEN: token, U3_DATA_DIR: path.join(root, "데이터"), TAURI_ORIGIN: "http://tauri.localhost",
        U3_RESOURCE_DIR: resources, U3_LIBRARY_DIR: path.join(resources, "library"), U3_FONT_DIR: path.join(resources, "assets/fonts"),
        U3_WHISPER_CLI: path.join(resources, "bin/whisper-cli.exe"), U3_KEY_STORE_CLI: path.join(resources, "bin/u3-key-store.exe"),
        U3_CHROME_EXECUTABLE: path.join(resources, "chrome", chrome), U3_REMOTION_BUNDLE: path.join(resources, "remotion-bundle"),
        FFMPEG_BIN: path.join(compositor, "ffmpeg.exe"), FFPROBE_BIN: path.join(compositor, "ffprobe.exe") },
    });
    closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
    let output = "", errors = "";
    child.stderr.setEncoding("utf8").on("data", text => { errors = (errors + text).slice(-2000); });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`PORT 응답이 없습니다: ${errors}`)), 30_000);
      child.stdout.setEncoding("utf8").on("data", text => {
        output += text; const match = /^PORT (\d+)$/m.exec(output);
        if (match) { origin = `http://127.0.0.1:${match[1]}`; clearTimeout(timer); resolve(); }
      });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error(`엔진이 부팅 중 종료했습니다: ${errors}`)); });
    });
  }, 60_000);
  afterAll(async () => {
    if (child?.exitCode === null) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      child.stdin.end();
      try { await Promise.race([closed, new Promise(resolve => { timer = setTimeout(() => { child.kill(); resolve(null); }, 6000); })]); }
      finally { if (timer) clearTimeout(timer); }
    }
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("부팅·저장·재열기와 한글 미디어 URL을 처리한다", async () => {
    expect(await (await request("/api/health")).json()).toEqual({ ok: true });
    expect(await (await request("/api/system")).json()).toMatchObject({ platform: "win32", capabilities: { tts: false } });
    const created = await request("/api/projects", { method: "POST", body: JSON.stringify({ name: "한글 영상 프로젝트" }) });
    expect(created.status).toBe(201);
    const project = await created.json() as { id: string; name: string };
    const source = path.join(root, "원본 영상.mp4");
    await copyFile("tests/fixtures/project/input/video.mp4", source);
    const imported = await request(`/api/projects/${project.id}/inputs`, { method: "POST", body: JSON.stringify({ files: [{ path: source, kind: "video" }] }) });
    expect(imported.ok).toBe(true);
    const saved = await imported.json() as { id: string; inputs: Array<{ file: string }> };
    expect(saved.inputs).toHaveLength(1);
    expect(await (await request(`/api/projects/${project.id}`)).json()).toMatchObject({ id: project.id, name: project.name, inputs: saved.inputs });
    const media = await request(`/api/media/projects/${project.id}/${saved.inputs[0]!.file.split(/[\\/]/).map(encodeURIComponent).join("/")}`);
    expect(media.status).toBe(200);
    expect((await media.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
  it("토큰·Origin·drive·UNC·역슬래시 traversal을 거절한다", async () => {
    expect((await fetch(origin + "/api/health")).status).toBe(401);
    expect((await request("/api/health", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await request("/api/health", { headers: { origin: "https://evil.example" } })).status).toBe(403);
    for (const file of ["C:%5cWindows%5cwin.ini", "%5c%5cserver%5cshare%5cfile", "..%5csecret", "..%2fsecret"]) {
      expect((await request(`/api/media/library/${file}`)).status, file).toBe(403);
    }
  });
  it("직접 TTS·모델 요청도 job 생성 전에 거절한다", async () => {
    for (const url of ["/api/projects/none/tts", "/api/models/download"]) {
      const response = await request(url, { method: "POST", body: JSON.stringify({ model: "qwen-tts", items: [{ captionId: "a", text: "문장" }] }) });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "unsupported-platform" } });
    }
    const events = await request("/api/events"), reader = events.body!.getReader();
    let text = "", jobs: Array<{ kind: string }> | undefined;
    try {
      while (!jobs) {
        const chunk = await reader.read(); if (chunk.done) throw new Error("ready 이벤트가 없습니다");
        text += new TextDecoder().decode(chunk.value);
        for (const block of text.split("\n\n").slice(0, -1)) {
          if (block.includes("event: ready")) jobs = JSON.parse(/^data: ?(.+)$/m.exec(block)![1]!).jobs;
        }
      }
    } finally { await reader.cancel(); }
    expect(jobs.some(job => job.kind === "tts")).toBe(false);
  });
  it("staged Node의 CPU ONNX 추론과 ffmpeg atempo를 실행한다", async () => {
    const model = Buffer.from("0808120775332d746573743a500a190a05696e70757412066f757470757422084964656e7469747912086964656e746974795a130a05696e707574120a0a08080112040a02080162140a066f7574707574120a0a08080112040a0208014202100d", "hex");
    expect(digest(model)).toBe("ee7f7b25b5887da764c9fa96fc99ba4924e94143b1d27f6622cbf40e3df5f3e0");
    const modelPath = path.join(root, "identity.onnx"); await writeFile(modelPath, model);
    const script = `const load=require('node:module').createRequire(${JSON.stringify(path.join(resources, "engine.mjs"))}); const ort=load('onnxruntime-node'); (async()=>{ const session=await ort.InferenceSession.create(${JSON.stringify(modelPath)},{executionProviders:['cpu']}); const result=await session.run({input:new ort.Tensor('float32',Float32Array.of(7),[1])}); console.log(result.output.data[0]); await session.release(); process.exit(0); })().catch(()=>process.exit(1));`;
    expect((await run(path.join(resources, "node.exe"), ["-e", script])).stdout.trim()).toBe("7");
    const audio = path.join(root, "배속 음성.wav");
    await run(path.join(compositor, "ffmpeg.exe"), ["-y", "-i", "tests/fixtures/project/input/ko-5s.wav", "-af", "atempo=1.25", audio]);
    const probe = JSON.parse((await run(path.join(compositor, "ffprobe.exe"), ["-v", "error", "-show_format", "-of", "json", audio])).stdout);
    expect(Number(probe.format.duration)).toBeGreaterThan(0);
  }, 120_000);
  it("실제 MRX CPU 모델로 음성을 분리하고 세션을 닫는다", async () => {
    const script = `import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict'; import {writeFloatWav,separateWav} from './src/engine/pipeline/separate.ts';
      const input=${JSON.stringify(path.join(root, "무음.wav"))},voice=${JSON.stringify(path.join(root, "목소리.wav"))},bg=${JSON.stringify(path.join(root, "배경.wav"))};
      const complete=file=>{const wav=readFileSync(file); assert.equal(wav.length,44+44100*4,'writeFloatWav 반환 전에 PCM 쓰기가 끝나야 합니다: '+file); assert.equal(wav.toString('ascii',0,4),'RIFF'); assert.equal(wav.readUInt32LE(40),44100*4);};
      await writeFloatWav(input,new Float32Array(44100)); complete(input);
      await separateWav({modelPath:${JSON.stringify(path.join(resources, "models/mrx.int8.onnx"))},inputPath:input,voicePath:voice,bgPath:bg});
      complete(voice); complete(bg); process.stdout.write('MRX_DONE'); process.exit(0);`;
    expect((await run(path.join(resources, "node.exe"), ["--import", "tsx", "--input-type=module", "-e", script], 300_000)).stdout).toContain("MRX_DONE");
    expect((await stat(path.join(root, "목소리.wav"))).size).toBeGreaterThan(44);
    expect((await stat(path.join(root, "배경.wav"))).size).toBeGreaterThan(44);
  }, 310_000);
  it("DPAPI 저장·교체·삭제·변조 거절과 사용자 DACL을 검사한다", async () => {
    const helper = path.join(resources, "bin/u3-key-store.exe"), file = path.join(root, "비밀 저장소/jev-key.dpapi"), key = "fixture-windows-key-한글";
    const call = (op: string, input?: string) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const process = spawn(helper, [op, file], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      process.stdout.setEncoding("utf8").on("data", text => { stdout += text; }); process.stderr.setEncoding("utf8").on("data", text => { stderr += text; });
      process.on("error", reject); process.on("close", code => resolve({ code, stdout, stderr })); process.stdin.end(input);
    });
    expect((await call("read")).code).toBe(44);
    expect(await call("write", key)).toEqual({ code: 0, stdout: "", stderr: "" });
    expect((await readFile(file)).includes(Buffer.from(key))).toBe(false);
    expect((await call("read")).stdout).toBe(key);
    expect((await call("write", "replacement")).code).toBe(0);
    expect((await call("read")).stdout).toBe("replacement");
    const acl = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$acl=Get-Acl -LiteralPath $env:U3_NATIVE_KEY_FILE; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach($rule in $acl.Access) { if($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid) { exit 1 } }; if(-not $acl.AreAccessRulesProtected) {exit 2}"], { windowsHide: true, env: { ...process.env, U3_NATIVE_KEY_FILE: file } });
    expect(acl.stderr).toBe("");
    await writeFile(file, "corrupt");
    expect(await call("read")).toEqual({ code: 1, stdout: "", stderr: "" });
    expect((await call("delete")).code).toBe(0); expect((await call("read")).code).toBe(44);
  }, 30_000);
  it("동봉 Chrome으로 한글 캐러셀 PNG를 만든다", async () => {
    const { renderCarouselSlide } = await import("../../src/engine/pipeline/render");
    const { startMediaServer } = await import("../../src/engine/pipeline/media-server");
    const { Carousel, newSlide } = await import("../../src/core/carousel");
    const background = path.join(root, "배경.png"), output = path.join(root, "결과 장.png");
    await run(path.join(compositor, "ffmpeg.exe"), ["-y", "-i", "tests/fixtures/project/input/video.mp4", "-frames:v", "1", background]);
    const server = await startMediaServer({ roots: { images: root }, token });
    try {
      const slide = { ...newSlide({ kind: "topic" }, "4:5"), texts: newSlide({ kind: "topic" }, "4:5").texts.map(text => ({ ...text, text: "한글 확인" })), background: { kind: "generated" as const, image: { file: "배경.png" } } };
      const stamp = new Date().toISOString(), carousel = Carousel.parse({ id: "native", name: "한글 캐러셀", topic: "검증", aspect: "4:5", slides: [slide], createdAt: stamp, savedAt: stamp });
      await renderCarouselSlide({ carousel, slide, imageUrl: server.url("images", "배경.png"), outputPath: output });
      expect((await readFile(output)).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const probe = JSON.parse((await run(path.join(compositor, "ffprobe.exe"), ["-v", "error", "-show_streams", "-of", "json", output])).stdout);
      expect(probe.streams[0]).toMatchObject({ width: 1080, height: 1350 });
    } finally { await server.close(); }
  }, 120_000);
  it("고정 Whisper 모델과 한국어 fixture로 단어 시각을 만든다", async () => {
    const fixture = "tests/fixtures/project/input/ko-5s.wav";
    expect(digest(await readFile(fixture))).toBe("9b4b267c50118bc4e154402590404ab5e3694f7092151d952d49163736e68347");
    const { downloadWhisper } = await import("../../src/engine/pipeline/models");
    const { transcribeAudio, runWhisperCli } = await import("../../src/engine/pipeline/whisper");
    const { parseWhisperOutput } = await import("../../src/core/transcript");
    const started = Date.now();
    const log = (message: string) => console.error(`[Windows Whisper ${(Date.now() - started) / 1000}s] ${message}`);
    log("모델 다운로드 시작");
    let lastProgress = -1;
    const modelPath = await downloadWhisper({ cacheDir: path.join(process.env.U3_BUILD_CACHE!, "native-models"), signal: AbortSignal.timeout(180_000), onProgress: progress => {
      const step = Math.floor(progress * 10);
      if (step > lastProgress) { lastProgress = step; log(`모델 다운로드 ${step * 10}%`); }
    } });
    log(`모델 다운로드·SHA-256 확인 완료: ${(await stat(modelPath)).size} bytes`);
    const output = await transcribeAudio({ file: path.resolve(fixture), whisperPath: path.join(resources, "bin/whisper-cli.exe"), modelPath, vadModelPath: path.join(resources, "models/ggml-silero-v6.2.0.bin"), signal: AbortSignal.timeout(390_000), run: async options => {
      log(`ffmpeg 변환 완료·CLI 시작: ${JSON.stringify(options.args)}`);
      await runWhisperCli(options);
      log("CLI 종료·JSON 읽기 시작");
    } });
    log("JSON 읽기 완료");
    expect(parseWhisperOutput(output).length).toBeGreaterThan(0);
  }, 600_000);
  it("stdin 종료 뒤 엔진이 0으로 종료하고 데이터 파일 잠금을 해제한다", async () => {
    child.stdin.end();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Windows 엔진 종료 시간 초과")), 6000); })]).finally(() => { if (timer) clearTimeout(timer); });
    expect(result).toEqual({ code: 0, signal: null });
    const source = path.join(root, "데이터"), moved = path.join(root, "닫힌 데이터");
    await rename(source, moved); await rename(moved, source);
  }, 10_000);
});

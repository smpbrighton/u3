import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFloatWav } from "../../src/engine/pipeline/separate";

const children = new Set<ReturnType<typeof spawn>>();

afterEach(async () => {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
});

describe("engine process lifecycle", () => {
  it("exits after its parent closes stdin", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "u3-engine-process-test-"));
    const child = spawn(process.execPath, ["--import", "tsx", "src/engine/main.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, U3_TOKEN: "secret", U3_DATA_DIR: dataRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`엔진이 PORT 응답을 보내지 않았습니다: ${output}`)), 15_000);
      child.stdout.on("data", () => {
        if (output.includes("PORT ")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("엔진이 stdin 종료 뒤 2초 안에 끝나지 않았습니다")), 2_000);
      child.once("exit", code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).toBe(0);
    children.delete(child);
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("releases an onnxruntime session before exiting after stdin closes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-engine-onnx-exit-test-"));
    const modelPath = path.join(root, "identity.onnx");
    const model = Buffer.from("0808120775332d746573743a500a190a05696e70757412066f757470757422084964656e7469747912086964656e746974795a130a05696e707574120a0a08080112040a02080162140a066f7574707574120a0a08080112040a0208014202100d", "hex");
    await writeFile(modelPath, model);
    const script = `
      import * as ort from "onnxruntime-node";
      import { Jobs } from "./src/engine/jobs.ts";
      import { done } from "./src/engine/jobs.ts";
      import { installEngineShutdown } from "./src/engine/shutdown.ts";
      const session = await ort.InferenceSession.create(${JSON.stringify(modelPath)});
      const jobs = new Jobs();
      jobs.start({ kind: "separate", label: "onnx lifecycle", cancellable: true }, async ({ signal }) => {
        process.stdout.write("SESSION_READY\\n");
        try {
          await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
          return done();
        } finally {
          await session.release();
          process.stdout.write("SESSION_RELEASED\\n");
        }
      });
      installEngineShutdown({ jobs });
      process.stdin.resume();
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`ONNX 세션 준비 응답이 없습니다: ${errors}`)), 15_000);
      child.stdout.on("data", () => {
        if (output.includes("SESSION_READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        reject(new Error(`ONNX 자식 프로세스가 준비 전에 끝났습니다(${code}): ${errors}`));
      });
    });

    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`엔진이 세션을 정리하지 못했습니다: ${output} ${errors}`)), 5_000);
      child.once("exit", code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).toBe(0);
    expect(output).toContain("SESSION_RELEASED");
    children.delete(child);
    await rm(root, { recursive: true, force: true });
  }, 30_000);

  it.skipIf(!process.env.U3_TEST_MRX_MODEL || !process.env.U3_TEST_BGE_CACHE)("exits cleanly after MRX and Transformers ONNX sessions are both used", async () => {
    const mrxModel = process.env.U3_TEST_MRX_MODEL;
    const bgeCache = process.env.U3_TEST_BGE_CACHE;
    if (!mrxModel || !bgeCache) throw new Error("모델 경로 검사가 통과한 뒤 모델 환경 변수가 없습니다");
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-engine-two-onnx-exit-test-"));
    const wavPath = path.join(root, "silence.wav");
    await writeFloatWav(wavPath, new Float32Array(44_100 * 2));
    const script = `
      import { separateWav } from "./src/engine/pipeline/separate.ts";
      import { bgeM3Embedder } from "./src/engine/pipeline/meme-embed.ts";
      import { Jobs } from "./src/engine/jobs.ts";
      import { done } from "./src/engine/jobs.ts";
      import { installEngineShutdown } from "./src/engine/shutdown.ts";
      const embedder = bgeM3Embedder({ cacheDir: ${JSON.stringify(bgeCache)} });
      await separateWav({ modelPath: ${JSON.stringify(mrxModel)}, inputPath: ${JSON.stringify(wavPath)}, voicePath: ${JSON.stringify(path.join(root, "voice.wav"))}, bgPath: ${JSON.stringify(path.join(root, "bg.wav"))} });
      await embedder.embed(["짤 순위 종료 확인"]);
      const jobs = new Jobs();
      jobs.start({ kind: "separate", label: "two onnx lifecycle", cancellable: true }, async ({ signal }) => {
        process.stdout.write("BOTH_SESSIONS_READY\\n");
        try {
          await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
          return done();
        } finally {
          await embedder.dispose();
          process.stdout.write("BOTH_SESSIONS_RELEASED\\n");
        }
      });
      installEngineShutdown({ jobs });
      process.stdin.resume();
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`두 ONNX 세션 준비 응답이 없습니다: ${errors}`)), 20_000);
      child.stdout.on("data", () => {
        if (output.includes("BOTH_SESSIONS_READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        reject(new Error(`두 ONNX 자식 프로세스가 준비 전에 끝났습니다(${code}): ${errors}`));
      });
    });

    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`두 ONNX 세션을 정리하지 못했습니다: ${output} ${errors}`)), 5_000);
      child.once("exit", code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(output).toContain("BOTH_SESSIONS_RELEASED");
    expect(exitCode).toBe(0);
    children.delete(child);
    await rm(root, { recursive: true, force: true });
  }, 180_000);

  it("exits within the shutdown limit when a job does not finish after abort", async () => {
    const script = `
      import { installEngineShutdown } from "./src/engine/shutdown.ts";
      installEngineShutdown({ jobs: { shutdown: () => new Promise(() => {}) } });
      process.stdout.write("READY\\n");
      process.stdin.resume();
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`가짜 작업 프로세스가 준비되지 않았습니다: ${output}`)), 10_000);
      child.stdout.on("data", () => {
        if (output.includes("READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    const closingStarted = Date.now();
    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("가짜 작업을 강제 정리하지 못했습니다")), 5_000);
      child.once("exit", code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).toBe(0);
    expect(Date.now() - closingStarted).toBeLessThan(5_000);
    children.delete(child);
  }, 20_000);
});

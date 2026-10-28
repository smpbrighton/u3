import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexScript } from "../../src/core/schema";
import { checkScriptStyle } from "../../src/core/script-style";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { readUsage } from "../../src/engine/pipeline/usage";
import { Store } from "../../src/engine/store";

const { runScript } = vi.hoisted(() => ({ runScript: vi.fn() }));
vi.mock("../../src/engine/pipeline/codex", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/engine/pipeline/codex")>(),
  codexCliRunner: () => ({ runScript }),
}));

const roots: string[] = [];
beforeEach(() => runScript.mockReset());
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

function script(caption: string, inputIndex = 1) {
  return CodexScript.parse({ scenes: [{ inputIndex, startSec: 0, endSec: 2, caption, reaction: null, sfxCategory: null }] });
}

function result(output: CodexScript, warnings = [{ inputId: "video", warning: "말소리가 없어요" }]) {
  return { output, usage: { input_tokens: 10, output_tokens: 5 }, transcriptWarnings: warnings };
}

async function recommend() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-script-style-"));
  roots.push(root);
  const store = new Store(root);
  const project = await store.createProject("대본");
  await store.saveProject({ ...project, inputs: [{ id: "video", kind: "video", file: "input.mp4", durationSec: 3 }] });
  await store.saveSettings({ scriptPrompt: "저장한 기본 지침", scriptTone: "말투 설정", scriptPersona: "성격 설정", scriptReview: "읽지 않을 옛 검수 설정" });
  const jobs = new Jobs();
  const app = createApp({ store, jobs, token: "token", codexPath: async () => "fake-codex", jevKey: async () => null, resourceDir: path.join(root, "resources"), transcribeInput: async () => ({ text: "" }) });
  const response = await app.request(`/api/projects/${project.id}/script/recommend`, {
    method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify({ mode: "direct", prompt: "사용자 요청", images: ["frame.png"] }),
  });
  expect(response.status).toBe(202);
  const job = await jobs.wait((await response.json() as { id: string }).id);
  expect(job.status, job.error ?? "작업 완료").toBe("done");
  const saved = JSON.parse(await readFile(path.join(store.projectDir(project.id), "script.json"), "utf8"));
  return { result: job.result as { script: CodexScript; draft: CodexScript; styleWarnings: string[]; transcriptWarnings: unknown }, saved, root };
}

describe("대본 검사와 한 번 재생성", () => {
  it("생성한 메인·서브 자막의 별표를 이스케이프해 응답과 저장본에 쓴다", async () => {
    const draft = script("*직접* 써 봤어. 너는 어때? 😊");
    draft.scenes[0]!.subCaption = "*Try* it";
    runScript.mockResolvedValue(result(draft));
    const done = await recommend();
    expect(done.saved.scenes[0]).toMatchObject({ caption: String.raw`\*직접\* 써 봤어. 너는 어때? 😊`, subCaption: String.raw`\*Try\* it` });
    expect(done.result.script).toEqual(done.saved);
    expect(done.result.draft).toEqual(draft);
  });
  it("위반이 없으면 한 번만 생성하고 옛 검수 설정을 읽지 않는다", async () => {
    const draft = script("직접 써 봤어. 너는 어때? 😊");
    runScript.mockResolvedValue(result(draft));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(1);
    expect(done.result).toMatchObject({ script: draft, draft, styleWarnings: [], transcriptWarnings: [{ inputId: "video", warning: "말소리가 없어요" }] });
    expect(done.result).not.toHaveProperty("reviewResult");
    expect(done.result).not.toHaveProperty("reviewWarning");
    expect(runScript.mock.calls[0]![0].prompt).not.toContain("읽지 않을 옛 검수 설정");
    expect(done.saved).toEqual(draft);
    expect((await readUsage(done.root)).map(entry => entry.amount)).toEqual([15]);
  });

  it("위반 목록을 원래 프롬프트 뒤에 붙여 한 번만 다시 생성한다", async () => {
    const draft = script("좋아요. ㅋㅋ");
    const regenerated = script("직접 써 봤어. 너는 어때? 😊");
    runScript.mockImplementationOnce(async request => {
      await request.prepareImages();
      return result(draft);
    }).mockResolvedValueOnce(result(regenerated, []));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    const [first, second] = runScript.mock.calls.map(call => call[0]);
    expect(second.prompt).toBe(`${first.prompt}\n\n## 이전 초안에서 고칠 것\n${checkScriptStyle(draft).map(warning => `- ${warning}`).join("\n")}`);
    expect(first.prompt).toContain("사용자 요청");
    expect(first.prompt).toContain("말투 설정");
    expect(first.prompt).toContain("성격 설정");
    expect(second.images).toEqual(["frame.png"]);
    expect(first.transcribe).toBeTypeOf("function");
    expect(second.transcribe).toBeUndefined();
    expect(done.result).toMatchObject({ script: regenerated, draft, styleWarnings: [], transcriptWarnings: [{ inputId: "video", warning: "말소리가 없어요" }] });
    expect(done.saved).toEqual(regenerated);
    expect((await readUsage(done.root)).map(entry => entry.amount)).toEqual([15, 15]);
  });

  it.each([
    ["좋아요. ㅋㅋ", "좋아요.", "좋아요."],
    ["좋아요.", "좋아요. ㅋㅋ", "좋아요."],
    ["좋아요.", "맞습니다.", "좋아요."],
  ])("두 결과에도 위반이 남으면 위반 수가 적은 결과를 저장한다: %s → %s", async (first, second, chosen) => {
    runScript.mockResolvedValueOnce(result(script(first))).mockResolvedValueOnce(result(script(second)));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    expect(done.result.script).toEqual(script(chosen));
    expect(done.result.styleWarnings).toEqual(checkScriptStyle(script(chosen)));
    expect(done.saved).toEqual(script(chosen));
  });

  it("재생성 호출이 실패하면 초안과 남은 위반을 보존한다", async () => {
    const draft = script("좋아요.");
    runScript.mockResolvedValueOnce(result(draft)).mockRejectedValueOnce(new Error("Codex 실패"));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    expect(done.result.script).toEqual(draft);
    expect(done.result.styleWarnings).toEqual(expect.arrayContaining(checkScriptStyle(draft)));
    expect(done.result.styleWarnings).toContainEqual(expect.stringContaining("Codex 실패"));
    expect(done.saved).toEqual(draft);
  });

  it("재생성 결과의 입력 범위가 잘못되면 초안을 보존한다", async () => {
    const draft = script("좋아요.");
    runScript.mockResolvedValueOnce(result(draft)).mockResolvedValueOnce(result(script("직접 써 봤어.", 2)));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    expect(done.result.script).toEqual(draft);
    expect(done.result.styleWarnings).toContainEqual(expect.stringContaining("입력 항목 번호"));
    expect(done.saved).toEqual(draft);
  });
});

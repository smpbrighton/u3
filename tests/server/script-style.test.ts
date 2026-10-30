import { BUNDLED_PROMPT_DEFAULTS, type PromptDefaults } from "../../src/core/default-prompts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexScript } from "../../src/core/schema";
import { checkScriptStyle } from "../../src/core/script-style";
import { DEFAULT_CAPTION_GUIDE } from "../../src/core/script-prompt";
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

async function recommend(defaults?: PromptDefaults, voice: Record<string, string | undefined> = { scriptTone: "말투 설정", scriptPersona: "성격 설정" }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-script-style-"));
  roots.push(root);
  const store = new Store(root);
  const project = await store.createProject("대본");
  await store.saveProject({ ...project, inputs: [{ id: "video", kind: "video", file: "input.mp4", durationSec: 3 }] });
  await store.saveSettings({ scriptPrompt: defaults ? undefined : "저장한 기본 지침", ...voice, scriptReview: "읽지 않을 옛 검수 설정" });
  const jobs = new Jobs();
  const app = createApp({ promptDefaults: defaults ? async () => defaults : undefined, store, jobs, token: "token", codexPath: async () => "fake-codex", jevKey: async () => null, resourceDir: path.join(root, "resources"), transcribeInput: async () => ({ text: "" }) });
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
    const draft = script("좋아요!!");
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
    expect(first.prompt).toContain(`전역 자막 지침:\n${DEFAULT_CAPTION_GUIDE.trim()}`);
    expect(second.images).toEqual(["frame.png"]);
    expect(first.transcribe).toBeTypeOf("function");
    expect(second.transcribe).toBeUndefined();
    expect(done.result).toMatchObject({ script: regenerated, draft, styleWarnings: [], transcriptWarnings: [{ inputId: "video", warning: "말소리가 없어요" }] });
    expect(done.saved).toEqual(regenerated);
    expect((await readUsage(done.root)).map(entry => entry.amount)).toEqual([15, 15]);
  });

  it.each([
    ["좋아요!!", "좋아요!! ?!", "좋아요!!"],
    ["좋아요!! ?!", "좋아요!!", "좋아요!!"],
    ["좋아요!!", "좋아?!", "좋아요!!"],
  ])("두 결과에도 위반이 남으면 위반 수가 적은 결과를 저장한다: %s → %s", async (first, second, chosen) => {
    runScript.mockResolvedValueOnce(result(script(first))).mockResolvedValueOnce(result(script(second)));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    expect(done.result.script).toEqual(script(chosen));
    expect(done.result.styleWarnings).toEqual(checkScriptStyle(script(chosen)));
    expect(done.saved).toEqual(script(chosen));
  });

  it("재생성 호출이 실패하면 초안과 남은 위반을 보존한다", async () => {
    const draft = script("좋아요!!");
    runScript.mockResolvedValueOnce(result(draft)).mockRejectedValueOnce(new Error("Codex 실패"));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    expect(done.result.script).toEqual(draft);
    expect(done.result.styleWarnings).toEqual(expect.arrayContaining(checkScriptStyle(draft)));
    expect(done.result.styleWarnings).toContainEqual(expect.stringContaining("Codex 실패"));
    expect(done.saved).toEqual(draft);
  });

  it("재생성 결과의 입력 범위가 잘못되면 초안을 보존한다", async () => {
    const draft = script("좋아요!!");
    runScript.mockResolvedValueOnce(result(draft)).mockResolvedValueOnce(result(script("직접 써 봤어.", 2)));
    const done = await recommend();
    expect(runScript).toHaveBeenCalledTimes(2);
    expect(done.result.script).toEqual(draft);
    expect(done.result.styleWarnings).toContainEqual(expect.stringContaining("입력 항목 번호"));
    expect(done.saved).toEqual(draft);
  });
});

it("대본 생성은 주입한 현재 기본값으로 시작한다", async () => {
  runScript.mockResolvedValue(result(script("직접 써 봤어. 너는 어때? 😊")));
  await recommend({ ...BUNDLED_PROMPT_DEFAULTS, schema: 1, revision: 2, script: "원격 대본 지침", carouselTopic: "원격 주제", carouselVideo: "원격 영상" });
  expect(runScript.mock.calls[0]![0].prompt.startsWith("원격 대본 지침\n\n")).toBe(true);
});

it.each([{}, { scriptTone: " ", scriptPersona: "" }])("미설정·빈 말투·성격은 bundled 기본값을 대본에 넣는다: %j", async voice => {
  runScript.mockResolvedValue(result(script("직접 써 봤어. 너는 어때? 😊")));
  await recommend(undefined, voice);
  const prompt = runScript.mock.calls[0]![0].prompt;
  expect(prompt).toContain(`말투:\n${BUNDLED_PROMPT_DEFAULTS.tone}`);
  expect(prompt).toContain(`성격:\n${BUNDLED_PROMPT_DEFAULTS.persona}`);
});

it("현재 원격 말투·성격을 대본에 넣는다", async () => {
  runScript.mockResolvedValue(result(script("직접 써 봤어. 너는 어때? 😊")));
  await recommend({ ...BUNDLED_PROMPT_DEFAULTS, tone: "원격 말투", persona: "원격 성격" }, {});
  const prompt = runScript.mock.calls[0]![0].prompt;
  expect(prompt).toContain("말투:\n원격 말투");
  expect(prompt).toContain("성격:\n원격 성격");
});

it.each(["bundled", "remote"] as const)("대본·말투·성격을 고쳐도 %s 전역 자막 지침을 합치고 설정을 보존한다", async source => {
  const defaults = source === "remote" ? { ...BUNDLED_PROMPT_DEFAULTS, captionGuide: "원격 전역 자막 규칙" } : undefined;
  runScript.mockResolvedValue(result(script("직접 써 봤어")));
  const settings = { scriptPrompt: "고친 대본", scriptTone: "고친 말투", scriptPersona: "고친 성격" };
  const done = await recommend(defaults, settings);
  const prompt = runScript.mock.calls[0]![0].prompt;
  const guide = source === "remote" ? "원격 전역 자막 규칙" : DEFAULT_CAPTION_GUIDE.trim();
  expect(prompt).toContain(`고친 대본\n\n사용자 요청:\n사용자 요청\n\n말투:\n고친 말투\n\n성격:\n고친 성격\n\n전역 자막 지침:\n${guide}\n\n입력 항목 번호`);
  const savedSettings = await new Store(done.root).readSettings();
  expect(savedSettings).toMatchObject({ ...settings, scriptReview: "읽지 않을 옛 검수 설정" });
  expect(savedSettings).not.toHaveProperty("captionGuide");
});

it("빈 원격 전역 자막 지침은 대본에 넣지 않는다", async () => {
  runScript.mockResolvedValue(result(script("직접 써 봤어")));
  const defaults = { ...BUNDLED_PROMPT_DEFAULTS, captionGuide: "" };
  await recommend(defaults);
  expect(runScript.mock.calls[0]![0].prompt).not.toContain("전역 자막 지침:");
});

it("말줄임표와 초성을 쓴 자막은 재생성하지 않는다", async () => {
  const draft = script("잠깐… 이건... ㅋㅋ ㄹㅇ");
  runScript.mockResolvedValue(result(draft));
  const done = await recommend();
  expect(runScript).toHaveBeenCalledTimes(1);
  expect(done.result.styleWarnings).toEqual([]);
  expect(done.saved).toEqual(draft);
});

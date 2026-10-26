import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askJevBox } from "../../src/engine/pipeline/jev-box";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function frame() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-jev-box-")); roots.push(root);
  const file = path.join(root, "frame.png"); await writeFile(file, Buffer.from("frame")); return file;
}

describe("Jev Box", () => {
  it("sends an image asset and Box target question, then returns normalized edges and usage", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("TypeSafe-Danger-Zone-Images")).toBe("true");
      const form = init?.body as FormData;
      const payload = JSON.parse(await (form.get("request") as Blob).text());
      expect(payload).toMatchObject({ model: "jev-1.14.0", state: { photo: expect.any(String) }, questions: { target: { type: "box", instructions: "상품 in `photo`" } } });
      expect(payload.assets[payload.state.photo]).toEqual({ type: "image", part: "frame" });
      expect(form.get("frame")).toBeInstanceOf(Blob);
      return Response.json({ model: "jev-1.14.0", answers: { target: { type: "box", box: { top: 0.2, bottom: 0.8, left: 0.1, right: 0.7 }, confidence: 0.9 } }, usage: { input_tokens: 10, output_tokens: 2 } });
    });
    const result = await askJevBox({ imagePath: await frame(), target: "상품", apiKey: "test-key", fetchImpl: fetchImpl as typeof fetch });
    expect(result).toMatchObject({ model: "jev-1.14.0", box: { left: 0.1, top: 0.2, right: 0.7, bottom: 0.8 }, confidence: 0.9, usage: { input_tokens: 10, output_tokens: 2 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("clears low confidence boxes and does not send when Jev is disabled", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ model: "jev-1.14.0", answers: { target: { type: "box", box: { top: 0.2, bottom: 0.8, left: 0.1, right: 0.7 }, confidence: 0.2 } }, usage: { input_tokens: 1, output_tokens: 1 } }));
    const result = await askJevBox({ imagePath: await frame(), target: "손", apiKey: "key", fetchImpl: fetchImpl as typeof fetch });
    expect(result.box).toBeNull();
    const disabled = await askJevBox({ imagePath: "/missing.png", target: "손", apiKey: "key", enabled: false, fetchImpl: fetchImpl as typeof fetch });
    expect(disabled.box).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

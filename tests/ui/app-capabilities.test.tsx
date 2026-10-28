import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { Project } from "../../src/core/schema";
import { LibraryPanel } from "../../src/ui/studio/LibraryPanel";
import { Inspector } from "../../src/ui/studio/Inspector";
const project = Project.parse({ id: "p", name: "테스트", inputs: [{ id: "i", kind: "photo", file: "x.png" }], savedAt: "2026-10-28T00:00:00Z", timeline: { video: [], overlays: [], captions: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } }, voice: [{ id: "tts-a", file: "voice/a.wav", startSec: 0, inStartSec: 0, inEndSec: 1, gain: 1 }] } });
it.each([false, undefined, true])("capability %s에 따라 생성 버튼만 선택한다", tts => {
  const common = { project, capabilities: tts === undefined ? undefined : { tts }, onError: () => {}, onSnackbar: () => {}, selectedId: null };
  const html = renderToStaticMarkup(<LibraryPanel {...common} initialTab="voice" {...{} as any} />);
  expect(html.includes("자막으로 음성 만들기")).toBe(tts === true);
  expect(html).toContain("녹음");
  const inspector = renderToStaticMarkup(<Inspector {...common} timeline={project.timeline} selectedId="tts-a" selectedIds={["tts-a"]} selectedTrack="voice" {...{} as any} />);
  expect(inspector.includes(">다시 만들기</button>")).toBe(tts === true);
  expect(inspector).toContain("자막 만들기");
});
it("App과 Studio가 엔진의 capabilities를 전달한다", async () => {
  const app = await readFile(new URL("../../src/ui/App.tsx", import.meta.url), "utf8");
  expect(app).toContain("capabilities={status?.capabilities}");
  const studio = await readFile(new URL("../../src/ui/screens/Studio.tsx", import.meta.url), "utf8");
  for (const name of ["LibraryPanel", "Inspector", "Timeline"]) expect(studio).toMatch(new RegExp(`<${name}[^>]*capabilities=\\{props.capabilities\\}`));
});

import React from "react";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STUDIO_SHORTCUTS, STUDIO_ACTIONS, formatChord } from "../../src/core/studio-shortcuts";
import { Project } from "../../src/core/schema";
import { ShortcutList } from "../../src/ui/studio/ShortcutList";
import { Studio } from "../../src/ui/screens/Studio";
import { ApiError, api } from "../../src/ui/api";

vi.mock("../../src/ui/studio/Preview", () => ({ Preview: () => null }));
vi.mock("../../src/ui/studio/Timeline", () => ({ Timeline: (props: { shortcuts: typeof DEFAULT_STUDIO_SHORTCUTS }) => <div data-pointer-shortcut={props.shortcuts["split-pointer"]} /> }));
vi.mock("../../src/ui/studio/Inspector", () => ({ Inspector: () => null }));
vi.mock("../../src/ui/studio/LibraryPanel", () => ({ LibraryPanel: () => null }));
vi.mock("../../src/ui/ExportDialog", () => ({ ExportDialog: () => null }));
vi.mock("../../src/ui/screens/carousel/DerivedCarouselDialog", () => ({ DerivedCarouselDialog: () => null }));
afterEach(() => vi.unstubAllGlobals());

describe("스튜디오 단축키 표시", () => {
  it.each(["mac", "win"] as const)("%s 팝오버 여덟 행이 현재 표와 일치한다", platform => {
    const bindings = { ...DEFAULT_STUDIO_SHORTCUTS, "split-pointer": "KeyX", undo: "Mod+KeyU", redo: "Alt+KeyR" };
    const markup = renderToStaticMarkup(<ShortcutList shortcuts={bindings} platform={platform} />);
    expect(markup.match(/<dt[ >]/g)).toHaveLength(8);
    expect(markup.match(/<dd[ >]/g)).toHaveLength(8);
    for (const { id, label } of STUDIO_ACTIONS) {
      expect(markup).toContain(`>${label}</dt>`);
      expect(markup).toContain(`>${formatChord(bindings[id], platform)}</dd>`);
    }
  });

  it("툴바 버튼과 Timeline에 현재 표를 전달한다", async () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    const project = Project.parse({ id: "p", name: "영상", inputs: [{ id: "i", kind: "photo", file: "photo.png" }], timeline: { video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } }, savedAt: new Date().toISOString() });
    const shortcuts = { ...DEFAULT_STUDIO_SHORTCUTS, "split-pointer": "KeyX", undo: "Mod+KeyU", redo: "Alt+KeyR" };
    const markup = renderToStaticMarkup(<Studio project={project} shortcuts={shortcuts} onProject={() => undefined} onBack={() => undefined} onSnackbar={() => undefined} onError={() => undefined} onCarouselCreated={() => undefined} />);
    expect(markup).toContain('aria-label="단축키"');
    expect(markup).toContain('aria-label="실행 취소 ⌘U"');
    expect(markup).toContain('aria-label="다시 실행 ⌥R"');
    expect(markup).not.toContain('title="실행 취소');
    expect(markup).not.toContain('title="다시 실행');
    expect(markup).toContain('data-pointer-shortcut="KeyX"');
    const source = await readFile("src/ui/screens/Studio.tsx", "utf8");
    expect(source).toContain('aria-label="단축키"');
  });
});

describe("설정 API 오류 정보", () => {
  it("서버 오류의 code와 details를 Error 메시지와 함께 보존한다", async () => {
    const details = { action: "group", conflict: { kind: "system" } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "shortcut-conflict", message: "시스템에서 사용하는 조합이에요", ...details } }), { status: 400 })));
    const error = await api("PUT", "/api/system/studio-shortcuts", DEFAULT_STUDIO_SHORTCUTS).catch(error => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("시스템에서 사용하는 조합이에요");
    expect(error.code).toBe("shortcut-conflict");
    expect(error.details).toEqual(details);
  });
});

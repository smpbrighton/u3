import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Project } from "../../src/core/schema";
import { CodexWarning } from "../../src/ui/components/u3/CodexWarning";
import { Script } from "../../src/ui/screens/Script";
import type { SystemStatus } from "../../src/ui/types";

function status(codex: SystemStatus["codex"] & { version?: string; outdated?: boolean }): SystemStatus {
  return { codex, jev: { available: false, hasKey: false, keyHint: null, enabled: false, model: "jev", boxModel: "jev-box" } };
}

describe("Codex 경고", () => {
  it("상태 확인 전에는 경고를 표시하지 않는다", () => {
    expect(renderToStaticMarkup(<CodexWarning status={null} />)).toBe("");
  });
  it("경로 부재를 알리고 설정 열기 버튼을 표시한다", () => {
    const markup = renderToStaticMarkup(<CodexWarning status={status({ installed: false, loggedIn: false })} onSettings={() => undefined} />);
    expect(markup).toContain("codex 를 찾지 못했어요");
    expect(markup).toContain("설정 열기");
    expect(markup).not.toContain("실행 파일 지정");
    expect(markup).not.toContain("로그인이 필요해요");
  });
  it("로그인이 필요하면 로그인 문구를 표시한다", () => {
    const markup = renderToStaticMarkup(<CodexWarning status={status({ installed: true, loggedIn: false })} />);
    expect(markup).toContain("codex 로그인이 필요해요");
    expect(markup).toContain("설정 열기");
    expect(markup).not.toContain("실행 파일 지정");
  });
  it.each([true, false])("로그인 상태가 %s여도 낮은 버전의 업데이트를 안내한다", loggedIn => {
    const markup = renderToStaticMarkup(<CodexWarning status={status({ installed: true, loggedIn, version: "0.153.4", outdated: true })} />);
    expect(markup).toContain("codex 업데이트가 필요해요 (현재 0.153.4, 0.159.3 이상 필요)");
    expect(markup).toContain("설정 열기");
    expect(markup).not.toContain("로그인이 필요해요");
  });
  it("지원 버전으로 로그인했으면 경고를 표시하지 않는다", () => {
    expect(renderToStaticMarkup(<CodexWarning status={status({ installed: true, loggedIn: true, version: "0.165.0", outdated: false })} />)).toBe("");
  });
});

describe("대본 생성 버전 차단", () => {
  const project = Project.parse({ id: "test", name: "대본", inputs: [{ id: "placeholder", kind: "photo", file: "pending" }], timeline: { video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } }, savedAt: new Date().toISOString() });
  it.each([true, false])("outdated=%s를 생성 버튼에 적용한다", outdated => {
    const markup = renderToStaticMarkup(<Script project={project} status={status({ installed: true, loggedIn: true, version: outdated ? "0.153.4" : "0.165.0", outdated })} onProject={() => undefined} onStudio={() => undefined} onBack={() => undefined} onSnackbar={() => undefined} onError={() => undefined} />);
    const button = markup.match(/<button\b[^>]*>대본 만들기<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button?.includes('disabled=""')).toBe(outdated);
  });
});

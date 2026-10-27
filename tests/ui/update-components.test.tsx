import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateSidebar, AppInfo } from "../../src/ui/UpdateControls";
import type { UpdateSnapshot } from "../../src/ui/updater";

const idle: UpdateSnapshot = { status: "idle", currentVersion: "0.2.0", lastCheckedAt: null, checking: false, revision: 0 };
describe("업데이트 화면", () => {
  it("사이드바는 다운로드 한 줄과 준비된 버전의 다시 시작 버튼만 표시한다", () => {
    const sidebar = (status: UpdateSnapshot) => renderToStaticMarkup(<UpdateSidebar status={status} disabled={false} onRestart={() => undefined} />);
    expect(sidebar(idle)).toBe("");
    expect(sidebar({ ...idle, checking: true })).toBe("");
    expect(sidebar({ ...idle, status: "downloading", percent: 42 })).toContain("업데이트 받는 중 42%");
    const ready = sidebar({ ...idle, status: "ready", version: "0.2.1" });
    expect(ready).toContain("새 버전 0.2.1");
    expect(ready).toContain("다시 시작");
  });

  it("앱 정보는 현재 버전·마지막 확인 시각·지금 확인을 표시한다", () => {
    const markup = renderToStaticMarkup(<AppInfo status={idle} onCheck={() => undefined} />);
    expect(markup).toContain("앱 정보");
    expect(markup).toContain("0.2.0");
    expect(markup).toContain("아직 확인하지 않았어요");
    expect(markup).toContain("지금 확인");
    const checked = renderToStaticMarkup(<AppInfo status={{ ...idle, lastCheckedAt: 1_792_800_000_000, checking: true }} onCheck={() => undefined} />);
    expect(checked).not.toContain("아직 확인하지 않았어요");
    expect(checked).toContain("disabled");
  });
});

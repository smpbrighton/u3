import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/ui/screens/Settings";
import { ModelDownloadRow } from "../../src/ui/settings/ModelDownloadRow";
import type { EngineJob } from "../../src/ui/api";
import { TooltipProvider } from "../../src/ui/components/ui/tooltip";

const view = vi.hoisted(() => ({ section: "screen", tts: true as boolean | undefined, nullStates: 0 }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const [value, setValue] = actual.useState(initial);
    return [initial === "screen" ? view.section : initial === null && ++view.nullStates === 1 ? (view.tts === undefined ? null : { capabilities: { tts: view.tts }, codex: { installed: true, loggedIn: true } }) : value, setValue];
  } };
});
vi.mock("@remotion/player", () => ({ Player: () => <div data-preview-player /> }));
vi.mock("../../src/remotion/U3Short", () => ({ U3Short: () => null }));

beforeEach(() => { view.tts = true; view.nullStates = 0; });

describe("설정 구역", () => {
  it.each([false, undefined])("TTS 지원이 %s이면 음성 구역과 모델을 숨긴다", tts => {
    view.tts = tts; view.section = "voice";
    const html = renderToStaticMarkup(<TooltipProvider><Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} /></TooltipProvider>);
    expect(html).not.toContain("settings-nav-voice");
    expect(html).not.toContain("음성 만들기 모델");
  });
  const sections = [
    ["screen", "테마"], ["shortcuts", "포인터 자르기"], ["brand", "워터마크 미리보기"], ["script", "STT 모델"], ["meme", "Jev API 키"],
    ["voice", "음성 만들기 모델"], ["imagegen", "동시 실행 수"], ["sound", "재생 시작 딜레이"], ["about", "현재 버전"],
  ];

  it.each(sections)("%s 구역 하나만 표시한다", (section, expected) => {
    view.section = section;
    const markup = renderToStaticMarkup(<TooltipProvider><Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} /></TooltipProvider>);
    const region = markup.slice(markup.indexOf('role="region"'));
    expect(region).toContain(expected);
    for (const [other, marker] of sections) if (other !== section) expect(region).not.toContain(marker);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    const labels = ["화면", "단축키", "브랜드", "대본", "짤", "음성", "이미지 생성", "알림음", "앱 정보"];
    const positions = labels.map(label => markup.indexOf(`>${label}</button>`));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    if (section === "brand") {
      expect(region.match(/data-u3-preview="true"/g)).toHaveLength(2);
      expect(region).toContain("h-[480px]");
      expect(region).toContain("w-[270px]");
    }
    if (section !== "meme") expect(region).not.toContain(">저장</button>");
  });
});

describe("공통 모델 행", () => {
  const render = (available: boolean, job?: EngineJob) => renderToStaticMarkup(<ModelDownloadRow label="STT 모델" available={available} job={job} onDownload={() => undefined} onCancel={() => undefined} />);

  it("받기와 준비됨을 같은 행에서 표시한다", () => {
    expect(render(false)).toContain("받기");
    expect(render(true)).toContain("준비됨");
    expect(render(true)).not.toContain("받기");
  });

  it("진행률과 취소를 표시한다", () => {
    const job: EngineJob = { id: "model", kind: "models", projectId: null, status: "running", progress: 0.42, message: "받는 중", error: null, result: null, cancellable: true };
    const markup = render(false, job);
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain("42%");
    expect(markup).toContain("취소");
  });
});

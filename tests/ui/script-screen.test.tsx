import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScriptFrames, ScriptProgress } from "../../src/ui/screens/Script";
import type { FrameGroup, Input } from "../../src/ui/types";

const inputs: Input[] = [
  { id: "v1", kind: "video", file: "input/영상.mov", durationSec: 3.6 },
  { id: "p1", kind: "photo", file: "input/사진.jpg" },
];
const groups: FrameGroup[] = [
  { inputId: "v1", frames: Array.from({ length: 4 }, (_, i) => ({ file: `frame-${i}.jpg`, url: `/frame-${i}.jpg` })) },
  { inputId: "p1", frames: [{ file: "photo.jpg", url: "/photo.jpg" }] },
];

describe("대본 화면", () => {
  it("AI 추천 이미지 준비 중에는 skeleton을 표시한다", () => {
    const markup = renderToStaticMarkup(<ScriptFrames loading groups={[]} inputs={inputs} />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="이미지 준비 중"');
    expect(markup).toContain("animate-pulse");
    expect(markup).not.toContain("이미지가 없어요");
  });

  it("AI 추천 준비 후에는 입력별 길이·장 수와 실제 프레임 시각을 표시한다", () => {
    const markup = renderToStaticMarkup(<ScriptFrames loading={false} groups={groups} inputs={inputs} />);
    expect(markup).toContain("영상.mov");
    expect(markup).toContain("3.6초 · 4장");
    expect(markup).toContain("0.5초");
    expect(markup).toContain("3.1초");
    expect(markup).toContain("사진 · 1장");
    expect(markup).not.toContain("40장");
  });

  it("AI 추천 프레임이 없으면 빈 상태 한 줄을 표시한다", () => {
    const markup = renderToStaticMarkup(<ScriptFrames loading={false} groups={[{ inputId: "v1", frames: [] }]} inputs={inputs} />);
    expect(markup).toContain("이미지가 없어요");
    expect(markup).not.toContain("animate-pulse");
  });

  it("생성 중에는 진행률과 취소 버튼을 표시하고 같은 콜백을 연결한다", () => {
    const onCancel = vi.fn();
    const element = ScriptProgress({ state: { phase: "running", message: "codex 실행 중", cancellable: true }, progress: 0.4, onCancel });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("codex 실행 중");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="40"');
    expect(markup).toContain("취소");
    const button = React.Children.toArray(element?.props.children).find(child => React.isValidElement<{ onClick?: () => void }>(child) && child.props.onClick);
    expect(React.isValidElement<{ onClick: () => void }>(button)).toBe(true);
    if (React.isValidElement<{ onClick: () => void }>(button)) button.props.onClick();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("취소할 수 없는 준비 단계에는 취소 버튼을 표시하지 않는다", () => {
    const markup = renderToStaticMarkup(<ScriptProgress state={{ phase: "starting", message: null, cancellable: false }} progress={null} onCancel={vi.fn()} />);
    expect(markup).toContain("대본 작업을 준비하고 있어요.");
    expect(markup).not.toContain("취소");
  });
});

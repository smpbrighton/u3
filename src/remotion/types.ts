import type { RenderTimeline } from "../core/timeline/to-render";

export interface U3ShortProps extends Record<string, unknown> {
  render: RenderTimeline;
  /** Timeline inputId → URL or path. */
  inputs: Record<string, string>;
  inputKinds: Record<string, "video" | "photo">;
  /** Timeline memeId → URL or path. */
  memes: Record<string, string>;
  /** 짤 원본 길이(프레임). 짤이 타임라인보다 짧을 때 Loop가 반복한다. */
  memeFrames: Record<string, number>;
}

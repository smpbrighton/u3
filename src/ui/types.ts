import type { CodexScript } from "../core/schema";

export interface Project {
  id: string;
  name: string;
  inputs: Input[];
  timeline: {
    video: unknown[];
    captions: unknown[];
    voice: unknown[];
    sfx: unknown[];
    audio: { source: { gain: number; muted: boolean }; voice: { gain: number; muted: boolean }; sfx: { gain: number; muted: boolean } };
  };
  savedAt: string;
}

export interface Input {
  id: string;
  kind: "video" | "photo";
  file: string;
  durationSec?: number;
}

export interface SystemStatus {
  codexPath: string | null;
  codex: { installed: boolean; loggedIn: boolean };
  jev: { available: boolean; model: string };
}

export interface FrameGroup {
  inputId: string;
  frames: { file: string; url: string }[];
}

export type { CodexScript };


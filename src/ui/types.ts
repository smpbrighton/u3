import type { CodexScript, Input as CoreInput, Project as CoreProject } from "../core/schema";

export type Project = CoreProject;
export type Input = CoreInput;

export interface SystemStatus {
  logFile: string;
  platform: "darwin" | "win32";
  capabilities: { tts: boolean };
  codex: { installed: boolean; loggedIn: boolean; version?: string | null; outdated?: boolean };
  jev: { available: boolean; hasKey: boolean; keyHint: string | null; enabled: boolean; model: string; boxModel: string };
}

export interface FrameGroup {
  inputId: string;
  frames: { file: string; url: string }[];
}

export type { CodexScript };


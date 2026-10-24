import type { CodexScript, Input as CoreInput, Project as CoreProject } from "../core/schema";

export type Project = CoreProject;
export type Input = CoreInput;

export interface SystemStatus {
  codex: { installed: boolean; loggedIn: boolean };
  jev: { available: boolean; model: string };
}

export interface FrameGroup {
  inputId: string;
  frames: { file: string; url: string }[];
}

export type { CodexScript };


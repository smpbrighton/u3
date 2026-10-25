import type { Project } from "../core/schema";

export type ProjectScreen = "input" | "script" | "studio";

export function projectOpenScreen(project: Project): ProjectScreen {
  if (project.timeline.video.length) return "studio";
  if (project.inputs.some(input => input.id !== "placeholder")) return "script";
  return "input";
}

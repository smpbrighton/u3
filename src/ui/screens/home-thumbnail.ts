import type { Input, Project } from "../../core/schema";

export function projectThumbnailInput(project: Project): Input | null {
  const inputs = project.inputs.filter(input => input.id !== "placeholder");
  if (!project.timeline.video.length) return inputs[0] ?? null;
  const mainClip = project.timeline.video.find(clip => clip.kind === "main");
  if (!mainClip) return null;
  return inputs.find(input => input.id === mainClip.inputId) ?? null;
}

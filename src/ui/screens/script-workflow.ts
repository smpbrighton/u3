export interface ScriptGenerationState {
  phase: "idle" | "starting" | "running" | "failed";
  message: string | null;
  cancellable: boolean;
  error?: string;
}

export function scriptGenerationView(state: ScriptGenerationState) {
  const active = state.phase === "starting" || state.phase === "running";
  return {
    progress: active ? state.message ?? "대본 작업을 준비하고 있어요." : null,
    showCancel: state.phase === "running" && state.cancellable,
    error: state.phase === "failed" ? state.error ?? "대본을 만들지 못했어요." : null,
  };
}

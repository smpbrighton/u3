import { CodexScript, type CodexScript as CodexScriptType } from "./schema";

export const DEFAULT_SCRIPT_REVIEW_PROMPT = `# 영상 자막 검수

너는 영상 입력 장면에 표시할 자막을 검수한다. 초안 JSON의 caption을 처음부터 읽고, 영상 장면과 말투에 맞지 않는 부분만 고친다. 자연스러운 자막은 그대로 둔다. 출력은 주어진 CodexScript JSON 스키마를 따른다.

## 검수 기준
- 자막을 눈으로 빠르게 읽었을 때 어색하거나 길게 꼬이는 문장을 다듬는다.
- 이야기 흐름이 장면 순서에 맞는지 확인한다. 초안의 사실을 유지하고 새 인물·사건·수치·사용 경험을 만들지 않는다.
- 장면과 자막이 영상에서 확인되는 동작과 맞는지 확인한다.
- 과거 장면의 시제를 유지하고 말끝을 자연스럽게 섞는다.
- 동작의 방향과 원인·결과가 맞는지 확인한다.
- 번역투, 결산 말버릇, 음슴체, 읽기 어려운 기호를 고친다.
- 어색하지 않은 caption은 수정하지 않는다.

## 바꾸지 않는 값
caption만 수정할 수 있다. 장면 수와 각 장면의 inputIndex, startSec, endSec, reaction, memeBefore, memeAfter, sfxCategory를 그대로 유지한다. 장면의 순서도 바꾸지 않는다. 위 필드를 더하거나 빼거나 바꾸지 않는다.

## 출력
검수한 전체 대본을 입력 JSON과 같은 CodexScript 형식으로 출력한다. 검수하지 않은 장면도 빠뜨리지 않는다.`;

const PROTECTED_FIELDS = ["inputIndex", "startSec", "endSec", "reaction", "memeBefore", "memeAfter", "sfxCategory"] as const;

export type ScriptReviewResult = { script: CodexScriptType; warning: string | null };

export function buildScriptReviewPrompt(options: {
  reviewPrompt: string;
  draft: unknown;
  voice: { speaker: string; tone: string; persona: string };
}): string {
  const sections = [
    ["화자", options.voice.speaker], ["말투", options.voice.tone], ["성격", options.voice.persona],
  ].flatMap(([label, value]) => value.trim() ? [`${label}:\n${value.trim()}`] : []);
  return [
    options.reviewPrompt,
    ...(sections.length ? [`## 대본 생성 설정\n${sections.join("\n\n")}`] : []),
    `## 검수할 초안(JSON)\n\n\`\`\`json\n${JSON.stringify(CodexScript.parse(options.draft), null, 2)}\n\`\`\``,
  ].join("\n\n");
}

export function reviewScriptResult(
  draftValue: unknown,
  reviewedValue: unknown,
  failure?: string,
): ScriptReviewResult {
  const draft = CodexScript.parse(draftValue);
  if (failure) return { script: draft, warning: failure };
  const reviewed = CodexScript.safeParse(reviewedValue);
  if (!reviewed.success) return { script: draft, warning: "자막 검수 결과를 읽지 못해 초안을 사용했습니다." };
  if (reviewed.data.scenes.length !== draft.scenes.length) {
    return { script: draft, warning: "자막 검수에서 장면 수가 바뀌어 초안을 사용했습니다." };
  }
  const changed = draft.scenes.some((scene, index) => PROTECTED_FIELDS.some(field => scene[field] !== reviewed.data.scenes[index]![field]));
  if (changed) return { script: draft, warning: "자막 검수에서 장면 정보가 바뀌어 초안을 사용했습니다." };
  return { script: reviewed.data, warning: null };
}

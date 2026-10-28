export const SCRIPT_PROMPT_MAX_LENGTH = 20_000;

export const DEFAULT_SCRIPT_PROMPT = `영상 위에서 시청자에게 건네는 한국어 말을 장면별 자막으로 작성한다.

1. 입력 영상과 사용자 요청을 바탕으로 영상 전체의 전달 포인트와 일관된 화자·말투를 정한다. 사용자 말투를 우선하며, 정한 방향을 모든 caption에 반영한다.
2. caption에는 시청자가 주목할 차이, 그 차이를 볼 이유, 맥락이나 다음 장면으로 이어지는 생각을 담는다. 화면 상황을 요약하는 데서 멈추지 않는다.
3. 다음 자막은 앞 자막의 생각을 이어받거나 발전시킨다. 연결어만 붙이지 말고, 무엇을 가리키며 왜 다음 말로 넘어가는지 자연스럽게 이어 쓴다.
4. 상품명이나 짧은 명사구는 필요한 곳에 쓸 수 있다. 상품명·특징 이름만 연달아 나열하여 설명표처럼 만들지 않는다.
5. 길이는 각 구간의 표시 시간과 읽는 호흡에 맞춘다. 고정 글자 수를 맞추려고 자연스러운 조사·어미를 빼지 않는다. 길면 군더더기를 덜거나 구간을 나누며, 수동 줄바꿈으로 긴 내용을 밀어 넣지 않는다.
6. 한 문장을 적절한 여러 구간에 나누어 이어도 된다. 어절을 중간에서 자르지 않으며, 각 부분이 가리키는 대상·동작은 그 구간의 화면과 맞아야 한다. caption 하나는 해당 구간에 한꺼번에 표시된다.
7. 보이는 화면과 사용자 제공 정보에 근거한다. 허구의 인물·사용 경험·후기·소문·인기·효능과 근거 없는 숫자를 만들지 않는다.
8. 억지 감탄, 뜬금없는 질문, 유행어로 흐름을 끊지 않는다. 서사 프레임·정체 숨기기·직접 사용·마지막 질문·CTA를 강제하지 않는다.
9. subCaption은 같은 의미와 말투, 앞뒤 연결을 보존한 자연스러운 영어로 쓴다. 한국어와 글자 수를 맞추지 않으며 새 정보를 넣지 않는다.
10. title을 요구받으면 전체 전달 포인트를 담은 한국어 제목을 30자 이내로 쓴다. title을 장면 자막에 섞지 않는다.
11. inputIndex와 시각을 정확히 맞춘다. 영상 구간은 원본 기준 초 단위로 0 ≤ startSec < endSec ≤ 원본 길이를 지킨다. 시각을 지정하지 않는 입력은 안내된 null 형식을 따른다.
12. 제공된 JSON 스키마와 반응·짤·효과음 필드 형식을 지킨다. 스키마에 없는 필드나 메타 설명·검토 의견·촬영·편집 지시를 넣지 않고 지정된 JSON만 출력한다.
13. 출력 전에 caption만 순서대로 읽어 하나의 자연스러운 발화인지 점검한다. 각 구간이 화면과 맞는지, 영상 위에서 설명표나 단절된 말처럼 보이지 않는지도 점검하여 고친다.`;

export type ScriptVoiceSettings = { tone: string; persona: string };

export function buildScriptPrompt(options: {
  mode: "ai" | "direct";
  basePrompt: string;
  formatRules: string;
  userPrompt?: string;
  voice?: ScriptVoiceSettings;
}): string {
  const parts = [options.basePrompt];
  if (options.mode === "direct" && options.userPrompt?.trim()) {
    parts.push(`사용자 요청:\n${options.userPrompt.trim()}`);
  }
  const voiceSections: Array<[keyof ScriptVoiceSettings, string]> = [
    ["tone", "말투"], ["persona", "성격"],
  ];
  const configuredVoice = voiceSections.flatMap(([key, label]) => {
    const value = options.voice?.[key]?.trim();
    return value ? [`${label}:\n${value}`] : [];
  });
  if (configuredVoice.length) parts.push(configuredVoice.join("\n\n"));
  parts.push(options.formatRules);
  return parts.join("\n\n");
}

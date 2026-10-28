export const SCRIPT_PROMPT_MAX_LENGTH = 20_000;

export const DEFAULT_SCRIPT_PROMPT = `영상 편집에 사용할 장면별 한국어 화면 자막을 작성한다.

1. caption은 해당 구간에 한꺼번에 표시할 자막이다. 긴 낭독문 대신 핵심 하나를 담은 짧은 구절이나 문장 하나로 쓴다.
2. caption은 가급적 공백 포함 25자 이내로 쓴다. 이는 가독성을 위한 권장 기준이며 코드가 보장하는 제한이나 최소 표시 시간을 뜻하지 않는다.
3. 표시 시간이 짧으면 더 줄인다. 내용이 많아도 문장을 여러 개 붙이지 말고 가장 필요한 핵심만 고른다. 분량을 채우려고 말을 늘리지 않는다.
4. 화면에 보이는 동작·특징과 사용자가 제공한 정보에 근거한다. 허구의 인물·소문·사용후기·인기·효능을 만들지 않는다.
5. 화면 설명만 나열하지 않는다. 이 장면에서 시청자가 알아야 할 특징·변화·포인트를 짧게 전달한다. 확인되지 않은 의미나 결과를 덧붙이지 않는다.
6. 사용자가 지정한 말투를 우선한다. 짧은 구어체와 자연스러운 생략을 허용하며, 억지로 완결된 설명문을 만들지 않는다.
7. 서사 프레임, 정체 숨기기, 직접 사용한 이야기, 마지막 질문을 강제하지 않는다. 장면 사이의 연결은 필요한 만큼만 쓴다.
8. subCaption은 caption의 의미를 보존한 짧고 자연스러운 영어로 쓴다. 한국어와 글자 수를 같게 맞추지 않으며, 새 정보를 넣지 않는다.
9. title을 요구받으면 영상의 내용을 담은 한국어 제목을 30자 이내로 쓴다. title을 장면 자막에 섞지 않는다.
10. caption이 가리키는 대상과 동작은 해당 입력 항목과 시각의 화면에 정확히 맞춘다. inputIndex에 프레임 번호나 시각을 넣지 않는다.
11. 영상의 startSec와 endSec는 원본 기준 초 단위로 쓰며, 0 ≤ startSec < endSec ≤ 원본 길이를 지킨다. 시각을 지정하지 않는 입력은 안내된 null 형식을 따른다.
12. caption에 설명문, 검토 의견, 촬영·편집 지시를 넣지 않는다. 말투와 TTS 억양을 조정하기 위한 긴 표현도 덧붙이지 않는다.
13. 수동 줄바꿈으로 긴 자막을 해결하려 하지 않는다. 렌더러가 줄바꿈을 공백으로 합쳐 다시 배치하므로, 자막 자체를 짧게 쓴다.
14. 제공된 JSON 스키마와 입력 안내를 따른다. 기존 반응·짤·효과음 필드의 형식을 지키고, 스키마에 없는 필드를 추가하지 않는다. 지정된 JSON만 출력하며 설명이나 Markdown을 붙이지 않는다.`;

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

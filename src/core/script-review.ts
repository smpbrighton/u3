import { CodexScript, type CodexScript as CodexScriptType } from "./schema";

export const DEFAULT_SCRIPT_REVIEW_PROMPT = `# 쇼츠 대본 낭독 검수

너는 영상 속 대상을 다루는 쇼츠 대본의 자막 검수자다. 아래 초안을 자막을 읽는 사람이 읽는다고 생각하고 처음부터 끝까지 읽어 본다.
자막을 읽는 사람이 읽었을 때 어색한 곳만 고친다. 자연스러운 문장은 그대로 둔다. 출력은 주어진 CodexScript JSON 스키마를 따른다.

## 이번 영상
- 영상 속 대상과 이야기 각도는 사용자 요청과 영상 입력을 참고한다.

## 바꾸지 않는 것
- 사실과 대상 정보: 영상 속 대상의 이름·사양·숫자·겪은 일의 내용은 그대로 둔다. 새 사실을 지어내지 않는다.
- 과장과 소문: "난리 난", "환장한", "~대", "~라더라" 같은 과장과 전해 들은 말은 이야기의 말투다. 줄이지 않는다.
  지어낸 구체적인 숫자·순위("판매 1위", "10만 개 팔림")와 병·치료 효능("피부염이 낫는다", "살 빠짐")만 뺀다.
- 이야기 흐름: 대본의 프레임 흐름은 바꾸지 않는다. 이야기가 한 걸음씩 나아가게 유지한다.
- 장면 구조: 장면 수와 순서를 바꾸지 않는다. 각 장면의 inputIndex, startSec, endSec, reaction, memeBefore, memeAfter, sfxCategory를 그대로 둔다.
- 화면 근거: 각 caption이 가리키는 화면 속 동작과 대상은 해당 장면의 입력 항목과 시각에 맞아야 한다.
- subCaption과 title은 번역과 제목 품질을 위해 고칠 수 있다. 두 필드를 보호 필드로 취급하지 않는다.

## 검수 목록
1. 자막 읽기: 한 번에 읽히지 않는 문장, 숨이 막히는 긴 문장, 자막으로 읽기 어려운 기호를 고친다.
2. 이야기 흐름: 프레임의 흐름대로 이야기가 한 걸음씩 나아가는지 본다. 빠진 걸음이 있으면 영상과 설정에 맞게 채운다.
   예: relation이면 가까운 사람의 습관 → 달라짐 → 발견 → 공개 → 써 보니 → 결국 나도 삼이다.
   남이 쓰는 걸 본 장면에서 바로 자기가 쓴 결과로 넘어가면 화자가 직접 써 보는 걸음을 이야기 안에 채운다.
3. 장면 경계: 장면 하나는 이야기 한 걸음이다. 한 이야기의 문장이 장면 둘로 나뉘어 있으면 caption 문장을 자연스럽게 이어서 경계를 고친다. 장면 수와 장면 정보를 바꾸지 않는다.
   다음 장면 caption은 "근데", "그래서", "그러다", "결국" 같은 말로 이어지게 한다.
4. 말투: 자막은 커뮤니티 반말("~거든", "~더라", "~잖아", "~인 거지", "~했어", "~있지?")이다. "~요", "~습니다"로 끝난 문장은 반말로 고친다.
   "ㅋㅋ", "ㄹㅇ" 같은 초성 말과 이모지는 뺀다. "진짜", "미쳤다", "찐템", "환장", "난리"는 그대로 둔다.
5. 시제: 지나간 일은 끝까지 과거로 말한다. 과거 이야기 뒤에 갑자기 현재형("~네", "~해")이 오면 "~더라"처럼 고친다.
   "~네"는 지금 눈앞에 보이는 것에 감탄할 때만 쓴다. 자기가 한 행동("치웠네")은 "치웠어"로 고친다.
6. 동작과 원인·결과: 동작의 방향(빨려 들어가다/나오다 등)과 원인·결과가 맞는지 본다.
7. 말끝 반복: 같은 말끝은 대본 전체에서 두 번까지, 두 문장 연속으로는 쓰지 않는다. 장면이 바뀌어도 이어서 센다.
   "~거지", "~봤지"처럼 "~지"로 끝나는 말은 같은 말끝으로 센다("~죠"도 같다).
8. 문장부호: 자막을 읽는 사람은 "?"에서 끝 음을 올리고 "."에서 내린다. 되묻는 강조 "?"는 마지막 질문을 빼고 2곳까지 그대로 둔다.
   느낌표 "!"는 대본 전체에서 최대 1번, 이야기 공개 같은 한 곳에만 둔다. 2개 이상이면 한 곳만 남기고 나머지는 "."로 고친다.
   "?"와 "!"가 하나도 없으면 발견, 공개, 결과처럼 이야기가 크게 바뀌는 곳에 "?"를 넣는다. "?!", "!!", "..."는 쓰지 않는다.
9. 뜬금없는 말: 앞 장면과 이어지지 않는 말은 이야기 안에서 자연스럽게 바꾼다.
10. 마지막 장면 마무리: 댓글·링크·구독·영상 속 대상 위치 안내(댓글로 알려 달라는 말 포함)가 있으면 빼고, 써 본 결과나 반응 뒤에 듣는 사람의 경험·의견을 묻는 공감 질문(반말 한 문장)으로 끝나게 고친다. 이미 그런 질문이면 그대로 둔다.
11. 첫 장면 이야기 훅: 음슴체("~음", "~함", "~임", "~됨")로 끝나면 "~썰", "~이유", "~것", "~싹"처럼 고친다. 두 줄까지 쓸 수 있고 영상 속 대상 이름은 공개 장면까지 아낀다.

## 검수할 초안(JSON)
아래 초안의 caption을 검수하고, 장면과 보호 필드는 그대로 둔 CodexScript 전체를 출력한다.
\`\`\`json
{{script}}
\`\`\``;

export function buildScriptReviewPrompt(options: {
  reviewPrompt: string;
  draft: unknown;
  userPrompt?: string;
  voice: { tone: string; persona: string };
}): string {
  const sections = [
    ["말투", options.voice.tone], ["성격", options.voice.persona],
  ].flatMap(([label, value]) => value.trim() ? [`${label}:\n${value.trim()}`] : []);
  return [
    options.reviewPrompt,
    ...(options.userPrompt?.trim() ? [`## 사용자 요청\n${options.userPrompt.trim()}`] : []),
    ...(sections.length ? [`## 대본 생성 설정\n${sections.join("\n\n")}`] : []),
    `## 검수할 초안(JSON)\n\n\`\`\`json\n${JSON.stringify(CodexScript.parse(options.draft), null, 2)}\n\`\`\``,
  ].join("\n\n");
}

const PROTECTED_FIELDS = ["inputIndex", "startSec", "endSec", "reaction", "memeBefore", "memeAfter", "sfxCategory"] as const;

export type ScriptReviewResult = { script: CodexScriptType; warning: string | null };

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

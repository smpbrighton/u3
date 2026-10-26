import type { Input, CodexScript } from "../../core/schema";
import { CodexScript as CodexScriptSchema } from "../../core/schema";
import { inputDisplayName } from "../../core/input";

export function formatScriptInputGuide(
  inputs: readonly Input[],
  frameTimes: readonly string[] | readonly (readonly string[])[],
  emotions: readonly string[] = [],
): string {
  const timesByInput = frameTimes.length > 0 && typeof frameTimes[0] === "string"
    ? [frameTimes as readonly string[]]
    : frameTimes as readonly (readonly string[])[];

  return [
    "입력 항목 번호와 각 이미지의 프레임 시각은 서로 다른 값입니다.",
    "inputIndex에는 아래 '입력 항목 N'의 번호만 씁니다. 프레임 번호나 프레임 시각을 inputIndex에 쓰지 마세요.",
    "이미지는 입력 항목 순서로 첨부합니다. 각 영상의 프레임은 아래 시각 목록 순서와 첨부 순서가 같습니다.",
    `reaction에는 아래 짤 감정 값만 쓰고, 맞는 값이 없으면 null을 씁니다: ${emotions.join(", ") || "null만 허용"}`,
    "reaction이 null이 아닌 장면에는 memeBefore 또는 memeAfter 중 정확히 하나만 true로 출력합니다. 반응을 먼저 보여주면 memeBefore를, 상황 뒤에 반응을 보여주면 memeAfter를 true로 합니다.",
    "reaction이 null인 장면은 memeBefore와 memeAfter를 모두 false로 출력합니다.",
    "각 영상 입력 항목마다 reaction이 null이 아닌 장면을 하나 이상 만듭니다. 장면에 쓸 반응이 없으면 reaction은 null로 둡니다.",
    ...inputs.map((input, index) => {
      const item = `입력 항목 ${index + 1}: ${input.kind === "video" ? "영상" : "사진"}, 파일 ${JSON.stringify(inputDisplayName(input))}`;
      const times = timesByInput[index] ?? [];
      if (input.kind === "photo") return `${item}; 첨부 이미지 1장`;
      return `${item}, 원본 길이 ${input.durationSec ?? "확인 불가"}초; 프레임 시각: ${times.join(", ")}`;
    }),
    "영상 장면은 원본 기준 startSec와 endSec를 모두 초 단위로 출력합니다.",
  ].join("\n");
}

export function validateScriptForInputs(
  value: unknown,
  inputs: readonly Input[],
  emotions: readonly string[] = [],
): CodexScript {
  const script = CodexScriptSchema.parse(value);

  for (const [index, scene] of script.scenes.entries()) {
    if (scene.inputIndex > inputs.length) {
      throw new RangeError(`대본 장면 ${index + 1}의 입력 항목 번호가 입력 수를 넘습니다`);
    }
  }

  const scenes = script.scenes.map((scene, index) => {
    const input = inputs[scene.inputIndex - 1]!;
    if (input.kind === "video") {
      if (scene.startSec === null || scene.endSec === null) {
        throw new RangeError(`대본 장면 ${index + 1}에 영상 구간이 없습니다`);
      }
      if (input.durationSec === undefined) {
        throw new RangeError(`입력 항목 ${scene.inputIndex}의 영상 원본 길이를 확인할 수 없습니다`);
      }
      if (scene.endSec > input.durationSec) {
        throw new RangeError(`대본 장면 ${index + 1}의 영상 구간이 원본 길이를 넘습니다`);
      }
    }

    return {
      ...scene,
      reaction: scene.reaction !== null && emotions.includes(scene.reaction) ? scene.reaction : null,
    };
  });
  return { scenes };
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Input } from "../../src/core/schema";
import { formatScriptInputGuide, validateScriptForInputs } from "../../src/engine/pipeline/script-validation";

const badScript = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/bad-script.json"), "utf8"));

describe("Codex 대본 입력 검증", () => {
  it("잘못된 codex 결과의 입력 번호와 영상 구간을 거부한다", () => {
    const inputs: Input[] = [{ id: "only-input", kind: "video", file: "input/only-input.mov", durationSec: 19 }];

    expect(() => validateScriptForInputs(badScript, inputs)).toThrow(/입력 항목 번호/u);
  });

  it("입력 번호가 유효해도 영상 구간 누락과 원본 길이 초과를 거부한다", () => {
    const inputs: Input[] = [{ id: "only-input", kind: "video", file: "input/only-input.mov", durationSec: 19 }];
    const missingRange = { scenes: [{ ...badScript.scenes[0], inputIndex: 1 }] };
    const outsideRange = { scenes: [{ ...badScript.scenes[0], inputIndex: 1, startSec: 18, endSec: 20 }] };

    expect(() => validateScriptForInputs(missingRange, inputs)).toThrow(/영상 구간/u);
    expect(() => validateScriptForInputs(outsideRange, inputs)).toThrow(/원본 길이/u);
  });

  it("짤 감정 목록에 없는 문장은 reaction을 null로 바꾼다", () => {
    const inputs: Input[] = [{ id: "only-input", kind: "video", file: "input/only-input.mov", durationSec: 19 }];
    const script = { scenes: [{ ...badScript.scenes[0], inputIndex: 1, startSec: 0, endSec: 19 }] };

    expect(validateScriptForInputs(script, inputs, ["당황", "웃음"]).scenes[0]?.reaction).toBeNull();
  });

  it("AI 프롬프트에서 입력 항목 번호와 프레임 시각을 구분한다", () => {
    const inputs: Input[] = [{ id: "only-input", kind: "video", file: "input/only-input.mov", displayName: "원본.mov", durationSec: 19 }];

    expect(formatScriptInputGuide(inputs, ["0.5초", "18.5초"])).toContain("입력 항목 1");
    expect(formatScriptInputGuide(inputs, ["0.5초", "18.5초"])).toContain("프레임 시각: 0.5초, 18.5초");
  });

  it("AI 프롬프트는 각 영상 입력에서 짤 반응을 하나 이상 정하도록 요구한다", () => {
    const inputs: Input[] = [
      { id: "video-a", kind: "video", file: "a.mp4", durationSec: 8 },
      { id: "photo-a", kind: "photo", file: "p.jpg" },
    ];

    expect(formatScriptInputGuide(inputs, [[], []], ["웃음", "당황"])).toContain("각 영상 입력 항목마다 reaction이 null이 아닌 장면을 하나 이상 만듭니다");
  });
});

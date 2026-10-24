import { z } from "zod";

/** instructions·criteria 값. 문자열이나, 질문과 그 질문이 가리키는 데이터를 나눠 담은 객체·배열 */
export type JevText = string | { [key: string]: unknown } | unknown[];

export type JevQuestion =
  | { type: "noul"; instructions: JevText; criteria?: { true?: JevText; false?: JevText } }
  | { type: "choice"; instructions: JevText; criteria: Record<string, JevText | null> }
  | { type: "score"; instructions: JevText; criteria: JevText[] };

export interface JevRequest {
  /** 판단할 내용. 여러 부분이면 이름 붙인 JSON으로 준다 */
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, JevQuestion>;
}

const Prob = z.number().min(0).max(1);

export const JevAnswer = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: Prob }),
  z.object({ type: z.literal("choice"), choice: z.string(), probabilities: z.record(z.string(), Prob), confidence: Prob }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.string()),
    probabilities: z.record(z.string(), Prob),
    confidence: Prob,
  }),
]);
export type JevAnswer = z.infer<typeof JevAnswer>;

export const JevResponse = z.object({
  /** 실제로 답한 버전 id(jev-1.13.0 등) */
  model: z.string(),
  answers: z.record(z.string(), JevAnswer),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});
export type JevResponse = z.infer<typeof JevResponse>;

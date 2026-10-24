import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CodexScript } from "../../src/core/schema";
import { compileCodexSchema } from "../../src/engine/pipeline/codex-schema";

describe("Codex strict schema boundary", () => {
  it("represents optional properties as nullable fields and restores omitted values", () => {
    const shape = z.object({
      required: z.string(),
      optional: z.string().optional(),
      nested: z.object({ count: z.number(), optionalFlag: z.boolean().optional() }),
    });
    const original = z.toJSONSchema(shape) as Record<string, unknown>;
    const before = structuredClone(original);
    const compiled = compileCodexSchema(original);
    const properties = compiled.schema.properties as Record<string, Record<string, unknown>>;

    expect(compiled.schema.required).toEqual(["required", "optional", "nested"]);
    expect(properties.optional!.anyOf).toEqual([expect.any(Object), { type: "null" }]);
    expect(compiled.schema.additionalProperties).toBe(false);
    expect(compiled.restore({ required: "ok", optional: null, nested: { count: 0, optionalFlag: null } }))
      .toEqual({ required: "ok", nested: { count: 0 } });
    expect(original).toEqual(before);
  });

  it("preserves null, false, zero, and empty strings in required U3 fields", () => {
    const schema = z.toJSONSchema(CodexScript) as Record<string, unknown>;
    const compiled = compileCodexSchema(schema);
    const value = {
      scenes: [{
        caption: "",
        inputIndex: 1,
        startSec: null,
        endSec: null,
        reaction: null,
        memeBefore: false,
        memeAfter: false,
        sfxCategory: null,
      }],
    };
    expect(compiled.restore(value)).toEqual(value);
    expect(CodexScript.safeParse(value).success).toBe(false);
  });

  it("rejects unknown fields and invalid scene values after schema restoration", () => {
    const schema = z.toJSONSchema(CodexScript) as Record<string, unknown>;
    const compiled = compileCodexSchema(schema);
    const restored = compiled.restore({
      scenes: [{
        caption: "장면",
        inputIndex: 0,
        startSec: 0,
        endSec: 1,
        reaction: null,
        memeBefore: false,
        memeAfter: false,
        sfxCategory: null,
        extra: "drop",
      }],
    });
    expect(CodexScript.safeParse(restored).success).toBe(false);
  });
});

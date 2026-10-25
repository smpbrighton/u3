import type { Input } from "./schema";

export function inputDisplayName(input: Input): string {
  return input.displayName ?? input.file.split(/[\\/]/).at(-1) ?? input.file;
}

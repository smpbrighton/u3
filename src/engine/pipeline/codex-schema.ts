import { CodexScript } from "../../core/schema";
export const codexOutputSchema = {
  type: "object", additionalProperties: false, required: ["scenes"], properties: { scenes: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["caption","inputIndex","startSec","endSec","reaction","memeBefore","memeAfter","sfxCategory"], properties: { caption:{type:"string"},inputIndex:{type:"integer",minimum:1,maximum:20},startSec:{anyOf:[{type:"number",minimum:0},{type:"null"}]},endSec:{anyOf:[{type:"number",exclusiveMinimum:0},{type:"null"}]},reaction:{type:["string","null"]},memeBefore:{type:"boolean"},memeAfter:{type:"boolean"},sfxCategory:{type:["string","null"],enum:["shock","fail","laugh","applause","alarm","impact","bruh","notify","pop","reveal",null]} } } } }
} as const;
export const validateCodexScript = (value: unknown) => CodexScript.parse(value);

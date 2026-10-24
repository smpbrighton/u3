import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os"; import path from "node:path";
import { codexOutputSchema, validateCodexScript } from "./codex-schema";
export type CodexRun=(args:string[], prompt:string, signal?:AbortSignal)=>Promise<unknown>;
export type TranscribeInput = (input:{file:string;inputId:string;signal?:AbortSignal})=>Promise<string>;
export function createCodexRunner(bin: string, runner?: CodexRun): CodexRun {
  return runner ?? ((args,prompt,signal)=>new Promise((resolve,reject)=>{const child=spawn(bin,args,{stdio:["pipe","pipe","pipe"]});let out="",err=""; child.stdout.setEncoding("utf8").on("data",x=>out+=x); child.stderr.setEncoding("utf8").on("data",x=>err+=x); signal?.addEventListener("abort",()=>child.kill("SIGTERM"),{once:true}); child.on("error",reject); child.on("close",code=>code===0?resolve(out):reject(new Error(err||`codex 종료 코드 ${code}`))); child.stdin.end(prompt);}));
}
export async function recommendScript(opts:{bin:string;prompt:string;images?:string[];signal?:AbortSignal;run?:CodexRun;transcribe?:TranscribeInput;transcriptInputs?:{file:string;inputId:string}[]}) {
  const dir=await mkdtemp(path.join(os.tmpdir(),"u3-codex-")); const schema=path.join(dir,"schema.json");
  try { await writeFile(schema,JSON.stringify(codexOutputSchema)); const transcripts=opts.transcribe&&opts.transcriptInputs?await Promise.all(opts.transcriptInputs.map(async input=>({inputId:input.inputId,text:await opts.transcribe!({...input,signal:opts.signal})}))):[];const prompt=transcripts.length?`${opts.prompt}\n\n영상별 받아 적은 말소리:\n${transcripts.map(t=>`- ${t.inputId}: ${t.text}`).join("\n")}`:opts.prompt;const args=["exec","-m","gpt-6-luna","--output-schema",schema,...(opts.images??[]).flatMap(x=>["--image",x]),"-"]; const raw=await createCodexRunner(opts.bin,opts.run)(args,prompt,opts.signal); const output=typeof raw==="string"?JSON.parse(raw):raw; return validateCodexScript(output); }
  finally { await rm(dir,{recursive:true,force:true}); }
}

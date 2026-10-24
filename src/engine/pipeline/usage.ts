import { appendFile,mkdir,readFile } from "node:fs/promises";import path from "node:path";
export type UsageProvider="codex"|"jev";
export async function recordUsage(root:string,provider:UsageProvider,amount:number){const file=path.join(root,"usage.jsonl");await mkdir(root,{recursive:true});await appendFile(file,JSON.stringify({at:new Date().toISOString(),provider,amount})+"\n");}
export async function readUsage(root:string){try{return (await readFile(path.join(root,"usage.jsonl"),"utf8")).trim().split("\n").filter(Boolean).map(x=>JSON.parse(x)).filter(x=>x.provider==="codex"||x.provider==="jev");}catch{return [];}}

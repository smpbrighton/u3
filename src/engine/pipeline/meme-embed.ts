import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { memeDoc, topBySimilarity } from "../../core/meme-rank";
import type { LibraryEntry } from "./library";
import { listMemes } from "./library";

export type MemeEmbedderStatus = "idle" | "loading" | "ready" | "error";
export interface MemeEmbedder { readonly model: string; status(): MemeEmbedderStatus; embed(texts: readonly string[]): Promise<Float32Array[]> }
const MODEL = "Xenova/bge-m3", BATCH = 16;
export function bgeM3Embedder(opts: { cacheDir: string }): MemeEmbedder {
  let state: MemeEmbedderStatus = "idle";
  let loading: Promise<(texts: string[]) => Promise<{ data: Float32Array }>> | null = null;
  const load = () => loading ??= (async () => {
    state = "loading";
    try {
      const { pipeline, env } = await import("@huggingface/transformers"); env.cacheDir = opts.cacheDir;
      const extractor = await (pipeline as unknown as (task: string, model: string, options: object) => Promise<(texts: string[], options: object) => Promise<{ data: Float32Array }>>)("feature-extraction", MODEL, { dtype: "fp32", device: "cpu" });
      state = "ready"; return (texts: string[]) => extractor(texts, { pooling: "cls", normalize: true });
    } catch (error) { state = "error"; loading = null; throw error; }
  })();
  return { model: "bge-m3", status: () => state, async embed(texts) { const run=await load(),out:Float32Array[]=[];for(let i=0;i<texts.length;i+=BATCH){const batch=texts.slice(i,i+BATCH),tensor=await run(batch),dim=tensor.data.length/batch.length;for(let j=0;j<batch.length;j++)out.push(tensor.data.slice(j*dim,(j+1)*dim));}return out; } };
}
export const memeDocHash = (doc: string) => createHash("sha256").update(doc).digest("hex").slice(0,16);
export type MemeIndexFile={model:string;dim:number;items:{id:string;docHash:string}[]};
const indexFiles=(root:string,model:string)=>{const dir=path.join(root,"cache","meme-embed");return{dir,meta:path.join(dir,`${model}.json`),vectors:path.join(dir,`${model}.f32`)};};
async function readIndex(root:string,model:string){const f=indexFiles(root,model);try{const meta=JSON.parse(await readFile(f.meta,"utf8")) as MemeIndexFile,buf=await readFile(f.vectors);if(meta.model!==model||meta.dim<=0||!Array.isArray(meta.items)||buf.byteLength!==meta.items.length*meta.dim*4)return null;const matrix=new Float32Array(buf.byteLength/4);new Uint8Array(matrix.buffer).set(buf);return{meta,matrix};}catch{return null;}}
async function atomic(file:string,data:string|Uint8Array){const temp=`${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;await writeFile(temp,data);await rename(temp,file);}
async function writeIndex(root:string,meta:MemeIndexFile,matrix:Float32Array){const f=indexFiles(root,meta.model);await mkdir(f.dir,{recursive:true});await atomic(f.vectors,new Uint8Array(matrix.buffer,matrix.byteOffset,matrix.byteLength));await atomic(f.meta,JSON.stringify(meta));}
export interface MemeIndex { sync(library?:readonly LibraryEntry[]):Promise<void>;search(text:string,k:number):Promise<{id:string;sim:number}[]>;embedder:MemeEmbedder }
export function memeIndex(root:string,embedder:MemeEmbedder,list:()=>Promise<readonly LibraryEntry[]>=()=>listMemes()):MemeIndex {
  let state:{ids:string[];hashes:string[];matrix:Float32Array;dim:number}|null=null,loaded=false,synced:readonly LibraryEntry[]|null=null,chain:Promise<unknown>=Promise.resolve();
  const serial=<T>(fn:()=>Promise<T>)=>{const p=chain.then(fn,fn);chain=p.catch(()=>undefined);return p;};
  const doSync=async(given?:readonly LibraryEntry[])=>{if(!loaded){const old=await readIndex(root,embedder.model);state=old?{ids:old.meta.items.map(x=>x.id),hashes:old.meta.items.map(x=>x.docHash),matrix:old.matrix,dim:old.meta.dim}:null;loaded=true;}const items=given??await list();if(state&&items===synced)return state;const docs=items.map(m=>memeDoc(m)),hashes=docs.map(memeDocHash),have=new Map<string,number>();state?.ids.forEach((id,i)=>have.set(`${id}\0${state!.hashes[i]}`,i));const missing=items.map((m,i)=>have.has(`${m.id}\0${hashes[i]}`)?-1:i).filter(i=>i>=0),unchanged=state&&!missing.length&&state.ids.length===items.length&&state.ids.every((id,i)=>id===items[i]!.id);if(unchanged){synced=items;return state!;}const fresh=missing.length?await embedder.embed(missing.map(i=>docs[i]!)):[],dim=fresh[0]?.length??state?.dim??0,matrix=new Float32Array(items.length*dim),freshAt=new Map(missing.map((i,n)=>[i,fresh[n]!]));items.forEach((m,i)=>{const v=freshAt.get(i);if(v)matrix.set(v,i*dim);else{const at=have.get(`${m.id}\0${hashes[i]}`)!;matrix.set(state!.matrix.subarray(at*dim,(at+1)*dim),i*dim);}});const next={ids:items.map(m=>m.id),hashes,matrix,dim};await writeIndex(root,{model:embedder.model,dim,items:next.ids.map((id,i)=>({id,docHash:hashes[i]!}))},matrix);state=next;synced=items;return next;};
  return {embedder,sync:items=>serial(()=>doSync(items)).then(()=>undefined),async search(text,k){const s=await serial(()=>doSync());if(!s.ids.length)return[];const[q]=await embedder.embed([text]);return topBySimilarity(q!,s.matrix,s.dim,k).map(r=>({id:s.ids[r.index]!,sim:r.sim}));}};
}

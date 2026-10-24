import { readdir, readFile } from "node:fs/promises"; import path from "node:path"; import { MemeMeta } from "../../core/schema";
export type LibraryEntry={id:string;file:string;title?:string;category?:string;emotion:string;description?:string;importedAt:string;tagsConfirmed:boolean;situations:string[]};
async function listDir(root:string,sub:string):Promise<LibraryEntry[]> { const dir=path.join(root,sub);const dirs=await readdir(dir,{withFileTypes:true}).catch(()=>[]);const out:LibraryEntry[]=[];for(const d of dirs){if(d.name.startsWith("."))continue;const full=path.join(dir,d.name);if(d.isDirectory()){out.push(...await listDir(root,path.join(sub,d.name)));continue;}if(!/\.(mp4|mov|webm|wav|mp3|m4a|aac)$/i.test(d.name))continue;const id=path.relative(dir,full).replace(/\.[^.]+$/g,"");const emotion=path.basename(path.dirname(full));out.push({id,file:full,title:path.basename(d.name,path.extname(d.name)),category:emotion,emotion,importedAt:"",tagsConfirmed:false,situations:[]});}return out; }
function libraryBase(root:string){return path.basename(root)==="library"?root:path.join(root,"library");}
export async function listMemes(root=process.env.U3_LIBRARY_DIR||path.join(process.cwd(),"resources")){
  const base=path.join(libraryBase(root),"memes"),folders=await readdir(base,{withFileTypes:true}).catch(()=>[]),out:LibraryEntry[]=[];
  for(const folder of folders){if(!folder.isDirectory()||folder.name.startsWith("."))continue;for(const name of await readdir(path.join(base,folder.name)).catch(()=>[])){if(!name.endsWith(".json"))continue;try{const parsed=MemeMeta.safeParse(JSON.parse(await readFile(path.join(base,folder.name,name),"utf8")));if(!parsed.success)continue;const meta=parsed.data,file=path.join(base,folder.name,`${meta.id}.mp4`);out.push({...meta,file,title:meta.description??meta.id,category:folder.name,importedAt:meta.importedAt,tagsConfirmed:meta.tagsConfirmed,situations:meta.situations});}catch{/* 잘못된 사이드카는 제외 */}}}
  return out.sort((a,b)=>a.importedAt.localeCompare(b.importedAt)||a.id.localeCompare(b.id));
}
export async function listSfx(root=process.env.U3_LIBRARY_DIR||path.join(process.cwd(),"resources")){
  const base=path.join(libraryBase(root),"sfx"),files=await listDir(path.dirname(base),"sfx"),out:LibraryEntry[]=[];
  for(const entry of files){const sidecar=`${entry.file.slice(0,entry.file.lastIndexOf("."))}.json`;try{const raw=JSON.parse(await readFile(sidecar,"utf8"));out.push({...entry,title:typeof raw.title==="string"?raw.title:entry.title,category:typeof raw.category==="string"?raw.category:entry.category});}catch{out.push(entry);}}
  return out;
}
export function searchLibrary(items:readonly LibraryEntry[],query:string){const q=query.toLocaleLowerCase();return items.filter(x=>`${x.id} ${x.title??""} ${x.category??""} ${x.emotion??""} ${x.description??""}`.toLocaleLowerCase().includes(q));}

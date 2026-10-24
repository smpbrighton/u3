import type { MemeVisual } from "../../core/meme-match";
import { matchMemes } from "../../core/meme-match";
import type { LibraryEntry } from "./library";
import type { JevClient } from "./jev";
import type { MemeIndex } from "./meme-embed";
import { memeSearchText } from "../../core/meme-rank";
export async function rankMemes(visual:MemeVisual, library:readonly LibraryEntry[], jev?:JevClient|null, limit=5, index?:MemeIndex) {
  let candidates=library;
  if(index){try{const nearest=await index.search(memeSearchText(visual),40),ids=new Set(nearest.map(x=>x.id));candidates=library.filter(item=>ids.has(item.id));}catch{/* 모델 준비 전·오류 시 전체 라이브러리 규칙 점수 */}}
  const rules=matchMemes(visual,candidates,Math.max(limit,40));
  if(!jev)return {by:"rule" as const,list:rules.slice(0,limit)};
  try { const scores=await jev.judge(`${visual.reaction??""} ${visual.query}`,rules.map(m=>({id:m.meme.id,description:m.meme.description??m.meme.id})));const score=new Map(scores.map(s=>[s.id,s.score]));return {by:"jev" as const,list:[...rules].sort((a,b)=>(score.get(b.meme.id)??0)-(score.get(a.meme.id)??0)).slice(0,limit)}; } catch { return {by:"rule" as const,list:rules.slice(0,limit)}; }
}

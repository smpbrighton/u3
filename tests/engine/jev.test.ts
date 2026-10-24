import { describe,expect,it } from "vitest";
import { rankMemes } from "../../src/engine/pipeline/meme-rank";import { fakeJevClient } from "../../src/engine/pipeline/jev";
const lib=[{id:"laugh",file:"laugh.mp4",emotion:"laugh",importedAt:"2024",tagsConfirmed:true,situations:["funny"]},{id:"sad",file:"sad.mp4",emotion:"sad",importedAt:"2024",tagsConfirmed:true,situations:["sad"]}];
describe("Jev meme ranking",()=>{it("uses rule scores when fake Jev fails",async()=>{const jev=fakeJevClient();jev.error=new Error("offline");const result=await rankMemes({query:"funny scene",reaction:"laugh"},lib,jev);expect(result.by).toBe("rule");expect(result.list[0]?.meme.id).toBe("laugh");expect(jev.calls).toHaveLength(1);});});

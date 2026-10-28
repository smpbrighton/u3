import { expect, it } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDpapiKeyStore } from "../../src/engine/jev-key-win";
it("helper에 키를 stdin으로만 보내고 저장·교체·삭제를 직렬화한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-dpapi-"));
  try {
    const helper = path.join(root, "helper"), file = path.join(root, "cipher");
    await writeFile(helper, `#!${process.execPath}\nconst fs = require('node:fs'); const [op,file] = process.argv.slice(2); fs.writeFileSync(file+'.args', JSON.stringify(process.argv.slice(2))); if(op==='read') { if(!fs.existsSync(file)) process.exit(44); process.stdout.write(fs.readFileSync(file)); } else if(op==='delete') fs.rmSync(file,{force:true}); else { let value=''; process.stdin.on('data',c=>value+=c); process.stdin.on('end',()=>fs.writeFileSync(file,value)); }`);
    await chmod(helper, 0o755);
    const keys = createDpapiKeyStore({ helperPath: helper, filePath: file });
    expect(await keys.readJevKey()).toBeNull();
    await keys.saveJevKey("secret-한글");
    expect(await readFile(file + ".args", "utf8")).toBe(JSON.stringify(["write", file]));
    expect(await keys.readJevKey()).toBe("secret-한글");
    await keys.saveJevKey("replacement");
    expect(await createDpapiKeyStore({ helperPath: helper, filePath: file }).readJevKey()).toBe("replacement");
    await keys.deleteJevKey(); expect(await keys.readJevKey()).toBeNull();
    const failed = createDpapiKeyStore({ helperPath: "missing-private-key", filePath: file });
    await expect(failed.saveJevKey("secret")).rejects.toThrow("보안 저장소");
    expect(await failed.readJevKey()).toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});

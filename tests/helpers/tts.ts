import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function fakeTts(root: string, mode: "ok" | "hang" | "fail" | "incomplete" = "ok"): Promise<string> {
  const binary = path.join(root, `fake-tts-${mode}`);
  await mkdir(root, { recursive: true });
  await writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
let input = '';
process.stdin.setEncoding('utf8').on('data', chunk => input += chunk).on('end', () => {
  const request = JSON.parse(input);
  fs.writeFileSync(${JSON.stringify(path.join(root, "request.json"))}, JSON.stringify({ ...request, args: process.argv.slice(2), pid: process.pid }));
  fs.mkdirSync(request.outDir, { recursive: true });
  const send = event => process.stdout.write(JSON.stringify(event) + '\\n');
  send({ event: 'loaded' });
  for (const [index, item] of request.items.entries()) {
    const wav = Buffer.alloc(44 + 48000);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(48000, 40);
    fs.writeFileSync(path.join(request.outDir, item.id + '.wav'), wav);
    send({ event: 'itemDone', id: item.id, completed: index + 1, total: request.items.length, durationSec: 1 });
    if (${JSON.stringify(mode)} === 'hang') { setInterval(() => {}, 100); return; }
    if (${JSON.stringify(mode)} === 'fail') { process.stderr.write('fake failure'); process.exitCode = 2; return; }
  }
  if (${JSON.stringify(mode)} !== 'incomplete') send({ event: 'done', completed: request.items.length, total: request.items.length });
});
`, { mode: 0o755 });
  return binary;
}

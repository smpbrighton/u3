import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import type { Store } from "../store";
const execFileAsync=promisify(execFile);
export async function findCodexPath(store?: Store): Promise<string|null> {
  const configured=await store?.settings().then(s=>typeof s.codexPath==="string"?s.codexPath:null).catch(()=>null);
  if(configured) return configured;
  const shell=process.env.SHELL||"/bin/zsh";
  try { const {stdout}=await execFileAsync(shell,["-lc","command -v codex"],{timeout:10000}); return stdout.trim().split("\n").at(-1)||null; } catch { return null; }
}
export async function codexLoginStatus(bin: string) {
  try { const {stdout,stderr}=await execFileAsync(bin,["login","status"],{timeout:15000}); return {installed:true,loggedIn:/^Logged in using ChatGPT\b/im.test(`${stdout}\n${stderr}`)}; }
  catch(e) { return {installed:true,loggedIn:false,error:e instanceof Error?e.message:"Codex 로그인 상태를 확인하지 못했습니다"}; }
}

import path from "node:path";

export const platforms = {
  "darwin-arm64": { nodeArchive: "node-v24.13.0-darwin-arm64.tar.gz", nodeBinary: "bin/node", compositor: "@remotion/compositor-darwin-arm64", onnx: "darwin/arm64", extension: "" },
  "win32-x64": { nodeArchive: "node-v24.13.0-win-x64.zip", nodeBinary: "node.exe", compositor: "@remotion/compositor-win32-x64-msvc", onnx: "win32/x64", extension: ".exe" },
} as const;
export function buildPlatform(platform: string, arch: string) {
  const descriptor = platforms[`${platform}-${arch}` as keyof typeof platforms];
  if (!descriptor) throw new Error(`지원하지 않는 빌드 플랫폼입니다: ${platform}-${arch}`);
  return descriptor;
}
export function npmCliCandidates(node: string, paths = path): string[] {
  const bin = paths.dirname(node);
  return [paths.join(bin, "node_modules/npm/bin/npm-cli.js"), paths.resolve(bin, "../lib/node_modules/npm/bin/npm-cli.js")];
}

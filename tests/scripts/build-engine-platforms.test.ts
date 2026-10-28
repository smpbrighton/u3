import { expect, it } from "vitest";
import path from "node:path";
import { buildPlatform, npmCliCandidates } from "../../scripts/build-platforms";
it("실제 배포 이름과 native 디렉터리를 선택한다", () => {
  expect(buildPlatform("win32", "x64")).toMatchObject({ nodeArchive: "node-v24.13.0-win-x64.zip", nodeBinary: "node.exe", compositor: "@remotion/compositor-win32-x64-msvc", onnx: "win32/x64", extension: ".exe" });
  expect(buildPlatform("darwin", "arm64")).toMatchObject({ nodeArchive: "node-v24.13.0-darwin-arm64.tar.gz", nodeBinary: "bin/node", compositor: "@remotion/compositor-darwin-arm64", onnx: "darwin/arm64", extension: "" });
  expect(() => buildPlatform("linux", "x64")).toThrow();
  expect(() => buildPlatform("win32", "arm64")).toThrow();
});
it("npm.cmd 대신 Node로 실행할 npm CLI JS 후보를 만든다", () => {
  expect(npmCliCandidates("C:\\Program Files\\nodejs\\node.exe", path.win32)).toContain("C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js");
  expect(npmCliCandidates("/opt/node/bin/node", path.posix)).toContain("/opt/node/lib/node_modules/npm/bin/npm-cli.js");
});

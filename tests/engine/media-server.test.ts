import { expect, it } from "vitest";
import { encodeRelPath, mediaUrl, resolveUnder } from "../../src/engine/pipeline/media-server";
it("두 경로 구분자를 URL 세그먼트로 바꾼다", () => {
  for (const file of ["한 글/a.png", "한 글\\a.png"]) {
    expect(encodeRelPath(file)).toBe("%ED%95%9C%20%EA%B8%80/a.png");
    expect(mediaUrl("p", file)).toBe("/api/media/projects/p/%ED%95%9C%20%EA%B8%80/a.png");
  }
});
it("Windows 드라이브·UNC·부모 경로를 거절한다", () => {
  for (const rel of ["../x", "a/../x", "..%5cx", "C:%5cx", "D:/x", "//server/share/x", "%5c%5cserver%5cshare", "/x", "a.txt:stream"]) {
    expect(resolveUnder("C:\\한 글\\projects", rel), rel).toBeNull();
  }
  expect(resolveUnder("C:\\한 글\\projects", "foo%5cbar.png")).toBe("C:\\한 글\\projects\\foo\\bar.png");
});

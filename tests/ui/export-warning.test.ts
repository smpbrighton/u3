import { describe, expect, it } from "vitest";
import { exportOverwriteWarning } from "../../src/ui/export-warning";

describe("exportOverwriteWarning", () => {
  it("warns when the selected output file already exists", () => {
    expect(exportOverwriteWarning("/tmp/video.mp4", true, false)).toBe("같은 이름의 파일이 있어요. 내보내면 덮어써요.");
  });

  it("does not warn when the file is missing or its path could not be checked", () => {
    expect(exportOverwriteWarning("/tmp/video.mp4", false, false)).toBeNull();
    expect(exportOverwriteWarning("/tmp/video.mp4", null, false)).toBeNull();
  });

  it("does not warn after export completes", () => {
    expect(exportOverwriteWarning("/tmp/video.mp4", true, true)).toBeNull();
  });
});

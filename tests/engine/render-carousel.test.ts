import { existsSync } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Carousel, defaultTexts, newSlide } from "../../src/core/carousel";
import { renderCarouselSlide } from "../../src/engine/pipeline/render";
import { startMediaServer } from "../../src/engine/pipeline/media-server";
import { ffmpeg, solidPng } from "../helpers/media";

const platform = process.platform === "darwin" ? `mac-${process.arch === "arm64" ? "arm64" : "x64"}` : process.platform === "win32" ? "win64" : process.arch === "arm64" ? "linux-arm64" : "linux64";
const cachedChrome = path.resolve("node_modules/.remotion/chrome-headless-shell", platform, `chrome-headless-shell-${platform}`, process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
const chrome = [process.env.U3_CHROME_EXECUTABLE, cachedChrome, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"].find(file => file && existsSync(file));
describe("carousel PNG coordinates", () => {
  it.skipIf(!chrome)("renders red and blue text bars at their object coordinates (Chrome 없으면 미검증)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-render-carousel-"));
    const media = await startMediaServer({ roots: { carousels: root }, token: "carousel-pixel-test" });
    try {
      const input = path.join(root, "background.png"), output = path.join(root, "slide.png");
      await writeFile(input, solidPng(1080, 1350, [0, 0, 0]));
      const slide = { ...newSlide({ kind: "topic" }, "4:5"), brightness: 1, shade: 0,
        background: { kind: "generated" as const, image: { file: "background.png" } },
        texts: defaultTexts("4:5").map((text, i) => ({ ...text, text: "좌표 검증", x: 0.1, y: i ? 0.7 : 0.1, width: 0.4, fontSize: 40, effect: "bar" as const, barColor: i ? "#0000ff" : "#ff0000" })),
      };
      const stamp = new Date().toISOString();
      const carousel = Carousel.parse({ id: "pixel", name: "픽셀", topic: "검증", aspect: "4:5", slides: [slide], createdAt: stamp, savedAt: stamp });
      await renderCarouselSlide({ carousel, slide, imageUrl: media.url("carousels", "background.png"), outputPath: output, browserExecutable: chrome });
      expect((await stat(output)).size).toBeGreaterThan(0);
      const pixel = (x: number, y: number) => [...ffmpeg(["-i", output, "-vf", `format=rgb24,crop=1:1:${x}:${y}`, "-frames:v", "1", "-c:v", "rawvideo", "-f", "image2pipe", "pipe:1"])];
      expect(pixel(112, 139)).toEqual([255, 0, 0]);
      expect(pixel(112, 949)).toEqual([0, 0, 255]);
      expect(pixel(112, 675)).toEqual([0, 0, 0]);
      expect(pixel(100, 139)).toEqual([0, 0, 0]);
    } finally {
      await media.close(); await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});

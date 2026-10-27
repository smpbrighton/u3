import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: async () => ({ port: 4321, token: "engine-token" }),
}));

const { carouselFileUrl } = await import("../../src/ui/api");

describe("carousel image url", () => {
  it("requests carousel images through the engine media route with the media token", async () => {
    const url = await carouselFileUrl("carousel 1", "images/slide-1.png");
    expect(url).toMatch(/\/api\/media\/carousels\/carousel%201\/images\/slide-1\.png\?token=engine-token$/);
  });
});
